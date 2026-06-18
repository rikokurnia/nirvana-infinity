import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import {
  createMint,
  createAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

// Anchor surfaces program failures in different shapes: AnchorError (with a
// parsed error.errorCode.code), the message string, or just the raw sim logs.
// AnchorError.toString() only returns the joined log line, so asserting on the
// code name alone (e.g. "ConstraintSeeds") misses it. Gather every source so a
// test can match whichever form Anchor produces for that failure.
function errText(err: any): string {
  const logs = Array.isArray(err?.logs) ? err.logs.join("\n") : "";
  return [
    err?.error?.errorCode?.code ?? "",
    err?.message ?? "",
    typeof err?.toString === "function" ? err.toString() : "",
    logs,
  ].join(" || ");
}

// A cancelled stream's state account is closed (see "Cancel" close=authority),
// so any later instruction referencing it fails at account load, not at a
// logic guard. Match that family of errors.
const CANCELLED_ACCOUNT_GONE =
  /AccountNotInitialized|AccountOwnedByWrongProgram|caused by account: distribution|does not exist|has been closed/i;

// An unauthorized signer changes the PDA seeds, so Anchor rejects on
// ConstraintSeeds (before, or instead of, the has_one ConstraintHasOne).
const UNAUTHORIZED = /ConstraintSeeds|ConstraintHasOne|seeds constraint|has one constraint/i;

// Anchor may surface the error code name or the human-readable #[msg] string.
const STREAM_EXPIRED = /StreamExpired|Stream expired/i;

describe("Nirvana Protocol - Complete Test Suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load IDL directly since we're not using anchor test harness.
  // anchor 0.30+ embeds the program id at idl.address and infers it in the
  // Program constructor, so no explicit programId arg is needed.
  const idlPath = path.join(__dirname, "../target/idl/nirvana_protocol.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8")) as Idl;
  const program = new Program(idl, provider);

  let mint: anchor.web3.PublicKey;

  // Global payer for mint creation
  const mintAuthority = anchor.web3.Keypair.generate();

  async function airdrop(pubkey: anchor.web3.PublicKey, amount: number) {
    const sig = await provider.connection.requestAirdrop(pubkey, amount);
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
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

  // Helper: create a fresh authority/recipient pair with token accounts
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

  // Monotonic nonce source. The on-chain state PDA is seeded with an 8-byte LE
  // nonce (added in the Week 6 collision fix), so every stream must supply a
  // unique one. A counter beats Date.now() because two createStream calls can
  // land in the same millisecond and would otherwise collide.
  let nonceCounter = Date.now();
  function nextNonce(): anchor.BN {
    return new anchor.BN(nonceCounter++);
  }

  // Helper: derive PDAs. State seeds must match the program exactly:
  // [b"state", authority, recipient, nonce.to_le_bytes()] (see lib.rs CreateStream).
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

  // Helper: create a stream
  async function createStream(
    params: {
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
    }
  ) {
    const now = Math.floor(Date.now() / 1000);
    const baseAmount = params.baseAmount ?? new anchor.BN(100_000_000);
    const cliffAmount = params.cliffAmount ?? new anchor.BN(0);
    const milestoneAmount = params.milestoneAmount ?? new anchor.BN(50_000_000);
    const startTime = params.startTime ?? new anchor.BN(now + 1);
    const endTime = params.endTime ?? new anchor.BN(now + 10);
    const cliffTime = params.cliffTime ?? new anchor.BN(now + 3);
    const arbiter = params.arbiter ?? null;
    const nonce = params.nonce ?? nextNonce();

    const { statePda, vaultPda } = getPDAs(params.authority.publicKey, params.recipient, nonce);

    await program.methods
      .createStream(nonce, baseAmount, cliffAmount, milestoneAmount, startTime, endTime, cliffTime, arbiter)
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

    return { statePda, vaultPda, nonce, baseAmount, cliffAmount, milestoneAmount, startTime, endTime, cliffTime };
  }

  // =========================================================================
  // CREATE STREAM
  // =========================================================================

  it("Task 1: Create Stream (Successful Deposit & Initialization)", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const { statePda } = await createStream({ authority, recipient: recipient.publicKey, authorityTokenAccount });

    const state = await program.account.distributionState.fetch(statePda);
    assert.equal(state.baseAmount.toNumber(), 100_000_000);
    assert.equal(state.milestoneAmount.toNumber(), 50_000_000);
    assert.isFalse(state.milestoneAchieved);
    assert.isFalse(state.isCancelled);
  });

  it("should fail to create stream with invalid time range", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    try {
      await createStream({
        authority,
        recipient: recipient.publicKey,
        authorityTokenAccount,
        startTime: new anchor.BN(now + 5),
        endTime: new anchor.BN(now + 2),
      });
      assert.fail("Should have thrown InvalidTimeRange");
    } catch (err: any) {
      assert.include(err.toString(), "InvalidTimeRange");
    }
  });

  it("should fail to create stream with invalid cliff", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    try {
      await createStream({
        authority,
        recipient: recipient.publicKey,
        authorityTokenAccount,
        cliffTime: new anchor.BN(now + 15),
        endTime: new anchor.BN(now + 10),
      });
      assert.fail("Should have thrown InvalidCliff");
    } catch (err: any) {
      assert.include(err.toString(), "InvalidCliff");
    }
  });

  it("should fail to create stream with start time in past", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    try {
      await createStream({
        authority,
        recipient: recipient.publicKey,
        authorityTokenAccount,
        startTime: new anchor.BN(now - 5),
      });
      assert.fail("Should have thrown StartTimeInPast");
    } catch (err: any) {
      assert.include(err.toString(), "StartTimeInPast");
    }
  });

  it("should fail to create stream with zero deposit", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();

    try {
      await createStream({
        authority,
        recipient: recipient.publicKey,
        authorityTokenAccount,
        baseAmount: new anchor.BN(0),
        milestoneAmount: new anchor.BN(0),
      });
      assert.fail("Should have thrown ZeroDepositAmount");
    } catch (err: any) {
      assert.include(err.toString(), "ZeroDepositAmount");
    }
  });

  // =========================================================================
  // CLIFF VESTING
  // =========================================================================

  it("should fail to withdraw before cliff", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now + 10),
      endTime: new anchor.BN(now + 20),
    });

    try {
      await program.methods
        .withdraw()
        .accounts({
          recipient: recipient.publicKey,
          distributionState: statePda,
          tokenVault: vaultPda,
          recipientTokenAccount: recipientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([recipient])
        .rpc();
      assert.fail("Should have thrown CliffNotReached");
    } catch (err: any) {
      assert.include(err.toString(), "CliffNotReached");
    }
  });

  it("should succeed to withdraw after cliff with correct linear amount", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    // Stream: 0s start, 2s cliff, 10s end -> base=100 tokens
    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(100_000_000),
      milestoneAmount: new anchor.BN(0),
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now + 2),
      endTime: new anchor.BN(now + 10),
    });

    // Wait 5 seconds: at start+5, elapsed=5, total=10, linear=50 tokens
    await new Promise((r) => setTimeout(r, 5000));

    await program.methods
      .withdraw()
      .accounts({
        recipient: recipient.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        recipientTokenAccount: recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([recipient])
      .rpc();

    const bal = await getTokenBalance(recipientTokenAccount);
    // Target is ~50 tokens (5s of a 10s linear stream). solana-test-validator's
    // slot-based unix_timestamp drifts from wall-clock (often lags a few
    // seconds during warmup), so use a wide band: this asserts linear vesting
    // is partial and proportional (not 0, not the full 100), not an exact value.
    assert.isAbove(bal, 30);
    assert.isBelow(bal, 70);
  });

  it("should allow full withdrawal after stream end", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(100_000_000),
      milestoneAmount: new anchor.BN(0),
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now),
      endTime: new anchor.BN(now + 3),
    });

    await new Promise((r) => setTimeout(r, 4000));

    await program.methods
      .withdraw()
      .accounts({
        recipient: recipient.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        recipientTokenAccount: recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([recipient])
      .rpc();

    const bal = await getTokenBalance(recipientTokenAccount);
    assert.equal(bal, 100);
  });

  // =========================================================================
  // MILESTONE VESTING
  // =========================================================================

  it("should not include milestone before trigger", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    // Pure milestone stream: base=0, milestone=50
    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(0),
      milestoneAmount: new anchor.BN(50_000_000),
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now),
      endTime: new anchor.BN(now + 10),
    });

    // Wait past cliff
    await new Promise((r) => setTimeout(r, 1000));

    try {
      await program.methods
        .withdraw()
        .accounts({
          recipient: recipient.publicKey,
          distributionState: statePda,
          tokenVault: vaultPda,
          recipientTokenAccount: recipientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([recipient])
        .rpc();
      assert.fail("Should have thrown NothingToWithdraw");
    } catch (err: any) {
      assert.include(err.toString(), "NothingToWithdraw");
    }
  });

  it("Task 2: Trigger Milestone & Partial Withdraw (Linear Calculation Check)", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(100_000_000),
      milestoneAmount: new anchor.BN(50_000_000),
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now + 2),
      endTime: new anchor.BN(now + 10),
    });

    // Trigger milestone
    await program.methods
      .triggerMilestone()
      .accounts({
        triggerer: authority.publicKey,
        distributionState: statePda,
      })
      .signers([authority])
      .rpc();

    // Wait 5 seconds: should have ~50 linear + 50 milestone = ~100 total
    await new Promise((r) => setTimeout(r, 5000));

    await program.methods
      .withdraw()
      .accounts({
        recipient: recipient.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        recipientTokenAccount: recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([recipient])
      .rpc();

    const bal = await getTokenBalance(recipientTokenAccount);
    // ~50 linear + 50 milestone = ~100. Lower bound 80 absorbs validator clock
    // drift on the linear part (could be ~40 instead of 50).
    assert.isAbove(bal, 80);
  });

  it("should fail to trigger milestone twice", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const { statePda } = await createStream({ authority, recipient: recipient.publicKey, authorityTokenAccount });

    await program.methods
      .triggerMilestone()
      .accounts({
        triggerer: authority.publicKey,
        distributionState: statePda,
      })
      .signers([authority])
      .rpc();

    try {
      await program.methods
        .triggerMilestone()
        .accounts({
          triggerer: authority.publicKey,
          distributionState: statePda,
        })
        .signers([authority])
        .rpc();
      assert.fail("Should have thrown MilestoneAlreadyAchieved");
    } catch (err: any) {
      assert.include(err.toString(), "MilestoneAlreadyAchieved");
    }
  });

  it("should fail to trigger milestone after stream expired", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    const { statePda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now),
      endTime: new anchor.BN(now + 2),
    });

    // Wait for stream to expire
    await new Promise((r) => setTimeout(r, 3000));

    try {
      await program.methods
        .triggerMilestone()
        .accounts({
          triggerer: authority.publicKey,
          distributionState: statePda,
        })
        .signers([authority])
        .rpc();
      assert.fail("Should have thrown StreamExpired");
    } catch (err: any) {
      const t = errText(err);
      // Depending on how the client surfaces it, the error appears as either the
      // code name ("StreamExpired") or the human-readable #[msg] ("Stream expired.").
      assert.match(t, /StreamExpired|Stream expired/i, `expected StreamExpired, got: ${t}`);
    }
  });

  it("should fail to trigger milestone on cancelled stream", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const { statePda, vaultPda } = await createStream({ authority, recipient: recipient.publicKey, authorityTokenAccount });

    // Cancel first
    await program.methods
      .cancel()
      .accounts({
        authority: authority.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount: authorityTokenAccount,
        recipientTokenAccount: recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    try {
      await program.methods
        .triggerMilestone()
        .accounts({
          triggerer: authority.publicKey,
          distributionState: statePda,
        })
        .signers([authority])
        .rpc();
      assert.fail("Should have thrown StreamCancelled");
    } catch (err: any) {
      const t = errText(err);
      assert.match(t, CANCELLED_ACCOUNT_GONE, `cancelled stream account should be gone, got: ${t}`);
    }
  });

  // =========================================================================
  // CANCEL STREAM
  // =========================================================================

  it("Task 4: Cancel Stream (Secure Fund Splitting)", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const { statePda, vaultPda } = await createStream({ authority, recipient: recipient.publicKey, authorityTokenAccount });

    await program.methods
      .cancel()
      .accounts({
        authority: authority.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount: authorityTokenAccount,
        recipientTokenAccount: recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    // Verify account closure
    try {
      await program.account.distributionState.fetch(statePda);
      assert.fail("Account should be closed and unreachable.");
    } catch (err: any) {
      assert.include(err.toString(), "Account does not exist");
    }
  });

  it("should return all tokens to creator when cancelled before cliff", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(100_000_000),
      milestoneAmount: new anchor.BN(50_000_000),
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now + 10),
      endTime: new anchor.BN(now + 20),
    });

    const creatorBalanceBefore = await getTokenBalance(authorityTokenAccount);

    await program.methods
      .cancel()
      .accounts({
        authority: authority.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount: authorityTokenAccount,
        recipientTokenAccount: recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    const creatorBalanceAfter = await getTokenBalance(authorityTokenAccount);
    const recipientBalance = await getTokenBalance(recipientTokenAccount);

    assert.equal(recipientBalance, 0);
    // Creator should get back 150 tokens (the original deposit)
    assert.approximately(creatorBalanceAfter - creatorBalanceBefore, 150, 0.1);
  });

  it("should split tokens correctly when cancelled mid-stream", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    // Stream: 0s start, 2s cliff, 10s end, base=100, milestone=50
    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(100_000_000),
      milestoneAmount: new anchor.BN(50_000_000),
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now + 2),
      endTime: new anchor.BN(now + 10),
    });

    // Wait 5 seconds: elapsed=5, total=10, linear unlocked=50
    await new Promise((r) => setTimeout(r, 5000));

    const creatorBalanceBefore = await getTokenBalance(authorityTokenAccount);

    await program.methods
      .cancel()
      .accounts({
        authority: authority.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount: authorityTokenAccount,
        recipientTokenAccount: recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    const recipientBalance = await getTokenBalance(recipientTokenAccount);
    const creatorBalanceAfter = await getTokenBalance(authorityTokenAccount);

    // Recipient gets the linear-unlocked portion (~50 of 100 base at the 5s
    // mark). Wide band absorbs solana-test-validator clock drift; deposit is
    // base(100)+milestone(50)=150, so recipient + creatorGain == 150.
    assert.isAbove(recipientBalance, 30);
    assert.isBelow(recipientBalance, 70);

    // Creator gets back the rest: 150 - recipient (untriggered milestone too).
    const creatorGain = creatorBalanceAfter - creatorBalanceBefore;
    assert.isAbove(creatorGain, 80);
    assert.isBelow(creatorGain, 120);
  });

  it("should split tokens correctly when cancelled mid-stream with milestone triggered", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(100_000_000),
      milestoneAmount: new anchor.BN(50_000_000),
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now + 2),
      endTime: new anchor.BN(now + 10),
    });

    // Trigger milestone before waiting
    await program.methods
      .triggerMilestone()
      .accounts({
        triggerer: authority.publicKey,
        distributionState: statePda,
      })
      .signers([authority])
      .rpc();

    // Wait 5 seconds: elapsed=5, total=10, linear unlocked=50, milestone=50, total unlocked=100
    await new Promise((r) => setTimeout(r, 5000));

    const creatorBalanceBefore = await getTokenBalance(authorityTokenAccount);

    await program.methods
      .cancel()
      .accounts({
        authority: authority.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount: authorityTokenAccount,
        recipientTokenAccount: recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    const recipientBalance = await getTokenBalance(recipientTokenAccount);
    const creatorBalanceAfter = await getTokenBalance(authorityTokenAccount);

    // Recipient gets linear (~50) + triggered milestone (50) ~= 100–120. Wide band
    // absorbs validator clock drift on the linear part.
    assert.isAbove(recipientBalance, 80);
    assert.isAtMost(recipientBalance, 120);

    // Creator gets back 150 - recipient (the unvested linear remainder ~50).
    const creatorGain = creatorBalanceAfter - creatorBalanceBefore;
    assert.isAbove(creatorGain, 30);
    assert.isBelow(creatorGain, 70);
  });

  it("should fail to cancel after fully vested", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now),
      endTime: new anchor.BN(now + 2),
    });

    // Wait for stream to fully vest
    await new Promise((r) => setTimeout(r, 3000));

    try {
      await program.methods
        .cancel()
        .accounts({
          authority: authority.publicKey,
          distributionState: statePda,
          tokenVault: vaultPda,
          authorityTokenAccount: authorityTokenAccount,
          recipientTokenAccount: recipientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();
      assert.fail("Should have thrown FullyVested");
    } catch (err: any) {
      assert.include(err.toString(), "FullyVested");
    }
  });

  it("should fail to cancel already cancelled stream", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const { statePda, vaultPda } = await createStream({ authority, recipient: recipient.publicKey, authorityTokenAccount });

    // Cancel once
    await program.methods
      .cancel()
      .accounts({
        authority: authority.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount: authorityTokenAccount,
        recipientTokenAccount: recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    try {
      await program.methods
        .cancel()
        .accounts({
          authority: authority.publicKey,
          distributionState: statePda,
          tokenVault: vaultPda,
          authorityTokenAccount: authorityTokenAccount,
          recipientTokenAccount: recipientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();
      assert.fail("Should have thrown AlreadyCancelled");
    } catch (err: any) {
      const t = errText(err);
      assert.match(t, CANCELLED_ACCOUNT_GONE, `already-cancelled stream account should be gone, got: ${t}`);
    }
  });

  it("should fail for unauthorized user to cancel", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const maliciousActor = anchor.web3.Keypair.generate();
    await airdrop(maliciousActor.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);

    const { statePda, vaultPda } = await createStream({ authority, recipient: recipient.publicKey, authorityTokenAccount });

    try {
      await program.methods
        .cancel()
        .accounts({
          authority: maliciousActor.publicKey,
          distributionState: statePda,
          tokenVault: vaultPda,
          authorityTokenAccount: authorityTokenAccount,
          recipientTokenAccount: recipientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([maliciousActor])
        .rpc();
      assert.fail("Should have thrown unauthorized error");
    } catch (err: any) {
      const t = errText(err);
      assert.match(t, UNAUTHORIZED, `expected authorization (seeds/has_one) error, got: ${t}`);
    }
  });

  // =========================================================================
  // WITHDRAW ERROR CASES
  // =========================================================================

  it("should fail to withdraw from cancelled stream", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now),
      endTime: new anchor.BN(now + 10),
    });

    // Cancel
    await program.methods
      .cancel()
      .accounts({
        authority: authority.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount: authorityTokenAccount,
        recipientTokenAccount: recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    try {
      await program.methods
        .withdraw()
        .accounts({
          recipient: recipient.publicKey,
          distributionState: statePda,
          tokenVault: vaultPda,
          recipientTokenAccount: recipientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([recipient])
        .rpc();
      assert.fail("Should have thrown StreamCancelled");
    } catch (err: any) {
      const t = errText(err);
      assert.match(t, CANCELLED_ACCOUNT_GONE, `cancelled stream account should be gone, got: ${t}`);
    }
  });

  it("should fail to withdraw with nothing to withdraw", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(100_000_000),
      milestoneAmount: new anchor.BN(0),
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now),
      endTime: new anchor.BN(now + 3),
    });

    // Wait and withdraw everything
    await new Promise((r) => setTimeout(r, 4000));

    await program.methods
      .withdraw()
      .accounts({
        recipient: recipient.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        recipientTokenAccount: recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([recipient])
      .rpc();

    // Try withdraw again
    try {
      await program.methods
        .withdraw()
        .accounts({
          recipient: recipient.publicKey,
          distributionState: statePda,
          tokenVault: vaultPda,
          recipientTokenAccount: recipientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([recipient])
        .rpc();
      assert.fail("Should have thrown NothingToWithdraw");
    } catch (err: any) {
      assert.include(err.toString(), "NothingToWithdraw");
    }
  });

  it("Task 3: Security Check - Unauthorized withdrawal must fail", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const maliciousActor = anchor.web3.Keypair.generate();
    await airdrop(maliciousActor.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);

    const { statePda, vaultPda } = await createStream({ authority, recipient: recipient.publicKey, authorityTokenAccount });

    try {
      await program.methods
        .withdraw()
        .accounts({
          recipient: maliciousActor.publicKey,
          distributionState: statePda,
          tokenVault: vaultPda,
          recipientTokenAccount: recipientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([maliciousActor])
        .rpc();
      assert.fail("Should have thrown unauthorized error");
    } catch (err: any) {
      const t = errText(err);
      assert.match(t, UNAUTHORIZED, `expected authorization (seeds/has_one) error, got: ${t}`);
    }
  });

  // =========================================================================
  // CLIFF LUMP SUM (on-chain cliff_amount)
  // =========================================================================

  it("should unlock the full cliff lump at the cliff time", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    // base=0, cliff=40, milestone=0 -> only the lump should be claimable post-cliff
    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(0),
      cliffAmount: new anchor.BN(40_000_000),
      milestoneAmount: new anchor.BN(0),
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now + 2),
      endTime: new anchor.BN(now + 10),
    });

    // Persisted on-chain
    const state = await program.account.distributionState.fetch(statePda);
    assert.equal(state.cliffAmount.toNumber(), 40_000_000);

    // Wait past the cliff, then withdraw -> exactly the lump, no linear
    await new Promise((r) => setTimeout(r, 3000));

    await program.methods
      .withdraw()
      .accounts({
        recipient: recipient.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        recipientTokenAccount: recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([recipient])
      .rpc();

    const bal = await getTokenBalance(recipientTokenAccount);
    assert.approximately(bal, 40, 0.001);
  });

  it("should not unlock the cliff lump before the cliff", async () => {
    const { authority, recipient, authorityTokenAccount, recipientTokenAccount } = await createStreamPair();
    const now = Math.floor(Date.now() / 1000);

    const { statePda, vaultPda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      baseAmount: new anchor.BN(0),
      cliffAmount: new anchor.BN(40_000_000),
      milestoneAmount: new anchor.BN(0),
      startTime: new anchor.BN(now),
      cliffTime: new anchor.BN(now + 30),
      endTime: new anchor.BN(now + 60),
    });

    try {
      await program.methods
        .withdraw()
        .accounts({
          recipient: recipient.publicKey,
          distributionState: statePda,
          tokenVault: vaultPda,
          recipientTokenAccount: recipientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([recipient])
        .rpc();
      assert.fail("Should have thrown CliffNotReached");
    } catch (err: any) {
      assert.include(err.toString(), "CliffNotReached");
    }
  });

  // =========================================================================
  // ARBITER MILESTONE
  // =========================================================================

  it("should let a designated arbiter trigger the milestone", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const arbiter = anchor.web3.Keypair.generate();
    await airdrop(arbiter.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);

    const { statePda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
      arbiter: arbiter.publicKey,
    });

    await program.methods
      .triggerMilestone()
      .accounts({
        triggerer: arbiter.publicKey,
        distributionState: statePda,
      })
      .signers([arbiter])
      .rpc();

    const state = await program.account.distributionState.fetch(statePda);
    assert.isTrue(state.milestoneAchieved);
  });

  it("should reject milestone trigger from an unrelated signer", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const stranger = anchor.web3.Keypair.generate();
    await airdrop(stranger.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);

    // No arbiter set -> only the authority may trigger
    const { statePda } = await createStream({
      authority,
      recipient: recipient.publicKey,
      authorityTokenAccount,
    });

    try {
      await program.methods
        .triggerMilestone()
        .accounts({
          triggerer: stranger.publicKey,
          distributionState: statePda,
        })
        .signers([stranger])
        .rpc();
      assert.fail("Should have thrown Unauthorized");
    } catch (err: any) {
      assert.include(err.toString(), "Unauthorized");
    }
  });

  // =========================================================================
  // TOP UP
  // =========================================================================

  it("should add base funds and extend the end time via top_up", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
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
      endTime: new anchor.BN(now + 30),
    });

    const vaultBefore = await getTokenBalance(vaultPda);
    const newEnd = new anchor.BN(now + 120);

    await program.methods
      .topUp(new anchor.BN(50_000_000), newEnd)
      .accounts({
        authority: authority.publicKey,
        distributionState: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount: authorityTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    const state = await program.account.distributionState.fetch(statePda);
    assert.equal(state.baseAmount.toNumber(), 150_000_000);
    assert.equal(state.endTime.toNumber(), now + 120);

    const vaultAfter = await getTokenBalance(vaultPda);
    assert.approximately(vaultAfter - vaultBefore, 50, 0.001);
  });

  it("should reject a top_up that neither adds funds nor extends", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const { statePda, vaultPda } = await createStream({ authority, recipient: recipient.publicKey, authorityTokenAccount });

    try {
      await program.methods
        .topUp(new anchor.BN(0), null)
        .accounts({
          authority: authority.publicKey,
          distributionState: statePda,
          tokenVault: vaultPda,
          authorityTokenAccount: authorityTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();
      assert.fail("Should have thrown NothingToTopUp");
    } catch (err: any) {
      assert.include(err.toString(), "NothingToTopUp");
    }
  });
});
