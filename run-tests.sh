#!/bin/bash
set -e

# Start validator
solana-test-validator --reset --quiet &
sleep 6

# Configure
solana config set --url localhost --keypair /home/cokoo/.config/solana/mandora-devnet.json 2>/dev/null

# Fund and deploy
solana airdrop 100 2>/dev/null
solana program deploy target/deploy/nirvana.so --program-id target/deploy/nirvana-keypair.json 2>/dev/null

# Run tests
ANCHOR_WALLET=/home/cokoo/.config/solana/mandora-devnet.json \
ANCHOR_PROVIDER_URL=http://localhost:8899 \
./node_modules/.bin/ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
