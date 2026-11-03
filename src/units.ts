import { LOCALE, t } from './i18n';

export type Units = 'metric' | 'imperial';

const LB_IN_KG = 2.20462;
const IN_IN_CM = 0.393701;

let units: Units = 'metric';

export function setUnits(value: string): void {
  units = value === 'imperial' ? 'imperial' : 'metric';
}

export function getUnits(): Units {
  return units;
}

const round = (value: number, digits: number): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

// В базе вес всегда в кг, а длина в см. Пересчет только при показе и вводе.
export function toWeight(kg: number): number {
  return units === 'imperial' ? round(kg * LB_IN_KG, 1) : kg;
}

export function fromWeight(value: number): number {
  return units === 'imperial' ? round(value / LB_IN_KG, 2) : value;
}

export function toLength(cm: number): number {
  return units === 'imperial' ? round(cm * IN_IN_CM, 1) : cm;
}

export function fromLength(value: number): number {
  return units === 'imperial' ? round(value / IN_IN_CM, 1) : value;
}

export function weightUnit(): string {
  return units === 'imperial' ? t('unit.lb') : t('unit.kg');
}

export function lengthUnit(): string {
  return units === 'imperial' ? t('unit.in') : t('unit.cm');
}

export function formatWeight(kg: number): string {
  return `${toWeight(kg).toLocaleString(LOCALE)} ${weightUnit()}`;
}
