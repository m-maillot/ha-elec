/** Moteur de calcul pur. Les montants sont exprimés en euros (TTC). */
export type TariffOption = 'base' | 'hphc' | 'tempo';
export type TempoColor = 'blue' | 'white' | 'red';

export const TARIFF_OPTIONS: readonly TariffOption[] = ['base', 'hphc', 'tempo'];
export const CORE_VERSION = '0.2.0';

/** Plage [startMinute, endMinute[. Une fin inférieure au début traverse minuit. */
export interface OffpeakRange {
  startMinute: number;
  endMinute: number;
}

export interface TariffGrid {
  base: { pricePerKwh: number; subscriptionYearly: number };
  hphc: { hpPricePerKwh: number; hcPricePerKwh: number; subscriptionYearly: number };
  tempo: {
    subscriptionYearly: number;
    prices: Record<TempoColor, { hpPricePerKwh: number; hcPricePerKwh: number }>;
  };
}

/** Début d'un bucket horaire HA (instant UTC) et énergie consommée pendant l'heure. */
export interface ConsumptionHour {
  start: Date | string;
  kwh: number;
}

/** La date est la date civile de début du jour Tempo (06:00 par défaut). */
export interface TempoDay {
  date: string;
  color: TempoColor;
}

export interface SimulationInput {
  /** Bornes civiles incluses, au format YYYY-MM-DD. */
  from: string;
  to: string;
  consumption: readonly ConsumptionHour[];
  tempoDays: readonly TempoDay[];
  tariffs: TariffGrid;
  hphcOffpeakRanges: readonly OffpeakRange[];
  tempoOffpeakRanges: readonly OffpeakRange[];
  timeZone?: string;
  colorSwitchHour?: number;
}

export interface EnergySplit {
  hpKwh: number;
  hcKwh: number;
}

export interface CostBreakdown {
  consumptionCost: number;
  subscriptionCost: number;
  totalCost: number;
  consumptionKwh: number;
  averageConsumptionPrice: number | null;
}

export interface HphcResult extends CostBreakdown {
  split: EnergySplit;
}

export interface TempoColorResult extends EnergySplit {
  days: number;
  hpCost: number;
  hcCost: number;
  totalCost: number;
}

export interface TempoResult extends CostBreakdown {
  byColor: Record<TempoColor, TempoColorResult>;
  /** Buckets exclus car leur jour Tempo n'a pas de couleur connue. */
  excludedHours: number;
  excludedKwh: number;
}

export interface SimulationResult {
  base: CostBreakdown;
  hphc: HphcResult;
  tempo: TempoResult;
  periodDays: number;
}

const MINUTES_PER_DAY = 24 * 60;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let value = formatterCache.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, value);
  }
  return value;
}

function localParts(date: Date, timeZone: string): { date: string; minute: number } {
  const parts = formatter(timeZone).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const { year, month, day, hour, minute } = values;
  if (!year || !month || !day || !hour || !minute) throw new Error('Date locale invalide');
  return { date: `${year}-${month}-${day}`, minute: Number(hour) * 60 + Number(minute) };
}

function previousDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

function daysInclusive(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error('La période doit contenir deux dates YYYY-MM-DD valides et ordonnées');
  }
  return Math.floor((end - start) / 86_400_000) + 1;
}

/** Vérifie les contraintes de saisie des créneaux HC définies au §4.1.4. */
export function validateOffpeakRanges(ranges: readonly OffpeakRange[]): void {
  const occupiedSlots = new Set<number>();
  for (const range of ranges) {
    if (
      !Number.isInteger(range.startMinute) ||
      !Number.isInteger(range.endMinute) ||
      range.startMinute % 30 !== 0 ||
      range.endMinute % 30 !== 0 ||
      range.startMinute < 0 ||
      range.startMinute >= MINUTES_PER_DAY ||
      range.endMinute < 0 ||
      range.endMinute >= MINUTES_PER_DAY ||
      range.startMinute === range.endMinute
    ) {
      throw new Error('Une plage HC doit avoir des bornes distinctes, au pas de 30 minutes');
    }
    for (let minute = 0; minute < MINUTES_PER_DAY; minute += 30) {
      const inRange =
        range.startMinute < range.endMinute
          ? minute >= range.startMinute && minute < range.endMinute
          : minute >= range.startMinute || minute < range.endMinute;
      if (inRange && occupiedSlots.has(minute)) {
        throw new Error('Les plages HC ne doivent pas se chevaucher');
      }
      if (inRange) occupiedSlots.add(minute);
    }
  }
}

/** Indique si une minute locale appartient à l'une des plages HC. */
export function isOffpeakMinute(minute: number, ranges: readonly OffpeakRange[]): boolean {
  if (!Number.isInteger(minute) || minute < 0 || minute >= MINUTES_PER_DAY)
    throw new Error('La minute doit être comprise entre 0 et 1439');
  validateOffpeakRanges(ranges);
  return ranges.some(({ startMinute, endMinute }) =>
    startMinute < endMinute
      ? minute >= startMinute && minute < endMinute
      : minute >= startMinute || minute < endMinute,
  );
}

/** Part HC d'un bucket d'une heure ; les frontières au pas de 30 min donnent 0, 0,5 ou 1. */
export function offpeakRatio(
  start: Date | string,
  ranges: readonly OffpeakRange[],
  timeZone = 'Europe/Paris',
): number {
  const instant = new Date(start);
  if (Number.isNaN(instant.getTime())) throw new Error('Date de consommation invalide');
  const first = localParts(new Date(instant.getTime() + 15 * 60_000), timeZone).minute;
  const second = localParts(new Date(instant.getTime() + 45 * 60_000), timeZone).minute;
  return (Number(isOffpeakMinute(first, ranges)) + Number(isOffpeakMinute(second, ranges))) / 2;
}

function emptyColorResult(days: number): TempoColorResult {
  return { days, hpKwh: 0, hcKwh: 0, hpCost: 0, hcCost: 0, totalCost: 0 };
}

function costBreakdown(
  consumptionCost: number,
  subscriptionCost: number,
  consumptionKwh: number,
): CostBreakdown {
  return {
    consumptionCost,
    subscriptionCost,
    totalCost: consumptionCost + subscriptionCost,
    consumptionKwh,
    averageConsumptionPrice: consumptionKwh === 0 ? null : consumptionCost / consumptionKwh,
  };
}

/** Calcule les trois options sans arrondi intermédiaire. */
export function simulate(input: SimulationInput): SimulationResult {
  const timeZone = input.timeZone ?? 'Europe/Paris';
  const colorSwitchHour = input.colorSwitchHour ?? 6;
  if (!Number.isInteger(colorSwitchHour) || colorSwitchHour < 0 || colorSwitchHour > 23)
    throw new Error("L'heure de bascule Tempo doit être comprise entre 0 et 23");
  const periodDays = daysInclusive(input.from, input.to);
  const colors = new Map(input.tempoDays.map(({ date, color }) => [date, color]));
  const colorDays = new Map<TempoColor, Set<string>>([
    ['blue', new Set()],
    ['white', new Set()],
    ['red', new Set()],
  ]);
  for (const { date, color } of input.tempoDays)
    if (date >= input.from && date <= input.to) colorDays.get(color)?.add(date);

  let totalKwh = 0;
  let baseConsumption = 0;
  let hphcConsumption = 0;
  let hphcHp = 0;
  let hphcHc = 0;
  let tempoConsumption = 0;
  let tempoKwh = 0;
  let excludedHours = 0;
  let excludedKwh = 0;
  const byColor: Record<TempoColor, TempoColorResult> = {
    blue: emptyColorResult(colorDays.get('blue')?.size ?? 0),
    white: emptyColorResult(colorDays.get('white')?.size ?? 0),
    red: emptyColorResult(colorDays.get('red')?.size ?? 0),
  };

  for (const hour of input.consumption) {
    if (!Number.isFinite(hour.kwh) || hour.kwh < 0)
      throw new Error('La consommation doit être un nombre positif');
    const instant = new Date(hour.start);
    if (Number.isNaN(instant.getTime())) throw new Error('Date de consommation invalide');
    totalKwh += hour.kwh;
    baseConsumption += hour.kwh * input.tariffs.base.pricePerKwh;
    const hphcRatio = offpeakRatio(instant, input.hphcOffpeakRanges, timeZone);
    const hphcHcKwh = hour.kwh * hphcRatio;
    const hphcHpKwh = hour.kwh - hphcHcKwh;
    hphcHp += hphcHpKwh;
    hphcHc += hphcHcKwh;
    hphcConsumption +=
      hphcHpKwh * input.tariffs.hphc.hpPricePerKwh + hphcHcKwh * input.tariffs.hphc.hcPricePerKwh;
    const local = localParts(instant, timeZone);
    const tempoDate = local.minute < colorSwitchHour * 60 ? previousDate(local.date) : local.date;
    const color = colors.get(tempoDate);
    if (!color) {
      excludedHours += 1;
      excludedKwh += hour.kwh;
      continue;
    }
    const ratio = offpeakRatio(instant, input.tempoOffpeakRanges, timeZone);
    const hcKwh = hour.kwh * ratio;
    const hpKwh = hour.kwh - hcKwh;
    const detail = byColor[color];
    const prices = input.tariffs.tempo.prices[color];
    detail.hpKwh += hpKwh;
    detail.hcKwh += hcKwh;
    detail.hpCost += hpKwh * prices.hpPricePerKwh;
    detail.hcCost += hcKwh * prices.hcPricePerKwh;
    detail.totalCost = detail.hpCost + detail.hcCost;
    tempoKwh += hour.kwh;
    tempoConsumption += hpKwh * prices.hpPricePerKwh + hcKwh * prices.hcPricePerKwh;
  }
  const baseSubscription = (input.tariffs.base.subscriptionYearly * periodDays) / 365;
  const hphcSubscription = (input.tariffs.hphc.subscriptionYearly * periodDays) / 365;
  const tempoSubscription = (input.tariffs.tempo.subscriptionYearly * periodDays) / 365;
  return {
    base: costBreakdown(baseConsumption, baseSubscription, totalKwh),
    hphc: {
      ...costBreakdown(hphcConsumption, hphcSubscription, totalKwh),
      split: { hpKwh: hphcHp, hcKwh: hphcHc },
    },
    tempo: {
      ...costBreakdown(tempoConsumption, tempoSubscription, tempoKwh),
      byColor,
      excludedHours,
      excludedKwh,
    },
    periodDays,
  };
}
