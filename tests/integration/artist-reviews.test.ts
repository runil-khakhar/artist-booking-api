import request, { type Response } from 'supertest';
import { app } from '../../src/app';
import { ArtistProfile } from '../../src/modules/artists/artist-profile.model';
import { resetDatabases } from '../helpers/db';
import {
  createBooking,
  createReview,
  createUser,
  hoursFromNow,
  type TestUser,
} from '../helpers/factories';

const scoresOf = (res: Response) =>
  (res.body.data.reviews as { score: number }[]).map((review) => review.score);

describe('GET /artists/:id/reviews', () => {
  let artist: TestUser;
  let client: TestUser;

  const completedBooking = (daysAgo: number) =>
    createBooking(artist, client, { status: 'completed', start: hoursFromNow(-24 * daysAgo) });

  const getReviews = (query = '') => request(app).get(`/artists/${artist.id}/reviews${query}`);

  beforeEach(async () => {
    await resetDatabases();
    artist = await createUser('artist');
    client = await createUser('client');
  });

  it('returns reviews from completed bookings with a summary, newest first', async () => {
    const older = await createReview(await completedBooking(10), 5, hoursFromNow(-200));
    const newer = await createReview(await completedBooking(5), 4, hoursFromNow(-100));
    await createReview(await completedBooking(3), 4, hoursFromNow(-50));

    const res = await getReviews();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.error).toBeNull();
    expect(res.body.data.artist).toEqual({
      id: artist.id,
      name: 'Test artist',
      display_name: null,
      category: null,
    });
    expect(res.body.data.summary).toEqual({
      average_score: 4.33,
      total_count: 3,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 },
    });
    expect(scoresOf(res)).toEqual([4, 4, 5]);
    expect(res.body.data.reviews[1]).toEqual({
      id: newer._id.toString(),
      score: 4,
      comment: 'Gave it a 4',
      created_at: newer.createdAt.toISOString(),
    });
    expect(res.body.data.reviews[2].id).toBe(older._id.toString());
  });

  it('includes the artist profile when one exists', async () => {
    await ArtistProfile.create({ userId: artist.id, displayName: 'DJ Test', category: 'DJ' });

    const res = await getReviews();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.error).toBeNull();
    expect(res.body.data.artist).toEqual({
      id: artist.id,
      name: 'Test artist',
      display_name: 'DJ Test',
      category: 'DJ',
    });
  });

  it('leaves out reviews whose booking is not completed', async () => {
    await createReview(await completedBooking(4), 5);
    const cancelled = await createBooking(artist, client, {
      status: 'cancelled',
      start: hoursFromNow(-72),
    });
    const confirmed = await createBooking(artist, client, { status: 'confirmed' });
    await createReview(cancelled, 1);
    await createReview(confirmed, 2);

    const res = await getReviews();

    expect(res.body.data.summary).toEqual({
      average_score: 5,
      total_count: 1,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 },
    });
    expect(res.body.data.reviews).toHaveLength(1);
  });

  it('only includes reviews for the requested artist', async () => {
    const otherArtist = await createUser('artist');
    const otherBooking = await createBooking(otherArtist, client, {
      status: 'completed',
      start: hoursFromNow(-48),
    });
    await createReview(otherBooking, 1);
    await createReview(await completedBooking(2), 5);

    const res = await getReviews();

    expect(res.body.data.summary.total_count).toBe(1);
  });

  it('pages through reviews with page and limit', async () => {
    for (let day = 1; day <= 5; day += 1) {
      await createReview(await completedBooking(day), day, hoursFromNow(-24 * day));
    }

    const firstPage = await getReviews('?page=1&limit=2');
    const lastPage = await getReviews('?page=3&limit=2');

    expect(scoresOf(firstPage)).toEqual([1, 2]);
    expect(firstPage.body.data.pagination).toEqual({
      page: 1,
      limit: 2,
      total_items: 5,
      total_pages: 3,
    });
    expect(scoresOf(lastPage)).toEqual([5]);
    expect(lastPage.body.data.summary.total_count).toBe(5);
  });

  it('returns an empty list past the last page', async () => {
    await createReview(await completedBooking(1), 3);

    const res = await getReviews('?page=4&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.data.reviews).toEqual([]);
    expect(res.body.data.pagination).toEqual({
      page: 4,
      limit: 10,
      total_items: 1,
      total_pages: 1,
    });
  });

  it('returns a null average for an artist with no reviews yet', async () => {
    const res = await getReviews();

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({
      average_score: null,
      total_count: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
    expect(res.body.data.pagination.total_pages).toBe(0);
  });

  it('returns 404 when the id is not an artist', async () => {
    const res = await request(app).get(`/artists/${client.id}/reviews`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      data: null,
      error: `Artist ${client.id} not found`,
    });
  });

  it.each([
    ['limit=0', 'limit must be a whole number from 1 to 50'],
    ['limit=51', 'limit must be a whole number from 1 to 50'],
    ['page=0', 'page must be a whole number, 1 or more'],
    ['page=abc', 'page must be a whole number, 1 or more'],
    ['page=0x1', 'page must be a whole number, 1 or more'],
    ['limit=1e1', 'limit must be a whole number from 1 to 50'],
  ])('returns 400 for %s', async (query, message) => {
    const res = await getReviews(`?${query}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, data: null, error: message });
  });

  it.each(['abc', '-3', '0x17b', '2.5', '99999999999999999999999'])(
    'returns 400 for the id %s',
    async (id) => {
      const res = await request(app).get(`/artists/${id}/reviews`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('id must be a positive integer');
    },
  );
});
