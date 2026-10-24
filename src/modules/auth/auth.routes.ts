import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../../config';
import { HttpError } from '../../shared/http-error';
import * as authController from './auth.controller';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => config.isTest,
  // The default handler answers in plain text; this keeps the usual response shape.
  handler: (_req, _res, next) => {
    next(new HttpError(429, 'Too many failed login attempts, try again in a few minutes'));
  },
});

authRouter.post('/login', loginLimiter, authController.login);
