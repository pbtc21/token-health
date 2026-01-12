import type { TeneroClient, HolderPercentages, HolderStats, Candlestick, TokenInfo } from "./tenero";

export interface HealthReport {
  token: {
    address: string;
    name: string;
    symbol: string;
    price_usd: number;
    market_cap_usd: number;
  };
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  breakdown: {
    concentration: { score: number; weight: number };
    freshWallets: { score: number; weight: number };
    holderActivity: { score: number; weight: number };
    volumeTrend: { score: number; weight: number };
  };
  metrics: {
    top10Ownership: number;
    top25Ownership: number;
    top50Ownership: number;
    freshWalletRatio: number;
    holderCount: number;
    activeRatio: number;
    volume24h: number;
    volume7dAvg: number;
    volumeTrendPercent: number;
  };
  flags: string[];
  timestamp: number;
}

const WEIGHTS = {
  concentration: 0.35,
  freshWallets: 0.25,
  holderActivity: 0.20,
  volumeTrend: 0.20,
};

function scoreConcentration(percentages: HolderPercentages): { score: number; flags: string[] } {
  const flags: string[] = [];
  const { top_10_percent, top_25_percent, top_50_percent } = percentages;

  // Ideal: top 10 < 40%, top 25 < 60%, top 50 < 80%
  let score = 100;

  if (top_10_percent > 80) {
    score -= 60;
    flags.push(`Extreme concentration: top 10 holders own ${top_10_percent.toFixed(1)}%`);
  } else if (top_10_percent > 60) {
    score -= 40;
    flags.push(`High concentration: top 10 holders own ${top_10_percent.toFixed(1)}%`);
  } else if (top_10_percent > 40) {
    score -= 20;
  }

  if (top_25_percent > 90) {
    score -= 20;
    flags.push(`Top 25 holders control ${top_25_percent.toFixed(1)}% of supply`);
  }

  return { score: Math.max(0, score), flags };
}

function scoreFreshWallets(stats: HolderStats): { score: number; flags: string[] } {
  const flags: string[] = [];
  const holderCount = parseInt(stats.holder_count) || 1;
  const freshWeek = parseInt(stats.fresh_1w) || 0;
  const freshMonth = parseInt(stats.fresh_1m) || 0;

  const freshWeekRatio = freshWeek / holderCount;
  const freshMonthRatio = freshMonth / holderCount;

  let score = 100;

  // High fresh wallet ratio = potential coordinated buy / rug setup
  if (freshWeekRatio > 0.5) {
    score -= 50;
    flags.push(`Warning: ${(freshWeekRatio * 100).toFixed(0)}% of holders are <1 week old`);
  } else if (freshWeekRatio > 0.3) {
    score -= 30;
    flags.push(`${(freshWeekRatio * 100).toFixed(0)}% of holders joined this week`);
  } else if (freshWeekRatio > 0.15) {
    score -= 15;
  }

  // Some fresh wallets are normal/healthy (new interest)
  // Penalize if almost no fresh activity (dead token)
  if (freshMonthRatio < 0.05 && holderCount > 100) {
    score -= 10;
    flags.push("Low new holder activity in past month");
  }

  return { score: Math.max(0, score), flags };
}

function scoreHolderActivity(stats: HolderStats): { score: number; flags: string[] } {
  const flags: string[] = [];
  const holderCount = parseInt(stats.holder_count) || 1;
  const activeWeek = parseInt(stats.active_1w) || 0;
  const activeMonth = parseInt(stats.active_1m) || 0;
  const inactive6m = parseInt(stats.inactive_6m) || 0;

  const activeWeekRatio = activeWeek / holderCount;
  const inactive6mRatio = inactive6m / holderCount;

  let score = 100;

  // Healthy: 10-30% active weekly
  if (activeWeekRatio < 0.02) {
    score -= 30;
    flags.push("Very low trading activity");
  } else if (activeWeekRatio < 0.05) {
    score -= 15;
  }

  // Too many dormant holders
  if (inactive6mRatio > 0.7) {
    score -= 25;
    flags.push(`${(inactive6mRatio * 100).toFixed(0)}% of holders inactive for 6+ months`);
  } else if (inactive6mRatio > 0.5) {
    score -= 10;
  }

  return { score: Math.max(0, score), flags };
}

function scoreVolumeTrend(candles: Candlestick[]): {
  score: number;
  flags: string[];
  volume24h: number;
  volume7dAvg: number;
  trendPercent: number;
} {
  const flags: string[] = [];

  if (candles.length < 24) {
    return { score: 50, flags: ["Insufficient volume data"], volume24h: 0, volume7dAvg: 0, trendPercent: 0 };
  }

  // Last 24 hours
  const recent24 = candles.slice(-24);
  const volume24h = recent24.reduce((sum, c) => sum + c.volume, 0);

  // Previous 7 days average (excluding last 24h)
  const older = candles.slice(0, -24);
  const volume7dAvg = older.length > 0
    ? older.reduce((sum, c) => sum + c.volume, 0) / (older.length / 24)
    : volume24h;

  const trendPercent = volume7dAvg > 0
    ? ((volume24h - volume7dAvg) / volume7dAvg) * 100
    : 0;

  let score = 70; // Neutral baseline

  if (trendPercent > 100) {
    score = 95;
    flags.push(`Volume surge: +${trendPercent.toFixed(0)}% vs 7d avg`);
  } else if (trendPercent > 30) {
    score = 85;
  } else if (trendPercent > 0) {
    score = 75;
  } else if (trendPercent > -30) {
    score = 65;
  } else if (trendPercent > -50) {
    score = 50;
    flags.push("Volume declining");
  } else {
    score = 30;
    flags.push(`Volume down ${Math.abs(trendPercent).toFixed(0)}% from 7d avg`);
  }

  return { score, flags, volume24h, volume7dAvg, trendPercent };
}

function calculateGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

export async function calculateHealthScore(
  client: TeneroClient,
  tokenAddress: string
): Promise<HealthReport> {
  // Fetch all data in parallel
  const [tokenInfo, holderPercentages, holderStats, candles] = await Promise.all([
    client.getTokenInfo(tokenAddress),
    client.getHolderPercentages(tokenAddress),
    client.getHolderStats(tokenAddress),
    client.getOHLC(tokenAddress, "1h", 168), // 7 days of hourly data
  ]);

  const concentration = scoreConcentration(holderPercentages);
  const freshWallets = scoreFreshWallets(holderStats);
  const holderActivity = scoreHolderActivity(holderStats);
  const volumeTrend = scoreVolumeTrend(candles);

  const allFlags = [
    ...concentration.flags,
    ...freshWallets.flags,
    ...holderActivity.flags,
    ...volumeTrend.flags,
  ];

  const weightedScore = Math.round(
    concentration.score * WEIGHTS.concentration +
    freshWallets.score * WEIGHTS.freshWallets +
    holderActivity.score * WEIGHTS.holderActivity +
    volumeTrend.score * WEIGHTS.volumeTrend
  );

  const holderCount = parseInt(holderStats.holder_count) || 0;
  const freshWeek = parseInt(holderStats.fresh_1w) || 0;
  const activeWeek = parseInt(holderStats.active_1w) || 0;

  return {
    token: {
      address: tokenAddress,
      name: tokenInfo.name,
      symbol: tokenInfo.symbol,
      price_usd: tokenInfo.price_usd,
      market_cap_usd: tokenInfo.market_cap_usd,
    },
    score: weightedScore,
    grade: calculateGrade(weightedScore),
    breakdown: {
      concentration: { score: concentration.score, weight: WEIGHTS.concentration },
      freshWallets: { score: freshWallets.score, weight: WEIGHTS.freshWallets },
      holderActivity: { score: holderActivity.score, weight: WEIGHTS.holderActivity },
      volumeTrend: { score: volumeTrend.score, weight: WEIGHTS.volumeTrend },
    },
    metrics: {
      top10Ownership: holderPercentages.top_10_percent,
      top25Ownership: holderPercentages.top_25_percent,
      top50Ownership: holderPercentages.top_50_percent,
      freshWalletRatio: holderCount > 0 ? freshWeek / holderCount : 0,
      holderCount,
      activeRatio: holderCount > 0 ? activeWeek / holderCount : 0,
      volume24h: volumeTrend.volume24h,
      volume7dAvg: volumeTrend.volume7dAvg,
      volumeTrendPercent: volumeTrend.trendPercent,
    },
    flags: allFlags,
    timestamp: Date.now(),
  };
}
