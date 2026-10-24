import type { Types } from 'mongoose';
import { Review } from './review.model';

export interface ReviewScope {
  artistId: number;
  bookingIds: number[];
}

export interface PublicReview {
  _id: Types.ObjectId;
  score: number;
  comment: string;
  createdAt: Date;
}

export interface ScoreCount {
  score: number;
  count: number;
}

// Booking status lives in MySQL, so "completed bookings only" is applied as a list of booking ids.
const matching = ({ artistId, bookingIds }: ReviewScope) => ({
  artistId,
  bookingId: { $in: bookingIds },
});

// Newest first; _id breaks ties so pages stay stable when two reviews share a timestamp.
export async function findPage(
  scope: ReviewScope,
  page: number,
  limit: number,
): Promise<PublicReview[]> {
  return Review.find(matching(scope))
    .select('score comment createdAt')
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean<PublicReview[]>();
}

export async function countByScore(scope: ReviewScope): Promise<ScoreCount[]> {
  return Review.aggregate<ScoreCount>([
    { $match: matching(scope) },
    { $group: { _id: '$score', count: { $sum: 1 } } },
    { $project: { _id: 0, score: '$_id', count: 1 } },
  ]);
}
