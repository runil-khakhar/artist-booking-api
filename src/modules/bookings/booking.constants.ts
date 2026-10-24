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

// Business limits that also keep every date well inside what a MySQL DATETIME can hold.
export const MAX_YEARS_AHEAD = 2;
export const MAX_DURATION_DAYS = 7;
