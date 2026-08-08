/**
 * tests/upload.test.js
 *
 * Integration tests for POST /api/v1/upload.
 *
 * Strategy:
 *  - A real Node HTTP server is started on an ephemeral port.
 *  - globalThis.fetch is monkey-patched before each test so NO real
 *    Pinata requests are ever made.
 *  - PINATA_JWT must be set before any require() calls because
 *    pinataService reads it via a config getter at call-time.
 *
 * IMPORTANT: env vars are set BEFORE any require() so that all
 * lazily-evaluated config getters see the test values.
 */

"use strict";

// ── Set env BEFORE any requires ───────────────────────────────────────────────
process.env.PINATA_JWT     = "test-jwt-for-upload-tests";
process.env.PINATA_GATEWAY = "https://test-gateway.mypinata.cloud";
process.env.PINATA_API_URL = "https://test-api.pinata.cloud/v3/files";

const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http   = require("node:http");

const { createApp } = require("../src/app");

// ─── Constants ────────────────────────────────────────────────────────────────

const FAKE_CID     = "QmUploadTestCIDxyz123456";
const FAKE_GATEWAY = process.env.PINATA_GATEWAY;

const VALID_CERT_BODY = {
  certificate: {
    holder: "Alice",
    course: "Blockchain 101",
    grade:  "A",
  },
};

// ─── Pinata fetch mocks ───────────────────────────────────────────────────────

function mockPinataSuccess(cid = FAKE_CID) {
  return async () => ({
    ok:     true,
    status: 200,
    json:   async () => ({ data: { cid, size: 512 } }),
  });
}

function mockPinataHttpError(status, message = "Pinata error") {
  return async () => ({
    ok:     false,
    status,
    json:   async () => ({ message }),
  });
}

function mockPinataNetworkError() {
  return async () => { throw new TypeError("fetch failed"); };
}

// ─── Server lifecycle ─────────────────────────────────────────────────────────

let port;
let closeServer;

before(async () => {
  const app = createApp();
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  port        = app.address().port;
  closeServer = () => new Promise((resolve) => app.close(resolve));
});

after(async () => {
  await closeServer();
});

// Restore fetch between tests (default = success mock).
let savedFetch;

beforeEach(() => {
  savedFetch        = globalThis.fetch;
  globalThis.fetch  = mockPinataSuccess();
});

afterEach(() => {
  globalThis.fetch = savedFetch;
});

// ─── HTTP helper ──────────────────────────────────────────────────────────────

/**
 * Make an HTTP request to the test server.
 *
 * @param {object} opts
 * @param {string} [opts.method="POST"]
 * @param {string} [opts.path="/api/v1/upload"]
 * @param {object} [opts.headers={}]
 * @param {string|Buffer|null} [opts.rawBody=null]   Send raw bytes (skips JSON.stringify)
 * @param {object|null} [opts.jsonBody=null]          Serialised as JSON
 */
function request({
  method    = "POST",
  path      = "/api/v1/upload",
  headers   = {},
  rawBody   = null,
  jsonBody  = null,
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

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("POST /api/v1/upload", () => {

  // ── 1. Successful upload ────────────────────────────────────────────────────

  describe("successful upload", () => {
    it("returns HTTP 201", async () => {
      const { statusCode } = await request({ jsonBody: VALID_CERT_BODY });
      assert.equal(statusCode, 201);
    });

    it("returns success: true", async () => {
      const { body } = await request({ jsonBody: VALID_CERT_BODY });
      assert.equal(body.success, true);
    });

    it("returns the CID from Pinata", async () => {
      const { body } = await request({ jsonBody: VALID_CERT_BODY });
      assert.equal(body.data?.cid, FAKE_CID);
    });

    it("returns the IPFS gateway URL", async () => {
      const { body } = await request({ jsonBody: VALID_CERT_BODY });
      assert.equal(body.data?.url, `${FAKE_GATEWAY}/ipfs/${FAKE_CID}`);
    });

    it("response does NOT expose the Pinata JWT", async () => {
      const { body } = await request({ jsonBody: VALID_CERT_BODY });
      const raw = JSON.stringify(body);
      assert.ok(
        !raw.includes(process.env.PINATA_JWT),
        "Response must not contain the Pinata JWT",
      );
    });
  });

  // ── 2. Validation errors (422) ──────────────────────────────────────────────

  describe("validation errors", () => {
    it("missing certificate field returns 422", async () => {
      const { statusCode } = await request({ jsonBody: { other: "value" } });
      assert.equal(statusCode, 422);
    });

    it("missing certificate field returns success: false", async () => {
      const { body } = await request({ jsonBody: { other: "value" } });
      assert.equal(body.success, false);
    });

    it("empty certificate object returns 422", async () => {
      const { statusCode } = await request({ jsonBody: { certificate: {} } });
      assert.equal(statusCode, 422);
    });

    it("null certificate returns 422", async () => {
      const { statusCode } = await request({ jsonBody: { certificate: null } });
      assert.equal(statusCode, 422);
    });

    it("array certificate returns 422", async () => {
      const { statusCode } = await request({ jsonBody: { certificate: ["a", "b"] } });
      assert.equal(statusCode, 422);
    });

    it("string certificate returns 422", async () => {
      const { statusCode } = await request({ jsonBody: { certificate: "Alice" } });
      assert.equal(statusCode, 422);
    });
  });

  // ── 3. Body parse errors ────────────────────────────────────────────────────

  describe("body parse errors", () => {
    it("malformed JSON returns 400", async () => {
      const { statusCode } = await request({ rawBody: "{bad json{{" });
      assert.equal(statusCode, 400);
    });

    it("empty body returns 400", async () => {
      const { statusCode } = await request({ rawBody: "" });
      assert.equal(statusCode, 400);
    });

    it("wrong Content-Type returns 415", async () => {
      const { statusCode } = await request({
        jsonBody: VALID_CERT_BODY,
        headers:  { "Content-Type": "text/plain" },
      });
      assert.equal(statusCode, 415);
    });

    it("missing Content-Type header returns 415", async () => {
      const { statusCode } = await request({
        jsonBody: VALID_CERT_BODY,
        headers:  { "Content-Type": "" },
      });
      assert.equal(statusCode, 415);
    });

    it("oversized body returns 413", async () => {
      // Build a raw JSON body that is > 100 KB
      const bigValue = "x".repeat(101 * 1024);
      const bigBody  = `{"certificate":{"data":"${bigValue}"}}`;
      const { statusCode } = await request({ rawBody: bigBody });
      assert.equal(statusCode, 413);
    });
  });

  // ── 4. Upstream / Pinata failures ──────────────────────────────────────────

  describe("Pinata failures", () => {
    it("Pinata 500 is surfaced as HTTP 502", async () => {
      globalThis.fetch = mockPinataHttpError(500, "Pinata internal error");
      const { statusCode } = await request({ jsonBody: VALID_CERT_BODY });
      assert.equal(statusCode, 502);
    });

    it("Pinata 502 response contains success: false", async () => {
      globalThis.fetch = mockPinataHttpError(500);
      const { body } = await request({ jsonBody: VALID_CERT_BODY });
      assert.equal(body.success, false);
    });

    it("Pinata network error is surfaced as HTTP 502", async () => {
      globalThis.fetch = mockPinataNetworkError();
      const { statusCode } = await request({ jsonBody: VALID_CERT_BODY });
      assert.equal(statusCode, 502);
    });
  });

});
