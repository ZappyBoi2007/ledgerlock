/**
 * src/middleware/validate.js
 *
 * Certificate payload validator.
 * Completely independent of Pinata, blockchain, and HTTP routing.
 *
 * Expected payload shape:
 *   {
 *     "certificate": {
 *       "holder": "Alice",
 *       "course": "Blockchain 101",
 *       "grade":  "A"
 *     }
 *   }
 *
 * Rules enforced:
 *   1. `certificate` key must be present.
 *   2. `certificate` must be a non-null plain object (not array).
 *   3. `certificate` must contain at least one field.
 *
 * Throws ValidationError (HTTP 422) on any violation.
 */

"use strict";

const { ValidationError } = require("../utils/errors");

/**
 * Validate the parsed request body and return the certificate sub-object.
 *
 * @param {object} body  Parsed request body.
 * @returns {object}     The validated `certificate` object.
 * @throws {ValidationError}
 */
function validateCertificate(body) {
  // 1. key must exist
  if (!body || !Object.prototype.hasOwnProperty.call(body, "certificate")) {
    throw new ValidationError(
      'Request body must contain a "certificate" field',
    );
  }

  const cert = body.certificate;

  // 2. must be a non-null plain object (not array, not primitive)
  if (cert === null || typeof cert !== "object" || Array.isArray(cert)) {
    throw new ValidationError(
      '"certificate" must be a non-null plain object',
    );
  }

  // 3. must have at least one field
  if (Object.keys(cert).length === 0) {
    throw new ValidationError(
      '"certificate" must contain at least one field',
    );
  }

  return cert;
}

module.exports = { validateCertificate };
