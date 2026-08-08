/**
 * deploy.js – Deploys the CertificateRegistry contract.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network <networkName>
 *
 * Example (local Hardhat node):
 *   npx hardhat node                              # terminal 1
 *   npx hardhat run scripts/deploy.js --network localhost  # terminal 2
 */

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying CertificateRegistry...");
  console.log("  Deployer address :", deployer.address);
  console.log(
    "  Deployer balance :",
    (await ethers.provider.getBalance(deployer.address)).toString(),
    "wei"
  );

  const CertificateRegistry = await ethers.getContractFactory("CertificateRegistry");
  const registry = await CertificateRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("  CertificateRegistry deployed to:", address);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Copy the address above into your .env  →  CONTRACT_ADDRESS=", address);
  console.log("  2. Verify on a testnet explorer if needed.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
