import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { OffpeakRange, TariffGrid, TariffOption, TempoColor } from '@ha-elec/core';

export interface SettingsRecord {
  haUrl: string | null;
  haTokenEnc: string | null;
  hpEntityId: string | null;
  hcEntityId: string | null;
  subscribedPowerKva: number;
  currentOption: TariffOption;
  tempoSource: 'rte';
  smoothingRefDays: number;
  smoothingSearchWindowDays: number;
  colorSwitchHour: number;
  rteClientId: string | null;
  rteSecretEnc: string | null;
}
export interface PublicSettings extends Omit<SettingsRecord, 'haTokenEnc' | 'rteSecretEnc'> {
  haTokenDefined: boolean;
  rteSecretDefined: boolean;
}
export interface HourRow {
  startUtc: string;
  kwh: number;
  sourceSum: number | null;
  fetchedAt: string;
}

const defaults: SettingsRecord = {
  haUrl: null,
  haTokenEnc: null,
  hpEntityId: null,
  hcEntityId: null,
  subscribedPowerKva: 6,
  currentOption: 'base',
  tempoSource: 'rte',
  smoothingRefDays: 3,
  smoothingSearchWindowDays: 14,
  colorSwitchHour: 6,
  rteClientId: null,
  rteSecretEnc: null,
};

export class AppDatabase {
  private readonly db: Database.Database;
  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, 'ha-elec.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), ha_url TEXT, ha_token_enc TEXT, entity_id TEXT, tempo_entity_id TEXT, subscribed_power_kva INTEGER NOT NULL DEFAULT 6, tempo_source TEXT NOT NULL DEFAULT 'csv', current_option TEXT NOT NULL DEFAULT 'base', smoothing_ref_days INTEGER NOT NULL DEFAULT 3, smoothing_search_window_days INTEGER NOT NULL DEFAULT 14, color_switch_hour INTEGER NOT NULL DEFAULT 6, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tariffs (option TEXT PRIMARY KEY, valid_from TEXT, subscription_yearly REAL NOT NULL, price_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS offpeak_ranges (id INTEGER PRIMARY KEY, tariff_set TEXT NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS consumption_hours (start_utc TEXT PRIMARY KEY, kwh REAL NOT NULL, source_sum REAL, fetched_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tempo_days (date TEXT PRIMARY KEY, color TEXT NOT NULL, source TEXT NOT NULL, fetched_at TEXT NOT NULL);`);
    for (const column of [
      'rte_client_id TEXT',
      'rte_secret_enc TEXT',
      'hp_entity_id TEXT',
      'hc_entity_id TEXT',
    ]) {
      try {
        this.db.exec(`ALTER TABLE settings ADD COLUMN ${column}`);
      } catch {
        /* migration déjà appliquée */
      }
    }
  }
  close(): void {
    this.db.close();
  }
  settings(): SettingsRecord {
    return {
      ...defaults,
      ...(this.db
        .prepare(
          `SELECT ha_url AS haUrl,ha_token_enc AS haTokenEnc,hp_entity_id AS hpEntityId,hc_entity_id AS hcEntityId,
          subscribed_power_kva AS subscribedPowerKva,tempo_source AS tempoSource,current_option AS currentOption,
          smoothing_ref_days AS smoothingRefDays,smoothing_search_window_days AS smoothingSearchWindowDays,
          color_switch_hour AS colorSwitchHour,rte_client_id AS rteClientId,rte_secret_enc AS rteSecretEnc FROM settings WHERE id=1`,
        )
        .get() as Partial<SettingsRecord> | undefined),
    };
  }
  publicSettings(): PublicSettings {
    const { haTokenEnc, rteSecretEnc, ...settings } = this.settings();
    return {
      ...settings,
      haTokenDefined: Boolean(haTokenEnc),
      rteSecretDefined: Boolean(rteSecretEnc),
    };
  }
  saveSettings(input: Partial<SettingsRecord>): void {
    const next = { ...this.settings(), ...input };
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO settings (id,ha_url,ha_token_enc,hp_entity_id,hc_entity_id,subscribed_power_kva,tempo_source,current_option,smoothing_ref_days,smoothing_search_window_days,color_switch_hour,rte_client_id,rte_secret_enc,updated_at) VALUES (1,@haUrl,@haTokenEnc,@hpEntityId,@hcEntityId,@subscribedPowerKva,@tempoSource,@currentOption,@smoothingRefDays,@smoothingSearchWindowDays,@colorSwitchHour,@rteClientId,@rteSecretEnc,@now) ON CONFLICT(id) DO UPDATE SET ha_url=@haUrl,ha_token_enc=@haTokenEnc,hp_entity_id=@hpEntityId,hc_entity_id=@hcEntityId,subscribed_power_kva=@subscribedPowerKva,tempo_source=@tempoSource,current_option=@currentOption,smoothing_ref_days=@smoothingRefDays,smoothing_search_window_days=@smoothingSearchWindowDays,color_switch_hour=@colorSwitchHour,rte_client_id=@rteClientId,rte_secret_enc=@rteSecretEnc,updated_at=@now`,
      )
      .run({ ...next, now });
  }
  saveTariffs(tariffs: TariffGrid): void {
    const insert = this.db.prepare(
      'INSERT INTO tariffs(option,valid_from,subscription_yearly,price_json) VALUES (?,?,?,?) ON CONFLICT(option) DO UPDATE SET subscription_yearly=excluded.subscription_yearly, price_json=excluded.price_json',
    );
    insert.run('base', null, tariffs.base.subscriptionYearly, JSON.stringify(tariffs.base));
    insert.run('hphc', null, tariffs.hphc.subscriptionYearly, JSON.stringify(tariffs.hphc));
    insert.run('tempo', null, tariffs.tempo.subscriptionYearly, JSON.stringify(tariffs.tempo));
  }
  tariffs(): TariffGrid | null {
    const rows = this.db.prepare('SELECT option, price_json FROM tariffs').all() as {
      option: TariffOption;
      price_json: string;
    }[];
    if (rows.length !== 3) return null;
    return Object.fromEntries(
      rows.map((row) => [row.option, JSON.parse(row.price_json)]),
    ) as TariffGrid;
  }
  saveRanges(set: 'hphc' | 'tempo', ranges: readonly OffpeakRange[]): void {
    const write = this.db.transaction(() => {
      this.db.prepare('DELETE FROM offpeak_ranges WHERE tariff_set=?').run(set);
      const insert = this.db.prepare(
        'INSERT INTO offpeak_ranges(tariff_set,start_min,end_min) VALUES (?,?,?)',
      );
      for (const range of ranges) insert.run(set, range.startMinute, range.endMinute);
    });
    write();
  }
  ranges(set: 'hphc' | 'tempo'): OffpeakRange[] {
    return this.db
      .prepare(
        'SELECT start_min AS startMinute,end_min AS endMinute FROM offpeak_ranges WHERE tariff_set=? ORDER BY id',
      )
      .all(set) as OffpeakRange[];
  }
  upsertHours(hours: readonly HourRow[]): void {
    const insert = this.db.prepare(
      'INSERT INTO consumption_hours(start_utc,kwh,source_sum,fetched_at) VALUES (@startUtc,@kwh,@sourceSum,@fetchedAt) ON CONFLICT(start_utc) DO UPDATE SET kwh=excluded.kwh,source_sum=excluded.source_sum,fetched_at=excluded.fetched_at',
    );
    const write = this.db.transaction(() => hours.forEach((hour) => insert.run(hour)));
    write();
  }
  hours(from: string, to: string): HourRow[] {
    return this.db
      .prepare(
        'SELECT start_utc AS startUtc,kwh,source_sum AS sourceSum,fetched_at AS fetchedAt FROM consumption_hours WHERE start_utc >= ? AND start_utc < ? ORDER BY start_utc',
      )
      .all(`${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`) as HourRow[];
  }
  upsertTempoDays(days: readonly { date: string; color: TempoColor; source: string }[]): void {
    const insert = this.db.prepare(
      'INSERT INTO tempo_days(date,color,source,fetched_at) VALUES (?,?,?,?) ON CONFLICT(date) DO UPDATE SET color=excluded.color,source=excluded.source,fetched_at=excluded.fetched_at',
    );
    const now = new Date().toISOString();
    const write = this.db.transaction(() =>
      days.forEach((day) => insert.run(day.date, day.color, day.source, now)),
    );
    write();
  }
  tempoDays(from: string, to: string): { date: string; color: TempoColor; source: string }[] {
    return this.db
      .prepare(
        'SELECT date,color,source FROM tempo_days WHERE date >= ? AND date <= ? ORDER BY date',
      )
      .all(from, to) as { date: string; color: TempoColor; source: string }[];
  }
}
