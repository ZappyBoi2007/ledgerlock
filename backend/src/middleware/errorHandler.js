/**
 * src/middleware/errorHandler.js
 *
 * Centralised error handler for the raw Node HTTP server.
 * Called by app.js whenever a controller throws.
 *
 * Mapping strategy:
 *   AppError (ParseError, ValidationError) → use their own statusCode
 *   PinataError                            → 502 Bad Gateway (upstream failure)
 *   Unknown Error                          → 500 Internal Server Error
 *
 * Errors are never swallowed; unknown ones are logged to stderr.
 */

"use strict";

const { sendError }   = require("../utils/response");
const { AppError }    = require("../utils/errors");
const { PinataError } = require("../services/pinataService");

/**
 * @param {Error}                               err
 * @param {import('node:http').ServerResponse}  res
 */
function handleError(err, res) {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.message);
    return;
  }

  if (err instanceof PinataError) {
    // Always surface as 502 — the client request was valid; Pinata is the issue.
    sendError(res, 502, `IPFS upload failed: ${err.message}`);
    return;
  }

  // Unexpected / unclassified error.
  console.error("[LedgerLock] Unhandled server error:", err);
  sendError(res, 500, "Internal server error");
}

module.exports = { handleError };
