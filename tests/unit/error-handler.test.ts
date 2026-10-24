import type { NextFunction, Request, Response } from 'express';
import { errorHandler } from '../../src/middleware/error-handler';
import { HttpError } from '../../src/shared/http-error';

function handle(err: unknown) {
  const res = { headersSent: false, status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);

  errorHandler(err, {} as Request, res as unknown as Response, jest.fn() as NextFunction);

  return { status: res.status.mock.calls[0]?.[0] as number, body: res.json.mock.calls[0]?.[0] };
}

describe('errorHandler', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the status and message of an HttpError', () => {
    expect(handle(new HttpError(409, 'Already booked'))).toEqual({
      status: 409,
      body: { success: false, data: null, error: 'Already booked' },
    });
  });

  it('answers anything unexpected with a generic 500 and logs the details', () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('connection to 10.0.0.5 lost');

    expect(handle(failure)).toEqual({
      status: 500,
      body: { success: false, data: null, error: 'Something went wrong on our side' },
    });
    expect(log).toHaveBeenCalledWith(failure);
  });
});
