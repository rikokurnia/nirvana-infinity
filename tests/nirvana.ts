import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NirvanaProtocol } from "../target/types/nirvana_protocol";
import {
  createMint,
  createAccount,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";

describe("nirvana", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.NirvanaProtocol as Program<NirvanaProtocol>;

  let mint: anchor.web3.PublicKey;
  let authorityTokenAccount: anchor.web3.PublicKey;
  let recipientTokenAccount: anchor.web3.PublicKey;

  const authority = anchor.web3.Keypair.generate();
  const recipient = anchor.web3.Keypair.generate();

  async function airdrop(pubkey: anchor.web3.PublicKey, amount: number) {
    const sig = await provider.connection.requestAirdrop(pubkey, amount);
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  before(async () => {
    await airdrop(authority.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await airdrop(recipient.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL);

    mint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6
    );

    authorityTokenAccount = await createAccount(
      provider.connection,
      authority,
      mint,
      authority.publicKey
    );

    recipientTokenAccount = await createAccount(
      provider.connection,
      recipient,
      mint,
      recipient.publicKey
    );

    await mintTo(
      provider.connection,
      authority,
      mint,
      authorityTokenAccount,
      authority.publicKey,
      1_000_000_000_000
    );
  });

  it("creates a stream", async () => {
    const baseAmount = new anchor.BN(100_000_000);
    const milestoneAmount = new anchor.BN(50_000_000);
    const now = Math.floor(Date.now() / 1000);
    const startTime = new anchor.BN(now + 5);
    const endTime = new anchor.BN(now + 3600);
    const cliffTime = new anchor.BN(now + 10);

    const [distributionStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("state"),
        authority.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
      ],
      program.programId
    );

    const [tokenVaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), distributionStatePda.toBuffer()],
      program.programId
    );

    await program.methods
      .createStream(baseAmount, milestoneAmount, startTime, endTime, cliffTime)
      .accounts({
        authority: authority.publicKey,
        recipient: recipient.publicKey,
        tokenMint: mint,
        authorityTokenAccount,
        distributionState: distributionStatePda,
        tokenVault: tokenVaultPda,
      })
      .signers([authority])
      .rpc();

    const state = await program.account.distributionState.fetch(
      distributionStatePda
    );

    assert.equal(state.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(state.recipient.toBase58(), recipient.publicKey.toBase58());
    assert.equal(state.baseAmount.toNumber(), 100_000_000);
    assert.equal(state.milestoneAmount.toNumber(), 50_000_000);
    assert.equal(state.claimedAmount.toNumber(), 0);
    assert.equal(state.milestoneAchieved, false);
    assert.equal(state.isCancelled, false);

    const vault = await provider.connection.getTokenAccountBalance(
      tokenVaultPda
    );
    assert.equal(vault.value.uiAmount, 150);
  });

  it("fails to create a stream with invalid time range", async () => {
    const baseAmount = new anchor.BN(100_000_000);
    const milestoneAmount = new anchor.BN(50_000_000);
    const now = Math.floor(Date.now() / 1000);

    const recipient2 = anchor.web3.Keypair.generate();
    await airdrop(recipient2.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);

    const [distributionStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("state"),
        authority.publicKey.toBuffer(),
        recipient2.publicKey.toBuffer(),
      ],
      program.programId
    );

    const [tokenVaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), distributionStatePda.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .createStream(
          baseAmount,
          milestoneAmount,
          new anchor.BN(now + 100),
          new anchor.BN(now + 10),
          new anchor.BN(now + 50)
        )
        .accounts({
          authority: authority.publicKey,
          recipient: recipient2.publicKey,
          tokenMint: mint,
          authorityTokenAccount,
          distributionState: distributionStatePda,
          tokenVault: tokenVaultPda,
        })
        .signers([authority])
        .rpc();
      assert.fail("should have thrown");
    } catch (err) {
      assert.isTrue(
        err.toString().includes("InvalidTimeRange") ||
          err.toString().includes("InvalidCliff")
      );
    }
  });
});
