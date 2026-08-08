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
    // Default in-memory network used for all local tests (no config needed).
    hardhat: {},
  },
};
