/**
 * src/routes/index.js
 *
 * Route registry for the LedgerLock API.
 *
 * Two Maps are exported:
 *   routes       – exact "METHOD /path" → handler  (health, upload)
 *   prefixRoutes – "METHOD /path/prefix" → handler  (path-param routes)
 *
 * app.js checks exact routes first, then prefix routes.
 * Keep this file simple: one line per route.
 */

"use strict";

const { handleHealth }              = require("../controllers/healthController");
const { handleUpload }              = require("../controllers/uploadController");
const { handleNotarise, handleVerify } = require("../controllers/certificateController");

/**
 * Exact route lookup — used for routes with no path parameters.
 * @type {Map<string, Function>}
 */
const routes = new Map([
  ["GET /api/v1/health",    handleHealth],
  ["POST /api/v1/upload",   handleUpload],
  ["POST /api/v1/certificates", handleNotarise],
]);

/**
 * Prefix route lookup — used for routes containing path parameters.
 * app.js iterates these and matches if the request key starts with the prefix.
 * @type {Map<string, Function>}
 */
const prefixRoutes = new Map([
  ["GET /api/v1/certificates/", handleVerify],
]);

module.exports = { routes, prefixRoutes };
