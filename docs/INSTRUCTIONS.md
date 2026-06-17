# Nirvana Protocol - Instruction Reference

This document outlines the six core instructions of the Nirvana Protocol smart contract, detailing their parameters, expected behavior, accounts, and error handling.

---

## 1. `create_stream`

Initializes a new equity-streaming contract and transfers the total token amount into a program-derived vault.

**Parameters:**
- `nonce` (u64): A unique identifier (usually a timestamp) to prevent PDA collisions between the same founder and recipient.
- `base_amount` (u64): The total amount of tokens that will vest linearly over time.
- `cliff_amount` (u64): A lump sum that unlocks instantly once the `cliff_time` is reached.
- `milestone_amount` (u64): An amount that only unlocks if the milestone is triggered.
- `start_time` (i64): Unix timestamp for when linear vesting begins.
- `end_time` (i64): Unix timestamp for when linear vesting ends.
- `cliff_time` (i64): Unix timestamp for when the `cliff_amount` unlocks.
- `arbiter` (Option<Pubkey>): An optional third-party pubkey authorized to trigger the milestone.

**Behavior:**
- Validates that `end_time > start_time`, `cliff_time` is within the stream duration, and `start_time` is not in the past.
- Calculates the `total` deposit (`base_amount + cliff_amount + milestone_amount`).
- Transfers the `total` tokens from the `authority` to the newly initialized PDA `token_vault`.
- Initializes the `DistributionState` PDA.

---

## 2. `withdraw`

Allows the recipient to claim matured tokens (linear vesting + cliff + triggered milestones).

**Parameters:** None (driven by accounts).

**Behavior:**
- Asserts the stream is not cancelled.
- Asserts the current time is `>= cliff_time`.
- Calculates the linearly vested amount based on the elapsed time relative to `start_time` and `end_time`.
- Adds the `cliff_amount`.
- Adds the `milestone_amount` (if `milestone_achieved == true`).
- Subtracts any previously `claimed_amount`.
- Transfers the calculated `claimable` amount from the PDA vault to the recipient's token account.
- Updates the `claimed_amount` on the state account.

---

## 3. `cancel`

Terminates the stream, distributes unlocked funds to the recipient, refunds the remaining balance to the creator, and closes the accounts.

**Parameters:** None (driven by accounts).

**Behavior:**
- Asserts the stream is not already cancelled and is not fully vested (cannot cancel a completed stream).
- Calculates the exact amount unlocked for the recipient up to the current timestamp.
- Transfers the recipient's share to their token account.
- Transfers the remaining unvested tokens back to the `authority` (creator).
- Closes the PDA `token_vault` (SPL TokenAccount) and returns the rent lamports to the `authority`.
- The `DistributionState` PDA is also closed via the Anchor `close = authority` constraint.

---

## 4. `trigger_milestone`

Flips the `milestone_achieved` flag to true, unlocking the milestone portion of the stream.

**Parameters:** None (driven by accounts).

**Behavior:**
- Asserts the `triggerer` signer is either the `authority` or the designated `arbiter`.
- Asserts the stream is not cancelled, not expired, and the milestone hasn't already been achieved.
- Sets `milestone_achieved = true` on the `DistributionState`.

---

## 5. `top_up`

Allows the authority to add more linearly-vesting base funds and/or extend the end time of an active stream.

**Parameters:**
- `additional_base` (u64): Amount of extra tokens to add to the linear vesting pool.
- `new_end_time` (Option<i64>): A new Unix timestamp extending the duration of the stream.

**Behavior:**
- Asserts the stream is active and not fully vested.
- If `new_end_time` is provided, ensures it is greater than the current `end_time` and updates the state.
- If `additional_base > 0`, adds it to `base_amount` and transfers the tokens from the `authority` to the PDA vault.

---

## 6. `release_vault`

A cleanup instruction for orphaned vaults left by streams that were cancelled *before* the auto-close vault upgrade.

**Parameters:** None (driven by accounts).

**Behavior:**
- Asserts that the `DistributionState` PDA no longer exists (`data_is_empty()`), meaning the stream was already cancelled.
- Salvages any leftover tokens in the orphan vault by sending them back to the `authority`.
- Closes the orphan vault SPL TokenAccount and returns rent to the `authority`.

---

## Error Codes Reference

| Error Code | Meaning |
|---|---|
| `InvalidTimeRange` | `end_time` is not strictly greater than `start_time`. |
| `InvalidCliff` | `cliff_time` is outside the bounds of the stream duration. |
| `StartTimeInPast` | Stream `start_time` is older than the current on-chain clock. |
| `ZeroDepositAmount` | Total deposit (`base + cliff + milestone`) equals zero. |
| `Unauthorized` | Triggerer for milestone is neither the authority nor the arbiter. |
| `MilestoneAlreadyAchieved` | The milestone flag is already set to true. |
| `StreamCancelled` | Attempted an action on a cancelled stream. |
| `AlreadyCancelled` | Attempted to cancel a stream that is already cancelled. |
| `FullyVested` | Attempted to cancel or top-up a stream whose `end_time` has passed. |
| `CliffNotReached` | Attempted to withdraw before the `cliff_time`. |
| `NothingToWithdraw` | The calculated claimable amount is zero. |
| `StreamExpired` | Attempted to trigger a milestone after the stream `end_time`. |
| `MathOverflow` | Safe math calculation overflowed or underflowed. |
| `NothingToTopUp` | Attempted to top-up with zero additional base and no new end time. |
| `InvalidExtension` | Attempted to set a new end time that is earlier than the current end time. |
| `StreamStillActive` | Attempted to release an orphaned vault for a stream that is still active. |
