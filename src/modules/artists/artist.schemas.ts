import { z } from 'zod';
import { positiveInteger } from '../../shared/schemas';

export const reviewsQuerySchema = z.object({
  page: positiveInteger('must be a whole number, 1 or more').default(1),
  limit: positiveInteger('must be a whole number from 1 to 50', 50).default(10),
});
