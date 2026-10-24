import type { Response } from 'express';

type ApiResponse<T> =
  { success: true; data: T; error: null } | { success: false; data: null; error: string };

export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { success: true, data, error: null };
  res.status(status).json(body);
}

export function sendError(res: Response, status: number, message: string): void {
  const body: ApiResponse<never> = { success: false, data: null, error: message };
  res.status(status).json(body);
}
