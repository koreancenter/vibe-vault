import React, { useState } from 'react';
import { Plus, X, Check, Trash2, Smartphone } from 'lucide-react';
import { CustomDarkSelect, CustomSelectOption } from './CustomDarkSelect';
import { IOSInstallModal } from '../PWAInstallButton';
import { usePWAInstall } from '../../usePWAInstall';
import { LedgerSpace } from '../../types';
import { KNOWN_CURRENCY_NAMES, getCurrencySymbol } from '../../utils';

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
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isPwaDismissed, setIsPwaDismissed] = useState(() => {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vibe_pref_pwa_dismissed') === 'true';
  });
  const [isAddingSpace, setIsAddingSpace] = useState(false);

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Compact Dismissible Single-Line PWA Banner */}
      {!isPwaDismissed && !isInstalled && (
        <div className="px-3 py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone size={13} className="shrink-0 text-slate-300" />
            <span className="text-neutral-300 truncate text-[11px]">
              홈 화면에 앱으로 추가하여 브라우저 없이 실행하세요
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
              className="px-2.5 py-1 rounded-lg bg-white text-black hover:bg-neutral-200 text-[11px] font-medium transition-all active:scale-95"
            >
              설치
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPwaDismissed(true);
                try {
                  sessionStorage.setItem('vibe_pref_pwa_dismissed', 'true');
                } catch {}
              }}
              className="p-1 text-neutral-400 hover:text-white transition-colors"
              aria-label="닫기"
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

      {/* Group 1: 화면 설정 (기본 시작 화면) */}
      <div className="space-y-3">
        <span className="text-[11px] font-bold uppercase tracking-wider block text-slate-400">
          화면 설정
        </span>
        
        <div className="space-y-3 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-200">
              기본 시작 화면
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
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                  defaultLaunchScreen === 'vault'
                    ? 'bg-white/15 text-white shadow-xs font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                자산
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
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                  defaultLaunchScreen === 'insights'
                    ? 'bg-white/15 text-white shadow-xs font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                인사이트
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
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                  defaultLaunchScreen === 'ledger'
                    ? 'bg-white/15 text-white shadow-xs font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                장부
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Group 2: 표시 및 통화 (Display & Currency) */}
      <div className="space-y-3">
        <span className="text-[11px] font-bold uppercase tracking-wider block text-slate-400">
          표시 및 통화
        </span>
        
        <div className="space-y-3 pb-4 border-b border-white/[0.06]">
          {/* 기본 통화 & 내 활성 통화 매니저 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  기본 기준 통화
                </span>
                <span className="text-[10px] text-slate-400">
                  대시보드 및 모든 자산 평가의 기준
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
                    활성 통화 관리
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
                  {activeCurrenciesList.length > 1 ? '다중 통화 모드' : '단일 통화 모드'}
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
                        className="flex items-center gap-1 hover:text-white"
                        title={isBase ? '현재 기준 통화' : '클릭하여 기본 기준 통화로 설정'}
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
                            기준
                          </span>
                        )}
                      </button>

                      {!isBase && activeCurrenciesList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveActiveCurrency(code)}
                          className="text-neutral-400 hover:text-white transition-colors p-0.5 ml-0.5 rounded"
                          title={`${code} 활성 통화에서 제거`}
                          aria-label={`${code} 활성 통화에서 제거`}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {activeCurrenciesList.length <= 1 && (
                <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[11px] text-neutral-300 animate-in fade-in duration-150">
                  <span>새 통화를 추가하면 다중 통화 비교 모드가 자동으로 활성화됩니다.</span>
                </div>
              )}

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
                    placeholder="3자리 통화 코드 (USD, EUR, JPY...)"
                    className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs font-mono text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-white/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddActiveCurrency(newCurrencyInput)}
                    disabled={!newCurrencyInput.trim()}
                    className="h-8 px-3 rounded-xl bg-white text-black hover:bg-neutral-200 active:scale-95 text-xs font-medium transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 shrink-0 shadow-xs"
                  >
                    <Plus size={12} strokeWidth={2.5} />
                    <span>추가</span>
                  </button>
                </div>

                {/* Clean Pill Tags */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-neutral-400">추천:</span>
                  {['USD', 'EUR', 'JPY', 'IDR'].filter(c => !activeCurrenciesList.includes(c)).map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleAddActiveCurrency(preset)}
                      className="h-6 px-2.5 rounded-full bg-white/[0.03] hover:bg-white/[0.08] text-[11px] font-mono text-neutral-300 border border-white/[0.06] hover:border-white/20 active:scale-95 transition-all flex items-center gap-0.5"
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
                스텔스 모드 (금액 숨김)
              </span>
              <span className="text-[11px] text-neutral-400 font-light block">
                {stealthMode ? '모든 잔고 및 금액이 마스킹되어 보호 중입니다' : '화면에 모든 금액이 표시됩니다'}
              </span>
            </div>
            <button
              id="toggle-stealth-mode"
              type="button"
              aria-label="스텔스 모드 토글"
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
          장부 설정
        </span>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-200">
              예산 시작일
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
              다중 장부 관리
            </span>
            <span className="text-[10px] text-neutral-400 font-mono">
              ({internalSpaces.length})
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsAddingSpace(!isAddingSpace)}
            className="text-[11px] px-2.5 py-1 rounded-full font-normal border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-neutral-300 hover:text-white transition-all flex items-center gap-1 active:scale-95"
          >
            <Plus size={11} />
            <span>새 장부</span>
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
                placeholder="새 장부 이름 입력..."
                className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-white/30 transition-all"
              />
              <button
                type="button"
                onClick={async () => {
                  await handleCreateSpaceInline();
                  setIsAddingSpace(false);
                }}
                disabled={!newSpaceNameInput.trim()}
                className="h-7 px-2.5 rounded-lg bg-white text-black hover:bg-neutral-200 active:scale-95 text-xs font-medium transition-all disabled:opacity-40 shrink-0"
              >
                생성
              </button>
            </div>
            {handleCreateNewSpace && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCreateNewSpace}
                  className="text-[10px] text-neutral-400 hover:text-white transition-colors underline underline-offset-2"
                >
                  상세 옵션으로 생성 →
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
                      기본
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                      활성
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleSelectSpaceItem(sp)}
                      className="px-2 py-0.5 rounded-full text-[10px] font-normal border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-neutral-300 hover:text-white transition-all active:scale-95"
                    >
                      전환
                    </button>
                  )}
                  {!isDefault && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSpaceItem(sp.id)}
                      className="p-1 rounded-full text-neutral-500 hover:text-white hover:bg-white/[0.08] transition-all"
                      title="장부 삭제"
                      aria-label={`${sp.name} 장부 삭제`}
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
