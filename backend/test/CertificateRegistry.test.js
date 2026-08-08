/**
 * CertificateRegistry.test.js
 *
 * Hardhat / Mocha / Chai test suite for CertificateRegistry.sol
 *
 * Covers all 11 specified behaviours:
 *  1.  deployment sets deployer as admin
 *  2.  admin can register an institution
 *  3.  non-admin cannot register an institution
 *  4.  unregistered institution cannot issue certificates
 *  5.  registered institution can issue a certificate
 *  6.  issued certificate stores the correct IPFS CID
 *  7.  certificate is initially valid
 *  8.  certificate can be verified
 *  9.  only the issuing institution can revoke
 * 10.  revoked certificate becomes invalid
 * 11.  certificateCount returns the correct count
 */

const { expect }  = require("chai");
const { ethers }  = require("hardhat");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Issue a certificate and return the certId emitted by the CertificateIssued
 * event in the real transaction receipt.
 *
 * Why event parsing instead of staticCall?
 *   issueCertificate's certId is computed from block.timestamp and
 *   certificateCount. A staticCall runs in its own EVM snapshot where these
 *   values may differ from the actual transaction, producing a mismatched hash.
 *   Reading from the event guarantees we get the exact certId stored on-chain.
 */
async function issueCert(registry, signer, cid) {
  const tx      = await registry.connect(signer).issueCertificate(cid);
  const receipt = await tx.wait();
  // Find the CertificateIssued log and decode it.
  const iface   = registry.interface;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "CertificateIssued") {
        return parsed.args.certId;
      }
    } catch (_) { /* skip unrelated logs */ }
  }
  throw new Error("CertificateIssued event not found in receipt");
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("CertificateRegistry", function () {
  const INST_NAME = "MIT";
  const TEST_CID  = "QmTestCIDabcdef1234567890";
  const OTHER_CID = "QmAnotherCIDxyz9876543210";

  let registry;
  let admin, institution, other;

  // Deploy a fresh contract before every test to guarantee isolation.
  beforeEach(async function () {
    [admin, institution, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("CertificateRegistry");
    registry = await Factory.deploy();
  });

  // ── 1. Deployment ──────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets deployer as admin", async function () {
      expect(await registry.admin()).to.equal(admin.address);
    });
  });

  // ── 2 & 3. Institution Registration ───────────────────────────────────────

  describe("Institution Registration", function () {
    it("admin can register an institution", async function () {
      // Transaction should emit the event
      await expect(registry.registerInstitution(institution.address, INST_NAME))
        .to.emit(registry, "InstitutionRegistered")
        .withArgs(institution.address, INST_NAME);

      // State should reflect registration
      const inst = await registry.institutions(institution.address);
      expect(inst.registered).to.be.true;
      expect(inst.name).to.equal(INST_NAME);
    });

    it("non-admin cannot register an institution", async function () {
      await expect(
        registry.connect(other).registerInstitution(institution.address, INST_NAME)
      ).to.be.revertedWith("CertificateRegistry: caller is not admin");
    });
  });

  // ── 4–11. Certificate Lifecycle ───────────────────────────────────────────

  describe("Certificate Issuance", function () {
    // Register the institution before each issuance test.
    beforeEach(async function () {
      await registry.registerInstitution(institution.address, INST_NAME);
    });

    it("unregistered institution cannot issue certificates", async function () {
      await expect(
        registry.connect(other).issueCertificate(TEST_CID)
      ).to.be.revertedWith("CertificateRegistry: institution not registered");
    });

    it("registered institution can issue a certificate", async function () {
      await expect(registry.connect(institution).issueCertificate(TEST_CID))
        .to.emit(registry, "CertificateIssued");
    });

    it("issued certificate stores the correct IPFS CID", async function () {
      const certId = await issueCert(registry, institution, TEST_CID);
      const cert   = await registry.certificates(certId);
      expect(cert.ipfsCid).to.equal(TEST_CID);
    });

    it("certificate is initially valid", async function () {
      const certId = await issueCert(registry, institution, TEST_CID);
      const cert   = await registry.certificates(certId);
      expect(cert.valid).to.be.true;
    });

    it("certificate can be verified", async function () {
      const certId = await issueCert(registry, institution, TEST_CID);
      const [valid, issuer, ipfsCid] = await registry.verifyCertificate(certId);
      expect(valid).to.be.true;
      expect(issuer).to.equal(institution.address);
      expect(ipfsCid).to.equal(TEST_CID);
    });

    it("certificateCount returns the correct count", async function () {
      expect(await registry.certificateCount()).to.equal(0n);
      await issueCert(registry, institution, TEST_CID);
      expect(await registry.certificateCount()).to.equal(1n);
      await issueCert(registry, institution, OTHER_CID);
      expect(await registry.certificateCount()).to.equal(2n);
    });
  });

  describe("Certificate Revocation", function () {
    let certId;

    beforeEach(async function () {
      await registry.registerInstitution(institution.address, INST_NAME);
      certId = await issueCert(registry, institution, TEST_CID);
    });

    it("only the issuing institution can revoke", async function () {
      await expect(
        registry.connect(other).revokeCertificate(certId)
      ).to.be.revertedWith("CertificateRegistry: caller is not the issuing institution");
    });

    it("revoked certificate becomes invalid", async function () {
      await registry.connect(institution).revokeCertificate(certId);
      const [valid] = await registry.verifyCertificate(certId);
      expect(valid).to.be.false;
    });
  });
});
