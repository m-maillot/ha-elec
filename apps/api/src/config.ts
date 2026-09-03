import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AppConfig {
  /** Port d'écoute HTTP. */
  port: number;
  /** Adresse d'écoute (0.0.0.0 en conteneur). */
  host: string;
  /** Répertoire des données persistantes (SQLite). Volume `/data` en Docker. */
  dataDir: string;
  /** Répertoire du front buildé à servir (vide = pas de front servi). */
  webDist: string | null;
  /** Secret servant à dériver la clé de chiffrement des jetons (§6.7). */
  appSecret: string | null;
}

const here = path.dirname(fileURLToPath(import.meta.url));

function parsePort(value: string | undefined, fallback: number): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const defaultWebDist = path.resolve(here, '../../web/dist');
  return {
    port: parsePort(env['PORT'], 3000),
    host: env['HOST'] ?? '0.0.0.0',
    dataDir: env['DATA_DIR'] ?? path.resolve(here, '../../../data'),
    webDist: env['WEB_DIST'] === '' ? null : (env['WEB_DIST'] ?? defaultWebDist),
    appSecret: env['APP_SECRET'] ?? null,
  };
}
