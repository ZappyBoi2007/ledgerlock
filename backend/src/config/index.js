/**
 * src/config/index.js
 *
 * Central configuration module for LedgerLock backend.
 * All process.env reads belong here; services import from this module.
 *
 * Values are read once at startup. If a required variable is missing the
 * consuming service is responsible for throwing a clear error at call-time
 * (not at module load) so that tests can set process.env before importing.
 */

"use strict";

const config = {
  // ── Server ──────────────────────────────────────────────────────────────────
  port:    process.env.PORT     || "3000",
  nodeEnv: process.env.NODE_ENV || "development",

  // ── IPFS / Pinata ───────────────────────────────────────────────────────────
  pinata: {
    /** Bearer token for the Pinata v3 API (PINATA_JWT). */
    get jwt()     { return process.env.PINATA_JWT; },
    /** Base URL of your Pinata dedicated gateway, e.g. https://myapp.mypinata.cloud */
    get gateway() { return process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud"; },
    /** Pinata upload API URL (override in tests or staging). */
    get apiUrl()  { return process.env.PINATA_API_URL || "https://uploads.pinata.cloud/v3/files"; },
    /** Request timeout in milliseconds (no env override needed for now). */
    timeoutMs: 15_000,
  },

  // ── Blockchain ───────────────────────────────────────────────────────────────
  // Getters so tests can set env vars before calling createBlockchainService().
  get rpcUrl()             { return process.env.RPC_URL          || ""; },
  get chainId()            { return process.env.CHAIN_ID         || ""; },
  get contractAddress()    { return process.env.CONTRACT_ADDRESS || ""; },
  /** Private key for the backend signing wallet. NEVER log or expose this. */
  get blockchainPrivateKey() { return process.env.BLOCKCHAIN_PRIVATE_KEY || ""; },

  // ── Auth ─────────────────────────────────────────────────────────────────────
  jwtSecret:    process.env.JWT_SECRET    || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  // ── CORS ─────────────────────────────────────────────────────────────────────
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(","),
};

module.exports = config;
