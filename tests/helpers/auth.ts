import request from 'supertest';
import { app } from '../../src/app';
import type { TestUser } from './factories';

// Goes through the real login endpoint, so every test that needs a token also exercises auth.
export async function loginAs(user: TestUser): Promise<string> {
  const res = await request(app)
    .post('/auth/login')
    .send({ email: user.email, password: user.password });

  if (res.status !== 200) {
    throw new Error(`Login failed for ${user.email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return (res.body as { data: { token: string } }).data.token;
}
