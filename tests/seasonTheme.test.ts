import { describe, it, expect, beforeEach } from 'vitest';
import {
  SEASON_THEMES,
  DEFAULT_SEASON_THEME,
  normalizeSeasonTheme,
  getSeasonThemeMeta,
  getStoredSeasonTheme,
} from '../src/seasonTheme';
import { patchUserPreferences, getUserPreferences } from '../src/utils';

const createLocalStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
};

describe('Korean Four Seasons Color Theme', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: createLocalStorageMock(),
    });
  });

  it('defines all four Korean dark editorial seasons with valid hex metadata', () => {
    expect(SEASON_THEMES.map((s) => s.id)).toEqual(['spring', 'summer', 'autumn', 'winter']);
    for (const season of SEASON_THEMES) {
      expect(season.canvasHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(season.accentHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(season.chartIncome).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(season.chartExpense).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('falls back safely to winter for unknown or missing theme values', () => {
    expect(normalizeSeasonTheme(undefined)).toBe(DEFAULT_SEASON_THEME);
    expect(normalizeSeasonTheme('monsoon')).toBe('winter');
    expect(normalizeSeasonTheme('spring')).toBe('spring');
    expect(normalizeSeasonTheme('summer')).toBe('summer');
    expect(normalizeSeasonTheme('autumn')).toBe('autumn');
    expect(getSeasonThemeMeta('invalid').id).toBe('winter');
  });

  it('persists and retrieves selected seasonTheme via user preferences', () => {
    expect(getStoredSeasonTheme()).toBe('winter');
    patchUserPreferences({ seasonTheme: 'autumn' });
    expect(getStoredSeasonTheme()).toBe('autumn');
    expect(getUserPreferences().seasonTheme).toBe('autumn');

    patchUserPreferences({ seasonTheme: 'spring' });
    expect(getStoredSeasonTheme()).toBe('spring');
    expect(getUserPreferences().seasonTheme).toBe('spring');
  });
});
