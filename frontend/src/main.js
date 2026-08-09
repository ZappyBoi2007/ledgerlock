/**
 * LedgerLock Frontend — main.js
 *
 * Vanilla JS SPA with two tabs:
 *   1. Notarise — upload certificate metadata to IPFS + issue on blockchain
 *   2. Verify   — look up a certificate ID on-chain and display its status
 *
 * API base: http://localhost:3000
 * No frameworks, no build-time env injection — just fetch().
 */

import "./style.css";

const API = "http://localhost:3000";

// ─── Utility helpers ──────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = orig; btn.classList.remove("copied"); }, 2000);
  } catch {
    btn.textContent = "Failed";
    setTimeout(() => { btn.textContent = "Copy"; }, 2000);
  }
}

function dataField(label, value, copyable = false) {
  const copyBtn = copyable
    ? `<button class="copy-btn" data-copy="${esc(value)}">Copy</button>`
    : "";
  return `
    <div class="data-field">
      <div class="data-label">${esc(label)}</div>
      <div class="data-value">
        <span>${esc(value)}</span>
        ${copyBtn}
      </div>
    </div>`;
}

// Attach copy handlers after injecting HTML
function bindCopyButtons(container) {
  container.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => copyText(btn.dataset.copy, btn));
  });
}

// ─── Render functions ─────────────────────────────────────────────────────────

function renderLoading(message = "Processing…") {
  return `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>${esc(message)}</p>
    </div>`;
}

function renderError(title, message) {
  return `
    <div class="result-error">
      <div class="result-header">
        <div class="result-icon">✗</div>
        <div>
          <h3>${esc(title)}</h3>
          <p>${esc(message)}</p>
        </div>
      </div>
    </div>`;
}

function renderVerifySuccess(data) {
  const validityBadge = data.valid
    ? `<span class="validity-badge valid">✓ Valid</span>`
    : `<span class="validity-badge revoked">✗ Revoked</span>`;

  const html = data.valid
    ? `<div class="result-success">`
    : `<div class="result-error">`;

  return `
    ${html}
      <div class="result-header">
        <div class="result-icon">${data.valid ? "✓" : "✗"}</div>
        <div>
          <h3>${data.valid ? "Certificate Verified" : "Certificate Revoked"}</h3>
          <p>On-chain verification complete</p>
        </div>
      </div>
      <div class="data-grid">
        <div class="data-field">
          <div class="data-label">Status</div>
          <div class="data-value"><span>${validityBadge}</span></div>
        </div>
        ${dataField("Certificate ID", data.certId, true)}
        ${dataField("Issuer Address", data.issuer, true)}
        ${dataField("IPFS CID", data.ipfsCid, true)}
      </div>
    </div>`;
}

function renderNotariseSuccess(data) {
  return `
    <div class="result-success">
      <div class="result-header">
        <div class="result-icon">✓</div>
        <div>
          <h3>Certificate Notarised!</h3>
          <p>Uploaded to IPFS and anchored on the blockchain</p>
        </div>
      </div>
      <div class="data-grid">
        ${dataField("Certificate ID", data.certId ?? "Pending — check blockchain", data.certId != null)}
        ${dataField("Transaction Hash", data.txHash, true)}
        ${dataField("IPFS CID", data.cid, true)}
        ${dataField("IPFS URL", data.url, true)}
      </div>
      <div class="info-box">
        <span class="info-box-icon">💡</span>
        <span>Save the Certificate ID above — share it with the certificate holder so they can verify it anytime.</span>
      </div>
    </div>`;
}

// ─── Page skeleton ────────────────────────────────────────────────────────────

document.querySelector("#app").innerHTML = `
  <div class="app">

    <header class="header">
      <div class="header-brand">
        <div class="logo">L</div>
        <div>
          <h1>LedgerLock</h1>
          <p>Blockchain Certificate Notarisation</p>
        </div>
      </div>
      <div class="header-badge">
        <div class="status-dot"></div>
        Blockchain Active
      </div>
    </header>

    <main class="main">

      <div class="hero">
        <div class="hero-tag">⛓ Powered by Ethereum + IPFS</div>
        <h2>Tamper-Proof<br>Certificate Trust</h2>
        <p>Notarise credentials on the blockchain and verify their authenticity instantly — no intermediaries required.</p>
      </div>

      <div class="tabs" role="tablist">
        <button class="tab-btn active" role="tab" data-tab="verify" id="tab-verify">
          🔍 Verify Certificate
        </button>
        <button class="tab-btn" role="tab" data-tab="notarise" id="tab-notarise">
          📜 Notarise Certificate
        </button>
      </div>

      <!-- ── VERIFY TAB ── -->
      <div class="tab-panel active" id="panel-verify">
        <div class="card">
          <h2 class="card-title">Verify a Certificate</h2>
          <p class="card-subtitle">Enter the on-chain certificate ID to check its authenticity and status.</p>

          <div class="form-group">
            <label for="verify-cert-id">Certificate ID (bytes32 hex)</label>
            <input
              id="verify-cert-id"
              type="text"
              placeholder="0x1a2b3c4d…"
              autocomplete="off"
              spellcheck="false"
            />
          </div>

          <button class="btn btn-primary" id="verify-btn">
            🔍 Verify on Blockchain
          </button>

          <div class="result-area" id="verify-result"></div>
        </div>
      </div>

      <!-- ── NOTARISE TAB ── -->
      <div class="tab-panel" id="panel-notarise">
        <div class="card">
          <h2 class="card-title">Notarise a Certificate</h2>
          <p class="card-subtitle">Upload certificate metadata to IPFS and anchor it on the blockchain.</p>

          <div class="form-row">
            <div class="form-group">
              <label for="holder">Certificate Holder *</label>
              <input id="holder" type="text" placeholder="e.g. Alice Johnson" />
            </div>
            <div class="form-group">
              <label for="course">Course / Award *</label>
              <input id="course" type="text" placeholder="e.g. Blockchain 101" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="grade">Grade</label>
              <input id="grade" type="text" placeholder="e.g. A+" />
            </div>
            <div class="form-group">
              <label for="institution">Institution</label>
              <input id="institution" type="text" placeholder="e.g. MIT" />
            </div>
          </div>

          <div class="form-group">
            <label for="notes">Additional Notes</label>
            <textarea id="notes" placeholder="Optional: any additional information…"></textarea>
          </div>

          <div class="info-box" style="margin-bottom:20px; margin-top:0">
            <span class="info-box-icon">ℹ️</span>
            <span>The backend wallet must be a <strong>registered institution</strong> in the smart contract before notarisation succeeds. Contact your admin to register the wallet address.</span>
          </div>

          <button class="btn btn-primary" id="notarise-btn">
            📜 Notarise on Blockchain
          </button>

          <div class="result-area" id="notarise-result"></div>
        </div>
      </div>

      <!-- ── Feature callouts ── -->
      <div class="features">
        <div class="feature">
          <div class="feature-icon">🔐</div>
          <h3>Cryptographically Secured</h3>
          <p>Every certificate is hashed and stored on Ethereum — impossible to forge or alter.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">🌐</div>
          <h3>Decentralised Storage</h3>
          <p>Certificate metadata lives on IPFS — no central server can take it down.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">⚡</div>
          <h3>Instant Verification</h3>
          <p>Anyone can verify a certificate in seconds with just the certificate ID.</p>
        </div>
      </div>

    </main>
  </div>
`;

// ─── Tab switching ─────────────────────────────────────────────────────────────

const tabBtns   = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabBtns.forEach((b) => b.classList.remove("active"));
    tabPanels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
  });
});

// ─── Verify logic ─────────────────────────────────────────────────────────────

const verifyBtn    = document.getElementById("verify-btn");
const verifyCertId = document.getElementById("verify-cert-id");
const verifyResult = document.getElementById("verify-result");

verifyBtn.addEventListener("click", async () => {
  const certId = verifyCertId.value.trim();

  if (!certId) {
    verifyResult.innerHTML = renderError("Input Required", "Please enter a certificate ID.");
    return;
  }

  verifyResult.innerHTML = renderLoading("Querying blockchain…");
  verifyBtn.disabled = true;

  try {
    const res  = await fetch(`${API}/api/v1/certificates/${encodeURIComponent(certId)}`);
    const json = await res.json();

    if (!res.ok) {
      verifyResult.innerHTML = renderError(
        res.status === 422 ? "Invalid Certificate ID" : "Verification Failed",
        json.error || "An error occurred. Please try again.",
      );
    } else {
      verifyResult.innerHTML = renderVerifySuccess(json.data);
      bindCopyButtons(verifyResult);
    }
  } catch (err) {
    verifyResult.innerHTML = renderError(
      "Connection Error",
      "Could not reach the backend. Make sure the API server is running on port 3000.",
    );
  } finally {
    verifyBtn.disabled = false;
  }
});

// Allow Enter key to trigger verification
verifyCertId.addEventListener("keydown", (e) => {
  if (e.key === "Enter") verifyBtn.click();
});

// ─── Notarise logic ───────────────────────────────────────────────────────────

const notariseBtn    = document.getElementById("notarise-btn");
const notariseResult = document.getElementById("notarise-result");

notariseBtn.addEventListener("click", async () => {
  const holder      = document.getElementById("holder").value.trim();
  const course      = document.getElementById("course").value.trim();
  const grade       = document.getElementById("grade").value.trim();
  const institution = document.getElementById("institution").value.trim();
  const notes       = document.getElementById("notes").value.trim();

  if (!holder || !course) {
    notariseResult.innerHTML = renderError(
      "Missing Required Fields",
      "Holder name and Course are required.",
    );
    return;
  }

  const certificate = { holder, course };
  if (grade)       certificate.grade       = grade;
  if (institution) certificate.institution = institution;
  if (notes)       certificate.notes       = notes;

  notariseResult.innerHTML = renderLoading("Uploading to IPFS…");
  notariseBtn.disabled = true;

  try {
    const res  = await fetch(`${API}/api/v1/certificates`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ certificate }),
    });

    const json = await res.json();

    if (!res.ok) {
      let errTitle = "Notarisation Failed";
      if (res.status === 502) errTitle = "Upstream Service Error";
      if (res.status === 422) errTitle = "Invalid Certificate Data";
      notariseResult.innerHTML = renderError(errTitle, json.error || "An error occurred.");
    } else {
      notariseResult.innerHTML = renderNotariseSuccess(json.data);
      bindCopyButtons(notariseResult);
    }
  } catch (err) {
    notariseResult.innerHTML = renderError(
      "Connection Error",
      "Could not reach the backend. Make sure the API server is running on port 3000.",
    );
  } finally {
    notariseBtn.disabled = false;
  }
});
