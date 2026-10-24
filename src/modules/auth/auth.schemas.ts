import { z } from 'zod';

// No email format check on purpose: a malformed email just matches no account, so every bad
// login gets the same 401 and nothing hints at which field was wrong.
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});
