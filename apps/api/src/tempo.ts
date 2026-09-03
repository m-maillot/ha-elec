import type { TempoColor } from '@ha-elec/core';
const base = 'https://digital.iservices.rte-france.com';
let token: { value: string; until: number } | undefined;
export function normalizeTempoColor(value: string): TempoColor | null {
  const v = value.toLowerCase().trim();
  return v === 'blue' || v === 'bleu'
    ? 'blue'
    : v === 'white' || v === 'blanc'
      ? 'white'
      : v === 'red' || v === 'rouge'
        ? 'red'
        : null;
}
async function accessToken(id: string, secret: string): Promise<string> {
  if (token && token.until > Date.now() + 60_000) return token.value;
  const response = await fetch(`${base}/token/oauth/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`Authentification RTE refusée (${response.status})`);
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Réponse OAuth2 RTE invalide');
  token = { value: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return token.value;
}
export async function fetchRteTempoDays(
  id: string,
  secret: string,
  from: string,
  to: string,
): Promise<Array<{ date: string; color: TempoColor }>> {
  const auth = await accessToken(id, secret);
  const url = new URL(`${base}/open_api/tempo_like_supply_contract/v1/tempo_like_calendars`);
  url.searchParams.set('start_date', from);
  url.searchParams.set('end_date', to);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${auth}` } });
  if (!response.ok) throw new Error(`Historique Tempo RTE indisponible (${response.status})`);
  const body = (await response.json()) as { tempo_like_calendars?: Array<Record<string, string>> };
  return (body.tempo_like_calendars ?? []).flatMap((item) => {
    const color = normalizeTempoColor(item.value ?? item.color ?? item.couleur ?? '');
    const date = item.date_application ?? item.date;
    return color && date ? [{ date: date.slice(0, 10), color }] : [];
  });
}
