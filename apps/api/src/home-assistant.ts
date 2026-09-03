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
  const result = await connection.sendMessagePromise<
    Record<string, { unit_of_measurement?: string; has_sum?: boolean; name?: string }>
  >({ type: 'recorder/list_statistic_ids' });
  return Object.entries(result)
    .filter(
      ([, value]) =>
        value.has_sum &&
        (value.unit_of_measurement === 'kWh' || value.unit_of_measurement === 'Wh'),
    )
    .map(([entityId, value]) => ({
      entityId,
      name: value.name ?? entityId,
      unit: value.unit_of_measurement as 'kWh' | 'Wh',
    }));
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
