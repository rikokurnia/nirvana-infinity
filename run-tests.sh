#!/bin/bash
set -e

PROGRAM_ID="FxPnV48rg9KkK6huUimjcjL9H4xssM8n7j3uva8k9tmc"
WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"

# Node 20+/26 treats yargs' extensionless CJS file as ESM because yargs ships
# "type":"module", crashing mocha at startup ("require is not defined in ES
# module scope). Dropping that field makes .js/extensionless load as CJS while
# .mjs stays ESM. Idempotent; re-applies after any `npm install`.
YARGS_PKG="node_modules/yargs/package.json"
if [ -f "$YARGS_PKG" ] && grep -q '"type": "module"' "$YARGS_PKG"; then
  sed -i '/^  "type": "module",$/d' "$YARGS_PKG"
fi

# Kill any stale validator from a previous crashed run (frees ports 8899/9900).
pkill -f solana-test-validator 2>/dev/null || true
sleep 2

# Load program at the declared ID (keypair in target/deploy may not match declare_id).
solana-test-validator --reset --quiet \
  --bpf-program "$PROGRAM_ID" target/deploy/nirvana.so &
VALIDATOR_PID=$!
sleep 6

# Configure
solana config set --url localhost --keypair "$WALLET" 2>/dev/null

# Fund wallet for tx fees
solana airdrop 100 2>/dev/null

# Run tests. Node 23+/26 strips TS types natively and runs .ts as ESM, which
# bypasses ts-node and breaks type-only imports + __dirname. Disabling it routes
# .ts back through ts-node (CJS, honoring tsconfig "module": "commonjs").
ANCHOR_WALLET="$WALLET" \
ANCHOR_PROVIDER_URL=http://localhost:8899 \
NODE_OPTIONS="--no-experimental-strip-types" \
./node_modules/.bin/ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts

# Kill validator
kill $VALIDATOR_PID 2>/dev/null || true
