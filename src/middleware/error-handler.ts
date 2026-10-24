import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../shared/http-error';
import { sendError } from '../shared/response';

function describeIssues(err: ZodError): string {
  return err.issues
    .map((issue) =>
      issue.path.length > 0 ? `${issue.path.join('.')} ${issue.message}` : issue.message,
    )
    .join('; ');
}

// What Express and body-parser throw for a bad request: malformed URL, invalid JSON, body too large.
interface ClientError extends Error {
  status: number;
  expose?: boolean;
  type?: string;
}

function isClientError(err: unknown): err is ClientError {
  return (
    err instanceof Error &&
    'status' in err &&
    typeof err.status === 'number' &&
    err.status >= 400 &&
    err.status < 500
  );
}

function clientErrorMessage(err: ClientError): string {
  if (err.type === 'entity.parse.failed') {
    return 'Request body is not valid JSON';
  }
  if (err.type === 'entity.too.large') {
    return 'Request body is too large';
  }
  return err.expose ? err.message : 'Bad request';
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof HttpError) {
    sendError(res, err.status, err.message);
    return;
  }
  if (err instanceof ZodError) {
    sendError(res, 400, describeIssues(err));
    return;
  }
  if (isClientError(err)) {
    sendError(res, err.status, clientErrorMessage(err));
    return;
  }

  console.error(err);
  sendError(res, 500, 'Something went wrong on our side');
};
