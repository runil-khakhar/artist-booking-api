import { config } from '../../src/config';
import { pool } from '../../src/db/mysql';
import { ArtistProfile } from '../../src/modules/artists/artist-profile.model';
import { Review } from '../../src/modules/artists/review.model';

// Children first, so foreign keys never block a delete.
const TABLES = ['booking_status_history', 'payments', 'bookings', 'users'];

export async function resetDatabases(): Promise<void> {
  if (!config.mysql.database.endsWith('_test') || !config.mongo.dbName.endsWith('_test')) {
    throw new Error('Refusing to reset: the tests are not pointed at the *_test databases');
  }

  for (const table of TABLES) {
    await pool.query(`DELETE FROM ${table}`);
  }
  await Promise.all([Review.deleteMany({}), ArtistProfile.deleteMany({})]);
}
