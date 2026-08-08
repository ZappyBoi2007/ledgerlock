/**
 * src/utils/parseBody.js
 *
 * Async JSON request-body parser for Node's raw http.IncomingMessage.
 *
 * Guards:
 *  - Content-Type must be application/json           → 415
 *  - Body may not exceed MAX_BYTES (100 KB)          → 413
 *  - Body may not be empty                           → 400
 *  - Body must be valid JSON                         → 400
 *  - Stream errors are wrapped as ParseError         → 400
 *
 * No third-party dependencies.
 */

"use strict";

const { ParseError } = require("./errors");

const MAX_BYTES = 100 * 1024; // 100 KB

/**
 * Read and parse the request body as JSON.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {object} [opts]
 * @param {number} [opts.maxBytes=102400]  Maximum allowed body size in bytes.
 * @returns {Promise<object>}  Parsed JSON value.
 * @throws {ParseError}
 */
async function parseBody(req, { maxBytes = MAX_BYTES } = {}) {
  // ── 1. Validate Content-Type ──────────────────────────────────────────────
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("application/json")) {
    throw new ParseError(
      "Content-Type must be application/json",
      415,
    );
  }

  // ── 2. Stream body with size guard ────────────────────────────────────────
  return new Promise((resolve, reject) => {
    const chunks  = [];
    let totalBytes = 0;
    let settled    = false;          // prevents double settle after req.destroy()

    function fail(err) {
      if (settled) return;
      settled = true;
      reject(err);
    }

    req.on("data", (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > maxBytes) {
        // Stop accumulating but do NOT call req.destroy() — that tears down
        // the TCP socket before app.js can write the 413 response.
        // Instead, drain the remainder of the incoming stream silently.
        if (!settled) {
          settled = true;
          req.resume(); // discard remaining bytes
          reject(new ParseError(
            `Request body exceeds the ${maxBytes / 1024} KB size limit`,
            413,
          ));
        }
        return;
      }

      if (!settled) chunks.push(chunk);
    });

    req.on("error", (err) => {
      // Fires after req.destroy() — ignore if already settled.
      if (settled) return;
      fail(new ParseError(`Request stream error: ${err.message}`, 400));
    });

    req.on("end", () => {
      if (settled) return;

      const raw = Buffer.concat(chunks).toString("utf8").trim();

      // ── 3. Reject empty body ──────────────────────────────────────────────
      if (!raw) {
        return fail(new ParseError("Request body must not be empty", 400));
      }

      // ── 4. Parse JSON ─────────────────────────────────────────────────────
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        fail(new ParseError(`Malformed JSON: ${err.message}`, 400));
      }
    });
  });
}

module.exports = { parseBody };
