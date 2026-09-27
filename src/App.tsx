import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  parseFinancialInputDeterministically, 
  inferCategoryAndMerchant,
  extractRealtimePreview
} from './financialParser';
import { Transaction, SupportedCurrency, FxRates, ParsedReceiptData, LaunchScreenMode } from './types';
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
  SUPPORTED_CURRENCIES
} from './utils';
import { getAllDebts, loadSampleData } from './db';
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
import { initAutoLockWatcher, lockVault } from './vaultSecurity';

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

  // Zero-Knowledge Vault Auto-Lock Watcher
  useEffect(() => {
    const cleanupWatcher = initAutoLockWatcher();
    return () => {
      cleanupWatcher();
    };
  }, []);

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

  // Mobile Touch Swipe Handling for Ledger Filters (전체, 지출, 수입, 이체, 정산)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const LEDGER_FILTERS: LedgerFilterType[] = useMemo(() => ['ALL', 'EXPENSE', 'INCOME', 'TRANSFER', 'SETTLEMENT'], []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
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

    // Only trigger if horizontal swipe is dominant and exceeds threshold (45px)
    if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (diffX < 0) {
        // Swiped Left -> Next filter
        setLedgerFilter((curr) => {
          const idx = LEDGER_FILTERS.indexOf(curr);
          if (idx >= 0 && idx < LEDGER_FILTERS.length - 1) {
            return LEDGER_FILTERS[idx + 1];
          }
          return curr;
        });
      } else {
        // Swiped Right -> Previous filter
        setLedgerFilter((curr) => {
          const idx = LEDGER_FILTERS.indexOf(curr);
          if (idx > 0) {
            return LEDGER_FILTERS[idx - 1];
          }
          return curr;
        });
      }
    }
  }, [LEDGER_FILTERS, setLedgerFilter]);

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
        currency: (receipt.currency as SupportedCurrency) || currentCurrency,
        category: receipt.category || receipt.suggestedCategory || 'Living',
        subCategory: 'Receipt',
        description: `${merchantTitle} (영수증)`,
        date: receipt.date ? new Date(receipt.date).toISOString() : new Date().toISOString(),
        paymentMethod: receipt.paymentMethod || '카드결제'
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
  }, [addTx, currentCurrency]);

  const handleConfirmCategorization = useCallback(async (finalTxs: Transaction[]) => {
    try {
      await batchAddTxs(finalTxs);
      setPendingCategorizationTxs([]);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: unknown) {
      console.error(err);
      setError('카테고리 저장 중 오류가 발생했습니다.');
    }
  }, [batchAddTxs]);

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
          newTxs.push(splitRes.principalTx);
          if (splitRes.interestTx) {
            newTxs.push(splitRes.interestTx);
          }
          continue;
        }

        // 2. Autonomous Receivable Recovery Execution
        if (t.receivableRecoverySuggestion) {
          const recRes = await commitAutonomousReceivableRecovery(t.receivableRecoverySuggestion, t.paymentMethod);
          newTxs.push(recRes.settlementTx);
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
          currency: t.currency || userPrefs.currencySymbol || 'KRW',
          category: category || (type === 'INCOME' ? 'Fixed' : 'Living'),
          subCategory: subCategory || (type === 'INCOME' ? 'Salary' : 'General'),
          description: desc,
          date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
          paymentMethod: t.paymentMethod || (type === 'INCOME' ? '통장' : '카드'),
          groupId: t.groupId,
          originalTotal: t.originalTotal ? Math.abs(Number(t.originalTotal)) : undefined,
          isInternalTransfer: Boolean(t.isInternalTransfer)
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
    <div className={`h-[100dvh] w-full max-w-md md:max-w-3xl lg:max-w-4xl mx-auto flex flex-col font-sans antialiased relative overflow-hidden shadow-2xl transition-colors duration-200 ${
      isLight ? 'bg-[#F8FAFC] text-slate-900 shadow-slate-300/40' : 'bg-gradient-to-b from-[#0B0F17] via-[#0D1424] to-[#111827] text-slate-100'
    }`}>
      {/* Zero-Knowledge Vault Lock Screen Overlay */}
      <VaultLockScreen onUnlocked={loadTransactions} />
      
      {/* Sleek ambient background lighting */}
      {!isLight && (
        <>
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 bg-[#00F5A0]/10 rounded-full blur-[110px] pointer-events-none" />
          <div className="absolute top-1/3 -right-24 w-72 h-72 bg-[#6366F1]/10 rounded-full blur-[100px] pointer-events-none" />
        </>
      )}

      {/* 1. TOP HEADER */}
      <header className={`flex-none h-16 px-4 sm:px-6 flex items-center justify-between backdrop-blur-xl z-20 transition-colors ${
        isLight ? 'bg-white/90 text-slate-900' : 'bg-[#0B0F17]/80 text-white'
      }`}>
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
            <span className={`text-xs font-medium truncate ${
              isLight ? 'text-slate-500' : 'text-[#94A3B8]'
            }`}>
              {mainMode === 'vault' 
                ? '프라이빗 자산 금고 & 포트폴리오' 
                : mainMode === 'insights' 
                ? '통합 자산 & 소비 인사이트' 
                : `${format(now, 'yyyy년 M월')} 일일 장부`}
            </span>
          </div>
        </div>

        {/* Right action controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* PWA In-App Install Button */}
          <PWAInstallButton theme={userPrefs.theme || 'dark'} />

          {/* Global Currency Switcher */}
          <button
            id="currency-selector-header-btn"
            type="button"
            onClick={handleOpenCurrencyModal}
            title={`현재 기준 통화: ${currentCurrency} (${SUPPORTED_CURRENCIES.find(c => c.code === currentCurrency)?.nameKo || currentCurrency})`}
            className={`h-8 px-2.5 flex items-center gap-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
              isLight 
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-800' 
                : 'bg-white/[0.06] hover:bg-white/10 text-white'
            }`}
          >
            <Globe size={14} className={isLight ? 'text-emerald-600' : 'text-[#00F5A0]'} />
            <span>{currentCurrency}</span>
          </button>

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

          {/* Quick Vault Lock Button */}
          <button
            id="quick-vault-lock-btn"
            type="button"
            onClick={() => lockVault()}
            title="금고 즉시 잠금 (Lock Vault)"
            className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-95 ${
              isLight
                ? 'bg-slate-100 text-slate-600 hover:text-emerald-700 hover:bg-slate-200'
                : 'bg-white/[0.06] text-[#94A3B8] hover:text-emerald-400 hover:bg-white/10'
            }`}
            aria-label="금고 즉시 잠금"
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
      </header>

      {/* 2. SCROLLABLE MIDDLE VIEWPORT */}
      <main 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 scrollbar-none"
      >
        {/* Offline Warning Banner */}
        {!isOnline && (
          <div className="rounded-2xl bg-amber-500/10 p-3.5 flex items-center gap-2.5 text-amber-500 text-xs">
            <WifiOff size={16} className="shrink-0" />
            <span className="text-xs leading-tight">오프라인 상태입니다. 기록된 데이터는 기기에 안전하게 보관됩니다.</span>
          </div>
        )}

        {mainMode === 'vault' ? (
          /* PRIMARY VAULT MODE: Multi-Brokerage & Net Worth Portfolio */
          <VaultOverviewSection
            currentCurrency={currentCurrency}
            fxRates={fxRates}
            stealthMode={isStealth}
            theme={userPrefs.theme || 'dark'}
            onTransactionAdded={() => loadTransactions()}
          />
        ) : mainMode === 'insights' ? (
          /* PRIMARY INTEGRATED INSIGHTS MODE: Assets & Ledger Unified Insights */
          <InsightsSection
            transactions={transactions}
            currentCurrency={currentCurrency}
            fxRates={fxRates}
            isStealth={isStealth}
            onOpenThemeSettings={() => handleOpenSettingsModal('preferences')}
            onNavigateToVault={() => setMainMode('vault')}
            onNavigateToLedger={() => setMainMode('ledger')}
          />
        ) : (
          /* PRIMARY LEDGER MODE: Daily Transaction & Budget Tracking */
          <>
            {/* FINANCIAL SUMMARY HERO CARD */}
            <FinancialSummaryCard
              transactions={transactions}
              currencySymbol={currentCurrency}
              fxRates={fxRates}
              isStealth={isStealth}
              theme={userPrefs.theme || 'dark'}
            />

        {/* Ledger Header & Quick Fixed Subscriptions Settings Link */}
        <div className="flex items-center justify-between gap-2 px-1 py-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              장부 거래 내역
            </span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
              isLight ? 'bg-slate-200/70 text-slate-700' : 'bg-white/10 text-slate-300'
            }`}>
              {transactionCount}건
            </span>
          </div>

          <button
            type="button"
            id="manage-subscriptions-link-btn"
            onClick={() => handleOpenSettingsModal('assets', 'subscriptions')}
            className={`text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all active:scale-95 ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/70'
                : 'bg-white/[0.05] hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            <span>고정 구독 관리</span>
            {detectedSubsCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-[#00F5A0]/20 text-[#00F5A0]'
              }`}>
                {detectedSubsCount}
              </span>
            )}
          </button>
        </div>

        {/* VIEW: UNIFIED LEDGER WITH MOBILE SWIPE */}
        {activeView === 'ledger' && (
          <div 
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="space-y-3 pb-2 animate-in fade-in duration-200 select-none touch-pan-y"
          >
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

            {/* Filter Pills & CSV Export */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
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

              <button
                id="export-csv-btn"
                type="button"
                onClick={exportCSV}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-normal shrink-0 transition-all active:scale-95 border ${
                  isLight 
                    ? 'bg-transparent hover:bg-slate-100 text-slate-700 border-slate-200/80' 
                    : 'bg-transparent hover:bg-white/[0.04] text-slate-300 border-white/[0.08]'
                }`}
              >
                <Download size={13} className={isLight ? 'text-emerald-600' : 'text-emerald-400'} />
                <span>CSV</span>
              </button>
            </div>

            {/* Empty State / Recommended Prompts */}
            {transactions.length === 0 ? (
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
                    기록된 거래 내역이 없습니다 (₩0)
                  </h3>
                  <p className={`text-xs font-light leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    하단 자연어 입력창에 평소처럼 적거나, 영수증 사진을 찍어 즉시 기록해보세요.
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
                </div>
                
                {/* Example prompts */}
                <div className="pt-3 text-left space-y-1 border-t border-white/[0.05]">
                  <span className={`text-[11px] font-medium block px-1 pb-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    자연어 입력 추천 예시 (터치하여 실행):
                  </span>
                  <div className="space-y-1">
                    {EXAMPLE_PROMPTS.map((prompt, idx) => (
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
            ) : filteredLedgerTransactions.length === 0 ? (
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
                {filteredLedgerTransactions.map((t) => {
                  const isExpense = t.type === 'EXPENSE';
                  const isIncome = t.type === 'INCOME';
                  const isSettlement = t.type === 'SETTLEMENT';
                  const displayTitle = formatTransactionTitle(t.description);
                  const categoryLabel = t.isInternalTransfer
                    ? (t.subCategory || '내부이체/원금상환')
                    : getCategoryKo(t.category, t.subCategory);

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
                          </div>
                        </div>

                        {/* Right: Amount */}
                        <div className="flex flex-col items-end shrink-0 pl-2">
                          <span className={`text-sm font-medium tracking-tight tabular-nums transition-all ${isStealth ? 'blur-sm select-none' : ''} ${
                            t.isInternalTransfer
                              ? isLight ? 'text-blue-600' : 'text-blue-400'
                              : isExpense 
                                ? isLight ? 'text-slate-900' : 'text-slate-200' 
                                : isIncome || isSettlement
                                  ? isLight ? 'text-emerald-600' : 'text-emerald-400'
                                  : isLight ? 'text-blue-600' : 'text-blue-400'
                          }`}>
                            {t.isInternalTransfer ? '⇄ ' : (isExpense ? '-' : '+')}{getCurrencySymbol(t.currency || 'KRW')}{t.amount.toLocaleString()}
                          </span>
                          {(t.currency || 'KRW') !== currentCurrency && (
                            <span className={`text-[11px] font-light mt-0.5 tabular-nums ${isLight ? 'text-slate-400' : 'text-slate-500'} ${isStealth ? 'blur-xs select-none' : ''}`}>
                              ≈ {t.isInternalTransfer ? '⇄ ' : (isExpense ? '-' : '+')}{currSymbol}{Math.round(getAmountInSelectedCurrency(t)).toLocaleString()}
                            </span>
                          )}
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
        )}

        {/* VIEW INSIGHTS: DEDICATED ANALYTICS, CASHFLOW & CFO ADVICE */}
        {activeView === 'insights' && (
          <div className="animate-in fade-in duration-200">
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

        {/* VIEW C: AUTONOMOUS SUBSCRIPTIONS */}
        {activeView === 'subscriptions' && (
          <div className="animate-in fade-in duration-200">
            <SubscriptionManagerSection
              transactions={transactions}
              currentCurrency={currentCurrency}
              fxRates={fxRates}
              isStealth={isStealth}
              theme={userPrefs.theme || 'dark'}
              onTransactionChange={loadTransactions}
            />
          </div>
        )}
          </>
        )}
      </main>

      {/* 3. FIXED BOTTOM DOCK (AI Omnibar & Mic/Camera Controls) */}
      <footer className={`flex-none backdrop-blur-xl py-1.5 px-3 sm:px-6 z-20 transition-colors border-t ${
        isLight 
          ? 'bg-white/95 border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]' 
          : 'bg-[#0B0F17]/95 border-white/5 shadow-[0_-4px_20px_rgba(0,0,0,0.4)]'
      }`}>
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

            {/* Currency Pill inside Omnibar */}
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
        <div className={`pt-1.5 mt-1 flex items-center justify-around border-t ${
          isLight ? 'border-slate-200/80' : 'border-white/[0.04]'
        }`}>
          <button
            id="bottom-nav-vault-btn"
            type="button"
            onClick={() => setMainMode('vault')}
            className={`flex-1 py-1 flex flex-col items-center gap-0.5 rounded-xl transition-all ${
              mainMode === 'vault'
                ? isLight
                  ? 'text-blue-600 font-medium'
                  : 'text-blue-400 font-medium'
                : isLight
                ? 'text-slate-400 hover:text-slate-700'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <ShieldCheck size={18} className={mainMode === 'vault' ? 'stroke-[2]' : ''} />
            <span className="text-[11px]">자산</span>
          </button>

          <button
            id="bottom-nav-insights-btn"
            type="button"
            onClick={() => setMainMode('insights')}
            className={`flex-1 py-1 flex flex-col items-center gap-0.5 rounded-xl transition-all ${
              mainMode === 'insights'
                ? isLight
                  ? 'text-indigo-600 font-medium'
                  : 'text-indigo-400 font-medium'
                : isLight
                ? 'text-slate-400 hover:text-slate-700'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Sparkles size={18} className={mainMode === 'insights' ? 'stroke-[2]' : ''} />
            <span className="text-[11px]">인사이트</span>
          </button>

          <button
            id="bottom-nav-ledger-btn"
            type="button"
            onClick={() => setMainMode('ledger')}
            className={`flex-1 py-1 flex flex-col items-center gap-0.5 rounded-xl transition-all ${
              mainMode === 'ledger'
                ? isLight
                  ? 'text-emerald-600 font-medium'
                  : 'text-emerald-400 font-medium'
                : isLight
                ? 'text-slate-400 hover:text-slate-700'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Wallet size={18} className={mainMode === 'ledger' ? 'stroke-[2]' : ''} />
            <span className="text-[11px]">장부</span>
          </button>
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
        theme={userPrefs.theme || 'dark'}
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

      {/* Zero-Knowledge Privacy Vault PIN Lock Screen */}
      <VaultLockScreen onUnlocked={() => loadTransactions()} />

      {/* Automatic In-App PWA Install Banner */}
      <PWAInstallBanner 
        theme={userPrefs.theme || 'dark'} 
        position="bottom" 
      />
    </div>
  );
}

export default App;
