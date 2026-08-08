/**
 * src/app.js
 *
 * HTTP server factory for LedgerLock backend.
 * Uses Node's built-in http module — no Express.
 *
 * Architecture:
 *   createApp()  →  http.Server
 *     ↓ each request
 *   routes Map lookup  (routes/index.js)
 *     ↓ found
 *   controller(req, res)
 *     ↓ throws
 *   errorHandler(err, res)   (middleware/errorHandler.js)
 *     ↓ not found
 *   404 response
 *
 * Exported as a factory so tests can start isolated instances on port 0.
 */

"use strict";

const http = require("node:http");

const { routes }       = require("./routes");
const { handleError }  = require("./middleware/errorHandler");
const { sendError }    = require("./utils/response");

/**
 * Create and return a configured http.Server.
 * Call server.listen(port, cb) to start accepting connections.
 *
 * @returns {import('node:http').Server}
 */
function createApp() {
  return http.createServer(async (req, res) => {
    const key     = `${req.method} ${req.url}`;
    const handler = routes.get(key);

    // ── 404 for unknown routes ──────────────────────────────────────────────
    if (!handler) {
      sendError(res, 404, `Cannot ${req.method} ${req.url}`);
      return;
    }

    // ── Dispatch to controller ──────────────────────────────────────────────
    try {
      await handler(req, res);
    } catch (err) {
      // Only write error response if headers haven't already been sent.
      if (!res.headersSent) {
        handleError(err, res);
      }
    }
  });
}

module.exports = { createApp };
