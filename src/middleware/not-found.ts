import type { Request, Response } from 'express';
import { sendError } from '../shared/response';

export function notFound(req: Request, res: Response): void {
  sendError(res, 404, `Route ${req.method} ${req.path} not found`);
}
