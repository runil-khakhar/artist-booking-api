import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.join(__dirname, '../.env'), quiet: true });

// A copied .env.example leaves keys like `PORT=` empty; treat those as not set.
const fromEnv = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

const databaseName = z
  .string()
  .regex(/^\w+$/, { error: 'use letters, digits and underscores only' });

const envSchema = z.object({
  NODE_ENV: fromEnv(z.enum(['development', 'test', 'production']).default('development')),
  PORT: fromEnv(z.coerce.number().int().positive().default(3000)),
  MYSQL_HOST: fromEnv(z.string().default('127.0.0.1')),
  MYSQL_PORT: fromEnv(z.coerce.number().int().positive().default(3306)),
  MYSQL_USER: fromEnv(z.string().default('root')),
  MYSQL_PASSWORD: z.string().default(''),
  MYSQL_DATABASE: fromEnv(databaseName.default('artist_booking')),
  MONGO_URI: fromEnv(z.string().default('mongodb://127.0.0.1:27017')),
  MONGO_DB: fromEnv(databaseName.default('artist_booking')),
  SEED_USER_PASSWORD: fromEnv(
    z.string().min(8, { error: 'must be at least 8 characters' }).optional(),
  ),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map(
    (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
}

const env = parsed.data;
const isTest = env.NODE_ENV === 'test';
// Tests get their own databases, so a test run can never wipe development data.
const dbSuffix = isTest ? '_test' : '';

export const config = {
  env: env.NODE_ENV,
  isTest,
  port: env.PORT,
  mysql: {
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: `${env.MYSQL_DATABASE}${dbSuffix}`,
  },
  mongo: {
    uri: env.MONGO_URI,
    dbName: `${env.MONGO_DB}${dbSuffix}`,
  },
  bcryptRounds: isTest ? 4 : 12,
  seedUserPassword: env.SEED_USER_PASSWORD,
} as const;
