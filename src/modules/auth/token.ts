import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../../config';
import { ROLES, type Role } from '../users/roles';

export interface AuthUser {
  id: number;
  role: Role;
}

const ALGORITHM = 'HS256';

const payloadSchema = z.object({
  sub: z.string().regex(/^\d+$/).transform(Number),
  role: z.enum(ROLES),
});

export function signAccessToken(user: AuthUser): string {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwt.secret, {
    algorithm: ALGORITHM,
    expiresIn: config.jwt.ttlSeconds,
  });
}

// Pinning the algorithm rejects tokens signed any other way, including alg "none".
export function verifyAccessToken(token: string): AuthUser {
  const payload = jwt.verify(token, config.jwt.secret, { algorithms: [ALGORITHM] });
  const { sub, role } = payloadSchema.parse(payload);
  return { id: sub, role };
}
