import { HttpError } from '../../shared/http-error';
import type { Role } from '../users/roles';
import type { BookingStatus } from './booking.constants';

type Transitions = Record<BookingStatus, Partial<Record<BookingStatus, readonly Role[]>>>;

// Every allowed move and who may make it. Anything missing here is an invalid transition.
const TRANSITIONS: Transitions = {
  pending: { confirmed: ['artist'], cancelled: ['artist', 'client'] },
  confirmed: { in_progress: ['artist'], cancelled: ['artist', 'client'] },
  in_progress: { completed: ['artist'] },
  completed: {},
  cancelled: {},
};

function nextStepHint(from: BookingStatus, role: Role): string {
  const moves = Object.entries(TRANSITIONS[from]);
  if (moves.length === 0) {
    return `'${from}' is a final status`;
  }

  const options = moves.filter(([, roles]) => roles?.includes(role)).map(([status]) => status);
  return options.length > 0
    ? `Allowed next statuses: ${options.join(', ')}`
    : `A ${role} cannot change a booking that is '${from}'`;
}

export function assertTransition(from: BookingStatus, to: BookingStatus, role: Role): void {
  const allowedRoles = TRANSITIONS[from][to];

  if (!allowedRoles) {
    throw new HttpError(
      422,
      `Cannot change booking status from '${from}' to '${to}'. ${nextStepHint(from, role)}`,
    );
  }
  if (!allowedRoles.includes(role)) {
    throw new HttpError(403, `A ${role} cannot move a booking from '${from}' to '${to}'`);
  }
}
