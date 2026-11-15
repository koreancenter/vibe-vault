import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense, lazy } from 'react';
import { 
  inferCategoryAndMerchant,
} from './financialParser';
import { DebtItem, CurrencyCode, Transaction, TransactionType, SupportedCurrency, FxRates, ParsedReceiptData, LaunchScreenMode, LedgerSpace, FinancialQueryResult } from './types';
import { isFxRatesPayload } from './fxRates';
import { generateSecureId } from './identifiers';
import { 
  Settings, 
  Edit2, 
  Trash2, 
  WifiOff, 
  ArrowLeftRight, 
  Sparkles,
  ChevronRight,
  Check,
  ShieldCheck,
  Wallet,
  Receipt,
  Coffee,
  ShoppingBag,
  Car,
  UtensilsCrossed,
  Camera,
  HelpCircle
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cleanMerchantTitle } from './merchantSanitizer';
import { 
  getCategoryKo, 
  getPaymentMethodKo,
  DEFAULT_FX_RATES,
  getCurrencySymbol,
  getUserActiveCurrencies,
  convertCurrency,
  sanitizeCsvCell,
  getAIEngineConfig
} from './utils';
import { 
  loadSampleData, 
  ensureCleanSlateIfGuest, 
  getSpaces, 
  createSpace, 
  deleteSpace, 
  DEFAULT_SPACE,
  getPendingScans,
  deletePendingScan,
  notifyVaultDataChanged
} from './db';
import { parseReceiptWithResilience } from './autonomousFinance';

// Architectural Domain Custom Hooks
import { useTransactions, LedgerFilterType } from './hooks/useTransactions';
import { useBudgetAnalytics } from './hooks/useBudgetAnalytics';
import { useAutonomousEngine } from './hooks/useAutonomousEngine';
import { useOmnibarController } from './hooks/useOmnibarController';

// Extracted Modals and Visual Modules
import { FinancialSummaryCard } from './components/FinancialSummaryCard';
import { PWAInstallBanner } from './components/PWAInstallButton';
import { VaultOverviewSection } from './components/VaultOverviewSection';
import { VaultLockScreen } from './components/VaultLockScreen';
import { WelcomeDashboardModal } from './components/WelcomeDashboardModal';
import { OmnibarDock, type RealtimePreviewData } from './components/OmnibarDock';
import { initAutoLockWatcher, lockVault, isVaultLocked, hasVaultPin, unlockVault, subscribeVaultLock } from './vaultSecurity';
import { I18nProvider, useI18n, DEFAULT_CURRENCY_BY_LANGUAGE } from './i18n';

// Dynamic Code-Split Components (Heavy Modals)
const TransactionActionModal = lazy(() => import('./components/TransactionActionModal').then(m => ({ default: m.TransactionActionModal })));
const EditTransactionModal = lazy(() => import('./components/EditTransactionModal').then(m => ({ default: m.EditTransactionModal })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const InsightsSection = lazy(() => import('./components/InsightsSection').then(m => ({ default: m.InsightsSection })));
const ManualCategoryModal = lazy(() => import('./components/ManualCategoryModal').then(m => ({ default: m.ManualCategoryModal })));
const NewSpaceModal = lazy(() => import('./components/NewSpaceModal').then(m => ({ default: m.NewSpaceModal })));

// Loads a lazy chunk on first open, then keeps it mounted so exit animations still run.
const MountOnFirstOpen: React.FC<{ open: boolean; children: React.ReactNode }> = ({ open, children }) => {
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
  return seen ? <Suspense fallback={null}>{children}</Suspense> : null;
};

export const ReceiptScannerModal = lazy(() => import('./components/ReceiptScannerModal'));
export const EventSettlementReportModal = lazy(() => import('./components/EventSettlementReportModal'));

/**
 * Online Connectivity Hook
 */
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

function formatTransactionTitle(desc?: string, merchant?: string): string {
  if (!desc) return cleanMerchantTitle(merchant || '', '지출 내역');
  return cleanMerchantTitle(desc, merchant || '지출 내역');
}

const EXAMPLE_PROMPTS = [
  { text: '민수랑 파스타 4만원 더치페이하고 토스로 2만원 받음', category: '식사' },
  { text: '쿠팡에서 화장지 2만원, 영양제 3만원 결제함', category: '생활 / 쇼핑' },
  { text: '이번 달 월급 3,500,000원 기업은행 입금', category: '수입' },
  { text: '주택청약 통장으로 150만원 자동이체', category: '저축 / 이체' },
];

function AppInner() {
  const { t, language } = useI18n();
  const isOnline = useOnlineStatus();

  // ---------------------------------------------------------------------------
  // 1. Domain Hook: Transactions Persistence & Filtering Lifecycle
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 2. Global Multi-Currency State & FX Rates (Auto-synchronized with Locale)
  // ---------------------------------------------------------------------------
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

  // Load FX rates on mount
  useEffect(() => {
    const loadFxRates = async () => {
      try {
        const res = await fetch('/api/fx-rates');
        if (res.ok) {
          const data = await res.json();
          if (isFxRatesPayload(data)) {
            setFxRates(data);
          } else {
            console.warn('FX rates response did not match the expected format.');
          }
        } else {
          console.warn(`FX rates request failed with HTTP ${res.status}.`);
        }
      } catch (error) {
        console.warn(
          'Failed to fetch FX rates; estimated rates remain active.',
          error instanceof Error ? error.name : 'Unknown error',
        );
      }
    };
    // Defer so the request does not extend the critical path of initial render.
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback && w.cancelIdleCallback) {
      const id = w.requestIdleCallback(() => { void loadFxRates(); }, { timeout: 3000 });
      return () => w.cancelIdleCallback!(id);
    }
    const t = setTimeout(() => { void loadFxRates(); }, 1500);
    return () => clearTimeout(t);
  }, []);

  // ---------------------------------------------------------------------------
  // 3. Domain Hook: Autonomous AI Engine & Preferences
  // ---------------------------------------------------------------------------
  const {
    userPrefs,
    setUserPrefs,
    isStealth,
    toggleStealthMode,
    engineStatus,
    syncPreferences
  } = useAutonomousEngine({
    transactions,
    currentCurrency,
    fxRates
  });

  // Sync current currency with user preferences once loaded
  useEffect(() => {
    if (userPrefs.currencySymbol) {
      setCurrentCurrency(userPrefs.currencySymbol as SupportedCurrency);
    }
  }, [userPrefs.currencySymbol]);

  // ---------------------------------------------------------------------------
  // 4. Domain Hook: Budget Analytics & Converted Metric Computations
  // ---------------------------------------------------------------------------
  const {
    getAmountInSelectedCurrency
  } = useBudgetAnalytics({
    transactions,
    currentCurrency,
    fxRates
  });

  // ---------------------------------------------------------------------------
  // 5. Toast Notifications & Mode States
  // ---------------------------------------------------------------------------
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 4500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const [mainMode, setMainMode] = useState<LaunchScreenMode>('vault');

  // Sync default launch screen preference on mount/change
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
    });
    return () => {
      cleanupWatcher();
      unsub();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Multi-Ledger Spaces State (프로젝트 / 행사 장부)
  // ---------------------------------------------------------------------------
  const [spaces, setSpaces] = useState<LedgerSpace[]>([DEFAULT_SPACE]);
  const [activeSpaceId, setActiveSpaceId] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('vibe_active_space_id') || 'default';
    }
    return 'default';
  });
  const [isNewSpaceModalOpen, setIsNewSpaceModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const refreshSpaces = useCallback(async () => {
    try {
      const loaded = await getSpaces();
      setSpaces(loaded);
      if (!loaded.some(s => s.id === activeSpaceId)) {
        setActiveSpaceId('default');
        localStorage.setItem('vibe_active_space_id', 'default');
      }
    } catch (err) {
      console.warn('Failed to load spaces:', err);
    }
  }, [activeSpaceId]);

  useEffect(() => {
    refreshSpaces();
  }, [refreshSpaces]);

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
      const engineConfig = getAIEngineConfig();

      for (const scan of queuedItems) {
        try {
          const result = await parseReceiptWithResilience({
            imageBase64: scan.imageBase64,
            mimeType: scan.mimeType || 'image/webp',
            engineConfig,
            defaultCurrency: currentCurrency,
            maxRetries: 2
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

  const handleUnlocked = useCallback(() => {
    setIsVaultLockedState(false);
    loadTransactions();
    processPendingScansOnReconnect();
  }, [loadTransactions, processPendingScansOnReconnect]);

  useEffect(() => {
    const handleOnline = () => {
      processPendingScansOnReconnect();
    };

    const handleQueuedOffline = (e: Event) => {
      const custom = e as CustomEvent<{ message: string }>;
      if (custom.detail?.message) {
        showToast(custom.detail.message);
      }
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

  const activeSpace = useMemo(() => {
    return spaces.find(s => s.id === activeSpaceId) || DEFAULT_SPACE;
  }, [spaces, activeSpaceId]);

  // Transactions strictly isolated to the active space
  const currentSpaceTransactions = useMemo(() => {
    return transactions.filter(t => {
      const sId = t.spaceId || 'default';
      return sId === activeSpaceId;
    });
  }, [transactions, activeSpaceId]);

  // Filtered ledger stream within the active space
  const spaceFilteredLedgerTransactions = useMemo(() => {
    let result = currentSpaceTransactions;
    if (selectedCategory) {
      result = result.filter(t => t.category === selectedCategory);
    }
    if (ledgerFilter !== 'ALL') {
      result = result.filter(t => t.type === ledgerFilter);
    }
    return result;
  }, [currentSpaceTransactions, selectedCategory, ledgerFilter]);

  // Modal Visibility States
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(() => typeof localStorage !== 'undefined' && !localStorage.getItem('vibe_welcome_seen'));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'assets' | 'engine' | 'preferences' | 'privacy'>('assets');
  const [settingsInitialSubTab, setSettingsInitialSubTab] = useState<'assets' | 'budget' | 'subscriptions'>('assets');
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedActionTransaction, setSelectedActionTransaction] = useState<Transaction | null>(null);
  const [pendingCategorizationTxs, setPendingCategorizationTxs] = useState<Transaction[]>([]);

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
  }, [loadTransactions]);

  const recognitionRef = useRef<any>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Linear Tab Order & Touch / Swipe Navigation: Index 0: Vault ⇄ 1: Insights ⇄ 2: Ledger
  const TAB_ORDER: LaunchScreenMode[] = useMemo(() => ['vault', 'insights', 'ledger'], []);
  const TAB_INDEX_MAP: Record<LaunchScreenMode, number> = useMemo(() => ({
    vault: 0,
    insights: 1,
    ledger: 2,
  }), []);

  const currentTabIndex = TAB_INDEX_MAP[mainMode] ?? 0;
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.overflow-x-auto') || target?.closest('input') || target?.closest('textarea') || target?.closest('button')) {
        touchStartPos.current = null;
        return;
      }
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
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
  }, [TAB_INDEX_MAP, TAB_ORDER, mainMode]);

  // ---------------------------------------------------------------------------
  // 6. Action Callbacks
  // ---------------------------------------------------------------------------
  const handleSelectCurrency = useCallback((newCurrency: SupportedCurrency) => {
    setCurrentCurrency(newCurrency);
    setUserPrefs(prev => {
      const updated = { ...prev, currencySymbol: newCurrency };
      localStorage.setItem('vibe_user_preferences', JSON.stringify(updated));
      return updated;
    });
  }, [setUserPrefs]);

  const [activeCurrencies, setActiveCurrencies] = useState<string[]>(() => {
    const list = getUserActiveCurrencies();
    return list.length > 0 ? list : ['KRW'];
  });

  useEffect(() => {
    const refreshList = () => {
      const stored = getUserActiveCurrencies();
      const list = stored.length > 0 ? stored : ['KRW'];
      const upper = currentCurrency.toUpperCase();
      if (!list.includes(upper)) {
        setActiveCurrencies([upper, ...list]);
      } else {
        setActiveCurrencies(list);
      }
    };
    refreshList();
    window.addEventListener('storage', refreshList);
    return () => window.removeEventListener('storage', refreshList);
  }, [currentCurrency, isSettingsOpen]);

  const isMultiCurrencyMode = activeCurrencies.length > 1;

  const handleOpenSettingsModal = useCallback((
    tab?: unknown,
    subTab?: 'assets' | 'budget' | 'subscriptions'
  ) => {
    const validTabs: ('assets' | 'engine' | 'preferences' | 'privacy')[] = ['assets', 'engine', 'preferences', 'privacy'];
    const resolvedTab: 'assets' | 'engine' | 'preferences' | 'privacy' =
      typeof tab === 'string' && (validTabs as string[]).includes(tab)
        ? (tab as 'assets' | 'engine' | 'preferences' | 'privacy')
        : 'assets';
    setSettingsInitialTab(resolvedTab);
    setSettingsInitialSubTab(subTab || 'assets');
    setIsSettingsOpen(true);
  }, []);

  const handleQuickCycleCurrency = useCallback(() => {
    const stored = getUserActiveCurrencies();
    const list = stored.length > 0 ? stored : [currentCurrency.toUpperCase()];
    const upper = currentCurrency.toUpperCase();
    if (!list.includes(upper)) {
      list.unshift(upper);
    }

    if (list.length <= 1) {
      handleOpenSettingsModal('preferences');
      return;
    }

    const currentIndex = list.indexOf(upper);
    const nextIndex = (currentIndex + 1) % list.length;
    const nextCurrency = list[nextIndex] as SupportedCurrency;
    handleSelectCurrency(nextCurrency);
  }, [currentCurrency, handleSelectCurrency, handleOpenSettingsModal]);

  const handleSelectSpace = useCallback((space: LedgerSpace) => {
    setActiveSpaceId(space.id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vibe_active_space_id', space.id);
    }
    if (space.currency) {
      handleSelectCurrency(space.currency as SupportedCurrency);
    }
  }, [handleSelectCurrency]);

  const handleDeleteSpace = useCallback(async (spaceId: string) => {
    if (spaceId === 'default') return;
    if (!window.confirm('이 프로젝트 장부와 관련 거래 내역을 삭제하시겠습니까?')) return;
    try {
      await deleteSpace(spaceId);
      setSpaces(prev => prev.filter(s => s.id !== spaceId));
      if (activeSpaceId === spaceId) {
        setActiveSpaceId('default');
        localStorage.setItem('vibe_active_space_id', 'default');
      }
      await loadTransactions();
    } catch (err) {
      console.error('Failed to delete space:', err);
    }
  }, [activeSpaceId, loadTransactions]);

  const handleExportSpaceCSV = useCallback(() => {
    const list = spaceFilteredLedgerTransactions;
    if (list.length === 0) return;
    const bom = '\uFEFF';
    let csv = `날짜,구분,카테고리,상세카테고리,내역,금액,통화,결제수단,비고\r\n`;
    list.forEach(t => {
      const typeStr = sanitizeCsvCell(t.type === 'EXPENSE' ? '지출' : t.type === 'INCOME' ? '수입' : t.type === 'TRANSFER' ? '이체' : '정산');
      const catStr = sanitizeCsvCell(getCategoryKo(t.category, t.subCategory));
      const subCat = sanitizeCsvCell(t.subCategory || '');
      const safeDesc = sanitizeCsvCell(t.description || '');
      const safeNote = sanitizeCsvCell(t.note || '');
      const pay = sanitizeCsvCell(t.paymentMethod || '');
      csv += `"${t.date}","${typeStr}","${catStr}","${subCat}","${safeDesc}",${t.amount},"${t.currency || activeSpace.currency || currentCurrency}","${pay}","${safeNote}"\r\n`;
    });
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSpace.name}_내역_${format(new Date(), 'yyyyMMdd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [spaceFilteredLedgerTransactions, activeSpace.name, activeSpace.currency, currentCurrency]);

  const handleOpenReceiptModal = useCallback(() => setIsReceiptModalOpen(true), []);
  const handleCloseReceiptModal = useCallback(() => setIsReceiptModalOpen(false), []);

  const handleCloseSettingsModal = useCallback(() => {
    setIsSettingsOpen(false);
    syncPreferences();
  }, [syncPreferences]);

  const handleCloseEditModal = useCallback(() => setEditingTransaction(null), []);
  const handleCancelCategorization = useCallback(() => setPendingCategorizationTxs([]), []);

  const handleConfirmReceipt = useCallback(async (receipt: ParsedReceiptData) => {
    try {
      const merchantTitle = receipt.merchantName || receipt.merchant || '영수증 스캔 지출';
      const newTx: Transaction = {
        id: generateSecureId('tx-receipt'),
        type: 'EXPENSE',
        amount: Math.abs(receipt.totalAmount) || 0,
        currency: (receipt.currency as SupportedCurrency) || (activeSpace.currency as SupportedCurrency) || currentCurrency,
        category: receipt.category || receipt.suggestedCategory || 'Living',
        subCategory: 'Receipt',
        description: `${merchantTitle} (영수증)`,
        date: receipt.date ? new Date(receipt.date).toISOString() : new Date().toISOString(),
        paymentMethod: receipt.paymentMethod || '카드결제',
        spaceId: activeSpaceId,
      };

      await addTx(newTx);
      setIsReceiptModalOpen(false);

      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: unknown) {
      console.error('Failed to save receipt transaction:', err);
      setError('영수증 내역 저장 중 오류가 발생했습니다.');
    }
  }, [addTx, activeSpace.currency, currentCurrency, activeSpaceId]);

  const handleConfirmCategorization = useCallback(async (finalTxs: Transaction[]) => {
    try {
      const spaceTxs = finalTxs.map(tx => ({
        ...tx,
        spaceId: tx.spaceId || activeSpaceId,
        currency: tx.currency || (activeSpace.currency as SupportedCurrency) || currentCurrency
      }));
      await batchAddTxs(spaceTxs);
      setPendingCategorizationTxs([]);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: unknown) {
      console.error(err);
      setError('카테고리 저장 중 오류가 발생했습니다.');
    }
  }, [batchAddTxs, activeSpaceId, activeSpace.currency, currentCurrency]);

  const handleUpdateTransaction = useCallback(async (updated: Transaction) => {
    try {
      await updateTx(updated);
      setEditingTransaction(null);
    } catch (err: unknown) {
      console.error('Update failed:', err);
    }
  }, [updateTx]);

  const handleDeleteTransaction = useCallback(async (id: string) => {
    try {
      await removeTx(id);
    } catch (err: unknown) {
      console.error('Delete failed:', err);
    }
  }, [removeTx]);

  // ---------------------------------------------------------------------------
  // 5. Omnibar & Conversational AI Query Controller
  // ---------------------------------------------------------------------------
  const {
    input,
    setInput,
    isOmnibarFocused,
    setIsOmnibarFocused,
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
    realtimePreview
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
    setPendingCategorizationTxs,
    showToast,
    scrollContainerRef
  });

  const isTypingInOmnibar = input.trim().length > 0 || isOmnibarFocused;

  return (
    <div className="w-full h-[100dvh] flex justify-center bg-[#07080A] text-neutral-100 overflow-hidden font-sans antialiased">
      <div className="w-full max-w-[440px] lg:max-w-2xl h-full bg-[#090A0D] border-x border-white/[0.04] flex flex-col relative shadow-2xl">
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
        <header className="flex-none h-16 border-b border-white/[0.06] bg-[#090A0D]/90 backdrop-blur-xl z-20 text-white">
          <div className="relative w-full h-full px-4 flex items-center justify-between transition-all duration-300">
            {/* Left: Brand with Version */}
            <div className="flex items-center min-w-0">
              <h1 className="text-base font-bold tracking-tight text-white leading-tight flex items-baseline gap-1.5">
                <span>Vibe Vault</span>
                <span className="text-xs font-normal text-neutral-300 tabular-nums">0.1.2</span>
              </h1>
            </div>

            {/* Right action controls */}
            <div className="flex items-center gap-2 shrink-0">
              {/* How-to Guide Button */}
              <button
                id="quick-start-guide-btn"
                type="button"
                onClick={() => setIsWelcomeOpen(true)}
                title="사용법 가이드"
                aria-label="사용법 가이드"
                className="px-2.5 h-8 rounded-full border border-white/15 bg-white/[0.06] text-xs font-medium text-neutral-200 hover:text-white hover:bg-white/[0.12] flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs"
              >
                <HelpCircle size={13} className="text-neutral-300" />
                <span>사용법</span>
              </button>

              {/* Settings Gear */}
              <button
                id="settings-gear-btn"
                type="button"
                onClick={() => handleOpenSettingsModal('assets')}
                title="설정"
                className="w-8 h-8 rounded-full border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 hover:text-white transition-all active:scale-95 flex items-center justify-center cursor-pointer shadow-xs"
                aria-label="설정"
              >
                <Settings size={14} />
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
          {/* Offline Warning Banner */}
          {!isOnline && (
            <div className="mb-3 rounded-2xl bg-amber-500/10 p-3.5 flex items-center gap-2.5 text-amber-500 text-xs">
              <WifiOff size={16} className="shrink-0" />
              <span className="text-xs leading-tight">{t('offline_banner')}</span>
            </div>
          )}

          {fxRates.source === 'estimated' || fxRates.stale ? (
            <div
              role="status"
              className="mb-3 rounded-2xl bg-amber-500/10 p-3.5 text-amber-300 text-xs"
            >
              <strong className="font-semibold">
                {fxRates.source === 'estimated' ? '환율 추정치 사용 중' : '환율 정보가 오래되었습니다'}
              </strong>
              <p className="mt-1 leading-relaxed text-amber-200/80">
                {fxRates.source === 'estimated'
                  ? '환율 제공처에 연결되지 않아 근사 환율로 자산을 환산합니다. 금액은 참고용입니다.'
                  : `마지막 기준일 ${fxRates.updatedAt || '알 수 없음'} 이후 새 환율을 가져오지 못했습니다.`}
              </p>
            </div>
          ) : (
            <div className="mb-3 text-[10px] text-neutral-400 text-right">
              기준 환율 · Frankfurter · {fxRates.updatedAt}
            </div>
          )}

          {/* TAB 0: VAULT (자산) */}
          {mainMode === 'vault' && (
            <div className="w-full">
              <VaultOverviewSection
                currentCurrency={currentCurrency}
                fxRates={fxRates}
                stealthMode={isStealth}
                onToggleStealth={toggleStealthMode}
                theme={userPrefs.theme || 'dark'}
                onTransactionAdded={() => loadTransactions()}
                isMultiCurrencyMode={isMultiCurrencyMode}
                transactions={transactions}
                onNavigateToLedger={() => setMainMode('ledger')}
                onNavigateToInsights={() => setMainMode('insights')}
              />
            </div>
          )}

          {/* TAB 1: INSIGHTS (인사이트) */}
          {mainMode === 'insights' && (
            <div className="w-full">
              <Suspense fallback={null}>
              <InsightsSection
                transactions={transactions}
                currentCurrency={currentCurrency}
                fxRates={fxRates}
                isStealth={isStealth}
                onOpenThemeSettings={() => handleOpenSettingsModal('preferences')}
                onNavigateToVault={() => setMainMode('vault')}
                onNavigateToLedger={() => setMainMode('ledger')}
                queryResult={activeQueryResult}
                onDismissQueryResult={() => setActiveQueryResult(null)}
              />
              </Suspense>
            </div>
          )}

          {/* TAB 2: LEDGER (장부) */}
          {mainMode === 'ledger' && (
            <div className="w-full space-y-4">
              {/* Financial Summary Card */}
              <FinancialSummaryCard
                transactions={currentSpaceTransactions}
                currencySymbol={activeSpace.currency || currentCurrency}
                fxRates={fxRates}
                isStealth={isStealth}
                theme={userPrefs.theme || 'dark'}
                isMultiCurrencyMode={isMultiCurrencyMode}
                secondaryCurrency={activeCurrencies.find(c => c.toUpperCase() !== (activeSpace.currency || currentCurrency).toUpperCase())}
                activeSpace={activeSpace}
              />

              {/* In Event Ledger mode: Event Budget Summary */}
              {activeSpace.id !== 'default' && (
                <div className="p-5 rounded-2xl border backdrop-blur-2xl bg-white/[0.03] border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      프로젝트·행사 정산 관리
                    </span>
                    <span className="text-xs text-neutral-400 font-light tabular-nums">
                      {activeSpace.memberCount ? `${activeSpace.memberCount}명 정산` : '참여자 미지정'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300 font-light leading-relaxed">
                    공동 회비 및 지출 영수증을 취합하여 대한민국 표준 정산 내역서(모임/행사/워크숍)를 생성합니다.
                  </p>
                  <button
                    id="event-settlement-report-btn"
                    type="button"
                    onClick={() => setIsReportModalOpen(true)}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-white text-neutral-950 hover:bg-neutral-200 active:scale-95 transition-all shadow-xs cursor-pointer"
                  >
                    <span>결산서 출력</span>
                  </button>
                </div>
              )}

              {/* Category Filter Status Pill */}
              {selectedCategory && (
                <div className="flex items-center justify-between px-2 text-xs text-[#94A3B8]">
                  <span>카테고리 필터링: <strong className="text-[#38bdf8] font-semibold">{getCategoryKo(selectedCategory)}</strong></span>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className="text-xs text-slate-400 hover:text-white font-medium cursor-pointer transition-colors"
                  >
                    필터 해제
                  </button>
                </div>
              )}

              {/* Filter Pills & Actions */}
              <div className="flex items-center justify-between gap-2 min-h-[36px] flex-wrap sm:flex-nowrap">
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
                  {(['ALL', 'EXPENSE', 'INCOME', 'TRANSFER', 'SETTLEMENT'] as const).map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setLedgerFilter(f as LedgerFilterType)}
                      className={`px-3.5 py-1 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all border cursor-pointer ${
                        ledgerFilter === f
                          ? 'bg-white text-black font-semibold border-white shadow-xs'
                          : 'bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 hover:text-white border-white/15'
                      }`}
                    >
                      {f === 'ALL' ? t('filter_all') : f === 'EXPENSE' ? t('filter_expense') : f === 'INCOME' ? t('filter_income') : f === 'TRANSFER' ? t('filter_transfer') : t('filter_settlement')}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    id="export-csv-btn"
                    type="button"
                    onClick={handleExportSpaceCSV}
                    className="px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all active:scale-95 border bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 hover:text-white border-white/15 cursor-pointer shadow-xs"
                    title={t('export_csv')}
                    aria-label={t('export_csv')}
                  >
                    <span>{t('export_csv')}</span>
                  </button>
                </div>
              </div>

              {/* Empty State / Recommended Prompts */}
              {currentSpaceTransactions.length === 0 ? (
                <div className="p-6 sm:p-8 rounded-2xl border text-center space-y-4 my-2 transition-all bg-white/[0.03] backdrop-blur-2xl border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white">
                  <h2 className="text-base font-semibold tracking-tight text-white">
                    {activeSpace.id !== 'default' 
                      ? `[${activeSpace.name}] ${t('empty_ledger_title')}`
                      : t('empty_ledger_title')}
                  </h2>

                  <div className="flex items-center justify-center flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsReceiptModalOpen(true)}
                      className="h-8 px-4 rounded-xl font-semibold text-xs bg-white hover:bg-neutral-200 text-neutral-950 flex items-center justify-center active:scale-95 transition-all shadow-sm cursor-pointer"
                    >
                      <span>{t('scan_receipt')}</span>
                    </button>

                    {activeSpace.id === 'default' && (
                      <button
                        type="button"
                        onClick={handleLoadSampleFromLedger}
                        className="h-8 px-4 rounded-xl font-medium text-xs border flex items-center justify-center active:scale-95 transition-all cursor-pointer bg-white/[0.08] hover:bg-white/[0.14] text-white border-white/15 shadow-xs"
                      >
                        <span>{t('load_sample_data')}</span>
                      </button>
                    )}
                  </div>
                  
                  {/* Example prompts */}
                  <div className="pt-3 text-left space-y-1 border-t border-white/[0.05]">
                    <span className="text-[11px] font-medium block px-1 pb-0.5 text-neutral-300">
                      {t('recommended_prompts')}
                    </span>
                    <div className="space-y-1">
                      {(activeSpace.id !== 'default' ? [
                        { text: `회비 ${activeSpace.currency === 'KRW' ? '5만원' : '50EUR'} 전원 통장 입금 완료`, category: '회비 수입' },
                        { text: '단체 저녁 식사 및 음료 비용 카드 결제', category: '단체 식비' },
                        { text: '현지 관광지 단체 입장료 현금 결제', category: '관광/입장료' },
                        { text: '이동 버스 대절 및 주유비 결제', category: '교통비' }
                      ] : EXAMPLE_PROMPTS).map((prompt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleProcessInput(prompt.text)}
                          className="w-full text-left text-xs py-2 px-2.5 rounded-xl transition-colors flex items-center justify-between group hover:bg-white/[0.06] text-neutral-200 cursor-pointer"
                        >
                          <div className="truncate pr-2">
                            <span className="font-semibold mr-1.5 text-sky-400">
                              [{prompt.category}]
                            </span>
                            <span className="font-normal text-neutral-200">{prompt.text}</span>
                          </div>
                          <ChevronRight size={13} className="shrink-0 opacity-40 group-hover:opacity-100 transition-opacity text-slate-400 group-hover:text-sky-400" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : spaceFilteredLedgerTransactions.length === 0 ? (
                <div className="py-12 text-center text-xs space-y-2 text-neutral-300">
                  <p className="font-normal text-neutral-300">
                    {t('empty_filter_message')}
                  </p>
                  {ledgerFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setLedgerFilter('ALL')}
                      className="mt-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 hover:text-white border-white/15 cursor-pointer shadow-xs"
                    >
                      {t('view_all_transactions')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {spaceFilteredLedgerTransactions.map((tx) => {
                    const isExpense = tx.type === 'EXPENSE';
                    const isIncome = tx.type === 'INCOME';
                    const isSettlement = tx.type === 'SETTLEMENT';
                    const displayTitle = formatTransactionTitle(tx.description);
                    const categoryLabel = tx.isInternalTransfer
                      ? (tx.subCategory || '내부이체/원금상환')
                      : getCategoryKo(tx.category, tx.subCategory);
                    const currSymbol = getCurrencySymbol(tx.currency || currentCurrency);

                    return (
                      <div
                        key={tx.id}
                        onClick={() => setSelectedActionTransaction(tx)}
                        className="py-3.5 px-1.5 transition-colors cursor-pointer group select-none hover:bg-white/[0.03] active:bg-white/[0.06]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm font-medium leading-snug truncate text-white">
                              {displayTitle}
                            </span>

                            <div className="flex items-center gap-1.5 text-xs font-normal mt-0.5 flex-wrap text-neutral-300">
                              <span>{categoryLabel}</span>
                              {(tx.paymentMethod || tx.type === 'INCOME') && (
                                <>
                                  <span className="opacity-30">·</span>
                                  <span>{getPaymentMethodKo(tx.paymentMethod, tx.type)}</span>
                                </>
                              )}
                              <span className="opacity-30">·</span>
                              <span>{(() => {
                                try {
                                  const d = parseISO(tx.date);
                                  return Number.isNaN(d.getTime()) ? '' : format(d, 'M.d HH:mm');
                                } catch {
                                  return '';
                                }
                              })()}</span>
                              {tx.note && (
                                <>
                                  <span className="opacity-30">·</span>
                                  <span className="text-amber-400/90 font-medium truncate max-w-[150px]">
                                    📝 {tx.note}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end shrink-0 pl-2">
                            <span className={`text-sm font-medium tracking-tight tabular-nums whitespace-nowrap transition-all ${isStealth ? 'blur-sm select-none' : ''} ${
                              tx.isInternalTransfer
                                ? 'text-blue-400'
                                : isExpense 
                                  ? 'text-white' 
                                  : isIncome || isSettlement
                                    ? 'text-sky-400'
                                    : 'text-blue-400'
                            }`}>
                              {tx.isInternalTransfer ? '⇄ ' : (isExpense ? '-' : '+')}{currSymbol}{(Number(tx.amount) || 0).toLocaleString()}
                            </span>

                            {isMultiCurrencyMode && (() => {
                              const txCurr = (tx.currency || currentCurrency).toUpperCase();
                              const baseCurr = currentCurrency.toUpperCase();
                              const secondaryCode = txCurr === baseCurr
                                ? (activeCurrencies.find(c => c.toUpperCase() !== baseCurr) || 'KRW')
                                : baseCurr;

                              if (secondaryCode === txCurr) return null;

                              const convertedSecondary = convertCurrency(tx.amount, txCurr, secondaryCode, fxRates);
                              const secSym = getCurrencySymbol(secondaryCode);
                              const isIntSec = secondaryCode === 'KRW' || secondaryCode === 'JPY' || secondaryCode === 'IDR' || secondaryCode === 'VND';
                              const formattedSec = isIntSec
                                ? Math.round(convertedSecondary).toLocaleString()
                                : convertedSecondary.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                              const sign = tx.isInternalTransfer ? '⇄ ' : (isExpense ? '-' : '+');

                              return (
                                <span className={`text-[11px] font-normal mt-0.5 tabular-nums whitespace-nowrap text-neutral-300 ${isStealth ? 'blur-xs select-none' : ''}`}>
                                  ≈ {sign}{secSym}{formattedSec}
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        {isSettlement && (
                          <div className="mt-2 px-2.5 py-1 rounded-full text-xs flex items-center justify-between font-normal bg-sky-500/10 text-sky-300 border border-sky-500/20">
                            <span className="flex items-center gap-1.5">
                              <ArrowLeftRight size={13} /> {t('dutch_pay_completed')}
                            </span>
                            <span className="tabular-nums">{t('dutch_pay_received', { symbol: currSymbol, amount: tx.amount.toLocaleString() })}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>

        {/* 3. FIXED BOTTOM DOCK (AI Omnibar & Navigation) */}
      <footer className="flex-none backdrop-blur-2xl py-2 z-20 transition-colors border-t bg-[#08090D]/80 border-white/[0.08]">
        <div className="w-full px-4 transition-all duration-300">
          <div
            onFocusCapture={() => setIsOmnibarFocused(true)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setIsOmnibarFocused(false);
              }
            }}
          >
            <OmnibarDock
              input={input}
              setInput={setInput}
              isProcessing={isProcessing || isQuerying}
              isOnline={isOnline}
              currentCurrency={currentCurrency}
              isMultiCurrencyMode={isMultiCurrencyMode}
              realtimePreview={realtimePreview}
              engineStatus={engineStatus}
              onSubmit={handleProcessInput}
              onOpenReceiptScanner={handleOpenReceiptModal}
              onCycleCurrency={handleQuickCycleCurrency}
              isListening={isListening}
              onToggleListen={toggleListen}
              error={error}
              onClearError={() => setError(null)}
              mode={mainMode}
              onRunQuery={handleRunFinancialQuery}
              onFocusChange={setIsOmnibarFocused}
            />
          </div>

          {/* Persistent Bottom Tab Navigation Switcher (Hidden when typing in Omnibar to maximize mobile viewport space) */}
          {!isTypingInOmnibar && (
            <div className="pt-1.5 flex items-center justify-around mt-1 border-t border-white/[0.04] animate-in fade-in duration-150">
              <button
                id="bottom-nav-vault-btn"
                type="button"
                onClick={() => setMainMode('vault')}
                aria-label={t('vault')}
                className={`flex-1 py-1.5 flex flex-col items-center gap-0.5 rounded-xl transition-all ${
                  mainMode === 'vault'
                    ? 'text-blue-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck size={18} className={mainMode === 'vault' ? 'stroke-[2.5]' : ''} />
                <span className="text-xs">{t('vault')}</span>
              </button>

              <button
                id="bottom-nav-insights-btn"
                type="button"
                onClick={() => setMainMode('insights')}
                aria-label={t('insights')}
                className={`flex-1 py-1.5 flex flex-col items-center gap-0.5 rounded-xl transition-all ${
                  mainMode === 'insights'
                    ? 'text-indigo-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles size={18} className={mainMode === 'insights' ? 'stroke-[2.5]' : ''} />
                <span className="text-xs">{t('insights')}</span>
              </button>

              <button
                id="bottom-nav-ledger-btn"
                type="button"
                onClick={() => setMainMode('ledger')}
                aria-label={t('ledger')}
                className={`flex-1 py-1.5 flex flex-col items-center gap-0.5 rounded-xl transition-all ${
                  mainMode === 'ledger'
                    ? 'text-sky-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Wallet size={18} className={mainMode === 'ledger' ? 'stroke-[2.5]' : ''} />
                <span className="text-xs">{t('ledger')}</span>
              </button>
            </div>
          )}
        </div>
      </footer>

      {/* Transaction Action Modal */}
      <MountOnFirstOpen open={!!selectedActionTransaction}>
      <TransactionActionModal
        isOpen={!!selectedActionTransaction}
        transaction={selectedActionTransaction}
        onClose={() => setSelectedActionTransaction(null)}
        onEdit={(tx) => {
          setSelectedActionTransaction(null);
          setEditingTransaction(tx);
        }}
        onDelete={(id) => {
          setSelectedActionTransaction(null);
          handleDeleteTransaction(id);
        }}
        isLight={false}
        isStealth={isStealth}
        currentCurrency={currentCurrency}
        convertedAmount={selectedActionTransaction ? getAmountInSelectedCurrency(selectedActionTransaction) : undefined}
      />
      </MountOnFirstOpen>

      {/* Edit Transaction Modal */}
      <MountOnFirstOpen open={!!editingTransaction}>
      <EditTransactionModal
        isOpen={!!editingTransaction}
        onClose={handleCloseEditModal}
        transaction={editingTransaction}
        onSave={handleUpdateTransaction}
        theme="dark"
      />
      </MountOnFirstOpen>

      {/* Manual Category Selection Modal */}
      <MountOnFirstOpen open={pendingCategorizationTxs.length > 0}>
      <ManualCategoryModal
        isOpen={pendingCategorizationTxs.length > 0}
        pendingTransactions={pendingCategorizationTxs}
        onConfirm={handleConfirmCategorization}
        onCancel={handleCancelCategorization}
        theme="dark"
        currencySymbol={userPrefs.currencySymbol || '₩'}
      />
      </MountOnFirstOpen>

      {/* Settings Modal */}
      <MountOnFirstOpen open={isSettingsOpen}>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettingsModal}
        onDataChanged={syncPreferences}
        onDataReset={loadTransactions}
        initialTab={settingsInitialTab}
        initialSubTab={settingsInitialSubTab}
        spaces={spaces}
        activeSpaceId={activeSpaceId}
        onSelectSpace={handleSelectSpace}
        onDeleteSpace={handleDeleteSpace}
        onOpenNewSpace={() => {
          setIsSettingsOpen(false);
          setIsNewSpaceModalOpen(true);
        }}
      />
      </MountOnFirstOpen>

      {/* Multimodal Receipt AI Scanner Modal */}
      <Suspense fallback={null}>
        {isReceiptModalOpen && (
          <ReceiptScannerModal
            isOpen={isReceiptModalOpen}
            onClose={handleCloseReceiptModal}
            onConfirm={handleConfirmReceipt}
            onOpenSettings={(tab) => handleOpenSettingsModal(tab || 'engine')}
            theme="dark"
            currentCurrency={currentCurrency}
            activeSpaceId={activeSpaceId}
            onQueueOffline={showToast}
          />
        )}
      </Suspense>

      {/* New Project / Event Space Modal */}
      <MountOnFirstOpen open={isNewSpaceModalOpen}>
      <NewSpaceModal
        isOpen={isNewSpaceModalOpen}
        onClose={() => setIsNewSpaceModalOpen(false)}
        onCreated={(newSpace) => {
          setSpaces(prev => [...prev, newSpace]);
          setActiveSpaceId(newSpace.id);
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('vibe_active_space_id', newSpace.id);
          }
          if (newSpace.currency) {
            handleSelectCurrency(newSpace.currency as SupportedCurrency);
          }
          setMainMode('ledger');
        }}
        theme="dark"
      />
      </MountOnFirstOpen>

      {/* Korean-Standard Event Settlement Report Modal */}
      <Suspense fallback={null}>
        {isReportModalOpen && (
          <EventSettlementReportModal
            isOpen={isReportModalOpen}
            onClose={() => setIsReportModalOpen(false)}
            space={activeSpace}
            transactions={currentSpaceTransactions}
            onUpdateSpace={async (updated) => {
              await createSpace(updated);
              setSpaces(prev => prev.map(s => s.id === updated.id ? updated : s));
            }}
            theme="dark"
          />
        )}
      </Suspense>

      {/* Unified Welcome Manifesto Modal */}
      <MountOnFirstOpen open={isWelcomeOpen}>
        <WelcomeDashboardModal
          isOpen={isWelcomeOpen}
          onClose={() => setIsWelcomeOpen(false)}
        />
      </MountOnFirstOpen>

      {/* Zero-Knowledge Privacy Vault PIN Lock Screen */}
      <VaultLockScreen
        onUnlocked={handleUnlocked}
        onOpenWelcome={() => setIsWelcomeOpen(true)}
        suspended={isWelcomeOpen}
      />

      {/* Automatic In-App PWA Install Banner */}
      <PWAInstallBanner 
        theme="dark" 
        position="bottom" 
      />
      </div>
    </div>
  );
}

export function App() {
  return (
    <I18nProvider>
      <AppInner />
    </I18nProvider>
  );
}

export default App;
