/**
 * tests/pinataService.test.js
 *
 * Unit tests for src/services/pinataService.js
 * Uses Node.js built-in test runner (node:test) + assert.
 *
 * NO real HTTP calls are made. fetch is monkey-patched on globalThis before
 * each test and restored after to keep tests fully offline and isolated.
 */

"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

// ─── Constants ────────────────────────────────────────────────────────────────

const FAKE_JWT     = "eyFakeJWT.abc.def";
const FAKE_GATEWAY = "https://my-test-gateway.mypinata.cloud";
const FAKE_API_URL = "https://uploads.pinata.cloud/v3/files";
const FAKE_CID     = "QmFakeCID1234567890abcdef";
const FAKE_SIZE    = 512;

const TEST_METADATA = {
  recipientName: "Alice",
  courseName:    "Blockchain 101",
  issuedAt:      "2026-08-08T00:00:00Z",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a mock fetch that returns a successful Pinata v3 response. */
function mockFetchSuccess() {
  return async (_url, _opts) => ({
    ok:   true,
    status: 200,
    json: async () => ({
      data: { cid: FAKE_CID, size: FAKE_SIZE },
    }),
  });
}

/** Build a mock fetch that returns a Pinata error response. */
function mockFetchHttpError(status, message = "") {
  return async () => ({
    ok:     false,
    status,
    json:   async () => ({ message }),
  });
}

/** Build a mock fetch that throws a network error. */
function mockFetchNetworkError() {
  return async () => { throw new TypeError("fetch failed"); };
}

/** Build a mock fetch that throws an AbortError (simulates timeout). */
function mockFetchTimeout() {
  return async () => {
    const err  = new Error("The operation was aborted");
    err.name   = "AbortError";
    throw err;
  };
}

/** Build a mock fetch that returns a response whose .json() throws. */
function mockFetchBadJson() {
  return async () => ({
    ok:   true,
    status: 200,
    json: async () => { throw new SyntaxError("Unexpected token"); },
  });
}

/** Build a mock fetch that returns a response missing 'data.cid'. */
function mockFetchMalformedBody() {
  return async () => ({
    ok:   true,
    status: 200,
    json: async () => ({ data: {} }),       // cid is missing
  });
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let originalFetch;

beforeEach(() => {
  // Save real globalThis.fetch (may be undefined in some environments).
  originalFetch = globalThis.fetch;

  // Set required env vars.
  process.env.PINATA_JWT     = FAKE_JWT;
  process.env.PINATA_GATEWAY = FAKE_GATEWAY;
  process.env.PINATA_API_URL = FAKE_API_URL;
});

afterEach(() => {
  globalThis.fetch = originalFetch;

  // Clean env so tests remain isolated.
  delete process.env.PINATA_JWT;
  delete process.env.PINATA_GATEWAY;
  delete process.env.PINATA_API_URL;
});

// ─── Import after env is set up ───────────────────────────────────────────────
// NOTE: Node caches require() results. Because config uses getters (get jwt())
// that re-read process.env each time, we can safely require once at the top.
const { uploadMetadata, PinataError } = require("../src/services/pinataService");

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("pinataService.uploadMetadata", () => {

  // ── 1. Successful upload ───────────────────────────────────────────────────

  describe("successful upload", () => {
    it("returns a result object with cid, url, size, and timestamp", async () => {
      globalThis.fetch = mockFetchSuccess();
      const result = await uploadMetadata(TEST_METADATA);

      assert.equal(typeof result, "object");
      assert.ok(result.cid,       "result.cid should be truthy");
      assert.ok(result.url,       "result.url should be truthy");
      assert.ok(result.size >= 0, "result.size should be a non-negative number");
      assert.ok(result.timestamp, "result.timestamp should be truthy");
    });

    // ── 2. Returned CID ────────────────────────────────────────────────────

    it("returns the exact CID received from Pinata", async () => {
      globalThis.fetch = mockFetchSuccess();
      const result = await uploadMetadata(TEST_METADATA);
      assert.equal(result.cid, FAKE_CID);
    });

    it("returns the correct size from Pinata", async () => {
      globalThis.fetch = mockFetchSuccess();
      const result = await uploadMetadata(TEST_METADATA);
      assert.equal(result.size, FAKE_SIZE);
    });

    it("returns an ISO-8601 timestamp", async () => {
      globalThis.fetch = mockFetchSuccess();
      const result = await uploadMetadata(TEST_METADATA);
      assert.doesNotThrow(() => new Date(result.timestamp));
      assert.ok(!isNaN(new Date(result.timestamp).getTime()));
    });

    // ── 3. Gateway URL construction ────────────────────────────────────────

    it("constructs the gateway URL as GATEWAY/ipfs/CID", async () => {
      globalThis.fetch = mockFetchSuccess();
      const result = await uploadMetadata(TEST_METADATA);
      assert.equal(result.url, `${FAKE_GATEWAY}/ipfs/${FAKE_CID}`);
    });

    it("strips a trailing slash from PINATA_GATEWAY before building the URL", async () => {
      process.env.PINATA_GATEWAY = FAKE_GATEWAY + "/";
      globalThis.fetch = mockFetchSuccess();
      const result = await uploadMetadata(TEST_METADATA);
      // Must not produce a double-slash
      assert.ok(
        !result.url.includes("//ipfs/"),
        `Expected no double-slash in URL but got: ${result.url}`,
      );
      assert.equal(result.url, `${FAKE_GATEWAY}/ipfs/${FAKE_CID}`);
    });
  });

  // ── 4. Missing JWT ─────────────────────────────────────────────────────────

  describe("missing PINATA_JWT", () => {
    it("throws PinataError immediately if PINATA_JWT is not set", async () => {
      delete process.env.PINATA_JWT;
      globalThis.fetch = mockFetchSuccess(); // should never be called

      await assert.rejects(
        () => uploadMetadata(TEST_METADATA),
        (err) => {
          assert.ok(err instanceof PinataError, `Expected PinataError, got ${err.constructor.name}`);
          assert.ok(
            err.message.includes("PINATA_JWT"),
            `Error message should mention PINATA_JWT, got: "${err.message}"`,
          );
          return true;
        },
      );
    });

    it("throws PinataError if PINATA_JWT is an empty string", async () => {
      process.env.PINATA_JWT = "   ";
      globalThis.fetch = mockFetchSuccess();

      await assert.rejects(
        () => uploadMetadata(TEST_METADATA),
        (err) => {
          assert.ok(err instanceof PinataError);
          return true;
        },
      );
    });
  });

  // ── 5. Pinata 4xx / 5xx responses ─────────────────────────────────────────

  describe("Pinata HTTP error responses", () => {
    it("throws PinataError on HTTP 401 Unauthorized", async () => {
      globalThis.fetch = mockFetchHttpError(401, "Unauthorized");

      await assert.rejects(
        () => uploadMetadata(TEST_METADATA),
        (err) => {
          assert.ok(err instanceof PinataError);
          assert.equal(err.statusCode, 401);
          assert.ok(err.message.includes("401"));
          return true;
        },
      );
    });

    it("throws PinataError on HTTP 413 Payload Too Large", async () => {
      globalThis.fetch = mockFetchHttpError(413, "File too large");

      await assert.rejects(
        () => uploadMetadata(TEST_METADATA),
        (err) => {
          assert.ok(err instanceof PinataError);
          assert.equal(err.statusCode, 413);
          return true;
        },
      );
    });

    it("throws PinataError on HTTP 500 Internal Server Error", async () => {
      globalThis.fetch = mockFetchHttpError(500, "Internal server error");

      await assert.rejects(
        () => uploadMetadata(TEST_METADATA),
        (err) => {
          assert.ok(err instanceof PinataError);
          assert.equal(err.statusCode, 500);
          assert.ok(err.message.includes("500"));
          return true;
        },
      );
    });
  });

  // ── 6. Network failure ─────────────────────────────────────────────────────

  describe("network failure", () => {
    it("throws PinataError when fetch throws a network error", async () => {
      globalThis.fetch = mockFetchNetworkError();

      await assert.rejects(
        () => uploadMetadata(TEST_METADATA),
        (err) => {
          assert.ok(err instanceof PinataError);
          assert.ok(
            err.message.toLowerCase().includes("network"),
            `Expected 'network' in message, got: "${err.message}"`,
          );
          return true;
        },
      );
    });
  });

  // ── 7. Timeout ────────────────────────────────────────────────────────────

  describe("request timeout", () => {
    it("throws PinataError when fetch is aborted", async () => {
      globalThis.fetch = mockFetchTimeout();

      await assert.rejects(
        () => uploadMetadata(TEST_METADATA),
        (err) => {
          assert.ok(err instanceof PinataError);
          assert.ok(
            err.message.toLowerCase().includes("timed out") ||
            err.message.toLowerCase().includes("abort"),
            `Expected timeout message, got: "${err.message}"`,
          );
          return true;
        },
      );
    });
  });

  // ── 8. Malformed / unexpected response ───────────────────────────────────

  describe("malformed Pinata response", () => {
    it("throws PinataError when response body is not valid JSON", async () => {
      globalThis.fetch = mockFetchBadJson();

      await assert.rejects(
        () => uploadMetadata(TEST_METADATA),
        (err) => {
          assert.ok(err instanceof PinataError);
          assert.ok(
            err.message.toLowerCase().includes("json"),
            `Expected JSON in error message, got: "${err.message}"`,
          );
          return true;
        },
      );
    });

    it("throws PinataError when data.cid is missing from response", async () => {
      globalThis.fetch = mockFetchMalformedBody();

      await assert.rejects(
        () => uploadMetadata(TEST_METADATA),
        (err) => {
          assert.ok(err instanceof PinataError);
          assert.ok(
            err.message.toLowerCase().includes("cid"),
            `Expected 'cid' in error message, got: "${err.message}"`,
          );
          return true;
        },
      );
    });
  });

});
