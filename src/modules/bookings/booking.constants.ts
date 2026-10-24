export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

// Statuses that hold the artist's time. A new or newly confirmed booking may not overlap them.
export const BLOCKING_STATUSES: readonly BookingStatus[] = ['confirmed', 'in_progress'];
