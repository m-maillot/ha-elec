import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchSettings, saveSettings } from './api/settings';

const emptyTariffs = {
  base: { pricePerKwh: 0.2, subscriptionYearly: 190.32 },
  hphc: { hpPricePerKwh: 0.2142, hcPricePerKwh: 0.1589, subscriptionYearly: 190.32 },
  tempo: {
    subscriptionYearly: 189.6,
    prices: {
      blue: { hpPricePerKwh: 0.1654, hcPricePerKwh: 0.1356 },
      white: { hpPricePerKwh: 0.1921, hcPricePerKwh: 0.1536 },
      red: { hpPricePerKwh: 0.7295, hcPricePerKwh: 0.1615 },
    },
  },
};
const input = 'mt-1 block w-full rounded border border-slate-300 px-3 py-2';
export function App() {
  const query = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const [form, setForm] = useState<Record<string, unknown>>({
    tariffs: emptyTariffs,
    hphcOffpeakRanges: [{ startMinute: 1320, endMinute: 360 }],
    tempoOffpeakRanges: [{ startMinute: 1320, endMinute: 360 }],
    subscribedPowerKva: 6,
    tempoSource: 'rte',
    colorSwitchHour: 6,
    currentOption: 'base',
  });
  const mutation = useMutation({ mutationFn: saveSettings, onSuccess: () => query.refetch() });
  const set = (key: string, value: unknown) => setForm((old) => ({ ...old, [key]: value }));
  const tariff = form.tariffs as typeof emptyTariffs;
  const number = (label: string, value: number, change: (value: number) => void) => (
    <label className="block text-sm">
      {label}
      <input
        className={input}
        type="number"
        step="0.0001"
        value={value}
        onChange={(e) => change(Number(e.target.value))}
      />
    </label>
  );
  if (query.isPending) return <main className="p-8">Chargement…</main>;
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 text-slate-900">
      <header>
        <h1 className="text-3xl font-semibold">Configuration</h1>
        <p className="text-slate-600">Comparateur Tarif Bleu EDF</p>
      </header>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(form);
        }}
      >
        <section className="rounded-lg border p-5">
          <h2 className="text-xl font-medium">Home Assistant</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label>
              URL
              <input
                className={input}
                value={(form.haUrl as string) ?? ''}
                placeholder="http://homeassistant.local:8123"
                onChange={(e) => set('haUrl', e.target.value)}
              />
            </label>
            <label>
              Token longue durée
              <input
                className={input}
                type="password"
                placeholder={
                  query.data?.haTokenDefined ? 'Déjà défini — laisser vide pour conserver' : ''
                }
                onChange={(e) => set('haToken', e.target.value || undefined)}
              />
            </label>
            <label>
              Entité consommation
              <input
                className={input}
                value={(form.entityId as string) ?? ''}
                placeholder="sensor.energy"
                onChange={(e) => set('entityId', e.target.value)}
              />
            </label>
            <label>
              Entité Tempo (optionnelle)
              <input
                className={input}
                value={(form.tempoEntityId as string) ?? ''}
                onChange={(e) => set('tempoEntityId', e.target.value)}
              />
            </label>
          </div>
        </section>
        <section className="rounded-lg border p-5">
          <h2 className="text-xl font-medium">Tarifs et puissance</h2>
          <label className="mt-3 block">
            Puissance souscrite
            <select
              className={input}
              value={form.subscribedPowerKva as number}
              onChange={(e) => set('subscribedPowerKva', Number(e.target.value))}
            >
              {[3, 6, 9, 12, 15, 18].map((v) => (
                <option key={v}>{v} kVA</option>
              ))}
            </select>
          </label>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              {number('Base €/kWh', tariff.base.pricePerKwh, (v) =>
                set('tariffs', { ...tariff, base: { ...tariff.base, pricePerKwh: v } }),
              )}
              {number('Abo Base €/an', tariff.base.subscriptionYearly, (v) =>
                set('tariffs', { ...tariff, base: { ...tariff.base, subscriptionYearly: v } }),
              )}
            </div>
            <div>
              {number('HP €/kWh', tariff.hphc.hpPricePerKwh, (v) =>
                set('tariffs', { ...tariff, hphc: { ...tariff.hphc, hpPricePerKwh: v } }),
              )}
              {number('HC €/kWh', tariff.hphc.hcPricePerKwh, (v) =>
                set('tariffs', { ...tariff, hphc: { ...tariff.hphc, hcPricePerKwh: v } }),
              )}
              {number('Abo HP/HC €/an', tariff.hphc.subscriptionYearly, (v) =>
                set('tariffs', { ...tariff, hphc: { ...tariff.hphc, subscriptionYearly: v } }),
              )}
            </div>
            <div>
              {number('Tempo bleu HP', tariff.tempo.prices.blue.hpPricePerKwh, (v) =>
                set('tariffs', {
                  ...tariff,
                  tempo: {
                    ...tariff.tempo,
                    prices: {
                      ...tariff.tempo.prices,
                      blue: { ...tariff.tempo.prices.blue, hpPricePerKwh: v },
                    },
                  },
                }),
              )}
              {number('Tempo bleu HC', tariff.tempo.prices.blue.hcPricePerKwh, (v) =>
                set('tariffs', {
                  ...tariff,
                  tempo: {
                    ...tariff.tempo,
                    prices: {
                      ...tariff.tempo.prices,
                      blue: { ...tariff.tempo.prices.blue, hcPricePerKwh: v },
                    },
                  },
                }),
              )}
            </div>
          </div>
        </section>
        <section className="rounded-lg border p-5">
          <h2 className="text-xl font-medium">Couleurs Tempo</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label>
              Source
              <select
                className={input}
                value={form.tempoSource as string}
                onChange={(e) => set('tempoSource', e.target.value)}
              >
                <option value="rte">API officielle RTE</option>
                <option value="ha">Entité Home Assistant</option>
                <option value="csv">Import CSV</option>
              </select>
            </label>
            <label>
              Client ID RTE
              <input
                className={input}
                value={(form.rteClientId as string) ?? ''}
                onChange={(e) => set('rteClientId', e.target.value)}
              />
            </label>
            <label>
              Secret RTE
              <input
                className={input}
                type="password"
                placeholder={
                  query.data?.rteSecretDefined ? 'Déjà défini — laisser vide pour conserver' : ''
                }
                onChange={(e) => set('rteSecret', e.target.value || undefined)}
              />
            </label>
            <label>
              Bascule couleur
              <select
                className={input}
                value={form.colorSwitchHour as number}
                onChange={(e) => set('colorSwitchHour', Number(e.target.value))}
              >
                <option value={6}>06:00</option>
              </select>
            </label>
          </div>
        </section>
        {mutation.isError && <p className="text-red-700">{mutation.error.message}</p>}
        {mutation.isSuccess && <p className="text-green-700">Configuration enregistrée.</p>}
        <button
          className="rounded bg-slate-900 px-4 py-2 font-medium text-white"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </main>
  );
}
