<img width="4624" height="1059" alt="Banner Nirvana" src="https://github.com/user-attachments/assets/aa3e0f91-8022-470f-af68-575d78e64414" />


# 🎋 Nirvana Protocol: Equity-Streaming Engine

Nirvana is a specialized Solana program designed for **Equity-Streaming**, a hybrid distribution model that synchronizes continuous linear token unlocks with event-driven performance milestones. 

This project solves the "Gamble vs. Cashflow" dilemma for Web3 contributors by providing guaranteed liquidity (Base Layer) alongside performance-based rewards (Milestone Layer).

## 🚀 Quick Start (Under 15 Minutes)

### 1. Prerequisites
Before setting up, ensure you have the following installed:
* **Rust**: `rustc 1.75.0` or later
* **Solana CLI**: `solana-cli 1.18.0` or later
* **Anchor CLI**: `anchor-cli 0.29.0` or later
* **Node.js**: `v18.18.0` or later
* **Yarn/NPM**

### 2. Local Setup
Clone the repository and install dependencies:

git clone [https://github.com/soraonchain-byte/Nirvana.git](https://github.com/soraonchain-byte/Nirvana.git)
#### cd nirvana
#### yarn install


---
### 3. Build & Compile
To compile the smart contract and generate the IDL:
#### anchor build
Note: This will generate the target folder containing the program's artifacts.

### 4. Running Tests
We use a streamlined testing approach to ensure logic integrity:
#### anchor test

Note: The current test suite validates program deployment and account initialization.

---
### 🛠 Project Structure
![alt text](Project-structure.png)

---

## 📑 Program Features (Week 3 Status)
The program currently implements the following Equity-Streaming architecture:

![alt text](Program-features-status.png)

---

## 🌐 Deployment to Devnet
### 1. Configure Solana CLI to Devnet:
solana config set --url devnet
### 2. Airdrop Sol for Gas (If needed):
solana airdrop 2
### 3. Deploy:
anchor deploy --provider.cluster devnet

---

## 🤖 CI/CD Integration
This repository is equipped with **GitHub Actions**. Every push or pull request triggers a workflow that:
1. Sets up the Solana/Anchor environment.
2. Runs `anchor build` to check for compilation errors.
3. Executes the test suite to ensure no regressions.

---

## 👥 Contributor Roles (Week 3)

* **Sora Onchain (@SoraOnchain)**: Lead Architect. Responsible for manual project initialization, account struct definitions, core instruction scaffolding, and CI pipeline setup.
* **Riko Kurnia (@PartnerUsername)**: Frontend Integration & Documentation. Responsible for README verification, local build testing, and frontend workspace setup.

---

## 📜 License
MIT License. Created for Mancer Season 1.
