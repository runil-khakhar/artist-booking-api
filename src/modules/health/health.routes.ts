import { Router } from 'express';
import { isMongoConnected } from '../../db/mongo';
import { isMysqlUp } from '../../db/mysql';
import { sendError, sendSuccess } from '../../shared/response';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const checks = { mysql: await isMysqlUp(), mongodb: isMongoConnected() };
  const down = Object.entries(checks)
    .filter(([, up]) => !up)
    .map(([name]) => name);

  if (down.length > 0) {
    sendError(res, 503, `Unavailable: ${down.join(', ')}`);
    return;
  }
  sendSuccess(res, { status: 'ok', mysql: 'up', mongodb: 'up' });
});
