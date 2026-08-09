/**
 * src/services/blockchainService.js
 *
 * Blockchain service for LedgerLock.
 * Wraps interactions with the deployed CertificateRegistry contract.
 *
 * Design decisions:
 *  - Factory function (createBlockchainService) validates env at call-time,
 *    not at module load, so tests can set process.env before calling.
 *  - Accepts optional `_overrides` for dependency injection: pass mock
 *    provider/wallet/contract objects in tests to avoid real network calls.
 *  - Private key is NEVER included in logs, thrown messages, or responses.
 *    sanitiseError() strips it from any error message before re-throwing.
 *  - All blockchain errors are wrapped in BlockchainError so the error-handling
 *    architecture can map them to HTTP responses in a future PR.
 *
 * Contract interface notes (based on actual CertificateRegistry.sol):
 *  - issueCertificate(ipfsCid)    – caller must be a registered institution
 *  - verifyCertificate(certId)    – view; returns (valid, issuer, ipfsCid)
 *  - revokeCertificate(certId)    – caller must be the original issuer
 *  - certificateCount()           – public uint256 counter
 *  - institutions(address)        – public mapping for institution lookup
 *
 * NOTE: The task spec mentioned getCertificates(student) and per-index lookup,
 * but those functions do NOT exist in the current CertificateRegistry.sol.
 * This service exposes what the contract actually supports.
 * A future contract iteration can add enumerable per-institution certificate
 * lists; the service can be extended at that point.
 */

"use strict";

const { ethers } = require("ethers");
const config     = require("../config");

// ─── Typed error ──────────────────────────────────────────────────────────────

class BlockchainError extends Error {
  /**
   * @param {string} message
   * @param {object} [opts]
   * @param {Error}  [opts.cause]    Original error.
   * @param {string} [opts.code]     Provider/contract error code if available.
   */
  constructor(message, { cause, code } = {}) {
    super(message);
    this.name  = "BlockchainError";
    this.cause = cause  ?? null;
    this.code  = code   ?? null;
  }
}

// ─── Minimal ABI ─────────────────────────────────────────────────────────────
// Human-readable ABI for only the functions/events this service uses.
// Keeping it minimal avoids tight coupling to the full contract definition.

const CERTIFICATE_REGISTRY_ABI = [
  // State-changing
  "function issueCertificate(string calldata ipfsCid) external returns (bytes32 certId)",
  "function revokeCertificate(bytes32 certId) external",

  // View
  "function verifyCertificate(bytes32 certId) external view returns (bool valid, address issuer, string memory ipfsCid)",
  "function certificateCount() external view returns (uint256)",
  "function admin() external view returns (address)",
  "function institutions(address) external view returns (bool registered, string memory name)",

  // Events (needed to parse certId from issueCertificate receipt)
  "event CertificateIssued(bytes32 indexed certId, address indexed issuer, string ipfsCid)",
  "event CertificateRevoked(bytes32 indexed certId, address indexed revokedBy)",
  "event InstitutionRegistered(address indexed institution, string name)",
];

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a blockchain service instance connected to CertificateRegistry.
 *
 * @param {object} [_overrides={}]             Dependency injection for testing.
 * @param {object} [_overrides.provider]       ethers Provider replacement.
 * @param {object} [_overrides.wallet]         ethers Wallet replacement.
 * @param {object} [_overrides.contract]       ethers Contract replacement.
 *
 * @returns {{
 *   getWalletAddress:        () => string,
 *   issueCertificate:        (ipfsCid: string) => Promise<{certId:string,txHash:string}>,
 *   verifyCertificate:       (certId: string) => Promise<{valid:boolean,issuer:string,ipfsCid:string}>,
 *   revokeCertificate:       (certId: string) => Promise<{txHash:string}>,
 *   getCertificateCount:     () => Promise<bigint>,
 *   isRegisteredInstitution: (address: string) => Promise<{registered:boolean,name:string}>,
 * }}
 *
 * @throws {BlockchainError} if required env vars are missing (unless overridden).
 */
function createBlockchainService(_overrides = {}) {
  // Read env via config getters (evaluated NOW so tests can set env first).
  const rpcUrl          = config.rpcUrl;
  const contractAddress = config.contractAddress;
  // Read for validation and sanitisation — NEVER expose in logs/responses.
  const privateKey      = config.blockchainPrivateKey;

  // ── Validate config ──────────────────────────────────────────────────────
  // Each guard is skipped when the corresponding dependency is injected,
  // allowing tests to exercise the service without real credentials.

  if (!_overrides.provider && !rpcUrl) {
    throw new BlockchainError(
      "RPC_URL environment variable is not set. " +
      "Copy .env.example to .env and configure your RPC endpoint.",
      { code: "MISSING_CONFIG" },
    );
  }

  if (!_overrides.contract && !contractAddress) {
    throw new BlockchainError(
      "CONTRACT_ADDRESS environment variable is not set. " +
      "Deploy CertificateRegistry first and set the address in .env.",
      { code: "MISSING_CONFIG" },
    );
  }

  if (!_overrides.wallet && !privateKey) {
    throw new BlockchainError(
      "BLOCKCHAIN_PRIVATE_KEY environment variable is not set. " +
      "Provide the backend signing wallet private key in .env.",
      { code: "MISSING_CONFIG" },
    );
  }

  // ── Build ethers instances (or use injected ones) ────────────────────────
  const provider = _overrides.provider
    ?? new ethers.JsonRpcProvider(rpcUrl);

  const wallet   = _overrides.wallet
    ?? new ethers.Wallet(privateKey, provider);

  const contract = _overrides.contract
    ?? new ethers.Contract(contractAddress, CERTIFICATE_REGISTRY_ABI, wallet);

  // ── Error sanitiser ──────────────────────────────────────────────────────
  /**
   * Wrap a raw error in BlockchainError, scrubbing the private key from
   * the message so it can never leak into logs or HTTP responses.
   *
   * @param {Error}  err
   * @param {string} operation  Human-readable name of the failing operation.
   * @returns {BlockchainError}
   */
  function sanitiseError(err, operation) {
    const rawMessage = err?.message || String(err);

    // Strip private key from message even if it somehow appears.
    const safeMessage = privateKey
      ? rawMessage.split(privateKey).join("[REDACTED]")
      : rawMessage;

    return new BlockchainError(
      `Blockchain operation '${operation}' failed: ${safeMessage}`,
      { cause: err, code: err?.code ?? null },
    );
  }

  // ── Public service API ───────────────────────────────────────────────────

  return {
    /**
     * Return the backend wallet address.
     * Use this to check/register the wallet as a verified institution.
     * @returns {string}  Ethereum address (checksummed).
     */
    getWalletAddress() {
      return wallet.address;
    },

    /**
     * Issue a certificate for an IPFS CID.
     *
     * PREREQUISITE: the backend wallet must already be registered as an
     * institution via CertificateRegistry.registerInstitution() (admin-only).
     * This service does NOT auto-register itself.
     *
     * @param {string} ipfsCid  IPFS content identifier.
     * @returns {Promise<{ certId: string|null, txHash: string }>}
     * @throws {BlockchainError}
     */
    async issueCertificate(ipfsCid) {
      try {
        const tx      = await contract.issueCertificate(ipfsCid);
        const receipt = await tx.wait();

        // Extract certId from the CertificateIssued event in the receipt.
        const iface = contract.interface;
        if (iface) {
          for (const log of receipt.logs ?? []) {
            try {
              const parsed = iface.parseLog(log);
              if (parsed?.name === "CertificateIssued") {
                return { certId: parsed.args.certId, txHash: receipt.hash };
              }
            } catch { /* skip unrelated/unparseable logs */ }
          }
        }

        // Fallback: no event found (shouldn't happen against real contract).
        return { certId: null, txHash: receipt.hash };
      } catch (err) {
        if (err instanceof BlockchainError) throw err;
        throw sanitiseError(err, "issueCertificate");
      }
    },

    /**
     * Verify a certificate's current on-chain status.
     *
     * @param {string} certId  bytes32 certificate identifier (hex string).
     * @returns {Promise<{ valid: boolean, issuer: string, ipfsCid: string }>}
     * @throws {BlockchainError}
     */
    async verifyCertificate(certId) {
      try {
        const [valid, issuer, ipfsCid] = await contract.verifyCertificate(certId);
        return { valid, issuer, ipfsCid };
      } catch (err) {
        if (err instanceof BlockchainError) throw err;
        throw sanitiseError(err, "verifyCertificate");
      }
    },

    /**
     * Revoke a certificate. Only the original issuing institution may revoke.
     *
     * @param {string} certId  bytes32 certificate identifier (hex string).
     * @returns {Promise<{ txHash: string }>}
     * @throws {BlockchainError}
     */
    async revokeCertificate(certId) {
      try {
        const tx      = await contract.revokeCertificate(certId);
        const receipt = await tx.wait();
        return { txHash: receipt.hash };
      } catch (err) {
        if (err instanceof BlockchainError) throw err;
        throw sanitiseError(err, "revokeCertificate");
      }
    },

    /**
     * Return the total number of certificates ever issued (never decremented).
     * @returns {Promise<bigint>}
     * @throws {BlockchainError}
     */
    async getCertificateCount() {
      try {
        return await contract.certificateCount();
      } catch (err) {
        if (err instanceof BlockchainError) throw err;
        throw sanitiseError(err, "getCertificateCount");
      }
    },

    /**
     * Check whether a wallet address is a registered institution.
     * @param {string} address  Ethereum address.
     * @returns {Promise<{ registered: boolean, name: string }>}
     * @throws {BlockchainError}
     */
    async isRegisteredInstitution(address) {
      try {
        const [registered, name] = await contract.institutions(address);
        return { registered, name };
      } catch (err) {
        if (err instanceof BlockchainError) throw err;
        throw sanitiseError(err, "isRegisteredInstitution");
      }
    },
  };
}

module.exports = { createBlockchainService, BlockchainError };
