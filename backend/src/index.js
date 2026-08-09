/**
 * src/index.js
 *
 * LedgerLock backend entry point.
 * Creates the HTTP server and starts listening on the configured port.
 *
 * Usage:
 *   node src/index.js          (production)
 *   npm run dev                (nodemon, auto-restart)
 */

"use strict";

// Load .env FIRST — before any other require() that reads process.env.
require("dotenv").config();

const { createApp } = require("./app");
const config        = require("./config");

const PORT = Number(config.port) || 3000;
const app  = createApp();

app.listen(PORT, () => {
  console.log(`[LedgerLock] Backend listening on http://localhost:${PORT}`);
  console.log(`[LedgerLock] Environment: ${config.nodeEnv}`);
});

app.on("error", (err) => {
  console.error("[LedgerLock] Server failed to start:", err.message);
  process.exit(1);
});
