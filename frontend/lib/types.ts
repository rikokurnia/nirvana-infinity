export interface DistributionState {
  id: string;
  authority: string;
  recipient: string;
  tokenMint: string;
  tokenSymbol: string;
  /** Decimals of the token mint, needed to format on-chain base units to UI floats. */
  tokenDecimals: number;
  baseAmount: bigint;
  milestoneAmount: bigint;
  cliffAmount: bigint;
  claimedAmount: bigint;
  startTime: number;
  endTime: number;
  cliffTime: number;
  milestoneAchieved: boolean;
  isCancelled: boolean;
  /** Empty string when no arbiter is set. */
  arbiter: string;
  /** Per-(authority, recipient) nonce so multiple concurrent streams to the same recipient don't collide. */
  nonce: bigint;
}

export interface CreateStreamParams {
  recipient: string;
  tokenMint: string;
  tokenSymbol: string;
  baseAmount: number;
  milestoneAmount: number;
  cliffAmount: number;
  startTime: number;
  endTime: number;
  cliffTime: number;
}

export interface StreamStats {
  totalStreams: number;
  activeStreams: number;
  totalClaimed: bigint;
  pendingMilestones: number;
}
