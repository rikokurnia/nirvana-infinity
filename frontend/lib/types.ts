export interface DistributionState {
  id: string;
  authority: string;
  recipient: string;
  tokenMint: string;
  tokenSymbol: string;
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
