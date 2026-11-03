import { describe, expect, it } from 'vitest';
import { EMPTY, formatTime, lap, pause, start, toMinutes, total } from './stopwatch';

describe('секундомер', () => {
  it('идет от запуска и копит время между паузами', () => {
    let watch = start(EMPTY, 1_000);
    expect(total(watch, 61_000)).toBe(60_000);
    watch = pause(watch, 61_000);
    expect(total(watch, 999_000)).toBe(60_000);
    watch = start(watch, 100_000);
    expect(total(watch, 130_000)).toBe(90_000);
  });

  it('круг — время от прошлой отметки', () => {
    let watch = start(EMPTY, 0);
    watch = lap(watch, 10_000);
    watch = lap(watch, 25_000);
    expect(watch.laps).toEqual([10_000, 15_000]);
  });

  it('минуты для длительности округляются', () => {
    expect(toMinutes((77 * 60 + 40) * 1000)).toBe(78);
    expect(toMinutes(20_000)).toBe(0);
  });

  it('формат времени', () => {
    expect(formatTime((3600 + 2 * 60 + 5) * 1000)).toBe('1:02:05');
    expect(formatTime(65_000, false)).toBe('01:05');
  });
});
