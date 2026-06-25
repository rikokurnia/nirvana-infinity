// On-chain service layer for the Nirvana vesting program.
// Pure (no React) — call these with a Program built by useNirvanaProgram().

import {
  AnchorProvider,
  BorshAccountsCoder,
  BN,
  Program,
  type Idl,
} from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import idlJson from "./idl.json";
import type { DistributionState } from "./types";
import { MOCK_TOKEN_SYMBOLS, MOCK_TOKEN_DECIMALS } from "./tokens";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ??
    "DygVVPMyA2WnbfJiqta38ySR3YhnKbqbFcNzcsjkti4K"
);

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

// WebSocket endpoint for confirmation subscriptions (signatureSubscribe). The
// Helius free tier's WS does NOT implement signatureSubscribe (-32601 "Method
// not found"), which broke tx confirmation for Phantom. The public devnet WS
// supports it, so default the WS to that even when HTTP runs through Helius.
// Override with NEXT_PUBLIC_WS_URL if you have a paid WS that supports it.
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "wss://api.devnet.solana.com";

// `getProgramAccounts` is blocked on most free RPC tiers (Helius/QuickNode/etc.
// return "getProgramAccounts is not available on the Free tier"). The public
// devnet endpoint allows it, so we run gPA scans through a dedicated connection.
// Override with NEXT_PUBLIC_GPA_RPC_URL if you have a paid RPC that supports it.
export const GPA_RPC_URL =
  process.env.NEXT_PUBLIC_GPA_RPC_URL ?? "https://api.devnet.solana.com";

let gpaConnection: Connection | null = null;
function getGpaConnection(): Connection {
  if (!gpaConnection) gpaConnection = new Connection(GPA_RPC_URL, "confirmed");
  return gpaConnection;
}

export const idl = idlJson as Idl;

// Decode program accounts with a coder built directly from the IDL. The
// Program's own `program.coder.accounts` throws "Account not found:
// DistributionState" under Anchor 0.31 (account-name lookup quirk), so we use
// our own coder which decodes the current account layout correctly.
const accountsCoder = new BorshAccountsCoder(idl);

export function getConnection(): Connection {
  // Plain connection — let web3.js use the browser's native fetch (and its own
  // built-in 429 handling). A custom `fetch` wrapper here was causing
  // "TypeError: Failed to fetch" in the browser. Read-level backoff lives in
  // the helpers below (getTokenUiBalance / getMintDecimals).
  return new Connection(RPC_URL, {
    commitment: "confirmed",
    // Devnet often takes >30s to confirm under load; the 30s default made
    // create/claim throw "Transaction was not confirmed in 30.00 seconds"
    // even when the tx actually landed. Wait out the full blockhash window.
    confirmTransactionInitialTimeout: 90_000,
    // Confirm over a WS that actually supports signatureSubscribe (Helius free
    // returns -32601). HTTP reads still go through RPC_URL.
    wsEndpoint: WS_URL,
  });
}

/** True when an RPC error means "this token account doesn't exist yet" (vs. a
 *  transient network/429 failure, which must NOT be read as a zero balance). */
function isAccountMissing(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err);
  return /could not find account|account does not exist|invalid param|account not found/i.test(
    msg
  );
}

/** True for transient RPC failures worth retrying (rate limit / network). */
function isTransientRpcError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err);
  return /429|too many requests|rate limit|fetch failed|timeout|503|502|504|-32504|ECONNRESET/i.test(
    msg
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const BLOCKHASH_RETRY =
  /blockhash not found|block height exceeded|transaction expired|has been processed/i;

/** Sign + send with a blockhash fetched immediately before signing.
 *  Privy/Phantom popups often take long enough that Anchor's default `.rpc()`
 *  blockhash expires → "Blockhash not found" on devnet. */
async function confirmTransaction(
  program: Program,
  buildTx: () => Promise<Transaction>
): Promise<string> {
  const connection = program.provider.connection;
  const wallet = program.provider.wallet;
  if (!wallet?.publicKey) {
    throw new Error("Connect your wallet first.");
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const tx = await buildTx();
      const latest = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = latest.blockhash;
      tx.feePayer = wallet.publicKey;

      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 5,
        preflightCommitment: "confirmed",
      });

      const result = await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        "confirmed"
      );
      if (result.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
      }
      return sig;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < 2 && BLOCKHASH_RETRY.test(msg)) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Transaction failed after retries");
}

/** Run an async RPC read with backoff on transient (429/network) errors.
 *  Rethrows non-transient errors immediately; returns `onGiveUp` if every
 *  retry is exhausted. */
async function withRpcRetry<T>(
  fn: () => Promise<T>,
  onGiveUp: () => T,
  attempts = 4
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientRpcError(err)) throw err;
      await sleep(400 * 2 ** i); // 400 / 800 / 1600ms
    }
  }
  console.warn("withRpcRetry: gave up after rate limits", lastErr);
  return onGiveUp();
}

/** Decimals for a mint. Mock tokens are known statically (no RPC needed);
 *  unknown mints fall back to a retrying getMint, then to 9. */
export async function getMintDecimals(
  mint: PublicKey,
  connection: Connection = getConnection()
): Promise<number> {
  const known = MOCK_TOKEN_DECIMALS[mint.toBase58()];
  if (known !== undefined) return known;
  return withRpcRetry(
    async () => (await getMint(connection, mint)).decimals,
    () => 9
  );
}

/** Read an SPL token balance (UI units) with backoff on rate limits.
 *  Returns the balance, or `null` when the balance can't be determined because
 *  of a transient RPC error (so callers can fail-open instead of blocking). */
export async function getTokenUiBalance(
  mint: PublicKey,
  owner: PublicKey,
  connection: Connection = getConnection()
): Promise<number | null> {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  try {
    return await withRpcRetry(
      async () => {
        const bal = await connection.getTokenAccountBalance(ata);
        return bal.value.uiAmount ?? 0;
      },
      () => null as number | null // out of retries → undeterminable
    );
  } catch (err) {
    if (isAccountMissing(err)) return 0; // genuinely unfunded
    console.warn("getTokenUiBalance: could not read balance", err);
    return null; // caller should fail-open
  }
}

/** Minimal wallet shape AnchorProvider needs (satisfied by the Privy bridge). */
export interface SignerWallet {
  publicKey: PublicKey;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTransaction: (tx: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signAllTransactions: (txs: any[]) => Promise<any[]>;
}

export function getProgram(
  wallet: SignerWallet,
  connection: Connection = getConnection()
): Program {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
    // Devnet is congested — have the RPC node rebroadcast the signed tx several
    // times so it lands before the blockhash expires ("block height exceeded").
    maxRetries: 5,
  });
  // anchor 0.30+ signature: program id is read from idl.address
  return new Program(idl, provider);
}

// --- PDA derivations (must match programs/nirvana/src/lib.rs) ---

export function deriveStatePda(
  authority: PublicKey,
  recipient: PublicKey,
  nonce: BN | bigint | number
): PublicKey {
  const nonceBn = nonce instanceof BN ? nonce : new BN(nonce.toString());
  // u64 little-endian, 8 bytes — must match `&nonce.to_le_bytes()` in the program.
  const nonceBuf = nonceBn.toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("state"), authority.toBuffer(), recipient.toBuffer(), nonceBuf],
    PROGRAM_ID
  )[0];
}

/**
 * Legacy state PDA derivation (pre-nonce). Used only by `releaseVault` to
 * clean up orphan vaults from streams created before the nonce upgrade.
 */
export function deriveLegacyStatePda(
  authority: PublicKey,
  recipient: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("state"), authority.toBuffer(), recipient.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function deriveVaultPda(statePda: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), statePda.toBuffer()],
    PROGRAM_ID
  )[0];
}

/** Returns [ata, ix] where `ix` is an *idempotent* create-ATA instruction:
 *  it no-ops on-chain if the ATA already exists and creates it otherwise.
 *
 *  We used to check getAccountInfo first and only create when missing, but a
 *  stale/lagging RPC read returned null for an ATA that actually existed, so we
 *  sent a plain Create against an existing account → the ATA program rejected it
 *  with "Provided owner is not allowed". The idempotent instruction removes that
 *  whole class of race entirely. */
function ensureAta(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): [PublicKey, TransactionInstruction] {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  return [
    ata,
    createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint),
  ];
}

// --- Instruction wrappers ---

export interface CreateStreamArgs {
  recipient: PublicKey;
  tokenMint: PublicKey;
  baseAmount: BN; // in base units (already scaled by decimals)
  cliffAmount: BN; // lump unlocked at cliffTime
  milestoneAmount: BN;
  startTime: number; // unix seconds
  endTime: number;
  cliffTime: number;
  arbiter?: PublicKey | null; // optional third party allowed to trigger milestone
  /** Optional explicit nonce. Defaults to Date.now() — unique per millisecond. */
  nonce?: BN;
}

export async function createStream(
  program: Program,
  args: CreateStreamArgs
): Promise<string> {
  const authority = program.provider.publicKey!;
  const nonce = args.nonce ?? new BN(Date.now());
  const statePda = deriveStatePda(authority, args.recipient, nonce);
  const vaultPda = deriveVaultPda(statePda);
  const authorityTokenAccount = getAssociatedTokenAddressSync(
    args.tokenMint,
    authority
  );

  return confirmTransaction(program, () =>
    program.methods
      .createStream(
        nonce,
        args.baseAmount,
        args.cliffAmount,
        args.milestoneAmount,
        new BN(args.startTime),
        new BN(args.endTime),
        new BN(args.cliffTime),
        args.arbiter ?? null
      )
      .accounts({
        authority,
        recipient: args.recipient,
        tokenMint: args.tokenMint,
        distributionState: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction()
  );
}

export async function withdraw(
  program: Program,
  statePda: PublicKey,
  tokenMint: PublicKey
): Promise<string> {
  const recipient = program.provider.publicKey!;
  const vaultPda = deriveVaultPda(statePda);
  const [recipientTokenAccount, ataIx] = ensureAta(
    recipient,
    recipient,
    tokenMint
  );

  return confirmTransaction(program, () =>
    program.methods
      .withdraw()
      .accounts({
        recipient,
        distributionState: statePda,
        tokenVault: vaultPda,
        recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .preInstructions([ataIx])
      .transaction()
  );
}

export async function cancel(
  program: Program,
  statePda: PublicKey,
  recipient: PublicKey,
  tokenMint: PublicKey
): Promise<string> {
  const authority = program.provider.publicKey!;
  const vaultPda = deriveVaultPda(statePda);
  const authorityTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    authority
  );
  // authority pays to ensure recipient's ATA exists so vested funds can settle.
  const [recipientTokenAccount, ataIx] = ensureAta(
    authority,
    recipient,
    tokenMint
  );

  return confirmTransaction(program, () =>
    program.methods
      .cancel()
      .accounts({
        authority,
        distributionState: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount,
        recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .preInstructions([ataIx])
      .transaction()
  );
}

export async function triggerMilestone(
  program: Program,
  statePda: PublicKey
): Promise<string> {
  return confirmTransaction(program, () =>
    program.methods
      .triggerMilestone()
      .accounts({
        triggerer: program.provider.publicKey!,
        distributionState: statePda,
      })
      .transaction()
  );
}

export async function reclaimMilestone(
  program: Program,
  statePda: PublicKey,
  tokenMint: PublicKey
): Promise<string> {
  const authority = program.provider.publicKey!;
  const vaultPda = deriveVaultPda(statePda);
  const authorityTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    authority
  );

  return confirmTransaction(program, () =>
    program.methods
      .reclaimMilestone()
      .accounts({
        authority,
        distributionState: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction()
  );
}

export interface TopUpArgs {
  statePda: PublicKey;
  tokenMint: PublicKey;
  additionalBase: BN; // base units; pass new BN(0) to only extend
  newEndTime?: number | null; // unix seconds; null to leave unchanged
}

/**
 * Cleanup for orphaned vaults left by streams cancelled before the
 * cancel-closes-vault upgrade. Releases the vault PDA for a (founder, recipient)
 * pair when no live state PDA exists, refunding any leftover tokens to the
 * founder.
 */
export async function releaseVault(
  program: Program,
  recipient: PublicKey,
  tokenMint: PublicKey
): Promise<string> {
  const authority = program.provider.publicKey!;
  // Legacy (no-nonce) derivation — release_vault targets pre-nonce orphan vaults only.
  const statePda = deriveLegacyStatePda(authority, recipient);
  const vaultPda = deriveVaultPda(statePda);
  const authorityTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    authority
  );

  return confirmTransaction(program, () =>
    program.methods
      .releaseVault()
      .accounts({
        authority,
        recipient,
        stateSigner: statePda,
        tokenVault: vaultPda,
        authorityTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction()
  );
}

export async function topUp(
  program: Program,
  args: TopUpArgs
): Promise<string> {
  const authority = program.provider.publicKey!;
  const vaultPda = deriveVaultPda(args.statePda);
  const authorityTokenAccount = getAssociatedTokenAddressSync(
    args.tokenMint,
    authority
  );

  return confirmTransaction(program, () =>
    program.methods
      .topUp(
        args.additionalBase,
        args.newEndTime != null ? new BN(args.newEndTime) : null
      )
      .accounts({
        authority,
        distributionState: args.statePda,
        tokenVault: vaultPda,
        authorityTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction()
  );
}

// --- Reads ---

const TOKEN_SYMBOLS: Record<string, string> = {
  So11111111111111111111111111111111111111112: "SOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: "BONK",
  // Devnet mock SPL tokens minted by the in-app faucet (addresses set per-deploy).
  ...MOCK_TOKEN_SYMBOLS,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAccount(pubkey: PublicKey, acc: any, decimals: number): DistributionState {
  // Anchor 0.31's IDL keeps field names in snake_case, and BorshAccountsCoder
  // returns the decoded account with those exact keys — so it's `token_mint`,
  // not `tokenMint`. Reading the camelCase names gave `undefined` and threw on
  // `.toBase58()`, which made fetchStreamsFor reject and left the UI empty.
  const mint = acc.token_mint.toBase58();
  const arbiter = acc.arbiter.toBase58();
  return {
    id: pubkey.toBase58(),
    authority: acc.authority.toBase58(),
    recipient: acc.recipient.toBase58(),
    tokenMint: mint,
    tokenSymbol: TOKEN_SYMBOLS[mint] ?? "TOKEN",
    tokenDecimals: decimals,
    baseAmount: BigInt(acc.base_amount.toString()),
    milestoneAmount: BigInt(acc.milestone_amount.toString()),
    cliffAmount: BigInt(acc.cliff_amount.toString()),
    claimedAmount: BigInt(acc.claimed_amount.toString()),
    startTime: acc.start_time.toNumber(),
    endTime: acc.end_time.toNumber(),
    cliffTime: acc.cliff_time.toNumber(),
    milestoneAchieved: acc.milestone_achieved,
    isCancelled: acc.is_cancelled,
    // PublicKey.default (all-1s base58) means "no arbiter".
    arbiter: arbiter === PublicKey.default.toBase58() ? "" : arbiter,
    nonce: BigInt(acc.nonce.toString()),
  };
}

/** All streams where `wallet` is either the creator (authority) or the recipient. */
export async function fetchStreamsFor(
  program: Program,
  wallet: PublicKey
): Promise<DistributionState[]> {
  // Decode each account individually and skip ones that fail. Legacy streams
  // created before the nonce upgrade are 8 bytes shorter, and Anchor's
  // .all() throws on the first undecodable account — which wiped the entire
  // list (overview showed nothing even though current streams exist).
  const accountName = idl.accounts?.[0]?.name ?? "DistributionState";
  // idl is loaded untyped, so decoded accounts aren't known statically.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchByOffset = async (offset: number): Promise<{ publicKey: PublicKey; account: any }[]> => {
    const filters = [{ memcmp: { offset, bytes: wallet.toBase58() } }];
    const gpaConn = getGpaConnection();

    // Heavy gPA scans use the dedicated endpoint (public devnet by default).
    // Helius free tier times out (-32504) when used as the primary RPC.
    const raw = await withRpcRetry(
      async () => gpaConn.getProgramAccounts(PROGRAM_ID, { filters }),
      () => {
        throw new Error(
          "Could not load streams — devnet RPC timed out. Check NEXT_PUBLIC_GPA_RPC_URL and retry."
        );
      },
      3
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decoded: { publicKey: PublicKey; account: any }[] = [];
    for (const { pubkey, account } of raw) {
      try {
        decoded.push({
          publicKey: pubkey,
          account: accountsCoder.decode(accountName, account.data),
        });
      } catch {
        // Legacy pre-nonce streams are a shorter layout and fail to decode —
        // skip them rather than failing the whole list.
      }
    }
    return decoded;
  };
  const [asAuthority, asRecipient] = await Promise.all([
    fetchByOffset(8), // offset of `authority`
    fetchByOffset(8 + 32), // offset of `recipient`
  ]);

  // Fetch decimals once per unique mint so the UI can render base units
  // correctly (mUSDC=6, SOL=9, etc.). Missing/failed → default to 9.
  const allAccounts = [...asAuthority, ...asRecipient];
  const uniqueMints = Array.from(
    new Set(allAccounts.map(({ account }) => account.token_mint.toBase58()))
  );
  const decimalsByMint = new Map<string, number>();
  // Sequential (not parallel) + known-decimals shortcut keeps the public devnet
  // RPC from 429ing; getMintDecimals retries and falls back to 9.
  for (const m of uniqueMints) {
    decimalsByMint.set(
      m,
      await getMintDecimals(new PublicKey(m), program.provider.connection)
    );
  }

  const byId = new Map<string, DistributionState>();
  for (const { publicKey, account } of allAccounts) {
    const mint = account.token_mint.toBase58();
    byId.set(
      publicKey.toBase58(),
      mapAccount(publicKey, account, decimalsByMint.get(mint) ?? 9)
    );
  }
  return [...byId.values()];
}
