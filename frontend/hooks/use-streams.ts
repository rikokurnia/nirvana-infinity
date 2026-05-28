"use client";

// On-chain streams hook. Same interface as the former localStorage mock, so
// existing pages keep working — but every read/write now hits the Nirvana
// program on Solana via the Privy-signed Anchor provider.

import { useCallback, useEffect, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import type { DistributionState } from "@/lib/types";
import { calculateClaimable } from "@/lib/utils";
import {
  cancel as cancelOnChain,
  createStream as createStreamOnChain,
  fetchStreamsFor,
  releaseVault as releaseVaultOnChain,
  withdraw as withdrawOnChain,
} from "@/lib/anchor";
import { useNirvanaProgram } from "@/hooks/use-nirvana-program";

interface CreateStreamInput {
  recipient: string;
  tokenMint: string;
  tokenSymbol: string;
  baseAmount: number;
  milestoneAmount: number;
  cliffAmount: number; // lump unlocked at cliffTime; stored on-chain
  startTime: number;
  endTime: number;
  cliffTime: number;
}

function toErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Friendly mapping for common on-chain failures. Match against raw logs since
  // anchor wraps the SystemProgram error 0x0 (Allocate already-in-use) with no
  // dedicated code we can pattern-match against directly.
  if (
    raw.includes("Allocate: account") &&
    raw.includes("already in use")
  ) {
    return (
      "A previous stream's vault to this recipient still exists on-chain. " +
      "Cancel the existing stream first (this releases the vault), or use a " +
      "different recipient address."
    );
  }
  if (raw.includes("StartTimeInPast")) {
    return "Start date is in the past. Pick today or later.";
  }
  if (raw.includes("InvalidTimeRange")) {
    return "End date must be after the start date.";
  }
  if (raw.includes("InvalidCliff")) {
    return "Cliff date must be between the start and end dates.";
  }
  if (raw.includes("AlreadyCancelled")) {
    return "This stream is already cancelled.";
  }
  if (raw.includes("FullyVested")) {
    return "Stream has fully vested — nothing left to cancel.";
  }
  if (raw.includes("User rejected") || raw.includes("WalletSignTransactionError")) {
    return "You rejected the wallet signature.";
  }
  return raw;
}

export function useStreams() {
  const { program, walletPubkey } = useNirvanaProgram();
  const [streams, setStreams] = useState<DistributionState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!program || !walletPubkey) return;
    setLoading(true);
    setError(null);
    try {
      setStreams(await fetchStreamsFor(program, walletPubkey));
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [program, walletPubkey]);

  // Sync from chain whenever the connected wallet / program changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!program || !walletPubkey) {
        if (!cancelled) setStreams([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const fetched = await fetchStreamsFor(program, walletPubkey);
        if (!cancelled) setStreams(fetched);
      } catch (err) {
        if (!cancelled) setError(toErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [program, walletPubkey]);

  const getWorkerStreams = useCallback(
    (workerAddress: string): DistributionState[] =>
      workerAddress
        ? streams.filter((s) => s.recipient === workerAddress)
        : [],
    [streams]
  );

  // Founder view: only streams this wallet created (authority), NEVER streams
  // where this wallet is just a recipient — otherwise incoming streams leak
  // into the founder dashboard.
  const getFounderStreams = useCallback(
    (founderAddress: string): DistributionState[] =>
      founderAddress
        ? streams.filter((s) => s.authority === founderAddress)
        : [],
    [streams]
  );

  const getStream = useCallback(
    (id: string) => streams.find((s) => s.id === id),
    [streams]
  );

  const getClaimable = useCallback(
    (stream: DistributionState) => calculateClaimable(stream),
    []
  );

  /** Throws on failure so callers can surface the message; also sets `error`. */
  const handleCreateStream = useCallback(
    async (params: CreateStreamInput): Promise<string> => {
      if (!program) throw new Error("Connect your wallet first.");
      setLoading(true);
      setError(null);
      try {
        const mint = new PublicKey(params.tokenMint);
        const { decimals } = await getMint(program.provider.connection, mint);
        const scale = (v: number) =>
          new BN(Math.round(v * 10 ** decimals).toString());
        const signature = await createStreamOnChain(program, {
          recipient: new PublicKey(params.recipient),
          tokenMint: mint,
          baseAmount: scale(params.baseAmount),
          cliffAmount: scale(params.cliffAmount),
          milestoneAmount: scale(params.milestoneAmount),
          startTime: params.startTime,
          endTime: params.endTime,
          cliffTime: params.cliffTime,
        });
        await refresh();
        return signature;
      } catch (err) {
        setError(toErrorMessage(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [program, refresh]
  );

  const handleWithdraw = useCallback(
    async (streamId: string): Promise<string> => {
      if (!program) throw new Error("Connect your wallet first.");
      const stream = streams.find((s) => s.id === streamId);
      if (!stream) throw new Error("Stream not found.");
      setLoading(true);
      setError(null);
      try {
        const signature = await withdrawOnChain(
          program,
          new PublicKey(stream.id),
          new PublicKey(stream.tokenMint)
        );
        await refresh();
        return signature;
      } catch (err) {
        setError(toErrorMessage(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [program, streams, refresh]
  );

  const handleCancel = useCallback(
    async (streamId: string): Promise<string> => {
      if (!program) throw new Error("Connect your wallet first.");
      const stream = streams.find((s) => s.id === streamId);
      if (!stream) throw new Error("Stream not found.");
      setLoading(true);
      setError(null);
      try {
        const signature = await cancelOnChain(
          program,
          new PublicKey(stream.id),
          new PublicKey(stream.recipient),
          new PublicKey(stream.tokenMint)
        );
        await refresh();
        return signature;
      } catch (err) {
        setError(toErrorMessage(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [program, streams, refresh]
  );

  const handleReleaseVault = useCallback(
    async (recipient: string, tokenMint: string): Promise<string> => {
      if (!program) throw new Error("Connect your wallet first.");
      setLoading(true);
      setError(null);
      try {
        const signature = await releaseVaultOnChain(
          program,
          new PublicKey(recipient),
          new PublicKey(tokenMint)
        );
        await refresh();
        return signature;
      } catch (err) {
        setError(toErrorMessage(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [program, refresh]
  );

  return {
    streams,
    loading,
    error,
    refresh,
    getStream,
    getClaimable,
    getWorkerStreams,
    getFounderStreams,
    handleWithdraw,
    handleReleaseVault,
    handleCancel,
    handleCreateStream,
  };
}
