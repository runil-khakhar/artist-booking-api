import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, type AuthUser } from '../modules/auth/token';
import { HttpError } from '../shared/http-error';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const parts = (req.get('authorization') ?? '').split(' ');
  const [scheme, token] = parts;
  if (parts.length !== 2 || scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new HttpError(401, 'Missing or malformed Authorization header');
  }

  try {
    req.user = verifyAccessToken(token);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  next();
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) {
    throw new HttpError(401, 'Authentication required');
  }
  return req.user;
}
