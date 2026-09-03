import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import {
  CORE_VERSION,
  simulate,
  validateOffpeakRanges,
  type OffpeakRange,
  type TariffGrid,
} from '@ha-elec/core';
import type { AppConfig } from './config.js';
import { decryptSecret, encryptSecret } from './crypto.js';
import { AppDatabase, type SettingsRecord } from './database.js';
import { fetchHourlyConsumption, testHaConnection } from './home-assistant.js';
import { fetchRteTempoDays } from './tempo.js';

export const API_VERSION = '0.1.0';

export interface BuildOptions {
  config: AppConfig;
  logger?: boolean;
}

/**
 * Construit l'application Fastify sans la démarrer (utilisé par le serveur et les tests).
 */
export async function buildApp({ config, logger = true }: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger });
  const database = new AppDatabase(config.dataDir);
  app.addHook('onClose', () => database.close());

  const requireSecret = (): string => {
    if (!config.appSecret)
      throw new Error('APP_SECRET est requis pour enregistrer ou utiliser les secrets');
    return config.appSecret;
  };
  const configuredHa = (): { url: string; token: string; entityIds: [string, string] } => {
    const settings = database.settings();
    if (!settings.haUrl || !settings.haTokenEnc || !settings.hpEntityId || !settings.hcEntityId)
      throw new Error(
        'La connexion Home Assistant et l’entité de consommation doivent être configurées',
      );
    return {
      url: settings.haUrl,
      token: decryptSecret(settings.haTokenEnc, requireSecret()),
      entityIds: [settings.hpEntityId, settings.hcEntityId],
    };
  };
  const configuredRte = () => {
    const settings = database.settings();
    if (!settings.rteClientId || !settings.rteSecretEnc)
      throw new Error('Les identifiants RTE doivent être configurés');
    return {
      clientId: settings.rteClientId,
      secret: decryptSecret(settings.rteSecretEnc, requireSecret()),
    };
  };

  app.get('/api/health', async () => ({
    status: 'ok' as const,
    version: API_VERSION,
    core: CORE_VERSION,
    time: new Date().toISOString(),
  }));

  app.get('/api/settings', async () => database.publicSettings());
  app.put('/api/settings', async (request, reply) => {
    const body = request.body as Partial<SettingsRecord> & {
      haToken?: string;
      rteSecret?: string;
      tariffs?: TariffGrid;
      hphcOffpeakRanges?: OffpeakRange[];
      tempoOffpeakRanges?: OffpeakRange[];
    };
    try {
      if (body.hphcOffpeakRanges) validateOffpeakRanges(body.hphcOffpeakRanges);
      if (body.tempoOffpeakRanges) validateOffpeakRanges(body.tempoOffpeakRanges);
      const { haToken, rteSecret, tariffs, hphcOffpeakRanges, tempoOffpeakRanges, ...settings } =
        body;
      database.saveSettings({
        ...settings,
        ...(haToken === undefined ? {} : { haTokenEnc: encryptSecret(haToken, requireSecret()) }),
        ...(rteSecret === undefined
          ? {}
          : { rteSecretEnc: encryptSecret(rteSecret, requireSecret()) }),
      });
      if (tariffs) database.saveTariffs(tariffs);
      if (hphcOffpeakRanges) database.saveRanges('hphc', hphcOffpeakRanges);
      if (tempoOffpeakRanges) database.saveRanges('tempo', tempoOffpeakRanges);
      return database.publicSettings();
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Configuration invalide' });
    }
  });

  app.post('/api/ha/test', async (request, reply) => {
    const body = request.body as {
      url?: string;
      token?: string;
      hpEntityId?: string;
      hcEntityId?: string;
    };
    try {
      if (!body.url || !body.token || !body.hpEntityId || !body.hcEntityId)
        throw new Error('URL, token et les deux index Linky sont requis');
      const result = await testHaConnection(body.url, body.token);
      const ids = new Set(result.entities.map((entity) => entity.entityId));
      if (!ids.has(body.hpEntityId) || !ids.has(body.hcEntityId))
        throw new Error('Un ou plusieurs index Linky sont introuvables ou inéligibles');
      return result;
    } catch (error) {
      return reply.code(502).send({
        error: error instanceof Error ? error.message : 'Connexion Home Assistant impossible',
      });
    }
  });
  app.get('/api/ha/entities', async (_request, reply) => {
    try {
      const ha = configuredHa();
      return (await testHaConnection(ha.url, ha.token)).entities;
    } catch (error) {
      return reply.code(502).send({
        error: error instanceof Error ? error.message : 'Connexion Home Assistant impossible',
      });
    }
  });

  app.post('/api/data/sync', async (request, reply) => {
    const query = request.query as { from?: string; to?: string };
    try {
      if (!query.from || !query.to) throw new Error('Les paramètres from et to sont requis');
      const ha = configuredHa();
      const hours = await fetchHourlyConsumption(
        ha.url,
        ha.token,
        ha.entityIds,
        `${query.from}T00:00:00+00:00`,
        `${query.to}T23:59:59+00:00`,
      );
      database.upsertHours(hours.map((hour) => ({ ...hour, fetchedAt: new Date().toISOString() })));
      return { syncedHours: hours.length };
    } catch (error) {
      return reply.code(502).send({
        error: error instanceof Error ? error.message : 'Synchronisation Home Assistant impossible',
      });
    }
  });

  app.get('/api/consumption', async (request, reply) => {
    const query = request.query as { from?: string; to?: string; granularity?: string };
    if (!query.from || !query.to || (query.granularity && query.granularity !== 'hour'))
      return reply.code(400).send({ error: 'from, to et granularity=hour sont requis' });
    return database.hours(query.from, query.to);
  });

  app.get('/api/tempo/days', async (request, reply) => {
    const query = request.query as { from?: string; to?: string };
    if (!query.from || !query.to) return reply.code(400).send({ error: 'from et to sont requis' });
    return database.tempoDays(query.from, query.to);
  });
  app.post('/api/tempo/days', async (request, reply) => {
    const body = request.body as {
      days?: Array<{ date: string; color: 'blue' | 'white' | 'red' }>;
    };
    if (
      !body.days?.every(
        (day) =>
          /^\d{4}-\d{2}-\d{2}$/.test(day.date) && ['blue', 'white', 'red'].includes(day.color),
      )
    )
      return reply.code(400).send({ error: 'Jours Tempo invalides' });
    database.upsertTempoDays(body.days.map((day) => ({ ...day, source: 'csv' })));
    return { imported: body.days.length };
  });
  app.post('/api/tempo/test', async (_request, reply) => {
    try {
      const rte = configuredRte();
      const today = new Date().toISOString().slice(0, 10);
      return { days: await fetchRteTempoDays(rte.clientId, rte.secret, today, today) };
    } catch (error) {
      return reply
        .code(502)
        .send({ error: error instanceof Error ? error.message : 'Connexion RTE impossible' });
    }
  });
  app.post('/api/tempo/sync', async (request, reply) => {
    const query = request.query as { from?: string; to?: string };
    try {
      if (!query.from || !query.to) throw new Error('from et to sont requis');
      const rte = configuredRte();
      const days = await fetchRteTempoDays(rte.clientId, rte.secret, query.from, query.to);
      database.upsertTempoDays(days.map((day) => ({ ...day, source: 'rte' })));
      return { syncedDays: days.length, source: 'rte' };
    } catch (error) {
      return reply.code(502).send({
        error: error instanceof Error ? error.message : 'Synchronisation Tempo impossible',
      });
    }
  });
  app.post('/api/simulate', async (request, reply) => {
    const body = request.body as { from?: string; to?: string };
    try {
      if (!body.from || !body.to) throw new Error('from et to sont requis');
      const tariffs = database.tariffs();
      if (!tariffs) throw new Error('La grille tarifaire est incomplète');
      const settings = database.settings();
      return simulate({
        from: body.from,
        to: body.to,
        tariffs,
        hphcOffpeakRanges: database.ranges('hphc'),
        tempoOffpeakRanges: database.ranges('tempo'),
        colorSwitchHour: settings.colorSwitchHour,
        consumption: database
          .hours(body.from, body.to)
          .map((hour) => ({ start: hour.startUtc, kwh: hour.kwh })),
        tempoDays: database.tempoDays(body.from, body.to),
      });
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Simulation impossible' });
    }
  });

  // Sert le front buildé (image Docker unique, §6.8) avec repli SPA hors /api.
  const indexHtml = config.webDist ? path.join(config.webDist, 'index.html') : null;
  if (config.webDist && indexHtml && fs.existsSync(indexHtml)) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.method !== 'GET') {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.log.info('Front non trouvé : seules les routes /api sont servies');
  }

  return app;
}
