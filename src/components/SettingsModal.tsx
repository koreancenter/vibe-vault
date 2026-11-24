import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Lock, LogOut, Check } from 'lucide-react';
import { getUserPreferences, saveAIEngineConfig } from '../utils';
import { sanitizeApiKey, setSecureGeminiApiKey, clearSecureGeminiApiKey } from '../geminiKeyManager';
import { hasVaultPin, lockVault } from '../vaultSecurity';
import { SupportedCurrency, LedgerSpace } from '../types';
import { SmartAssetSetup } from './SmartAssetSetup';
import { LegalNoticeModal } from './LegalNoticeModal';
import { GuestExitConfirmModal } from './GuestExitConfirmModal';
import { SettingsSpacesTab } from './settings/SettingsSpacesTab';
import { SettingsAITab, AIEngineDraft } from './settings/SettingsAITab';
import { SettingsPreferencesTab } from './settings/SettingsPreferencesTab';
import { SettingsDataTab } from './settings/SettingsDataTab';
import { useI18n } from '../i18n';

export type SettingsTabKey = 'assets' | 'spaces' | 'engine' | 'preferences' | 'privacy';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
  onDataReset?: () => void;
  initialTab?: SettingsTabKey;
  initialSubTab?: 'assets' | 'budget' | 'subscriptions';
  spaces?: LedgerSpace[];
  activeSpaceId?: string;
  onSelectSpace?: (space: LedgerSpace) => void;
  onDeleteSpace?: (spaceId: string) => void;
  onOpenNewSpace?: () => void;
}

const SETTINGS_TABS = [
  { key: 'assets', id: 'tab-assets', i18nKey: 'tab_smart_assets', shortEn: 'Assets' },
  { key: 'spaces', id: 'tab-spaces', i18nKey: 'tab_multi_ledger', shortEn: 'Ledgers' },
  { key: 'engine', id: 'tab-ai-engine', i18nKey: 'tab_ai_engine', shortEn: 'AI' },
  { key: 'preferences', id: 'tab-prefs', i18nKey: 'tab_preferences', shortEn: 'General' },
  { key: 'privacy', id: 'tab-data', i18nKey: 'tab_privacy_data', shortEn: 'Data' },
] as const;

const resolveSafeTab = (tab: unknown): SettingsTabKey =>
  typeof tab === 'string' && SETTINGS_TABS.some((item) => item.key === tab)
    ? (tab as SettingsTabKey)
    : 'assets';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, onDataChanged, onDataReset, initialTab, initialSubTab,
  spaces, activeSpaceId, onSelectSpace, onDeleteSpace, onOpenNewSpace,
}) => {
  const { t, language } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(() => resolveSafeTab(initialTab));
  const [subTab, setSubTab] = useState<'assets' | 'budget' | 'subscriptions'>(initialSubTab || 'assets');
  const [currentCurrency, setCurrentCurrency] = useState<SupportedCurrency>(
    () => (getUserPreferences().currencySymbol as SupportedCurrency) || 'KRW'
  );
  const [isPinSet, setIsPinSet] = useState<boolean>(() => hasVaultPin());
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);
  const [showGuestExitConfirm, setShowGuestExitConfirm] = useState(false);
  const [openPinSetupSignal, setOpenPinSetupSignal] = useState(0);
  const aiDraftRef = useRef<AIEngineDraft | null>(null);

  useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialTab) setActiveTab(resolveSafeTab(initialTab));
    setCurrentCurrency((getUserPreferences().currencySymbol as SupportedCurrency) || 'KRW');
    setIsPinSet(hasVaultPin());
    setShowGuestExitConfirm(false);
    setStatusMessage(null);
    aiDraftRef.current = null;
  }, [isOpen, initialTab]);

  const handleAIDraftChange = useCallback((draft: AIEngineDraft) => {
    aiDraftRef.current = draft;
  }, []);

  const handleSaveAll = async () => {
    try {
      const draft = aiDraftRef.current;
      if (draft) {
        const cleanKey = sanitizeApiKey(draft.apiKey);
        if (cleanKey && draft.provider === 'gemini') await setSecureGeminiApiKey(cleanKey);
        else clearSecureGeminiApiKey();

        saveAIEngineConfig({
          engineType: draft.engineType,
          provider: draft.provider,
          modelTier: draft.modelTier,
          localModel: draft.localModel,
          apiKey: cleanKey,
          localSubMode: draft.localSubMode,
          ollamaEndpoint: draft.ollamaEndpoint.trim(),
          ollamaModel: draft.ollamaModel.trim(),
        });
      }
      setStatusMessage({
        type: 'success',
        text: language === 'ko' ? '모든 설정이 안전하게 저장되었습니다.' : 'All settings saved safely.',
      });
      onDataChanged?.();
      setTimeout(onClose, 300);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: 'error', text: (language === 'ko' ? '설정 저장 중 오류: ' : 'Save error: ') + msg });
    }
  };

  if (!isOpen) return null;
  const exitLabel = isPinSet ? t('lock_vault') : (language === 'ko' ? '게스트 종료' : 'Exit Guest');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-lg sm:max-w-xl md:max-w-2xl h-[680px] max-h-[88vh] bg-[var(--surface-panel)] border border-[var(--surface-subtle-border)] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white antialiased transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <h2 className="text-base font-bold tracking-tight text-white">{t('settings')}</h2>
          <button type="button" onClick={onClose} title={t('close')} aria-label={t('close')} className="p-1.5 -mr-1 rounded-full text-neutral-200 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* 5-Tab Bar */}
        <div className="px-2.5 sm:px-6 pt-2 border-b border-white/[0.06] shrink-0">
          <div role="tablist" aria-label={t('settings')} className="flex items-center justify-between sm:justify-start sm:gap-2 whitespace-nowrap">
            {SETTINGS_TABS.map((tab) => {
              const isSelected = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  id={tab.id}
                  role="tab"
                  aria-selected={isSelected}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`text-[11px] sm:text-xs text-center transition-colors relative whitespace-nowrap shrink-0 px-1.5 sm:px-3 pb-2.5 cursor-pointer border-b-2 ${
                    isSelected ? 'border-[var(--color-accent)] text-white font-semibold' : 'border-transparent text-neutral-200 hover:text-white font-medium'
                  }`}
                >
                  {language === 'ko' ? t(tab.i18nKey) : (
                    <>
                      <span className="sm:hidden">{tab.shortEn}</span>
                      <span className="hidden sm:inline">{t(tab.i18nKey)}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status Banner */}
        {statusMessage && (
          <div className={`mx-6 mt-3 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between shrink-0 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200'
              : 'bg-white/[0.04] border border-white/[0.08] text-neutral-100'
          }`}>
            <span className="truncate">{statusMessage.text}</span>
            <button type="button" onClick={() => setStatusMessage(null)} aria-label={t('close')} className="ml-1 text-sm font-bold text-neutral-200 hover:text-white cursor-pointer">×</button>
          </div>
        )}

        {/* Active Tab Viewport */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-4 scrollbar-none text-sm">
          {activeTab === 'assets' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <SmartAssetSetup theme="dark" currentCurrency={currentCurrency} initialSubTab={subTab} onAssetsUpdated={onDataChanged} />
            </div>
          )}
          {activeTab === 'spaces' && (
            <SettingsSpacesTab
              spaces={spaces} activeSpaceId={activeSpaceId} defaultCurrency={currentCurrency}
              onSelectSpace={onSelectSpace} onDeleteSpace={onDeleteSpace} onOpenNewSpace={onOpenNewSpace}
              onDataChanged={onDataChanged} onStatusMessage={setStatusMessage}
            />
          )}
          {activeTab === 'engine' && (
            <SettingsAITab initialDraft={aiDraftRef.current} onDraftChange={handleAIDraftChange} onStatusMessage={setStatusMessage} />
          )}
          {activeTab === 'preferences' && (
            <SettingsPreferencesTab onCurrencyChanged={setCurrentCurrency} onDataChanged={onDataChanged} />
          )}
          {activeTab === 'privacy' && (
            <SettingsDataTab
              onClose={onClose} isPinSet={isPinSet} onPinChanged={setIsPinSet}
              openPinSetupSignal={openPinSetupSignal} setLegalOpen={setLegalOpen}
              onDataChanged={onDataChanged} onDataReset={onDataReset} onStatusMessage={setStatusMessage}
            />
          )}
        </div>

        {/* Sticky Footer */}
        <div className="px-6 py-3.5 border-t border-white/[0.06] bg-[var(--surface-nav)] flex flex-col gap-2.5 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => { if (isPinSet) { onClose(); lockVault(); } else setShowGuestExitConfirm(true); }}
              title={exitLabel}
              aria-label={exitLabel}
              className="h-9 px-3 rounded-xl font-medium text-xs transition-all flex items-center gap-1.5 active:scale-95 border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-white shrink-0 cursor-pointer whitespace-nowrap"
            >
              {isPinSet ? <Lock size={13} className="shrink-0 text-neutral-100" /> : <LogOut size={13} className="shrink-0 text-amber-200" />}
              <span>{exitLabel}</span>
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              className="bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--color-accent-hover)] font-semibold rounded-xl px-4 py-2 text-xs transition-all active:scale-95 flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Check size={14} />
              <span>{t('save_settings')}</span>
            </button>
          </div>
          <p className="text-center font-mono text-[10px] text-neutral-400">
            © 2026 Vibe Vault. A proud initiative of the{' '}
            <a href="https://nettodot.org" target="_blank" rel="noopener noreferrer" className="text-neutral-300 hover:text-sky-400 transition-colors underline underline-offset-2 decoration-white/20">
              Net to Dot Movement
            </a>.
          </p>
        </div>
      </div>

      <GuestExitConfirmModal
        isOpen={showGuestExitConfirm}
        onClose={() => setShowGuestExitConfirm(false)}
        onSetupPin={() => { setShowGuestExitConfirm(false); setActiveTab('privacy'); setOpenPinSetupSignal((n) => n + 1); }}
        onConfirmExit={() => { setShowGuestExitConfirm(false); onClose(); lockVault(); }}
      />
      <LegalNoticeModal isOpen={legalOpen} onClose={() => setLegalOpen(false)} />
    </div>
  );
};
