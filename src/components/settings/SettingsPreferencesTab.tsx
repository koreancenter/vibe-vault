import React, { useState } from 'react';
import { Plus, X, Smartphone, Trash2 } from 'lucide-react';
import { CustomDarkSelect, CustomSelectOption } from './CustomDarkSelect';
import { IOSInstallModal } from '../PWAInstallButton';
import { usePWAInstall } from '../../usePWAInstall';
import { LedgerSpace, SupportedCurrency } from '../../types';
import { KNOWN_CURRENCY_NAMES, getCurrencySymbol } from '../../utils';
import { useI18n, LanguageCode, DEFAULT_CURRENCY_BY_LANGUAGE, LANGUAGE_STORAGE_KEY } from '../../i18n';

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
  newSpaceNameInput: string;
  setNewSpaceNameInput: (name: string) => void;
  handleCreateSpaceInline: () => void;
  handleCreateNewSpace?: () => void;
  internalSpaces: LedgerSpace[];
  activeSpaceId?: string;
  handleSelectSpaceItem: (space: LedgerSpace) => void;
  handleDeleteSpaceItem: (spaceId: string) => void;
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
  newSpaceNameInput,
  setNewSpaceNameInput,
  handleCreateSpaceInline,
  handleCreateNewSpace,
  internalSpaces,
  activeSpaceId,
  handleSelectSpaceItem,
  handleDeleteSpaceItem,
  onDataChanged,
}) => {
  const { language, setLanguage, t } = useI18n();
  const [pendingCurrencyPrompt, setPendingCurrencyPrompt] = useState<SupportedCurrency | null>(null);
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isPwaDismissed, setIsPwaDismissed] = useState(() => {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vibe_pref_pwa_dismissed') === 'true';
  });
  const [isAddingSpace, setIsAddingSpace] = useState(false);

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
            <Smartphone size={13} className="shrink-0 text-slate-300" />
            <span className="text-neutral-300 truncate text-[11px]">
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
              className="px-2.5 py-1 rounded-lg bg-white text-black hover:bg-neutral-200 text-[11px] font-medium transition-all active:scale-95 cursor-pointer"
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
              className="p-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
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
            <span className="text-xs font-semibold text-slate-200 block">
              {t('language')}
            </span>
            <span className="text-[10px] text-slate-400">
              {t('language_desc')}
            </span>
          </div>
        </div>

        {/* 4-column responsive button grid matching Quiet Luxury design system */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-2xl bg-white/[0.04] border border-white/10">
          {([
            { code: 'ko' as LanguageCode, label: t('lang_ko') },
            { code: 'en' as LanguageCode, label: t('lang_en') },
            { code: 'ja' as LanguageCode, label: t('lang_ja') },
            { code: 'eu' as LanguageCode, label: t('lang_eu') },
          ]).map((opt) => (
            <button
              key={opt.code}
              type="button"
              id={`lang-btn-${opt.code}`}
              onClick={() => handleLanguageSelect(opt.code)}
              className={`px-3 py-2 rounded-xl text-xs transition-all active:scale-95 text-center cursor-pointer ${
                language === opt.code
                  ? 'bg-white text-black font-semibold shadow-xs'
                  : 'text-neutral-400 hover:text-white font-medium hover:bg-white/[0.04]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Optional Base Currency Synchronization Prompt */}
        {pendingCurrencyPrompt && (
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-between gap-2.5 animate-in fade-in duration-200">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-neutral-200 font-normal leading-snug">
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
                  if (typeof localStorage !== 'undefined') {
                    const raw = localStorage.getItem('vibe_user_preferences');
                    const prefs = raw ? JSON.parse(raw) : {};
                    localStorage.setItem('vibe_user_preferences', JSON.stringify({ ...prefs, currencySymbol: pendingCurrencyPrompt }));
                  }
                  setPendingCurrencyPrompt(null);
                  if (onDataChanged) onDataChanged();
                }}
                className="px-2.5 py-1 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
              >
                {t('switch_currency')}
              </button>
              <button
                type="button"
                onClick={() => setPendingCurrencyPrompt(null)}
                className="px-2 py-1 rounded-lg text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                {t('keep_currency')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Group 1: 화면 설정 (기본 시작 화면) */}
      <div className="space-y-3">
        <span className="text-[11px] font-bold uppercase tracking-wider block text-slate-400">
          {t('screen_settings')}
        </span>
        
        <div className="space-y-3 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-200">
              {t('default_launch_screen')}
            </span>
            <div className="flex p-0.5 rounded-xl border bg-black/40 border-white/5">
              <button
                type="button"
                id="launch-screen-vault-btn"
                onClick={() => {
                  setDefaultLaunchScreen('vault');
                  if (typeof localStorage !== 'undefined') {
                    const raw = localStorage.getItem('vibe_user_preferences');
                    const prefs = raw ? JSON.parse(raw) : {};
                    localStorage.setItem('vibe_user_preferences', JSON.stringify({ ...prefs, defaultLaunchScreen: 'vault' }));
                  }
                  if (onDataChanged) onDataChanged();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 cursor-pointer ${
                  defaultLaunchScreen === 'vault'
                    ? 'bg-white/15 text-white shadow-xs font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('vault')}
              </button>
              <button
                type="button"
                id="launch-screen-insights-btn"
                onClick={() => {
                  setDefaultLaunchScreen('insights');
                  if (typeof localStorage !== 'undefined') {
                    const raw = localStorage.getItem('vibe_user_preferences');
                    const prefs = raw ? JSON.parse(raw) : {};
                    localStorage.setItem('vibe_user_preferences', JSON.stringify({ ...prefs, defaultLaunchScreen: 'insights' }));
                  }
                  if (onDataChanged) onDataChanged();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 cursor-pointer ${
                  defaultLaunchScreen === 'insights'
                    ? 'bg-white/15 text-white shadow-xs font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('insights')}
              </button>
              <button
                type="button"
                id="launch-screen-ledger-btn"
                onClick={() => {
                  setDefaultLaunchScreen('ledger');
                  if (typeof localStorage !== 'undefined') {
                    const raw = localStorage.getItem('vibe_user_preferences');
                    const prefs = raw ? JSON.parse(raw) : {};
                    localStorage.setItem('vibe_user_preferences', JSON.stringify({ ...prefs, defaultLaunchScreen: 'ledger' }));
                  }
                  if (onDataChanged) onDataChanged();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 cursor-pointer ${
                  defaultLaunchScreen === 'ledger'
                    ? 'bg-white/15 text-white shadow-xs font-bold'
                    : 'text-slate-400 hover:text-slate-200'
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
        <span className="text-[11px] font-bold uppercase tracking-wider block text-slate-400">
          {t('display_and_currency')}
        </span>
        
        <div className="space-y-3 pb-4 border-b border-white/[0.06]">
          {/* 기본 통화 & 내 활성 통화 매니저 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  {t('base_currency')}
                </span>
                <span className="text-[10px] text-slate-400">
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
                    if (typeof localStorage !== 'undefined') {
                      const raw = localStorage.getItem('vibe_user_preferences');
                      const prefs = raw ? JSON.parse(raw) : {};
                      localStorage.setItem('vibe_user_preferences', JSON.stringify({ ...prefs, currencySymbol: val }));
                    }
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
            <div className="pt-3 border-t border-white/[0.04] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-200">
                    {t('active_currencies')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ({activeCurrenciesList.length})
                  </span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  activeCurrenciesList.length > 1
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'bg-white/[0.04] text-neutral-400 border border-white/5'
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
                          ? 'bg-white/15 border-white/30 text-white font-medium'
                          : 'bg-white/[0.04] border-white/5 text-neutral-300 hover:border-white/10'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setCurrencySymbol(code);
                          if (typeof localStorage !== 'undefined') {
                            const raw = localStorage.getItem('vibe_user_preferences');
                            const prefs = raw ? JSON.parse(raw) : {};
                            localStorage.setItem('vibe_user_preferences', JSON.stringify({ ...prefs, currencySymbol: code }));
                          }
                          if (onDataChanged) onDataChanged();
                        }}
                        className="flex items-center gap-1 hover:text-white cursor-pointer"
                        title={isBase ? t('default') : t('switch')}
                      >
                        <span className="font-mono font-bold">{code}</span>
                        <span className="text-[11px] opacity-80">({sym})</span>
                        {info && (
                          <span className="text-[10px] text-neutral-400 hidden sm:inline ml-0.5">
                            {info.nameKo}
                          </span>
                        )}
                        {isBase && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/20 text-white font-normal ml-0.5">
                            {t('default')}
                          </span>
                        )}
                      </button>

                      {!isBase && activeCurrenciesList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveActiveCurrency(code)}
                          className="text-neutral-400 hover:text-white transition-colors p-0.5 ml-0.5 rounded cursor-pointer"
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
              <div className="pt-2 border-t border-white/[0.04] space-y-2">
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
                    className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs font-mono text-neutral-200 placeholder:text-neutral-400 focus:outline-none focus:border-white/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddActiveCurrency(newCurrencyInput)}
                    disabled={!newCurrencyInput.trim()}
                    className="h-8 px-3 rounded-xl bg-white text-black hover:bg-neutral-200 active:scale-95 text-xs font-medium transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                  >
                    <Plus size={12} strokeWidth={2.5} />
                    <span>{t('add')}</span>
                  </button>
                </div>

                {/* Clean Pill Tags */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-neutral-400">{t('recommended')}</span>
                  {['USD', 'EUR', 'JPY', 'IDR'].filter(c => !activeCurrenciesList.includes(c)).map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleAddActiveCurrency(preset)}
                      className="h-6 px-2.5 rounded-full bg-white/[0.03] hover:bg-white/[0.08] text-[11px] font-mono text-neutral-300 border border-white/[0.06] hover:border-white/20 active:scale-95 transition-all flex items-center gap-0.5 cursor-pointer"
                    >
                      <span>+{preset}</span>
                    </button>
                  ))}
                </div>

                {currencyError && (
                  <p className="text-[11px] text-neutral-300 flex items-center gap-1 pt-0.5">
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
              if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem('vibe_user_preferences');
                const prefs = raw ? JSON.parse(raw) : {};
                localStorage.setItem('vibe_user_preferences', JSON.stringify({ ...prefs, stealthMode: next }));
              }
              if (onDataChanged) onDataChanged();
            }}
            className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.04] cursor-pointer select-none group"
          >
            <div>
              <span className="text-xs font-medium group-hover:text-white transition-colors text-white block">
                {t('stealth_mode')}
              </span>
              <span className="text-[11px] text-neutral-400 font-light block">
                {stealthMode ? t('stealth_mode_desc_on') : t('stealth_mode_desc_off')}
              </span>
            </div>
            <button
              id="toggle-stealth-mode"
              type="button"
              aria-label={t('stealth_mode')}
              className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 shrink-0 pointer-events-none ${
                stealthMode ? 'bg-white' : 'bg-neutral-800'
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
      <div className="space-y-3 pt-3 border-t border-white/[0.04]">
        <span className="text-[11px] font-bold uppercase tracking-wider block text-neutral-400">
          {t('ledger_settings')}
        </span>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-200">
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
                  if (typeof localStorage !== 'undefined') {
                    const raw = localStorage.getItem('vibe_user_preferences');
                    const prefs = raw ? JSON.parse(raw) : {};
                    localStorage.setItem('vibe_user_preferences', JSON.stringify({ ...prefs, budgetStartDay: num }));
                  }
                  if (onDataChanged) onDataChanged();
                }}
                theme="dark"
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Group 4: 장부 관리 (Sleek Collapsible / Inline Space Creator & List) */}
      <div className="space-y-2.5 pt-3 border-t border-white/[0.04]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-white">
              {t('multi_ledger_spaces')}
            </span>
            <span className="text-[10px] text-neutral-400 font-mono">
              ({internalSpaces.length})
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsAddingSpace(!isAddingSpace)}
            className="text-[11px] px-2.5 py-1 rounded-full font-normal border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-neutral-300 hover:text-white transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
          >
            <Plus size={11} />
            <span>{t('new_space')}</span>
          </button>
        </div>

        {/* Collapsible / Inline Space Creation Card */}
        {isAddingSpace && (
          <div className="p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] space-y-2 animate-in fade-in duration-150">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newSpaceNameInput}
                onChange={(e) => setNewSpaceNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateSpaceInline();
                    setIsAddingSpace(false);
                  }
                }}
                autoFocus
                placeholder={t('space_name_placeholder')}
                className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-neutral-200 placeholder:text-neutral-400 focus:outline-none focus:border-white/30 transition-all"
              />
              <button
                type="button"
                onClick={async () => {
                  await handleCreateSpaceInline();
                  setIsAddingSpace(false);
                }}
                disabled={!newSpaceNameInput.trim()}
                className="h-7 px-2.5 rounded-lg bg-white text-black hover:bg-neutral-200 active:scale-95 text-xs font-medium transition-all disabled:opacity-40 shrink-0 cursor-pointer"
              >
                {t('create')}
              </button>
            </div>
            {handleCreateNewSpace && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCreateNewSpace}
                  className="text-[10px] text-neutral-400 hover:text-white transition-colors underline underline-offset-2 cursor-pointer"
                >
                  {t('create_with_details')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Compact Spaces List */}
        <div className="space-y-1">
          {internalSpaces.map((sp) => {
            const isCurrent = sp.id === (activeSpaceId || 'default');
            const isDefault = sp.id === 'default';

            return (
              <div
                key={sp.id}
                className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-colors ${
                  isCurrent
                    ? 'bg-white/[0.06] border-white/20 text-white'
                    : 'bg-white/[0.02] border-white/[0.06] text-neutral-300 hover:border-white/10'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-medium text-xs text-white truncate">{sp.name}</span>
                  {isDefault && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-white/[0.06] text-neutral-400 border border-white/[0.08]">
                      {t('default')}
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                      {t('active')}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleSelectSpaceItem(sp)}
                      className="px-2 py-0.5 rounded-full text-[10px] font-normal border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-neutral-300 hover:text-white transition-all active:scale-95 cursor-pointer"
                    >
                      {t('switch')}
                    </button>
                  )}
                  {!isDefault && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSpaceItem(sp.id)}
                      className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                      title={t('delete_space')}
                      aria-label={`${sp.name} ${t('delete_space')}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
