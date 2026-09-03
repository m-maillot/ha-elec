import { describe, expect, it } from 'vitest';
import { offpeakRatio, simulate, validateOffpeakRanges, type TariffGrid } from './index.js';

const tariffs: TariffGrid = {
  base: { pricePerKwh: 0.2001, subscriptionYearly: 0 },
  hphc: { hpPricePerKwh: 0.2142, hcPricePerKwh: 0.1589, subscriptionYearly: 0 },
  tempo: {
    subscriptionYearly: 0,
    prices: {
      blue: { hpPricePerKwh: 0.1654, hcPricePerKwh: 0.1356 },
      white: { hpPricePerKwh: 0.1921, hcPricePerKwh: 0.1536 },
      red: { hpPricePerKwh: 0.7295, hcPricePerKwh: 0.1615 },
    },
  },
};

describe('@ha-elec/core', () => {
  it('répartit une heure au prorata pour une frontière HC à la demi-heure', () => {
    expect(
      offpeakRatio('2026-01-15T21:00:00Z', [{ startMinute: 22 * 60 + 30, endMinute: 6 * 60 + 30 }]),
    ).toBe(0.5);
    expect(
      offpeakRatio('2026-01-15T22:00:00Z', [{ startMinute: 22 * 60 + 30, endMinute: 6 * 60 + 30 }]),
    ).toBe(1);
  });
  it('refuse les créneaux HC qui se chevauchent', () => {
    expect(() =>
      validateOffpeakRanges([
        { startMinute: 22 * 60, endMinute: 6 * 60 },
        { startMinute: 5 * 60 + 30, endMinute: 7 * 60 },
      ]),
    ).toThrow('chevaucher');
  });
  it('applique la couleur Tempo sur une fenêtre 06:00 → 06:00', () => {
    const result = simulate({
      from: '2026-01-15',
      to: '2026-01-15',
      tariffs,
      consumption: [{ start: '2026-01-16T04:00:00Z', kwh: 1 }],
      tempoDays: [{ date: '2026-01-15', color: 'red' }],
      hphcOffpeakRanges: [],
      tempoOffpeakRanges: [{ startMinute: 22 * 60, endMinute: 6 * 60 }],
    });
    expect(result.tempo.byColor.red.hcKwh).toBe(1);
    expect(result.tempo.consumptionCost).toBeCloseTo(0.1615);
  });
  it('reproduit l’exemple numérique rouge du §5.6', () => {
    const result = simulate({
      from: '2026-01-15',
      to: '2026-01-15',
      tariffs,
      consumption: [
        { start: '2026-01-15T12:00:00Z', kwh: 4 },
        { start: '2026-01-15T22:00:00Z', kwh: 6 },
      ],
      tempoDays: [{ date: '2026-01-15', color: 'red' }],
      hphcOffpeakRanges: [{ startMinute: 22 * 60, endMinute: 6 * 60 }],
      tempoOffpeakRanges: [{ startMinute: 22 * 60, endMinute: 6 * 60 }],
    });
    expect(result.base.consumptionCost).toBeCloseTo(2.001);
    expect(result.hphc.consumptionCost).toBeCloseTo(1.8102);
    expect(result.tempo.consumptionCost).toBeCloseTo(3.887);
    expect(result.tempo.byColor.red).toMatchObject({ days: 1, hpKwh: 4, hcKwh: 6 });
  });
  it('prorate les abonnements sur le nombre de jours civils inclus', () => {
    const result = simulate({
      from: '2026-01-01',
      to: '2026-01-02',
      tariffs: { ...tariffs, base: { ...tariffs.base, subscriptionYearly: 365 } },
      consumption: [],
      tempoDays: [],
      hphcOffpeakRanges: [],
      tempoOffpeakRanges: [],
    });
    expect(result.base.subscriptionCost).toBe(2);
  });
});
