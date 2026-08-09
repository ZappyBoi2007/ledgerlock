/**
 * src/controllers/certificateController.js
 *
 * Certificate lifecycle endpoints.
 *
 * POST /api/v1/certificates
 *   1. Parse + validate the request body
 *   2. Upload certificate metadata to IPFS via Pinata
 *   3. Issue the certificate on-chain via blockchainService
 *   4. Return 201 with { cid, url, certId, txHash }
 *
 * GET /api/v1/certificates/:certId
 *   1. Extract + validate the certId URL param
 *   2. Call blockchainService.verifyCertificate(certId)
 *   3. Return 200 with { valid, issuer, ipfsCid, certId }
 *
 * Testing note:
 *   The module exports createCertificateHandlers(blockchainSvc?) which accepts
 *   an optional pre-built blockchain service for dependency injection in tests.
 *   The default export builds the handlers using createBlockchainService().
 *
 * Errors propagate to app.js → errorHandler.
 * BLOCKCHAIN_PRIVATE_KEY and PINATA_JWT are never included in any response.
 */

"use strict";

const { parseBody }               = require("../utils/parseBody");
const { validateCertificate }     = require("../middleware/validate");
const { uploadMetadata }          = require("../services/pinataService");
const { createBlockchainService } = require("../services/blockchainService");
const { sendJson }                = require("../utils/response");
const { ValidationError }         = require("../utils/errors");

// ── Helpers ───────────────────────────────────────────────────────────────────

const CERT_ID_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Extract the certId path segment from a URL like /api/v1/certificates/0x...
 * Returns null if the URL does not match.
 *
 * @param {string} url
 * @returns {string|null}
 */
function extractCertId(url) {
  const match = url.match(/^\/api\/v1\/certificates\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Validate that a certId string is a 32-byte hex value.
 * @param {string|null} certId
 * @returns {string}  The validated certId.
 * @throws {ValidationError} (422)
 */
function validateCertId(certId) {
  if (!certId || !certId.trim()) {
    throw new ValidationError("Certificate ID is required");
  }
  if (!CERT_ID_RE.test(certId.trim())) {
    throw new ValidationError(
      'Certificate ID must be a 32-byte hex string starting with "0x" (66 characters total)',
    );
  }
  return certId.trim();
}

// ── Handler factory ───────────────────────────────────────────────────────────

/**
 * Create the certificate route handlers.
 *
 * @param {ReturnType<createBlockchainService>|null} [injectedService]
 *   Pre-built blockchain service for dependency injection (tests).
 *   Pass null/undefined to use createBlockchainService() at call-time.
 *
 * @returns {{ handleNotarise: Function, handleVerify: Function }}
 */
function createCertificateHandlers(injectedService = null) {
  function getService() {
    return injectedService ?? createBlockchainService();
  }

  // ── Notarise: POST /api/v1/certificates ────────────────────────────────────
  async function handleNotarise(req, res) {
    const body = await parseBody(req);
    const cert = validateCertificate(body);

    // Step 1 — Upload to IPFS
    const ipfsResult = await uploadMetadata(cert);

    // Step 2 — Issue on-chain
    const service     = getService();
    const chainResult = await service.issueCertificate(ipfsResult.cid);

    sendJson(res, 201, {
      success: true,
      data: {
        cid:    ipfsResult.cid,
        url:    ipfsResult.url,
        certId: chainResult.certId,
        txHash: chainResult.txHash,
      },
    });
  }

  // ── Verify: GET /api/v1/certificates/:certId ───────────────────────────────
  async function handleVerify(req, res) {
    const rawId  = extractCertId(req.url);
    const certId = validateCertId(rawId);

    const service = getService();
    const result  = await service.verifyCertificate(certId);

    sendJson(res, 200, {
      success: true,
      data: {
        certId,
        valid:   result.valid,
        issuer:  result.issuer,
        ipfsCid: result.ipfsCid,
      },
    });
  }

  return { handleNotarise, handleVerify };
}

// ── Default export: handlers using real blockchain service ────────────────────
const { handleNotarise, handleVerify } = createCertificateHandlers();

module.exports = {
  handleNotarise,
  handleVerify,
  extractCertId,
  createCertificateHandlers,   // exported for test injection
};
