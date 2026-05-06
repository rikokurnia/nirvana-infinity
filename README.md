<img width="4624" height="1059" alt="Banner Nirvana" src="https://github.com/user-attachments/assets/aa3e0f91-8022-470f-af68-575d78e64414" />


# 🎋 Nirvana Protocol: Equity-Streaming Engine

Nirvana is a specialized Solana program designed for **Equity-Streaming**, a hybrid distribution model that synchronizes continuous linear token unlocks with event-driven performance milestones. 

This project solves the "Gamble vs. Cashflow" dilemma for Web3 contributors by providing guaranteed liquidity (Base Layer) alongside performance-based rewards (Milestone Layer).

## 🚀 Quick Start (Under 15 Minutes)

### 1. Prerequisites
Before setting up, ensure you have the following installed:
* **Rust**: `rustc 1.75.0` or later
* **Solana CLI**: `solana-cli 3.1.0` or later (Agave)
* **Anchor CLI**: `anchor-cli 1.0.0`
* **Node.js**: `v18.18.0` or later
* **NPM**

### 2. Local Setup
Clone the repository and install dependencies:

```bash
git clone https://github.com/soraonchain-byte/Nirvana.git
cd Nirvana
npm install
```

---

### 3. Build & Compile
To compile the smart contract and generate the IDL:

```bash
anchor build
```

Note: This will generate the `target/` folder containing the program binary (`nirvana.so`) and IDL (`nirvana_protocol.json`).

### 4. Running Tests

**Option A: Manual (recommended)**

```bash
# Terminal 1: Start local validator
solana-test-validator --reset

# Terminal 2: Deploy and test
solana config set --url localhost --keypair ~/.config/solana/id.json
solana airdrop 100
solana program deploy target/deploy/nirvana.so --program-id target/deploy/nirvana-keypair.json
ANCHOR_WALLET=~/.config/solana/id.json \
ANCHOR_PROVIDER_URL=http://localhost:8899 \
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

**Option B: Anchor test**

Remove the `[scripts]` section from `Anchor.toml` (if present), then:

```bash
anchor test
```

Note: The test suite validates stream creation, time validation, and token transfers.

---

### 🛠 Project Structure
![alt text](Project-structure.png)

---

## 📑 Program Features
The program implements the following Equity-Streaming architecture:

| Instruction | Description |
|-------------|-------------|
| `create_stream` | Initializes vesting state, transfers tokens to PDA vault |
| `withdraw` | Claims matured tokens (linear + milestone) |
| `cancel` | Terminates stream, pays recipient unlocked portion, refunds creator |
| `trigger_milestone` | Flips `milestone_achieved` flag (oracle/admin only) |

![alt text](Program-features-status.png)

---

## 🌐 Deployment to Devnet

### 1. Configure Solana CLI to Devnet:
```bash
solana config set --url devnet --keypair ~/.config/solana/id.json
```

### 2. Airdrop SOL for gas (if needed):
```bash
solana airdrop 2
```

### 3. Deploy:
```bash
anchor program deploy --provider.cluster devnet
```

Or manually:
```bash
solana program deploy target/deploy/nirvana.so --program-id target/deploy/nirvana-keypair.json
```

---

## 🤖 CI/CD Integration
This repository is equipped with **GitHub Actions**. Every push or pull request triggers a workflow that:
1. Sets up the Solana/Anchor environment.
2. Runs `anchor build` to check for compilation errors.
3. Executes the test suite to ensure no regressions.

---

## 👥 Contributor Roles

* **Sora Onchain (@SoraOnchain)**: Lead Architect. Responsible for manual project initialization, account struct definitions, core instruction scaffolding, and CI pipeline setup.
* **Riko Kurnia (@rikokurnia)**: Frontend Integration & Documentation. Responsible for README verification, local build testing, and frontend workspace setup.

---

## 📜 License
MIT License. Created for Mancer Season 1.
