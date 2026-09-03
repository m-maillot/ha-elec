import { describe, expect, it } from 'vitest';
import { CORE_VERSION, TARIFF_OPTIONS } from './index.js';

describe('@ha-elec/core', () => {
  it('expose les trois options du Tarif Bleu', () => {
    expect(TARIFF_OPTIONS).toEqual(['base', 'hphc', 'tempo']);
  });

  it('expose une version', () => {
    expect(CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
