/**
 * src/app.js
 *
 * HTTP server factory for LedgerLock backend.
 * Uses Node's built-in http module — no Express.
 *
 * Architecture:
 *   createApp()  →  http.Server
 *     ↓ each request
 *   CORS preflight / headers
 *     ↓
 *   Exact route lookup (routes Map)
 *   OR prefix route lookup (prefixRoutes Map, for path-param routes)
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

const { routes, prefixRoutes } = require("./routes");
const { handleError }          = require("./middleware/errorHandler");
const { sendError }            = require("./utils/response");
const config                   = require("./config");

/**
 * Create and return a configured http.Server.
 * Call server.listen(port, cb) to start accepting connections.
 *
 * @returns {import('node:http').Server}
 */
function createApp() {
  return http.createServer(async (req, res) => {
    // ── CORS headers (always, including preflight) ──────────────────────────
    const origin = req.headers["origin"] || "";
    const allowed = config.allowedOrigins.includes(origin) ? origin : config.allowedOrigins[0];

    res.setHeader("Access-Control-Allow-Origin", allowed);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── Route lookup ─────────────────────────────────────────────────────────
    const key = `${req.method} ${req.url}`;

    // 1. Exact match (health, upload, etc.)
    let handler = routes.get(key);

    // 2. Prefix match (path-param routes like GET /api/v1/certificates/:certId)
    if (!handler) {
      for (const [prefix, h] of prefixRoutes) {
        if (key.startsWith(prefix)) {
          handler = h;
          break;
        }
      }
    }

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
