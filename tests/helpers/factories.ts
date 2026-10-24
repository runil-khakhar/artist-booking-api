import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { ResultSetHeader } from 'mysql2/promise';
import { config } from '../../src/config';
import { pool } from '../../src/db/mysql';
import { Review } from '../../src/modules/artists/review.model';
import type { BookingStatus } from '../../src/modules/bookings/booking.constants';
import type { Role } from '../../src/modules/users/roles';

const HOUR = 60 * 60 * 1000;

export interface TestUser {
  id: number;
  email: string;
  password: string;
  role: Role;
}

export async function createUser(role: Role): Promise<TestUser> {
  const email = `${role}-${randomUUID()}@example.test`;
  const password = randomUUID();
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [`Test ${role}`, email, passwordHash, role],
  );
  return { id: result.insertId, email, password, role };
}

export function hoursFromNow(hours: number): Date {
  const date = new Date(Date.now() + hours * HOUR);
  date.setUTCMilliseconds(0);
  return date;
}

export interface TestBooking {
  id: number;
  artistId: number;
  clientId: number;
}

interface BookingOptions {
  status?: BookingStatus;
  start?: Date;
  end?: Date;
}

// Inserts directly, so tests can set up any status, including bookings in the past.
export async function createBooking(
  artist: TestUser,
  client: TestUser,
  { status = 'pending', start = hoursFromNow(48), end }: BookingOptions = {},
): Promise<TestBooking> {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO bookings (artist_id, client_id, status, event_start, event_end, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [artist.id, client.id, status, start, end ?? new Date(start.getTime() + 3 * HOUR), 'Test'],
  );
  return { id: result.insertId, artistId: artist.id, clientId: client.id };
}

export async function createReview(booking: TestBooking, score: number, createdAt = new Date()) {
  return Review.create({
    bookingId: booking.id,
    artistId: booking.artistId,
    clientId: booking.clientId,
    score,
    comment: `Gave it a ${score}`,
    createdAt,
  });
}
