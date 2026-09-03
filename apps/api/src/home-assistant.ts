import WebSocket from 'ws';
import { createConnection, createLongLivedTokenAuth } from 'home-assistant-js-websocket';

type HaConnection = Awaited<ReturnType<typeof createConnection>>;
export interface HaEntity {
  entityId: string;
  name: string;
  unit: 'kWh' | 'Wh';
}
export interface HaHour {
  startUtc: string;
  kwh: number;
  sourceSum: number | null;
}

function setupWebSocket(): void {
  // La bibliothèque officielle utilise l'implémentation WebSocket globale.
  if (!globalThis.WebSocket) Object.assign(globalThis, { WebSocket });
}

async function withConnection<T>(
  url: string,
  token: string,
  callback: (connection: HaConnection) => Promise<T>,
): Promise<T> {
  setupWebSocket();
  const connection = await createConnection({
    auth: createLongLivedTokenAuth(url.replace(/\/$/, ''), token),
  });
  try {
    return await callback(connection);
  } finally {
    connection.close();
  }
}

export async function testHaConnection(
  url: string,
  token: string,
): Promise<{ version: string; entities: HaEntity[] }> {
  return withConnection(url, token, async (connection) => ({
    version: connection.haVersion,
    entities: await listEligibleEntities(connection),
  }));
}

async function listEligibleEntities(connection: HaConnection): Promise<HaEntity[]> {
  const result = await connection.sendMessagePromise<unknown>({
    type: 'recorder/list_statistic_ids',
  });
  const rows = Array.isArray(result)
    ? result
    : Array.isArray((result as { statistic_ids?: unknown[] }).statistic_ids)
      ? (result as { statistic_ids: unknown[] }).statistic_ids
      : Object.entries(result as Record<string, unknown>).map(([statistic_id, value]) => ({
          statistic_id,
          ...(value as object),
        }));
  return rows.flatMap((row) => {
    const value = row as {
      statistic_id?: string;
      unit_of_measurement?: string;
      has_sum?: boolean;
      name?: string;
    };
    if (
      !value.statistic_id ||
      !value.has_sum ||
      (value.unit_of_measurement !== 'kWh' && value.unit_of_measurement !== 'Wh')
    )
      return [];
    return [
      {
        entityId: value.statistic_id,
        name: value.name ?? value.statistic_id,
        unit: value.unit_of_measurement,
      },
    ];
  });
}
export async function fetchHourlyConsumption(
  url: string,
  token: string,
  entityIds: readonly string[],
  startTime: string,
  endTime: string,
): Promise<HaHour[]> {
  return withConnection(url, token, async (connection) => {
    const response = await connection.sendMessagePromise<
      Record<string, Array<{ start: string; sum?: number; change?: number }>>
    >({
      type: 'recorder/statistics_during_period',
      statistic_ids: entityIds,
      start_time: startTime,
      end_time: endTime,
      period: 'hour',
      types: ['sum', 'change'],
    });
    const totals = new Map<string, { kwh: number; sum: number }>();
    for (const entityId of entityIds) {
      const buckets = response[entityId] ?? [];
      for (const [index, bucket] of buckets.entries()) {
        const previous = buckets[index - 1];
        const kwh =
          bucket.change ??
          (previous?.sum === undefined || bucket.sum === undefined
            ? 0
            : Math.max(0, bucket.sum - previous.sum));
        const startUtc = new Date(bucket.start).toISOString();
        const total = totals.get(startUtc) ?? { kwh: 0, sum: 0 };
        total.kwh += Math.max(0, kwh);
        total.sum += bucket.sum ?? 0;
        totals.set(startUtc, total);
      }
    }
    return [...totals]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([startUtc, total]) => ({ startUtc, kwh: total.kwh, sourceSum: total.sum }));
  });
}
