import { Router } from 'express';
import { sendSuccess } from '../../shared/response';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  sendSuccess(res, { status: 'ok' });
});
