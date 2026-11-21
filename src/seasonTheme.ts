export type SeasonThemeId = 'winter' | 'spring' | 'summer' | 'autumn';

export interface SeasonThemeMeta {
  id: SeasonThemeId;
  seasonKo: string;
  poeticKo: string;
  subtitleKo: string;
  labelEn: string;
  /** Preview swatch hexes for UI selector */
  canvasHex: string;
  cardHex: string;
  accentHex: string;
  secondaryHex: string;
  /** Mobile browser chrome theme-color */
  themeColor: string;
  /** Recharts yearly income/expense palette aligned with the season */
  chartIncome: string;
  chartExpense: string;
}

export const SEASON_THEMES: readonly SeasonThemeMeta[] = [
  {
    id: 'spring',
    seasonKo: '봄',
    poeticKo: '춘야',
    subtitleKo: '밤벚꽃 · 청자',
    labelEn: 'Spring',
    canvasHex: '#100C12',
    cardHex: '#18121B',
    accentHex: '#F4B8C5',
    secondaryHex: '#6EE7B7',
    themeColor: '#100C12',
    chartIncome: '#6EE7B7',
    chartExpense: '#F4B8C5',
  },
  {
    id: 'summer',
    seasonKo: '여름',
    poeticKo: '청하',
    subtitleKo: '동해밤 · 청죽',
    labelEn: 'Summer',
    canvasHex: '#080E18',
    cardHex: '#0F1826',
    accentHex: '#7DD3FC',
    secondaryHex: '#2DD4BF',
    themeColor: '#080E18',
    chartIncome: '#2DD4BF',
    chartExpense: '#7DD3FC',
  },
  {
    id: 'autumn',
    seasonKo: '가을',
    poeticKo: '추색',
    subtitleKo: '단풍 · 황토먹',
    labelEn: 'Autumn',
    canvasHex: '#110D0A',
    cardHex: '#1B1510',
    accentHex: '#F6B667',
    secondaryHex: '#FB923C',
    themeColor: '#110D0A',
    chartIncome: '#34D399',
    chartExpense: '#F6B667',
  },
  {
    id: 'winter',
    seasonKo: '겨울',
    poeticKo: '설야',
    subtitleKo: '수묵 · 설백',
    labelEn: 'Winter',
    canvasHex: '#090A0D',
    cardHex: '#111217',
    accentHex: '#FFFFFF',
    secondaryHex: '#93C5FD',
    themeColor: '#090A0D',
    chartIncome: '#38BDF8',
    chartExpense: '#FBBF24',
  },
] as const;

export const DEFAULT_SEASON_THEME: SeasonThemeId = 'winter';
export const SEASON_CHANGE_EVENT = 'vibe-season-theme-changed';

export function normalizeSeasonTheme(value: unknown): SeasonThemeId {
  if (value === 'spring' || value === 'summer' || value === 'autumn' || value === 'winter') {
    return value;
  }
  return DEFAULT_SEASON_THEME;
}

export function getSeasonThemeMeta(id?: unknown): SeasonThemeMeta {
  const normalized = normalizeSeasonTheme(id);
  return SEASON_THEMES.find((item) => item.id === normalized) || SEASON_THEMES[3];
}

export function getStoredSeasonTheme(): SeasonThemeId {
  if (typeof localStorage === 'undefined') return DEFAULT_SEASON_THEME;
  try {
    const raw = localStorage.getItem('vibe_user_preferences');
    if (raw) {
      const parsed = JSON.parse(raw);
      return normalizeSeasonTheme(parsed?.seasonTheme);
    }
  } catch {
    // Ignore storage read failures
  }
  return DEFAULT_SEASON_THEME;
}

export function applySeasonTheme(season?: unknown): SeasonThemeId {
  const normalized = normalizeSeasonTheme(season);
  const meta = getSeasonThemeMeta(normalized);

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.setAttribute('data-season', normalized);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', meta.themeColor);
    }
  }

  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent(SEASON_CHANGE_EVENT, { detail: normalized }));
  }

  return normalized;
}
