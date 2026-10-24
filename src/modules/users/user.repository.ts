import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../db/mysql';
import type { Role } from './roles';

export interface UserCredentials {
  id: number;
  name: string;
  role: Role;
  password_hash: string;
}

// The only query that reads password_hash.
export async function findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
  const [rows] = await pool.query<(UserCredentials & RowDataPacket)[]>(
    'SELECT id, name, role, password_hash FROM users WHERE email = ? LIMIT 1',
    [email],
  );
  return rows[0] ?? null;
}
