/**
 * src/utils/errors.js
 *
 * Typed application error classes.
 * All carry an HTTP statusCode so the error handler can respond correctly
 * without any format-specific logic living in controllers.
 */

"use strict";

class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode=500]
   */
  constructor(message, statusCode = 500) {
    super(message);
    this.name       = "AppError";
    this.statusCode = statusCode;
  }
}

/**
 * Thrown by parseBody for Content-Type (415), oversized (413), or bad JSON (400).
 */
class ParseError extends AppError {
  constructor(message, statusCode = 400) {
    super(message, statusCode);
    this.name = "ParseError";
  }
}

/**
 * Thrown by validate middleware for invalid payloads (422).
 */
class ValidationError extends AppError {
  constructor(message) {
    super(message, 422);
    this.name = "ValidationError";
  }
}

module.exports = { AppError, ParseError, ValidationError };
