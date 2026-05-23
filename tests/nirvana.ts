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

describe("Nirvana Protocol - Complete Test Suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load IDL directly since we're not using anchor test harness
  const idlPath = path.join(__dirname, "../target/idl/idl.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8")) as Idl;
  const programId = new anchor.web3.PublicKey(idl.metadata?.address || "BpHiA8c1NtStZiu7romfc3hEG7nzCoLYdPUm7XmdVuZS");
  const program = new Program(idl, programId, provider);

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

  // Helper: derive PDAs
  function getPDAs(authority: anchor.web3.PublicKey, recipient: anchor.web3.PublicKey) {
    const [statePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("state"), authority.toBuffer(), recipient.toBuffer()],
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
      milestoneAmount?: anchor.BN;
      startTime?: anchor.BN;
      endTime?: anchor.BN;
      cliffTime?: anchor.BN;
    }
  ) {
    const now = Math.floor(Date.now() / 1000);
    const baseAmount = params.baseAmount ?? new anchor.BN(100_000_000);
    const milestoneAmount = params.milestoneAmount ?? new anchor.BN(50_000_000);
    const startTime = params.startTime ?? new anchor.BN(now + 1);
    const endTime = params.endTime ?? new anchor.BN(now + 10);
    const cliffTime = params.cliffTime ?? new anchor.BN(now + 3);

    const { statePda, vaultPda } = getPDAs(params.authority.publicKey, params.recipient);

    await program.methods
      .createStream(baseAmount, milestoneAmount, startTime, endTime, cliffTime)
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

    return { statePda, vaultPda, baseAmount, milestoneAmount, startTime, endTime, cliffTime };
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
    // Should be ~50 tokens (with some tolerance for timing)
    assert.isAbove(bal, 45);
    assert.isBelow(bal, 55);
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
        authority: authority.publicKey,
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
    // ~50 linear + 50 milestone = ~100, with timing tolerance
    assert.isAbove(bal, 90);
  });

  it("should fail to trigger milestone twice", async () => {
    const { authority, recipient, authorityTokenAccount } = await createStreamPair();
    const { statePda } = await createStream({ authority, recipient: recipient.publicKey, authorityTokenAccount });

    await program.methods
      .triggerMilestone()
      .accounts({
        authority: authority.publicKey,
        distributionState: statePda,
      })
      .signers([authority])
      .rpc();

    try {
      await program.methods
        .triggerMilestone()
        .accounts({
          authority: authority.publicKey,
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
          authority: authority.publicKey,
          distributionState: statePda,
        })
        .signers([authority])
        .rpc();
      assert.fail("Should have thrown StreamExpired");
    } catch (err: any) {
      assert.include(err.toString(), "StreamExpired");
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
          authority: authority.publicKey,
          distributionState: statePda,
        })
        .signers([authority])
        .rpc();
      assert.fail("Should have thrown StreamCancelled");
    } catch (err: any) {
      assert.include(err.toString(), "StreamCancelled");
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

    // Recipient should get ~50 linear tokens
    assert.isAbove(recipientBalance, 45);
    assert.isBelow(recipientBalance, 55);

    // Creator should get back ~100 tokens (remaining 50 base + 50 milestone)
    const creatorGain = creatorBalanceAfter - creatorBalanceBefore;
    assert.isAbove(creatorGain, 95);
    assert.isBelow(creatorGain, 105);
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
        authority: authority.publicKey,
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

    // Recipient should get ~100 tokens (50 linear + 50 milestone)
    assert.isAbove(recipientBalance, 90);
    assert.isBelow(recipientBalance, 110);

    // Creator should get back ~50 tokens
    const creatorGain = creatorBalanceAfter - creatorBalanceBefore;
    assert.isAbove(creatorGain, 40);
    assert.isBelow(creatorGain, 60);
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
      assert.include(err.toString(), "AlreadyCancelled");
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
      assert.include(err.toString(), "ConstraintHasOne");
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
      assert.include(err.toString(), "StreamCancelled");
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
      assert.include(err.toString(), "ConstraintHasOne");
    }
  });
});
