/**
 * tests/blockchainService.test.js
 *
 * Unit tests for src/services/blockchainService.js
 *
 * Philosophy (same as pinataService.test.js):
 *  - NO real RPC, NO real private key, NO real blockchain.
 *  - Dependency injection: mock provider/wallet/contract objects are passed
 *    directly to createBlockchainService() via the _overrides argument.
 *  - env vars are set at the top of this file (before any require()) and
 *    temporarily deleted/restored in per-test scopes using try/finally.
 *
 * IMPORTANT: Set env vars BEFORE any require() calls — config uses getters
 * that re-read process.env each time, but the test file is loaded in a fresh
 * child process by the node:test runner, so top-level assignment is safe.
 */

"use strict";

// ── Set env BEFORE any requires ───────────────────────────────────────────────
process.env.RPC_URL               = "http://localhost:8545";
process.env.CONTRACT_ADDRESS      = "0x" + "a".repeat(40);
process.env.BLOCKCHAIN_PRIVATE_KEY = "0x" + "a".repeat(64);

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { createBlockchainService, BlockchainError } =
  require("../src/services/blockchainService");

// ─── Test constants ───────────────────────────────────────────────────────────

const FAKE_WALLET_ADDR = "0x" + "1".repeat(40);
const FAKE_CERT_ID     = "0x" + "b".repeat(64);
const FAKE_TX_HASH     = "0x" + "c".repeat(64);
const FAKE_CID         = "QmBlockchainTestCID123";
const FAKE_ISSUER      = "0x" + "2".repeat(40);

// ─── Mock builders ────────────────────────────────────────────────────────────

function makeMockWallet(address = FAKE_WALLET_ADDR) {
  return { address };
}

/**
 * Builds a mock contract whose methods return realistic values.
 * Individual methods can be overridden for failure tests.
 */
function makeMockContract(overrides = {}) {
  // Default interface: can parse CertificateIssued logs
  const defaultInterface = {
    parseLog: (log) => {
      if (log.__type === "CertificateIssued") {
        return { name: "CertificateIssued", args: { certId: FAKE_CERT_ID } };
      }
      throw new Error("Unknown log topic");
    },
  };

  return {
    interface: overrides.interface ?? defaultInterface,

    issueCertificate: overrides.issueCertificate
      ?? (async (_ipfsCid) => ({
        wait: async () => ({
          hash: FAKE_TX_HASH,
          logs: [{ __type: "CertificateIssued" }],
        }),
      })),

    verifyCertificate: overrides.verifyCertificate
      ?? (async (_certId) => [true, FAKE_ISSUER, FAKE_CID]),

    revokeCertificate: overrides.revokeCertificate
      ?? (async (_certId) => ({
        wait: async () => ({ hash: FAKE_TX_HASH }),
      })),

    certificateCount: overrides.certificateCount
      ?? (async () => 5n),

    institutions: overrides.institutions
      ?? (async (_addr) => [true, "Test University"]),
  };
}

// Shorthand: build a service using mock wallet + contract (bypasses all env guards).
function makeService(contractOverrides = {}) {
  return createBlockchainService({
    provider: {},                             // skip provider creation
    wallet:   makeMockWallet(),
    contract: makeMockContract(contractOverrides),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("blockchainService", () => {

  // ── 1. Configuration guards ────────────────────────────────────────────────

  describe("missing environment variables", () => {
    it("throws BlockchainError if RPC_URL is missing and no provider override", () => {
      const saved = process.env.RPC_URL;
      delete process.env.RPC_URL;
      try {
        assert.throws(
          // No provider override → should validate RPC_URL
          () => createBlockchainService({
            wallet:   makeMockWallet(),
            contract: makeMockContract(),
          }),
          (err) => {
            assert.ok(
              err instanceof BlockchainError,
              `Expected BlockchainError, got ${err.constructor.name}`,
            );
            assert.ok(
              err.message.includes("RPC_URL"),
              `Expected message to mention RPC_URL, got: "${err.message}"`,
            );
            return true;
          },
        );
      } finally {
        process.env.RPC_URL = saved;
      }
    });

    it("throws BlockchainError if CONTRACT_ADDRESS is missing and no contract override", () => {
      const saved = process.env.CONTRACT_ADDRESS;
      delete process.env.CONTRACT_ADDRESS;
      try {
        assert.throws(
          () => createBlockchainService({
            provider: {},
            wallet:   makeMockWallet(),
            // no contract override
          }),
          (err) => {
            assert.ok(err instanceof BlockchainError);
            assert.ok(
              err.message.includes("CONTRACT_ADDRESS"),
              `Expected message to mention CONTRACT_ADDRESS, got: "${err.message}"`,
            );
            return true;
          },
        );
      } finally {
        process.env.CONTRACT_ADDRESS = saved;
      }
    });

    it("throws BlockchainError if BLOCKCHAIN_PRIVATE_KEY is missing and no wallet override", () => {
      const saved = process.env.BLOCKCHAIN_PRIVATE_KEY;
      delete process.env.BLOCKCHAIN_PRIVATE_KEY;
      try {
        assert.throws(
          () => createBlockchainService({
            provider: {},
            contract: makeMockContract(),
            // no wallet override
          }),
          (err) => {
            assert.ok(err instanceof BlockchainError);
            assert.ok(
              err.message.includes("BLOCKCHAIN_PRIVATE_KEY"),
              `Expected message to mention BLOCKCHAIN_PRIVATE_KEY, got: "${err.message}"`,
            );
            return true;
          },
        );
      } finally {
        process.env.BLOCKCHAIN_PRIVATE_KEY = saved;
      }
    });
  });

  // ── 2. Wallet / address initialisation ────────────────────────────────────

  describe("wallet initialisation", () => {
    it("getWalletAddress() returns the injected wallet address", () => {
      const service = makeService();
      assert.equal(service.getWalletAddress(), FAKE_WALLET_ADDR);
    });

    it("createBlockchainService succeeds when all overrides are provided", () => {
      assert.doesNotThrow(() => makeService());
    });
  });

  // ── 3. issueCertificate ───────────────────────────────────────────────────

  describe("issueCertificate", () => {
    it("returns certId and txHash on success", async () => {
      const service = makeService();
      const result  = await service.issueCertificate(FAKE_CID);

      assert.equal(typeof result, "object");
      assert.equal(result.certId,  FAKE_CERT_ID);
      assert.equal(result.txHash,  FAKE_TX_HASH);
    });

    it("returns certId from the CertificateIssued event in the receipt", async () => {
      const CUSTOM_CERT_ID = "0x" + "d".repeat(64);
      const service = makeService({
        interface: {
          parseLog: (log) => {
            if (log.__type === "CertificateIssued") {
              return { name: "CertificateIssued", args: { certId: CUSTOM_CERT_ID } };
            }
            throw new Error("unknown");
          },
        },
      });

      const result = await service.issueCertificate(FAKE_CID);
      assert.equal(result.certId, CUSTOM_CERT_ID);
    });

    it("falls back to certId=null if no CertificateIssued event is found", async () => {
      const service = makeService({
        interface: { parseLog: () => { throw new Error("Unknown log"); } },
        issueCertificate: async () => ({
          wait: async () => ({ hash: FAKE_TX_HASH, logs: [{ __type: "unknown" }] }),
        }),
      });

      const result = await service.issueCertificate(FAKE_CID);
      assert.equal(result.certId,  null);
      assert.equal(result.txHash,  FAKE_TX_HASH);
    });

    it("wraps contract failure in BlockchainError", async () => {
      const service = makeService({
        issueCertificate: async () => {
          throw new Error("execution reverted: institution not registered");
        },
      });

      await assert.rejects(
        () => service.issueCertificate(FAKE_CID),
        (err) => {
          assert.ok(err instanceof BlockchainError);
          return true;
        },
      );
    });
  });

  // ── 4. getCertificates (not in current contract) ──────────────────────────
  // NOTE: getCertificates(student) does NOT exist in CertificateRegistry.sol.
  // The service exposes getCertificateCount() and verifyCertificate(certId)
  // instead. A future contract iteration can add enumerable per-student lists.

  // ── 5. verifyCertificate ──────────────────────────────────────────────────

  describe("verifyCertificate", () => {
    it("returns valid, issuer, and ipfsCid on success", async () => {
      const service = makeService();
      const result  = await service.verifyCertificate(FAKE_CERT_ID);

      assert.equal(result.valid,   true);
      assert.equal(result.issuer,  FAKE_ISSUER);
      assert.equal(result.ipfsCid, FAKE_CID);
    });

    it("wraps contract failure in BlockchainError", async () => {
      const service = makeService({
        verifyCertificate: async () => { throw new Error("bad certId"); },
      });

      await assert.rejects(
        () => service.verifyCertificate(FAKE_CERT_ID),
        (err) => {
          assert.ok(err instanceof BlockchainError);
          return true;
        },
      );
    });
  });

  // ── 6. revokeCertificate ──────────────────────────────────────────────────

  describe("revokeCertificate", () => {
    it("returns txHash on success", async () => {
      const service = makeService();
      const result  = await service.revokeCertificate(FAKE_CERT_ID);

      assert.equal(result.txHash, FAKE_TX_HASH);
    });

    it("wraps contract failure in BlockchainError", async () => {
      const service = makeService({
        revokeCertificate: async () => {
          throw new Error("execution reverted: not the issuing institution");
        },
      });

      await assert.rejects(
        () => service.revokeCertificate(FAKE_CERT_ID),
        (err) => {
          assert.ok(err instanceof BlockchainError);
          return true;
        },
      );
    });
  });

  // ── 7. getCertificateCount ────────────────────────────────────────────────

  describe("getCertificateCount", () => {
    it("returns the count from the contract", async () => {
      const service = makeService();
      const count   = await service.getCertificateCount();
      assert.equal(count, 5n);
    });
  });

  // ── 8. isRegisteredInstitution ────────────────────────────────────────────

  describe("isRegisteredInstitution", () => {
    it("returns registered=true and name for a registered institution", async () => {
      const service = makeService();
      const result  = await service.isRegisteredInstitution(FAKE_WALLET_ADDR);

      assert.equal(result.registered, true);
      assert.equal(result.name, "Test University");
    });
  });

  // ── 9. Error handling ─────────────────────────────────────────────────────

  describe("error handling", () => {
    it("blockchain/provider failure becomes BlockchainError", async () => {
      const service = makeService({
        verifyCertificate: async () => {
          const err  = new Error("could not detect network");
          err.code   = "NETWORK_ERROR";
          throw err;
        },
      });

      await assert.rejects(
        () => service.verifyCertificate(FAKE_CERT_ID),
        (err) => {
          assert.ok(err instanceof BlockchainError, `Expected BlockchainError, got ${err.constructor.name}`);
          assert.ok(err.message.includes("verifyCertificate"), "Operation name missing from error");
          return true;
        },
      );
    });

    it("transaction failure becomes BlockchainError", async () => {
      const service = makeService({
        issueCertificate: async () => {
          const err  = new Error("transaction failed");
          err.code   = "CALL_EXCEPTION";
          throw err;
        },
      });

      await assert.rejects(
        () => service.issueCertificate(FAKE_CID),
        (err) => {
          assert.ok(err instanceof BlockchainError);
          assert.equal(err.code, "CALL_EXCEPTION");
          return true;
        },
      );
    });

    it("private key NEVER appears in a BlockchainError message", async () => {
      const REAL_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY; // "0xaaa..."

      // Simulate an error that accidentally contains the private key.
      const service = makeService({
        issueCertificate: async () => {
          throw new Error(`signing failed with key ${REAL_KEY}`);
        },
      });

      await assert.rejects(
        () => service.issueCertificate(FAKE_CID),
        (err) => {
          assert.ok(err instanceof BlockchainError);
          assert.ok(
            !err.message.includes(REAL_KEY),
            `Private key leaked in error message: "${err.message}"`,
          );
          // The key should be replaced with [REDACTED]
          assert.ok(
            err.message.includes("[REDACTED]"),
            `Expected [REDACTED] in message, got: "${err.message}"`,
          );
          return true;
        },
      );
    });
  });

});
