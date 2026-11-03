import { describe, expect, it } from 'vitest';
import { parseMascot, step } from './mascot';

describe('маскот', () => {
  it('бежит в своем направлении', () => {
    expect(step({ x: 100, direction: 1 }, 1, 400)).toEqual({ x: 145, direction: 1 });
    expect(step({ x: 100, direction: -1 }, 1, 400)).toEqual({ x: 55, direction: -1 });
  });

  it('у края разворачивается и не выходит за полосу', () => {
    expect(step({ x: 360, direction: 1 }, 1, 400)).toEqual({ x: 368, direction: -1 });
    expect(step({ x: 10, direction: -1 }, 1, 400)).toEqual({ x: 0, direction: 1 });
  });

  it('неизвестное значение из настроек дает Гантельку', () => {
    expect(parseMascot('')).toBe('dumbbell');
    expect(parseMascot('none')).toBe('none');
    expect(parseMascot('cat')).toBe('cat');
  });
});
