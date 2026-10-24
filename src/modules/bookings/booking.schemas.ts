import { z } from 'zod';
import { BOOKING_STATUSES } from './booking.constants';

const POSITIVE_INT = { error: 'must be a positive integer' };

// DATETIME columns round fractional seconds, so drop them here and store exactly what was checked.
const dateTime = z.iso
  .datetime({
    offset: true,
    error: 'must be an ISO 8601 date-time with a time zone, like 2026-12-12T18:00:00Z',
  })
  .transform((value) => {
    const date = new Date(value);
    date.setUTCMilliseconds(0);
    return date;
  });

export const createBookingSchema = z.object(
  {
    artist_id: z.number(POSITIVE_INT).int(POSITIVE_INT).positive(POSITIVE_INT),
    event_start: dateTime,
    event_end: dateTime,
    notes: z
      .string({ error: 'must be a non-empty string' })
      .trim()
      .min(1, { error: 'must be a non-empty string' })
      .max(1000, { error: 'must be 1000 characters or fewer' }),
  },
  { error: 'Request body must be a JSON object' },
);

export const updateStatusSchema = z.object(
  {
    status: z.enum(BOOKING_STATUSES, { error: `must be one of: ${BOOKING_STATUSES.join(', ')}` }),
  },
  { error: 'Request body must be a JSON object' },
);
