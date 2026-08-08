/**
 * src/controllers/healthController.js
 *
 * GET /api/v1/health
 * Simple liveness probe — no external dependencies required.
 */

"use strict";

const { sendJson } = require("../utils/response");

/**
 * @param {import('node:http').IncomingMessage}  req
 * @param {import('node:http').ServerResponse}   res
 */
async function handleHealth(req, res) {
  sendJson(res, 200, {
    success: true,
    data: {
      status:    "ok",
      service:   "ledgerlock-backend",
      timestamp: new Date().toISOString(),
    },
  });
}

module.exports = { handleHealth };
