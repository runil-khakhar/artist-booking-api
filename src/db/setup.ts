import { readFile } from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { config } from '../config';
import { ArtistProfile } from '../modules/artists/artist-profile.model';
import { Review } from '../modules/artists/review.model';

const SCHEMA_FILE = path.resolve(__dirname, '../../database/schema.sql');

// Uses its own connection: the app pool expects the database to exist already, and this is the
// only place that runs a multi-statement script.
export async function setupMysql(): Promise<void> {
  const { database, ...server } = config.mysql;
  const connection = await mysql.createConnection({ ...server, multipleStatements: true });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
    await connection.query(`USE \`${database}\``);
    await connection.query(await readFile(SCHEMA_FILE, 'utf8'));
  } finally {
    await connection.end();
  }
}

export async function setupMongoIndexes(): Promise<void> {
  await Promise.all([ArtistProfile.syncIndexes(), Review.syncIndexes()]);
}
