"use client";

// Bridges Privy's embedded Solana wallet to an Anchor Program.
// Privy signs serialized transactions (Uint8Array); Anchor wants an object with
// signTransaction / signAllTransactions, so we wrap one around the other.

import { useMemo, useRef } from "react";
import { useWallets, useSignTransaction } from "@privy-io/react-auth/solana";
import { Transaction, VersionedTransaction, PublicKey } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import { getConnection, getProgram, type SignerWallet } from "@/lib/anchor";
import { useAuth } from "@/app/providers/privy-provider";

type AnyTx = Transaction | VersionedTransaction;

function serialize(tx: AnyTx): Uint8Array {
  return tx instanceof VersionedTransaction
    ? tx.serialize()
    : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
}

function deserialize(bytes: Uint8Array, versioned: boolean): AnyTx {
  return versioned
    ? VersionedTransaction.deserialize(bytes)
    : Transaction.from(bytes);
}

export interface NirvanaProgram {
  program: Program | null;
  walletPubkey: PublicKey | null;
  ready: boolean;
}

export function useNirvanaProgram(): NirvanaProgram {
  const { wallets, ready } = useWallets();
  const { signTransaction } = useSignTransaction();
  const { user } = useAuth();

  // Pick the signing wallet deterministically. `wallets[0]` varies with whatever
  // wallet extensions happen to be connected, so a MetaMask user with Phantom
  // also installed got a Phantom popup on confirm. Prefer the account Privy
  // treats as primary (user.wallet), then the Privy embedded wallet, then the
  // first connected one. Whatever we pick is BOTH the signer and the address the
  // dashboard filters by, so they always stay in sync.
  const primaryAddress = user?.wallet?.address;
  const wallet =
    wallets.find((w) => w.address === primaryAddress) ??
    // The Privy embedded Solana wallet registers under the Wallet Standard with
    // the name "Privy" — prefer it so a MetaMask/email user isn't prompted via
    // a coincidentally-connected Phantom extension.
    wallets.find((w) => /privy/i.test(w.standardWallet?.name ?? "")) ??
    wallets[0];
  const address = wallet?.address ?? null;

  // Privy's useWallets() returns a NEW wallet object reference every render, so
  // memoizing on `wallet` made `program`/`walletPubkey` change identity each
  // render — which re-fired useStreams' fetch on every render (a
  // getProgramAccounts flood that 429s the RPC). Memoize on the stable address
  // string instead, and read the live signer/wallet from a ref so signing still
  // uses the current values without churning the program's identity.
  const signRef = useRef({ signTransaction, wallet });
  signRef.current = { signTransaction, wallet };

  return useMemo(() => {
    if (!address) {
      return { program: null, walletPubkey: null, ready };
    }

    const publicKey = new PublicKey(address);

    const signer: SignerWallet = {
      publicKey,
      async signTransaction(tx: AnyTx) {
        const versioned = tx instanceof VersionedTransaction;
        const { signTransaction, wallet } = signRef.current;
        const { signedTransaction } = await signTransaction({
          transaction: serialize(tx),
          wallet,
        });
        return deserialize(signedTransaction, versioned);
      },
      async signAllTransactions(txs: AnyTx[]) {
        const out: AnyTx[] = [];
        for (const tx of txs) out.push(await this.signTransaction(tx));
        return out;
      },
    };

    return {
      program: getProgram(signer, getConnection()),
      walletPubkey: publicKey,
      ready,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, ready]);
}
