import { Router } from 'express';
import * as artistController from './artist.controller';

export const artistRouter = Router();

artistRouter.get('/:id/reviews', artistController.listReviews);
