import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { CORE_VERSION } from '@ha-elec/core';
import type { AppConfig } from './config.js';

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

  app.get('/api/health', async () => ({
    status: 'ok' as const,
    version: API_VERSION,
    core: CORE_VERSION,
    time: new Date().toISOString(),
  }));

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
