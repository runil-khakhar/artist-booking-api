import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.join(__dirname, '../.env'), quiet: true });

// A copied .env.example leaves keys like `PORT=` empty; treat those as not set.
const fromEnv = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

const envSchema = z.object({
  NODE_ENV: fromEnv(z.enum(['development', 'test', 'production']).default('development')),
  PORT: fromEnv(z.coerce.number().int().positive().default(3000)),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map(
    (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
} as const;
