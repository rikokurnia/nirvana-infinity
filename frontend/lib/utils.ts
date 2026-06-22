import { format, formatDistanceToNow } from "date-fns";

export function formatTokenAmount(amount: bigint, decimals: number = 9): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 2);
  return `${whole}.${fractionStr}`;
}

export function formatAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function formatDate(timestamp: number): string {
  return format(new Date(timestamp * 1000), "MMM dd, yyyy");
}

export function formatTimeAgo(timestamp: number): string {
  return formatDistanceToNow(new Date(timestamp * 1000)) + " ago";
}

export function calculateLinearUnlocked(
  startTime: number,
  endTime: number,
  baseAmount: bigint
): bigint {
  const now = Date.now() / 1000;
  if (now <= startTime) return BigInt(0);
  if (now >= endTime) return baseAmount;
  const elapsed = now - startTime;
  const duration = endTime - startTime;
  return (baseAmount * BigInt(Math.floor((elapsed / duration) * 10000))) / BigInt(10000);
}

export function calculateTotalUnlocked(stream: {
  startTime: number;
  endTime: number;
  cliffTime: number;
  baseAmount: bigint;
  cliffAmount: bigint;
  milestoneAmount: bigint;
  milestoneAchieved: boolean;
}): bigint {
  const now = Date.now() / 1000;
  const linear = calculateLinearUnlocked(stream.startTime, stream.endTime, stream.baseAmount);
  const cliff = now >= stream.cliffTime ? stream.cliffAmount : BigInt(0);
  const milestone = stream.milestoneAchieved ? stream.milestoneAmount : BigInt(0);
  return linear + cliff + milestone;
}

export function calculateClaimable(
  stream: {
    startTime: number;
    endTime: number;
    cliffTime: number;
    baseAmount: bigint;
    cliffAmount: bigint;
    milestoneAmount: bigint;
    milestoneAchieved: boolean;
    claimedAmount: bigint;
  }
): bigint {
  const total = calculateTotalUnlocked(stream);
  const claimable = total - stream.claimedAmount;
  return claimable > BigInt(0) ? claimable : BigInt(0);
}

export function formatPercentage(
  numerator: bigint,
  denominator: bigint
): number {
  if (denominator === BigInt(0)) return 0;
  return Number((numerator * BigInt(10000)) / denominator) / 100;
}
