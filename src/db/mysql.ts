import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';
import { config } from '../config';

export type Queryable = Pool | PoolConnection;

export const pool = mysql.createPool({
  ...config.mysql,
  connectionLimit: 10,
  // Read and write JS dates as UTC; mysql2 would otherwise use the machine's time zone.
  timezone: 'Z',
});

// CURRENT_TIMESTAMP defaults follow the session time zone, so keep sessions in UTC too.
// Registered on the core pool, whose listener receives the callback-style connection.
pool.pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'", (err) => {
    if (err) console.error('Could not set the MySQL session time zone to UTC', err);
  });
});

export async function isMysqlUp(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function withTransaction<T>(work: (db: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    // READ COMMITTED gives each statement a fresh snapshot, so a check made after taking a lock
    // sees whatever the previous lock holder committed.
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback().catch(() => undefined);
    throw err;
  } finally {
    connection.release();
  }
}
