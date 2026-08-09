# 🔒 LedgerLock

> **Decentralised, Tamper-Proof Certificate Notarisation & Verification Platform**
> Built with Solidity, Hardhat, Ethers.js, IPFS (Pinata), Node.js, and Vite.

---

## 🌟 Overview

**LedgerLock** is a blockchain-based certificate notarisation and verification system designed for educational institutions, certification bodies, and employers. It solves the rampant issue of fraudulent academic and professional credentials by anchoring digital certificates to the **Ethereum blockchain** and **IPFS (InterPlanetary File System)**.

Once notarised by a verified institution, a certificate receives a unique 32-byte cryptographic identifier (`certId`). Anyone in the world can instantly verify the authenticity, status, issuer, and backing IPFS document of any certificate without relying on centralized databases or third-party intermediaries.

---

## 🚀 Key Features

* **⛓️ On-Chain Integrity**: Certificate state is immutable on the Ethereum blockchain via `CertificateRegistry.sol`.
* **🌐 Decentralised Storage**: Certificate document metadata is stored permanently on IPFS via Pinata.
* **🛡️ Institutional Authorization**: Built-in access control limits certificate issuance to verified institution wallets registered by the contract admin.
* **⚡ Instant Public Verification**: One-click verification using the `certId` to fetch live on-chain status (`Valid` / `Revoked`), issuer address, and IPFS link.
* **⚡ Framework-Free Node.js API**: High-performance backend built natively on Node.js `http` module — zero Express overhead, custom routing, and centralized error handling.
* **🔒 Strict Security & Redaction**: Automated key scrubbing ensuring `BLOCKCHAIN_PRIVATE_KEY` and `PINATA_JWT` never leak into logs, error messages, or API responses.
* **🎨 Modern UI**: Vibrant dark glassmorphism design system built with Vite, vanilla JavaScript, and modern CSS.

---

## 🛠️ Architecture & Tech Stack

```
                               ┌─────────────────────────┐
                               │  Vite Vanilla JS Client │
                               │  (http://localhost:5173)│
                               └────────────┬────────────┘
                                            │ HTTP / CORS
                                            ▼
                               ┌─────────────────────────┐
                               │ Native Node.js HTTP API │
                               │  (http://localhost:3000)│
                               └──────┬───────────┬──────┘
                                      │           │
                 ┌────────────────────┘           └────────────────────┐
                 │ Ethers.js v6                                        │ Fetch / Multipart
                 ▼                                                     ▼
┌─────────────────────────────────┐                   ┌─────────────────────────────────┐
│     Ethereum Smart Contract     │                   │           IPFS Gateway          │
│   (CertificateRegistry.sol)     │                   │          (Pinata Cloud)         │
└─────────────────────────────────┘                   └─────────────────────────────────┘
```

* **Smart Contract**: Solidity `^0.8.20` compiled and tested with Hardhat.
* **Blockchain Layer**: Ethers.js `v6` interacting with local Hardhat RPC (`http://127.0.0.1:8545`).
* **Storage Layer**: Pinata IPFS HTTP v3 API.
* **Backend API**: Node.js `http` module, `node:test` test runner.
* **Frontend**: Vanilla JS, CSS3 custom properties, Vite build tool.

---

## 📜 Smart Contract Overview (`CertificateRegistry.sol`)

The `CertificateRegistry` contract implements role-based access control and hash-based certificate tracking:

* **State Structures**:
  * `Institution`: `(bool registered, string name)`
  * `Certificate`: `(address issuer, string ipfsCid, bool valid, uint256 issuedAt)`
* **Core Functions**:
  * `registerInstitution(address institution, string name)`: Admin-only function to register authorized issuers.
  * `issueCertificate(string ipfsCid)`: Issuing function restricted to registered institutions. Returns a unique `bytes32 certId` calculated from `keccak256(msg.sender, ipfsCid, block.timestamp, certificateCount)`.
  * `verifyCertificate(bytes32 certId)`: Public view function returning `(bool valid, address issuer, string memory ipfsCid)`.
  * `revokeCertificate(bytes32 certId)`: Allows the original issuer to revoke a certificate.

---

## 🔌 API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Health check endpoint returning server status and timestamp |
| `POST` | `/api/v1/upload` | Uploads metadata object to Pinata IPFS, returning IPFS CID & gateway URL |
| `POST` | `/api/v1/certificates` | **Notarise Flow**: Uploads metadata to IPFS + issues certificate on-chain |
| `GET` | `/api/v1/certificates/:certId` | **Verify Flow**: Queries smart contract on-chain for validity, issuer, and CID |

---

## 📂 Project Directory Structure

```
ledgerlock/
├── backend/
│   ├── contracts/
│   │   └── CertificateRegistry.sol     # Core Solidity contract
│   ├── scripts/
│   │   ├── deploy.js                   # Hardhat deployment script
│   │   └── register.js                 # Institution registration script
│   ├── src/
│   │   ├── config/                     # Environment configuration loader
│   │   ├── controllers/                # Request handlers (certificate, health, upload)
│   │   ├── middleware/                 # Error handler, validation, CORS
│   │   ├── routes/                     # Custom exact & prefix router registry
│   │   ├── services/                   # blockchainService.js & pinataService.js
│   │   ├── utils/                      # Body parser, error types, JSON response helpers
│   │   ├── app.js                      # HTTP server factory
│   │   └── index.js                    # Application entry point
│   ├── test/                           # Hardhat smart contract tests (11 passing)
│   ├── tests/                          # Backend API integration unit tests (82 passing)
│   ├── hardhat.config.js               # Hardhat environment config
│   └── package.json
├── frontend/
│   ├── index.html                      # HTML5 entry with Google Fonts
│   ├── src/
│   │   ├── main.js                     # SPA logic (Verify + Notarise tabs)
│   │   └── style.css                   # Glassmorphism dark design system
│   └── package.json
└── README.md
```

---

## 🚦 Quick Start Guide

### 1. Prerequisites
* **Node.js** (v18 or higher recommended)
* **npm** (v9 or higher)

### 2. Environment Setup

Create `.env` inside `backend/` based on `backend/.env.example`:

```bash
# backend/.env
PORT=3000
NODE_ENV=development

RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337

# Account[1] from Hardhat test node
BLOCKCHAIN_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# Populated after deploy
CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3

# Your Pinata JWT Token
PINATA_JWT=your_pinata_jwt_here
PINATA_GATEWAY=https://gateway.pinata.cloud
PINATA_API_URL=https://uploads.pinata.cloud/v3/files

ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### 3. Start Local Hardhat Blockchain & Deploy Contract

```bash
# Terminal 1: Start local node
cd backend
npx hardhat node

# Terminal 2: Deploy Contract & Register Backend Institution
cd backend
npx hardhat run scripts/deploy.js --network localhost
# Copy output address into backend/.env (CONTRACT_ADDRESS=...)

npx hardhat run scripts/register.js --network localhost
```

### 4. Launch Backend API Server

```bash
# Terminal 2 (continued)
cd backend
node src/index.js
# Backend running on http://localhost:3000
```

### 5. Launch Frontend Application

```bash
# Terminal 3: Start Vite server
cd frontend
npm run dev
# Frontend running on http://localhost:5173
```

---

## 🧪 Running Tests

 LedgerLock maintains 100% test coverage across both smart contract logic and backend API endpoints:

```bash
# Run Smart Contract Unit Tests (Hardhat / Mocha)
cd backend
npx hardhat test
# Output: 11 passing

# Run Full Backend Integration Suite (Native Node.js Test Runner)
cd backend
node --test tests/health.test.js tests/pinataService.test.js tests/upload.test.js tests/blockchainService.test.js tests/certificateController.test.js
# Output: 82 passing (0 failing)
```

---

## 🛡️ Security Highlights

1. **Zero Exposure of Credentials**: The client application communicates strictly with backend proxy endpoints. Private keys (`BLOCKCHAIN_PRIVATE_KEY`) and API tokens (`PINATA_JWT`) never leave the backend environment.
2. **Error Message Redaction**: `blockchainService.js` includes an error sanitiser that scrubs raw private key strings from exception messages before bubbling them to HTTP handlers.
3. **CORS Control**: Strict origin checking for `http://localhost:5173` with OPTIONS preflight handling.

---

## 📝 License

Distributed under the **MIT License**. See `LICENSE` for more information.
