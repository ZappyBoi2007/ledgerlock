/**
 * src/services/pinataService.js
 *
 * IPFS upload service for LedgerLock.
 * Uploads certificate metadata JSON to Pinata and returns the resulting CID
 * and public gateway URL.
 *
 * This module is intentionally independent of Express, HTTP routes,
 * controllers, and the blockchain layer.
 *
 * Dependencies: Node.js built-in fetch (Node ≥ 18) + AbortController.
 * No third-party packages are required.
 */

"use strict";

const config = require("../config");

// ─── Errors ───────────────────────────────────────────────────────────────────

class PinataError extends Error {
  constructor(message, { cause, statusCode } = {}) {
    super(message);
    this.name       = "PinataError";
    this.cause      = cause;
    this.statusCode = statusCode ?? null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the multipart/form-data body required by the Pinata v3 files API.
 * The JSON metadata is uploaded as a file named "metadata.json".
 *
 * @param {object} metadata  Plain JS object to serialise.
 * @param {string} pinName   Human-readable name shown in the Pinata dashboard.
 * @returns {FormData}
 */
function buildFormData(metadata, pinName) {
  const blob = new Blob([JSON.stringify(metadata)], { type: "application/json" });
  const form = new FormData();
  form.append("file", blob, "metadata.json");
  form.append("name", pinName);
  return form;
}

/**
 * Parse and validate a successful Pinata API response body.
 *
 * Expected shape (Pinata v3):
 *   { data: { cid: string, size: number, ... } }
 *
 * @param {object} body   Parsed JSON from Pinata.
 * @returns {{ cid: string, size: number }}
 * @throws {PinataError} if the shape is unexpected.
 */
function extractPinataData(body) {
  const cid  = body?.data?.cid;
  const size = body?.data?.size;

  if (typeof cid !== "string" || cid.trim() === "") {
    throw new PinataError(
      "Malformed Pinata response: missing or empty 'data.cid'",
    );
  }

  return { cid: cid.trim(), size: typeof size === "number" ? size : 0 };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upload a certificate metadata object to Pinata (IPFS).
 *
 * @param {object} metadata            Plain JS object (certificate metadata).
 * @param {object} [options]
 * @param {string} [options.pinName]   Name shown in the Pinata dashboard.
 * @param {number} [options.timeoutMs] Request timeout in ms (default: config value).
 * @returns {Promise<{
 *   cid:       string,   // IPFS Content Identifier
 *   url:       string,   // Public gateway URL
 *   size:      number,   // Bytes uploaded
 *   timestamp: string,   // ISO-8601 upload timestamp
 * }>}
 * @throws {PinataError}
 */
async function uploadMetadata(metadata, options = {}) {
  // ── 1. Guard: JWT must be present ─────────────────────────────────────────
  const jwt = config.pinata.jwt;
  if (!jwt || jwt.trim() === "") {
    throw new PinataError(
      "PINATA_JWT environment variable is not set. " +
      "Copy .env.example to .env and fill in your Pinata JWT.",
    );
  }

  const {
    pinName   = `ledgerlock-cert-${Date.now()}`,
    timeoutMs = config.pinata.timeoutMs,
  } = options;

  // ── 2. Build request ───────────────────────────────────────────────────────
  const form       = buildFormData(metadata, pinName);
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(config.pinata.apiUrl, {
      method:  "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body:    form,
      signal:  controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new PinataError(
        `Pinata request timed out after ${timeoutMs}ms`,
        { cause: err },
      );
    }
    throw new PinataError(
      `Network error while contacting Pinata: ${err.message}`,
      { cause: err },
    );
  } finally {
    clearTimeout(timer);
  }

  // ── 3. Check HTTP status ───────────────────────────────────────────────────
  if (!response.ok) {
    let detail = "";
    try {
      const errBody = await response.json();
      detail = errBody?.error?.details ?? errBody?.message ?? "";
    } catch { /* ignore parse failure of error body */ }

    throw new PinataError(
      `Pinata returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      { statusCode: response.status },
    );
  }

  // ── 4. Parse response ─────────────────────────────────────────────────────
  let body;
  try {
    body = await response.json();
  } catch (err) {
    throw new PinataError(
      "Failed to parse Pinata response as JSON",
      { cause: err },
    );
  }

  const { cid, size } = extractPinataData(body);

  // ── 5. Build result ───────────────────────────────────────────────────────
  const gateway = config.pinata.gateway.replace(/\/$/, ""); // strip trailing slash
  return {
    cid,
    url:       `${gateway}/ipfs/${cid}`,
    size,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { uploadMetadata, PinataError };
