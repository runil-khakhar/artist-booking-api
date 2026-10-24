import { summariseScores } from '../../src/modules/artists/review-summary';

const scoreCounts = (counts: Record<number, number>) =>
  Object.entries(counts).map(([score, count]) => ({ score: Number(score), count }));

describe('summariseScores', () => {
  it('averages to two decimal places and fills in missing scores with zero', () => {
    expect(summariseScores(scoreCounts({ 5: 1, 4: 2 }))).toEqual({
      averageScore: 4.33,
      totalCount: 3,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 },
    });
  });

  it('rounds a half up (4.125 becomes 4.13, not the 4.12 that half-to-even would give)', () => {
    // 2x5 + 5x4 + 1x3 = 33 over 8 reviews = 4.125
    expect(summariseScores(scoreCounts({ 5: 2, 4: 5, 3: 1 })).averageScore).toBe(4.13);
  });

  it('returns a null average when there are no reviews', () => {
    expect(summariseScores([])).toEqual({
      averageScore: null,
      totalCount: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });
});
