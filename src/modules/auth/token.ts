import jwt from 'jsonwebtoken';
import { config } from '../../config';
import type { Role } from '../users/roles';

export interface AuthUser {
  id: number;
  role: Role;
}

const ALGORITHM = 'HS256';

export function signAccessToken(user: AuthUser): string {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwt.secret, {
    algorithm: ALGORITHM,
    expiresIn: config.jwt.ttlSeconds,
  });
}
