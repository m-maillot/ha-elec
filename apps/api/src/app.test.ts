import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import type { AppConfig } from './config.js';

const config: AppConfig = {
  port: 0,
  host: '127.0.0.1',
  dataDir: '/tmp',
  webDist: null,
  appSecret: null,
};

describe('GET /api/health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ config, logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('répond ok avec les versions', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; version: string; core: string }>();
    expect(body.status).toBe('ok');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(body.core).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('renvoie 404 JSON hors front', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/inconnu' });
    expect(response.statusCode).toBe(404);
  });
});
