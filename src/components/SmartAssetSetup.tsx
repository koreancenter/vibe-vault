import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  CreditCard, 
  Landmark, 
  Banknote, 
  Wallet, 
  Check, 
  X, 
  Pencil, 
  Trash2, 
  Plus, 
  RotateCcw, 
  Loader2, 
  Sparkles,
  Mic,
  MicOff,
  Globe
} from 'lucide-react';
import { Asset, AssetType, Transaction, SupportedCurrency, FxRates } from '../types';
import { 
  getUserAssets, 
  saveUserAssets, 
  getAssetTypeKo, 
  getAIEngineConfig, 
  DEFAULT_USER_ASSETS, 
  DEFAULT_FX_RATES, 
  getUserPreferences,
  getUserActiveCurrencies,
  saveUserActiveCurrencies,
  getCurrencySymbol,
  KNOWN_CURRENCY_NAMES
} from '../utils';
import { getAllTransactions } from '../db';
import { MonthlyBudgetSection } from './MonthlyBudgetSection';
import { SubscriptionManagerSection } from './SubscriptionManagerSection';
import { detectSubscriptions } from '../autonomousFinance';

/**
 * 1. Institution Currency Mapping Rule:
 * Lightweight dictionary / regex detector for institution keywords
 */
export const INSTITUTION_CURRENCY_PATTERNS: Array<{
  currency: SupportedCurrency;
  pattern: RegExp;
  label: string;
}> = [
  { 
    currency: 'IDR', 
    pattern: /(bni|bca|mandiri|bri|cimb niaga|jenius|permata|gopay|ovo|dana)/i,
    label: '인도네시아 루피아 (IDR)'
  },
  { 
    currency: 'USD', 
    pattern: /(schwab|chase|boa|bank of america|robinhood|fidelity|wise|paypal)/i,
    label: '미국 달러 (USD)'
  },
  { 
    currency: 'KRW', 
    pattern: /(국민|신한|우리|하나|농협|카카오|토스|케이뱅크|기업|우체국|현대|삼성)/i,
    label: '대한민국 원 (KRW)'
  },
];

/**
 * Automatically detects currency from account / institution keyword
 */
export function detectCurrencyFromInstitution(text: string): SupportedCurrency | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  for (const item of INSTITUTION_CURRENCY_PATTERNS) {
    if (item.pattern.test(trimmed)) {
      return item.currency;
    }
  }
  return null;
}

/**
 * Visual balance prefix for currency display
 */
export function getBalancePrefix(currency: SupportedCurrency): string {
  return getCurrencySymbol(currency);
}

/**
 * Visual balance placeholder adapted to detected currency
 * e.g., 'Rp 0' for BNI, '₩0' for 카카오뱅크, '$0' for Chase
 */
export function getBalancePlaceholder(currency: SupportedCurrency): string {
  if (currency === 'IDR') return 'Rp 0';
  if (currency === 'KRW') return '₩0';
  if (currency === 'USD') return '$0';
  const sym = getCurrencySymbol(currency);
  return `${sym}0`;
}

/**
 * Auto-registers currency into the user's active currencies list (userCurrencies)
 * if not already present. This seamlessly unlocks progressive multi-currency mode.
 */
export function ensureCurrencyRegistered(currency: SupportedCurrency): void {
  try {
    const upper = currency.toUpperCase();
    const currentList = getUserActiveCurrencies();
    if (!currentList.includes(upper)) {
      const updated = [...currentList, upper];
      saveUserActiveCurrencies(updated);
    }
  } catch (err) {
    console.error('Failed to register active currency:', err);
  }
}

interface SmartAssetSetupProps {
  onAssetsUpdated?: (assets: Asset[]) => void;
  theme?: 'dark' | 'light';
  currentCurrency?: SupportedCurrency;
  fxRates?: FxRates;
  initialSubTab?: 'assets' | 'budget' | 'subscriptions';
}

export const SmartAssetSetup: React.FC<SmartAssetSetupProps> = ({ 
  onAssetsUpdated,
  theme = 'dark',
  currentCurrency,
  fxRates,
  initialSubTab
}) => {
  const isLight = theme === 'light';
  const [activeSection, setActiveSection] = useState<'assets' | 'budget' | 'subscriptions'>(initialSubTab || 'assets');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [discoveredMethods, setDiscoveredMethods] = useState<string[]>([]);

  // Base currency fallback
  const effectiveCurrency: SupportedCurrency = useMemo(() => {
    if (currentCurrency) return currentCurrency;
    const prefs = getUserPreferences();
    return (prefs.currencySymbol as SupportedCurrency) || 'KRW';
  }, [currentCurrency]);

  const effectiveFxRates: FxRates = useMemo(() => {
    return fxRates || DEFAULT_FX_RATES;
  }, [fxRates]);

  // Dynamic list of available currencies for dropdowns/chips
  const [activeCurrencies, setActiveCurrencies] = useState<string[]>(() => {
    const list = getUserActiveCurrencies();
    return list.length > 0 ? list : [effectiveCurrency];
  });

  useEffect(() => {
    const refreshCurrencies = () => {
      const list = getUserActiveCurrencies();
      setActiveCurrencies(list.length > 0 ? list : [effectiveCurrency]);
    };
    window.addEventListener('storage', refreshCurrencies);
    return () => window.removeEventListener('storage', refreshCurrencies);
  }, [effectiveCurrency]);

  const availableCurrenciesList = useMemo(() => {
    const defaults = ['KRW', 'IDR', 'USD', 'JPY', 'EUR'];
    return Array.from(new Set([...defaults, ...activeCurrencies, effectiveCurrency]));
  }, [activeCurrencies, effectiveCurrency]);

  // Manual addition state
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualType, setManualType] = useState<AssetType>('BANK');
  const [manualBillingDay, setManualBillingDay] = useState('');
  const [manualCurrency, setManualCurrency] = useState<SupportedCurrency>(effectiveCurrency);
  const [manualBalance, setManualBalance] = useState('');
  const [isManualCurrencyOverridden, setIsManualCurrencyOverridden] = useState(false);
  const [detectedCurrency, setDetectedCurrency] = useState<SupportedCurrency | null>(null);

  // Speech Recognition for manual voice input
  const [isListeningManual, setIsListeningManual] = useState(false);
  const manualRecognitionRef = useRef<any>(null);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<AssetType>('CARD');
  const [editBillingDay, setEditBillingDay] = useState<string>('');
  const [editCurrency, setEditCurrency] = useState<SupportedCurrency>(effectiveCurrency);
  const [editBalance, setEditBalance] = useState('');
  const [isEditCurrencyOverridden, setIsEditCurrencyOverridden] = useState(false);
  const [detectedEditCurrency, setDetectedEditCurrency] = useState<SupportedCurrency | null>(null);

  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSection(initialSubTab);
    }
  }, [initialSubTab]);

  const subscriptionsCount = useMemo(() => {
    return detectSubscriptions(transactions, effectiveCurrency, effectiveFxRates).length;
  }, [transactions, effectiveCurrency, effectiveFxRates]);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (manualRecognitionRef.current) {
        try {
          manualRecognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  // Load assets and discover payment methods from transactions
  useEffect(() => {
    const loaded = getUserAssets();
    setAssets(loaded);

    getAllTransactions()
      .then(txs => {
        setTransactions(txs || []);
        const existingNames = new Set(loaded.map(a => a.name.toLowerCase().replace(/\s+/g, '')));
        const discovered = new Set<string>();
        for (const tx of txs || []) {
          if (tx.paymentMethod) {
            const clean = tx.paymentMethod.trim();
            const key = clean.toLowerCase().replace(/\s+/g, '');
            if (clean && !existingNames.has(key)) {
              discovered.add(clean);
            }
          }
        }
        setDiscoveredMethods(Array.from(discovered));
      })
      .catch(() => {});
  }, []);

  const updateAssetsState = (newAssets: Asset[]) => {
    setAssets(newAssets);
    saveUserAssets(newAssets);
    if (onAssetsUpdated) {
      onAssetsUpdated(newAssets);
    }
  };

  /**
   * Automatic Currency Detection handler when user types or speaks account name
   */
  const handleManualNameChange = useCallback((newName: string) => {
    setManualName(newName);

    // If the user hasn't manually locked/overridden the currency, detect automatically
    if (!isManualCurrencyOverridden) {
      const detected = detectCurrencyFromInstitution(newName);
      if (detected) {
        setManualCurrency(detected);
        setDetectedCurrency(detected);
        ensureCurrencyRegistered(detected);
      } else {
        setDetectedCurrency(null);
      }
    } else {
      // Check if user changed the name to match a different institution keyword
      const detected = detectCurrencyFromInstitution(newName);
      setDetectedCurrency(detected);
    }
  }, [isManualCurrencyOverridden]);

  /**
   * User manually overrides the currency chip / dropdown
   */
  const handleSelectManualCurrency = (curr: SupportedCurrency) => {
    setManualCurrency(curr);
    setIsManualCurrencyOverridden(true);
    ensureCurrencyRegistered(curr);
  };

  /**
   * Speech Recognition Toggle for manual account input
   */
  const toggleManualVoiceInput = () => {
    if (isListeningManual) {
      if (manualRecognitionRef.current) {
        manualRecognitionRef.current.stop();
      }
      setIsListeningManual(false);
      return;
    }

    const SpeechRecognition = 
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setBanner({
        type: 'error',
        message: '이 브라우저에서는 음성 인식을 지원하지 않습니다.'
      });
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ko-KR';
      recognition.interimResults = true;
      recognition.continuous = false;

      recognition.onstart = () => {
        setIsListeningManual(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          handleManualNameChange(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition warning:', event.error);
        setIsListeningManual(false);
      };

      recognition.onend = () => {
        setIsListeningManual(false);
      };

      manualRecognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListeningManual(false);
    }
  };

  const handleAddDiscoveredMethod = (methodName: string) => {
    let guessedType: AssetType = 'OTHER';
    if (/카드|card|체크|신용/i.test(methodName)) guessedType = 'CARD';
    else if (/은행|bank|통장|계좌/i.test(methodName)) guessedType = 'BANK';
    else if (/현금|cash/i.test(methodName)) guessedType = 'CASH';

    // Auto-detect currency from discovered transaction payment method
    const detectedCurr = detectCurrencyFromInstitution(methodName);
    const assignedCurrency = detectedCurr || effectiveCurrency;
    if (detectedCurr) {
      ensureCurrencyRegistered(detectedCurr);
    }

    const newAsset: Asset = {
      id: `asset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: methodName,
      type: guessedType,
      currency: assignedCurrency,
      enabled: true,
    };
    const updated = [...assets, newAsset];
    updateAssetsState(updated);
    setDiscoveredMethods(prev => prev.filter(m => m !== methodName));
    setBanner({
      type: 'success',
      message: `'${methodName}' 결제수단을 등록했습니다 (${assignedCurrency}).`
    });
  };

  // AI Smart Ingestion Handler
  const handleAnalyzeAssets = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isAnalyzing) return;

    setIsAnalyzing(true);
    setBanner(null);

    try {
      const config = getAIEngineConfig();
      const response = await fetch('/api/parse-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          engineConfig: config
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `서버 오류 (${response.status})`);
      }

      const data = await response.json();
      const incoming: Asset[] = data.assets || [];

      if (incoming.length === 0) {
        setBanner({
          type: 'error',
          message: '자산을 감지하지 못했습니다. 은행/카드명과 결제일을 포함해 입력해 주세요.'
        });
        return;
      }

      const existingMap = new Map(assets.map(a => [a.name.toLowerCase().replace(/\s+/g, ''), a]));
      let newCount = 0;
      let updatedCount = 0;
      const mergedList = [...assets];

      for (const inc of incoming) {
        // Auto-detect currency for AI-parsed asset
        const detectedCurr = detectCurrencyFromInstitution(inc.name);
        if (detectedCurr) {
          inc.currency = detectedCurr;
          ensureCurrencyRegistered(detectedCurr);
        }

        const key = inc.name.toLowerCase().replace(/\s+/g, '');
        if (existingMap.has(key)) {
          const idx = mergedList.findIndex(a => a.name.toLowerCase().replace(/\s+/g, '') === key);
          if (idx !== -1) {
            mergedList[idx] = {
              ...mergedList[idx],
              type: inc.type || mergedList[idx].type,
              currency: inc.currency || mergedList[idx].currency,
              billingDay: inc.billingDay ?? mergedList[idx].billingDay,
              note: inc.note || mergedList[idx].note,
              enabled: true
            };
            updatedCount++;
          }
        } else {
          mergedList.push(inc);
          newCount++;
        }
      }

      updateAssetsState(mergedList);
      setInputText('');
      setBanner({
        type: 'success',
        message: `자산 등록 완료: ${newCount > 0 ? `${newCount}개 추가` : ''}${newCount > 0 && updatedCount > 0 ? ', ' : ''}${updatedCount > 0 ? `${updatedCount}개 업데이트` : ''}`
      });
    } catch (err: any) {
      console.error(err);
      setBanner({
        type: 'error',
        message: err.message || '자산 분석 중 오류가 발생했습니다.'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleToggleAsset = (id: string) => {
    const updated = assets.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a);
    updateAssetsState(updated);
  };

  const handleDeleteAsset = (id: string) => {
    const updated = assets.filter(a => a.id !== id);
    updateAssetsState(updated);
  };

  const handleStartEdit = (asset: Asset) => {
    setEditingId(asset.id);
    setEditName(asset.name);
    setEditType(asset.type);
    setEditBillingDay(asset.billingDay ? String(asset.billingDay) : '');
    const assetCurr = (asset.currency as SupportedCurrency) || effectiveCurrency;
    setEditCurrency(assetCurr);
    setEditBalance(asset.balance !== undefined ? String(asset.balance) : '');
    setIsEditCurrencyOverridden(false);
    setDetectedEditCurrency(detectCurrencyFromInstitution(asset.name));
  };

  const handleEditNameChange = (name: string) => {
    setEditName(name);
    if (!isEditCurrencyOverridden) {
      const detected = detectCurrencyFromInstitution(name);
      if (detected) {
        setEditCurrency(detected);
        setDetectedEditCurrency(detected);
        ensureCurrencyRegistered(detected);
      } else {
        setDetectedEditCurrency(null);
      }
    }
  };

  const handleSelectEditCurrency = (curr: SupportedCurrency) => {
    setEditCurrency(curr);
    setIsEditCurrencyOverridden(true);
    ensureCurrencyRegistered(curr);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editName.trim()) return;

    const bDay = parseInt(editBillingDay, 10);
    const validBDay = !isNaN(bDay) && bDay >= 1 && bDay <= 31 ? bDay : undefined;

    const rawBal = editBalance.trim().replace(/,/g, '');
    const numBal = rawBal ? parseFloat(rawBal) : undefined;
    const validBal = numBal !== undefined && !isNaN(numBal) ? numBal : undefined;

    const updated = assets.map(a => {
      if (a.id === editingId) {
        return {
          ...a,
          name: editName.trim(),
          type: editType,
          currency: editCurrency,
          balance: validBal,
          billingDay: editType === 'CARD' ? validBDay : undefined
        };
      }
      return a;
    });

    ensureCurrencyRegistered(editCurrency);
    updateAssetsState(updated);
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleOpenManualAdd = () => {
    setShowManualAdd(true);
    setManualName('');
    setManualType('BANK');
    setManualBillingDay('');
    setManualCurrency(effectiveCurrency);
    setManualBalance('');
    setIsManualCurrencyOverridden(false);
    setDetectedCurrency(null);
  };

  const handleSaveManual = () => {
    if (!manualName.trim()) return;

    const bDay = parseInt(manualBillingDay, 10);
    const validBDay = !isNaN(bDay) && bDay >= 1 && bDay <= 31 ? bDay : undefined;

    const rawBal = manualBalance.trim().replace(/,/g, '');
    const numBal = rawBal ? parseFloat(rawBal) : undefined;
    const validBal = numBal !== undefined && !isNaN(numBal) ? numBal : undefined;

    const newAsset: Asset = {
      id: `asset-manual-${Date.now()}`,
      name: manualName.trim(),
      type: manualType,
      currency: manualCurrency,
      balance: validBal,
      billingDay: manualType === 'CARD' ? validBDay : undefined,
      enabled: true
    };

    ensureCurrencyRegistered(manualCurrency);
    updateAssetsState([...assets, newAsset]);
    setManualName('');
    setManualBillingDay('');
    setManualBalance('');
    setManualCurrency(effectiveCurrency);
    setIsManualCurrencyOverridden(false);
    setDetectedCurrency(null);
    setShowManualAdd(false);
    setBanner({
      type: 'success',
      message: `'${newAsset.name}' 자산이 ${newAsset.currency} 통화로 등록되었습니다.`
    });
  };

  const handleResetDefaults = () => {
    setShowResetConfirmModal(true);
  };

  const handleConfirmReset = () => {
    setShowResetConfirmModal(false);
    updateAssetsState(DEFAULT_USER_ASSETS);
    setBanner({
      type: 'success',
      message: '기본 권장 설정으로 복원되었습니다.'
    });
  };

  const getAssetIcon = (type: AssetType) => {
    switch (type) {
      case 'CARD':
        return <CreditCard size={13} className="shrink-0 text-slate-500 dark:text-slate-400" />;
      case 'BANK':
        return <Landmark size={13} className="shrink-0 text-slate-500 dark:text-slate-400" />;
      case 'CASH':
        return <Banknote size={13} className="shrink-0 text-slate-500 dark:text-slate-400" />;
      case 'OTHER':
      default:
        return <Wallet size={13} className="shrink-0 text-slate-500 dark:text-slate-400" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-Navigation Switcher: Assets vs Monthly Budget vs Subscriptions */}
      <div className={`flex items-center gap-4 border-b pb-2 ${
        isLight ? 'border-slate-200' : 'border-white/10'
      }`}>
        <button
          type="button"
          id="subtab-btn-assets"
          onClick={() => setActiveSection('assets')}
          className={`text-xs pb-1 transition-colors relative whitespace-nowrap ${
            activeSection === 'assets'
              ? isLight
                ? 'font-bold text-slate-950 border-b-2 border-slate-950'
                : 'font-bold text-white border-b-2 border-white'
              : isLight
                ? 'text-slate-500 hover:text-slate-800'
                : 'text-slate-400 hover:text-white'
          }`}
        >
          보유 자산 ({assets.length})
        </button>

        <button
          type="button"
          id="subtab-btn-monthly-budget"
          onClick={() => setActiveSection('budget')}
          className={`text-xs pb-1 transition-colors relative whitespace-nowrap ${
            activeSection === 'budget'
              ? isLight
                ? 'font-bold text-slate-950 border-b-2 border-slate-950'
                : 'font-bold text-white border-b-2 border-white'
              : isLight
                ? 'text-slate-500 hover:text-slate-800'
                : 'text-slate-400 hover:text-white'
          }`}
        >
          월간 예산 설정
        </button>

        <button
          type="button"
          id="subtab-btn-subscriptions"
          onClick={() => setActiveSection('subscriptions')}
          className={`text-xs pb-1 transition-colors relative whitespace-nowrap flex items-center gap-1.5 ${
            activeSection === 'subscriptions'
              ? isLight
                ? 'font-bold text-slate-950 border-b-2 border-slate-950'
                : 'font-bold text-white border-b-2 border-white'
              : isLight
                ? 'text-slate-500 hover:text-slate-800'
                : 'text-slate-400 hover:text-white'
          }`}
        >
          <span>고정 구독</span>
          {subscriptionsCount > 0 && (
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeSection === 'subscriptions'
                ? isLight ? 'bg-slate-200 text-slate-900' : 'bg-white/20 text-white'
                : isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-[#00F5A0]/20 text-[#00F5A0]'
            }`}>
              {subscriptionsCount}
            </span>
          )}
        </button>
      </div>

      {activeSection === 'budget' ? (
        <MonthlyBudgetSection 
          theme={theme} 
          onBudgetChanged={() => {
            if (onAssetsUpdated) onAssetsUpdated(assets);
          }} 
        />
      ) : activeSection === 'subscriptions' ? (
        <SubscriptionManagerSection
          transactions={transactions}
          currentCurrency={effectiveCurrency}
          fxRates={effectiveFxRates}
          theme={theme}
          onTransactionChange={() => {
            getAllTransactions().then(txs => setTransactions(txs || []));
            if (onAssetsUpdated) onAssetsUpdated(assets);
          }}
        />
      ) : (
        <div className="space-y-4">
          {/* 1. Smart Asset Setup: Single Sleek Textarea / Input + Action Button */}
          <div className="space-y-2">
            <div className="relative">
              <textarea
                id="smart-asset-input"
                rows={2}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAnalyzeAssets();
                  }
                }}
                placeholder="e.g., 주거래: 신한은행, 외화: BNI 생활비 통장, 카드: 현대카드(14일)"
                className={`w-full rounded-xl px-3 py-2 text-xs outline-none resize-none leading-relaxed border transition-all ${
                  isLight
                    ? 'bg-slate-50/70 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-slate-400'
                    : 'bg-white/[0.03] border-white/10 text-white placeholder:text-slate-500 focus:bg-white/[0.05] focus:border-white/25'
                }`}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] truncate ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                결제 문자나 문장을 입력하면 AI가 통화 및 자산을 자동 등록합니다
              </span>
              <button
                type="button"
                id="btn-analyze-assets"
                disabled={!inputText.trim() || isAnalyzing}
                onClick={handleAnalyzeAssets}
                className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 ${
                  isLight
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-white text-slate-950 hover:bg-slate-100'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>분석 중...</span>
                  </>
                ) : (
                  <span>자산 분석 및 등록</span>
                )}
              </button>
            </div>

            {/* Notification Banner */}
            {banner && (
              <div className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between animate-in fade-in duration-150 ${
                banner.type === 'success' 
                  ? (isLight ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20')
                  : (isLight ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20')
              }`}>
                <span className="font-medium truncate">{banner.message}</span>
                <button onClick={() => setBanner(null)} className="ml-2 font-bold text-xs opacity-70 hover:opacity-100">×</button>
              </div>
            )}
          </div>

          {/* Discovered payment methods prompt (subtle 1-line tag list) */}
          {discoveredMethods.length > 0 && (
            <div className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 ${
              isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/[0.03] text-slate-300'
            }`}>
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0">
                <span className="text-[11px] font-medium shrink-0 text-slate-500">거래 감지:</span>
                {discoveredMethods.map((m) => {
                  const detected = detectCurrencyFromInstitution(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleAddDiscoveredMethod(m)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
                        isLight 
                          ? 'bg-white border-slate-200 text-slate-800 hover:border-slate-400' 
                          : 'bg-white/10 border-white/10 text-white hover:border-white/30'
                      }`}
                    >
                      <span>{m}</span>
                      {detected && <span className="text-[9px] opacity-75">({detected})</span>}
                      <Plus size={10} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manual Add Form Row */}
          {showManualAdd && (
            <div className={`p-3.5 rounded-2xl border space-y-3 animate-in fade-in duration-150 ${
              isLight ? 'bg-slate-50 border-slate-200 shadow-xs' : 'bg-white/[0.02] border-white/10'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                    새 자산 직접 추가
                  </span>
                  {detectedCurrency && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-medium animate-in fade-in">
                      <Sparkles size={10} className="text-emerald-400" />
                      <span>{detectedCurrency} 자동 감지</span>
                    </span>
                  )}
                </div>
                <button 
                  type="button"
                  onClick={() => setShowManualAdd(false)} 
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md transition-colors"
                  aria-label="닫기"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* 1. Account Name Input with Mic Button for Speech/Voice Input */}
                <div className="relative flex items-center">
                  <input
                    type="text"
                    id="manual-asset-name-input"
                    value={manualName}
                    onChange={(e) => handleManualNameChange(e.target.value)}
                    placeholder="자산명 (예: BNI 생활비 통장, 신한 주거래)"
                    className={`w-full pl-3 pr-8 py-1.5 text-xs rounded-xl border outline-none transition-all ${
                      isLight 
                        ? 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-500' 
                        : 'bg-black/40 border-white/10 text-white placeholder:text-slate-500 focus:border-white/30'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={toggleManualVoiceInput}
                    title={isListeningManual ? '음성 입력 중지' : '음성으로 자산명 입력 (예: BNI 생활비 통장)'}
                    className={`absolute right-1.5 p-1 rounded-lg transition-all ${
                      isListeningManual 
                        ? 'bg-rose-500/20 text-rose-400 animate-pulse' 
                        : isLight 
                          ? 'text-slate-400 hover:text-slate-700' 
                          : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {isListeningManual ? <MicOff size={13} /> : <Mic size={13} />}
                  </button>
                </div>

                {/* 2. Asset Type Selector */}
                <select
                  id="manual-asset-type-select"
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as AssetType)}
                  className={`px-3 py-1.5 text-xs rounded-xl border outline-none transition-all ${
                    isLight 
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-slate-500' 
                      : 'bg-black/40 border-white/10 text-white focus:border-white/30'
                  }`}
                >
                  <option value="BANK">은행 계좌</option>
                  <option value="CARD">신용/체크카드</option>
                  <option value="CASH">현금</option>
                  <option value="OTHER">기타 자산</option>
                </select>

                {/* 3. Currency Selector with Auto-Selection & Manual Override */}
                <div className="flex items-center gap-1">
                  <select
                    id="manual-asset-currency-select"
                    value={manualCurrency}
                    onChange={(e) => handleSelectManualCurrency(e.target.value as SupportedCurrency)}
                    className={`w-full px-2.5 py-1.5 text-xs rounded-xl border outline-none font-semibold transition-all ${
                      detectedCurrency === manualCurrency && !isManualCurrencyOverridden
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : isLight 
                          ? 'bg-white border-slate-200 text-slate-900 focus:border-slate-500' 
                          : 'bg-black/40 border-white/10 text-white focus:border-white/30'
                    }`}
                  >
                    {availableCurrenciesList.map((curr) => {
                      const sym = getCurrencySymbol(curr);
                      const name = KNOWN_CURRENCY_NAMES[curr]?.nameKo || curr;
                      return (
                        <option key={curr} value={curr} className="bg-slate-900 text-white">
                          {curr} ({sym}) - {name}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 4. Visual Balance Display: Prefix / Placeholder immediately adapt to detected currency */}
                <div className="relative flex items-center">
                  <span className={`absolute left-3 text-xs font-semibold select-none pointer-events-none ${
                    isLight ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    {getBalancePrefix(manualCurrency)}
                  </span>
                  <input
                    type="text"
                    id="manual-asset-balance-input"
                    value={manualBalance}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.,]/g, '');
                      setManualBalance(val);
                    }}
                    placeholder={getBalancePlaceholder(manualCurrency)}
                    className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border outline-none font-mono tabular-nums transition-all ${
                      isLight 
                        ? 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-500' 
                        : 'bg-black/40 border-white/10 text-white placeholder:text-slate-500 focus:border-white/30'
                    }`}
                  />
                </div>
              </div>

              {/* Card Billing Day row if CARD */}
              {manualType === 'CARD' && (
                <div className="flex items-center gap-2 pt-1">
                  <span className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    카드 결제일:
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={manualBillingDay}
                      onChange={(e) => setManualBillingDay(e.target.value)}
                      placeholder="1~31"
                      className={`w-16 px-2 py-1 text-xs rounded-lg border outline-none text-center ${
                        isLight 
                          ? 'bg-white border-slate-200 text-slate-900 focus:border-slate-500' 
                          : 'bg-black/40 border-white/10 text-white focus:border-white/30'
                      }`}
                    />
                    <span className="text-xs text-slate-400">일</span>
                  </div>
                </div>
              )}

              {/* Currency Quick-Pills for Fast Manual Switching / Override */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/[0.04]">
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                  <span className={`text-[10px] uppercase font-bold tracking-wider ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                    통화 선택:
                  </span>
                  {['KRW', 'IDR', 'USD', 'JPY', 'EUR'].map((code) => {
                    const isSelected = manualCurrency === code;
                    const isDetected = detectedCurrency === code && !isManualCurrencyOverridden;
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => handleSelectManualCurrency(code as SupportedCurrency)}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-mono transition-all flex items-center gap-1 active:scale-95 ${
                          isSelected
                            ? isDetected
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                              : 'bg-white/20 text-white border border-white/30 font-bold'
                            : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/5'
                        }`}
                      >
                        <span>{code}</span>
                        {isDetected && <span className="text-[9px]">⚡</span>}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowManualAdd(false)}
                    className={`px-3 py-1.5 text-xs rounded-xl transition-colors ${
                      isLight ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    id="btn-save-manual-asset"
                    onClick={handleSaveManual}
                    disabled={!manualName.trim()}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all disabled:opacity-40 active:scale-95 flex items-center gap-1 ${
                      isLight ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-slate-950 hover:bg-slate-100'
                    }`}
                  >
                    <Plus size={12} strokeWidth={2.5} />
                    <span>자산 등록</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. Registered Assets List: Clean 1-Line Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pt-1 px-0.5">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  등록된 자산 목록
                </span>
                <span className={`text-[11px] font-medium ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  {assets.filter(a => a.enabled).length}/{assets.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-show-manual-add"
                  onClick={handleOpenManualAdd}
                  className={`text-[11px] font-medium flex items-center gap-1 transition-colors ${
                    isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Plus size={11} />
                  <span>직접 추가</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  title="기본 설정으로 복원"
                  className={`text-[11px] p-0.5 transition-colors ${
                    isLight ? 'text-slate-400 hover:text-slate-600' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <RotateCcw size={11} />
                </button>
              </div>
            </div>

            {assets.length === 0 ? (
              <div className={`py-6 px-4 text-center ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}>
                <p className="text-xs">등록된 자산이 없습니다.</p>
                <p className="text-[11px] opacity-70 mt-0.5">상단 입력창에 결제 문자나 문장을 입력해 등록하세요.</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {assets.map((asset) => {
                  const isEditingThis = editingId === asset.id;

                  if (isEditingThis) {
                    return (
                      <div
                        key={asset.id}
                        className={`px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-l-2 ${
                          isLight ? 'bg-slate-50 border-slate-900' : 'bg-white/[0.03] border-white'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                          {/* Type Select */}
                          <select
                            value={editType}
                            onChange={(e) => setEditType(e.target.value as AssetType)}
                            className={`text-xs px-2 py-1 rounded-lg border outline-none ${
                              isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-white/20 text-white'
                            }`}
                          >
                            <option value="BANK">은행</option>
                            <option value="CARD">카드</option>
                            <option value="CASH">현금</option>
                            <option value="OTHER">기타</option>
                          </select>

                          {/* Name Input */}
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => handleEditNameChange(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit();
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            placeholder="자산명"
                            autoFocus
                            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border outline-none flex-1 min-w-[120px] ${
                              isLight ? 'bg-white border-slate-300 text-slate-900 focus:border-slate-500' : 'bg-slate-900 border-white/20 text-white focus:border-white/40'
                            }`}
                          />

                          {/* Currency Select */}
                          <select
                            value={editCurrency}
                            onChange={(e) => handleSelectEditCurrency(e.target.value as SupportedCurrency)}
                            className={`text-xs px-2 py-1 rounded-lg border outline-none font-semibold ${
                              detectedEditCurrency === editCurrency
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-white/20 text-white'
                            }`}
                          >
                            {availableCurrenciesList.map((c) => (
                              <option key={c} value={c}>
                                {c} ({getCurrencySymbol(c)})
                              </option>
                            ))}
                          </select>

                          {/* Balance Input with dynamic prefix & placeholder */}
                          <div className="relative flex items-center min-w-[110px]">
                            <span className={`absolute left-2 text-xs font-semibold select-none pointer-events-none ${
                              isLight ? 'text-slate-400' : 'text-slate-500'
                            }`}>
                              {getBalancePrefix(editCurrency)}
                            </span>
                            <input
                              type="text"
                              value={editBalance}
                              onChange={(e) => setEditBalance(e.target.value.replace(/[^0-9.,]/g, ''))}
                              placeholder={getBalancePlaceholder(editCurrency)}
                              className={`w-full pl-6 pr-2 py-1 text-xs rounded-lg border outline-none font-mono ${
                                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-white/20 text-white'
                              }`}
                            />
                          </div>

                          {/* Card Billing Day */}
                          {editType === 'CARD' && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <input
                                type="number"
                                min={1}
                                max={31}
                                value={editBillingDay}
                                onChange={(e) => setEditBillingDay(e.target.value)}
                                placeholder="결제일"
                                className={`text-xs px-1.5 py-1 rounded-lg border outline-none w-12 text-center ${
                                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-white/20 text-white'
                                }`}
                              />
                              <span className="text-[10px] text-slate-400">일</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-auto">
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${
                              isLight ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-slate-950 hover:bg-slate-200'
                            }`}
                            title="저장"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className={`p-1.5 rounded-lg text-xs transition-colors ${
                              isLight ? 'text-slate-500 hover:bg-slate-200' : 'text-slate-400 hover:bg-white/10'
                            }`}
                            title="취소"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={asset.id}
                      id={`asset-row-${asset.id}`}
                      className={`group px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                        asset.enabled ? '' : 'opacity-40'
                      } ${isLight ? 'hover:bg-slate-50/80' : 'hover:bg-white/[0.02]'}`}
                    >
                      {/* Left: Icon/Type Badge + Asset Name + Currency + Balance + Billing Day */}
                      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                        {/* Type Icon & Badge */}
                        <div className="flex items-center gap-1 shrink-0">
                          {getAssetIcon(asset.type)}
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${
                            isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-slate-300'
                          }`}>
                            {getAssetTypeKo(asset.type)}
                          </span>
                        </div>

                        {/* Asset Name (Never wraps vertically) */}
                        <span 
                          onClick={() => handleStartEdit(asset)}
                          className={`text-xs font-semibold whitespace-nowrap truncate cursor-pointer hover:underline ${
                            isLight ? 'text-slate-900' : 'text-slate-100'
                          }`}
                          title="클릭하여 수정"
                        >
                          {asset.name}
                        </span>

                        {/* Currency Tag */}
                        {asset.currency && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap border ${
                            asset.currency === 'IDR'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : asset.currency === 'USD'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          }`}>
                            {asset.currency}
                          </span>
                        )}

                        {/* Balance display if set */}
                        {asset.balance !== undefined && (
                          <span className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded whitespace-nowrap ${
                            isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/5 text-slate-300'
                          }`}>
                            {getCurrencySymbol(asset.currency || effectiveCurrency)}{asset.balance.toLocaleString()}
                          </span>
                        )}

                        {/* Billing Day (e.g. 14일) */}
                        {asset.billingDay && (
                          <span className={`text-[11px] whitespace-nowrap shrink-0 font-normal ${
                            isLight ? 'text-slate-400' : 'text-slate-500'
                          }`}>
                            ({asset.billingDay}일)
                          </span>
                        )}

                        {/* Edit Pencil Icon (subtle) */}
                        <button
                          type="button"
                          onClick={() => handleStartEdit(asset)}
                          className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ${
                            isLight ? 'text-slate-400 hover:text-slate-600' : 'text-slate-500 hover:text-slate-300'
                          }`}
                          title="수정"
                        >
                          <Pencil size={11} />
                        </button>
                      </div>

                      {/* Right: Toggle Switch + Delete Icon */}
                      <div className="flex items-center gap-2.5 shrink-0">
                        {/* Toggle Switch */}
                        <button
                          type="button"
                          role="switch"
                          id={`toggle-asset-tracking-${asset.id}`}
                          aria-checked={asset.enabled}
                          onClick={() => handleToggleAsset(asset.id)}
                          className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none p-0.5 ${
                            asset.enabled
                              ? (isLight ? 'bg-emerald-600' : 'bg-emerald-500')
                              : (isLight ? 'bg-slate-300' : 'bg-slate-700')
                          }`}
                          title={asset.enabled ? '추적 끄기' : '추적 켜기'}
                          aria-label={`${asset.name} 추적 토글`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-3 w-3 transform rounded-full shadow-sm transition duration-200 ease-in-out ${
                              asset.enabled ? 'translate-x-3' : 'translate-x-0'
                            } bg-white`}
                          />
                        </button>

                        {/* Delete Icon */}
                        <button
                          type="button"
                          onClick={() => handleDeleteAsset(asset.id)}
                          className={`p-1 rounded transition-colors ${
                            isLight ? 'text-slate-300 hover:text-rose-600' : 'text-slate-600 hover:text-rose-400'
                          }`}
                          title="자산 삭제"
                          aria-label={`${asset.name} 삭제`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal for Resetting Assets */}
      {showResetConfirmModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setShowResetConfirmModal(false)}
        >
          <div 
            className={`w-full max-w-xs rounded-2xl border p-4 shadow-2xl space-y-3 animate-in zoom-in-95 duration-150 ${
              isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-white/10 text-white'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-xl ${isLight ? 'bg-amber-100 text-amber-600' : 'bg-amber-500/20 text-amber-400'}`}>
                <RotateCcw size={16} />
              </div>
              <h4 className="text-xs font-bold">기본 자산 목록 복원</h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              기본 자산 목록으로 복원하시겠습니까? 현재 등록된 커스텀 결제수단 및 카드 설정이 초기 권장값으로 재설정됩니다.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                  isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-white/10 text-slate-400 hover:bg-white/5'
                }`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all active:scale-95"
              >
                복원하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
