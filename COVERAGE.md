# Nirvana Protocol — Test Coverage Report (Week 7)

**Suite:** `tests/nirvana.ts` (core features) + `tests/nirvana-edge-security.ts` (edge + security)
**Result:** **40 passing / 0 failing**
**Coverage:** **91.7% of all branches** (33/36) — **100% of reachable branches** (3 branches are defensively-unreachable, see notes).

## Why a branch matrix instead of line-coverage tooling

These are Anchor **integration** tests: the program runs as compiled BPF inside `solana-test-validator`, not as instrumented host code, so Rust line-coverage tools (`tarpaulin`, `llvm-cov`) cannot observe execution. The accepted approach for Anchor programs is a **branch coverage matrix**: enumerate every happy path and every `require!`/guard in the program, then map each to the test that exercises it. That is what follows.

## How to reproduce

```bash
# Terminal 1
solana-test-validator --reset \
  --bpf-program FxPnV48rg9KkK6huUimjcjL9H4xssM8n7j3uva8k9tmc target/deploy/nirvana.so
# Terminal 2
ANCHOR_PROVIDER_URL=http://localhost:8899 ANCHOR_WALLET=~/.config/solana/id.json npm test
```

## Branch Matrix

### `create_stream` — 6/6 ✅
| Branch | Test |
|---|---|
| Happy path: init state + fund vault | `Task 1: Create Stream` |
| `InvalidTimeRange` (end ≤ start) | `should fail ... invalid time range` |
| `InvalidCliff` (cliff outside [start,end]) | `should fail ... invalid cliff` |
| `StartTimeInPast` | `should fail ... start time in past` |
| `MathOverflow` (deposit sum overflows u64) | `edge: create_stream rejects amounts that overflow u64` |
| `ZeroDepositAmount` (total == 0) | `should fail ... zero deposit` |

### `withdraw` — 7/8 ✅ (1 defensively-unreachable)
| Branch | Test |
|---|---|
| Happy path: transfer + update `claimed_amount` | `integration: create -> wait -> withdraw -> verify exact balances` |
| `StreamCancelled` (state closed) | `should fail to withdraw from cancelled stream` |
| `CliffNotReached` | `should fail to withdraw before cliff` |
| Linear cap when `now > end_time` | `should allow full withdrawal after stream end` |
| Milestone added when achieved | `Task 2: Trigger Milestone & Partial Withdraw` |
| `NothingToWithdraw` | `should fail to withdraw with nothing to withdraw` / `edge: double withdraw` |
| Wrong-mint token account rejected | `security: withdraw with a wrong-mint token account is rejected` |
| `total_duration == 0` immediate-unlock branch | *Unreachable: `create_stream` enforces `end_time > start_time`, so duration is always > 0. Defensive only.* |

### `cancel` — 8/8 ✅
| Branch | Test |
|---|---|
| Happy path: split + close state + close vault | `Task 4: Cancel Stream (Secure Fund Splitting)` |
| `AlreadyCancelled` (state closed) | `should fail to cancel already cancelled stream` |
| `FullyVested` (now ≥ end_time) | `should fail to cancel after fully vested` / `edge: cancel at/after end` |
| Before cliff → recipient gets 0 | `should return all tokens to creator when cancelled before cliff` |
| Past cliff → linear+cliff split | `should split tokens correctly when cancelled mid-stream` |
| Milestone-achieved split | `should split ... with milestone triggered` |
| `recipient_share > 0` transfer | mid-stream split tests |
| `creator_share > 0` transfer | before-cliff + mid-stream tests |

### `trigger_milestone` — 6/6 ✅
| Branch | Test |
|---|---|
| Happy path: authority triggers | `Task 2` |
| Happy path: arbiter triggers | `should let a designated arbiter trigger the milestone` |
| `Unauthorized` (neither authority nor arbiter) | `should reject milestone trigger from an unrelated signer` |
| `StreamCancelled` | `should fail to trigger milestone on cancelled stream` |
| `MilestoneAlreadyAchieved` | `should fail to trigger milestone twice` |
| `StreamExpired` (now > end_time) | `should fail to trigger milestone after stream expired` |

### `top_up` — 6/6 ✅
| Branch | Test |
|---|---|
| Happy path: add base + extend end | `should add base funds and extend the end time via top_up` |
| `NothingToTopUp` (no add, no extend) | `should reject a top_up that neither adds funds nor extends` |
| Unauthorized signer (`has_one`) | `security: only the authority can top_up` |
| `InvalidExtension` (new end ≤ current) | `security: top_up rejects an end time earlier than the current one` |
| `FullyVested` (now ≥ end_time) | `edge: top_up on a fully-vested stream is rejected` |
| `StreamCancelled` (state closed) | `security: top_up on a cancelled stream is rejected` |

### `release_vault` — 0/2 ⚠️ (legacy / unreachable — documented)
| Branch | Status |
|---|---|
| Happy path: sweep an orphaned legacy vault | *Unreachable for nonce-era streams. Uses pre-nonce seeds `["state", authority, recipient]`; `cancel` now closes vaults so no new orphans exist. See `SECURITY.md` Finding F3.* |
| `StreamStillActive` (state account not empty) | *Same — cannot be exercised without a pre-nonce orphan.* |

## Tally

| Instruction | Covered / Total | Notes |
|---|---|---|
| `create_stream` | 6 / 6 | |
| `withdraw` | 7 / 8 | 1 defensive (unreachable) |
| `cancel` | 8 / 8 | |
| `trigger_milestone` | 6 / 6 | |
| `top_up` | 6 / 6 | |
| `release_vault` | 0 / 2 | legacy migration, unreachable |
| **Total** | **33 / 36 = 91.7%** | |
| **Reachable only** | **33 / 33 = 100%** | excludes 3 defensively-unreachable branches |

**KPI met:** coverage > 80% (91.7% all-branch, 100% reachable), no critical security issues (`SECURITY.md`).
