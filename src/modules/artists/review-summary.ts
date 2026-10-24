import type { ScoreCount } from './review.repository';

export interface ReviewSummary {
  averageScore: number | null;
  totalCount: number;
  distribution: Record<number, number>;
}

// Works from integer counts and rounds half up. MongoDB's $round rounds half to even, which would
// show 4.125 as 4.12 instead of 4.13.
export function summariseScores(scoreCounts: ScoreCount[]): ReviewSummary {
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const { score, count } of scoreCounts) {
    distribution[score] = count;
  }

  let totalCount = 0;
  let scoreSum = 0;
  for (const [score, count] of Object.entries(distribution)) {
    totalCount += count;
    scoreSum += Number(score) * count;
  }

  return {
    // null rather than 0: an artist without reviews hasn't been rated badly
    averageScore: totalCount === 0 ? null : Math.round((scoreSum * 100) / totalCount) / 100,
    totalCount,
    distribution,
  };
}
