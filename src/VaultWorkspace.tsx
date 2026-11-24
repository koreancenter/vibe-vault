import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { lazyWithRetry, LazyErrorBoundary } from './lazyWithRetry';
import {
  Transaction,
  SupportedCurrency,
  FxRates,
  ParsedReceiptData,
  LaunchScreenMode,
} from './types';
import { isFxRatesPayload } from './fxRates';
import { generateSecureId } from './identifiers';
import {
  Settings,
  WifiOff,
  Sparkles,
  Check,
  ShieldCheck,
  Wallet,
  HelpCircle,
  Lock,
  LogOut,
} from 'lucide-react';
import { DEFAULT_FX_RATES, getUserActiveCurrencies, getAIEngineConfig } from './utils';
import {
  loadSampleData,
  ensureCleanSlateIfGuest,
  getPendingScans,
  deletePendingScan,
  notifyVaultDataChanged,
  getAllAssetAccounts,
} from './db';

// Architectural Domain Custom Hooks
import { useTransactions } from './hooks/useTransactions';
import { useBudgetAnalytics } from './hooks/useBudgetAnalytics';
import { useAutonomousEngine } from './hooks/useAutonomousEngine';
import { useOmnibarController } from './hooks/useOmnibarController';
import { useSpaces } from './hooks/useSpaces';
import { useWorkspaceModals } from './hooks/useWorkspaceModals';

// Eager Shell & Primary View Components
import { PWAInstallBanner } from './components/PWAInstallButton';
import { OmnibarDock } from './components/OmnibarDock';
import { OnboardingGuideStrip } from './components/OnboardingGuideStrip';
import { GuestExitConfirmModal } from './components/GuestExitConfirmModal';
import { VaultOverviewSection } from './components/VaultOverviewSection';
import {
  ContextNudgeId,
  getActiveContextNudge,
  getOnboardingProgress,
  loadOnboardingGuideFlags,
  saveChecklistDismissed,
  saveDismissedNudges,
  saveHasRunQuery,
} from './onboardingGuide';
import {
  initAutoLockWatcher,
  lockVault,
  isVaultLocked,
  hasVaultPin,
  unlockVault,
  subscribeVaultLock,
} from './vaultSecurity';
import { destroyBuiltInAISession } from './builtInAI';
import { useI18n, DEFAULT_CURRENCY_BY_LANGUAGE } from './i18n';

// Dynamic Code-Split Components (Secondary Tabs & Modals)
const LedgerSection = lazyWithRetry(() =>
  import('./components/LedgerSection').then((m) => ({ default: m.LedgerSection }))
);
const InsightsSection = lazyWithRetry(() =>
  import('./components/InsightsSection').then((m) => ({ default: m.InsightsSection }))
);
const ChangelogModal = lazyWithRetry(() =>
  import('./components/ChangelogModal').then((m) => ({ default: m.ChangelogModal }))
);
const TransactionActionModal = lazyWithRetry(() =>
  import('./components/TransactionActionModal').then((m) => ({ default: m.TransactionActionModal }))
);
const EditTransactionModal = lazyWithRetry(() =>
  import('./components/EditTransactionModal').then((m) => ({ default: m.EditTransactionModal }))
);
const SettingsModal = lazyWithRetry(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const ManualCategoryModal = lazyWithRetry(() =>
  import('./components/ManualCategoryModal').then((m) => ({ default: m.ManualCategoryModal }))
);
const NewSpaceModal = lazyWithRetry(() =>
  import('./components/NewSpaceModal').then((m) => ({ default: m.NewSpaceModal }))
);

export const ReceiptScannerModal = lazyWithRetry(() => import('./components/ReceiptScannerModal'));
export const EventSettlementReportModal = lazyWithRetry(
  () => import('./components/EventSettlementReportModal')
);

// Loads a lazy chunk on first open, then keeps it mounted so exit animations still run.
const MountOnFirstOpen: React.FC<{ open: boolean; children: React.ReactNode }> = ({
  open,
  children,
}) => {
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
  return seen ? (
    <LazyErrorBoundary>
      <Suspense fallback={null}>{children}</Suspense>
    </LazyErrorBoundary>
  ) : null;
};

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

const TAB_ORDER: LaunchScreenMode[] = ['vault', 'insights', 'ledger'];
const TAB_INDEX_MAP: Record<LaunchScreenMode, number> = {
  vault: 0,
  insights: 1,
  ledger: 2,
};

export function VaultWorkspace({ onOpenWelcome }: { onOpenWelcome: () => void }) {
  const { t, language } = useI18n();
  const isOnline = useOnlineStatus();

  // 1. Transactions Persistence & Filtering Lifecycle
  const {
    transactions,
    selectedCategory,
    setSelectedCategory,
    ledgerFilter,
    setLedgerFilter,
    loadTransactions,
    add: addTx,
    batchAdd: batchAddTxs,
    update: updateTx,
    remove: removeTx,
  } = useTransactions();

  // 2. Global Multi-Currency State & FX Rates
  const [currentCurrency, setCurrentCurrency] = useState<SupportedCurrency>(() => {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('vibe_user_preferences');
      if (raw) {
        try {
          const p = JSON.parse(raw);
          if (p.currencySymbol) return p.currencySymbol as SupportedCurrency;
        } catch {}
      }
    }
    return DEFAULT_CURRENCY_BY_LANGUAGE[language] || 'KRW';
  });
  const [fxRates, setFxRates] = useState<FxRates>(DEFAULT_FX_RATES);

  useEffect(() => {
    const loadFxRates = async () => {
      try {
        const res = await fetch('/api/fx-rates', {
          headers: { Accept: 'application/json' },
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (isFxRatesPayload(data)) {
            setFxRates(data);
          } else {
            console.warn('FX rates response did not match the expected format.');
          }
        } else if (!res.ok) {
          console.warn(`FX rates request failed with HTTP ${res.status}.`);
        }
      } catch (error) {
        console.warn(
          'Failed to fetch FX rates; estimated rates remain active.',
          error instanceof Error ? error.name : 'Unknown error'
        );
      }
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback && w.cancelIdleCallback) {
      const id = w.requestIdleCallback(() => {
        void loadFxRates();
      }, { timeout: 3000 });
      return () => w.cancelIdleCallback!(id);
    }
    const timer = setTimeout(() => {
      void loadFxRates();
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // 3. Autonomous AI Engine & User Preferences
  const {
    userPrefs,
    setUserPrefs,
    isStealth,
    toggleStealthMode,
    engineConfig,
    updateEngineConfig,
    engineStatus,
    syncPreferences,
  } = useAutonomousEngine({
    transactions,
    currentCurrency,
    fxRates,
  });

  useEffect(() => {
    if (userPrefs.currencySymbol) {
      setCurrentCurrency(userPrefs.currencySymbol as SupportedCurrency);
    }
  }, [userPrefs.currencySymbol]);

  const handleSelectCurrency = useCallback(
    (newCurrency: SupportedCurrency) => {
      setCurrentCurrency(newCurrency);
      setUserPrefs((prev) => {
        const updated = { ...prev, currencySymbol: newCurrency };
        localStorage.setItem('vibe_user_preferences', JSON.stringify(updated));
        return updated;
      });
    },
    [setUserPrefs]
  );

  // 4. Budget Analytics
  const { getAmountInSelectedCurrency } = useBudgetAnalytics({
    transactions,
    currentCurrency,
    fxRates,
  });

  // 5. Multi-Ledger Spaces Hook
  const {
    spaces,
    activeSpaceId,
    activeSpace,
    currentSpaceTransactions,
    handleSelectSpace,
    handleSpaceCreated,
    handleUpdateSpace,
    handleDeleteSpace,
  } = useSpaces({
    transactions,
    onSelectCurrency: handleSelectCurrency,
    onTransactionsReload: loadTransactions,
  });

  // 6. Workspace Modals & Return-Flow Controller Hook
  const modals = useWorkspaceModals({
    onSyncPreferences: syncPreferences,
    onOpenWelcome,
  });

  // Active currencies sync
  const [activeCurrencies, setActiveCurrencies] = useState<string[]>(() => {
    const list = getUserActiveCurrencies();
    return list.length > 0 ? list : ['KRW'];
  });

  useEffect(() => {
    const refreshList = () => {
      const stored = getUserActiveCurrencies();
      const list = stored.length > 0 ? stored : ['KRW'];
      const upper = currentCurrency.toUpperCase();
      setActiveCurrencies(list.includes(upper) ? list : [upper, ...list]);
    };
    refreshList();
    window.addEventListener('storage', refreshList);
    return () => window.removeEventListener('storage', refreshList);
  }, [currentCurrency, modals.isSettingsOpen]);

  const isMultiCurrencyMode = activeCurrencies.length > 1;

  // Toast Notifications & Active Tab Mode
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 4500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const [mainMode, setMainMode] = useState<LaunchScreenMode>('vault');

  useEffect(() => {
    if (userPrefs.defaultLaunchScreen) {
      setMainMode(userPrefs.defaultLaunchScreen);
    }
  }, [userPrefs.defaultLaunchScreen]);

  // Zero-Knowledge Vault Lock & Auto-Lock Watcher
  const [isVaultLockedState, setIsVaultLockedState] = useState<boolean>(() => isVaultLocked());

  useEffect(() => {
    const cleanupWatcher = initAutoLockWatcher();
    const unsub = subscribeVaultLock((locked) => {
      setIsVaultLockedState(locked);
      if (locked) {
        destroyBuiltInAISession();
        modals.closeModalsOnVaultLock();
      }
    });
    return () => {
      cleanupWatcher();
      unsub();
    };
  }, [modals.closeModalsOnVaultLock]);

  // Offline Pending Scans Auto-Sync
  const isSyncingPendingScansRef = useRef(false);

  const processPendingScansOnReconnect = useCallback(async () => {
    if (isSyncingPendingScansRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (isVaultLocked()) return;

    isSyncingPendingScansRef.current = true;
    try {
      const queuedItems = await getPendingScans();
      if (!queuedItems || queuedItems.length === 0) return;

      let processedCount = 0;
      const cfg = getAIEngineConfig();
      const { parseReceiptWithResilience } = await import('./autonomousFinance');

      for (const scan of queuedItems) {
        try {
          const result = await parseReceiptWithResilience({
            imageBase64: scan.imageBase64,
            mimeType: scan.mimeType || 'image/webp',
            engineConfig: cfg,
            defaultCurrency: currentCurrency,
            maxRetries: 2,
          });

          const merchantTitle = result.receipt.merchantName || result.receipt.merchant || '영수증 스캔 지출';
          const newTx: Transaction = {
            id: generateSecureId('tx-receipt'),
            type: 'EXPENSE',
            amount: Math.abs(result.receipt.totalAmount) || 0,
            currency: (result.receipt.currency as SupportedCurrency) || currentCurrency,
            category: result.receipt.category || result.receipt.suggestedCategory || 'Living',
            subCategory: 'Receipt',
            description: `${merchantTitle} (영수증)`,
            date: result.receipt.date ? new Date(result.receipt.date).toISOString() : new Date().toISOString(),
            paymentMethod: result.receipt.paymentMethod || '카드결제',
            spaceId: scan.spaceId || activeSpaceId || 'default',
          };

          await addTx(newTx);
          await deletePendingScan(scan.id);
          processedCount += 1;
        } catch (scanErr) {
          console.warn('Failed to process offline pending scan:', scan.id, scanErr);
        }
      }

      if (processedCount > 0) {
        showToast(`오프라인 보관 영수증 ${processedCount}건이 자동 기장되었습니다.`);
        notifyVaultDataChanged('offline_scans_synced');
        loadTransactions();
      }
    } catch (err) {
      console.error('Error in processPendingScansOnReconnect:', err);
    } finally {
      isSyncingPendingScansRef.current = false;
    }
  }, [activeSpaceId, addTx, currentCurrency, loadTransactions, showToast]);

  useEffect(() => {
    const handleOnline = () => {
      processPendingScansOnReconnect();
    };
    const handleQueuedOffline = (e: Event) => {
      const custom = e as CustomEvent<{ message: string }>;
      if (custom.detail?.message) showToast(custom.detail.message);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('vibe-scan-queued-offline', handleQueuedOffline);

    if (typeof navigator !== 'undefined' && navigator.onLine && !isVaultLocked()) {
      processPendingScansOnReconnect();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('vibe-scan-queued-offline', handleQueuedOffline);
    };
  }, [processPendingScansOnReconnect, showToast]);

  // Ephemeral Guest Mode Startup Check
  useEffect(() => {
    const initializeVault = async () => {
      await ensureCleanSlateIfGuest();
      if (!hasVaultPin() && !isVaultLocked()) {
        const result = await unlockVault();
        if (!result.success) {
          throw new Error(result.error || '금고 초기화에 실패했습니다.');
        }
      }
    };
    initializeVault().catch((err: unknown) => {
      console.error('Vault initialization failed:', err);
    });
  }, []);

  // 7. Omnibar & Conversational AI Query Controller
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const {
    input,
    setInput,
    isProcessing,
    setIsProcessing,
    isListening,
    error,
    setError,
    activeQueryResult,
    setActiveQueryResult,
    isQuerying,
    toggleListen,
    handleRunFinancialQuery,
    handleProcessInput,
    realtimePreview,
  } = useOmnibarController({
    transactions,
    fxRates,
    currentCurrency,
    mainMode,
    setMainMode,
    activeSpaceId,
    activeSpaceCurrency: activeSpace.currency,
    userPrefs,
    isOnline,
    batchAddTxs,
    setPendingCategorizationTxs: modals.setPendingCategorizationTxs,
    showToast,
    scrollContainerRef,
  });

  // Transaction & Receipt Action Callbacks
  const handleLoadSampleFromLedger = useCallback(async () => {
    try {
      setIsProcessing(true);
      await loadSampleData();
      await loadTransactions();
    } catch (err: any) {
      setError('샘플 데이터 로드 실패: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  }, [loadTransactions, setIsProcessing, setError]);

  const handleConfirmReceipt = useCallback(
    async (receipt: ParsedReceiptData) => {
      try {
        const merchantTitle = receipt.merchantName || receipt.merchant || '영수증 스캔 지출';
        const newTx: Transaction = {
          id: generateSecureId('tx-receipt'),
          type: 'EXPENSE',
          amount: Math.abs(receipt.totalAmount) || 0,
          currency:
            (receipt.currency as SupportedCurrency) ||
            (activeSpace.currency as SupportedCurrency) ||
            currentCurrency,
          category: receipt.category || receipt.suggestedCategory || 'Living',
          subCategory: 'Receipt',
          description: `${merchantTitle} (영수증)`,
          date: receipt.date ? new Date(receipt.date).toISOString() : new Date().toISOString(),
          paymentMethod: receipt.paymentMethod || '카드결제',
          spaceId: activeSpaceId,
        };

        await addTx(newTx);
        modals.closeReceiptModal();

        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch (err: unknown) {
        console.error('Failed to save receipt transaction:', err);
        setError('영수증 내역 저장 중 오류가 발생했습니다.');
      }
    },
    [addTx, activeSpace.currency, currentCurrency, activeSpaceId, modals.closeReceiptModal, setError]
  );

  const handleConfirmCategorization = useCallback(
    async (finalTxs: Transaction[]) => {
      try {
        const spaceTxs = finalTxs.map((tx) => ({
          ...tx,
          spaceId: tx.spaceId || activeSpaceId,
          currency: tx.currency || (activeSpace.currency as SupportedCurrency) || currentCurrency,
        }));
        await batchAddTxs(spaceTxs);
        modals.cancelCategorization();
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch (err: unknown) {
        console.error(err);
        setError('카테고리 저장 중 오류가 발생했습니다.');
      }
    },
    [batchAddTxs, activeSpaceId, activeSpace.currency, currentCurrency, modals.cancelCategorization, setError]
  );

  const handleUpdateTransaction = useCallback(
    async (updated: Transaction) => {
      try {
        await updateTx(updated);
        modals.closeEditModal();
      } catch (err: unknown) {
        console.error('Update failed:', err);
      }
    },
    [updateTx, modals.closeEditModal]
  );

  const handleDeleteTransaction = useCallback(
    async (id: string) => {
      try {
        await removeTx(id);
      } catch (err: unknown) {
        console.error('Delete failed:', err);
      }
    },
    [removeTx]
  );

  // Touch / Swipe Navigation: Vault <-> Insights <-> Ledger
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('.overflow-x-auto') ||
        target?.closest('input') ||
        target?.closest('textarea') ||
        target?.closest('button')
      ) {
        touchStartPos.current = null;
        return;
      }
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartPos.current || e.changedTouches.length === 0) return;
      const startX = touchStartPos.current.x;
      const startY = touchStartPos.current.y;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      touchStartPos.current = null;

      const diffX = endX - startX;
      const diffY = endY - startY;

      if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
        const currentIdx = TAB_INDEX_MAP[mainMode] ?? 0;
        if (diffX < -60 && currentIdx < 2) {
          setMainMode(TAB_ORDER[currentIdx + 1]);
        } else if (diffX > 60 && currentIdx > 0) {
          setMainMode(TAB_ORDER[currentIdx - 1]);
        }
      }
    },
    [mainMode]
  );

  // 8. State-Driven Onboarding Guide & Context-Aware Nudge State
  const [accountCount, setAccountCount] = useState<number>(0);
  const [openAddAccountSignal, setOpenAddAccountSignal] = useState<number>(0);
  const [guideFlags, setGuideFlags] = useState(() => loadOnboardingGuideFlags());

  const refreshAccountCount = useCallback(async () => {
    try {
      const accs = await getAllAssetAccounts();
      setAccountCount(accs.length);
    } catch {
      // Non-critical count check
    }
  }, []);

  useEffect(() => {
    refreshAccountCount();
    const handleVaultSync = () => {
      refreshAccountCount();
    };
    window.addEventListener('vibe-vault-data-changed', handleVaultSync);
    window.addEventListener('vibe-vault-data-reset', handleVaultSync);
    return () => {
      window.removeEventListener('vibe-vault-data-changed', handleVaultSync);
      window.removeEventListener('vibe-vault-data-reset', handleVaultSync);
    };
  }, [refreshAccountCount]);

  useEffect(() => {
    if (activeQueryResult && !guideFlags.hasRunQuery) {
      saveHasRunQuery(true);
      setGuideFlags((prev) => ({ ...prev, hasRunQuery: true }));
    }
  }, [activeQueryResult, guideFlags.hasRunQuery]);

  const isGuestSession = !hasVaultPin();

  const onboardingSnapshot = useMemo(
    () => ({
      accountCount,
      transactionCount: transactions.length,
      hasRunQuery: guideFlags.hasRunQuery,
      isGuestMode: isGuestSession,
      activeTab: mainMode,
      checklistDismissed: guideFlags.checklistDismissed,
      dismissedNudges: guideFlags.dismissedNudges,
      language,
    }),
    [accountCount, transactions.length, guideFlags, isGuestSession, mainMode, language]
  );

  const onboardingProgress = useMemo(
    () => getOnboardingProgress(onboardingSnapshot),
    [onboardingSnapshot]
  );

  const activeContextNudge = useMemo(
    () => getActiveContextNudge(onboardingSnapshot, onboardingProgress),
    [onboardingSnapshot, onboardingProgress]
  );

  const handleDismissChecklist = useCallback(() => {
    saveChecklistDismissed(true);
    setGuideFlags((prev) => ({ ...prev, checklistDismissed: true }));
  }, []);

  const handleDismissNudge = useCallback((id: ContextNudgeId) => {
    setGuideFlags((prev) => {
      const next = Array.from(new Set([...prev.dismissedNudges, id]));
      saveDismissedNudges(next);
      return { ...prev, dismissedNudges: next };
    });
  }, []);

  const handleGuideAddAccount = useCallback(() => {
    setMainMode('vault');
    setOpenAddAccountSignal((n) => n + 1);
  }, []);

  const handleGuideTryInsightQuery = useCallback(
    (queryText: string) => {
      saveHasRunQuery(true);
      setGuideFlags((prev) => ({ ...prev, hasRunQuery: true }));
      setMainMode('insights');
      handleRunFinancialQuery(queryText);
    },
    [handleRunFinancialQuery]
  );

  const handleGuideLoadSampleData = useCallback(async () => {
    try {
      await loadSampleData();
      await Promise.all([loadTransactions(), refreshAccountCount()]);
      showToast('샘플 자산 및 거래 데이터가 등록되었습니다.');
    } catch {
      showToast('샘플 데이터를 불러오는 중 오류가 발생했습니다.');
    }
  }, [loadTransactions, refreshAccountCount, showToast]);

  // Stable view navigation callbacks
  const handleNavigateToVault = useCallback(() => setMainMode('vault'), []);
  const handleNavigateToInsights = useCallback(() => setMainMode('insights'), []);
  const handleNavigateToLedger = useCallback(() => setMainMode('ledger'), []);
  const handleConsumeAddAccountSignal = useCallback(() => setOpenAddAccountSignal(0), []);
  const handleClearSelectedCategory = useCallback(() => setSelectedCategory(null), [setSelectedCategory]);
  const handleClearError = useCallback(() => setError(null), [setError]);
  const handleDismissQueryResult = useCallback(() => setActiveQueryResult(null), [setActiveQueryResult]);

  return (
    <div className="w-full h-[100dvh] flex justify-center bg-[var(--surface-backdrop)] text-neutral-100 overflow-hidden font-sans antialiased transition-colors">
      <div className="w-full max-w-[440px] lg:max-w-2xl h-full bg-[var(--surface-canvas)] border-x border-[var(--surface-subtle-border)] flex flex-col relative shadow-2xl transition-colors">
        {/* Toast Notification Banner */}
        {toastMessage && (
          <div
            role="status"
            aria-live="polite"
            className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300 max-w-[92vw]"
          >
            <div className="bg-[#1e293b]/95 backdrop-blur-xl text-emerald-400 border border-emerald-500/30 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 text-xs sm:text-sm font-medium">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Check size={14} className="text-emerald-400" />
              </div>
              <span className="text-slate-100">{toastMessage}</span>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                aria-label="닫기"
                className="ml-2 text-slate-400 hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* 1. TOP HEADER */}
        <header className="flex-none min-h-16 pt-[env(safe-area-inset-top)] border-b border-[var(--surface-subtle-border)] bg-[var(--surface-canvas)]/90 backdrop-blur-xl z-20 text-white transition-colors">
          <div className="relative w-full h-16 px-4 flex items-center justify-between transition-all duration-300">
            <div className="flex items-center min-w-0">
              <h1 className="text-base font-bold tracking-tight text-white leading-tight flex items-center gap-1.5">
                <span>Vibe Vault</span>
                <button
                  id="version-changelog-btn"
                  type="button"
                  onClick={modals.openChangelogModal}
                  title={language === 'ko' ? '업데이트 노트 보기 (v0.1.2)' : 'View Release Notes (v0.1.2)'}
                  aria-label={
                    language === 'ko'
                      ? '버전 0.1.2 업데이트 노트 보기'
                      : 'View version 0.1.2 release notes'
                  }
                  className="inline-flex items-center gap-1.5 text-xs font-normal text-neutral-300 hover:text-sky-400 cursor-pointer transition-colors tabular-nums rounded-md px-1 py-0.5 -mx-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
                >
                  <span>0.1.2</span>
                  {modals.hasUnreadChangelog && (
                    <span
                      aria-hidden="true"
                      className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(56,189,248,0.8)]"
                    />
                  )}
                </button>
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                id="quick-start-guide-btn"
                type="button"
                onClick={modals.openWelcomeModal}
                title={language === 'ko' ? '사용 가이드 및 소개' : 'Guide & Manifesto'}
                aria-label={language === 'ko' ? '사용 가이드 및 소개' : 'Guide & Manifesto'}
                className="w-9 h-9 sm:w-8 sm:h-8 rounded-full border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 hover:text-white transition-all active:scale-95 flex items-center justify-center cursor-pointer shadow-xs"
              >
                <HelpCircle size={15} />
              </button>

              <button
                id="settings-gear-btn"
                type="button"
                onClick={() => modals.openSettingsModal('assets')}
                title={language === 'ko' ? '설정' : 'Settings'}
                className="w-9 h-9 sm:w-8 sm:h-8 rounded-full border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 hover:text-white transition-all active:scale-95 flex items-center justify-center cursor-pointer shadow-xs"
                aria-label={language === 'ko' ? '설정' : 'Settings'}
              >
                <Settings size={15} />
              </button>

              <button
                id="header-logout-btn"
                type="button"
                onClick={() => {
                  if (hasVaultPin()) {
                    lockVault();
                  } else {
                    modals.openGuestExitModal();
                  }
                }}
                title={
                  language === 'ko'
                    ? hasVaultPin()
                      ? '금고 잠그기'
                      : '게스트 종료'
                    : hasVaultPin()
                    ? 'Lock Vault'
                    : 'Exit Guest Mode'
                }
                aria-label={
                  language === 'ko'
                    ? hasVaultPin()
                      ? '금고 잠그기'
                      : '게스트 종료'
                    : hasVaultPin()
                    ? 'Lock Vault'
                    : 'Exit Guest Mode'
                }
                className="w-9 h-9 sm:w-8 sm:h-8 rounded-full border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 hover:text-white transition-all active:scale-95 flex items-center justify-center cursor-pointer shadow-xs"
              >
                {hasVaultPin() ? <Lock size={15} /> : <LogOut size={15} />}
              </button>
            </div>
          </div>
        </header>

        {/* 2. SCROLLABLE MIDDLE VIEWPORT */}
        <main
          ref={scrollContainerRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={`flex-1 w-full overflow-y-auto overscroll-contain px-4 pt-3 pb-24 scrollbar-none relative transition-all duration-300 ${
            isVaultLockedState ? 'filter blur-xl opacity-20 pointer-events-none select-none' : ''
          }`}
        >
          {!isOnline && (
            <div className="mb-3 rounded-2xl bg-amber-500/10 p-3.5 flex items-center gap-2.5 text-amber-500 text-xs">
              <WifiOff size={16} className="shrink-0" />
              <span className="text-xs leading-tight">{t('offline_banner')}</span>
            </div>
          )}

          {fxRates.source === 'estimated' || fxRates.stale ? (
            <div role="status" className="mb-3 rounded-2xl bg-amber-500/10 p-3.5 text-amber-300 text-xs">
              <strong className="font-semibold">
                {fxRates.source === 'estimated'
                  ? language === 'ko'
                    ? '환율 추정치 사용 중'
                    : 'Using estimated FX rates'
                  : language === 'ko'
                  ? '환율 정보가 오래되었습니다'
                  : 'FX rates may be outdated'}
              </strong>
              <p className="mt-1 leading-relaxed text-amber-200/80">
                {fxRates.source === 'estimated'
                  ? language === 'ko'
                    ? '환율 제공처에 연결되지 않아 근사 환율로 자산을 환산합니다. 금액은 참고용입니다.'
                    : 'Unable to reach the FX provider; displaying approximate rates for reference.'
                  : language === 'ko'
                  ? `마지막 기준일 ${fxRates.updatedAt || '알 수 없음'} 이후 새 환율을 가져오지 못했습니다.`
                  : `Could not refresh FX rates since ${fxRates.updatedAt || 'unknown'}.`}
              </p>
            </div>
          ) : (
            <div className="mb-3 text-[10px] text-neutral-400 text-right">
              {language === 'ko' ? '기준 환율' : 'Reference FX'} · Frankfurter · {fxRates.updatedAt}
            </div>
          )}

          <OnboardingGuideStrip
            progress={onboardingProgress}
            activeNudge={activeContextNudge}
            transactionCount={transactions.length}
            accountCount={accountCount}
            isGuestMode={isGuestSession}
            onTryTransaction={handleProcessInput}
            onAddAccount={handleGuideAddAccount}
            onLoadSampleData={handleGuideLoadSampleData}
            onTryInsightQuery={handleGuideTryInsightQuery}
            onCreateLocalAccount={modals.openWelcomeModal}
            onOpenWelcome={modals.openWelcomeModal}
            onDismissChecklist={handleDismissChecklist}
            onDismissNudge={handleDismissNudge}
          />

          {/* TAB 0: VAULT (자산) */}
          {mainMode === 'vault' && (
            <div className="w-full">
              <LazyErrorBoundary>
                <VaultOverviewSection
                  currentCurrency={currentCurrency}
                  fxRates={fxRates}
                  stealthMode={isStealth}
                  onToggleStealth={toggleStealthMode}
                  theme={userPrefs.theme || 'dark'}
                  onTransactionAdded={loadTransactions}
                  isMultiCurrencyMode={isMultiCurrencyMode}
                  transactions={transactions}
                  onNavigateToLedger={handleNavigateToLedger}
                  onNavigateToInsights={handleNavigateToInsights}
                  openAddAccountSignal={openAddAccountSignal}
                  onConsumeAddAccountSignal={handleConsumeAddAccountSignal}
                />
              </LazyErrorBoundary>
            </div>
          )}

          {/* TAB 1: INSIGHTS (인사이트) */}
          {mainMode === 'insights' && (
            <div className="w-full">
              <LazyErrorBoundary>
                <Suspense fallback={null}>
                  <InsightsSection
                    transactions={transactions}
                    currentCurrency={currentCurrency}
                    fxRates={fxRates}
                    isStealth={isStealth}
                    onOpenThemeSettings={() => modals.openSettingsModal('preferences')}
                    onNavigateToVault={handleNavigateToVault}
                    onNavigateToLedger={handleNavigateToLedger}
                    queryResult={activeQueryResult}
                    onDismissQueryResult={handleDismissQueryResult}
                  />
                </Suspense>
              </LazyErrorBoundary>
            </div>
          )}

          {/* TAB 2: LEDGER (장부) */}
          {mainMode === 'ledger' && (
            <LazyErrorBoundary>
              <Suspense fallback={null}>
                <LedgerSection
                  activeSpace={activeSpace}
                  currentSpaceTransactions={currentSpaceTransactions}
                  selectedCategory={selectedCategory}
                  onClearCategory={handleClearSelectedCategory}
                  ledgerFilter={ledgerFilter}
                  onChangeLedgerFilter={setLedgerFilter}
                  currentCurrency={currentCurrency}
                  activeCurrencies={activeCurrencies}
                  isMultiCurrencyMode={isMultiCurrencyMode}
                  fxRates={fxRates}
                  isStealth={isStealth}
                  theme={userPrefs.theme || 'dark'}
                  onOpenReportModal={modals.openReportModal}
                  onOpenReceiptModal={modals.openReceiptModal}
                  onLoadSampleData={handleLoadSampleFromLedger}
                  onRunPrompt={handleProcessInput}
                  onSelectTransaction={modals.setSelectedActionTransaction}
                />
              </Suspense>
            </LazyErrorBoundary>
          )}
        </main>

        {/* 3. FIXED BOTTOM DOCK (AI Omnibar & Navigation) */}
        <footer className="flex-none backdrop-blur-2xl pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] z-20 transition-colors border-t bg-[var(--surface-nav)]/88 border-[var(--surface-subtle-border)]">
          <div className="w-full px-4">
            <OmnibarDock
              input={input}
              setInput={setInput}
              isProcessing={isProcessing || isQuerying}
              isOnline={isOnline}
              currentCurrency={currentCurrency}
              isMultiCurrencyMode={isMultiCurrencyMode}
              realtimePreview={realtimePreview}
              engineStatus={engineStatus}
              engineConfig={engineConfig}
              updateEngineConfig={updateEngineConfig}
              onSubmit={handleProcessInput}
              onOpenReceiptScanner={modals.openReceiptModal}
              isListening={isListening}
              onToggleListen={toggleListen}
              error={error}
              onClearError={handleClearError}
              mode={mainMode}
              onRunQuery={handleRunFinancialQuery}
            />

            <nav
              aria-label="주요 메뉴"
              className="pt-1.5 flex items-center justify-around mt-1 border-t border-white/[0.04]"
            >
              <button
                id="bottom-nav-vault-btn"
                type="button"
                onClick={handleNavigateToVault}
                aria-label={t('vault')}
                aria-current={mainMode === 'vault' ? 'page' : undefined}
                className={`flex-1 min-h-[44px] py-1.5 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
                  mainMode === 'vault'
                    ? 'text-[var(--color-accent)] font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck size={18} className={mainMode === 'vault' ? 'stroke-[2.5]' : ''} />
                <span className="text-xs">{t('vault')}</span>
              </button>

              <button
                id="bottom-nav-insights-btn"
                type="button"
                onClick={handleNavigateToInsights}
                aria-label={t('insights')}
                aria-current={mainMode === 'insights' ? 'page' : undefined}
                className={`flex-1 min-h-[44px] py-1.5 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
                  mainMode === 'insights'
                    ? 'text-[var(--color-accent)] font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles size={18} className={mainMode === 'insights' ? 'stroke-[2.5]' : ''} />
                <span className="text-xs">{t('insights')}</span>
              </button>

              <button
                id="bottom-nav-ledger-btn"
                type="button"
                onClick={handleNavigateToLedger}
                aria-label={t('ledger')}
                aria-current={mainMode === 'ledger' ? 'page' : undefined}
                className={`flex-1 min-h-[44px] py-1.5 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
                  mainMode === 'ledger'
                    ? 'text-[var(--color-accent)] font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Wallet size={18} className={mainMode === 'ledger' ? 'stroke-[2.5]' : ''} />
                <span className="text-xs">{t('ledger')}</span>
              </button>
            </nav>
          </div>
        </footer>

        {/* 4. LAZY WORKSPACE MODALS */}
        <MountOnFirstOpen open={!!modals.selectedActionTransaction}>
          <TransactionActionModal
            isOpen={!!modals.selectedActionTransaction}
            transaction={modals.selectedActionTransaction}
            onClose={modals.closeActionModal}
            onEdit={modals.openEditFromAction}
            onDelete={(id) => {
              modals.closeActionModal();
              handleDeleteTransaction(id);
            }}
            isLight={false}
            isStealth={isStealth}
            currentCurrency={currentCurrency}
            convertedAmount={
              modals.selectedActionTransaction
                ? getAmountInSelectedCurrency(modals.selectedActionTransaction)
                : undefined
            }
          />
        </MountOnFirstOpen>

        <MountOnFirstOpen open={!!modals.editingTransaction}>
          <EditTransactionModal
            isOpen={!!modals.editingTransaction}
            onClose={modals.closeEditModal}
            transaction={modals.editingTransaction}
            onSave={handleUpdateTransaction}
            theme="dark"
          />
        </MountOnFirstOpen>

        <MountOnFirstOpen open={modals.pendingCategorizationTxs.length > 0}>
          <ManualCategoryModal
            isOpen={modals.pendingCategorizationTxs.length > 0}
            pendingTransactions={modals.pendingCategorizationTxs}
            onConfirm={handleConfirmCategorization}
            onCancel={modals.cancelCategorization}
            theme="dark"
            currencySymbol={userPrefs.currencySymbol || '₩'}
          />
        </MountOnFirstOpen>

        <MountOnFirstOpen open={modals.isSettingsOpen}>
          <SettingsModal
            isOpen={modals.isSettingsOpen}
            onClose={modals.closeSettingsModal}
            onDataChanged={syncPreferences}
            onDataReset={loadTransactions}
            initialTab={modals.settingsInitialTab}
            initialSubTab={modals.settingsInitialSubTab}
            spaces={spaces}
            activeSpaceId={activeSpaceId}
            onSelectSpace={handleSelectSpace}
            onDeleteSpace={handleDeleteSpace}
            onOpenNewSpace={modals.openNewSpaceFromSettings}
          />
        </MountOnFirstOpen>

        <LazyErrorBoundary>
          <Suspense fallback={null}>
            {modals.isReceiptModalOpen && (
              <ReceiptScannerModal
                isOpen={modals.isReceiptModalOpen}
                onClose={modals.closeReceiptModal}
                onConfirm={handleConfirmReceipt}
                onOpenSettings={(tab) => modals.openSettingsModal(tab || 'engine')}
                theme="dark"
                currentCurrency={currentCurrency}
                activeSpaceId={activeSpaceId}
                onQueueOffline={showToast}
              />
            )}
          </Suspense>
        </LazyErrorBoundary>

        <MountOnFirstOpen open={modals.isNewSpaceModalOpen}>
          <NewSpaceModal
            isOpen={modals.isNewSpaceModalOpen}
            onClose={modals.closeNewSpaceModal}
            onCreated={handleSpaceCreated}
            theme="dark"
          />
        </MountOnFirstOpen>

        <LazyErrorBoundary>
          <Suspense fallback={null}>
            {modals.isReportModalOpen && (
              <EventSettlementReportModal
                isOpen={modals.isReportModalOpen}
                onClose={modals.closeReportModal}
                space={activeSpace}
                transactions={currentSpaceTransactions}
                onUpdateSpace={handleUpdateSpace}
                theme="dark"
              />
            )}
          </Suspense>
        </LazyErrorBoundary>

        <MountOnFirstOpen open={modals.isChangelogOpen}>
          <ChangelogModal
            isOpen={modals.isChangelogOpen}
            onClose={modals.closeChangelogModal}
          />
        </MountOnFirstOpen>

        <GuestExitConfirmModal
          isOpen={modals.isGuestExitModalOpen}
          onClose={modals.closeGuestExitModal}
          onSetupPin={modals.openPinSetupFromGuestExit}
          onConfirmExit={() => {
            modals.closeGuestExitModal();
            lockVault();
          }}
        />

        <PWAInstallBanner theme="dark" position="bottom" />
      </div>
    </div>
  );
}

export default VaultWorkspace;
