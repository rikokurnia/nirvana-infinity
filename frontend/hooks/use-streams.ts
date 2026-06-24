"use client";

// On-chain streams hook. Same interface as the former localStorage mock, so
// existing pages keep working — but every read/write now hits the Nirvana
// program on Solana via the Privy-signed Anchor provider.

import { useCallback, useEffect, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { DistributionState } from "@/lib/types";
import { calculateClaimable } from "@/lib/utils";
import {
  isFounderStreamActive,
  isWorkerStreamActive,
} from "@/lib/stream-status";
import {
  cancel as cancelOnChain,
  createStream as createStreamOnChain,
  fetchStreamsFor,
  getMintDecimals,
  reclaimMilestone as reclaimMilestoneOnChain,
  releaseVault as releaseVaultOnChain,
  triggerMilestone as triggerMilestoneOnChain,
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
  if (raw.includes("StreamNotEnded")) {
    return "Stream has not ended yet — reclaim is available after the end date.";
  }
  if (raw.includes("NothingToReclaim")) {
    return "No unclaimed milestone bonus to reclaim.";
  }
  if (raw.includes("StreamExpired")) {
    return "Stream has ended — milestone can no longer be triggered.";
  }
  if (raw.includes("MilestoneAlreadyAchieved")) {
    return "Milestone bonus was already triggered.";
  }
  if (raw.includes("CliffNotReached")) {
    return "Cliff date not reached yet — cliff buffer is still locked (linear may still be claimable on updated programs).";
  }
  if (raw.includes("NothingToWithdraw")) {
    return "Nothing to withdraw yet — wait for more tokens to unlock.";
  }
  if (/blockhash not found|block height exceeded|transaction expired/i.test(raw)) {
    return "Network timed out — please try again (devnet RPC blockhash expired).";
  }
  if (raw.includes("User rejected") || raw.includes("WalletSignTransactionError")) {
    return "You rejected the wallet signature.";
  }
  return raw;
}

export function useStreams() {
  const { program, walletPubkey, ready } = useNirvanaProgram();
  const [streams, setStreams] = useState<DistributionState[]>([]);
  // Start in the loading state so views render skeletons on first mount instead
  // of flashing "No streams yet" before the initial on-chain fetch resolves.
  const [loading, setLoading] = useState(true);
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
        // No wallet yet. Keep showing the loading state until Privy is `ready`;
        // only then is an empty list the real answer rather than "still
        // connecting".
        if (!cancelled) {
          setStreams([]);
          setLoading(!ready);
        }
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
  }, [program, walletPubkey, ready]);

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

  const getActiveWorkerStreams = useCallback(
    (workerAddress: string): DistributionState[] =>
      getWorkerStreams(workerAddress).filter(isWorkerStreamActive),
    [getWorkerStreams]
  );

  const getCompletedWorkerStreams = useCallback(
    (workerAddress: string): DistributionState[] =>
      getWorkerStreams(workerAddress).filter((s) => !isWorkerStreamActive(s)),
    [getWorkerStreams]
  );

  const getActiveFounderStreams = useCallback(
    (founderAddress: string): DistributionState[] =>
      getFounderStreams(founderAddress).filter(isFounderStreamActive),
    [getFounderStreams]
  );

  const getCompletedFounderStreams = useCallback(
    (founderAddress: string): DistributionState[] =>
      getFounderStreams(founderAddress).filter((s) => !isFounderStreamActive(s)),
    [getFounderStreams]
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
        const decimals = await getMintDecimals(
          mint,
          program.provider.connection
        );
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

  const handleTriggerMilestone = useCallback(
    async (streamId: string): Promise<string> => {
      if (!program) throw new Error("Connect your wallet first.");
      setLoading(true);
      setError(null);
      try {
        const signature = await triggerMilestoneOnChain(
          program,
          new PublicKey(streamId)
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

  const handleReclaimMilestone = useCallback(
    async (streamId: string, tokenMint: string): Promise<string> => {
      if (!program) throw new Error("Connect your wallet first.");
      setLoading(true);
      setError(null);
      try {
        const signature = await reclaimMilestoneOnChain(
          program,
          new PublicKey(streamId),
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
    // The canonical Solana address that actually signs and owns on-chain state.
    // Pages MUST filter streams by this (not Privy's user.wallet.address) — for
    // EVM logins like MetaMask, Privy provisions a separate embedded Solana
    // wallet, so user.wallet.address won't match the stream authority/recipient.
    walletAddress: walletPubkey?.toBase58() ?? "",
    getStream,
    getClaimable,
    getWorkerStreams,
    getFounderStreams,
    getActiveWorkerStreams,
    getCompletedWorkerStreams,
    getActiveFounderStreams,
    getCompletedFounderStreams,
    handleWithdraw,
    handleReleaseVault,
    handleCancel,
    handleCreateStream,
    handleTriggerMilestone,
    handleReclaimMilestone,
  };
}
