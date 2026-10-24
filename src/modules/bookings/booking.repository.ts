import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, type Queryable } from '../../db/mysql';
import { BLOCKING_STATUSES, type BookingStatus } from './booking.constants';

export interface Booking {
  id: number;
  artist_id: number;
  client_id: number;
  status: BookingStatus;
  event_start: Date;
  event_end: Date;
  notes: string;
  created_at: Date;
  updated_at: Date;
}

export interface NewBooking {
  artistId: number;
  clientId: number;
  start: Date;
  end: Date;
  notes: string;
}

export interface TimeSlot {
  artistId: number;
  start: Date;
  end: Date;
  excludeBookingId?: number;
}

const COLUMNS =
  'id, artist_id, client_id, status, event_start, event_end, notes, created_at, updated_at';

export async function findById(id: number, db: Queryable = pool): Promise<Booking | null> {
  const [rows] = await db.query<(Booking & RowDataPacket)[]>(
    `SELECT ${COLUMNS} FROM bookings WHERE id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

// Only for rows written earlier in the same transaction, where a missing row is a bug, not a 404.
export async function getById(id: number, db: PoolConnection): Promise<Booking> {
  const booking = await findById(id, db);
  if (!booking) {
    throw new Error(`Booking ${id} not found`);
  }
  return booking;
}

// Half-open intervals: a booking ending at 20:00 doesn't clash with one starting at 20:00.
export async function hasBlockingOverlap(slot: TimeSlot, db: PoolConnection): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM bookings
      WHERE artist_id = ?
        AND status IN (?)
        AND event_start < ?
        AND event_end > ?
        AND id <> ?
      LIMIT 1`,
    [slot.artistId, BLOCKING_STATUSES, slot.end, slot.start, slot.excludeBookingId ?? 0],
  );
  return rows.length > 0;
}

export async function insert(booking: NewBooking, db: PoolConnection): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO bookings (artist_id, client_id, status, event_start, event_end, notes)
     VALUES (?, ?, 'pending', ?, ?, ?)`,
    [booking.artistId, booking.clientId, booking.start, booking.end, booking.notes],
  );
  return result.insertId;
}

export async function recordStatusChange(
  change: { bookingId: number; from: BookingStatus | null; to: BookingStatus; changedBy: number },
  db: PoolConnection,
): Promise<void> {
  await db.query(
    `INSERT INTO booking_status_history (booking_id, from_status, to_status, changed_by)
     VALUES (?, ?, ?, ?)`,
    [change.bookingId, change.from, change.to, change.changedBy],
  );
}
