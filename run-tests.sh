#!/bin/bash
set -e

# Use default Solana wallet
WALLET="/home/cokoo/.config/solana/id.json"

# Start validator
solana-test-validator --reset --quiet &
VALIDATOR_PID=$!
sleep 6

# Configure
solana config set --url localhost --keypair "$WALLET" 2>/dev/null

# Fund and deploy
solana airdrop 100 2>/dev/null
solana program deploy target/deploy/nirvana.so --program-id target/deploy/nirvana-keypair.json 2>/dev/null

# Run tests
ANCHOR_WALLET="$WALLET" \
ANCHOR_PROVIDER_URL=http://localhost:8899 \
./node_modules/.bin/ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts

# Kill validator
kill $VALIDATOR_PID 2>/dev/null || true
