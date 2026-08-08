/**
 * tests/health.test.js
 *
 * Integration tests for GET /api/v1/health.
 * Starts a real local Node HTTP server on an ephemeral port.
 * No Pinata credentials required.
 */

"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http   = require("node:http");

const { createApp } = require("../src/app");

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

// ─── Helper ───────────────────────────────────────────────────────────────────

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: "127.0.0.1", port, path }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        let body;
        try { body = JSON.parse(raw); } catch { body = raw; }
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    }).on("error", reject);
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/v1/health", () => {
  it("returns HTTP 200", async () => {
    const { statusCode } = await get("/api/v1/health");
    assert.equal(statusCode, 200);
  });

  it("returns Content-Type: application/json", async () => {
    const { headers } = await get("/api/v1/health");
    assert.ok(
      headers["content-type"]?.includes("application/json"),
      `Expected application/json, got: ${headers["content-type"]}`,
    );
  });

  it("returns success: true", async () => {
    const { body } = await get("/api/v1/health");
    assert.equal(body.success, true);
  });

  it("returns data.status = 'ok'", async () => {
    const { body } = await get("/api/v1/health");
    assert.equal(body.data?.status, "ok");
  });

  it("returns data.service = 'ledgerlock-backend'", async () => {
    const { body } = await get("/api/v1/health");
    assert.equal(body.data?.service, "ledgerlock-backend");
  });

  it("returns a valid ISO-8601 timestamp", async () => {
    const { body } = await get("/api/v1/health");
    const ts = body.data?.timestamp;
    assert.ok(ts, "timestamp should be present");
    assert.ok(!isNaN(new Date(ts).getTime()), `Invalid timestamp: ${ts}`);
  });

  it("returns 404 for an unknown route", async () => {
    const { statusCode } = await get("/api/v1/unknown");
    assert.equal(statusCode, 404);
  });
});
