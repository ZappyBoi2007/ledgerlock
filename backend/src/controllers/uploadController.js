/**
 * src/controllers/uploadController.js
 *
 * POST /api/v1/upload
 *
 * Pipeline:
 *   1. Parse JSON request body           (parseBody   → 400/413/415)
 *   2. Validate certificate payload      (validate    → 422)
 *   3. Upload to IPFS via Pinata         (pinataService → PinataError)
 *   4. Respond HTTP 201 with CID + URL
 *
 * Errors propagate to app.js → errorHandler; no local error formatting here.
 * The Pinata JWT is never included in any response.
 *
 * Success response shape:
 *   {
 *     "success": true,
 *     "data": {
 *       "cid": "Qm...",
 *       "url": "https://gateway.pinata.cloud/ipfs/Qm..."
 *     }
 *   }
 */

"use strict";

const { parseBody }          = require("../utils/parseBody");
const { validateCertificate } = require("../middleware/validate");
const { uploadMetadata }     = require("../services/pinataService");
const { sendJson }           = require("../utils/response");

/**
 * @param {import('node:http').IncomingMessage}  req
 * @param {import('node:http').ServerResponse}   res
 */
async function handleUpload(req, res) {
  const body   = await parseBody(req);
  const cert   = validateCertificate(body);
  const result = await uploadMetadata(cert);

  sendJson(res, 201, {
    success: true,
    data: {
      cid: result.cid,
      url: result.url,
    },
  });
}

module.exports = { handleUpload };
