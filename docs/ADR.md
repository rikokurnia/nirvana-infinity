# Architecture Decision Records (ADR)

This document captures the important architectural decisions made during the development of the Nirvana Protocol.

## ADR 1: Nonce-Seeded PDAs for Multi-Stream Support

### Context
Originally, the `DistributionState` PDA was seeded with `[b"state", authority.key(), recipient.key()]`. This caused a collision issue where a founder could only have one active stream with a specific recipient at any given time. If they tried to create a second stream to the same recipient before the first one was closed, the transaction would fail because the PDA was already in use.

### Decision
We added an 8-byte little-endian `nonce` (`u64`) to the `DistributionState` PDA seeds:
`[b"state", authority.key().as_ref(), recipient.key().as_ref(), &nonce.to_le_bytes()]`.

### Consequences
* **Pros:** A single founder/recipient pair can have unlimited concurrent streams. The frontend can simply generate a unique nonce (e.g., timestamp or monotonic counter) for each new stream.
* **Cons:** The client now must remember and pass the correct `nonce` when deriving the PDA to interact with an existing stream (e.g., when calling `withdraw` or `cancel`). The frontend solves this by reading the `nonce` directly from the on-chain `DistributionState` accounts returned by `program.account.distributionState.all()`.

---

## ADR 2: Vault Auto-Close on Cancel

### Context
When a stream was cancelled, the protocol would calculate the split between the recipient and the creator, transfer the tokens accordingly, and set `is_cancelled = true` on the state account. However, the SPL `TokenAccount` (the vault) remained alive on-chain with a zero balance.

### Decision
We updated the `cancel` instruction to fully close the vault SPL `TokenAccount` by invoking the `token::close_account` CPI, sending the rent lamports back to the `authority` (founder), and subsequently closing the `DistributionState` PDA (`close = authority`).

### Consequences
* **Pros:** Clean on-chain state. No empty vault accounts or state accounts are left hanging forever. It refunds ~0.0087 SOL in rent back to the creator, reducing the cost of using the protocol.
* **Cons:** If there are older "orphaned" vaults from before this upgrade, they need a separate cleanup path, which is why the `release_vault` instruction was introduced to handle legacy state.

---

## ADR 3: Dual Arbiter/Authority for Milestone Triggering

### Context
A core feature of the Nirvana Protocol is the "milestone" amount, which only unlocks when a specific real-world or on-chain event occurs. We needed a way to securely flag `milestone_achieved = true`.

### Decision
We introduced an optional `arbiter` field (a `Pubkey`) during stream creation. In the `trigger_milestone` instruction, we assert that the `triggerer` is either the `authority` (the stream creator) OR the designated `arbiter`. If no arbiter is needed, `Pubkey::default()` is passed.

### Consequences
* **Pros:** Provides flexibility. A founder can manually approve the milestone themselves, or they can designate a third-party oracle, a multisig wallet, or an automated bot as the `arbiter` to trigger the milestone trustlessly.
* **Cons:** Slightly increases the size of the `DistributionState` account (by 32 bytes for the `arbiter` pubkey), but the cost is negligible compared to the utility gained.
