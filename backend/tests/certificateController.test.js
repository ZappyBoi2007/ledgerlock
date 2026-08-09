/**
 * tests/certificateController.test.js
 *
 * Integration tests for:
 *   POST /api/v1/certificates   (notarise)
 *   GET  /api/v1/certificates/:certId  (verify)
 *
 * Strategy:
 *   - Real local HTTP server started on port 0.
 *   - createCertificateHandlers(mockService) injects a deterministic
 *     blockchain service mock — NO real ethers/RPC calls.
 *   - globalThis.fetch is monkey-patched to mock Pinata.
 *   - A custom app is built that wires the injected handlers into
 *     the same app.js infrastructure (CORS, error handling, etc.)
 *
 * IMPORTANT: Set env vars BEFORE any require() calls.
 */

"use strict";

// ── Set env BEFORE any requires ───────────────────────────────────────────────
process.env.PINATA_JWT             = "test-jwt-cert-controller";
process.env.PINATA_GATEWAY         = "https://test.gateway.mypinata.cloud";
process.env.PINATA_API_URL         = "https://test.api.pinata.cloud/v3/files";
// These must pass the validation guards in createBlockchainService, but
// the real ethers objects are never constructed because we inject a mock service.
process.env.RPC_URL                = "http://localhost:8545";
process.env.CONTRACT_ADDRESS       = "0x" + "a".repeat(40);
process.env.BLOCKCHAIN_PRIVATE_KEY = "0x" + "b".repeat(64);

const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http   = require("node:http");

const { createCertificateHandlers } = require("../src/controllers/certificateController");
const { BlockchainError }           = require("../src/services/blockchainService");
const { handleError }               = require("../src/middleware/errorHandler");
const { sendError }                 = require("../src/utils/response");
const { handleHealth }              = require("../src/controllers/healthController");
const { handleUpload }              = require("../src/controllers/uploadController");
const config                        = require("../src/config");

// ─── Constants ────────────────────────────────────────────────────────────────

const FAKE_CID     = "QmCertControllerTestCID";
const FAKE_CERT_ID = "0x" + "c".repeat(64);
const FAKE_TX_HASH = "0x" + "d".repeat(64);
const FAKE_ISSUER  = "0x" + "e".repeat(40);
const FAKE_GATEWAY = process.env.PINATA_GATEWAY;

// ─── Mock blockchain service factory ─────────────────────────────────────────

function makeMockService(overrides = {}) {
  return {
    getWalletAddress:  () => FAKE_ISSUER,
    issueCertificate:  overrides.issueCertificate
      ?? (async () => ({ certId: FAKE_CERT_ID, txHash: FAKE_TX_HASH })),
    verifyCertificate: overrides.verifyCertificate
      ?? (async () => ({ valid: true, issuer: FAKE_ISSUER, ipfsCid: FAKE_CID })),
    revokeCertificate: overrides.revokeCertificate
      ?? (async () => ({ txHash: FAKE_TX_HASH })),
  };
}

// ─── Mock Pinata fetch ────────────────────────────────────────────────────────

function mockPinataSuccess() {
  return async () => ({
    ok:   true,
    status: 200,
    json: async () => ({ data: { cid: FAKE_CID, size: 256 } }),
  });
}

function mockPinataError(status) {
  return async () => ({
    ok:   false,
    status,
    json: async () => ({ message: `Pinata error ${status}` }),
  });
}

// ─── Build a test app with injected handlers ──────────────────────────────────
/**
 * Creates an http.Server that uses the same CORS/routing/error-handling
 * infrastructure as the real app but with injected certificate handlers.
 */
function buildTestApp(mockService) {
  const { handleNotarise, handleVerify } = createCertificateHandlers(mockService);

  const routes = new Map([
    ["GET /api/v1/health",        handleHealth],
    ["POST /api/v1/upload",       handleUpload],
    ["POST /api/v1/certificates", handleNotarise],
  ]);

  const prefixRoutes = new Map([
    ["GET /api/v1/certificates/", handleVerify],
  ]);

  return http.createServer(async (req, res) => {
    const origin  = req.headers["origin"] || "";
    const allowed = config.allowedOrigins.includes(origin)
      ? origin
      : config.allowedOrigins[0];

    res.setHeader("Access-Control-Allow-Origin",  allowed);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const key = `${req.method} ${req.url}`;
    let handler = routes.get(key);
    if (!handler) {
      for (const [prefix, h] of prefixRoutes) {
        if (key.startsWith(prefix)) { handler = h; break; }
      }
    }

    if (!handler) { sendError(res, 404, `Cannot ${req.method} ${req.url}`); return; }

    try {
      await handler(req, res);
    } catch (err) {
      if (!res.headersSent) handleError(err, res);
    }
  });
}

// ─── Per-suite server state ───────────────────────────────────────────────────

let port;
let closeServer;
let currentMockService;

before(async () => {
  // Start with a default success-mock service; individual tests can replace it.
  currentMockService = makeMockService();
  // We'll rebuild the app per describe block with beforeEach instead.
  // For the top-level server we start a default one.
  const app = buildTestApp(currentMockService);
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  port        = app.address().port;
  closeServer = () => new Promise((resolve) => app.close(resolve));
});

after(async () => { await closeServer(); });

// ─── Fetch mock lifecycle ─────────────────────────────────────────────────────

let savedFetch;
beforeEach(() => { savedFetch = globalThis.fetch; globalThis.fetch = mockPinataSuccess(); });
afterEach(() => { globalThis.fetch = savedFetch; });

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function request({
  method   = "POST",
  path     = "/api/v1/certificates",
  headers  = {},
  jsonBody = null,
  rawBody  = null,
} = {}) {
  return new Promise((resolve, reject) => {
    const payload = rawBody ?? (jsonBody !== null ? JSON.stringify(jsonBody) : null);
    const buf     = payload !== null ? Buffer.from(payload) : null;

    const reqHeaders = {
      "Content-Type": "application/json",
      ...(buf ? { "Content-Length": buf.length } : {}),
      ...headers,
    };

    const req = http.request(
      { hostname: "127.0.0.1", port, path, method, headers: reqHeaders },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let body;
          try { body = JSON.parse(raw); } catch { body = raw; }
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        });
      },
    );
    req.on("error", reject);
    if (buf) req.write(buf);
    req.end();
  });
}

/**
 * Start a one-shot test server with the given mock service and run the
 * provided test function against it. Server is closed afterwards.
 *
 * This allows per-test service overrides without rebuilding the global server.
 *
 * @param {object} mockService
 * @param {(port: number) => Promise<void>} fn
 */
async function withServer(mockService, fn) {
  const app = buildTestApp(mockService);
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const p = app.address().port;
  try {
    await fn(p);
  } finally {
    await new Promise((resolve) => app.close(resolve));
  }
}

// ─── POST /api/v1/certificates (notarise) ────────────────────────────────────

describe("POST /api/v1/certificates", () => {
  const VALID_BODY = { certificate: { holder: "Alice", course: "Blockchain 101", grade: "A" } };

  it("returns HTTP 201 on success", async () => {
    const { statusCode } = await request({ jsonBody: VALID_BODY });
    assert.equal(statusCode, 201);
  });

  it("returns success: true", async () => {
    const { body } = await request({ jsonBody: VALID_BODY });
    assert.equal(body.success, true);
  });

  it("returns cid from Pinata", async () => {
    const { body } = await request({ jsonBody: VALID_BODY });
    assert.equal(body.data?.cid, FAKE_CID);
  });

  it("returns IPFS gateway url", async () => {
    const { body } = await request({ jsonBody: VALID_BODY });
    assert.equal(body.data?.url, `${FAKE_GATEWAY}/ipfs/${FAKE_CID}`);
  });

  it("returns certId from blockchain", async () => {
    const { body } = await request({ jsonBody: VALID_BODY });
    assert.equal(body.data?.certId, FAKE_CERT_ID);
  });

  it("returns txHash from blockchain", async () => {
    const { body } = await request({ jsonBody: VALID_BODY });
    assert.equal(body.data?.txHash, FAKE_TX_HASH);
  });

  it("missing certificate field returns 422", async () => {
    const { statusCode } = await request({ jsonBody: { other: "x" } });
    assert.equal(statusCode, 422);
  });

  it("malformed JSON returns 400", async () => {
    const { statusCode } = await request({ rawBody: "{bad" });
    assert.equal(statusCode, 400);
  });

  it("Pinata failure returns 502", async () => {
    globalThis.fetch = mockPinataError(500);
    const { statusCode } = await request({ jsonBody: VALID_BODY });
    assert.equal(statusCode, 502);
  });

  it("blockchain issuance failure returns 502", async () => {
    const failService = makeMockService({
      issueCertificate: async () => { throw new BlockchainError("execution reverted"); },
    });
    await withServer(failService, async (p) => {
      const req2 = () => new Promise((resolve, reject) => {
        const payload = JSON.stringify(VALID_BODY);
        const buf = Buffer.from(payload);
        const r = http.request(
          { hostname: "127.0.0.1", port: p, path: "/api/v1/certificates",
            method: "POST", headers: { "Content-Type": "application/json", "Content-Length": buf.length } },
          (res) => {
            let raw = "";
            res.on("data", (c) => (raw += c));
            res.on("end", () => resolve({ statusCode: res.statusCode, body: JSON.parse(raw) }));
          },
        );
        r.on("error", reject);
        r.write(buf);
        r.end();
      });
      const { statusCode } = await req2();
      assert.equal(statusCode, 502);
    });
  });

  it("response does not contain private key or JWT", async () => {
    const { body } = await request({ jsonBody: VALID_BODY });
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes(process.env.BLOCKCHAIN_PRIVATE_KEY));
    assert.ok(!raw.includes(process.env.PINATA_JWT));
  });
});

// ─── GET /api/v1/certificates/:certId (verify) ───────────────────────────────

describe("GET /api/v1/certificates/:certId", () => {
  const PATH = `/api/v1/certificates/${FAKE_CERT_ID}`;

  it("returns HTTP 200 for a valid certId", async () => {
    const { statusCode } = await request({ method: "GET", path: PATH });
    assert.equal(statusCode, 200);
  });

  it("returns success: true", async () => {
    const { body } = await request({ method: "GET", path: PATH });
    assert.equal(body.success, true);
  });

  it("returns the certId in the response", async () => {
    const { body } = await request({ method: "GET", path: PATH });
    assert.equal(body.data?.certId, FAKE_CERT_ID);
  });

  it("returns valid: true for a valid certificate", async () => {
    const { body } = await request({ method: "GET", path: PATH });
    assert.equal(body.data?.valid, true);
  });

  it("returns valid: false for a revoked certificate", async () => {
    const revokedService = makeMockService({
      verifyCertificate: async () => ({ valid: false, issuer: FAKE_ISSUER, ipfsCid: FAKE_CID }),
    });
    await withServer(revokedService, async (p) => {
      const res = await new Promise((resolve, reject) => {
        const r = http.request(
          { hostname: "127.0.0.1", port: p, path: PATH, method: "GET" },
          (res) => {
            let raw = "";
            res.on("data", (c) => (raw += c));
            res.on("end", () => resolve({ statusCode: res.statusCode, body: JSON.parse(raw) }));
          },
        );
        r.on("error", reject);
        r.end();
      });
      assert.equal(res.body.data?.valid, false);
    });
  });

  it("returns issuer address", async () => {
    const { body } = await request({ method: "GET", path: PATH });
    assert.equal(body.data?.issuer, FAKE_ISSUER);
  });

  it("returns ipfsCid", async () => {
    const { body } = await request({ method: "GET", path: PATH });
    assert.equal(body.data?.ipfsCid, FAKE_CID);
  });

  it("invalid certId format returns 422", async () => {
    const { statusCode } = await request({ method: "GET", path: "/api/v1/certificates/notahex" });
    assert.equal(statusCode, 422);
  });

  it("empty certId segment returns 422 (validation rejects empty string)", async () => {
    const { statusCode } = await request({ method: "GET", path: "/api/v1/certificates/" });
    assert.equal(statusCode, 422);
  });

  it("blockchain failure returns 502", async () => {
    const failService = makeMockService({
      verifyCertificate: async () => { throw new BlockchainError("network error"); },
    });
    await withServer(failService, async (p) => {
      const res = await new Promise((resolve, reject) => {
        const r = http.request(
          { hostname: "127.0.0.1", port: p, path: PATH, method: "GET" },
          (res) => {
            let raw = "";
            res.on("data", (c) => (raw += c));
            res.on("end", () => resolve({ statusCode: res.statusCode }));
          },
        );
        r.on("error", reject);
        r.end();
      });
      assert.equal(res.statusCode, 502);
    });
  });
});

// ─── CORS ─────────────────────────────────────────────────────────────────────

describe("CORS headers", () => {
  it("responses include Access-Control-Allow-Origin", async () => {
    const { headers } = await request({ method: "GET", path: "/api/v1/health" });
    assert.ok(headers["access-control-allow-origin"], "Missing CORS header");
  });

  it("OPTIONS preflight returns 204", async () => {
    const { statusCode } = await new Promise((resolve, reject) => {
      const r = http.request(
        { hostname: "127.0.0.1", port, path: "/api/v1/certificates", method: "OPTIONS",
          headers: { "Access-Control-Request-Method": "POST", "Origin": "http://localhost:5173" } },
        (res) => resolve({ statusCode: res.statusCode }),
      );
      r.on("error", reject);
      r.end();
    });
    assert.equal(statusCode, 204);
  });
});
