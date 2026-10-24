import { assertTransition } from '../../src/modules/bookings/booking-status';
import { BOOKING_STATUSES, type BookingStatus } from '../../src/modules/bookings/booking.constants';
import { ROLES, type Role } from '../../src/modules/users/roles';
import { HttpError } from '../../src/shared/http-error';

// Listed here independently, so the test checks the rules instead of restating the module's table.
const ALLOWED: [BookingStatus, BookingStatus, Role[]][] = [
  ['pending', 'confirmed', ['artist']],
  ['confirmed', 'in_progress', ['artist']],
  ['in_progress', 'completed', ['artist']],
  ['pending', 'cancelled', ['artist', 'client']],
  ['confirmed', 'cancelled', ['artist', 'client']],
];

function expectedOutcome(from: BookingStatus, to: BookingStatus, role: Role) {
  const rule = ALLOWED.find(([ruleFrom, ruleTo]) => ruleFrom === from && ruleTo === to);
  if (!rule) return 422;
  return rule[2].includes(role) ? 'allowed' : 403;
}

function actualOutcome(from: BookingStatus, to: BookingStatus, role: Role) {
  try {
    assertTransition(from, to, role);
    return 'allowed';
  } catch (err) {
    return err instanceof HttpError ? err.status : err;
  }
}

const cases = BOOKING_STATUSES.flatMap((from) =>
  BOOKING_STATUSES.flatMap((to) =>
    ROLES.map((role) => [from, to, role, expectedOutcome(from, to, role)] as const),
  ),
);

describe('assertTransition', () => {
  it.each(cases)('%s -> %s by %s: %s', (from, to, role, expected) => {
    expect(actualOutcome(from, to, role)).toBe(expected);
  });

  it('suggests only the moves the caller could make', () => {
    expect(() => assertTransition('pending', 'completed', 'client')).toThrow(
      "Cannot change booking status from 'pending' to 'completed'. Allowed next statuses: cancelled",
    );
  });

  it('says when the caller has no moves left', () => {
    expect(() => assertTransition('in_progress', 'cancelled', 'client')).toThrow(
      "A client cannot change a booking that is 'in_progress'",
    );
  });
});
