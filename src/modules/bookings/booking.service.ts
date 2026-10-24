import { withTransaction } from '../../db/mysql';
import { HttpError } from '../../shared/http-error';
import * as userRepository from '../users/user.repository';
import { MAX_DURATION_DAYS, MAX_YEARS_AHEAD } from './booking.constants';
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
