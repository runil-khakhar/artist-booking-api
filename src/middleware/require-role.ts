import type { RequestHandler } from 'express';
import type { Role } from '../modules/users/roles';
import { HttpError } from '../shared/http-error';
import { currentUser } from './authenticate';

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!roles.includes(currentUser(req).role)) {
      throw new HttpError(403, `Only ${roles.map((role) => `${role}s`).join(' and ')} can do this`);
    }
    next();
  };
}
