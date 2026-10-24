import type { Request, Response } from 'express';
import { HttpError } from '../../shared/http-error';
import { sendSuccess } from '../../shared/response';
import { loginSchema } from './auth.schemas';
import * as authService from './auth.service';

export async function login(req: Request, res: Response): Promise<void> {
  const credentials = loginSchema.safeParse(req.body);
  if (!credentials.success) {
    throw new HttpError(400, 'email and password are required');
  }

  const session = await authService.login(credentials.data.email, credentials.data.password);

  sendSuccess(res, {
    token: session.token,
    token_type: 'Bearer',
    expires_in: session.expiresIn,
    user: session.user,
  });
}
