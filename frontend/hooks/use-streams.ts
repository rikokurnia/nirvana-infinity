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
  if (err instanceof Error) return err.message;
  return String(err);
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
    async (params: CreateStreamInput) => {
      if (!program) throw new Error("Connect your wallet first.");
      setLoading(true);
      setError(null);
      try {
        const mint = new PublicKey(params.tokenMint);
        const { decimals } = await getMint(program.provider.connection, mint);
        const scale = (v: number) =>
          new BN(Math.round(v * 10 ** decimals).toString());
        await createStreamOnChain(program, {
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
    async (streamId: string) => {
      if (!program) throw new Error("Connect your wallet first.");
      const stream = streams.find((s) => s.id === streamId);
      if (!stream) throw new Error("Stream not found.");
      setLoading(true);
      setError(null);
      try {
        await withdrawOnChain(
          program,
          new PublicKey(stream.id),
          new PublicKey(stream.tokenMint)
        );
        await refresh();
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
    async (streamId: string) => {
      if (!program) throw new Error("Connect your wallet first.");
      const stream = streams.find((s) => s.id === streamId);
      if (!stream) throw new Error("Stream not found.");
      setLoading(true);
      setError(null);
      try {
        await cancelOnChain(
          program,
          new PublicKey(stream.id),
          new PublicKey(stream.recipient),
          new PublicKey(stream.tokenMint)
        );
        await refresh();
      } catch (err) {
        setError(toErrorMessage(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [program, streams, refresh]
  );

  return {
    streams,
    loading,
    error,
    refresh,
    getStream,
    getClaimable,
    getWorkerStreams,
    handleWithdraw,
    handleCancel,
    handleCreateStream,
  };
}
