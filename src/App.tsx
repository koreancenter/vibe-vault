import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  parseFinancialInputDeterministically, 
  inferCategoryAndMerchant,
  extractRealtimePreview
} from './financialParser';
import { Transaction, SupportedCurrency, FxRates, ParsedReceiptData, LaunchScreenMode, LedgerSpace } from './types';
import { 
  Settings, 
  Mic, 
  MicOff, 
  Edit2, 
  Trash2, 
  Loader2, 
  WifiOff, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ArrowLeftRight, 
  Sparkles,
  ChevronRight,
  ChevronDown,
  Check,
  ShieldCheck,
  Eye,
  EyeOff,
  Download,
  Wallet,
  TrendingDown,
  TrendingUp,
  Receipt,
  Coffee,
  ShoppingBag,
  Car,
  UtensilsCrossed,
  Tag,
  Camera,
  Globe,
  Lock,
  X
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cleanMerchantTitle } from './merchantSanitizer';
import { 
  getAIEngineConfig, 
  getCategoryKo, 
  getPaymentMethodKo,
  DEFAULT_FX_RATES,
  getCurrencySymbol,
  SUPPORTED_CURRENCIES,
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
import { CurrencySelectorModal } from './components/CurrencySelectorModal';
import { ReceiptScannerModal } from './components/ReceiptScannerModal';
import { SubscriptionManagerSection } from './components/SubscriptionManagerSection';
import { PWAInstallButton, PWAInstallBanner } from './components/PWAInstallButton';
import { VaultOverviewSection } from './components/VaultOverviewSection';
import { VaultLockScreen } from './components/VaultLockScreen';
import { NewSpaceModal } from './components/NewSpaceModal';
import { EventSettlementReportModal } from './components/EventSettlementReportModal';
import { initAutoLockWatcher, lockVault, isVaultLocked, subscribeVaultLock } from './vaultSecurity';

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

// Quick Suggestion Chips
const QUICK_CHIPS = [
  { label: '#커피 4,500원', value: '스타벅스 아메리카노 4500원 카드 결제' },
  { label: '#식사 12,000원', value: '점심 순두부찌개 12000원 계좌이체' },
  { label: '#장보기 35,000원', value: '이마트 장보기 35000원 현대카드' },
  { label: '#택시 14,800원', value: '카카오택시 14800원' }
];

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
    count: transactionCount,
    setTransactions,
    selectedCategory,
    setSelectedCategory,
    ledgerFilter,
    setLedgerFilter,
    filteredLedgerTransactions,
    loadTransactions,
    add: addTx,
    batchAdd: batchAddTxs,
    update: updateTx,
    remove: removeTx,
    exportCSV
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
    detectedSubsCount,
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
    totalIncome,
    totalExpense,
    netBalance,
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
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [activeView, setActiveView] = useState<'ledger' | 'insights' | 'subscriptions'>('ledger');
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

  const handleLockVault = useCallback(() => {
    setIsSettingsOpen(false);
    setIsCurrencyModalOpen(false);
    setIsReceiptModalOpen(false);
    setEditingTransaction(null);
    setSelectedActionTransaction(null);
    lockVault();
    setIsVaultLockedState(true);
  }, []);

  const handleUnlocked = useCallback(() => {
    setIsVaultLockedState(false);
    loadTransactions();
  }, [loadTransactions]);

  // Ephemeral Guest Mode Startup Check: wipe any stale un-persisted records if no Master PIN exists
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
  const [isSpacePopoverOpen, setIsSpacePopoverOpen] = useState(false);
  const [isNewSpaceModalOpen, setIsNewSpaceModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const spacePopoverRef = useRef<HTMLDivElement | null>(null);

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

  // Click outside listener for space switcher popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (spacePopoverRef.current && !spacePopoverRef.current.contains(e.target as Node)) {
        setIsSpacePopoverOpen(false);
      }
    };
    if (isSpacePopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSpacePopoverOpen]);

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
  const [isCurrencyModalOpen, setIsCurrencyModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedActionTransaction, setSelectedActionTransaction] = useState<Transaction | null>(null);
  const [pendingCategorizationTxs, setPendingCategorizationTxs] = useState<Transaction[]>([]);

  // Omnibar live preview extraction
  const realtimePreview = useMemo(() => {
    return extractRealtimePreview(input);
  }, [input]);

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

  // Desktop Breakpoint Detector (1024px)
  const [isDesktop, setIsDesktop] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      // Prevent accidental triggering while user is interacting inside horizontal scrollbars, inputs, or buttons
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

    // Displacement |diffX| > 60px and |diffX| > |diffY| * 1.5 (prevents accidental trigger while vertical scrolling)
    if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      const currentIdx = TAB_INDEX_MAP[mainMode] ?? 0;
      if (diffX < -60 && currentIdx < 2) {
        // Swipe Left: advance tab index (0 -> 1 -> 2)
        setMainMode(TAB_ORDER[currentIdx + 1]);
      } else if (diffX > 60 && currentIdx > 0) {
        // Swipe Right: decrease tab index (2 -> 1 -> 0)
        setMainMode(TAB_ORDER[currentIdx - 1]);
      }
    }
  }, [TAB_INDEX_MAP, TAB_ORDER, mainMode]);

  // ---------------------------------------------------------------------------
  // 6. Memoized Action Callbacks (Prevents Unnecessary Child Re-renders)
  // ---------------------------------------------------------------------------
  const handleSelectCurrency = useCallback((newCurrency: SupportedCurrency) => {
    setCurrentCurrency(newCurrency);
    setUserPrefs(prev => {
      const updated = { ...prev, currencySymbol: newCurrency };
      localStorage.setItem('vibe_user_preferences', JSON.stringify(updated));
      return updated;
    });
  }, [setUserPrefs]);

  // Active Currencies for Header Switcher & Progressive Multi-Currency Logic
  const [activeCurrencies, setActiveCurrencies] = useState<string[]>(() => {
    const list = getUserActiveCurrencies();
    return list.length > 0 ? list : ['KRW'];
  });

  // Keep activeCurrencies list synchronized with localStorage
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
  }, [currentCurrency, isCurrencyModalOpen, isSettingsOpen]);

  // Progressive Multi-Currency Logic:
  // Determine isMultiCurrencyMode: userCurrencies.length > 1
  const isMultiCurrencyMode = activeCurrencies.length > 1;

  // Quick-cycle through registered currencies when tapping the header chip
  const handleQuickCycleCurrency = useCallback(() => {
    const stored = getUserActiveCurrencies();
    const list = stored.length > 0 ? stored : [currentCurrency.toUpperCase()];
    const upper = currentCurrency.toUpperCase();
    if (!list.includes(upper)) {
      list.unshift(upper);
    }

    if (list.length <= 1) {
      setIsCurrencyModalOpen(true);
      return;
    }

    const currentIndex = list.indexOf(upper);
    const nextIndex = (currentIndex + 1) % list.length;
    const nextCurrency = list[nextIndex] as SupportedCurrency;
    handleSelectCurrency(nextCurrency);
  }, [currentCurrency, handleSelectCurrency]);

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

  const handleOpenCurrencyModal = useCallback(() => setIsCurrencyModalOpen(true), []);
  const handleCloseCurrencyModal = useCallback(() => setIsCurrencyModalOpen(false), []);

  const handleOpenReceiptModal = useCallback(() => setIsReceiptModalOpen(true), []);
  const handleCloseReceiptModal = useCallback(() => setIsReceiptModalOpen(false), []);

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

  // AI Omnibar Ingestion Process (Tier 1 Local Regex -> Tier 2 Cloud AI -> Tier 3 On-Device)
  const handleProcessInput = useCallback(async (customText?: string) => {
    const textToProcess = (customText || input).trim();
    if (!textToProcess || isProcessing) return;

    setIsProcessing(true);
    setError(null);

    try {
      const config = getAIEngineConfig();
      let parsedTransactions: any[] = [];

      // If online and cloud AI configured, attempt cloud parse
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
            if (Array.isArray(data.transactions) && data.transactions.length > 0) {
              parsedTransactions = data.transactions;
            }
          }
        } catch (fetchErr) {
          console.warn('Network parse failed, using client deterministic engine:', fetchErr);
        }
      }

      const debts = await getAllDebts();

      // If server response was unavailable or empty, use client-side deterministic parser
      if (parsedTransactions.length === 0) {
        parsedTransactions = parseFinancialInputDeterministically(textToProcess, debts);
      }

      if (!Array.isArray(parsedTransactions) || parsedTransactions.length === 0) {
        throw new Error('내역을 정확히 인식하지 못했습니다. 다시 말씀해 주세요.');
      }

      const newTxs: Transaction[] = [];

      for (const t of parsedTransactions) {
        // 1. Autonomous Loan Repayment Split Execution
        if (t.loanSplitSuggestion) {
          const splitRes = await commitAutonomousLoanSplit(t.loanSplitSuggestion, t.paymentMethod);
          newTxs.push({ ...splitRes.principalTx, spaceId: activeSpaceId });
          if (splitRes.interestTx) {
            newTxs.push({ ...splitRes.interestTx, spaceId: activeSpaceId });
          }
          continue;
        }

        // 2. Autonomous Receivable Recovery Execution
        if (t.receivableRecoverySuggestion) {
          const recRes = await commitAutonomousReceivableRecovery(t.receivableRecoverySuggestion, t.paymentMethod);
          newTxs.push({ ...recRes.settlementTx, spaceId: activeSpaceId });
          continue;
        }

        // 3. Standard Expense / Income / Settlement Transaction
        let type = t.type || 'EXPENSE';
        const isIncomeKeyword = /(?:월급|급여|보너스|상여금|수당|용돈|배당금|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|salary|paycheck|bonus|allowance)/i.test(textToProcess) || /(?:월급|급여|보너스|상여금|수당|용돈|배당금|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|salary|paycheck|bonus|allowance)/i.test(t.description || '');
        const isExplicitExpense = /(?:결제|지출|썼|사먹|구입|구매)/i.test(textToProcess);

        if (isIncomeKeyword && !isExplicitExpense && type !== 'TRANSFER' && type !== 'SETTLEMENT') {
          type = 'INCOME';
        }

        let category = t.category;
        let subCategory = t.subCategory;

        if (type === 'INCOME') {
          category = 'Fixed';
          if (!subCategory || subCategory === 'General') {
            subCategory = 'Salary';
          }
        } else if (!category || category === 'Uncategorized' || category === '미분류') {
          const inferred = inferCategoryAndMerchant(t.description || textToProcess);
          category = inferred.category;
          subCategory = inferred.subCategory;
        }

        let desc = (t.description || '').trim();
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
          category: category || (type === 'INCOME' ? 'Fixed' : 'Living'),
          subCategory: subCategory || (type === 'INCOME' ? 'Salary' : 'General'),
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

      // When Smart Auto-Categorization is disabled, the user manually selects a category
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

      // Smooth scroll to top
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
  }, [input, isProcessing, isOnline, userPrefs.currencySymbol, userPrefs.autoCategorization, batchAddTxs]);

  // Visual Theme & Icon Helpers
  const currSymbol = getCurrencySymbol(currentCurrency);
  const isLight = false;
  const now = new Date();

  const getCategoryIcon = (category: string) => {
    const cat = category.toLowerCase();
    if (cat.includes('food') || cat.includes('dining') || cat.includes('식사') || cat.includes('카페') || cat.includes('외식')) {
      return <UtensilsCrossed size={16} className="text-[#00F5A0]" />;
    }
    if (cat.includes('coffee') || cat.includes('cafe') || cat.includes('커피')) {
      return <Coffee size={16} className="text-amber-400" />;
    }
    if (cat.includes('shopping') || cat.includes('living') || cat.includes('쇼핑') || cat.includes('생활')) {
      return <ShoppingBag size={16} className="text-purple-400" />;
    }
    if (cat.includes('transport') || cat.includes('taxi') || cat.includes('교통') || cat.includes('택시')) {
      return <Car size={16} className="text-cyan-400" />;
    }
    return <Receipt size={16} className="text-[#6366F1]" />;
  };

  return (
    <div className={`h-[100dvh] w-full flex flex-col font-sans antialiased relative overflow-hidden transition-colors duration-200 ${
      isLight ? 'bg-[#F8FAFC] text-slate-900 shadow-slate-300/40' : 'bg-gradient-to-b from-[#0B0F17] via-[#0D1424] to-[#111827] text-slate-100'
    }`}>
      {/* Sleek ambient background lighting */}
      {!isLight && (
        <>
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 bg-[#00F5A0]/10 rounded-full blur-[110px] pointer-events-none" />
          <div className="absolute top-1/3 -right-24 w-72 h-72 bg-[#6366F1]/10 rounded-full blur-[100px] pointer-events-none" />
        </>
      )}

      {/* 1. TOP HEADER */}
      <header className={`flex-none h-16 border-b backdrop-blur-xl z-20 transition-colors ${
        isLight ? 'bg-white/90 border-slate-200 text-slate-900' : 'bg-[#0B0F17]/80 border-white/5 text-white'
      }`}>
        <div className="w-full max-w-md lg:max-w-7xl mx-auto h-full px-4 lg:px-8 flex items-center justify-between transition-all duration-300">
          {/* Left: Brand & Mode Subtitle */}
        <div className="flex items-center min-w-0">
          <div className="flex flex-col truncate">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${
                mainMode === 'vault' ? 'bg-blue-500' : mainMode === 'insights' ? 'bg-indigo-400' : 'bg-emerald-400'
              } animate-pulse`} />
              <h1 className={`text-base font-extrabold tracking-tight truncate ${
                isLight ? 'text-slate-950' : 'text-white'
              }`}>
                Vibe Vault
              </h1>
            </div>
            {mainMode === 'ledger' ? (
              <div className="relative inline-block mt-0.5" ref={spacePopoverRef}>
                <button
                  id="space-switcher-btn"
                  type="button"
                  onClick={() => setIsSpacePopoverOpen(prev => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all active:scale-95 ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300/80 shadow-xs'
                      : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border-white/[0.12] shadow-sm backdrop-blur-md'
                  }`}
                  title="장부 공간 전환 (일상 장부 / 프로젝트·행사 장부)"
                  aria-label="장부 공간 전환"
                >
                  <span className="text-[#00F5A0] text-xs">✦</span>
                  <span className="max-w-[130px] sm:max-w-[180px] truncate font-semibold">{activeSpace.name}</span>
                  <ChevronDown size={12} className={`transition-transform opacity-70 ${isSpacePopoverOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Glassmorphic Popover Dropdown */}
                {isSpacePopoverOpen && (
                  <div 
                    className={`absolute left-0 top-full mt-2 w-72 rounded-2xl border shadow-2xl z-50 p-2 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl ${
                      isLight
                        ? 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-300/60'
                        : 'bg-[#0E1524]/95 border-white/10 text-white shadow-2xl'
                    }`}
                  >
                    <div className="px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-400 font-medium border-b border-white/5 pb-2 mb-1">
                      <span>장부 공간 선택</span>
                      <span className="tabular-nums">{spaces.length}개</span>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {spaces.map((sp) => {
                        const isCurrent = sp.id === activeSpaceId;
                        return (
                          <div
                            key={sp.id}
                            className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer group ${
                              isCurrent
                                ? isLight
                                  ? 'bg-emerald-50 text-emerald-950 font-semibold border border-emerald-200'
                                  : 'bg-[#00F5A0]/10 text-white font-semibold border border-[#00F5A0]/30'
                                : isLight
                                  ? 'hover:bg-slate-100 text-slate-700'
                                  : 'hover:bg-white/[0.05] text-slate-300'
                            }`}
                            onClick={() => {
                              handleSelectSpace(sp);
                              setIsSpacePopoverOpen(false);
                            }}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {isCurrent ? (
                                <Check size={14} className="text-[#00F5A0] shrink-0" />
                              ) : (
                                <span className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
                              )}
                              <div className="truncate flex-1">
                                <div className="truncate font-medium">{sp.name}</div>
                                <div className="text-[10px] text-slate-400 font-normal flex items-center gap-1.5">
                                  <span>{sp.currency}</span>
                                  {sp.memberCount && <span>· {sp.memberCount}명 정산</span>}
                                  {sp.id === 'default' && <span className="opacity-70">(기본)</span>}
                                </div>
                              </div>
                            </div>

                            {sp.id !== 'default' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSpace(sp.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-all shrink-0 ml-1"
                                title="장부 삭제"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Action Button: [+ 새 프로젝트/행사 장부 만들기] */}
                    <div className="pt-2 mt-1 border-t border-white/5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsSpacePopoverOpen(false);
                          setIsNewSpaceModalOpen(true);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold bg-gradient-to-r from-[#00F5A0] to-[#00D9A5] hover:opacity-95 text-[#0B0F17] active:scale-95 transition-all shadow-sm shadow-[#00F5A0]/20"
                      >
                        <span>+ 새 프로젝트/행사 장부 만들기</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <span className={`text-xs font-medium truncate ${
                isLight ? 'text-slate-500' : 'text-[#94A3B8]'
              }`}>
                {mainMode === 'vault' 
                  ? '프라이빗 자산 금고 & 포트폴리오' 
                  : '통합 자산 & 소비 인사이트'}
              </span>
            )}
          </div>
        </div>

          {/* Center: Desktop Segmented Tab Controls (hidden on mobile, visible on lg) */}
          <nav className="hidden lg:flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-md">
            <button
              id="desktop-nav-vault-btn"
              type="button"
              onClick={() => setMainMode('vault')}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                mainMode === 'vault'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'bg-white/10 text-white shadow-sm font-semibold'
                  : isLight
                    ? 'text-slate-500 hover:text-slate-900'
                    : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck size={14} className={mainMode === 'vault' ? 'text-blue-400' : ''} />
              <span>자산 (Vault)</span>
            </button>
            <button
              id="desktop-nav-insights-btn"
              type="button"
              onClick={() => setMainMode('insights')}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                mainMode === 'insights'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'bg-white/10 text-white shadow-sm font-semibold'
                  : isLight
                    ? 'text-slate-500 hover:text-slate-900'
                    : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles size={14} className={mainMode === 'insights' ? 'text-indigo-400' : ''} />
              <span>인사이트 (Insights)</span>
            </button>
            <button
              id="desktop-nav-ledger-btn"
              type="button"
              onClick={() => setMainMode('ledger')}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                mainMode === 'ledger'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'bg-white/10 text-white shadow-sm font-semibold'
                  : isLight
                    ? 'text-slate-500 hover:text-slate-900'
                    : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wallet size={14} className={mainMode === 'ledger' ? 'text-emerald-400' : ''} />
              <span>장부 (Ledger)</span>
            </button>
          </nav>

          {/* Right action controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Quick-Cycle Currency Chip: [ 🌐 IDR ] - Progressive multi-currency mode only */}
            {isMultiCurrencyMode && (
              <button
                id="header-currency-chip"
                type="button"
                onClick={handleQuickCycleCurrency}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setIsCurrencyModalOpen(true);
                }}
                title={`클릭: 등록된 통화 빠른 순환 (${activeCurrencies.join(' → ')}) · 우클릭: 통화 관리`}
                className={`h-8 px-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-medium transition-all active:scale-95 group ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    : 'bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border-white/[0.08] hover:border-white/20'
                }`}
                aria-label="통화 빠른 전환"
              >
                <Globe size={13} className="text-slate-400 group-hover:text-emerald-400 transition-colors" />
                <span className="tabular-nums font-semibold tracking-tight whitespace-nowrap">{currentCurrency}</span>
                {activeCurrencies.length > 1 && (
                  <span className="text-[10px] text-slate-400 font-normal opacity-60 tabular-nums">
                    ({activeCurrencies.length})
                  </span>
                )}
              </button>
            )}

            {/* Stealth Mode Toggle */}
            <button
              type="button"
              onClick={toggleStealthMode}
              title={isStealth ? '금액 보이기' : '금액 숨기기 (스텔스 모드)'}
              className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-95 ${
                isStealth 
                  ? isLight 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : 'bg-[#00F5A0]/20 text-[#00F5A0]'
                  : isLight
                    ? 'bg-slate-100 text-slate-600 hover:text-slate-950 hover:bg-slate-200'
                    : 'bg-white/[0.06] text-[#94A3B8] hover:text-white hover:bg-white/10'
              }`}
            >
              {isStealth ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>

            {/* Dedicated Lock Vault / Logout Button */}
            <button
              id="quick-vault-lock-btn"
              type="button"
              onClick={handleLockVault}
              title="금고 잠그기 (로그아웃)"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors border border-transparent hover:border-white/[0.06] active:scale-95 flex items-center justify-center"
              aria-label="금고 잠그기 (로그아웃)"
            >
              <Lock size={15} />
            </button>

            {/* Settings Gear */}
            <button
              id="settings-gear-btn"
              type="button"
              onClick={() => handleOpenSettingsModal('assets')}
              className={`w-8 h-8 flex items-center justify-center rounded-xl active:scale-95 transition-all ${
                isLight
                  ? 'bg-slate-100 text-slate-600 hover:text-slate-950 hover:bg-slate-200'
                  : 'bg-white/[0.06] text-[#94A3B8] hover:text-white hover:bg-white/10'
              }`}
              aria-label="설정"
            >
              <Settings size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* 2. SCROLLABLE MIDDLE VIEWPORT WITH MOBILE SWIPE CAROUSEL & DESKTOP 2-COLUMN DASHBOARD */}
      <main 
        ref={scrollContainerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`flex-1 w-full max-w-md lg:max-w-7xl mx-auto px-4 lg:px-8 overflow-hidden relative flex flex-col transition-all duration-300 ${
          isVaultLockedState ? 'filter blur-xl opacity-20 pointer-events-none select-none' : ''
        }`}
      >
        {/* Offline Warning Banner */}
        {!isOnline && (
          <div className="rounded-2xl bg-amber-500/10 p-3.5 flex items-center gap-2.5 text-amber-500 text-xs">
            <WifiOff size={16} className="shrink-0" />
            <span className="text-xs leading-tight">오프라인 상태입니다. 기록된 데이터는 기기에 안전하게 보관됩니다.</span>
          </div>
        )}

        {/* Swipeable Carousel Track on Mobile / Direct Active View on Desktop */}
        <div 
          className="flex flex-1 h-full w-[300%] lg:w-full transition-transform duration-200 ease-out"
          style={isDesktop ? undefined : { transform: `translateX(-${currentTabIndex * (100 / 3)}%)` }}
        >
          {/* TAB 0: VAULT (자산) */}
          <div className={`w-1/3 lg:w-full h-full overflow-y-auto py-4 scrollbar-none transition-all ${
            isDesktop && mainMode !== 'vault' ? 'hidden' : 'block'
          }`}>
            <VaultOverviewSection
              currentCurrency={currentCurrency}
              fxRates={fxRates}
              stealthMode={isStealth}
              theme={userPrefs.theme || 'dark'}
              onTransactionAdded={() => loadTransactions()}
              isMultiCurrencyMode={isMultiCurrencyMode}
            />
          </div>

          {/* TAB 1: INSIGHTS (인사이트) */}
          <div className={`w-1/3 lg:w-full h-full overflow-y-auto py-4 scrollbar-none transition-all ${
            isDesktop && mainMode !== 'insights' ? 'hidden' : 'block'
          }`}>
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

          {/* TAB 2: LEDGER (장부) */}
          <div className={`w-1/3 lg:w-full h-full overflow-y-auto py-4 scrollbar-none transition-all ${
            isDesktop && mainMode !== 'ledger' ? 'hidden' : 'block'
          }`}>
            {/* Desktop 2-Column Responsive Dashboard for Ledger */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start pb-8">
              {/* Left Column (lg:col-span-5): Financial Summary Card & Event Budget / Actions */}
              <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-0">
                {/* FINANCIAL SUMMARY HERO CARD */}
                <FinancialSummaryCard
                  transactions={currentSpaceTransactions}
                  currencySymbol={activeSpace.currency || currentCurrency}
                  fxRates={fxRates}
                  isStealth={isStealth}
                  theme={userPrefs.theme || 'dark'}
                  isMultiCurrencyMode={isMultiCurrencyMode}
                  secondaryCurrency={activeCurrencies.find(c => c.toUpperCase() !== (activeSpace.currency || currentCurrency).toUpperCase())}
                />

                {/* In Event Ledger mode: Event Budget Summary & Korean Settlement Action Button */}
                {activeSpace.id !== 'default' && (
                  <div className="p-5 rounded-2xl border backdrop-blur-xl bg-white/[0.025] border-white/[0.06] space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                        <span>✦</span> 프로젝트·행사 정산 관리
                      </span>
                      <span className="text-xs text-slate-400 font-light tabular-nums">
                        {activeSpace.memberCount ? `${activeSpace.memberCount}명 정산` : '참여자 미지정'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 font-light leading-relaxed">
                      공동 회비 및 지출 영수증을 취합하여 대한민국 표준 정산 내역서(모임/행사/워크숍)를 생성합니다.
                    </p>
                    <button
                      id="event-settlement-report-desktop-btn"
                      type="button"
                      onClick={() => setIsReportModalOpen(true)}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 text-slate-950 flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md shadow-emerald-500/20"
                    >
                      <span>📄</span>
                      <span>공식 결산서 출력 / PDF</span>
                    </button>
                  </div>
                )}

                {/* Desktop Guidance & Quick Suggestions */}
                <div className="hidden lg:block p-4 rounded-2xl border bg-white/[0.015] border-white/[0.05]">
                  <span className="text-xs font-medium text-slate-400 block mb-2.5">
                    💡 빠른 자연어 입력 추천
                  </span>
                  <div className="space-y-1.5">
                    {(activeSpace.id !== 'default' ? [
                      { text: `회비 5만원 전원 통장 입금`, category: '회비 수입' },
                      { text: '단체 저녁 식사 및 음료비 18만원 카드 결제', category: '단체 식비' },
                      { text: '입장료 및 대관료 30만원 계좌이체', category: '대관/입장료' },
                      { text: '이동 대형버스 대절 45만원 결제', category: '교통비' }
                    ] : [
                      { text: '스타벅스 아메리카노 4500원 카드 결제', category: '식비' },
                      { text: '민수랑 점심 3만원 더치페이하고 15000원 송금받음', category: '더치페이' },
                      { text: '이번 달 월급 350만원 통장 입금', category: '급여' },
                      { text: '카카오택시 14800원', category: '교통' }
                    ]).map((prompt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleProcessInput(prompt.text)}
                        className="w-full text-left text-xs py-2 px-2.5 rounded-xl hover:bg-white/[0.04] text-slate-300 flex items-center justify-between transition-colors group"
                      >
                        <span className="truncate pr-2">
                          <span className="text-emerald-400 font-medium mr-1.5">[{prompt.category}]</span>
                          {prompt.text}
                        </span>
                        <ChevronRight size={12} className="opacity-40 group-hover:opacity-100 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column (lg:col-span-7): Transaction Feed */}
              <div className="lg:col-span-7 space-y-3">
            {/* Category Filter Status Pill (if filtered by category from pie chart or insights) */}
            {selectedCategory && (
              <div className="flex items-center justify-between px-2 text-xs text-[#94A3B8]">
                <span>카테고리 필터링: <strong className="text-[#00F5A0] font-semibold">{getCategoryKo(selectedCategory)}</strong></span>
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="text-xs text-slate-400 hover:text-rose-400 font-medium"
                >
                  필터 해제
                </button>
              </div>
            )}

            {/* Filter Pills & Actions (Event Settlement Report & CSV Export) */}
            <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                {(['ALL', 'EXPENSE', 'INCOME', 'TRANSFER', 'SETTLEMENT'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setLedgerFilter(f as LedgerFilterType)}
                    className={`px-3 py-1.5 rounded-full text-xs shrink-0 transition-all ${
                      ledgerFilter === f
                        ? isLight
                          ? 'bg-slate-900 text-white font-medium shadow-xs'
                          : 'bg-white/10 text-white font-medium border border-white/20'
                        : isLight
                          ? 'bg-transparent text-slate-500 hover:text-slate-800 border border-slate-200/80 font-normal'
                          : 'bg-transparent text-slate-400 hover:text-slate-200 border border-white/[0.06] font-normal'
                    }`}
                  >
                    {f === 'ALL' ? '전체' : f === 'EXPENSE' ? '지출' : f === 'INCOME' ? '수입' : f === 'TRANSFER' ? '이체' : '정산'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* When an event space is active, display the action button */}
                {activeSpace.id !== 'default' && (
                  <button
                    id="event-settlement-report-btn"
                    type="button"
                    onClick={() => setIsReportModalOpen(true)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all active:scale-95 shadow-xs ${
                      isLight
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600'
                        : 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-500/30'
                    }`}
                    title="공식 결산서 출력 / PDF"
                  >
                    <span className="text-xs">📄</span>
                    <span>공식 결산서 출력 / PDF</span>
                  </button>
                )}

                <button
                  id="export-csv-btn"
                  type="button"
                  onClick={handleExportSpaceCSV}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-normal shrink-0 transition-all active:scale-95 border ${
                    isLight 
                      ? 'bg-transparent hover:bg-slate-100 text-slate-700 border-slate-200/80' 
                      : 'bg-transparent hover:bg-white/[0.04] text-slate-300 border-white/[0.08]'
                  }`}
                  title="CSV 내역 다운로드"
                >
                  <Download size={13} className={isLight ? 'text-emerald-600' : 'text-emerald-400'} />
                  <span>CSV</span>
                </button>
              </div>
            </div>

            {/* Empty State / Recommended Prompts */}
            {currentSpaceTransactions.length === 0 ? (
              <div className={`p-6 sm:p-8 rounded-2xl border text-center space-y-4 my-2 transition-all ${
                isLight 
                  ? 'bg-slate-50/80 border-slate-200/80 text-slate-800' 
                  : 'bg-white/[0.02] border-white/[0.06] text-white'
              }`}>
                <div className="relative mx-auto w-12 h-12 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-2xl bg-emerald-500/20 blur-xl animate-pulse" />
                  <div className="relative w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Receipt size={24} />
                  </div>
                </div>

                <div className="space-y-1 max-w-sm mx-auto">
                  <h3 className={`text-base font-normal tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {activeSpace.id !== 'default' 
                      ? `[${activeSpace.name}] 기록된 내역이 없습니다`
                      : '기록된 거래 내역이 없습니다 (₩0)'}
                  </h3>
                  <p className={`text-xs font-light leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {activeSpace.id !== 'default'
                      ? '회비 입금, 단체 식사, 교통비, 입장료 등을 자연어로 입력하거나 영수증을 찍어 기록해보세요.'
                      : '하단 자연어 입력창에 평소처럼 적거나, 영수증 사진을 찍어 즉시 기록해보세요.'}
                  </p>
                </div>

                <div className="flex items-center justify-center flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsReceiptModalOpen(true)}
                    className="h-8 px-3.5 rounded-xl font-medium text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
                  >
                    <Camera size={13} />
                    <span>영수증 촬영 스캔</span>
                  </button>

                  {activeSpace.id === 'default' && (
                    <button
                      type="button"
                      onClick={handleLoadSampleFromLedger}
                      className={`h-8 px-3.5 rounded-xl font-medium text-xs border flex items-center gap-1.5 active:scale-95 transition-all ${
                        isLight 
                          ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200' 
                          : 'bg-white/[0.05] hover:bg-white/10 text-slate-200 border-white/10'
                      }`}
                    >
                      <Sparkles size={13} className="text-amber-400" />
                      <span>샘플 데이터 로드</span>
                    </button>
                  )}
                </div>
                
                {/* Example prompts */}
                <div className="pt-3 text-left space-y-1 border-t border-white/[0.05]">
                  <span className={`text-[11px] font-medium block px-1 pb-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
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
                        className={`w-full text-left text-xs py-2 px-2.5 rounded-xl transition-colors flex items-center justify-between group ${
                          isLight 
                            ? 'hover:bg-slate-200/70 text-slate-800' 
                            : 'hover:bg-white/[0.04] text-slate-200'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <span className={`font-medium mr-1.5 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                            [{prompt.category}]
                          </span>
                          <span className={`font-light ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{prompt.text}</span>
                        </div>
                        <ChevronRight size={13} className={`shrink-0 opacity-40 group-hover:opacity-100 transition-opacity ${isLight ? 'text-slate-400 group-hover:text-emerald-600' : 'text-slate-400 group-hover:text-emerald-400'}`} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : spaceFilteredLedgerTransactions.length === 0 ? (
              <div className={`py-12 text-center text-xs space-y-2 ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}>
                <p className="font-light">
                  선택한 <strong className={`font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    [{ledgerFilter === 'ALL' ? '전체' : ledgerFilter === 'EXPENSE' ? '지출' : ledgerFilter === 'INCOME' ? '수입' : ledgerFilter === 'TRANSFER' ? '이체' : '정산'}]
                  </strong> 조건의 내역이 없습니다.
                </p>
                {ledgerFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('ALL')}
                    className={`mt-2 px-3.5 py-1.5 rounded-full text-xs font-normal transition-all border ${
                      isLight 
                        ? 'bg-transparent hover:bg-slate-100 text-slate-800 border-slate-200/80' 
                        : 'bg-transparent hover:bg-white/[0.04] text-slate-200 border-white/[0.08]'
                    }`}
                  >
                    전체 내역 보기
                  </button>
                )}
              </div>
            ) : (
              <div className={isLight ? 'divide-y divide-slate-100' : 'divide-y divide-white/[0.04]'}>
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
                      className={`py-3.5 px-1.5 transition-colors cursor-pointer group select-none ${
                        isLight 
                          ? 'hover:bg-slate-100/60 active:bg-slate-200/50' 
                          : 'hover:bg-white/[0.02] active:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Left: Merchant / Description Title & Clean Metadata */}
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className={`text-sm font-normal leading-snug truncate ${
                            isLight ? 'text-slate-800' : 'text-slate-200'
                          }`}>
                            {displayTitle}
                          </span>

                          <div className={`flex items-center gap-1.5 text-xs font-light mt-0.5 flex-wrap ${
                            isLight ? 'text-slate-500' : 'text-slate-400'
                          }`}>
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

                        {/* Right: Amount */}
                        <div className="flex flex-col items-end shrink-0 pl-2">
                          <span className={`text-sm font-medium tracking-tight tabular-nums whitespace-nowrap transition-all ${isStealth ? 'blur-sm select-none' : ''} ${
                            t.isInternalTransfer
                              ? isLight ? 'text-blue-600' : 'text-blue-400'
                              : isExpense 
                                ? isLight ? 'text-slate-900' : 'text-slate-200' 
                                : isIncome || isSettlement
                                  ? isLight ? 'text-emerald-600' : 'text-emerald-400'
                                  : isLight ? 'text-blue-600' : 'text-blue-400'
                          }`}>
                            {t.isInternalTransfer ? '⇄ ' : (isExpense ? '-' : '+')}{currSymbol}{t.amount.toLocaleString()}
                          </span>

                          {/* Progressive Multi-Currency Secondary Comparison */}
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
                              <span className={`text-[11px] font-light mt-0.5 tabular-nums whitespace-nowrap ${isLight ? 'text-slate-400' : 'text-slate-500'} ${isStealth ? 'blur-xs select-none' : ''}`}>
                                ≈ {sign}{secSym}{formattedSec}
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Dutch-Pay Settlement Pill */}
                      {isSettlement && (
                        <div className={`mt-2 px-2.5 py-1 rounded-full text-xs flex items-center justify-between font-normal ${
                          isLight 
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
                            : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                        }`}>
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
            </div>
          </div>
        </div>
      </main>

      {/* 3. FIXED BOTTOM DOCK (AI Omnibar & Mic/Camera Controls) */}
      <footer className={`flex-none backdrop-blur-xl py-2 z-20 transition-colors border-t ${
        isLight 
          ? 'bg-white/95 border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]' 
          : 'bg-[#0B0F17]/95 border-white/5 shadow-[0_-4px_20px_rgba(0,0,0,0.4)]'
      }`}>
        <div className="w-full max-w-md lg:max-w-7xl mx-auto px-4 lg:px-8 transition-all duration-300">
        {mainMode === 'ledger' ? (
          <>
            {/* Error notification */}
        {error && (
          <div className="mb-2 text-xs text-rose-500 bg-rose-500/10 rounded-xl px-3 py-1.5 flex items-center justify-between">
            <span className="truncate">{error}</span>
            <button 
              type="button" 
              onClick={() => setError(null)} 
              className="text-rose-500 hover:text-rose-700 ml-1 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Real-time Extraction Preview Chips */}
        {realtimePreview && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1.5 animate-in fade-in duration-150">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
              isLight ? 'bg-slate-200 text-slate-700' : 'bg-white/10 text-slate-300'
            }`}>
              실시간 분석
            </span>

            {/* Merchant Chip */}
            {realtimePreview.merchant && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full shrink-0 ${
                isLight 
                  ? 'bg-blue-50 text-blue-800' 
                  : 'bg-blue-500/15 text-blue-300'
              }`}>
                <span>가맹점:</span>
                <strong className="font-bold">{realtimePreview.merchant}</strong>
              </span>
            )}

            {/* Amount Chip */}
            {realtimePreview.amount !== undefined && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${
                isLight 
                  ? 'bg-emerald-50 text-emerald-800' 
                  : 'bg-[#00F5A0]/15 text-[#00F5A0]'
              }`}>
                <span>금액:</span>
                <strong>{getCurrencySymbol(realtimePreview.currency)}{realtimePreview.amount.toLocaleString()}</strong>
              </span>
            )}

            {/* Category Chip */}
            {realtimePreview.category && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full shrink-0 ${
                isLight 
                  ? 'bg-purple-50 text-purple-800' 
                  : 'bg-purple-500/15 text-purple-300'
              }`}>
                <span>분류:</span>
                <strong>{getCategoryKo(realtimePreview.category)}</strong>
              </span>
            )}

            {/* Dutch Pay Tag */}
            {realtimePreview.isDutch && (
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0 ${
                isLight 
                  ? 'bg-amber-50 text-amber-800' 
                  : 'bg-amber-500/15 text-amber-300'
              }`}>
                정산/더치페이
              </span>
            )}
          </div>
        )}

        {/* Quick Tag Chips Row: displayed when input field is focused */}
        {isInputFocused && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150">
            {QUICK_CHIPS.map(chip => (
              <button
                key={chip.label}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setInput(chip.value);
                }}
                className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs transition-colors ${
                  isLight 
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' 
                    : 'bg-white/[0.06] hover:bg-white/10 active:bg-white/15 text-slate-300'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {/* Modern AI Search Bar */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleProcessInput();
          }}
          className={`relative rounded-2xl p-[1px] transition-all duration-200 ${
            isInputFocused 
              ? isLight
                ? 'bg-gradient-to-r from-emerald-500 via-indigo-500 to-emerald-500 shadow-md'
                : 'bg-gradient-to-r from-[#00F5A0] via-[#6366F1] to-[#00F5A0] shadow-[0_0_20px_rgba(0,245,160,0.2)]' 
              : isLight
                ? 'bg-slate-200'
                : 'bg-white/10'
          }`}
        >
          <div className={`flex items-center gap-1.5 rounded-[15px] px-2.5 py-1 transition-colors ${
            isLight ? 'bg-slate-50' : 'bg-[#0E1526]'
          }`}>
            {/* Camera / Receipt Scanner Trigger */}
            <button
              id="omnibar-receipt-scanner-btn"
              type="button"
              onClick={handleOpenReceiptModal}
              title="영수증 AI 스캔"
              className={`w-8 h-8 min-w-[32px] rounded-xl flex items-center justify-center transition-all ${
                isLight
                  ? 'text-slate-500 hover:text-emerald-700 hover:bg-slate-200/70 active:scale-95'
                  : 'text-[#94A3B8] hover:text-[#00F5A0] hover:bg-white/5 active:scale-95'
              }`}
            >
              <Camera size={16} />
            </button>

            {/* Mic button */}
            <button
              id="voice-stt-btn"
              type="button"
              onClick={toggleListen}
              aria-label="음성으로 입력하기"
              className={`w-8 h-8 min-w-[32px] rounded-xl flex items-center justify-center transition-all ${
                isListening
                  ? 'bg-rose-500/20 text-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)] animate-pulse'
                  : isLight
                    ? 'text-slate-500 hover:text-emerald-700 hover:bg-slate-200/70 active:scale-95'
                    : 'text-[#94A3B8] hover:text-[#00F5A0] hover:bg-white/5 active:scale-95'
              }`}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>

            {/* Currency Pill inside Omnibar: only shown in multi-currency mode */}
            {isMultiCurrencyMode && (
              <button
                id="omnibar-currency-badge"
                type="button"
                onClick={handleOpenCurrencyModal}
                title="클릭하여 통화 변경"
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold shrink-0 transition-all ${
                  isLight
                    ? 'bg-slate-200/70 hover:bg-slate-300 text-slate-800'
                    : 'bg-white/[0.06] hover:bg-white/10 text-white'
                }`}
              >
                {currentCurrency}
              </button>
            )}

            {/* Input field */}
            <input
              id="instant-ingest-input"
              type="text"
              value={input}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              onChange={(e) => setInput(e.target.value)}
              placeholder="예: 파스타 4만원 또는 $15 Starbucks"
              className={`w-full bg-transparent text-xs sm:text-sm outline-none transition-colors ${
                isLight ? 'text-slate-950 placeholder:text-slate-400' : 'text-white placeholder:text-[#94A3B8]/60'
              }`}
            />

            {/* AI Status Readiness Indicator inside Omnibar */}
            <div 
              className="flex items-center gap-1 shrink-0 px-1"
              title={`AI 상태: ${engineStatus} (기기 내 안전 보관)`}
            >
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 ${isLight ? 'bg-emerald-600' : 'bg-emerald-400'}`} />
              <span className={`hidden md:inline text-[10px] font-normal max-w-[90px] truncate ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                {engineStatus.split(' ')[0]}
              </span>
            </div>

            {/* Clear button if text exists */}
            {input && (
              <button
                type="button"
                onClick={() => setInput('')}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X size={13} />
              </button>
            )}

            {/* Submit Action Button */}
            <button
              id="parse-submit-btn"
              type="submit"
              disabled={isProcessing || !input.trim() || !isOnline}
              className="h-8 px-3 rounded-full bg-emerald-400 hover:bg-emerald-300 active:scale-95 text-slate-950 font-medium text-xs transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-1 shadow-sm shrink-0"
            >
              {isProcessing ? (
                <Loader2 size={14} className="animate-spin text-slate-950" />
              ) : (
                <>
                  <Sparkles size={12} />
                  <span>기록</span>
                </>
              )}
            </button>
          </div>
        </form>
          </>
        ) : null}

        {/* Persistent Bottom Tab Navigation Switcher (Ergonomic Thumb Access) */}
        <div className={`pt-1.5 flex items-center justify-around ${
          mainMode === 'ledger' ? (isLight ? 'mt-1 border-t border-slate-200/80' : 'mt-1 border-t border-white/[0.04]') : ''
        }`}>
          <button
            id="bottom-nav-vault-btn"
            type="button"
            onClick={() => setMainMode('vault')}
            className={`flex-1 py-1.5 flex flex-col items-center gap-0.5 rounded-xl transition-all ${
              mainMode === 'vault'
                ? isLight
                  ? 'text-blue-600 font-semibold'
                  : 'text-blue-400 font-semibold'
                : isLight
                ? 'text-slate-400 hover:text-slate-700'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <ShieldCheck size={18} className={mainMode === 'vault' ? 'stroke-[2.5]' : ''} />
            <span className="text-xs">자산</span>
          </button>

          <button
            id="bottom-nav-insights-btn"
            type="button"
            onClick={() => setMainMode('insights')}
            className={`flex-1 py-1.5 flex flex-col items-center gap-0.5 rounded-xl transition-all ${
              mainMode === 'insights'
                ? isLight
                  ? 'text-indigo-600 font-semibold'
                  : 'text-indigo-400 font-semibold'
                : isLight
                ? 'text-slate-400 hover:text-slate-700'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Sparkles size={18} className={mainMode === 'insights' ? 'stroke-[2.5]' : ''} />
            <span className="text-xs">인사이트</span>
          </button>

          <button
            id="bottom-nav-ledger-btn"
            type="button"
            onClick={() => setMainMode('ledger')}
            className={`flex-1 py-1.5 flex flex-col items-center gap-0.5 rounded-xl transition-all ${
              mainMode === 'ledger'
                ? isLight
                  ? 'text-emerald-600 font-semibold'
                  : 'text-emerald-400 font-semibold'
                : isLight
                ? 'text-slate-400 hover:text-slate-700'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Wallet size={18} className={mainMode === 'ledger' ? 'stroke-[2.5]' : ''} />
            <span className="text-xs">장부</span>
          </button>
        </div>
        </div>
      </footer>

      {/* Transaction Action Modal (Bottom Sheet for Edit / Delete) */}
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
        isLight={isLight}
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
        theme={userPrefs.theme || 'dark'}
      />

      {/* Manual Category Selection Modal (When Smart Auto-Categorization is OFF) */}
      <ManualCategoryModal
        isOpen={pendingCategorizationTxs.length > 0}
        pendingTransactions={pendingCategorizationTxs}
        onConfirm={handleConfirmCategorization}
        onCancel={handleCancelCategorization}
        theme={userPrefs.theme || 'dark'}
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
      />

      {/* Global Currency Selector Modal */}
      <CurrencySelectorModal
        isOpen={isCurrencyModalOpen}
        onClose={handleCloseCurrencyModal}
        currentCurrency={currentCurrency}
        onSelectCurrency={handleSelectCurrency}
        fxRates={fxRates}
        onFxRatesUpdated={setFxRates}
        theme="dark"
      />

      {/* Multimodal Receipt AI Scanner Modal */}
      <ReceiptScannerModal
        isOpen={isReceiptModalOpen}
        onClose={handleCloseReceiptModal}
        onConfirm={handleConfirmReceipt}
        onOpenSettings={(tab) => handleOpenSettingsModal(tab || 'engine')}
        theme={userPrefs.theme || 'dark'}
        currentCurrency={currentCurrency}
      />

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
        theme={userPrefs.theme || 'dark'}
      />

      {/* Korean-Standard Event Settlement Report Modal */}
      <EventSettlementReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        space={activeSpace}
        transactions={currentSpaceTransactions}
        onUpdateSpace={async (updated) => {
          await createSpace(updated);
          setSpaces(prev => prev.map(s => s.id === updated.id ? updated : s));
        }}
        theme={userPrefs.theme || 'dark'}
      />

      {/* Zero-Knowledge Privacy Vault PIN Lock Screen */}
      <VaultLockScreen onUnlocked={handleUnlocked} />

      {/* Automatic In-App PWA Install Banner */}
      <PWAInstallBanner 
        theme={userPrefs.theme || 'dark'} 
        position="bottom" 
      />
    </div>
  );
}

export default App;
