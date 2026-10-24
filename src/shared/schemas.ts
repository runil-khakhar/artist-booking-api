import { z } from 'zod';

const MAX_ID = 4_294_967_295; // largest INT UNSIGNED

// Digits only: z.coerce.number would also accept "0x1f", "1e2" or " 7 ".
export const positiveInteger = (message: string, max = Number.MAX_SAFE_INTEGER) =>
  z
    .string({ error: message })
    .regex(/^\d+$/, { error: message })
    .transform(Number)
    .pipe(z.number().min(1, { error: message }).max(max, { error: message }));

export const idParamsSchema = z.object({
  id: positiveInteger('must be a positive integer', MAX_ID),
});
