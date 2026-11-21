import React, { useState, useEffect } from 'react';
import { Plus, X, Smartphone, Check } from 'lucide-react';
import { CustomDarkSelect, CustomSelectOption } from './CustomDarkSelect';
import { IOSInstallModal } from '../PWAInstallButton';
import { usePWAInstall } from '../../usePWAInstall';
import { SupportedCurrency } from '../../types';
import { KNOWN_CURRENCY_NAMES, getCurrencySymbol, patchUserPreferences } from '../../utils';
import { useI18n, LanguageCode, DEFAULT_CURRENCY_BY_LANGUAGE, LANGUAGE_STORAGE_KEY } from '../../i18n';
import {
  SEASON_THEMES,
  SeasonThemeId,
  applySeasonTheme,
  getStoredSeasonTheme,
  SEASON_CHANGE_EVENT,
} from '../../seasonTheme';

interface SettingsPreferencesTabProps {
  defaultLaunchScreen: 'vault' | 'insights' | 'ledger';
  setDefaultLaunchScreen: (screen: 'vault' | 'insights' | 'ledger') => void;
  currencySymbol: string;
  setCurrencySymbol: (sym: string) => void;
  currencyOptions: CustomSelectOption[];
  activeCurrenciesList: string[];
  setActiveCurrenciesList: (list: string[]) => void;
  newCurrencyInput: string;
  setNewCurrencyInput: (input: string) => void;
  currencyError: string | null;
  setCurrencyError: (err: string | null) => void;
  handleAddActiveCurrency: (code: string) => void;
  handleRemoveActiveCurrency: (code: string) => void;
  stealthMode: boolean;
  setStealthMode: (stealth: boolean) => void;
  budgetStartDay: number;
  setBudgetStartDay: (day: number) => void;
  budgetDayOptions: CustomSelectOption[];
  onDataChanged?: () => void;
}

export const SettingsPreferencesTab: React.FC<SettingsPreferencesTabProps> = ({
  defaultLaunchScreen,
  setDefaultLaunchScreen,
  currencySymbol,
  setCurrencySymbol,
  currencyOptions,
  activeCurrenciesList,
  newCurrencyInput,
  setNewCurrencyInput,
  currencyError,
  setCurrencyError,
  handleAddActiveCurrency,
  handleRemoveActiveCurrency,
  stealthMode,
  setStealthMode,
  budgetStartDay,
  setBudgetStartDay,
  budgetDayOptions,
  onDataChanged,
}) => {
  const { language, setLanguage, t } = useI18n();
  const [pendingCurrencyPrompt, setPendingCurrencyPrompt] = useState<SupportedCurrency | null>(null);
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isPwaDismissed, setIsPwaDismissed] = useState(() => {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vibe_pref_pwa_dismissed') === 'true';
  });
  const [seasonTheme, setSeasonTheme] = useState<SeasonThemeId>(() => getStoredSeasonTheme());

  useEffect(() => {
    const onSeasonChange = (e: Event) => {
      const next = (e as CustomEvent<SeasonThemeId>).detail;
      if (next) setSeasonTheme(next);
    };
    window.addEventListener(SEASON_CHANGE_EVENT, onSeasonChange);
    return () => window.removeEventListener(SEASON_CHANGE_EVENT, onSeasonChange);
  }, []);

  const handleSelectSeasonTheme = (next: SeasonThemeId) => {
    setSeasonTheme(next);
    patchUserPreferences({ seasonTheme: next });
    applySeasonTheme(next);
    if (onDataChanged) onDataChanged();
  };

  const handleLanguageSelect = (lang: LanguageCode) => {
    setLanguage(lang);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      } catch (e) {
        console.warn('Failed to save language preference:', e);
      }
    }
    const targetCurrency = DEFAULT_CURRENCY_BY_LANGUAGE[lang];
    if (targetCurrency && targetCurrency !== currencySymbol) {
      setPendingCurrencyPrompt(targetCurrency);
    } else {
      setPendingCurrencyPrompt(null);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Compact Dismissible Single-Line PWA Banner */}
      {!isPwaDismissed && !isInstalled && (
        <div className="px-3 py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone size={13} className="shrink-0 text-neutral-100" />
            <span className="text-neutral-100 truncate text-xs font-normal">
              {t('pwa_install_banner')}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={async () => {
                if (isInstallable) {
                  await install();
                } else {
                  setShowIOSModal(true);
                }
              }}
              className="px-2.5 py-1 rounded-lg bg-white text-black hover:bg-neutral-100 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
            >
              {t('install')}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPwaDismissed(true);
                try {
                  sessionStorage.setItem('vibe_pref_pwa_dismissed', 'true');
                } catch {}
              }}
              className="p-1 text-neutral-200 hover:text-white transition-colors cursor-pointer"
              aria-label={t('close')}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}
      <IOSInstallModal
        isOpen={showIOSModal}
        onClose={() => setShowIOSModal(false)}
        theme="dark"
      />

      {/* Group 0: 언어 설정 (Manual Language Selection Segment) */}
      <div className="space-y-3 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-white block">
              {t('language')}
            </span>
            <span className="text-xs text-neutral-200 font-normal">
              {t('language_desc')}
            </span>
          </div>
        </div>

        {/* 2-column focused language selector (KO / EN) */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-white/[0.02] border border-white/[0.08]">
          {([
            { code: 'ko' as LanguageCode, label: t('lang_ko') },
            { code: 'en' as LanguageCode, label: t('lang_en') },
          ]).map((opt) => (
            <button
              key={opt.code}
              type="button"
              id={`lang-btn-${opt.code}`}
              onClick={() => handleLanguageSelect(opt.code)}
              className={`px-3 py-2 rounded-xl text-xs transition-all active:scale-95 text-center cursor-pointer ${
                (language === 'ko' ? 'ko' : 'en') === opt.code
                  ? 'bg-white text-black font-semibold shadow-xs'
                  : 'text-neutral-200 hover:text-white font-medium hover:bg-white/[0.05]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Optional Base Currency Synchronization Prompt */}
        {pendingCurrencyPrompt && (
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-2.5 animate-in fade-in duration-200">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white font-normal leading-snug">
                {t('currency_switch_prompt', { currency: pendingCurrencyPrompt })}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setCurrencySymbol(pendingCurrencyPrompt);
                  if (!activeCurrenciesList.includes(pendingCurrencyPrompt)) {
                    handleAddActiveCurrency(pendingCurrencyPrompt);
                  }
                  patchUserPreferences({ currencySymbol: pendingCurrencyPrompt });
                  setPendingCurrencyPrompt(null);
                  if (onDataChanged) onDataChanged();
                }}
                className="px-2.5 py-1 rounded-lg bg-white text-black hover:bg-neutral-100 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
              >
                {t('switch_currency')}
              </button>
              <button
                type="button"
                onClick={() => setPendingCurrencyPrompt(null)}
                className="px-2 py-1 rounded-lg text-xs text-neutral-200 hover:text-white font-medium transition-colors cursor-pointer"
              >
                {t('keep_currency')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Group 0.5: 한국의 사계 컬러 테마 */}
      <div className="space-y-3 pb-4 border-b border-white/[0.06]">
        <div>
          <span className="text-xs font-semibold text-white block">
            {language === 'ko' ? '한국의 사계 컬러 테마' : 'Korean Four Seasons Palette'}
          </span>
          <span className="text-xs text-neutral-400 font-normal">
            {language === 'ko'
              ? '다크 에디토리얼 톤을 유지하면서 계절의 색온도와 포인트를 전환합니다.'
              : 'Switch dark editorial surface warmth and accents inspired by Korea’s four seasons.'}
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label={language === 'ko' ? '한국의 사계 컬러 테마 선택' : 'Select Korean Four Seasons theme'}
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
        >
          {SEASON_THEMES.map((season) => {
            const isActive = seasonTheme === season.id;
            return (
              <button
                key={season.id}
                id={`season-theme-btn-${season.id}`}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => handleSelectSeasonTheme(season.id)}
                className={`group relative flex flex-col justify-between gap-2.5 p-3 min-h-[76px] rounded-xl border text-left transition-all active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
                  isActive
                    ? 'border-[var(--color-accent-border)] bg-[var(--color-accent-subtle)]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.16]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="flex items-center gap-1.5" aria-hidden="true">
                    <span
                      className="w-4 h-4 rounded-full border border-white/20 shrink-0"
                      style={{ backgroundColor: season.canvasHex }}
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full -ml-2 border border-black/40 shrink-0"
                      style={{ backgroundColor: season.accentHex }}
                    />
                  </span>
                  {isActive && (
                    <Check size={13} className="text-[var(--color-accent)] shrink-0" />
                  )}
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {language === 'ko'
                      ? `${season.seasonKo} · ${season.poeticKo}`
                      : season.labelEn}
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate">
                    {season.subtitleKo}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Group 1: 화면 설정 (기본 시작 화면) */}
      <div className="space-y-3">
        <span className="text-xs font-semibold uppercase tracking-wider block text-neutral-100">
          {t('screen_settings')}
        </span>
        
        <div className="space-y-3 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-white">
              {t('default_launch_screen')}
            </span>
            <div className="flex p-0.5 rounded-xl border bg-white/[0.02] border-white/[0.08]">
              <button
                type="button"
                id="launch-screen-vault-btn"
                onClick={() => {
                  setDefaultLaunchScreen('vault');
                  patchUserPreferences({ defaultLaunchScreen: 'vault' });
                  if (onDataChanged) onDataChanged();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 cursor-pointer ${
                  defaultLaunchScreen === 'vault'
                    ? 'bg-white/[0.08] text-white shadow-xs font-bold'
                    : 'text-neutral-200 hover:text-white'
                }`}
              >
                {t('vault')}
              </button>
              <button
                type="button"
                id="launch-screen-insights-btn"
                onClick={() => {
                  setDefaultLaunchScreen('insights');
                  patchUserPreferences({ defaultLaunchScreen: 'insights' });
                  if (onDataChanged) onDataChanged();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 cursor-pointer ${
                  defaultLaunchScreen === 'insights'
                    ? 'bg-white/[0.08] text-white shadow-xs font-bold'
                    : 'text-neutral-200 hover:text-white'
                }`}
              >
                {t('insights')}
              </button>
              <button
                type="button"
                id="launch-screen-ledger-btn"
                onClick={() => {
                  setDefaultLaunchScreen('ledger');
                  patchUserPreferences({ defaultLaunchScreen: 'ledger' });
                  if (onDataChanged) onDataChanged();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 cursor-pointer ${
                  defaultLaunchScreen === 'ledger'
                    ? 'bg-white/[0.08] text-white shadow-xs font-bold'
                    : 'text-neutral-200 hover:text-white'
                }`}
              >
                {t('ledger')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Group 2: 표시 및 통화 (Display & Currency) */}
      <div className="space-y-3">
        <span className="text-xs font-semibold uppercase tracking-wider block text-neutral-100">
          {t('display_and_currency')}
        </span>
        
        <div className="space-y-3 pb-4 border-b border-white/[0.06]">
          {/* 기본 통화 & 내 활성 통화 매니저 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-white block">
                  {t('base_currency')}
                </span>
                <span className="text-xs text-neutral-200 font-normal">
                  {t('base_currency_desc')}
                </span>
              </div>
              <div className="w-36">
                <CustomDarkSelect
                  id="currency-select"
                  value={currencySymbol}
                  options={currencyOptions}
                  onChange={(val) => {
                    setCurrencySymbol(val);
                    patchUserPreferences({ currencySymbol: val });
                    if (!activeCurrenciesList.includes(val)) {
                      handleAddActiveCurrency(val);
                    }
                    if (onDataChanged) onDataChanged();
                  }}
                  theme="dark"
                  size="sm"
                />
              </div>
            </div>

            {/* Active Currencies */}
            <div className="pt-3 border-t border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-white">
                    {t('active_currencies')}
                  </span>
                  <span className="text-xs text-neutral-200 font-mono">
                    ({activeCurrenciesList.length})
                  </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  activeCurrenciesList.length > 1
                    ? 'bg-white/[0.08] text-white border border-white/15'
                    : 'bg-white/[0.04] text-neutral-100 border border-white/[0.08]'
                }`}>
                  {activeCurrenciesList.length > 1 ? t('multi_currency_mode') : t('single_currency_mode')}
                </span>
              </div>

              {/* Active Currencies Chips with Delete / Select */}
              <div className="flex flex-wrap gap-2">
                {activeCurrenciesList.map((code) => {
                  const isBase = code === currencySymbol;
                  const info = KNOWN_CURRENCY_NAMES[code];
                  const sym = getCurrencySymbol(code);
                  return (
                    <div
                      key={code}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs transition-all ${
                        isBase
                          ? 'bg-white/[0.06] border-white/15 text-white font-medium'
                          : 'bg-white/[0.03] border-white/[0.08] text-neutral-100 hover:border-white/15'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setCurrencySymbol(code);
                          patchUserPreferences({ currencySymbol: code });
                          if (onDataChanged) onDataChanged();
                        }}
                        className="flex items-center gap-1 hover:text-white cursor-pointer"
                        title={isBase ? t('default') : t('switch')}
                      >
                        <span className="font-mono font-bold text-white">{code}</span>
                        <span className="text-xs text-neutral-200">({sym})</span>
                        {info && (
                          <span className="text-xs text-neutral-200 hidden sm:inline ml-0.5 font-normal">
                            {info.nameKo}
                          </span>
                        )}
                        {isBase && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.12] text-white font-semibold ml-0.5">
                            {t('default')}
                          </span>
                        )}
                      </button>

                      {!isBase && activeCurrenciesList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveActiveCurrency(code)}
                          className="text-neutral-200 hover:text-white transition-colors p-0.5 ml-0.5 rounded cursor-pointer"
                          title={`${code} ${t('delete')}`}
                          aria-label={`${code} ${t('delete')}`}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Quick Add Presets + Custom Inline Input */}
              <div className="pt-2 border-t border-white/[0.06] space-y-2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newCurrencyInput}
                    onChange={(e) => {
                      setNewCurrencyInput(e.target.value.toUpperCase());
                      if (currencyError) setCurrencyError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddActiveCurrency(newCurrencyInput);
                      }
                    }}
                    maxLength={3}
                    placeholder="USD, EUR, JPY..."
                    className="flex-1 bg-white/[0.02] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs font-mono text-white placeholder:text-neutral-300 focus:outline-none focus:border-white/25 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddActiveCurrency(newCurrencyInput)}
                    disabled={!newCurrencyInput.trim()}
                    className="h-8 px-3 rounded-xl bg-white text-black hover:bg-neutral-100 active:scale-95 text-xs font-semibold transition-all disabled:bg-white/35 disabled:text-black disabled:pointer-events-none flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                  >
                    <Plus size={12} strokeWidth={2.5} />
                    <span>{t('add')}</span>
                  </button>
                </div>

                {/* Clean Pill Tags */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-neutral-200 font-normal">{t('recommended')}</span>
                  {['USD', 'EUR', 'JPY', 'IDR'].filter(c => !activeCurrenciesList.includes(c)).map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleAddActiveCurrency(preset)}
                      className="h-6 px-2.5 rounded-full bg-white/[0.03] hover:bg-white/[0.08] text-xs font-mono text-white border border-white/[0.08] hover:border-white/20 active:scale-95 transition-all flex items-center gap-0.5 cursor-pointer"
                    >
                      <span>+{preset}</span>
                    </button>
                  ))}
                </div>

                {currencyError && (
                  <p className="text-xs text-amber-200 flex items-center gap-1 pt-0.5 font-normal">
                    <span>⚠️ {currencyError}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 스텔스 모드 (금액 숨김) */}
          <div
            onClick={() => {
              const next = !stealthMode;
              setStealthMode(next);
              patchUserPreferences({ stealthMode: next });
              if (onDataChanged) onDataChanged();
            }}
            className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.06] cursor-pointer select-none group"
          >
            <div>
              <span className="text-xs font-semibold group-hover:text-white transition-colors text-white block">
                {t('stealth_mode')}
              </span>
              <span className="text-xs text-neutral-200 font-normal block">
                {stealthMode ? t('stealth_mode_desc_on') : t('stealth_mode_desc_off')}
              </span>
            </div>
            <button
              id="toggle-stealth-mode"
              type="button"
              aria-label={t('stealth_mode')}
              className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 shrink-0 pointer-events-none ${
                stealthMode ? 'bg-white' : 'bg-white/[0.14]'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full shadow-xs transition-transform transform ${
                  stealthMode ? 'translate-x-4 bg-black' : 'translate-x-0 bg-white'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Group 3: 장부 설정 (Ledger Settings) */}
      <div className="space-y-3 pt-1">
        <span className="text-xs font-semibold uppercase tracking-wider block text-neutral-100">
          {t('ledger_settings')}
        </span>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-white">
              {t('budget_start_day')}
            </span>
            <div className="w-24">
              <CustomDarkSelect
                id="budget-start-day-select"
                value={String(budgetStartDay)}
                options={budgetDayOptions}
                onChange={(val) => {
                  const num = parseInt(val, 10) || 1;
                  setBudgetStartDay(num);
                  patchUserPreferences({ budgetStartDay: num });
                  if (onDataChanged) onDataChanged();
                }}
                theme="dark"
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
