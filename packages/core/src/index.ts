/**
 * @ha-elec/core – moteur de calcul pur, sans I/O.
 *
 * Les règles métier sont décrites dans docs/SPEC.md §5. Ce lot 0 ne pose que le
 * squelette du paquet ; le modèle de grille, l'affectation HP/HC et le calcul des
 * trois options arrivent au lot 1.
 */

/** Options du Tarif Bleu comparées par l'application. */
export type TariffOption = 'base' | 'hphc' | 'tempo';

/** Couleurs Tempo. */
export type TempoColor = 'blue' | 'white' | 'red';

export const TARIFF_OPTIONS: readonly TariffOption[] = ['base', 'hphc', 'tempo'];

export const CORE_VERSION = '0.1.0';
