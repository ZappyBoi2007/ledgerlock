# LedgerLock — Backend

> Node.js API server powering the LedgerLock document-notarisation platform.

---

## What this folder is for

`backend/` contains the server-side logic that sits between the **frontend** (React) and the **blockchain / IPFS layer**. It exposes a REST API that the frontend will consume, handles business rules, and orchestrates calls to smart contracts and decentralised storage.

---

## Folder structure

```
backend/
├── contracts/          # Solidity smart contracts + Hardhat toolchain
├── src/
│   ├── config/         # App-wide configuration (env loading, constants)
│   ├── controllers/    # Route handler functions (thin – delegate to services)
│   ├── middleware/     # Express middleware (auth, error handling, logging …)
│   ├── models/         # Data-model definitions (DB schema / plain objects)
│   ├── routes/         # Express router files (one file per resource)
│   ├── services/       # Business logic, external-service wrappers
│   └── utils/          # Shared helper functions / utilities
├── tests/              # Unit and integration tests
├── .env.example        # Environment variable template (copy → .env)
├── .gitignore
├── package.json
└── README.md           # ← you are here
```

---

## Getting started

```bash
# 1. Install dependencies (none yet – this will grow)
npm install

# 2. Set up environment variables
cp .env.example .env
# then edit .env with your values

# 3. Start the dev server (requires nodemon)
npm run dev

# 4. Run tests
npm test
```

---

## Contracts (`backend/contracts/`)

The `contracts/` subfolder will contain:

- **Solidity source files** (`.sol`)
- **Hardhat** configuration, deployment scripts, and tasks
- Test files for on-chain logic

This portion is maintained separately from the Node.js server code and will be initialised with Hardhat when smart-contract development begins.

---

## Planned integrations (not yet implemented)

| Integration | Purpose |
|---|---|
| **IPFS / Pinata** | Decentralised document storage; CID anchored on-chain |
| **Blockchain (Ethers.js)** | Interact with the deployed notarisation contract |
| **Authentication** | JWT-based auth for API routes |
| **Database** | Optional off-chain metadata store |

---

## Team

| Area | Developers |
|---|---|
| Backend API | Keith, Digi |
| Smart Contracts | Keith, Digi |
| Frontend | Carol, Disha |
