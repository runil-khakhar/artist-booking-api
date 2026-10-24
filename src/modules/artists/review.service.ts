import { HttpError } from '../../shared/http-error';
import * as bookingRepository from '../bookings/booking.repository';
import * as userRepository from '../users/user.repository';
import type { ArtistSummary } from '../users/user.repository';
import * as artistProfileRepository from './artist-profile.repository';
import type { ProfileSummary } from './artist-profile.repository';
import { summariseScores, type ReviewSummary } from './review-summary';
import * as reviewRepository from './review.repository';
import type { PublicReview } from './review.repository';

export interface ArtistReviews {
  artist: ArtistSummary;
  profile: ProfileSummary | null;
  reviews: PublicReview[];
  summary: ReviewSummary;
}

export async function getArtistReviews(
  artistId: number,
  page: number,
  limit: number,
): Promise<ArtistReviews> {
  const artist = await userRepository.findArtistById(artistId);
  if (!artist) {
    throw new HttpError(404, `Artist ${artistId} not found`);
  }

  const [bookingIds, profile] = await Promise.all([
    bookingRepository.findCompletedIdsByArtist(artistId),
    artistProfileRepository.findSummaryByUserId(artistId),
  ]);
  const scope = { artistId, bookingIds };
  const [reviews, scoreCounts] = await Promise.all([
    reviewRepository.findPage(scope, page, limit),
    reviewRepository.countByScore(scope),
  ]);

  return { artist, profile, reviews, summary: summariseScores(scoreCounts) };
}
