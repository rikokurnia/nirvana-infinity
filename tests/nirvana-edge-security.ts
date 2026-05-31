// Week 7 — Edge case & security test suite for the Nirvana Protocol.
//
// Companion to tests/nirvana.ts (the core feature suite). This file targets the
// boundary conditions and adversarial scenarios from the Week 7 acceptance
// criteria that the core suite did not cover:
//   - exactly-at-cliff withdraw, cancel at/after end, double-withdraw (no double-spend)
//   - integer-overflow guard on create_stream
//   - PDA/nonce uniqueness (two concurrent streams to the same recipient)
//   - signer-authority on top_up, account-ownership (wrong mint) on withdraw
//
// Helpers are intentionally self-contained (mirrors nirvana.ts) so this file can
// be read and run on its own.

import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import {
  createMint,
  createAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

// Collect every shape Anchor can surface a failure as (parsed code, message,
// toString, raw logs) so a test matches whichever form is produced.
function errText(err: any): string {
  const logs = Array.isArray(err?.logs) ? err.logs.join("\n") : "";
  return [
    err?.error?.errorCode?.code ?? "",
    err?.message ?? "",
    typeof err?.toString === "function" ? err.toString() : "",
    logs,
  ].join(" || ");
}

// Unauthorized signer => wrong PDA seeds, so Anchor rejects on ConstraintSeeds
// (before, or instead of, the has_one ConstraintHasOne).
const UNAUTHORIZED =
  /ConstraintSeeds|ConstraintHasOne|seeds constraint|has one constraint/i;

// Mismatched SPL mint on a token account constraint.
const WRONG_MINT =
  /ConstraintTokenMint|ConstraintAssociated|token mint|constraint was violated/i;

// A cancelled stream's state account is closed, so any later instruction
// referencing it fails at account load rather than at a logic guard.
const CANCELLED_ACCOUNT_GONE =
  /AccountNotInitialized|AccountOwnedByWrongProgram|caused by account: distribution|does not exist|has been closed/i;

describe("Nirvana Protocol - Edge Cases & Security", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idlPath = path.join(__dirname, "../target/idl/nirvana_protocol.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8")) as Idl;
  const program = new Program(idl, provider);

  let mint: anchor.web3.PublicKey;
  const mintAuthority = anchor.web3.Keypair.generate();

  // Monotonic nonce source — matches the 8-byte LE nonce seed in the program.
  let nonceCounter = Date.now();
  const nextNonce = () => new anchor.BN(nonceCounter++);

  async function airdrop(pubkey: anchor.web3.PublicKey, amount: number) {
    const sig = await provider.connection.requestAirdrop(pubkey, amount);
    const bh = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: bh.blockhash,
      lastValidBlockHeight: bh.lastValidBlockHeight,
      signature: sig,
    });
  }

  async function getTokenBalance(pubkey: anchor.web3.PublicKey): Promise<number> {
    try {
      const bal = await provider.connection.getTokenAccountBalance(pubkey);
      return bal.value.uiAmount ?? 0;
    } catch {
      return 0;
    }
  }

  before(async () => {
    await airdrop(mintAuthority.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL);
    mint = await createMint(
      provider.connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      6
    );
  });

  async function createStreamPair() {
    const authority = anchor.web3.Keypair.generate();
    const recipient = anchor.web3.Keypair.generate();
    await airdrop(authority.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await airdrop(recipient.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);

    const authorityTokenAccount = await createAccount(
      provider.connection,
      authority,
      mint,
      authority.publicKey
    );
    const recipientTokenAccount = await createAccount(
      provider.connection,
      recipient,
      mint,
      recipient.publicKey
    );
    await mintTo(
      provider.connection,
      mintAuthority,
      mint,
      authorityTokenAccount,
      mintAuthority.publicKey,
      1_000_000_000
    );
    return { authority, recipient, authorityTokenAccount, recipientTokenAccount };
  }

  // State seeds: [b"state", authority, recipient, nonce_le8]. Vault: [b"vault", state].
  function getPDAs(
    authority: anchor.web3.PublicKey,
    recipient: anchor.web3.PublicKey,
    nonce: anchor.BN
  ) {
    const [statePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("state"),
        authority.toBuffer(),
        recipient.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), statePda.toBuffer()],
      program.programId
    );
    return { statePda, vaultPda };
  }

  async function createStream(params: {
    authority: anchor.web3.Keypair;
    recipient: anchor.web3.PublicKey;
    authorityTokenAccount: anchor.web3.PublicKey;
    baseAmount?: anchor.BN;
    cliffAmount?: anchor.BN;
    milestoneAmount?: anchor.BN;
    startTime?: anchor.BN;
    endTime?: anchor.BN;
    cliffTime?: anchor.BN;
    arbiter?: anchor.web3.PublicKey | null;
    nonce?: anchor.BN;
  }) {
    const now = Math.floor(Date.now() / 1000);
    const baseAmount = params.baseAmount ?? new anchor.BN(100_000_000);
    const cliffAmount = params.cliffAmount ?? new anchor.BN(0);
    const milestoneAmount = params.milestoneAmount ?? new anchor.BN(50_000_000);
    const startTime = params.startTime ?? new anchor.BN(now + 1);
    const endTime = params.endTime ?? new anchor.BN(now + 10);
    const cliffTime = params.cliffTime ?? new anchor.BN(now + 3);
    const arbiter = params.arbiter ?? null;
    const nonce = params.nonce ?? nextNonce();

    const { statePda, vaultPda } = getPDAs(
      params.authority.publicKey,
      params.recipient,
      nonce
    );

    await program.methods
      .createStream(
        nonce,
        baseAmount,
        cliffAmount,
        milestoneAmount,
        startTime,
        endTime,
        cliffTime,
        arbiter
      )
      .accounts({
        authority: params.authority.publicKey,
        recipient: params.recipient,
        tokenMint: mint,
        authorityTokenAccount: params.authorityTokenAccount,
        distributionState: statePda,
        tokenVault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([params.authority])
      .rpc();

    return { statePda, vaultPda, nonce };
  }

  const withdraw = (
    recipient: anchor.web3.Keypair,
    statePda: anchor.web3.PublicKey,
    vaultPda: anchor.web3.PublicKey,
    recipientTokenAccount: anchor.web3.PublicKey
  ) =>
    program.methods
      .withdraw()
      .accounts({
        recipient: recipient.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([recipient])
      .rpc();

  // =========================================================================
  // EDGE CASES
  // =========================================================================

  it("integration: create -> wait -> withdraw -> verify exact balances", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } =
      await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    // base=100, no cliff/milestone, 4s linear window. Sleep past end so the
    // whole 100 is unlocked and the numbers are exact (no clock-drift band).
    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(100_000_000),
      cliffAmount: new anchor.BN(0),
      milestoneAmount: new anchor.BN(0),
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now),
      endTime: new anchor.BN(now + 4),
    });

    const vaultBefore = await getTokenBalance(vaultPda);
    assert.approximately(vaultBefore, 100, 0.001, "vault funded with full deposit");

    await new Promise((r) => setTimeout(r, 5000));
    await withdraw(recipient, statePda, vaultPda, recipientTokenAccount);

    const recipientBal = await getTokenBalance(recipientTokenAccount);
    const vaultAfter = await getTokenBalance(vaultPda);
    const state = await program.account.distributionState.fetch(statePda);

    assert.equal(recipientBal, 100, "recipient received the full 100");
    assert.approximately(vaultAfter, 0, 0.001, "vault drained");
    assert.equal(state.claimedAmount.toNumber(), 100_000_000, "claimed_amount tracks the withdraw");
  });

  it("edge: withdraw succeeds at exactly the cliff (cliff lump unlocks)", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } =
      await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    // Pure cliff lump (base=0, milestone=0) so the unlocked amount at the cliff
    // boundary is deterministic: exactly the 40-token lump, no linear fraction.
    const cliffAt = now + 3;
    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(0),
      cliffAmount: new anchor.BN(40_000_000),
      milestoneAmount: new anchor.BN(0),
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(cliffAt),
      endTime: new anchor.BN(now + 20),
    });

    // Sleep until just past the cliff boundary, then withdraw. The program's
    // guard is `now >= cliff_time`, so at the boundary the lump is claimable.
    await new Promise((r) => setTimeout(r, 4000));
    await withdraw(recipient, statePda, vaultPda, recipientTokenAccount);

    const bal = await getTokenBalance(recipientTokenAccount);
    assert.approximately(bal, 40, 0.001, "full cliff lump released exactly at the cliff");
  });

  it("edge: cancel just before end succeeds; cancel at/after end is FullyVested", async () => {
    // Case A — cancel after end_time must be rejected (boundary: now < end_time).
    {
      const { authority, recipient, authorityTokenAccount, recipientTokenAccount } =
        await createStreamPair();
      const now = Math.floor(Date.now() / 1000);
      const { statePda, vaultPda } = await createStream({
        authority,
        recipient: recipient.publicKey,
        authorityTokenAccount,
        startTime: new anchor.BN(now),
        cliffTime: new anchor.BN(now),
        endTime: new anchor.BN(now + 2),
      });

      await new Promise((r) => setTimeout(r, 3000)); // now past end_time

      try {
        await program.methods
          .cancel()
          .accounts({
            authority: authority.publicKey,
            distributionState: statePda,
            tokenVault: vaultPda,
            authorityTokenAccount,
            recipientTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([authority])
          .rpc();
        assert.fail("cancel at/after end_time should throw FullyVested");
      } catch (err: any) {
        assert.include(errText(err), "FullyVested");
      }
    }

    // Case B — cancel comfortably before end_time succeeds and closes state.
    {
      const { authority, recipient, authorityTokenAccount, recipientTokenAccount } =
        await createStreamPair();
      const now = Math.floor(Date.now() / 1000);
      const { statePda, vaultPda } = await createStream({
        authority,
        recipient: recipient.publicKey,
        authorityTokenAccount,
        startTime: new anchor.BN(now),
        cliffTime: new anchor.BN(now + 1),
        endTime: new anchor.BN(now + 60),
      });

      await program.methods
        .cancel()
        .accounts({
          authority: authority.publicKey,
          distributionState: statePda,
          tokenVault: vaultPda,
          authorityTokenAccount,
          recipientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();

      try {
        await program.account.distributionState.fetch(statePda);
        assert.fail("state should be closed after a successful cancel");
      } catch (err: any) {
        assert.include(err.toString(), "Account does not exist");
      }
    }
  });

  it("edge: double withdraw does not double-spend", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } =
      await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(100_000_000),
      cliffAmount: new anchor.BN(0),
      milestoneAmount: new anchor.BN(0),
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now),
      endTime: new anchor.BN(now + 3),
    });

    // Fully vest, then withdraw everything.
    await new Promise((r) => setTimeout(r, 4000));
    await withdraw(recipient, statePda, vaultPda, recipientTokenAccount);

    const afterFirst = await getTokenBalance(recipientTokenAccount);
    assert.equal(afterFirst, 100, "first withdraw drains the fully-vested stream");

    // Second withdraw must claim nothing — claimed_amount already == unlocked.
    try {
      await withdraw(recipient, statePda, vaultPda, recipientTokenAccount);
      assert.fail("second withdraw should throw NothingToWithdraw");
    } catch (err: any) {
      assert.include(errText(err), "NothingToWithdraw");
    }

    const afterSecond = await getTokenBalance(recipientTokenAccount);
    assert.equal(afterSecond, 100, "balance unchanged — no double-spend");

    const state = await program.account.distributionState.fetch(statePda);
    assert.equal(state.claimedAmount.toNumber(), 100_000_000, "claimed_amount is monotonic");
  });

  it("edge: create_stream rejects amounts that overflow u64 (MathOverflow)", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const U64_MAX = new anchor.BN("18446744073709551615");

    // base + cliff overflows u64 -> the checked_add in create_stream returns
    // MathOverflow before any token transfer is attempted.
    try {
      await createStream({
        authority,
        recipient: recipient.publicKey,
        authorityTokenAccount,
        baseAmount: U64_MAX,
        cliffAmount: U64_MAX,
        milestoneAmount: new anchor.BN(0),
      });
      assert.fail("summing two u64::MAX amounts should throw MathOverflow");
    } catch (err: any) {
      assert.include(errText(err), "MathOverflow");
    }
  });

  // =========================================================================
  // SECURITY
  // =========================================================================

  it("security: two concurrent streams to the SAME recipient (nonce uniqueness)", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } =
      await createStreamPair();

    // Same (authority, recipient) pair, two different nonces -> two distinct
    // state PDAs. This is the regression guard for the Week 6 collision fix:
    // before the nonce seed, the second create hit "account already in use".
    const a = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(100_000_000),
      milestoneAmount: new anchor.BN(0),
      nonce: nextNonce(),
    });
    const b = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(100_000_000),
      milestoneAmount: new anchor.BN(0),
      nonce: nextNonce(),
    });

    assert.notEqual(a.statePda.toBase58(), b.statePda.toBase58(), "distinct state PDAs");
    assert.notEqual(a.vaultPda.toBase58(), b.vaultPda.toBase58(), "distinct vaults");

    const stateA = await program.account.distributionState.fetch(a.statePda);
    const stateB = await program.account.distributionState.fetch(b.statePda);
    assert.notEqual(stateA.nonce.toString(), stateB.nonce.toString());

    // Cancelling one leaves the other live and independent.
    await program.methods
      .cancel()
      .accounts({
        authority: authority.publicKey,
        distributionState: a.statePda,
        tokenVault: a.vaultPda,
        authorityTokenAccount,
        recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    const stillLive = await program.account.distributionState.fetch(b.statePda);
    assert.isFalse(stillLive.isCancelled, "second stream untouched by the first's cancel");
  });

  it("security: only the authority can top_up (unauthorized signer rejected)", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const attacker = anchor.web3.Keypair.generate();
    await airdrop(attacker.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
    const attackerTokenAccount = await createAccount(
      provider.connection,
      attacker,
      mint,
      attacker.publicKey
    );

    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
    });

    try {
      await program.methods
        .topUp(new anchor.BN(1_000_000), null)
        .accounts({
          authority: attacker.publicKey,
          distributionState: statePda,
          tokenVault: vaultPda,
          authorityTokenAccount: attackerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      assert.fail("non-authority top_up should be rejected");
    } catch (err: any) {
      const t = errText(err);
      assert.match(t, UNAUTHORIZED, `expected seeds/has_one error, got: ${t}`);
    }
  });

  it("security: withdraw with a wrong-mint token account is rejected", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
    });

    // A token account for a DIFFERENT mint than the stream's token_mint.
    const otherMint = await createMint(
      provider.connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      6
    );
    const wrongMintAccount = await createAccount(
      provider.connection,
      recipient,
      otherMint,
      recipient.publicKey
    );

    try {
      await program.methods
        .withdraw()
        .accounts({
          recipient: recipient.publicKey,
          distributionState: statePda,
          tokenVault: vaultPda,
          recipientTokenAccount: wrongMintAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([recipient])
        .rpc();
      assert.fail("withdraw into a wrong-mint account should be rejected");
    } catch (err: any) {
      const t = errText(err);
      assert.match(t, WRONG_MINT, `expected token-mint constraint error, got: ${t}`);
    }
  });

  // --- top_up guard branches ---------------------------------------------

  const topUp = (
    authority: anchor.web3.Keypair,
    statePda: anchor.web3.PublicKey,
    vaultPda: anchor.web3.PublicKey,
    authorityTokenAccount: anchor.web3.PublicKey,
    additionalBase: anchor.BN,
    newEnd: anchor.BN | null
  ) =>
    program.methods
      .topUp(additionalBase, newEnd)
      .accounts({
        authority: authority.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

  it("security: top_up rejects an end time earlier than the current one (InvalidExtension)", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);
    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now),
      endTime: new anchor.BN(now + 60),
    });

    try {
      // new_end_time = now+30, earlier than the current now+60 -> must reject.
      await topUp(authority, statePda, vaultPda, authorityTokenAccount, new anchor.BN(0), new anchor.BN(now + 30));
      assert.fail("top_up with an earlier end time should throw InvalidExtension");
    } catch (err: any) {
      assert.include(errText(err), "InvalidExtension");
    }
  });

  it("edge: top_up on a fully-vested stream is rejected (FullyVested)", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);
    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now),
      endTime: new anchor.BN(now + 2),
    });

    await new Promise((r) => setTimeout(r, 3000)); // past end_time

    try {
      await topUp(authority, statePda, vaultPda, authorityTokenAccount, new anchor.BN(1_000_000), null);
      assert.fail("top_up after full vest should throw FullyVested");
    } catch (err: any) {
      assert.include(errText(err), "FullyVested");
    }
  });

  it("security: top_up on a cancelled stream is rejected", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } =
      await createStreamPair();
    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
    });

    await program.methods
      .cancel()
      .accounts({
        authority: authority.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount,
        recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    try {
      await topUp(authority, statePda, vaultPda, authorityTokenAccount, new anchor.BN(1_000_000), null);
      assert.fail("top_up on a cancelled (closed) stream should be rejected");
    } catch (err: any) {
      const t = errText(err);
      assert.match(t, CANCELLED_ACCOUNT_GONE, `cancelled stream should be gone, got: ${t}`);
    }
  });
});
