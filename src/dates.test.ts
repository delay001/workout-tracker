import { describe, expect, it } from 'vitest';
import { formatDuration, formatMonth, monthCells, shiftMonth } from './dates';

describe('календарь', () => {
  it('начинает неделю с понедельника', () => {
    // 1 ноября 2026 — воскресенье: перед ним шесть пустых клеток
    const cells = monthCells(2026, 10);

    expect(cells.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(cells.at(-1)).toBe('2026-11-30');
  });

  it('если месяц начинается в понедельник, пустых клеток нет', () => {
    expect(monthCells(2026, 5)[0]).toBe('2026-06-01');
  });

  it('учитывает февраль високосного года', () => {
    expect(monthCells(2028, 1).at(-1)).toBe('2028-02-29');
  });

  it('переходит через границу года', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('пишет название месяца с большой буквы', () => {
    expect(formatMonth(2026, 10)).toBe('Ноябрь 2026');
  });
});

describe('длительность', () => {
  it('показывается в часах и минутах', () => {
    expect(formatDuration(80)).toBe('1:20');
    expect(formatDuration(55)).toBe('0:55');
    expect(formatDuration(125)).toBe('2:05');
  });
});
