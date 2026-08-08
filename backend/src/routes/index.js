/**
 * src/routes/index.js
 *
 * Route registry for the LedgerLock API.
 * Maps "METHOD /path" strings to controller functions.
 * The app.js dispatcher looks up routes from this Map.
 *
 * Keep this file simple: one line per route.
 * Business logic belongs in controllers; HTTP plumbing belongs in app.js.
 */

"use strict";

const { handleHealth } = require("../controllers/healthController");
const { handleUpload } = require("../controllers/uploadController");

/**
 * @type {Map<string, (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>>}
 */
const routes = new Map([
  ["GET /api/v1/health", handleHealth],
  ["POST /api/v1/upload", handleUpload],
]);

module.exports = { routes };
