# Integration Guide

This guide explains how to integrate with the Nirvana Protocol from a frontend or backend application using the `@coral-xyz/anchor` and `@solana/spl-token` libraries.

## 1. Setup and Initialization

First, install the necessary dependencies:

```bash
npm install @coral-xyz/anchor @solana/spl-token @solana/web3.js
```

Initialize your Anchor provider and program instance:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
// Import your generated IDL type here
import { NirvanaProtocol } from "../target/types/nirvana_protocol"; 
import IDL from "../target/idl/nirvana_protocol.json";

// Setup provider (Assumes you have a wallet connected via WalletAdapter)
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

// Initialize program
const programId = new anchor.web3.PublicKey("FxPnV48rg9KkK6huUimjcjL9H4xssM8n7j3uva8k9tmc");
const program = new Program(IDL as any, provider);
```

## 2. Deriving PDAs

The protocol relies on Program Derived Addresses (PDAs) for the `DistributionState` and the token vault. You need to derive these before making any transactions.

The `DistributionState` is seeded by `[b"state", authority, recipient, nonce]`.

```typescript
function getStreamPDAs(
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
```

## 3. Creating a Stream

To create a stream, generate a unique `nonce` (like a timestamp), derive the PDAs, and send the transaction.

```typescript
async function createNewStream(
  authority: anchor.web3.PublicKey,
  recipient: anchor.web3.PublicKey,
  tokenMint: anchor.web3.PublicKey,
  authorityTokenAccount: anchor.web3.PublicKey
) {
  // Use current timestamp as a unique nonce
  const nonce = new anchor.BN(Date.now());
  const { statePda, vaultPda } = getStreamPDAs(authority, recipient, nonce);

  const now = Math.floor(Date.now() / 1000);
  
  // Vesting parameters
  const baseAmount = new anchor.BN(100_000_000); // 100 tokens (assuming 6 decimals)
  const cliffAmount = new anchor.BN(0);
  const milestoneAmount = new anchor.BN(50_000_000); // 50 tokens
  
  const startTime = new anchor.BN(now);
  const cliffTime = new anchor.BN(now + 86400); // 1 day cliff
  const endTime = new anchor.BN(now + 86400 * 30); // 30 day duration
  const arbiter = null; // No third-party arbiter

  // Send transaction
  const tx = await program.methods
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
      authority: authority,
      recipient: recipient,
      tokenMint: tokenMint,
      authorityTokenAccount: authorityTokenAccount,
      distributionState: statePda,
      tokenVault: vaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("Stream created! Signature:", tx);
  return { nonce, statePda };
}
```

## 4. Withdrawing Funds

As a recipient, to claim your vested tokens, you need the `nonce` of the stream (which can be fetched by querying all `DistributionState` accounts where `recipient == yourPublicKey`).

```typescript
async function claimTokens(
  recipient: anchor.web3.PublicKey,
  authority: anchor.web3.PublicKey,
  recipientTokenAccount: anchor.web3.PublicKey,
  nonce: anchor.BN
) {
  const { statePda, vaultPda } = getStreamPDAs(authority, recipient, nonce);

  const tx = await program.methods
    .withdraw()
    .accounts({
      recipient: recipient,
      distributionState: statePda,
      tokenVault: vaultPda,
      recipientTokenAccount: recipientTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("Tokens claimed! Signature:", tx);
}
```

## 5. Fetching Active Streams

To display streams in a UI, you can query the blockchain using Anchor's `memcmp` filters:

```typescript
// Fetch all streams where the connected wallet is the recipient
const recipientStreams = await program.account.distributionState.all([
  {
    memcmp: {
      offset: 8 + 32, // Discriminator (8) + Authority Pubkey (32)
      bytes: recipientPublicKey.toBase58(),
    },
  },
]);

recipientStreams.forEach(stream => {
  console.log(`Stream from ${stream.account.authority.toString()}`);
  console.log(`Nonce: ${stream.account.nonce.toString()}`);
  console.log(`Claimed: ${stream.account.claimedAmount.toString()}`);
});
```
