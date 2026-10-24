import { withTransaction } from '../../db/mysql';
import { HttpError } from '../../shared/http-error';
import type { AuthUser } from '../auth/token';
import * as userRepository from '../users/user.repository';
import { assertTransition } from './booking-status';
import { MAX_DURATION_DAYS, MAX_YEARS_AHEAD, type BookingStatus } from './booking.constants';
import * as bookingRepository from './booking.repository';
import type { Booking, NewBooking } from './booking.repository';

const DAY = 24 * 60 * 60 * 1000;
const OVERLAP_MESSAGE = 'The artist is already booked for this time';

function assertValidTimeWindow(start: Date, end: Date): void {
  const latestStart = new Date();
  latestStart.setUTCFullYear(latestStart.getUTCFullYear() + MAX_YEARS_AHEAD);

  if (start.getTime() <= Date.now()) {
    throw new HttpError(422, 'event_start must be in the future');
  }
  if (start > latestStart) {
    throw new HttpError(422, `event_start must be within the next ${MAX_YEARS_AHEAD} years`);
  }
  if (end.getTime() <= start.getTime()) {
    throw new HttpError(422, 'event_end must be after event_start');
  }
  if (end.getTime() - start.getTime() > MAX_DURATION_DAYS * DAY) {
    throw new HttpError(422, `A booking can last at most ${MAX_DURATION_DAYS} days`);
  }
}

function assertParticipant(booking: Booking, user: AuthUser): void {
  if (user.role === 'artist' && booking.artist_id !== user.id) {
    throw new HttpError(403, 'Artists can only update bookings assigned to them');
  }
  if (user.role === 'client' && booking.client_id !== user.id) {
    throw new HttpError(403, 'Clients can only update their own bookings');
  }
}

export async function createBooking(booking: NewBooking): Promise<Booking> {
  assertValidTimeWindow(booking.start, booking.end);

  return withTransaction(async (db) => {
    // MySQL can't express "no overlapping ranges" as a constraint, so the artist's row is the lock:
    // a second request for the same artist waits here until this one commits.
    if (!(await userRepository.lockArtist(booking.artistId, db))) {
      throw new HttpError(422, `No artist found with id ${booking.artistId}`);
    }
    if (await bookingRepository.hasBlockingOverlap(booking, db)) {
      throw new HttpError(409, OVERLAP_MESSAGE);
    }

    const bookingId = await bookingRepository.insert(booking, db);
    await bookingRepository.recordStatusChange(
      { bookingId, from: null, to: 'pending', changedBy: booking.clientId },
      db,
    );
    return bookingRepository.getById(bookingId, db);
  });
}

export async function updateBookingStatus(
  bookingId: number,
  status: BookingStatus,
  user: AuthUser,
): Promise<Booking> {
  const booking = await bookingRepository.findById(bookingId);
  if (!booking) {
    throw new HttpError(404, `Booking ${bookingId} not found`);
  }
  assertParticipant(booking, user);

  return withTransaction(async (db) => {
    // Same lock order as createBooking (artist, then booking), so the two can't deadlock.
    await userRepository.lockArtist(booking.artist_id, db);
    const current = await bookingRepository.findByIdForUpdate(bookingId, db);
    if (!current) {
      throw new HttpError(404, `Booking ${bookingId} not found`);
    }

    assertTransition(current.status, status, user.role);

    // Two pending requests for the same slot could otherwise both be confirmed later.
    if (status === 'confirmed') {
      const slot = {
        artistId: current.artist_id,
        start: current.event_start,
        end: current.event_end,
        excludeBookingId: current.id,
      };
      if (await bookingRepository.hasBlockingOverlap(slot, db)) {
        throw new HttpError(409, OVERLAP_MESSAGE);
      }
    }

    await bookingRepository.updateStatus(bookingId, status, db);
    await bookingRepository.recordStatusChange(
      { bookingId, from: current.status, to: status, changedBy: user.id },
      db,
    );
    return bookingRepository.getById(bookingId, db);
  });
}
