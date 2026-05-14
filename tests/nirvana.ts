import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NirvanaProtocol } from "../target/types/nirvana_protocol";
import {
  createMint,
  createAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

describe("Nirvana Protocol - Week 4 Core Execution", () => {
  // Configure the client to use Devnet
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.NirvanaProtocol as Program<NirvanaProtocol>;

  let mint: anchor.web3.PublicKey;
  let authorityTokenAccount: anchor.web3.PublicKey;
  let recipientTokenAccount: anchor.web3.PublicKey;

  // Keypairs for testing
  const authority = anchor.web3.Keypair.generate();
  const recipient = anchor.web3.Keypair.generate();

  /**
   * Helper: Airdrop SOL for transaction fees on Devnet
   */
  async function airdrop(pubkey: anchor.web3.PublicKey, amount: number) {
    const sig = await provider.connection.requestAirdrop(pubkey, amount);
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: sig,
    });
  }

  before(async () => {
    console.log("Preparing Test Environment on Devnet...");
    await airdrop(authority.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await airdrop(recipient.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);

    // Create Mint with 6 decimals (standard for many tokens)
    mint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6
    );

    // Create ATAs
    authorityTokenAccount = await createAccount(provider.connection, authority, mint, authority.publicKey);
    recipientTokenAccount = await createAccount(provider.connection, recipient, mint, recipient.publicKey);

    // Mint tokens to authority for distribution
    await mintTo(provider.connection, authority, mint, authorityTokenAccount, authority.publicKey, 1_000_000_000);
    console.log("Setup Complete: Tokens Minted.");
  });

  it("Task 1: Create Stream (Successful Deposit & Initialization)", async () => {
    const baseAmount = new anchor.BN(100_000_000); // 100 tokens
    const milestoneAmount = new anchor.BN(50_000_000); // 50 tokens
    const now = Math.floor(Date.now() / 1000);
    
    // Setting timeline: Start in 5s, Cliff in 15s, End in 100s
    const startTime = new anchor.BN(now + 5);
    const endTime = new anchor.BN(now + 100);
    const cliffTime = new anchor.BN(now + 15);

    const [statePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("state"), authority.publicKey.toBuffer(), recipient.publicKey.toBuffer()],
      program.programId
    );

    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), statePda.toBuffer()],
      program.programId
    );

    const tx = await program.methods
      .createStream(baseAmount, milestoneAmount, startTime, endTime, cliffTime)
      .accounts({
        authority: authority.publicKey,
        recipient: recipient.publicKey,
        tokenMint: mint,
        authorityTokenAccount: authorityTokenAccount,
        // @ts-ignore (Handling Boxed Account in TS)
        distributionState: statePda,
        tokenVault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    console.log("CreateStream TX Signature:", tx);

    const state = await program.account.distributionState.fetch(statePda);
    assert.equal(state.baseAmount.toString(), baseAmount.toString());
    assert.isFalse(state.milestoneAchieved);
    assert.isFalse(state.isCancelled);
  });

  it("Task 2: Trigger Milestone & Partial Withdraw (Linear Calculation Check)", async () => {
    const [statePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("state"), authority.publicKey.toBuffer(), recipient.publicKey.toBuffer()],
      program.programId
    );

    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), statePda.toBuffer()],
      program.programId
    );

    // 1. Trigger Milestone (Technocratic Decision)
    await program.methods
      .triggerMilestone()
      .accounts({
        authority: authority.publicKey,
        // @ts-ignore
        distributionState: statePda,
      })
      .signers([authority])
      .rpc();

    console.log("Waiting for cliff and linear progress...");
    await new Promise(r => setTimeout(r, 20000)); // Wait 20s to ensure cliff passed

    // 2. Perform Partial Withdrawal
    await program.methods
      .withdraw()
      .accounts({
        recipient: recipient.publicKey,
        // @ts-ignore
        distributionState: statePda,
        tokenVault: vaultPda,
        recipientTokenAccount: recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([recipient])
      .rpc();

    const bal = await provider.connection.getTokenAccountBalance(recipientTokenAccount);
    console.log("Recipient Balance after partial withdraw:", bal.value.uiAmount);
    
    // Must be > 50 (Milestone 50 + small linear amount)
    assert.isAbove(Number(bal.value.uiAmount), 50);
  });

  it("Task 3: Security Check - Unauthorized withdrawal must fail", async () => {
    const maliciousActor = anchor.web3.Keypair.generate();
    await airdrop(maliciousActor.publicKey, 0.1 * anchor.web3.LAMPORTS_PER_SOL);

    const [statePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("state"), authority.publicKey.toBuffer(), recipient.publicKey.toBuffer()],
      program.programId
    );

    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), statePda.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .withdraw()
        .accounts({
          recipient: maliciousActor.publicKey,
          // @ts-ignore
          distributionState: statePda,
          tokenVault: vaultPda,
          recipientTokenAccount: recipientTokenAccount,
        })
        .signers([maliciousActor])
        .rpc();
      assert.fail("Should have thrown unauthorized error");
    } catch (err: any) {
      assert.include(err.toString(), "ConstraintHasOne");
      console.log("✔ Unauthorized access blocked correctly.");
    }
  });

  it("Task 4: Cancel Stream (Secure Fund Splitting)", async () => {
    const [statePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("state"), authority.publicKey.toBuffer(), recipient.publicKey.toBuffer()],
      program.programId
    );

    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), statePda.toBuffer()],
      program.programId
    );

    await program.methods
      .cancel()
      .accounts({
        authority: authority.publicKey,
        // @ts-ignore
        distributionState: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount: authorityTokenAccount,
        recipientTokenAccount: recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    console.log("Stream cancelled successfully.");

    // Verify account closure
    try {
      await program.account.distributionState.fetch(statePda);
      assert.fail("Account should be closed and unreachable.");
    } catch (err: any) {
      assert.include(err.toString(), "Account does not exist");
    }
  });
});
