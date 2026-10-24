import type { RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import { app } from '../../src/app';
import { pool } from '../../src/db/mysql';
import type { BookingStatus } from '../../src/modules/bookings/booking.constants';
import { loginAs } from '../helpers/auth';
import { getStatusHistory, resetDatabases } from '../helpers/db';
import { createBooking, createUser, hoursFromNow, type TestUser } from '../helpers/factories';

async function statusOf(bookingId: number): Promise<BookingStatus | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT status FROM bookings WHERE id = ?', [
    bookingId,
  ]);
  return rows[0]?.status as BookingStatus | undefined;
}

describe('PATCH /bookings/:id/status', () => {
  let artist: TestUser;
  let client: TestUser;
  let artistToken: string;
  let clientToken: string;

  const changeStatus = (bookingId: number, token: string, status: string) =>
    request(app)
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status });

  beforeEach(async () => {
    await resetDatabases();
    artist = await createUser('artist');
    client = await createUser('client');
    [artistToken, clientToken] = await Promise.all([loginAs(artist), loginAs(client)]);
  });

  describe('invalid transitions', () => {
    it('returns 422 with an error message when an artist jumps from pending to completed', async () => {
      const booking = await createBooking(artist, client, { status: 'pending' });

      const res = await changeStatus(booking.id, artistToken, 'completed');

      expect(res.status).toBe(422);
      expect(res.body).toEqual({
        success: false,
        data: null,
        error:
          "Cannot change booking status from 'pending' to 'completed'. Allowed next statuses: confirmed, cancelled",
      });
      expect(await statusOf(booking.id)).toBe('pending');
    });

    it.each([
      ['completed', 'cancelled'],
      ['cancelled', 'confirmed'],
      ['confirmed', 'pending'],
      ['in_progress', 'cancelled'],
      ['pending', 'pending'],
    ] as const)('returns 422 and leaves the booking alone for %s -> %s', async (from, to) => {
      const booking = await createBooking(artist, client, { status: from });

      const res = await changeStatus(booking.id, artistToken, to);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain(`from '${from}' to '${to}'`);
      expect(await statusOf(booking.id)).toBe(from);
    });

    it('says so when the booking is already in a final status', async () => {
      const booking = await createBooking(artist, client, { status: 'completed' });

      const res = await changeStatus(booking.id, clientToken, 'cancelled');

      expect(res.status).toBe(422);
      expect(res.body.error).toContain("'completed' is a final status");
    });
  });

  describe('valid transitions', () => {
    it('lets the artist confirm, start and complete a booking, recording each change', async () => {
      const booking = await createBooking(artist, client, { status: 'pending' });

      for (const status of ['confirmed', 'in_progress', 'completed']) {
        const res = await changeStatus(booking.id, artistToken, status);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
          success: true,
          error: null,
          data: { id: booking.id, status },
        });
      }

      expect(await getStatusHistory(booking.id)).toEqual([
        { from_status: 'pending', to_status: 'confirmed', changed_by: artist.id },
        { from_status: 'confirmed', to_status: 'in_progress', changed_by: artist.id },
        { from_status: 'in_progress', to_status: 'completed', changed_by: artist.id },
      ]);
    });

    it.each(['pending', 'confirmed'] as const)(
      'lets the client cancel a %s booking',
      async (from) => {
        const booking = await createBooking(artist, client, { status: from });

        const res = await changeStatus(booking.id, clientToken, 'cancelled');

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('cancelled');
      },
    );
  });

  describe('who may change what', () => {
    it.each([
      ['pending', 'confirmed'],
      ['confirmed', 'in_progress'],
      ['in_progress', 'completed'],
    ] as const)('returns 403 when a client tries %s -> %s', async (from, to) => {
      const booking = await createBooking(artist, client, { status: from });

      const res = await changeStatus(booking.id, clientToken, to);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        success: false,
        data: null,
        error: `A client cannot move a booking from '${from}' to '${to}'`,
      });
      expect(await statusOf(booking.id)).toBe(from);
    });

    it('returns 403 when an artist updates a booking assigned to another artist', async () => {
      const otherArtist = await createUser('artist');
      const booking = await createBooking(otherArtist, client);

      const res = await changeStatus(booking.id, artistToken, 'confirmed');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Artists can only update bookings assigned to them');
    });

    it("returns 403 when a client cancels someone else's booking", async () => {
      const otherClient = await createUser('client');
      const booking = await createBooking(artist, otherClient);

      const res = await changeStatus(booking.id, clientToken, 'cancelled');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Clients can only update their own bookings');
    });

    it('returns 401 without a token', async () => {
      const booking = await createBooking(artist, client);

      const res = await request(app)
        .patch(`/bookings/${booking.id}/status`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('double booking on confirm', () => {
    it('returns 409 when confirming would overlap a confirmed booking', async () => {
      await createBooking(artist, client, { status: 'confirmed', start: hoursFromNow(72) });
      const pending = await createBooking(artist, client, { start: hoursFromNow(73) });

      const res = await changeStatus(pending.id, artistToken, 'confirmed');

      expect(res.status).toBe(409);
      expect(await statusOf(pending.id)).toBe('pending');
    });

    it('confirms only one of two overlapping requests when both are confirmed at once', async () => {
      const first = await createBooking(artist, client, { start: hoursFromNow(72) });
      const second = await createBooking(artist, client, { start: hoursFromNow(73) });

      const results = await Promise.all([
        changeStatus(first.id, artistToken, 'confirmed'),
        changeStatus(second.id, artistToken, 'confirmed'),
      ]);

      expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
      const statuses = [await statusOf(first.id), await statusOf(second.id)];
      expect(statuses.sort()).toEqual(['confirmed', 'pending']);
    });
  });

  describe('input checks', () => {
    it('returns 400 for a status that does not exist', async () => {
      const booking = await createBooking(artist, client);

      const res = await changeStatus(booking.id, artistToken, 'done');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        'status must be one of: pending, confirmed, in_progress, completed, cancelled',
      );
    });

    it.each(['abc', '0', '0x1f', '1e2', '4294967296'])('returns 400 for the id %s', async (id) => {
      const res = await request(app)
        .patch(`/bookings/${id}/status`)
        .set('Authorization', `Bearer ${artistToken}`)
        .send({ status: 'confirmed' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('id must be a positive integer');
    });

    it('returns 404 for a booking that does not exist', async () => {
      const res = await changeStatus(999999, artistToken, 'confirmed');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, data: null, error: 'Booking 999999 not found' });
    });
  });
});
