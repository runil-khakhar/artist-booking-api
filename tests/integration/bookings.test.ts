import type { RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import { app } from '../../src/app';
import { pool } from '../../src/db/mysql';
import { loginAs } from '../helpers/auth';
import { getStatusHistory, resetDatabases } from '../helpers/db';
import { createBooking, createUser, hoursFromNow, type TestUser } from '../helpers/factories';

async function bookingCount(): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM bookings');
  return Number(rows[0]?.total);
}

describe('POST /bookings', () => {
  let artist: TestUser;
  let client: TestUser;
  let clientToken: string;

  const createRequest = (token: string, body: object) =>
    request(app).post('/bookings').set('Authorization', `Bearer ${token}`).send(body);

  const validBody = (overrides: object = {}) => ({
    artist_id: artist.id,
    event_start: hoursFromNow(48).toISOString(),
    event_end: hoursFromNow(51).toISOString(),
    notes: 'Wedding reception, outdoor stage',
    ...overrides,
  });

  beforeEach(async () => {
    await resetDatabases();
    artist = await createUser('artist');
    client = await createUser('client');
    clientToken = await loginAs(client);
  });

  it('creates a pending booking for the logged-in client', async () => {
    const body = validBody();

    const res = await createRequest(clientToken, body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      error: null,
      data: {
        id: expect.any(Number),
        artist_id: artist.id,
        client_id: client.id,
        status: 'pending',
        event_start: body.event_start,
        event_end: body.event_end,
        notes: body.notes,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      },
    });
    expect(await getStatusHistory(res.body.data.id)).toEqual([
      { from_status: null, to_status: 'pending', changed_by: client.id },
    ]);
  });

  it('ignores fields the client is not allowed to set', async () => {
    const res = await createRequest(
      clientToken,
      validBody({ status: 'confirmed', client_id: 999 }),
    );

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'pending', client_id: client.id });
  });

  it('accepts times with an offset and stores them in UTC', async () => {
    const start = hoursFromNow(48);
    const end = hoursFromNow(52);
    const asIndianTime = (date: Date) =>
      `${new Date(date.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 19)}+05:30`;

    const res = await createRequest(
      clientToken,
      validBody({ event_start: asIndianTime(start), event_end: asIndianTime(end) }),
    );

    expect(res.status).toBe(201);
    expect(res.body.data.event_start).toBe(start.toISOString());
    expect(res.body.data.event_end).toBe(end.toISOString());
  });

  describe('schedule rules', () => {
    it('returns 422 when event_start is in the past', async () => {
      const res = await createRequest(
        clientToken,
        validBody({
          event_start: hoursFromNow(-2).toISOString(),
          event_end: hoursFromNow(1).toISOString(),
        }),
      );

      expect(res.status).toBe(422);
      expect(res.body).toEqual({
        success: false,
        data: null,
        error: 'event_start must be in the future',
      });
      expect(await bookingCount()).toBe(0);
    });

    it('returns 422 when event_end is not after event_start', async () => {
      const res = await createRequest(
        clientToken,
        validBody({
          event_start: hoursFromNow(50).toISOString(),
          event_end: hoursFromNow(48).toISOString(),
        }),
      );

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('event_end must be after event_start');
    });

    it('returns 422 when event_start is more than two years away', async () => {
      const start = hoursFromNow(24 * 366 * 2);

      const res = await createRequest(
        clientToken,
        validBody({
          event_start: start.toISOString(),
          event_end: new Date(start.getTime() + 3 * 60 * 60 * 1000).toISOString(),
        }),
      );

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('event_start must be within the next 2 years');
    });

    it('returns 422, not a database error, for a date MySQL could not store', async () => {
      const res = await createRequest(
        clientToken,
        validBody({
          event_start: '9999-12-31T20:00:00-05:00',
          event_end: '9999-12-31T23:00:00-05:00',
        }),
      );

      expect(res.status).toBe(422);
    });

    it('returns 422 for a booking longer than seven days', async () => {
      const res = await createRequest(
        clientToken,
        validBody({ event_end: hoursFromNow(48 + 7 * 24 + 1).toISOString() }),
      );

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('A booking can last at most 7 days');
    });

    it('returns 409 when the artist has a confirmed booking that overlaps', async () => {
      await createBooking(artist, client, {
        status: 'confirmed',
        start: hoursFromNow(47),
        end: hoursFromNow(49),
      });

      const res = await createRequest(clientToken, validBody());

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('The artist is already booked for this time');
      expect(await bookingCount()).toBe(1);
    });

    it('treats an in-progress booking as taken too', async () => {
      await createBooking(artist, client, {
        status: 'in_progress',
        start: hoursFromNow(47),
        end: hoursFromNow(52),
      });

      const res = await createRequest(clientToken, validBody());

      expect(res.status).toBe(409);
      expect(await bookingCount()).toBe(1);
    });

    it.each(['pending', 'cancelled', 'completed'] as const)(
      'allows an overlap with a %s booking',
      async (status) => {
        await createBooking(artist, client, {
          status,
          start: hoursFromNow(47),
          end: hoursFromNow(49),
        });

        const res = await createRequest(clientToken, validBody());

        expect(res.status).toBe(201);
      },
    );

    it('allows a booking that starts exactly when a confirmed one ends', async () => {
      const boundary = hoursFromNow(48);
      await createBooking(artist, client, {
        status: 'confirmed',
        start: hoursFromNow(45),
        end: boundary,
      });

      const res = await createRequest(
        clientToken,
        validBody({ event_start: boundary.toISOString() }),
      );

      expect(res.status).toBe(201);
    });

    it('returns 422 when artist_id does not belong to an artist', async () => {
      const res = await createRequest(clientToken, validBody({ artist_id: client.id }));

      expect(res.status).toBe(422);
      expect(res.body.error).toBe(`No artist found with id ${client.id}`);
      expect(await bookingCount()).toBe(0);
    });
  });

  describe('access and input', () => {
    it('returns 403 for an artist', async () => {
      const artistToken = await loginAs(artist);

      const res = await createRequest(artistToken, validBody());

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ success: false, data: null, error: 'Only clients can do this' });
      expect(await bookingCount()).toBe(0);
    });

    it('returns 401 without a token', async () => {
      const res = await request(app).post('/bookings').send(validBody());

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        data: null,
        error: 'Missing or malformed Authorization header',
      });
    });

    it('returns 401 when the header has anything after the token', async () => {
      const res = await createRequest(`${clientToken} extra`, validBody());

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Missing or malformed Authorization header');
    });

    it('returns 401 for a tampered token', async () => {
      const res = await createRequest(`${clientToken}x`, validBody());

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired token');
    });

    it('returns 400 listing every field that is missing or invalid', async () => {
      const res = await createRequest(clientToken, { artist_id: '7', event_start: 'tomorrow' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('artist_id must be a positive integer');
      expect(res.body.error).toContain('event_start must be an ISO 8601 date-time');
      expect(res.body.error).toContain('event_end must be an ISO 8601 date-time');
      expect(res.body.error).toContain('notes must be a non-empty string');
    });

    it('returns 400 for a time without a time zone', async () => {
      const res = await createRequest(
        clientToken,
        validBody({ event_start: '2027-03-01T18:30:00' }),
      );

      expect(res.status).toBe(400);
    });
  });
});
