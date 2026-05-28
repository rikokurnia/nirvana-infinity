"use client";

// Bridges Privy's embedded Solana wallet to an Anchor Program.
// Privy signs serialized transactions (Uint8Array); Anchor wants an object with
// signTransaction / signAllTransactions, so we wrap one around the other.

import { useMemo } from "react";
import { useWallets, useSignTransaction } from "@privy-io/react-auth/solana";
import { Transaction, VersionedTransaction, PublicKey } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import { getConnection, getProgram, type SignerWallet } from "@/lib/anchor";

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

  const wallet = wallets[0]; // Privy's active embedded Solana wallet

  return useMemo(() => {
    if (!wallet?.address) {
      return { program: null, walletPubkey: null, ready };
    }

    const publicKey = new PublicKey(wallet.address);

    const signer: SignerWallet = {
      publicKey,
      async signTransaction(tx: AnyTx) {
        const versioned = tx instanceof VersionedTransaction;
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
  }, [wallet, signTransaction, ready]);
}
