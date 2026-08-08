/**
 * src/utils/response.js
 *
 * Thin helpers for writing consistent JSON responses on Node's
 * raw http.ServerResponse. All JSON responses go through here so
 * headers and format stay uniform.
 */

"use strict";

/**
 * Write a JSON response with correct Content-Type and Content-Length.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {number}  statusCode  HTTP status code.
 * @param {object}  payload     Value to serialize.
 */
function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type":   "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Write a standard error envelope.
 *
 * Shape: { success: false, error: "<message>" }
 *
 * @param {import('node:http').ServerResponse} res
 * @param {number} statusCode
 * @param {string} message
 */
function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { success: false, error: message });
}

module.exports = { sendJson, sendError };
