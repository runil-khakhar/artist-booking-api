import type { AuthUser } from '../modules/auth/token';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
