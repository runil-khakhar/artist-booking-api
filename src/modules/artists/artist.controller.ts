import type { Request, Response } from 'express';
import { sendSuccess } from '../../shared/response';
import { idParamsSchema } from '../../shared/schemas';
import { reviewsQuerySchema } from './artist.schemas';
import * as reviewService from './review.service';

export async function listReviews(req: Request, res: Response): Promise<void> {
  const { id } = idParamsSchema.parse(req.params);
  const { page, limit } = reviewsQuerySchema.parse(req.query);

  const { artist, profile, reviews, summary } = await reviewService.getArtistReviews(
    id,
    page,
    limit,
  );

  sendSuccess(res, {
    artist: {
      id: artist.id,
      name: artist.name,
      display_name: profile?.displayName ?? null,
      category: profile?.category ?? null,
    },
    summary: {
      average_score: summary.averageScore,
      total_count: summary.totalCount,
      distribution: summary.distribution,
    },
    // Public endpoint: reviewer and booking ids are left out.
    reviews: reviews.map((review) => ({
      id: review._id.toString(),
      score: review.score,
      comment: review.comment,
      created_at: review.createdAt,
    })),
    pagination: {
      page,
      limit,
      total_items: summary.totalCount,
      total_pages: Math.ceil(summary.totalCount / limit),
    },
  });
}
