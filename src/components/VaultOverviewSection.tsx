import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  ShieldCheck, 
  Landmark, 
  TrendingUp, 
  PieChart as PieChartIcon, 
  Plus, 
  Camera, 
  ArrowLeftRight, 
  Pencil, 
  Trash2, 
  RefreshCw, 
  Wallet, 
  Bitcoin, 
  Building, 
  Banknote, 
  CreditCard, 
  AlertCircle, 
  Check, 
  X, 
  UploadCloud, 
  Sparkles, 
  Loader2,
  Lock,
  ChevronDown,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { 
  AssetAccount, 
  AssetCategoryType, 
  SupportedCurrency, 
  FxRates, 
  HoldingItem,
  Transaction,
  DebtItem
} from '../types';
import { 
  getAllAssetAccounts, 
  getAllDebts,
  saveAssetAccount, 
  deleteAssetAccount, 
  updateAssetAccountBalance, 
  executeAccountTransfer,
  loadSampleData,
  getAllTransactions
} from '../db';
import { 
  convertCurrency, 
  formatCurrency, 
  getCurrencySymbol,
  getDualCurrencyComparison,
  getAssetCategoryKo, 
  getCategoryKo,
  ASSET_CATEGORY_NAMES_KO, 
  AIEngineConfig, 
  getAIEngineConfig,
  computeFinancialAggregates,
  getUserAssets,
  RECOMMENDED_USER_ASSETS
} from '../utils';
import { detectCreditCardSettlement } from '../financialParser';
import {
  sanitizeAndProcessImage,
  extractImageFileFromClipboard,
  extractImageFileFromDataTransfer,
  ImageSanitizationError
} from '../imageSanitizer';

export interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AssetAccount[];
  currentCurrency: SupportedCurrency;
  onTransferComplete?: () => void;
  onOpenAddAccount?: () => void;
  theme?: 'light' | 'dark' | 'system';
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  accounts,
  currentCurrency,
  onTransferComplete,
  onOpenAddAccount,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      if (accounts.length >= 2) {
        setSourceId(accounts[0].id);
        setTargetId(accounts[1].id);
      } else if (accounts.length === 1) {
        setSourceId(accounts[0].id);
        setTargetId('');
      } else {
        setSourceId('');
        setTargetId('');
      }
      setAmount('');
      setNote('');
      setError(null);
    }
  }, [isOpen, accounts]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceId || !targetId) {
      setError('출금 계좌와 입금 계좌를 선택해주세요.');
      return;
    }
    if (sourceId === targetId) {
      setError('출금 계좌와 입금 계좌는 서로 달라야 합니다.');
      return;
    }
    const transferAmount = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(transferAmount) || transferAmount <= 0) {
      setError('유효한 이체 금액을 입력해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await executeAccountTransfer(sourceId, targetId, transferAmount, note.trim() || undefined);
      if (onTransferComplete) {
        onTransferComplete();
      }
      onClose();
    } catch (err: any) {
      setError(err.message || '이체 처리에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-0 sm:p-4"
      onClick={onClose}
    >
      <div 
        className={`w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-white/[0.08] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.08)] flex flex-col max-h-[85dvh] sm:max-h-[88dvh] overflow-hidden transition-colors animate-in slide-in-from-bottom-6 duration-200 ${
          isLight ? 'bg-white text-slate-900 border-slate-200' : 'bg-[#111217] text-neutral-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 bg-white/20" />

        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.06] shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-white">계좌 간 자산 이체</h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              내 계좌 간 이체는 가계부 소비 지출에서 제외됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            aria-label="닫기"
          >
            <X size={17} />
          </button>
        </div>

        {accounts.length < 2 ? (
          <div className="p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] text-neutral-300 flex items-center justify-center mx-auto">
              <ArrowLeftRight size={20} className="text-neutral-400" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-white">2개 이상의 계좌가 필요합니다</p>
              <p className="text-xs text-neutral-400 leading-relaxed">
                계좌 간 이체를 진행하려면 최소 2개 이상의 등록된 자산 계좌가 필요합니다. 상단의 '자산 추가'로 계좌를 등록해 주세요.
              </p>
            </div>
            <div className="pt-2 flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
              >
                닫기
              </button>
              {onOpenAddAccount && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAddAccount();
                  }}
                  className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-sm font-semibold transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                >
                  자산 계좌 추가
                </button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5 sm:px-6 sm:py-5 space-y-4 overscroll-contain">
              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-neutral-400 mb-1.5 block">출금 계좌 (보내는 곳)</label>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white focus:border-white/25 focus:ring-0 outline-none transition-all cursor-pointer"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-[#111217] text-white">
                      {acc.institution} - {acc.accountName} (잔고 ₩{acc.currentBalance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-400 mb-1.5 block">입금 계좌 (받는 곳)</label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white focus:border-white/25 focus:ring-0 outline-none transition-all cursor-pointer"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-[#111217] text-white">
                      {acc.institution} - {acc.accountName} (잔고 ₩{acc.currentBalance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-400 mb-1.5 block">이체 금액 ({currentCurrency})</label>
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1000000"
                  required
                  className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all tabular-nums"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-400 mb-1.5 block">이체 메모 (선택)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 미국주식 매수용 예수금 이체"
                  className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-5 sm:px-6 sm:py-4 border-t border-white/[0.06] shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-sm font-semibold transition-all shadow-sm active:scale-[0.99] flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <ArrowLeftRight size={15} />
                {isSubmitting ? '처리 중...' : '이체 실행'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

interface VaultOverviewSectionProps {
  currentCurrency: SupportedCurrency;
  fxRates: FxRates;
  stealthMode?: boolean;
  onToggleStealth?: () => void;
  theme?: 'light' | 'dark' | 'system';
  onTransactionAdded?: () => void;
  isMultiCurrencyMode?: boolean;
  transactions?: Transaction[];
  onNavigateToLedger?: () => void;
  onNavigateToInsights?: () => void;
}

export const VaultOverviewSection: React.FC<VaultOverviewSectionProps> = ({
  currentCurrency,
  fxRates,
  stealthMode = false,
  onToggleStealth,
  theme = 'dark',
  onTransactionAdded,
  isMultiCurrencyMode = false,
  transactions: propTransactions,
  onNavigateToLedger,
  onNavigateToInsights,
}) => {
  const isLight = theme === 'light';
  const [accounts, setAccounts] = useState<AssetAccount[]>([]);
  const [debts, setDebts] = useState<DebtItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | AssetCategoryType>('ALL');

  // Modals & Active Drawer states
  const [showAddModal, setShowAddModal] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [editingBalanceAccount, setEditingBalanceAccount] = useState<AssetAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<{ id: string; name: string } | null>(null);
  const [newBalanceInput, setNewBalanceInput] = useState<string>('');

  // AI Screenshot OCR State
  const [isScanning, setIsScanning] = useState(false);
  const [scannedResult, setScannedResult] = useState<any | null>(null);
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanTargetAccountId, setScanTargetAccountId] = useState<string>('new');
  const [isScreenshotDraggingOver, setIsScreenshotDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenshotDragCounterRef = useRef<number>(0);

  // New Account Form State
  const [newAccountForm, setNewAccountForm] = useState<{
    institution: string;
    accountName: string;
    assetType: AssetCategoryType;
    balance: string;
    currency: SupportedCurrency;
    note: string;
  }>({
    institution: '토스증권',
    accountName: '',
    assetType: 'BROKERAGE',
    balance: '',
    currency: currentCurrency,
    note: '',
  });

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const loadVaultData = async () => {
    setIsLoading(true);
    try {
      const [accs, dbs] = await Promise.all([
        getAllAssetAccounts(),
        getAllDebts()
      ]);
      setAccounts(accs || []);
      setDebts(dbs || []);
    } catch (e) {
      console.error('Failed to load asset accounts & debts:', e);
    } finally {
      setIsLoading(false);
    }
  };
  const loadAccounts = loadVaultData;

  useEffect(() => {
    loadVaultData();

    const handleDataChange = () => {
      loadVaultData();
      getAllTransactions().then(txs => {
        if (txs) setLocalTransactions(txs);
      }).catch(() => {});
    };

    window.addEventListener('vibe-vault-data-changed', handleDataChange);
    window.addEventListener('vibe-vault-data-reset', handleDataChange);

    return () => {
      window.removeEventListener('vibe-vault-data-changed', handleDataChange);
      window.removeEventListener('vibe-vault-data-reset', handleDataChange);
    };
  }, []);

  // Transactions sync
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>(propTransactions || []);

  useEffect(() => {
    if (propTransactions && propTransactions.length > 0) {
      setLocalTransactions(propTransactions);
    } else {
      getAllTransactions().then(txs => {
        if (txs && txs.length > 0) setLocalTransactions(txs);
      }).catch(() => {});
    }
  }, [propTransactions]);

  // Reconcile offsets state (persisted to localStorage)
  const [reconcileOffsets, setReconcileOffsets] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem('vibe_card_reconcile_offsets');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const saveReconcileOffset = (cardName: string, offset: number) => {
    const updated = { ...reconcileOffsets, [cardName]: offset };
    setReconcileOffsets(updated);
    try {
      localStorage.setItem('vibe_card_reconcile_offsets', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to persist card reconcile offset', e);
    }
  };

  // Modal state for Credit Card Reconciliation
  const [reconcilingCard, setReconcilingCard] = useState<any | null>(null);
  const [reconcileTargetInput, setReconcileTargetInput] = useState<string>('');

  const handleOpenReconcile = (card: any) => {
    setReconcilingCard(card);
    setReconcileTargetInput(card.unpaidLiability.toString());
  };

  const handleApplyReconciliation = async () => {
    if (!reconcilingCard) return;
    const targetNum = parseFloat(reconcileTargetInput.replace(/,/g, ''));
    if (isNaN(targetNum) || targetNum < 0) {
      showToast('올바른 조정 금액을 입력해주세요.', 'error');
      return;
    }

    // newOffset = targetNum - rawRunningBalance
    const newOffset = Math.round(targetNum - reconcilingCard.rawRunningBalance);
    saveReconcileOffset(reconcilingCard.name, newOffset);

    // If mapped to an AssetAccount with LIABILITY type, update its balance in IndexedDB as well
    if (reconcilingCard.associatedAccountId) {
      try {
        await updateAssetAccountBalance(reconcilingCard.associatedAccountId, targetNum);
        await loadAccounts();
      } catch (e) {
        console.warn('Failed to update associated account balance:', e);
      }
    }

    showToast(`${reconcilingCard.name} 미결제 잔액이 ${formatCurrency(targetNum, currentCurrency)}으로 정상 조정(Reconcile)되었습니다.`);
    setReconcilingCard(null);
  };

  // Credit Card Liability Tracking
  const trackedCreditCards = useMemo(() => {
    const userAssets = getUserAssets();
    const cardMap = new Map<string, { id?: string; name: string; billingDay?: number; accountId?: string }>();

    // 1. User configured CARD assets
    const cardAssets = userAssets.filter(a => a.type === 'CARD');
    for (const ca of cardAssets) {
      cardMap.set(ca.name.trim(), {
        id: ca.id,
        name: ca.name.trim(),
        billingDay: ca.billingDay
      });
    }

    // 2. Accounts with LIABILITY or card in name
    for (const acc of accounts) {
      if (acc.assetType === 'LIABILITY' || /카드|card/i.test(acc.institution) || /카드|card/i.test(acc.accountName)) {
        const name = (acc.institution || acc.accountName).trim();
        if (!cardMap.has(name)) {
          cardMap.set(name, {
            id: acc.id,
            name: name,
            accountId: acc.id
          });
        } else {
          const existing = cardMap.get(name)!;
          existing.accountId = acc.id;
        }
      }
    }

    // 3. Transactions with card payment methods
    for (const tx of localTransactions) {
      const method = (tx.paymentMethod || '').trim();
      if (method && (/카드|card/i.test(method)) && !/체크카드/i.test(method)) {
        if (!cardMap.has(method)) {
          cardMap.set(method, {
            name: method
          });
        }
      }
    }

    // 4. Default fallback if nothing exists yet
    if (cardMap.size === 0) {
      const rec = RECOMMENDED_USER_ASSETS.find(a => a.type === 'CARD');
      if (rec) {
        cardMap.set(rec.name, { id: rec.id, name: rec.name, billingDay: rec.billingDay });
      }
    }

    const isMatchingCard = (txMethodOrDesc?: string, targetCardName?: string): boolean => {
      if (!txMethodOrDesc || !targetCardName) return false;
      const t = txMethodOrDesc.toLowerCase().replace(/[\s\-_]/g, '');
      const c = targetCardName.toLowerCase().replace(/[\s\-_]/g, '');
      if (t === c) return true;
      if (t.includes(c) || c.includes(t)) return true;
      const baseCard = c.replace(/카드|card|신용카드|creditcard/gi, '');
      const baseTx = t.replace(/카드|card|신용카드|creditcard/gi, '');
      if (baseCard.length >= 2 && (t.includes(baseCard) || baseTx.includes(baseCard))) {
        return true;
      }
      return false;
    };

    const isCardSettlementTx = (tx: Transaction): boolean => {
      if (tx.subCategory === '카드대금 납부' || tx.subCategory === '카드대금') return true;
      if (tx.type === 'TRANSFER' && detectCreditCardSettlement(tx.description || '') !== null) return true;
      return false;
    };

    return Array.from(cardMap.values()).map(card => {
      let totalExpenses = 0;
      let totalPayments = 0;
      let totalRefunds = 0;

      for (const t of localTransactions) {
        const amt = convertCurrency(t.amount, t.currency || 'KRW', currentCurrency, fxRates);

        // 1. EXPENSE on this card: add to liability
        if (t.type === 'EXPENSE' && isMatchingCard(t.paymentMethod, card.name)) {
          totalExpenses += amt;
        }

        // 2. TRANSFER settlement payment: deduct from liability
        if (t.type === 'TRANSFER' && isCardSettlementTx(t)) {
          if (isMatchingCard(t.paymentMethod, card.name) || isMatchingCard(t.description, card.name) || cardMap.size === 1) {
            totalPayments += amt;
          }
        }

        // 3. SETTLEMENT / refund on this card
        if (t.type === 'SETTLEMENT' && isMatchingCard(t.paymentMethod, card.name)) {
          totalRefunds += amt;
        }
      }

      const offset = reconcileOffsets[card.name] || 0;
      const rawRunningBalance = totalExpenses - totalPayments - totalRefunds;
      const unpaidLiability = Math.max(0, rawRunningBalance + offset);
      const hasMismatch = Math.abs(rawRunningBalance) > 0 || offset !== 0;

      return {
        id: card.id || `card-${card.name}`,
        name: card.name,
        billingDay: card.billingDay,
        totalExpenses,
        totalPayments,
        totalRefunds,
        reconcileOffset: offset,
        rawRunningBalance,
        unpaidLiability,
        hasMismatch,
        associatedAccountId: card.accountId
      };
    });
  }, [accounts, localTransactions, currentCurrency, fxRates, reconcileOffsets]);

  const totalCardLiabilities = useMemo(() => {
    return trackedCreditCards.reduce((sum, c) => sum + c.unpaidLiability, 0);
  }, [trackedCreditCards]);

  // Aggregated Net Worth Calculations (Unified with InsightsSection)
  const { totalAssets, totalLiabilities, netWorth, categoryTotals } = useMemo(() => {
    const aggregates = computeFinancialAggregates(
      accounts,
      debts,
      currentCurrency,
      fxRates
    );

    // Sum unlinked credit card running liability (cards not already registered as an AssetAccount of type LIABILITY)
    let unlinkedCardLiability = 0;
    for (const card of trackedCreditCards) {
      const isAccountMapped = accounts.some(a => a.id === card.associatedAccountId && a.assetType === 'LIABILITY');
      if (!isAccountMapped) {
        unlinkedCardLiability += card.unpaidLiability;
      }
    }

    const effectiveTotalLiabilities = aggregates.totalLiabilities + unlinkedCardLiability;
    const effectiveNetWorth = aggregates.totalAssets - effectiveTotalLiabilities;

    const catMap: Record<AssetCategoryType, number> = {
      BROKERAGE: 0,
      BANK: 0,
      CRYPTO: 0,
      REAL_ESTATE: 0,
      CASH: 0,
      LIABILITY: unlinkedCardLiability,
    };

    for (const acc of accounts) {
      const converted = convertCurrency(
        acc.currentBalance,
        acc.currency || 'KRW',
        currentCurrency,
        fxRates
      );

      if (acc.assetType === 'LIABILITY') {
        catMap.LIABILITY += converted;
      } else {
        catMap[acc.assetType] = (catMap[acc.assetType] || 0) + converted;
      }
    }

    return {
      totalAssets: aggregates.totalAssets,
      totalLiabilities: effectiveTotalLiabilities,
      netWorth: effectiveNetWorth,
      categoryTotals: catMap,
    };
  }, [accounts, debts, currentCurrency, fxRates, trackedCreditCards]);

  const formattedNetWorth = useMemo(() => {
    return formatCurrency(Math.round(netWorth), currentCurrency);
  }, [netWorth, currentCurrency]);

  // Dual Currency Comparison for Net Worth
  const dualCurrency = useMemo(() => {
    return getDualCurrencyComparison(Math.round(netWorth), currentCurrency, fxRates);
  }, [netWorth, currentCurrency, fxRates]);

  // Portfolio Ratio Bars Calculation
  const portfolioRows = useMemo(() => {
    return [
      {
        type: 'BROKERAGE' as AssetCategoryType,
        label: '투자',
        amount: categoryTotals.BROKERAGE || 0,
        percentage: totalAssets > 0 ? ((categoryTotals.BROKERAGE || 0) / totalAssets) * 100 : 0,
        barColor: 'bg-emerald-400',
        dotColor: 'bg-emerald-400',
      },
      {
        type: 'BANK' as AssetCategoryType,
        label: '예적금',
        amount: categoryTotals.BANK || 0,
        percentage: totalAssets > 0 ? ((categoryTotals.BANK || 0) / totalAssets) * 100 : 0,
        barColor: 'bg-sky-400',
        dotColor: 'bg-sky-400',
      },
      {
        type: 'CRYPTO' as AssetCategoryType,
        label: '가상자산',
        amount: categoryTotals.CRYPTO || 0,
        percentage: totalAssets > 0 ? ((categoryTotals.CRYPTO || 0) / totalAssets) * 100 : 0,
        barColor: 'bg-amber-400',
        dotColor: 'bg-amber-400',
      },
      {
        type: 'CASH' as AssetCategoryType,
        label: '현금',
        amount: categoryTotals.CASH || 0,
        percentage: totalAssets > 0 ? ((categoryTotals.CASH || 0) / totalAssets) * 100 : 0,
        barColor: 'bg-teal-400',
        dotColor: 'bg-teal-400',
      },
      {
        type: 'REAL_ESTATE' as AssetCategoryType,
        label: '부동산',
        amount: categoryTotals.REAL_ESTATE || 0,
        percentage: totalAssets > 0 ? ((categoryTotals.REAL_ESTATE || 0) / totalAssets) * 100 : 0,
        barColor: 'bg-purple-400',
        dotColor: 'bg-purple-400',
      },
      {
        type: 'LIABILITY' as AssetCategoryType,
        label: '부채',
        amount: totalLiabilities,
        percentage: totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0,
        barColor: 'bg-rose-400/80',
        dotColor: 'bg-rose-400/80',
      },
    ];
  }, [categoryTotals, totalAssets, totalLiabilities]);

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    if (selectedFilter === 'ALL') return accounts;
    return accounts.filter((a) => a.assetType === selectedFilter);
  }, [accounts, selectedFilter]);

  // Handle Quick Balance Update
  const handleSaveQuickBalance = async () => {
    if (!editingBalanceAccount) return;
    const num = parseFloat(newBalanceInput.replace(/,/g, ''));
    if (isNaN(num) || num < 0) {
      showToast('올바른 금액을 입력해주세요.', 'error');
      return;
    }

    try {
      await updateAssetAccountBalance(editingBalanceAccount.id, num);
      await loadAccounts();
      showToast(`${editingBalanceAccount.accountName} 잔고가 업데이트되었습니다.`);
      setEditingBalanceAccount(null);
    } catch (err: any) {
      showToast(err.message || '업데이트 실패', 'error');
    }
  };

  // Handle Add New Account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountForm.accountName.trim() || !newAccountForm.institution.trim()) {
      showToast('기관명과 계좌명을 입력해주세요.', 'error');
      return;
    }

    const balanceNum = parseFloat(newAccountForm.balance.replace(/,/g, '')) || 0;
    const newAcc: AssetAccount = {
      id: `acc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      institution: newAccountForm.institution.trim(),
      accountName: newAccountForm.accountName.trim(),
      assetType: newAccountForm.assetType,
      currentBalance: balanceNum,
      currency: newAccountForm.currency,
      lastUpdated: new Date().toISOString(),
      note: newAccountForm.note.trim() || undefined,
    };

    try {
      await saveAssetAccount(newAcc);
      await loadAccounts();
      setShowAddModal(false);
      setNewAccountForm({
        institution: '토스증권',
        accountName: '',
        assetType: 'BROKERAGE',
        balance: '',
        currency: currentCurrency,
        note: '',
      });
      showToast(`${newAcc.accountName} 계좌가 추가되었습니다.`);
    } catch (err: any) {
      showToast('계좌 추가 실패', 'error');
    }
  };

  // Handle Delete Account
  const handleDeleteAccount = (id: string, name: string) => {
    setDeletingAccount({ id, name });
  };

  const handleConfirmDeleteAccount = async () => {
    if (!deletingAccount) return;
    try {
      await deleteAssetAccount(deletingAccount.id);
      await loadAccounts();
      showToast('계좌가 삭제되었습니다.');
    } catch (e) {
      showToast('삭제 실패', 'error');
    } finally {
      setDeletingAccount(null);
    }
  };

  // Clipboard Paste listener for Screenshot OCR Modal
  useEffect(() => {
    if (!showScanModal) return;

    const handlePaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      const file = extractImageFileFromClipboard(e);
      if (file) {
        e.preventDefault();
        processScreenshotFile(file);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [showScanModal]);

  // Handle Screenshot Upload with Pixel Sanitization & Canvas Downscaling
  const processScreenshotFile = async (file: File) => {
    setIsScanning(true);
    setScannedResult(null);

    try {
      const sanitized = await sanitizeAndProcessImage(file, {
        maxDimension: 1280,
        quality: 0.8,
        preferredMime: 'image/webp'
      });

      setScanPreviewUrl(sanitized.dataUrl);

      const engineConfig = getAIEngineConfig();
      const res = await fetch('/api/parse-asset-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: sanitized.dataUrl,
          mimeType: sanitized.mimeType,
          engineConfig,
        }),
      });

      if (!res.ok) {
        throw new Error('자산 스크린샷 분석에 실패했습니다.');
      }

      const data = await res.json();
      if (data?.asset) {
        setScannedResult(data.asset);
        const match = accounts.find(
          (a) =>
            a.institution.toLowerCase().includes(data.asset.institution.toLowerCase()) ||
            data.asset.institution.toLowerCase().includes(a.institution.toLowerCase())
        );
        if (match) {
          setScanTargetAccountId(match.id);
        } else {
          setScanTargetAccountId('new');
        }
      }
    } catch (err: unknown) {
      console.error('Scan error:', err);
      if (err instanceof ImageSanitizationError) {
        let msg = err.message;
        if (err.code === 'SVG_XSS_DETECTED') {
          msg = 'SVG 및 스크립트 벡터 형식은 XSS 보안 방지를 위해 차단되었습니다. 안전한 JPG, PNG, WebP 사진을 사용해주세요.';
        } else if (err.code === 'FILE_TOO_LARGE') {
          msg = '파일 용량이 너무 큽니다 (최대 15MB 제한).';
        }
        showToast(msg, 'error');
      } else {
        showToast(err instanceof Error ? err.message : '스크린샷 OCR 분석 중 오류가 발생했습니다.', 'error');
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processScreenshotFile(file);
  };

  const handleScreenshotDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    screenshotDragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsScreenshotDraggingOver(true);
    }
  };

  const handleScreenshotDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isScreenshotDraggingOver) {
      setIsScreenshotDraggingOver(true);
    }
  };

  const handleScreenshotDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    screenshotDragCounterRef.current = Math.max(0, screenshotDragCounterRef.current - 1);
    if (screenshotDragCounterRef.current === 0) {
      setIsScreenshotDraggingOver(false);
    }
  };

  const handleScreenshotDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsScreenshotDraggingOver(false);
    screenshotDragCounterRef.current = 0;

    const file = extractImageFileFromDataTransfer(e.dataTransfer);
    if (file) {
      processScreenshotFile(file);
    } else {
      showToast('유효한 이미지 파일(JPG, PNG, WebP)만 업로드할 수 있습니다.', 'error');
    }
  };

  // Confirm Scanned Balance Update
  const handleConfirmScannedAsset = async () => {
    if (!scannedResult) return;

    try {
      if (scanTargetAccountId === 'new') {
        const newAcc: AssetAccount = {
          id: `acc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          institution: scannedResult.institution || '기타 금융기관',
          accountName: scannedResult.accountName || '스캔된 자산 계좌',
          assetType: scannedResult.assetType || 'BROKERAGE',
          currentBalance: scannedResult.currentBalance || 0,
          cashBalance: scannedResult.cashBalance,
          investedAssets: scannedResult.investedAssets,
          currency: scannedResult.currency || currentCurrency,
          lastUpdated: new Date().toISOString(),
          holdings: scannedResult.holdings,
          note: scannedResult.notes || 'AI 스크린샷 자동 파싱',
        };
        await saveAssetAccount(newAcc);
        showToast(`'${newAcc.accountName}' 계좌가 신규 등록되었습니다.`);
      } else {
        const target = accounts.find((a) => a.id === scanTargetAccountId);
        if (target) {
          target.currentBalance = scannedResult.currentBalance;
          if (scannedResult.cashBalance !== undefined) target.cashBalance = scannedResult.cashBalance;
          if (scannedResult.investedAssets !== undefined) target.investedAssets = scannedResult.investedAssets;
          if (scannedResult.holdings && scannedResult.holdings.length > 0) {
            target.holdings = scannedResult.holdings;
          }
          target.lastUpdated = new Date().toISOString();
          await saveAssetAccount(target);
          showToast(`'${target.accountName}' 잔고가 ₩${scannedResult.currentBalance.toLocaleString()}으로 업데이트되었습니다.`);
        }
      }
      await loadAccounts();
      setShowScanModal(false);
      setScannedResult(null);
      setScanPreviewUrl(null);
    } catch (err: any) {
      showToast('잔고 반영 실패', 'error');
    }
  };

  const assetCategories: { type: AssetCategoryType; label: string; icon: React.ReactNode; color: string }[] = [
    { type: 'BROKERAGE', label: '투자', icon: <TrendingUp size={14} />, color: 'from-blue-500 to-indigo-600' },
    { type: 'BANK', label: '예적금', icon: <Landmark size={14} />, color: 'from-sky-500 to-blue-600' },
    { type: 'CRYPTO', label: '가상자산', icon: <Bitcoin size={14} />, color: 'from-amber-500 to-yellow-600' },
    { type: 'REAL_ESTATE', label: '부동산', icon: <Building size={14} />, color: 'from-purple-500 to-pink-600' },
    { type: 'CASH', label: '현금', icon: <Banknote size={14} />, color: 'from-sky-500 to-cyan-600' },
    { type: 'LIABILITY', label: '부채', icon: <CreditCard size={14} />, color: 'from-rose-500 to-red-600' },
  ];

  return (
    <div className="w-full flex flex-col gap-4 pb-8">
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-semibold backdrop-blur-xl border ${
              notification.type === 'success'
                ? 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
            }`}
          >
            {notification.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. Hero Net Worth Card (총 순자산) */}
      <div className={`relative overflow-hidden rounded-2xl p-5 border backdrop-blur-xl transition-all ${
        isLight
          ? 'bg-white/85 border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900'
          : 'bg-[#111217]/90 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white'
      }`}>
        <div className="space-y-1.5">
          <div className="flex items-start justify-between">
            <div 
              onClick={onToggleStealth} 
              className="cursor-pointer group select-none transition-all"
              title="탭하여 잔액 숨김/표시"
            >
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-light">
                <span>총 순자산</span>
                <span className="text-[10px] opacity-0 group-hover:opacity-60 transition-opacity">
                  {stealthMode ? '· 마스킹됨' : '· 탭하여 숨김'}
                </span>
              </div>
              <div className={`mt-1 text-fluid-hero font-light tracking-tight tabular-nums transition-all ${
                stealthMode ? 'blur-md select-none opacity-60' : 'text-white'
              }`}>
                {formattedNetWorth}
              </div>
              <div className={`mt-1 text-xs font-light text-neutral-400 tabular-nums ${
                stealthMode ? 'blur-xs select-none' : ''
              }`}>
                총 자산 {formatCurrency(Math.round(totalAssets), currentCurrency)}
              </div>
            </div>
            <span className="text-[11px] font-light text-neutral-400 tabular-nums pt-0.5">
              {accounts.length}개 계좌
            </span>
          </div>

          {isMultiCurrencyMode && dualCurrency && (
            <div className={`mt-1 ${stealthMode ? 'blur-xs select-none opacity-60' : ''}`}>
              <span className="text-xs font-light text-neutral-400 tracking-wide whitespace-nowrap tabular-nums">
                ≈ {dualCurrency.secondaryFormatted} · 환율 {dualCurrency.rateText}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. 3 Action Buttons Grid: grid grid-cols-3 gap-2.5 w-full */}
      <div className="grid grid-cols-3 gap-2.5 w-full">
        <button
          id="vault-scan-balance-btn"
          type="button"
          onClick={() => setShowScanModal(true)}
          className="h-10 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs py-2 px-1 rounded-xl text-neutral-300 hover:text-white transition-all active:scale-95 flex items-center justify-center text-center font-normal whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span className="whitespace-nowrap">화면 스캔</span>
        </button>

        <button
          id="vault-transfer-btn"
          type="button"
          onClick={() => setIsTransferModalOpen(true)}
          className="h-10 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs py-2 px-1 rounded-xl text-neutral-300 hover:text-white transition-all active:scale-95 flex items-center justify-center text-center font-normal whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span className="whitespace-nowrap">계좌 간 이체</span>
        </button>

        <button
          id="vault-add-account-btn"
          type="button"
          onClick={() => setShowAddModal(true)}
          className="h-10 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs py-2 px-1 rounded-xl text-neutral-300 hover:text-white transition-all active:scale-95 flex items-center justify-center text-center font-normal whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span className="whitespace-nowrap">자산 추가</span>
        </button>
      </div>

      {/* 3. Portfolio Ratio Card (자산 포트폴리오 비중) */}
      <div className={`p-5 rounded-2xl border backdrop-blur-xl transition-all ${
        isLight
          ? 'bg-white/85 border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900'
          : 'bg-[#111217]/90 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white'
      }`}>
        <div className="flex items-center justify-between mb-3.5">
          <h2 className={`text-sm font-normal tracking-wide ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
            자산 포트폴리오 비중
          </h2>
          <span className={`text-xs font-light ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            총 {accounts.length}개 계좌
          </span>
        </div>

        {totalAssets > 0 || totalLiabilities > 0 ? (
          <div className="space-y-3 px-1 py-1">
            {portfolioRows.map((item) => (
              <div key={item.type} className="group">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${isLight ? 'text-slate-700' : 'text-neutral-300'}`}>
                    {item.label}
                  </span>
                  <div className="flex items-center gap-2.5">
                    <span className={`text-xs tabular-nums font-mono ${
                      isLight ? 'text-slate-900' : 'text-white'
                    } ${stealthMode && item.amount > 0 ? 'blur-xs' : ''}`}>
                      {formatCurrency(item.amount, currentCurrency)}
                    </span>
                    <span className={`text-xs font-mono w-10 text-right ${
                      isLight ? 'text-slate-500' : 'text-neutral-400'
                    }`}>
                      {item.percentage > 0 ? `${item.percentage.toFixed(0)}%` : '0%'}
                    </span>
                  </div>
                </div>
                <div className={`w-full h-1.5 rounded-full overflow-hidden mt-1.5 ${
                  isLight ? 'bg-slate-200/80' : 'bg-white/[0.06]'
                }`}>
                  <div
                    style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
                    className={`h-full ${item.barColor} rounded-full transition-all duration-500`}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-4 text-center text-xs font-light text-slate-400">
            등록된 자산이 없습니다. 상단의 '화면 스캔' 또는 '자산 추가'로 시작해보세요.
          </div>
        )}
      </div>

      {/* 4. Account Type Filter Pills (전체, 투자, 예적금, 가상자산...) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
        <button
          type="button"
          onClick={() => setSelectedFilter('ALL')}
          className={`px-3 py-1 rounded-full text-xs font-normal whitespace-nowrap transition-all border shrink-0 cursor-pointer ${
            selectedFilter === 'ALL'
              ? isLight
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white/[0.1] text-white border-white/20'
              : isLight
              ? 'bg-transparent text-slate-600 hover:text-slate-950 border-slate-200/60'
              : 'bg-transparent text-slate-400 hover:text-slate-200 border-white/[0.06]'
          }`}
        >
          전체 ({accounts.length})
        </button>

        {assetCategories.map((cat) => {
          const count = accounts.filter((a) => a.assetType === cat.type).length;
          return (
            <button
              key={cat.type}
              type="button"
              onClick={() => setSelectedFilter(cat.type)}
              className={`px-3 py-1 rounded-full text-xs font-normal whitespace-nowrap transition-all flex items-center gap-1 border shrink-0 cursor-pointer ${
                selectedFilter === cat.type
                  ? isLight
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white/[0.1] text-white border-white/20'
                  : isLight
                  ? 'bg-transparent text-slate-600 hover:text-slate-950 border-slate-200/60'
                  : 'bg-transparent text-slate-400 hover:text-slate-200 border-white/[0.06]'
              }`}
            >
              <span>{cat.label}</span>
              <span className="opacity-60 tabular-nums">({count})</span>
            </button>
          );
        })}
      </div>

      {/* 5. Account List Feed & Empty State Card (등록된 계좌가 없습니다) */}
      {accounts.length === 0 ? (
        <div className={`p-6 rounded-2xl border text-center space-y-4 transition-all ${
          isLight 
            ? 'bg-white/80 backdrop-blur-2xl border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900' 
            : 'bg-[#111217]/90 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white'
        }`}>
          <h2 className={`text-sm font-medium tracking-tight ${isLight ? 'text-slate-900' : 'text-neutral-200'}`}>
            등록된 계좌가 없습니다
          </h2>

          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              id="vault-empty-add-btn"
              onClick={() => setShowAddModal(true)}
              className="bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.08] rounded-xl px-4 py-2 font-normal text-xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
            >
              <span>직접 등록</span>
            </button>

            <button
              type="button"
              id="vault-empty-scan-btn"
              onClick={() => setShowScanModal(true)}
              className="bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.08] rounded-xl px-4 py-2 font-normal text-xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
            >
              <span>캡처 스캔</span>
            </button>
          </div>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className={`p-6 rounded-2xl border text-center space-y-2.5 ${
          isLight ? 'bg-slate-50/70 border-slate-200 text-slate-500' : 'bg-[#111217]/90 backdrop-blur-xl border border-white/[0.06] text-neutral-400'
        }`}>
          <p className="text-xs font-light">선택한 분류에 해당하는 자산 계좌가 없습니다.</p>
          <button
            type="button"
            onClick={() => setSelectedFilter('ALL')}
            className="text-xs text-neutral-300 hover:text-white underline font-normal cursor-pointer"
          >
            전체 계좌 보기
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredAccounts.map((acc) => {
            const converted = convertCurrency(
              acc.currentBalance,
              acc.currency || 'KRW',
              currentCurrency,
              fxRates
            );

            return (
              <div
                key={acc.id}
                className={`group relative rounded-2xl p-4 border transition-all duration-150 backdrop-blur-xl ${
                  isLight
                    ? 'bg-white/85 border-slate-200/80 hover:border-slate-300 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)]'
                    : 'bg-[#111217]/90 backdrop-blur-xl border border-white/[0.06] hover:border-white/[0.12] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]'
                }`}
              >
                {/* Header: Institution/Account info (Left) & Balance (Right) */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-sm font-normal truncate ${isLight ? 'text-slate-900' : 'text-neutral-200'}`}
                        title={acc.institution}
                      >
                        {acc.institution}
                      </span>
                      <span className="text-white/20 font-light text-xs">·</span>
                      <span className={`text-xs font-light shrink-0 ${
                        acc.assetType === 'LIABILITY'
                          ? 'text-rose-400/90'
                          : isLight ? 'text-slate-500' : 'text-neutral-400'
                      }`}>
                        {getAssetCategoryKo(acc.assetType)}
                      </span>
                    </div>
                    <p
                      className={`text-xs font-light truncate mt-0.5 ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}
                      title={acc.accountName}
                    >
                      {acc.accountName}
                    </p>
                  </div>

                  {/* Right: Balance strictly right-aligned */}
                  <div className="flex-none text-right">
                    <div className={`text-sm font-medium tracking-tight tabular-nums text-right ${
                      acc.assetType === 'LIABILITY' ? 'text-rose-400/90' : isLight ? 'text-slate-900' : 'text-neutral-100'
                    } ${stealthMode ? 'blur-sm select-none' : ''}`}>
                      {formatCurrency(converted, currentCurrency)}
                    </div>
                  </div>
                </div>

                {/* Sub row: Account details / Note & Edit/Delete Actions */}
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-white/[0.04]">
                  <div className="min-w-0 flex-1">
                    {(acc.accountNumberMasked || acc.note) ? (
                      <p
                        className={`text-[11px] font-light truncate ${
                          isLight ? 'text-slate-500' : 'text-neutral-400'
                        }`}
                        title={acc.accountNumberMasked || acc.note}
                      >
                        {acc.accountNumberMasked || acc.note}
                      </p>
                    ) : (
                      <div />
                    )}
                  </div>

                  {/* Actions (수정 & 삭제) */}
                  <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBalanceAccount(acc);
                        setNewBalanceInput(acc.currentBalance.toString());
                      }}
                      title="잔고 수정"
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-neutral-400'
                      }`}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAccount(acc.id, acc.accountName)}
                      title="계좌 삭제"
                      className={`p-1.5 rounded-lg transition-colors text-rose-400/80 hover:text-rose-400 cursor-pointer ${
                        isLight ? 'hover:bg-rose-50' : 'hover:bg-rose-500/10'
                      }`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Holdings Sub-List if available */}
                {acc.holdings && acc.holdings.length > 0 && (
                  <div className={`mt-2.5 pt-2 border-t space-y-1.5 ${
                    isLight ? 'border-slate-200/60' : 'border-white/[0.04]'
                  }`}>
                    <span className="text-[11px] font-light text-neutral-400 block">
                      보유 종목 ({acc.holdings.length})
                    </span>
                    <div className="space-y-1 max-h-24 overflow-y-auto scrollbar-none divide-y divide-white/[0.03]">
                      {acc.holdings.map((h, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs font-light gap-2 pt-1">
                          <span className="truncate min-w-0 flex-1 text-neutral-300" title={h.name}>{h.name}</span>
                          <div className="flex items-center gap-1.5 flex-none">
                            <span className="font-normal text-neutral-200 tabular-nums">
                              {formatCurrency(h.valuation, currentCurrency)}
                            </span>
                            {h.profitRate !== undefined && (
                              <span className={`text-[11px] font-light tabular-nums ${
                                h.profitRate >= 0 ? 'text-rose-400' : 'text-sky-400'
                              }`}>
                                {h.profitRate >= 0 ? `+${h.profitRate}%` : `${h.profitRate}%`}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 6. Credit Card Liability Tracking & Settlement Section (신용카드 미결제 잔액 관리) */}
      <div className={`p-5 rounded-2xl border backdrop-blur-xl transition-all ${
        isLight
          ? 'bg-white/85 border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900'
          : 'bg-[#111217]/90 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white'
      }`}>
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.04]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
              <CreditCard size={13} />
            </div>
            <div>
              <h2 className={`text-sm font-medium tracking-wide ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                신용카드 미결제 잔액 관리
              </h2>
            </div>
          </div>
          <div className="text-right">
            <span className={`text-xs font-mono font-medium tabular-nums ${
              totalCardLiabilities > 0 ? 'text-rose-400/90' : isLight ? 'text-slate-600' : 'text-neutral-400'
            } ${stealthMode ? 'blur-xs select-none' : ''}`}>
              총 {formatCurrency(totalCardLiabilities, currentCurrency)}
            </span>
          </div>
        </div>

        {trackedCreditCards.length === 0 ? (
          <div className="py-5 text-center text-xs font-light text-slate-400">
            기록된 신용카드 사용 내역이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {trackedCreditCards.map((card) => {
              const isSettled = card.unpaidLiability === 0;
              return (
                <div key={card.id} className="py-3.5 first:pt-3 last:pb-1 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-medium ${isLight ? 'text-slate-900' : 'text-neutral-100'}`}>
                          {card.name}
                        </span>
                        {card.billingDay && (
                          <span className="text-[10px] text-neutral-400 font-light">
                            매월 {card.billingDay}일 결제
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          isSettled
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {isSettled ? '정산 완료' : '청구 예정'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-light mt-1 flex-wrap">
                        <span>카드 지출 +{formatCurrency(card.totalExpenses, currentCurrency)}</span>
                        <span>·</span>
                        <span>납부 차감 -{formatCurrency(card.totalPayments, currentCurrency)}</span>
                        {card.reconcileOffset !== 0 && (
                          <>
                            <span>·</span>
                            <span className="text-sky-400">
                              조정 {card.reconcileOffset > 0 ? '+' : ''}{formatCurrency(card.reconcileOffset, currentCurrency)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className={`text-sm font-semibold tabular-nums text-right ${
                        card.unpaidLiability > 0
                          ? 'text-rose-400'
                          : isLight ? 'text-slate-800' : 'text-neutral-200'
                      } ${stealthMode ? 'blur-xs select-none' : ''}`}>
                        {formatCurrency(card.unpaidLiability, currentCurrency)}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenReconcile(card)}
                        className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-normal px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          isLight
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                            : 'bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border-white/[0.08]'
                        }`}
                        title="청구할인, 해외수수료, 할부 차액 조정"
                      >
                        <RefreshCw size={10} />
                        <span>차액 조정 (Reconcile)</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 7. Recent Transactions Preview (최근 거래) */}
      <div className={`p-5 rounded-2xl border backdrop-blur-xl transition-all ${
        isLight 
          ? 'bg-white/85 border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900' 
          : 'bg-[#111217]/90 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white'
      }`}>
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.04]">
          <h2 className="text-sm font-medium tracking-wide text-slate-200">
            최근 거래
          </h2>
          {onNavigateToLedger && (
            <button
              type="button"
              onClick={onNavigateToLedger}
              className="text-xs text-neutral-400 hover:text-white font-light flex items-center gap-1 transition-colors group cursor-pointer"
            >
              <span>전체보기</span>
              <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>

        {localTransactions.length === 0 ? (
          <div className="py-6 text-center text-xs font-light text-slate-400">
            기록된 거래 내역이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {localTransactions.slice(0, 5).map((t) => {
              const isExpense = t.type === 'EXPENSE';
              const isIncome = t.type === 'INCOME';
              return (
                <div key={t.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-normal text-neutral-200 truncate">{t.description}</span>
                      <span className="text-[11px] text-neutral-400 font-light shrink-0">
                        {t.category ? getCategoryKo(t.category) : ''}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-400 font-light mt-0.5">
                      <span>{format(parseISO(t.date), 'M.d HH:mm')}</span>
                      {t.paymentMethod && <span className="ml-1.5 opacity-70">· {t.paymentMethod}</span>}
                    </div>
                  </div>
                  <div className={`font-medium tabular-nums whitespace-nowrap text-xs ${
                    isIncome ? 'text-sky-400' : isExpense ? 'text-slate-200' : 'text-blue-400'
                  } ${stealthMode ? 'blur-xs' : ''}`}>
                    {isExpense ? '-' : isIncome ? '+' : ''}{getCurrencySymbol(t.currency || currentCurrency)}{t.amount.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* TRANSFER MODAL */}
      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        accounts={accounts}
        currentCurrency={currentCurrency}
        theme={theme}
        onTransferComplete={async () => {
          await loadAccounts();
          if (onTransactionAdded) onTransactionAdded();
          showToast('계좌 간 이체가 안전하게 완료되었습니다 (소비 지출 제외).');
        }}
        onOpenAddAccount={() => setShowAddModal(true)}
      />

      {/* QUICK BALANCE EDIT MODAL */}
      {editingBalanceAccount && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-0 sm:p-4"
          onClick={() => setEditingBalanceAccount(null)}
        >
          <div 
            className={`w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-white/[0.08] shadow-2xl overflow-hidden transition-colors animate-in slide-in-from-bottom-6 duration-200 ${
              isLight ? 'bg-white text-slate-900 border-slate-200 shadow-slate-300/40' : 'bg-[#111217] text-neutral-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile drag handle */}
            <div className="w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 bg-white/20" />

            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.06]">
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-white">{editingBalanceAccount.accountName}</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {editingBalanceAccount.institution} 잔고 수정
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingBalanceAccount(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                aria-label="닫기"
              >
                <X size={17} />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                  새 잔고 금액 ({editingBalanceAccount.currency || currentCurrency})
                </label>
                <input
                  type="number"
                  step="any"
                  value={newBalanceInput}
                  onChange={(e) => setNewBalanceInput(e.target.value)}
                  className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all tabular-nums"
                  placeholder="0"
                  autoFocus
                />
              </div>

              {/* Quick Add Presets */}
              <div className="flex items-center gap-1.5">
                {[100000, 500000, 1000000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      const cur = parseFloat(newBalanceInput) || 0;
                      setNewBalanceInput((cur + preset).toString());
                    }}
                    className="px-2.5 py-1 rounded-full text-xs font-normal bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 transition-colors cursor-pointer"
                  >
                    +{preset >= 10000 ? `${preset / 10000}만` : preset}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setNewBalanceInput('0')}
                  className="px-2.5 py-1 rounded-full text-xs font-normal bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 ml-auto transition-colors cursor-pointer"
                >
                  초기화
                </button>
              </div>

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingBalanceAccount(null)}
                  className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuickBalance}
                  className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-sm font-semibold transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                >
                  잔고 저장
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* GEMINI MULTIMODAL SCREENSHOT SCANNER MODAL */}
      {showScanModal && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-0 sm:p-4"
          onClick={() => {
            setShowScanModal(false);
            setScannedResult(null);
            setScanPreviewUrl(null);
          }}
        >
          <div 
            className={`w-full max-w-md max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-white/[0.08] shadow-2xl overflow-hidden transition-colors animate-in slide-in-from-bottom-6 duration-200 ${
              isLight ? 'bg-white text-slate-900 border-slate-200 shadow-slate-300/40' : 'bg-[#111217] text-neutral-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile drag handle */}
            <div className="w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 bg-white/20" />

            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.06] shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-white">계좌/증권 잔고 캡처 스캔</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Gemini 멀티모달 AI가 스크린샷에서 잔고를 자동 추출합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowScanModal(false);
                  setScannedResult(null);
                  setScanPreviewUrl(null);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                aria-label="닫기"
              >
                <X size={17} />
              </button>
            </div>

            <div className="p-5 sm:px-6 sm:py-5 overflow-y-auto">
              {!scannedResult ? (
                <div className="space-y-4">
                  {/* Upload Drop Zone */}
                  <div
                    onDragEnter={handleScreenshotDragEnter}
                    onDragOver={handleScreenshotDragOver}
                    onDragLeave={handleScreenshotDragLeave}
                    onDrop={handleScreenshotDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                      isScreenshotDraggingOver ? 'border-white/40 bg-white/[0.06] scale-[1.01]' : ''
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      className="hidden"
                    />

                    {isScanning ? (
                      <div className="py-6 flex flex-col items-center gap-3">
                        <Loader2 size={30} className="animate-spin text-white" />
                        <span className="text-sm font-semibold text-white">
                          Gemini 3.8 Flash가 계좌 잔고를 분석하고 있습니다...
                        </span>
                        <span className="text-xs text-neutral-400">
                          (1280px 자동 압축 · 메타데이터 자동 제거 완료)
                        </span>
                      </div>
                    ) : scanPreviewUrl ? (
                      <div className="relative w-full max-h-48 overflow-hidden rounded-xl">
                        <img src={scanPreviewUrl} alt="Preview" className="w-full object-cover" />
                      </div>
                    ) : (
                      <>
                        <div className={`w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] text-neutral-300 flex items-center justify-center mx-auto mb-3 transition-transform ${
                          isScreenshotDraggingOver ? 'scale-110' : ''
                        }`}>
                          <UploadCloud size={20} className={isScreenshotDraggingOver ? 'animate-bounce' : ''} />
                        </div>
                        <p className="text-sm font-semibold text-white">
                          {isScreenshotDraggingOver ? '여기에 스크린샷을 놓으세요' : '토스증권, 카카오페이증권, 은행 앱 캡처 업로드'}
                        </p>
                        <p className="text-xs text-neutral-400 mt-1">
                          드래그 앤 드롭 · 파일 선택 · 클립보드 붙여넣기(Cmd+V) 지원 (최대 15MB)
                        </p>
                      </>
                    )}
                  </div>

                  {/* Privacy Notice */}
                  <p className="text-[11px] text-neutral-400 text-center mt-3">
                    프라이버시 보장: 계좌번호·주민번호 등 민감 정보는 자동 마스킹되며 서버에 보관되지 않습니다.
                  </p>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowScanModal(false);
                        setScannedResult(null);
                        setScanPreviewUrl(null);
                      }}
                      className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                /* Scanned Result Confirmation */
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                        <Check size={14} /> AI 잔고 감지 완료
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-neutral-300 font-medium">
                        정확도 {Math.round(scannedResult.confidenceScore * 100)}%
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div>
                        <span className="text-[10px] text-neutral-400 block">금융기관</span>
                        <span className="text-xs font-semibold text-white">{scannedResult.institution}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-400 block">계좌명</span>
                        <span className="text-xs font-semibold text-white">{scannedResult.accountName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-400 block">자산 유형</span>
                        <span className="text-xs font-semibold text-white">{getAssetCategoryKo(scannedResult.assetType)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-400 block">추출된 총 잔고</span>
                        <span className="text-sm font-semibold text-white">
                          {formatCurrency(scannedResult.currentBalance, scannedResult.currency || currentCurrency)}
                        </span>
                      </div>
                    </div>

                    {(scannedResult.cashBalance !== undefined || scannedResult.investedAssets !== undefined) && (
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/[0.06] text-xs">
                        {scannedResult.investedAssets !== undefined && (
                          <div>
                            <span className="text-[10px] text-neutral-400 block">투자 자산 평가액</span>
                            <span className="font-semibold text-emerald-400">
                              {formatCurrency(scannedResult.investedAssets, scannedResult.currency || currentCurrency)}
                            </span>
                          </div>
                        )}
                        {scannedResult.cashBalance !== undefined && (
                          <div>
                            <span className="text-[10px] text-neutral-400 block">예수금 / 현금</span>
                            <span className="font-semibold text-sky-400">
                              {formatCurrency(scannedResult.cashBalance, scannedResult.currency || currentCurrency)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {scannedResult.holdings && scannedResult.holdings.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-white/[0.06]">
                        <span className="text-[10px] text-neutral-400 block mb-1">인식된 보유 종목 ({scannedResult.holdings.length})</span>
                        <div className="text-[11px] space-y-0.5 text-neutral-300">
                          {scannedResult.holdings.slice(0, 3).map((h: any, i: number) => (
                            <div key={i} className="flex justify-between">
                              <span>{h.name}</span>
                              <span className="font-medium text-white">{formatCurrency(h.valuation, currentCurrency)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Target Account Selection */}
                  <div>
                    <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                      반영할 대상 계좌 선택
                    </label>
                    <select
                      value={scanTargetAccountId}
                      onChange={(e) => setScanTargetAccountId(e.target.value)}
                      className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white focus:border-white/25 focus:ring-0 outline-none transition-all cursor-pointer"
                    >
                      <option value="new" className="bg-[#111217] text-white">+ 신규 계좌로 등록하기</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id} className="bg-[#111217] text-white">
                          {acc.institution} - {acc.accountName} (기존 ₩{acc.currentBalance.toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setScannedResult(null)}
                      className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
                    >
                      다시 스캔
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmScannedAsset}
                      className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-sm font-semibold transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                    >
                      잔고 반영 확정
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ADD ACCOUNT MODAL */}
      {showAddModal && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-0 sm:p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div 
            className={`w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-white/[0.08] shadow-2xl flex flex-col max-h-[85dvh] sm:max-h-[88dvh] overflow-hidden transition-colors animate-in slide-in-from-bottom-6 duration-200 ${
              isLight 
                ? 'bg-white text-slate-900 border-slate-200 shadow-slate-300/40' 
                : 'bg-[#111217] text-neutral-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile drag handle */}
            <div className="w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 bg-white/20" />

            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.06] shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-white">
                  새 자산 계좌 추가
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  증권, 은행, 가상자산, 부동산 등
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                aria-label="닫기"
                title="닫기"
              >
                <X size={17} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateAccount} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 sm:px-6 sm:py-5 space-y-4 overscroll-contain">
                {/* 자산 유형 */}
                <div>
                  <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                    자산 유형
                  </label>
                  <select
                    value={newAccountForm.assetType}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, assetType: e.target.value as AssetCategoryType })}
                    className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white focus:border-white/25 focus:ring-0 outline-none transition-all cursor-pointer"
                  >
                    {assetCategories.map((c) => (
                      <option key={c.type} value={c.type} className="bg-[#111217] text-white">
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 기관명 */}
                <div>
                  <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                    기관명
                  </label>
                  <input
                    type="text"
                    value={newAccountForm.institution}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, institution: e.target.value })}
                    placeholder="토스증권, 카카오페이증권, 업비트 등"
                    required
                    className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all"
                  />
                </div>

                {/* 계좌명 / 포트폴리오 별칭 */}
                <div>
                  <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                    계좌명 / 포트폴리오 별칭
                  </label>
                  <input
                    type="text"
                    value={newAccountForm.accountName}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, accountName: e.target.value })}
                    placeholder="해외주식 종합계좌, 비트코인 적립 등"
                    required
                    className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all"
                  />
                </div>

                {/* 현재 잔고 / 평가액 */}
                <div>
                  <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                    현재 잔고 / 평가액 ({currentCurrency})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newAccountForm.balance}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, balance: e.target.value })}
                    placeholder="10000000"
                    required
                    className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all tabular-nums"
                  />
                </div>

                {/* 메모 (선택) */}
                <div>
                  <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                    메모 (선택)
                  </label>
                  <input
                    type="text"
                    value={newAccountForm.note}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, note: e.target.value })}
                    placeholder="S&P 500, 배당주 위주"
                    className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Action Footer */}
              <div className="flex items-center gap-2.5 p-5 sm:px-6 sm:py-4 border-t border-white/[0.06] shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-sm font-semibold transition-all shadow-sm active:scale-[0.99] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check size={16} />
                  계좌 추가
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* DELETE ACCOUNT CONFIRMATION MODAL */}
      {deletingAccount && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setDeletingAccount(null)}
        >
          <div 
            className={`w-full max-w-sm rounded-3xl border border-white/[0.08] p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 ${
              isLight ? 'bg-white text-slate-900 border-slate-200' : 'bg-[#111217] text-neutral-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 size={18} />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-white">자산 계좌 삭제</h3>
                <p className="text-xs text-neutral-400 mt-0.5">계좌 잔고 및 연결 데이터 제거</p>
              </div>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              <span className="font-semibold text-white">'{deletingAccount.name}'</span> 계좌를 삭제하시겠습니까? 계좌 잔고 및 연결 데이터가 목록에서 완전히 제외됩니다.
            </p>
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDeletingAccount(null)}
                className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAccount}
                className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-semibold transition-all shadow-sm active:scale-[0.99] cursor-pointer"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* CREDIT CARD RECONCILIATION MODAL */}
      {reconcilingCard && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-0 sm:p-4"
          onClick={() => setReconcilingCard(null)}
        >
          <div 
            className={`w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-white/[0.08] shadow-2xl overflow-hidden transition-colors animate-in slide-in-from-bottom-6 duration-200 ${
              isLight ? 'bg-white text-slate-900 border-slate-200 shadow-slate-300/40' : 'bg-[#111217] text-neutral-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile drag handle */}
            <div className="w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 bg-white/20" />

            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.06]">
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-white">
                  {reconcilingCard.name} 차액 조정 (Reconcile)
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  청구할인 · 해외수수료 · 할부 차액 정산
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReconcilingCard(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                aria-label="닫기"
              >
                <X size={17} />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2 text-xs">
                <div className="flex justify-between text-neutral-400">
                  <span>누적 카드 지출 합계</span>
                  <span className="font-mono text-neutral-200">+{formatCurrency(reconcilingCard.totalExpenses, currentCurrency)}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>카드대금 납부(출금) 합계</span>
                  <span className="font-mono text-neutral-200">-{formatCurrency(reconcilingCard.totalPayments, currentCurrency)}</span>
                </div>
                <div className="pt-1.5 border-t border-white/[0.04] flex justify-between font-medium">
                  <span className="text-neutral-300">현재 계산된 장부 잔액</span>
                  <span className="font-mono text-rose-400">{formatCurrency(reconcilingCard.unpaidLiability, currentCurrency)}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                  조정 후 맞출 미결제 잔액 ({currentCurrency})
                </label>
                <input
                  type="number"
                  step="any"
                  value={reconcileTargetInput}
                  onChange={(e) => setReconcileTargetInput(e.target.value)}
                  className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all tabular-nums"
                  placeholder="0"
                  autoFocus
                />
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReconcileTargetInput('0')}
                  className="flex-1 py-1.5 px-2 rounded-lg text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 transition-colors text-center cursor-pointer"
                >
                  0원으로 맞춤 (완납/청구할인)
                </button>
                <button
                  type="button"
                  onClick={() => setReconcileTargetInput(reconcilingCard.rawRunningBalance.toString())}
                  className="py-1.5 px-2.5 rounded-lg text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 border border-white/[0.08] transition-colors cursor-pointer"
                >
                  원래 계산값
                </button>
              </div>

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setReconcilingCard(null)}
                  className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleApplyReconciliation}
                  className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-sm font-semibold transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                >
                  조정 반영 확정
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default VaultOverviewSection;
