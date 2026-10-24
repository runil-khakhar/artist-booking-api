import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { ResultSetHeader } from 'mysql2/promise';
import { config } from '../config';
import { describeConnectionError } from '../db/connection-error';
import { connectMongo, disconnectMongo } from '../db/mongo';
import { pool } from '../db/mysql';
import { setupMongoIndexes, setupMysql } from '../db/setup';
import { ArtistProfile } from '../modules/artists/artist-profile.model';
import { Review } from '../modules/artists/review.model';
import type { BookingStatus } from '../modules/bookings/booking.constants';
import type { Role } from '../modules/users/roles';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Clients go in first so the ids stay predictable: clients are 1-2, artists 3-5.
const USERS = [
  { key: 'alice', name: 'Alice Moreno', email: 'alice@example.com', role: 'client' },
  { key: 'ben', name: 'Ben Okafor', email: 'ben@example.com', role: 'client' },
  { key: 'maya', name: 'Maya Lin', email: 'maya@example.com', role: 'artist' },
  { key: 'leo', name: 'Leo Brandt', email: 'leo@example.com', role: 'artist' },
  { key: 'nina', name: 'Nina Petrova', email: 'nina@example.com', role: 'artist' },
] as const satisfies readonly { key: string; name: string; email: string; role: Role }[];

type UserKey = (typeof USERS)[number]['key'];
type ArtistKey = Extract<(typeof USERS)[number], { role: 'artist' }>['key'];

interface ProfileSeed {
  artist: ArtistKey;
  displayName: string;
  category: string;
  bio: string;
  hourlyRateCents: number;
  genres?: string[];
  city: string;
}

const PROFILES: ProfileSeed[] = [
  {
    artist: 'maya',
    displayName: 'DJ Maya',
    category: 'DJ',
    bio: 'House and disco sets for weddings and late-night parties.',
    hourlyRateCents: 15000,
    genres: ['house', 'disco'],
    city: 'Mumbai',
  },
  {
    artist: 'leo',
    displayName: 'The Leo Brandt Trio',
    category: 'Live Band',
    bio: 'Jazz standards and soul covers for dinners and receptions.',
    hourlyRateCents: 40000,
    genres: ['jazz', 'soul'],
    city: 'Pune',
  },
  {
    artist: 'nina',
    displayName: 'Nina Petrova Photography',
    category: 'Photographer',
    bio: 'Candid event photography, edited gallery within a week.',
    hourlyRateCents: 12000,
    city: 'Bengaluru',
  },
];

function daysFromNow(days: number, utcHour = 18): Date {
  const date = new Date(Date.now() + days * DAY);
  date.setUTCHours(utcHour, 0, 0, 0);
  return date;
}

const startedAnHourAgo = new Date(Date.now() - HOUR);
startedAnHourAgo.setUTCMinutes(0, 0, 0);

type SeedBooking = [
  artist: ArtistKey,
  client: UserKey,
  status: BookingStatus,
  start: Date,
  hours: number,
  notes: string,
  review?: [score: number, comment: string],
];

// prettier-ignore
const BOOKINGS: SeedBooking[] = [
  ['maya', 'alice', 'completed', daysFromNow(-60), 4, 'Birthday party', [5, 'Packed dance floor all night.']],
  ['maya', 'ben', 'completed', daysFromNow(-45), 5, 'Wedding reception', [5, 'Read the room perfectly.']],
  ['maya', 'alice', 'completed', daysFromNow(-30), 3, 'Office party', [4, 'Great music, started a little late.']],
  ['maya', 'ben', 'completed', daysFromNow(-20), 4, 'Engagement party', [4, 'Good set, guests loved it.']],
  ['maya', 'alice', 'completed', daysFromNow(-12), 4, 'Rooftop launch event', [5, 'Would book again.']],
  ['maya', 'ben', 'completed', daysFromNow(-5), 3, 'Anniversary dinner', [3, 'Too loud for a dinner, but friendly.']],
  // The booking was cancelled, so this review must not show up or count.
  ['maya', 'alice', 'cancelled', daysFromNow(-8), 3, 'Pool party', [1, 'Cancelled on us.']],
  ['maya', 'alice', 'confirmed', daysFromNow(10), 4, 'Wedding sangeet'],
  ['maya', 'ben', 'pending', daysFromNow(10, 20), 3, 'After-party, overlaps the sangeet'],
  ['maya', 'ben', 'pending', daysFromNow(14), 4, 'College fest'],

  ['leo', 'ben', 'completed', daysFromNow(-40, 19), 3, 'Jazz dinner', [4, 'Lovely atmosphere.']],
  ['leo', 'alice', 'completed', daysFromNow(-25, 19), 3, 'Corporate gala', [5, 'Brilliant musicians.']],
  ['leo', 'ben', 'completed', daysFromNow(-9, 19), 2, 'Gallery opening', [4, 'Exactly the vibe we wanted.']],
  ['leo', 'alice', 'in_progress', startedAnHourAgo, 4, 'Restaurant residency'],
  ['leo', 'alice', 'pending', daysFromNow(7, 19), 3, 'Charity evening'],

  ['nina', 'ben', 'confirmed', daysFromNow(20, 10), 6, 'Wedding photography'],
];

// TRUNCATE resets AUTO_INCREMENT, which keeps the ids above (and in the README) valid.
// FOREIGN_KEY_CHECKS is per session, so all of it runs on one connection.
async function resetData(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of ['booking_status_history', 'payments', 'bookings', 'users']) {
      await connection.query(`TRUNCATE TABLE ${table}`);
    }
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    connection.release();
  }

  await Promise.all([ArtistProfile.deleteMany({}), Review.deleteMany({})]);
}

async function insertUsers(password: string): Promise<Record<UserKey, number>> {
  const ids = {} as Record<UserKey, number>;
  for (const user of USERS) {
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [user.name, user.email, passwordHash, user.role],
    );
    ids[user.key] = result.insertId;
  }
  return ids;
}

async function insertBookingsAndReviews(userIds: Record<UserKey, number>): Promise<number> {
  const reviews = [];

  for (const [artist, client, status, start, hours, notes, review] of BOOKINGS) {
    const end = new Date(start.getTime() + hours * HOUR);
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO bookings (artist_id, client_id, status, event_start, event_end, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userIds[artist], userIds[client], status, start, end, notes],
    );

    if (review) {
      const [score, comment] = review;
      reviews.push({
        bookingId: result.insertId,
        artistId: userIds[artist],
        clientId: userIds[client],
        score,
        comment,
        createdAt: new Date(end.getTime() + DAY),
      });
    }
  }

  await Review.insertMany(reviews);
  return reviews.length;
}

async function main(): Promise<void> {
  if (config.env === 'production') {
    throw new Error('Refusing to seed a production database');
  }

  await setupMysql();
  await connectMongo();
  await setupMongoIndexes();

  const password = config.seedUserPassword ?? randomBytes(9).toString('base64url');

  await resetData();
  const userIds = await insertUsers(password);
  await ArtistProfile.insertMany(
    PROFILES.map(({ artist, ...profile }) => ({ userId: userIds[artist], ...profile })),
  );
  const reviewCount = await insertBookingsAndReviews(userIds);

  console.log(
    `Seeded ${USERS.length} users, ${BOOKINGS.length} bookings and ${reviewCount} reviews.\n`,
  );
  for (const user of USERS) {
    console.log(
      `  ${String(userIds[user.key]).padStart(2)}  ${user.role.padEnd(6)}  ${user.email}`,
    );
  }
  console.log(
    config.seedUserPassword
      ? '\nAll accounts use SEED_USER_PASSWORD from .env.'
      : `\nAll accounts use this generated password (it is not stored anywhere): ${password}`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(`Seeding failed. ${describeConnectionError(err)}`);
    process.exitCode = 1;
  })
  .finally(() => Promise.allSettled([pool.end(), disconnectMongo()]));
