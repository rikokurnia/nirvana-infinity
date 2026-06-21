# Testing & CI Guide

This guide covers how to build, run, and maintain the Nirvana Protocol test suite and GitHub Actions pipeline. It complements the [Integration Guide](./INTEGRATION.md) (how to call the program) with developer/CI workflow details.

**Program ID (devnet / local tests):** `FxPnV48rg9KkK6huUimjcjL9H4xssM8n7j3uva8k9tmc`

---

## Prerequisites

| Tool | Version |
|------|---------|
| Rust | 1.75+ |
| Solana CLI (Agave) | 3.1.x |
| Anchor CLI | 1.0.0 |
| Node.js | 18+ (20+ supported with flags below) |
| npm | Latest |

Generate a local wallet if you do not have one:

```bash
solana-keygen new --no-bip39-passphrase -o ~/.config/solana/id.json
```

---

## 1. Build the program

```bash
cd nirvana-infinity
npm install
CARGO_TARGET_DIR=$PWD/target anchor build --ignore-keys
```

**Why `--ignore-keys`?** The program ID in source (`declare_id!`) is the deployed devnet address. Your local `target/deploy/nirvana-keypair.json` may not match. `--ignore-keys` still compiles the `.so` and IDL without requiring a matching keypair.

Artifacts:

- `target/deploy/nirvana.so` — compiled BPF program
- `target/idl/nirvana_protocol.json` — IDL for tests and clients
- `target/types/nirvana_protocol.ts` — TypeScript types

---

## 2. Run tests (recommended)

```bash
chmod +x run-tests.sh
./run-tests.sh
```

**Expected result:** `40 passing` (~3 minutes wall time)

### What `run-tests.sh` does

1. Patches `yargs` for Node 20+ (Mocha startup fix)
2. Stops any stale `solana-test-validator` on ports 8899/9900
3. Starts a fresh validator with the program loaded at the **declared devnet ID** via `--bpf-program` (see [ADR #4](./ADR.md#adr-4-local-testing-via--bpf-program-without-deploy-keypair))
4. Airdrops SOL to your wallet for tx fees
5. Runs `ts-mocha` over `tests/**/*.ts` with `NODE_OPTIONS=--no-experimental-strip-types`
6. Tears down the validator

Environment overrides:

```bash
ANCHOR_WALLET=/path/to/id.json ./run-tests.sh
```

---

## 3. Run tests manually (two terminals)

**Terminal 1 — validator:**

```bash
solana-test-validator --reset \
  --bpf-program FxPnV48rg9KkK6huUimjcjL9H4xssM8n7j3uva8k9tmc \
  target/deploy/nirvana.so
```

**Terminal 2 — Mocha:**

```bash
ANCHOR_WALLET=~/.config/solana/id.json \
ANCHOR_PROVIDER_URL=http://localhost:8899 \
NODE_OPTIONS="--no-experimental-strip-types" \
npm test
```

---

## 4. Test suite structure

| File | Tests | Purpose |
|------|-------|---------|
| `tests/nirvana.ts` | 29 | Core flows: create, withdraw, cancel, milestone, arbiter, `top_up`, validation |
| `tests/nirvana-edge-security.ts` | 11 | Edge cases + security: overflow, double-withdraw, wrong mint, nonce uniqueness, `top_up` guards |

Both files are loaded in one Mocha run (`tests/**/*.ts`). Helpers are self-contained per file so each suite can be read independently.

**Branch coverage matrix:** see [COVERAGE.md](../COVERAGE.md) (91.7% of program branches, 40/40 tests).

**Security checklist:** see [SECURITY.md](../SECURITY.md).

---

## 5. CI pipeline

Workflow: `.github/workflows/main.yml`

On every push/PR to `main`:

1. Install Rust, Solana 3.1.14, Anchor 1.0.0
2. `anchor build --ignore-keys` + verify `.so` and IDL exist
3. `npm install`
4. Generate ephemeral CI wallet
5. `./run-tests.sh` — must report **40 passing**

Typical CI duration: ~10–12 minutes (includes cold Anchor install).

---

## 6. Common issues

| Symptom | Fix |
|---------|-----|
| `require is not defined in ES module scope` (Mocha) | Re-run `./run-tests.sh` (yargs patch) or `npm install` then run again |
| `Identifier 'nextNonce' has already been declared` | Fixed — use current `main`; do not mix old `let nextNonce` with `function nextNonce()` |
| `anchor build` program ID mismatch | Use `--ignore-keys`; do not change `declare_id!` for local builds |
| Tests hang / port in use | `pkill -f solana-test-validator` then re-run |
| Node 23+ type import errors | Set `NODE_OPTIONS=--no-experimental-strip-types` (included in script) |
| Slow suite (~3 min) | Expected — tests use `sleep()` to simulate vesting time on a real validator clock |

---

## 7. Adding new tests

1. Prefer the file that matches scope: core feature → `nirvana.ts`; edge/security → `nirvana-edge-security.ts`
2. Use a monotonic nonce (`nonceCounter++`) for `create_stream` — PDA seeds include 8-byte LE nonce
3. Match error assertions to all Anchor shapes — use an `errText()` helper (see existing tests)
4. Update [COVERAGE.md](../COVERAGE.md) branch matrix if you add a new `require!` guard
5. Run `./run-tests.sh` locally before opening a PR

---

## Related docs

- [Integration Guide](./INTEGRATION.md) — TypeScript snippets for dApp integrators
- [Instruction Reference](./INSTRUCTIONS.md) — parameters, errors, behavior
- [ADR](./ADR.md) — design decisions including local test harness (ADR #4)
