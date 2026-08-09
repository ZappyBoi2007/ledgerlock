require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  // Paths – keeps Hardhat test/ separate from the Node.js tests/ scaffold.
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },

  networks: {
    // Default in-memory network used for all Hardhat unit tests (no config needed).
    hardhat: {},

    // Persistent local node — start with `npx hardhat node` in a separate terminal.
    // Account[0] = deployer / admin. Used by deploy.js and register.js scripts.
    // Account[1] = backend wallet (set via BLOCKCHAIN_PRIVATE_KEY in .env).
    localhost: {
      url:      "http://127.0.0.1:8545",
      chainId:  31337,
      accounts: [
        // Account[0] — Hardhat's publicly known deterministic test key. NOT a production secret.
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      ],
    },
  },
};
