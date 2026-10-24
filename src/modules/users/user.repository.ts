import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
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

export interface ArtistSummary {
  id: number;
  name: string;
}

export async function findArtistById(id: number): Promise<ArtistSummary | null> {
  const [rows] = await pool.query<(ArtistSummary & RowDataPacket)[]>(
    "SELECT id, name FROM users WHERE id = ? AND role = 'artist'",
    [id],
  );
  return rows[0] ?? null;
}

// Holds the artist's row until the transaction ends, so schedule changes for one artist run one at
// a time. Lock order is always artist, then booking; never lock a client's row this way.
export async function lockArtist(id: number, db: PoolConnection): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT id FROM users WHERE id = ? AND role = 'artist' FOR UPDATE",
    [id],
  );
  return rows.length > 0;
}
