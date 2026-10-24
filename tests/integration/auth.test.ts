import { randomUUID } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';
import { resetDatabases } from '../helpers/db';
import { createUser, type TestUser } from '../helpers/factories';

describe('POST /auth/login', () => {
  const someOtherPassword = randomUUID();
  let client: TestUser;

  const login = (body: object) => request(app).post('/auth/login').send(body);

  beforeEach(async () => {
    await resetDatabases();
    client = await createUser('client');
  });

  it('returns a signed JWT carrying the user id, role and issue time', async () => {
    const res = await login({ email: client.email, password: client.password });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      error: null,
      data: {
        token: expect.any(String),
        token_type: 'Bearer',
        expires_in: 3600,
        user: { id: client.id, name: 'Test client', role: 'client' },
      },
    });

    const decoded = jwt.decode(res.body.data.token, { complete: true });
    const payload = decoded?.payload as JwtPayload;
    expect(decoded?.header.alg).toBe('HS256');
    expect(payload).toEqual({
      sub: String(client.id),
      role: 'client',
      iat: expect.any(Number),
      exp: (payload.iat ?? 0) + 3600,
    });
  });

  it('matches the email case-insensitively and ignores surrounding spaces', async () => {
    const res = await login({
      email: `  ${client.email.toUpperCase()} `,
      password: client.password,
    });

    expect(res.status).toBe(200);
  });

  it('gives the same 401 for a wrong password and for an unknown email', async () => {
    const wrongPassword = await login({ email: client.email, password: someOtherPassword });
    const unknownEmail = await login({ email: 'nobody@example.test', password: client.password });

    const expected = { success: false, data: null, error: 'Invalid email or password' };
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body).toEqual(expected);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(expected);
  });

  it.each([
    [{}],
    [{ email: 'someone@example.test' }],
    [{ password: someOtherPassword }],
    [{ email: '', password: '' }],
  ])('returns 400 without naming the field when credentials are missing (%j)', async (body) => {
    const res = await login(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      data: null,
      error: 'email and password are required',
    });
  });
});
