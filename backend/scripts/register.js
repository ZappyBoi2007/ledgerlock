/**
 * scripts/register.js
 *
 * One-shot admin script: registers the backend wallet as a verified
 * institution in the deployed CertificateRegistry contract.
 *
 * Must be run AFTER deploy.js and AFTER CONTRACT_ADDRESS is set in .env.
 *
 * Usage:
 *   npx hardhat run scripts/register.js --network localhost
 *
 * Reads CONTRACT_ADDRESS from process.env (via .env loaded by dotenv).
 * Uses Account[0] (deployer / admin) to call registerInstitution().
 */

require("dotenv").config();
const { ethers } = require("hardhat");

// Minimal ABI — only the functions this script needs.
const ABI = [
  "function admin() external view returns (address)",
  "function institutions(address) external view returns (bool registered, string memory name)",
  "function registerInstitution(address institution, string calldata name) external",
  "event InstitutionRegistered(address indexed institution, string name)",
];

// Account[1] — the backend signing wallet that will be the institution.
// This is Hardhat's well-known deterministic test key (not a production secret).
const BACKEND_WALLET_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const INSTITUTION_NAME       = "LedgerLock Demo Institution";

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.error("ERROR: CONTRACT_ADDRESS is not set in .env");
    console.error("  Run deploy.js first, then set CONTRACT_ADDRESS in backend/.env");
    process.exit(1);
  }

  // Account[0] = admin (deployer). Hardhat provides this via --network localhost.
  const [admin] = await ethers.getSigners();
  console.log("Admin (deployer) address :", admin.address);
  console.log("Contract address         :", contractAddress);
  console.log("Registering institution  :", BACKEND_WALLET_ADDRESS);
  console.log("Institution name         :", INSTITUTION_NAME);
  console.log("");

  const registry = new ethers.Contract(contractAddress, ABI, admin);

  // Confirm we are actually the admin.
  const onChainAdmin = await registry.admin();
  if (onChainAdmin.toLowerCase() !== admin.address.toLowerCase()) {
    console.error(`ERROR: Account[0] (${admin.address}) is not the contract admin (${onChainAdmin}).`);
    console.error("  Make sure you deployed with Account[0] and are using --network localhost.");
    process.exit(1);
  }

  // Check if already registered (idempotent re-run).
  const { registered, name } = await registry.institutions(BACKEND_WALLET_ADDRESS);
  if (registered) {
    console.log(`Institution already registered as "${name}". Nothing to do.`);
    return;
  }

  // Register.
  const tx = await registry.registerInstitution(BACKEND_WALLET_ADDRESS, INSTITUTION_NAME);
  console.log("Transaction sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("Transaction confirmed in block:", receipt.blockNumber);

  // Verify.
  const after = await registry.institutions(BACKEND_WALLET_ADDRESS);
  if (after.registered) {
    console.log("");
    console.log("✓ Institution registered successfully!");
    console.log("  Address :", BACKEND_WALLET_ADDRESS);
    console.log("  Name    :", after.name);
    console.log("");
    console.log("The backend server (BLOCKCHAIN_PRIVATE_KEY=Account[1]) can now issue certificates.");
  } else {
    console.error("ERROR: Registration transaction confirmed but institution still shows as unregistered.");
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Registration failed:", err.message ?? err);
    process.exit(1);
  });
