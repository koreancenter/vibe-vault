import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense, lazy } from 'react';
import { 
  parseFinancialInputDeterministically, 
  parseFinancialText,
  ParsedItem,
  inferCategoryAndMerchant
} from './financialParser';
import { Transaction, TransactionType, SupportedCurrency, FxRates, ParsedReceiptData, LaunchScreenMode, LedgerSpace } from './types';
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
  Globe
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cleanMerchantTitle } from './merchantSanitizer';
import { 
  getAIEngineConfig, 
  getCategoryKo, 
  getPaymentMethodKo,
  DEFAULT_FX_RATES,
  getCurrencySymbol,
  getUserActiveCurrencies,
  convertCurrency
} from './utils';
import { getAllDebts, loadSampleData, ensureCleanSlateIfGuest, getSpaces, createSpace, deleteSpace, DEFAULT_SPACE } from './db';
import { commitAutonomousLoanSplit, commitAutonomousReceivableRecovery } from './autonomousFinance';

// Architectural Domain Custom Hooks
import { useTransactions, LedgerFilterType } from './hooks/useTransactions';
import { useBudgetAnalytics } from './hooks/useBudgetAnalytics';
import { useAutonomousEngine } from './hooks/useAutonomousEngine';

// Extracted Modals and Visual Modules
import { EditTransactionModal } from './components/EditTransactionModal';
import { TransactionActionModal } from './components/TransactionActionModal';
import { SettingsModal } from './components/SettingsModal';
import { InsightsSection } from './components/InsightsSection';
import { ManualCategoryModal } from './components/ManualCategoryModal';
import { FinancialSummaryCard } from './components/FinancialSummaryCard';
import { PWAInstallBanner } from './components/PWAInstallButton';
import { VaultOverviewSection } from './components/VaultOverviewSection';
import { VaultLockScreen } from './components/VaultLockScreen';
import { NewSpaceModal } from './components/NewSpaceModal';
import { OmnibarDock } from './components/OmnibarDock';
import { initAutoLockWatcher, lockVault, isVaultLocked, subscribeVaultLock } from './vaultSecurity';

// Dynamic Code-Split Components (Charts & Heavy Modals)
export const CategoryDonutChart = lazy(() => import('./components/CategoryDonutChart'));
export const MonthlyTrendsChart = lazy(() => import('./components/MonthlyTrendsChart'));
export const YearlyTrendsChart = lazy(() => import('./components/YearlyTrendsChart'));
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

export function App() {
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
  // 2. Global Multi-Currency State & FX Rates
  // ---------------------------------------------------------------------------
  const [currentCurrency, setCurrentCurrency] = useState<SupportedCurrency>('KRW');
  const [fxRates, setFxRates] = useState<FxRates>(DEFAULT_FX_RATES);

  // Load FX rates on mount
  useEffect(() => {
    const loadFxRates = async () => {
      try {
        const res = await fetch('/api/fx-rates');
        if (res.ok) {
          const data = await res.json();
          if (data && data.rates) {
            setFxRates(data);
          }
        }
      } catch (e) {
        console.warn('Failed to fetch FX rates, using local fallback:', e);
      }
    };
    loadFxRates();
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
  // 5. Omnibar, Speech Recognition & UI Interaction States
  // ---------------------------------------------------------------------------
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const handleUnlocked = useCallback(() => {
    setIsVaultLockedState(false);
    loadTransactions();
  }, [loadTransactions]);

  // Ephemeral Guest Mode Startup Check
  useEffect(() => {
    ensureCleanSlateIfGuest().catch(() => {});
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
      const typeStr = t.type === 'EXPENSE' ? '지출' : t.type === 'INCOME' ? '수입' : t.type === 'TRANSFER' ? '이체' : '정산';
      const catStr = getCategoryKo(t.category, t.subCategory);
      const subCat = t.subCategory || '';
      const safeDesc = (t.description || '').replace(/"/g, '""');
      const safeNote = (t.note || '').replace(/"/g, '""');
      const pay = t.paymentMethod || '';
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
        id: crypto.randomUUID(),
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
      const spaceTxs = finalTxs.map(t => ({
        ...t,
        spaceId: t.spaceId || activeSpaceId,
        currency: t.currency || (activeSpace.currency as SupportedCurrency) || currentCurrency
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

  // Voice Input SpeechRecognition Toggle
  const toggleListen = useCallback(() => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = 
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('이 브라우저에서는 음성 인식을 지원하지 않습니다.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setInput(prev => (prev ? `${prev} ${finalTranscript}` : finalTranscript));
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
      if (event.error !== 'no-speech') {
        setError(`음성 인식 오류: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  }, [isListening]);

  // AI Omnibar Ingestion Process
  const handleProcessInput = useCallback(async (customText?: string) => {
    const textToProcess = (customText || input).trim();
    if (!textToProcess || isProcessing) return;

    setIsProcessing(true);
    setError(null);

    try {
      const config = getAIEngineConfig();
      let parsedTransactions: any[] = [];

      if (isOnline) {
        try {
          const response = await fetch('/api/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: textToProcess,
              engineConfig: config
            })
          });

          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data.items) && data.items.length > 0) {
              parsedTransactions = data.items.map((it: any) => ({
                ...it,
                type: it.type ? it.type.toUpperCase() : 'EXPENSE',
                description: it.merchant || it.description || '지출',
              }));
            } else if (Array.isArray(data.transactions) && data.transactions.length > 0) {
              parsedTransactions = data.transactions;
            }
          }
        } catch (fetchErr) {
          console.warn('Network parse failed, using client deterministic engine:', fetchErr);
        }
      }

      const debts = await getAllDebts();

      if (parsedTransactions.length === 0) {
        const debtOrCardResults = parseFinancialInputDeterministically(textToProcess, debts);
        const hasSpecialFlow = debtOrCardResults.some(r => r.loanSplitSuggestion || r.receivableRecoverySuggestion || r.isInternalTransfer || r.type === 'SETTLEMENT');
        
        if (hasSpecialFlow) {
          parsedTransactions = debtOrCardResults;
        } else {
          const items: ParsedItem[] = parseFinancialText(
            textToProcess, 
            (activeSpace.currency as SupportedCurrency) || userPrefs.currencySymbol || 'KRW'
          );
          parsedTransactions = items.map(it => ({
            type: it.type.toUpperCase() as TransactionType,
            amount: it.amount,
            currency: it.currency,
            category: it.category,
            description: it.merchant,
            merchant: it.merchant,
            date: it.date,
            note: it.note
          }));
        }
      }

      if (!Array.isArray(parsedTransactions) || parsedTransactions.length === 0) {
        throw new Error('내역을 정확히 인식하지 못했습니다. 다시 말씀해 주세요.');
      }

      const newTxs: Transaction[] = [];

      for (const t of parsedTransactions) {
        if (t.loanSplitSuggestion) {
          const splitRes = await commitAutonomousLoanSplit(t.loanSplitSuggestion, t.paymentMethod);
          newTxs.push({ ...splitRes.principalTx, spaceId: activeSpaceId });
          if (splitRes.interestTx) {
            newTxs.push({ ...splitRes.interestTx, spaceId: activeSpaceId });
          }
          continue;
        }

        if (t.receivableRecoverySuggestion) {
          const recRes = await commitAutonomousReceivableRecovery(t.receivableRecoverySuggestion, t.paymentMethod);
          newTxs.push({ ...recRes.settlementTx, spaceId: activeSpaceId });
          continue;
        }

        let type: TransactionType = t.type || 'EXPENSE';
        const isIncomeKeyword = /(?:월급|급여|보너스|상여금|수당|용돈|배당금|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|salary|paycheck|bonus|allowance)/i.test(textToProcess) || /(?:월급|급여|보너스|상여금|수당|용돈|배당금|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|salary|paycheck|bonus|allowance)/i.test(t.description || '');
        const isExplicitExpense = /(?:결제|지출|썼|사먹|구입|구매)/i.test(textToProcess);

        if (isIncomeKeyword && !isExplicitExpense && type !== 'TRANSFER' && type !== 'SETTLEMENT') {
          type = 'INCOME';
        }

        let category = 'Living';
        let subCategory = 'General';
        const rawCat = t.category || '';

        if (rawCat.includes('식비') || rawCat === 'Food') {
          category = 'Food';
          subCategory = 'Dining';
        } else if (rawCat.includes('카페') || rawCat.includes('간식')) {
          category = 'Food';
          subCategory = 'Cafe';
        } else if (rawCat.includes('교통') || rawCat === 'Transport') {
          category = 'Transport';
          subCategory = 'Public Transport';
        } else if (rawCat.includes('생활') || rawCat.includes('쇼핑') || rawCat === 'Living') {
          category = 'Living';
          subCategory = 'Shopping';
        } else if (rawCat.includes('의료') || rawCat.includes('건강') || rawCat === 'Health') {
          category = 'Health';
          subCategory = 'Medical';
        } else if (rawCat.includes('문화') || rawCat.includes('여가') || rawCat === 'Leisure') {
          category = 'Leisure';
          subCategory = 'Entertainment';
        } else if (rawCat.includes('주거') || rawCat.includes('통신') || rawCat === 'Fixed') {
          category = 'Fixed';
          subCategory = 'Utilities';
        } else if (rawCat.includes('급여') || rawCat.includes('수입') || type === 'INCOME') {
          category = 'Fixed';
          subCategory = 'Salary';
        } else if (rawCat.includes('이체') || rawCat.includes('저축') || type === 'TRANSFER') {
          category = 'Fixed';
          subCategory = 'Savings';
        } else if (!t.category || t.category === 'Uncategorized' || t.category === '미분류') {
          const inferred = inferCategoryAndMerchant(t.description || textToProcess);
          category = inferred.category;
          subCategory = inferred.subCategory;
        } else {
          category = t.category;
          subCategory = t.subCategory || 'General';
        }

        let desc = (t.description || t.merchant || '').trim();
        desc = desc.replace(/만\s*원\s*들어옴/i, '들어옴')
                   .replace(/^[\s,·\.\-원\d]+(?:\s*원)?\s*/i, '')
                   .replace(/\s+/g, ' ')
                   .trim();
        if (!desc || desc === '원') {
          desc = type === 'INCOME' ? '급여 수입' : '지출 내역';
        }

        newTxs.push({
          id: crypto.randomUUID(),
          type,
          amount: Math.abs(Number(t.amount)) || 0,
          currency: t.currency || (activeSpace.currency as SupportedCurrency) || userPrefs.currencySymbol || 'KRW',
          category,
          subCategory,
          description: desc,
          date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
          paymentMethod: t.paymentMethod || (type === 'INCOME' ? '통장' : '카드'),
          groupId: t.groupId,
          originalTotal: t.originalTotal ? Math.abs(Number(t.originalTotal)) : undefined,
          isInternalTransfer: Boolean(t.isInternalTransfer),
          spaceId: activeSpaceId,
          note: t.note,
        });
      }

      if (userPrefs.autoCategorization === false) {
        setPendingCategorizationTxs(newTxs);
        if (!customText) {
          setInput('');
        }
        return;
      }

      await batchAddTxs(newTxs);
      if (!customText) {
        setInput('');
      }

      const itemSummaries = newTxs.map(tx => {
        let catLabel = tx.category;
        if (catLabel === 'Food') {
          catLabel = tx.subCategory === 'Cafe' ? '카페' : '식비';
        } else if (catLabel === 'Living') {
          catLabel = '생활';
        } else if (catLabel === 'Transport') {
          catLabel = '교통';
        } else if (catLabel === 'Fixed') {
          catLabel = tx.subCategory === 'Salary' ? '급여' : '고정지출';
        } else if (catLabel === 'Health') {
          catLabel = '건강';
        } else if (catLabel === 'Leisure') {
          catLabel = '문화';
        } else if (catLabel.includes('카페') || catLabel.includes('간식')) {
          catLabel = '카페';
        } else if (catLabel.includes('식비')) {
          catLabel = '식비';
        }
        const currPrefix = tx.currency === 'USD' ? '$' : '₩';
        return `${catLabel} ${currPrefix}${tx.amount.toLocaleString()}`;
      }).join(', ');

      showToast(`${newTxs.length}건의 거래가 기록되었습니다 (${itemSummaries})`);

      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : '장부 처리 중 오류가 발생했습니다.';
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  }, [input, isProcessing, isOnline, userPrefs.currencySymbol, userPrefs.autoCategorization, batchAddTxs, activeSpace.currency, activeSpaceId, showToast]);

  return (
    <div className="w-full h-[100dvh] flex justify-center bg-[#07080A] text-neutral-100 overflow-hidden font-sans antialiased">
      <div className="w-full max-w-[440px] h-full bg-[#090A0D] border-x border-white/[0.04] flex flex-col relative shadow-2xl">
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
                <span className="text-xs font-light text-slate-400 tabular-nums">0.1.2</span>
              </h1>
            </div>

            {/* Right action controls */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Quick-Cycle Currency Chip */}
              {isMultiCurrencyMode && (
                <button
                  id="header-currency-chip"
                  type="button"
                  onClick={handleQuickCycleCurrency}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    handleOpenSettingsModal('preferences');
                  }}
                  title={`클릭: 등록된 통화 빠른 순환 (${activeCurrencies.join(' → ')}) · 우클릭: 통화 관리`}
                  className="h-8 px-2.5 rounded-full border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white flex items-center gap-1.5 text-xs transition-all active:scale-95 group cursor-pointer"
                  aria-label="통화 빠른 전환"
                >
                  <Globe size={13} className="text-neutral-400 group-hover:text-sky-400 transition-colors" />
                  <span className="tabular-nums font-medium tracking-tight whitespace-nowrap">{currentCurrency}</span>
                  {activeCurrencies.length > 1 && (
                    <span className="text-[10px] text-neutral-400 font-normal opacity-70 tabular-nums">
                      ({activeCurrencies.length})
                    </span>
                  )}
                </button>
              )}

              {/* Stealth Mode Toggle Button */}
              <button
                id="stealth-mode-toggle-btn"
                type="button"
                onClick={toggleStealthMode}
                title={isStealth ? "스텔스 모드 해제 (금액 표시)" : "스텔스 모드 활성화 (금액 숨김)"}
                aria-label={isStealth ? "스텔스 모드 해제" : "스텔스 모드 활성화"}
                className={`w-8 h-8 rounded-full border transition-all active:scale-95 flex items-center justify-center cursor-pointer ${
                  isStealth
                    ? 'border-indigo-500/40 bg-indigo-500/20 text-indigo-300'
                    : 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white'
                }`}
              >
                {isStealth ? <span className="text-xs">🕶️</span> : <span className="text-xs">👁️</span>}
              </button>

              {/* Settings Gear */}
              <button
                id="settings-gear-btn"
                type="button"
                onClick={() => handleOpenSettingsModal('assets')}
                title="설정"
                className="w-8 h-8 rounded-full border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-all active:scale-95 flex items-center justify-center cursor-pointer"
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
              <span className="text-xs leading-tight">오프라인 상태입니다. 기록된 데이터는 기기에 안전하게 보관됩니다.</span>
            </div>
          )}

          {/* TAB 0: VAULT (자산) */}
          {mainMode === 'vault' && (
            <div className="w-full">
              <VaultOverviewSection
                currentCurrency={currentCurrency}
                fxRates={fxRates}
                stealthMode={isStealth}
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
              <InsightsSection
                transactions={transactions}
                currentCurrency={currentCurrency}
                fxRates={fxRates}
                isStealth={isStealth}
                onOpenThemeSettings={() => handleOpenSettingsModal('preferences')}
                onNavigateToVault={() => setMainMode('vault')}
                onNavigateToLedger={() => setMainMode('ledger')}
              />
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
                    className="text-xs text-slate-400 hover:text-rose-400 font-medium cursor-pointer"
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
                      className={`px-3.5 py-1 rounded-full text-xs font-normal whitespace-nowrap shrink-0 transition-all border cursor-pointer ${
                        ledgerFilter === f
                          ? 'bg-white/[0.1] text-white border-white/20'
                          : 'bg-transparent text-slate-400 hover:text-slate-200 border-white/[0.06]'
                      }`}
                    >
                      {f === 'ALL' ? '전체' : f === 'EXPENSE' ? '지출' : f === 'INCOME' ? '수입' : f === 'TRANSFER' ? '이체' : '정산'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    id="export-csv-btn"
                    type="button"
                    onClick={handleExportSpaceCSV}
                    className="px-3 py-1 rounded-full text-xs font-normal shrink-0 transition-all active:scale-95 border bg-transparent hover:bg-white/[0.04] text-neutral-300 border-white/[0.08] cursor-pointer"
                    title="CSV 내역 내보내기"
                    aria-label="CSV 내역 내보내기"
                  >
                    <span>내보내기</span>
                  </button>
                </div>
              </div>

              {/* Empty State / Recommended Prompts */}
              {currentSpaceTransactions.length === 0 ? (
                <div className="p-6 sm:p-8 rounded-2xl border text-center space-y-4 my-2 transition-all bg-white/[0.03] backdrop-blur-2xl border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white">
                  <h3 className="text-base font-medium tracking-tight text-white">
                    {activeSpace.id !== 'default' 
                      ? `[${activeSpace.name}] 기록된 내역이 없습니다`
                      : '기록된 거래 내역이 없습니다'}
                  </h3>

                  <div className="flex items-center justify-center flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsReceiptModalOpen(true)}
                      className="h-8 px-4 rounded-xl font-semibold text-xs bg-white hover:bg-neutral-200 text-neutral-950 flex items-center justify-center active:scale-95 transition-all shadow-sm cursor-pointer"
                    >
                      <span>영수증 촬영 스캔</span>
                    </button>

                    {activeSpace.id === 'default' && (
                      <button
                        type="button"
                        onClick={handleLoadSampleFromLedger}
                        className="h-8 px-4 rounded-xl font-medium text-xs border flex items-center justify-center active:scale-95 transition-all cursor-pointer bg-white/[0.05] hover:bg-white/10 text-slate-200 border-white/10"
                      >
                        <span>샘플 데이터 로드</span>
                      </button>
                    )}
                  </div>
                  
                  {/* Example prompts */}
                  <div className="pt-3 text-left space-y-1 border-t border-white/[0.05]">
                    <span className="text-[11px] font-medium block px-1 pb-0.5 text-slate-400">
                      자연어 입력 추천 예시 (터치하여 실행):
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
                          className="w-full text-left text-xs py-2 px-2.5 rounded-xl transition-colors flex items-center justify-between group hover:bg-white/[0.04] text-slate-200 cursor-pointer"
                        >
                          <div className="truncate pr-2">
                            <span className="font-medium mr-1.5 text-sky-400">
                              [{prompt.category}]
                            </span>
                            <span className="font-light text-slate-200">{prompt.text}</span>
                          </div>
                          <ChevronRight size={13} className="shrink-0 opacity-40 group-hover:opacity-100 transition-opacity text-slate-400 group-hover:text-sky-400" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : spaceFilteredLedgerTransactions.length === 0 ? (
                <div className="py-12 text-center text-xs space-y-2 text-slate-400">
                  <p className="font-light">
                    선택한 <strong className="font-medium text-white">
                      [{ledgerFilter === 'ALL' ? '전체' : ledgerFilter === 'EXPENSE' ? '지출' : ledgerFilter === 'INCOME' ? '수입' : ledgerFilter === 'TRANSFER' ? '이체' : '정산'}]
                    </strong> 조건의 내역이 없습니다.
                  </p>
                  {ledgerFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setLedgerFilter('ALL')}
                      className="mt-2 px-3.5 py-1.5 rounded-full text-xs font-normal transition-all border bg-transparent hover:bg-white/[0.04] text-slate-200 border-white/[0.08] cursor-pointer"
                    >
                      전체 내역 보기
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {spaceFilteredLedgerTransactions.map((t) => {
                    const isExpense = t.type === 'EXPENSE';
                    const isIncome = t.type === 'INCOME';
                    const isSettlement = t.type === 'SETTLEMENT';
                    const displayTitle = formatTransactionTitle(t.description);
                    const categoryLabel = t.isInternalTransfer
                      ? (t.subCategory || '내부이체/원금상환')
                      : getCategoryKo(t.category, t.subCategory);
                    const currSymbol = getCurrencySymbol(t.currency || currentCurrency);

                    return (
                      <div
                        key={t.id}
                        onClick={() => setSelectedActionTransaction(t)}
                        className="py-3.5 px-1.5 transition-colors cursor-pointer group select-none hover:bg-white/[0.02] active:bg-white/[0.04]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm font-normal leading-snug truncate text-slate-200">
                              {displayTitle}
                            </span>

                            <div className="flex items-center gap-1.5 text-xs font-light mt-0.5 flex-wrap text-slate-400">
                              <span>{categoryLabel}</span>
                              {(t.paymentMethod || t.type === 'INCOME') && (
                                <>
                                  <span className="opacity-30">·</span>
                                  <span>{getPaymentMethodKo(t.paymentMethod, t.type)}</span>
                                </>
                              )}
                              <span className="opacity-30">·</span>
                              <span>{format(parseISO(t.date), 'M.d HH:mm')}</span>
                              {t.note && (
                                <>
                                  <span className="opacity-30">·</span>
                                  <span className="text-amber-400/90 font-medium truncate max-w-[150px]">
                                    📝 {t.note}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end shrink-0 pl-2">
                            <span className={`text-sm font-medium tracking-tight tabular-nums whitespace-nowrap transition-all ${isStealth ? 'blur-sm select-none' : ''} ${
                              t.isInternalTransfer
                                ? 'text-blue-400'
                                : isExpense 
                                  ? 'text-slate-200' 
                                  : isIncome || isSettlement
                                    ? 'text-sky-400'
                                    : 'text-blue-400'
                            }`}>
                              {t.isInternalTransfer ? '⇄ ' : (isExpense ? '-' : '+')}{currSymbol}{t.amount.toLocaleString()}
                            </span>

                            {isMultiCurrencyMode && (() => {
                              const txCurr = (t.currency || currentCurrency).toUpperCase();
                              const baseCurr = currentCurrency.toUpperCase();
                              const secondaryCode = txCurr === baseCurr
                                ? (activeCurrencies.find(c => c.toUpperCase() !== baseCurr) || 'KRW')
                                : baseCurr;

                              if (secondaryCode === txCurr) return null;

                              const convertedSecondary = convertCurrency(t.amount, txCurr, secondaryCode, fxRates);
                              const secSym = getCurrencySymbol(secondaryCode);
                              const isIntSec = secondaryCode === 'KRW' || secondaryCode === 'JPY' || secondaryCode === 'IDR' || secondaryCode === 'VND';
                              const formattedSec = isIntSec
                                ? Math.round(convertedSecondary).toLocaleString()
                                : convertedSecondary.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                              const sign = t.isInternalTransfer ? '⇄ ' : (isExpense ? '-' : '+');

                              return (
                                <span className={`text-[11px] font-light mt-0.5 tabular-nums whitespace-nowrap text-slate-500 ${isStealth ? 'blur-xs select-none' : ''}`}>
                                  ≈ {sign}{secSym}{formattedSec}
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        {isSettlement && (
                          <div className="mt-2 px-2.5 py-1 rounded-full text-xs flex items-center justify-between font-normal bg-sky-500/10 text-sky-300 border border-sky-500/20">
                            <span className="flex items-center gap-1.5">
                              <ArrowLeftRight size={13} /> 더치페이 정산 완료
                            </span>
                            <span className="tabular-nums">+{currSymbol}{t.amount.toLocaleString()} 입금</span>
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
          {mainMode === 'ledger' && (
            <OmnibarDock
              input={input}
              setInput={setInput}
              isProcessing={isProcessing}
              isOnline={isOnline}
              currentCurrency={currentCurrency}
              isMultiCurrencyMode={isMultiCurrencyMode}
              realtimePreview={null}
              engineStatus={engineStatus}
              onSubmit={handleProcessInput}
              onOpenReceiptScanner={handleOpenReceiptModal}
              onCycleCurrency={handleQuickCycleCurrency}
              isListening={isListening}
              onToggleListen={toggleListen}
              error={error}
              onClearError={() => setError(null)}
            />
          )}

          {/* Persistent Bottom Tab Navigation Switcher */}
          <div className={`pt-1.5 flex items-center justify-around ${
            mainMode === 'ledger' ? 'mt-1 border-t border-white/[0.04]' : ''
          }`}>
            <button
              id="bottom-nav-vault-btn"
              type="button"
              onClick={() => setMainMode('vault')}
              aria-label="자산 대시보드로 이동"
              className={`flex-1 py-1.5 flex flex-col items-center gap-0.5 rounded-xl transition-all ${
                mainMode === 'vault'
                  ? 'text-blue-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck size={18} className={mainMode === 'vault' ? 'stroke-[2.5]' : ''} />
              <span className="text-xs">자산</span>
            </button>

            <button
              id="bottom-nav-insights-btn"
              type="button"
              onClick={() => setMainMode('insights')}
              aria-label="인사이트 대시보드로 이동"
              className={`flex-1 py-1.5 flex flex-col items-center gap-0.5 rounded-xl transition-all ${
                mainMode === 'insights'
                  ? 'text-indigo-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles size={18} className={mainMode === 'insights' ? 'stroke-[2.5]' : ''} />
              <span className="text-xs">인사이트</span>
            </button>

            <button
              id="bottom-nav-ledger-btn"
              type="button"
              onClick={() => setMainMode('ledger')}
              aria-label="가계부 장부로 이동"
              className={`flex-1 py-1.5 flex flex-col items-center gap-0.5 rounded-xl transition-all ${
                mainMode === 'ledger'
                  ? 'text-sky-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wallet size={18} className={mainMode === 'ledger' ? 'stroke-[2.5]' : ''} />
              <span className="text-xs">장부</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Transaction Action Modal */}
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

      {/* Edit Transaction Modal */}
      <EditTransactionModal
        isOpen={!!editingTransaction}
        onClose={handleCloseEditModal}
        transaction={editingTransaction}
        onSave={handleUpdateTransaction}
        theme="dark"
      />

      {/* Manual Category Selection Modal */}
      <ManualCategoryModal
        isOpen={pendingCategorizationTxs.length > 0}
        pendingTransactions={pendingCategorizationTxs}
        onConfirm={handleConfirmCategorization}
        onCancel={handleCancelCategorization}
        theme="dark"
        currencySymbol={userPrefs.currencySymbol || '₩'}
      />

      {/* Settings Modal */}
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
          />
        )}
      </Suspense>

      {/* New Project / Event Space Modal */}
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

      {/* Zero-Knowledge Privacy Vault PIN Lock Screen */}
      <VaultLockScreen onUnlocked={handleUnlocked} />

      {/* Automatic In-App PWA Install Banner */}
      <PWAInstallBanner 
        theme="dark" 
        position="bottom" 
      />
      </div>
    </div>
  );
}

export default App;
