import type { DistributionState } from "./types";
import { calculateClaimable } from "./utils";

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Worker My Streams — hide once nothing left to claim and no future unlocks. */
export function isWorkerStreamActive(stream: DistributionState): boolean {
  if (stream.isCancelled) {
    return calculateClaimable(stream) > BigInt(0);
  }

  const now = nowSec();
  const claimable = calculateClaimable(stream);

  if (claimable > BigInt(0)) return true;
  if (now < stream.endTime) return true;

  if (
    stream.milestoneAmount > BigInt(0) &&
    !stream.milestoneAchieved &&
    now <= stream.endTime
  ) {
    return true;
  }

  return false;
}

/** Founder My Streams — keep visible while vesting runs or milestone needs action. */
export function isFounderStreamActive(stream: DistributionState): boolean {
  if (stream.isCancelled) return false;

  const now = nowSec();

  if (
    stream.milestoneAmount > BigInt(0) &&
    !stream.milestoneAchieved &&
    now <= stream.endTime
  ) {
    return true;
  }

  if (
    stream.milestoneAmount > BigInt(0) &&
    !stream.milestoneAchieved &&
    now > stream.endTime
  ) {
    return true;
  }

  if (now < stream.endTime) return true;

  // Founder is done once vesting ended and milestone is handled (triggered,
  // reclaimed, or never allocated). Worker-side claimable does not keep the
  // stream on the founder dashboard.
  return false;
}
