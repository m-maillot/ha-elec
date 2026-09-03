export interface Settings {
  haUrl: string | null;
  entityId: string | null;
  tempoEntityId: string | null;
  subscribedPowerKva: number;
  currentOption: 'base' | 'hphc' | 'tempo';
  tempoSource: 'rte' | 'ha' | 'csv';
  colorSwitchHour: number;
  rteClientId: string | null;
  haTokenDefined: boolean;
  rteSecretDefined: boolean;
}
export async function fetchSettings(): Promise<Settings> {
  const response = await fetch('/api/settings');
  if (!response.ok) throw new Error('Impossible de charger la configuration');
  return response.json() as Promise<Settings>;
}
export async function saveSettings(value: unknown): Promise<Settings> {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!response.ok)
    throw new Error(
      ((await response.json()) as { error?: string }).error ?? 'Configuration invalide',
    );
  return response.json() as Promise<Settings>;
}
