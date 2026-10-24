import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { config } from '../../config';
import { HttpError } from '../../shared/http-error';
import type { Role } from '../users/roles';
import * as userRepository from '../users/user.repository';
import { signAccessToken } from './token';

export interface LoginResult {
  token: string;
  expiresIn: number;
  user: { id: number; name: string; role: Role };
}

// Unknown emails are checked against this hash, so they take as long as a wrong password.
const dummyPasswordHash = bcrypt.hashSync(randomUUID(), config.bcryptRounds);

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await userRepository.findCredentialsByEmail(email);
  const passwordMatches = await bcrypt.compare(password, user?.password_hash ?? dummyPasswordHash);

  if (!user || !passwordMatches) {
    throw new HttpError(401, 'Invalid email or password');
  }

  return {
    token: signAccessToken(user),
    expiresIn: config.jwt.ttlSeconds,
    user: { id: user.id, name: user.name, role: user.role },
  };
}
