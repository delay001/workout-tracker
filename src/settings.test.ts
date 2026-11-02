import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ACCENTS, parseAccent, parseTheme, resolveTheme } from './settings';

describe('темы', () => {
  it('«как в системе» следует настройке телефона', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('явный выбор не зависит от системы', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('по умолчанию тёмная тема и розовый акцент', () => {
    expect(parseTheme('')).toBe('dark');
    expect(parseAccent('')).toBe('pink');
    expect(parseAccent('неизвестный')).toBe('pink');
  });

  it('акцентов не меньше шести', () => {
    expect(ACCENTS.length).toBeGreaterThanOrEqual(6);
  });
});
