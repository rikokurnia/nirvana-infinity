// On-chain service layer for the Nirvana vesting program.
// Pure (no React) — call these with a Program built by useNirvanaProgram().

import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import idlJson from "./idl.json";
import type { DistributionState } from "./types";
import { MOCK_TOKEN_SYMBOLS, MOCK_TOKEN_DECIMALS } from "./tokens";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ??
    "FxPnV48rg9KkK6huUimjcjL9H4xssM8n7j3uva8k9tmc"
);

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

export const idl = idlJson as Idl;

export function getConnection(): Connection {
  // Plain connection — let web3.js use the browser's native fetch (and its own
  // built-in 429 handling). A custom `fetch` wrapper here was causing
  // "TypeError: Failed to fetch" in the browser. Read-level backoff lives in
  // the helpers below (getTokenUiBalance / getMintDecimals).
  return new Connection(RPC_URL, "confirmed");
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
  return /429|too many requests|rate limit|fetch failed|timeout|503|502|ECONNRESET/i.test(
    msg
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/** Idempotent: create owner's ATA if it doesn't exist yet. Returns [ata, maybeIx]. */
async function ensureAta(
  connection: Connection,
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): Promise<[PublicKey, TransactionInstruction | null]> {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const info = await withRpcRetry(
    () => connection.getAccountInfo(ata),
    () => {
      throw new Error(
        "Network is rate-limited (RPC 429). Please try again in a moment."
      );
    }
  );
  if (info) return [ata, null];
  return [
    ata,
    createAssociatedTokenAccountInstruction(payer, ata, owner, mint),
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

  return program.methods
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
    .rpc();
}

export async function withdraw(
  program: Program,
  statePda: PublicKey,
  tokenMint: PublicKey
): Promise<string> {
  const connection = program.provider.connection;
  const recipient = program.provider.publicKey!;
  const vaultPda = deriveVaultPda(statePda);
  const [recipientTokenAccount, ataIx] = await ensureAta(
    connection,
    recipient,
    recipient,
    tokenMint
  );

  const builder = program.methods.withdraw().accounts({
    recipient,
    distributionState: statePda,
    tokenVault: vaultPda,
    recipientTokenAccount,
    tokenProgram: TOKEN_PROGRAM_ID,
  });
  if (ataIx) builder.preInstructions([ataIx]);
  return builder.rpc();
}

export async function cancel(
  program: Program,
  statePda: PublicKey,
  recipient: PublicKey,
  tokenMint: PublicKey
): Promise<string> {
  const connection = program.provider.connection;
  const authority = program.provider.publicKey!;
  const vaultPda = deriveVaultPda(statePda);
  const authorityTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    authority
  );
  // authority pays to ensure recipient's ATA exists so vested funds can settle.
  const [recipientTokenAccount, ataIx] = await ensureAta(
    connection,
    authority,
    recipient,
    tokenMint
  );

  const builder = program.methods.cancel().accounts({
    authority,
    distributionState: statePda,
    tokenVault: vaultPda,
    authorityTokenAccount,
    recipientTokenAccount,
    tokenProgram: TOKEN_PROGRAM_ID,
  });
  if (ataIx) builder.preInstructions([ataIx]);
  return builder.rpc();
}

export async function triggerMilestone(
  program: Program,
  statePda: PublicKey
): Promise<string> {
  return program.methods
    .triggerMilestone()
    .accounts({
      triggerer: program.provider.publicKey!,
      distributionState: statePda,
    })
    .rpc();
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

  return program.methods
    .releaseVault()
    .accounts({
      authority,
      recipient,
      stateSigner: statePda,
      tokenVault: vaultPda,
      authorityTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
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

  return program.methods
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
    .rpc();
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
  const mint = acc.tokenMint.toBase58();
  const arbiter = acc.arbiter.toBase58();
  return {
    id: pubkey.toBase58(),
    authority: acc.authority.toBase58(),
    recipient: acc.recipient.toBase58(),
    tokenMint: mint,
    tokenSymbol: TOKEN_SYMBOLS[mint] ?? "TOKEN",
    tokenDecimals: decimals,
    baseAmount: BigInt(acc.baseAmount.toString()),
    milestoneAmount: BigInt(acc.milestoneAmount.toString()),
    cliffAmount: BigInt(acc.cliffAmount.toString()),
    claimedAmount: BigInt(acc.claimedAmount.toString()),
    startTime: acc.startTime.toNumber(),
    endTime: acc.endTime.toNumber(),
    cliffTime: acc.cliffTime.toNumber(),
    milestoneAchieved: acc.milestoneAchieved,
    isCancelled: acc.isCancelled,
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
  // idl is loaded untyped, so the account namespace isn't known statically.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const distributionState = (program.account as any).distributionState;
  const asAuthority = await distributionState.all([
    { memcmp: { offset: 8, bytes: wallet.toBase58() } },
  ]);
  const asRecipient = await distributionState.all([
    { memcmp: { offset: 8 + 32, bytes: wallet.toBase58() } },
  ]);

  // Fetch decimals once per unique mint so the UI can render base units
  // correctly (mUSDC=6, SOL=9, etc.). Missing/failed → default to 9.
  const allAccounts = [...asAuthority, ...asRecipient];
  const uniqueMints = Array.from(
    new Set(allAccounts.map(({ account }) => account.tokenMint.toBase58()))
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
    const mint = account.tokenMint.toBase58();
    byId.set(
      publicKey.toBase58(),
      mapAccount(publicKey, account, decimalsByMint.get(mint) ?? 9)
    );
  }
  return [...byId.values()];
}
