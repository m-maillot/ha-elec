import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import type { AppConfig } from './config.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-elec-api-'));
const config: AppConfig = {
  port: 0,
  host: '127.0.0.1',
  dataDir,
  webDist: null,
  appSecret: 'test-secret',
};

describe('GET /api/health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ config, logger: false });
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
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

  it('stocke les secrets sans les renvoyer et simule depuis le cache CSV', async () => {
    const settings = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        haUrl: 'http://ha.local:8123',
        haToken: 'un-secret',
        hpEntityId: 'sensor.linky_hchp',
        hcEntityId: 'sensor.linky_hchc',
        tariffs: {
          base: { pricePerKwh: 0.2, subscriptionYearly: 0 },
          hphc: { hpPricePerKwh: 0.22, hcPricePerKwh: 0.16, subscriptionYearly: 0 },
          tempo: {
            subscriptionYearly: 0,
            prices: {
              blue: { hpPricePerKwh: 0.16, hcPricePerKwh: 0.13 },
              white: { hpPricePerKwh: 0.19, hcPricePerKwh: 0.15 },
              red: { hpPricePerKwh: 0.73, hcPricePerKwh: 0.16 },
            },
          },
        },
        hphcOffpeakRanges: [{ startMinute: 1320, endMinute: 360 }],
        tempoOffpeakRanges: [{ startMinute: 1320, endMinute: 360 }],
      },
    });
    expect(settings.statusCode).toBe(200);
    expect(settings.body).not.toContain('un-secret');
    expect(settings.json<{ haTokenDefined: boolean }>().haTokenDefined).toBe(true);
    await app.inject({
      method: 'POST',
      url: '/api/tempo/days',
      payload: { days: [{ date: '2026-01-15', color: 'red' }] },
    });
    const simulation = await app.inject({
      method: 'POST',
      url: '/api/simulate',
      payload: { from: '2026-01-15', to: '2026-01-15' },
    });
    expect(simulation.statusCode).toBe(200);
    expect(simulation.json<{ base: { totalCost: number } }>().base.totalCost).toBe(0);
  });
});
