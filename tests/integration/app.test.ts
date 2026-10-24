import request from 'supertest';
import { app } from '../../src/app';

describe('app', () => {
  it('reports both databases as up', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { status: 'ok', mysql: 'up', mongodb: 'up' },
      error: null,
    });
  });

  it('returns the standard body for an unknown route', async () => {
    const res = await request(app).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, data: null, error: 'Route GET /nope not found' });
  });

  it('returns 400 for a body that is not valid JSON', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      data: null,
      error: 'Request body is not valid JSON',
    });
  });

  it('returns 400, not 500, for a URL that cannot be decoded', async () => {
    const res = await request(app).patch('/bookings/%E0%A4%A/status');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, data: null, error: 'Bad request' });
  });

  it('returns 413 for a body over the size limit', async () => {
    const res = await request(app)
      .post('/health')
      .send({ notes: 'x'.repeat(200 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ success: false, data: null, error: 'Request body is too large' });
  });
});
