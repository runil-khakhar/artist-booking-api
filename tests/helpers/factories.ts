import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { ResultSetHeader } from 'mysql2/promise';
import { config } from '../../src/config';
import { pool } from '../../src/db/mysql';
import type { Role } from '../../src/modules/users/roles';

export interface TestUser {
  id: number;
  email: string;
  password: string;
  role: Role;
}

export async function createUser(role: Role): Promise<TestUser> {
  const email = `${role}-${randomUUID()}@example.test`;
  const password = randomUUID();
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [`Test ${role}`, email, passwordHash, role],
  );
  return { id: result.insertId, email, password, role };
}
