import React from 'react';
import { Plus, X, Check, Trash2 } from 'lucide-react';
import { CustomDarkSelect, CustomSelectOption } from './CustomDarkSelect';
import { PWAInstallButton } from '../PWAInstallButton';
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
  setLegalOpen: (open: boolean) => void;
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
  setLegalOpen,
  onDataChanged,
}) => {
  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* PWA 설치 안내 카드 (미설치 상태인 경우) */}
      <PWAInstallButton variant="settings" theme="dark" />

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
                          className="text-neutral-400 hover:text-rose-400 transition-colors p-0.5 ml-0.5 rounded"
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
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>추천 통화 빠른 추가:</span>
                  <div className="flex items-center gap-1">
                    {['USD', 'IDR', 'JPY', 'EUR'].filter(c => !activeCurrenciesList.includes(c)).map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleAddActiveCurrency(preset)}
                        className="px-2 py-0.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[10px] font-mono text-slate-300 border border-white/5 active:scale-95 transition-all"
                      >
                        +{preset}
                      </button>
                    ))}
                  </div>
                </div>

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
                    placeholder="3자리 통화 코드 (예: SGD, VND, AUD)..."
                    className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-neutral-200 placeholder:text-neutral-400 focus:outline-hidden focus:border-white/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddActiveCurrency(newCurrencyInput)}
                    disabled={!newCurrencyInput.trim()}
                    className="px-3 py-1.5 rounded-xl bg-white text-black hover:bg-neutral-200 active:scale-95 text-xs font-medium transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 shadow-xs"
                  >
                    <Plus size={12} strokeWidth={2.5} />
                    <span>추가</span>
                  </button>
                </div>

                {currencyError && (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1 pt-0.5">
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

      {/* Group 4: 새 장부 만들기 */}
      <div className="space-y-2.5 pt-3 border-t border-white/[0.04]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white">
            새 장부 만들기
          </span>
          {handleCreateNewSpace && (
            <button
              type="button"
              onClick={handleCreateNewSpace}
              className="text-[11px] text-neutral-400 hover:text-white transition-colors"
              title="행사/정산 등 상세 옵션으로 새 장부 만들기"
            >
              상세 옵션
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={newSpaceNameInput}
            onChange={(e) => setNewSpaceNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreateSpaceInline();
              }
            }}
            placeholder="장부 이름"
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-400 focus:outline-hidden focus:border-white/30 transition-all"
          />
          <button
            type="button"
            onClick={handleCreateSpaceInline}
            disabled={!newSpaceNameInput.trim()}
            className="px-3.5 py-1.5 rounded-xl bg-white text-black hover:bg-neutral-200 active:scale-95 text-xs font-medium transition-all disabled:opacity-40 disabled:pointer-events-none shrink-0 shadow-xs"
          >
            <span>만들기</span>
          </button>
        </div>

        {/* Spaces List */}
        <div className="space-y-1.5 pt-1">
          {internalSpaces.map((sp) => {
            const isCurrent = sp.id === (activeSpaceId || 'default');
            const isDefault = sp.id === 'default';
            const isEvent = sp.type === 'EVENT' || Boolean(sp.memberCount && sp.memberCount > 1);

            return (
              <div
                key={sp.id}
                className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                  isCurrent
                    ? 'bg-white/[0.06] border-white/20 text-white'
                    : 'bg-white/[0.02] border-white/[0.06] text-neutral-300 hover:border-white/10'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="truncate">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-xs text-white truncate">{sp.name}</span>
                      {isDefault && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-neutral-400 font-normal border border-white/[0.08]">
                          기본
                        </span>
                      )}
                      {isEvent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white font-normal border border-white/15">
                          행사/정산
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white font-normal border border-white/20 flex items-center gap-1">
                          <Check size={10} />
                          <span>현재 활성</span>
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-neutral-400 font-light mt-0.5 flex items-center gap-2">
                      <span>기준 통화: {sp.currency}</span>
                      {sp.memberCount && <span>· 정산 인원: {sp.memberCount}명</span>}
                      {sp.description && <span className="truncate">· {sp.description}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleSelectSpaceItem(sp)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-normal border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-neutral-300 hover:text-white transition-all active:scale-95"
                    >
                      전환
                    </button>
                  )}
                  {!isDefault && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSpaceItem(sp.id)}
                      className="p-1.5 rounded-full hover:bg-rose-500/15 text-neutral-400 hover:text-rose-400 border border-transparent hover:border-rose-500/20 transition-all"
                      title="장부 삭제"
                      aria-label={`${sp.name} 장부 삭제`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* General Settings Legal Disclaimer Link */}
      <div className="pt-2 pb-1 text-center">
        <button
          type="button"
          onClick={() => setLegalOpen(true)}
          className="text-[11px] text-neutral-400 hover:text-white underline underline-offset-4 cursor-pointer transition-colors"
        >
          법적 고지 및 면책 조항
        </button>
      </div>
    </div>
  );
};
