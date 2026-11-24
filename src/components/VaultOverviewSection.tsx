import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { lazyWithRetry } from '../lazyWithRetry';
import { AlertCircle, Check } from 'lucide-react';
import {
  AssetAccount,
  AssetCategoryType,
  SupportedCurrency,
  FxRates,
  Transaction,
  DebtItem,
} from '../types';
import {
  getAllAssetAccounts,
  getAllDebts,
  saveAssetAccount,
  deleteAssetAccount,
  updateAssetAccountBalance,
  loadSampleData,
  getAllTransactions,
} from '../db';
import {
  convertCurrency,
  formatCurrency,
  getDualCurrencyComparison,
  computeFinancialAggregates,
  getUserAssets,
  RECOMMENDED_USER_ASSETS,
} from '../utils';
import { detectCreditCardSettlement } from '../finance/lightweightDetectors';
import { useI18n } from '../i18n';
import { VaultNetWorthHero } from './vault/VaultNetWorthHero';
import { VaultAllocationChart, PortfolioAllocationRow } from './vault/VaultAllocationChart';
import {
  VaultAccountList,
  TrackedCreditCard,
  VaultAssetCategoryMeta,
} from './vault/VaultAccountList';
import { VaultActionModals } from './vault/VaultActionModals';

const TransferModal = lazyWithRetry(() => import('./VaultTransferModal'));

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
  openAddAccountSignal?: number;
  onConsumeAddAccountSignal?: () => void;
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
  openAddAccountSignal = 0,
  onConsumeAddAccountSignal,
}) => {
  const { t, language } = useI18n();
  const isKo = language === 'ko';
  const isLight = theme === 'light';

  const [accounts, setAccounts] = useState<AssetAccount[]>([]);
  const [debts, setDebts] = useState<DebtItem[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | AssetCategoryType>('ALL');
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>(propTransactions || []);

  // Modal visibility & selected targets
  const [showAddModal, setShowAddModal] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [editingBalanceAccount, setEditingBalanceAccount] = useState<AssetAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<{ id: string; name: string } | null>(null);
  const [reconcilingCard, setReconcilingCard] = useState<TrackedCreditCard | null>(null);

  // Toast notification with cleanup
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setNotification({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setNotification(null);
      toastTimerRef.current = null;
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Consume external signal to open Add Account Modal
  useEffect(() => {
    if (openAddAccountSignal > 0) {
      setShowAddModal(true);
      onConsumeAddAccountSignal?.();
    }
  }, [openAddAccountSignal, onConsumeAddAccountSignal]);

  const loadVaultData = useCallback(async () => {
    try {
      const [accs, dbs] = await Promise.all([getAllAssetAccounts(), getAllDebts()]);
      setAccounts(accs || []);
      setDebts(dbs || []);
    } catch (e) {
      console.error('Failed to load asset accounts & debts:', e);
    }
  }, []);

  useEffect(() => {
    loadVaultData();

    const handleDataChange = () => {
      loadVaultData();
      getAllTransactions()
        .then((txs) => {
          if (txs) setLocalTransactions(txs);
        })
        .catch(() => {});
    };

    window.addEventListener('vibe-vault-data-changed', handleDataChange);
    window.addEventListener('vibe-vault-data-reset', handleDataChange);

    return () => {
      window.removeEventListener('vibe-vault-data-changed', handleDataChange);
      window.removeEventListener('vibe-vault-data-reset', handleDataChange);
    };
  }, [loadVaultData]);

  useEffect(() => {
    if (propTransactions && propTransactions.length > 0) {
      setLocalTransactions(propTransactions);
    } else {
      getAllTransactions()
        .then((txs) => {
          if (txs && txs.length > 0) setLocalTransactions(txs);
        })
        .catch(() => {});
    }
  }, [propTransactions]);

  // Credit card reconciliation offsets (persisted in localStorage)
  const [reconcileOffsets, setReconcileOffsets] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem('vibe_card_reconcile_offsets');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const saveReconcileOffset = useCallback((cardName: string, offset: number) => {
    setReconcileOffsets((prev) => {
      const updated = { ...prev, [cardName]: offset };
      try {
        localStorage.setItem('vibe_card_reconcile_offsets', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to persist card reconcile offset', e);
      }
      return updated;
    });
  }, []);

  // Credit Card Liability Tracking
  const trackedCreditCards = useMemo<TrackedCreditCard[]>(() => {
    const userAssets = getUserAssets();
    const cardMap = new Map<string, { id?: string; name: string; billingDay?: number; accountId?: string }>();

    for (const ca of userAssets.filter((a) => a.type === 'CARD')) {
      cardMap.set(ca.name.trim(), {
        id: ca.id,
        name: ca.name.trim(),
        billingDay: ca.billingDay,
      });
    }

    for (const acc of accounts) {
      if (
        acc.assetType === 'LIABILITY' ||
        /카드|card/i.test(acc.institution) ||
        /카드|card/i.test(acc.accountName)
      ) {
        const name = (acc.institution || acc.accountName).trim();
        if (!cardMap.has(name)) {
          cardMap.set(name, { id: acc.id, name, accountId: acc.id });
        } else {
          cardMap.get(name)!.accountId = acc.id;
        }
      }
    }

    for (const tx of localTransactions) {
      const method = (tx.paymentMethod || '').trim();
      if (method && /카드|card/i.test(method) && !/체크카드/i.test(method)) {
        if (!cardMap.has(method)) {
          cardMap.set(method, { name: method });
        }
      }
    }

    if (cardMap.size === 0) {
      const rec = RECOMMENDED_USER_ASSETS.find((a) => a.type === 'CARD');
      if (rec) {
        cardMap.set(rec.name, { id: rec.id, name: rec.name, billingDay: rec.billingDay });
      }
    }

    const isMatchingCard = (txMethodOrDesc?: string, targetCardName?: string): boolean => {
      if (!txMethodOrDesc || !targetCardName) return false;
      const tNorm = txMethodOrDesc.toLowerCase().replace(/[\s\-_]/g, '');
      const cNorm = targetCardName.toLowerCase().replace(/[\s\-_]/g, '');
      if (tNorm === cNorm || tNorm.includes(cNorm) || cNorm.includes(tNorm)) return true;
      const baseCard = cNorm.replace(/카드|card|신용카드|creditcard/gi, '');
      const baseTx = tNorm.replace(/카드|card|신용카드|creditcard/gi, '');
      return baseCard.length >= 2 && (tNorm.includes(baseCard) || baseTx.includes(baseCard));
    };

    const isCardSettlementTx = (tx: Transaction): boolean => {
      if (tx.subCategory === '카드대금 납부' || tx.subCategory === '카드대금') return true;
      return tx.type === 'TRANSFER' && detectCreditCardSettlement(tx.description || '') !== null;
    };

    return Array.from(cardMap.values()).map((card) => {
      let totalExpenses = 0;
      let totalPayments = 0;
      let totalRefunds = 0;

      for (const tx of localTransactions) {
        const amt = convertCurrency(tx.amount, tx.currency || 'KRW', currentCurrency, fxRates);
        if (tx.type === 'EXPENSE' && isMatchingCard(tx.paymentMethod, card.name)) {
          totalExpenses += amt;
        }
        if (tx.type === 'TRANSFER' && isCardSettlementTx(tx)) {
          if (
            isMatchingCard(tx.paymentMethod, card.name) ||
            isMatchingCard(tx.description, card.name) ||
            cardMap.size === 1
          ) {
            totalPayments += amt;
          }
        }
        if (tx.type === 'SETTLEMENT' && isMatchingCard(tx.paymentMethod, card.name)) {
          totalRefunds += amt;
        }
      }

      const offset = reconcileOffsets[card.name] || 0;
      const rawRunningBalance = totalExpenses - totalPayments - totalRefunds;
      const unpaidLiability = Math.max(0, rawRunningBalance + offset);

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
        unpaidAmount: unpaidLiability,
        hasMismatch: Math.abs(rawRunningBalance) > 0 || offset !== 0,
        associatedAccountId: card.accountId,
      };
    });
  }, [accounts, localTransactions, currentCurrency, fxRates, reconcileOffsets]);

  const totalCardLiabilities = useMemo(
    () => trackedCreditCards.reduce((sum, c) => sum + c.unpaidLiability, 0),
    [trackedCreditCards]
  );

  const formattedTotalUnpaid = useMemo(
    () => formatCurrency(totalCardLiabilities, currentCurrency),
    [totalCardLiabilities, currentCurrency]
  );

  // Aggregated Net Worth Calculations (Unified with InsightsSection)
  const { totalAssets, totalLiabilities, netWorth, categoryTotals } = useMemo(() => {
    let unlinkedCardLiability = 0;
    for (const card of trackedCreditCards) {
      const isAccountMapped = accounts.some(
        (a) => a.id === card.associatedAccountId && a.assetType === 'LIABILITY'
      );
      if (!isAccountMapped) {
        unlinkedCardLiability += card.unpaidLiability;
      }
    }

    const aggregates = computeFinancialAggregates(
      accounts,
      debts,
      currentCurrency,
      fxRates,
      unlinkedCardLiability
    );

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
        catMap.LIABILITY += Math.abs(converted);
      } else if (acc.isOverdraft || converted < 0) {
        if (converted >= 0) {
          catMap[acc.assetType] = (catMap[acc.assetType] || 0) + converted;
        } else {
          catMap.LIABILITY += Math.abs(converted);
        }
      } else {
        catMap[acc.assetType] = (catMap[acc.assetType] || 0) + Math.max(0, converted);
      }
    }

    return {
      totalAssets: aggregates.totalAssets,
      totalLiabilities: aggregates.totalLiabilities,
      netWorth: aggregates.netWorth,
      categoryTotals: catMap,
    };
  }, [accounts, debts, currentCurrency, fxRates, trackedCreditCards]);

  const hasRegisteredAccounts = accounts.length > 0;

  const ledgerNetCashflow = useMemo(() => {
    let incomeSum = 0;
    let expenseSum = 0;
    for (const tx of localTransactions) {
      if (tx.isInternalTransfer || tx.type === 'TRANSFER') continue;
      const converted = convertCurrency(tx.amount, tx.currency || 'KRW', currentCurrency, fxRates);
      if (tx.type === 'INCOME' || (tx.type === 'SETTLEMENT' && tx.amount > 0)) {
        incomeSum += converted;
      } else if (tx.type === 'EXPENSE') {
        expenseSum += converted;
      }
    }
    return Math.round(incomeSum - expenseSum);
  }, [localTransactions, currentCurrency, fxRates]);

  const formattedNetWorth = useMemo(
    () => formatCurrency(Math.round(netWorth), currentCurrency),
    [netWorth, currentCurrency]
  );

  const dualCurrency = useMemo(
    () => getDualCurrencyComparison(Math.round(netWorth), currentCurrency, fxRates),
    [netWorth, currentCurrency, fxRates]
  );

  const portfolioRows = useMemo<PortfolioAllocationRow[]>(
    () => [
      {
        type: 'BROKERAGE',
        label: t('cat_investment'),
        amount: categoryTotals.BROKERAGE || 0,
        percentage: totalAssets > 0 ? ((categoryTotals.BROKERAGE || 0) / totalAssets) * 100 : 0,
        barColor: 'bg-emerald-400',
        dotColor: 'bg-emerald-400',
      },
      {
        type: 'BANK',
        label: t('cat_deposit'),
        amount: categoryTotals.BANK || 0,
        percentage: totalAssets > 0 ? ((categoryTotals.BANK || 0) / totalAssets) * 100 : 0,
        barColor: 'bg-sky-400',
        dotColor: 'bg-sky-400',
      },
      {
        type: 'CRYPTO',
        label: t('cat_crypto'),
        amount: categoryTotals.CRYPTO || 0,
        percentage: totalAssets > 0 ? ((categoryTotals.CRYPTO || 0) / totalAssets) * 100 : 0,
        barColor: 'bg-amber-400',
        dotColor: 'bg-amber-400',
      },
      {
        type: 'CASH',
        label: t('cat_cash'),
        amount: categoryTotals.CASH || 0,
        percentage: totalAssets > 0 ? ((categoryTotals.CASH || 0) / totalAssets) * 100 : 0,
        barColor: 'bg-teal-400',
        dotColor: 'bg-teal-400',
      },
      {
        type: 'REAL_ESTATE',
        label: t('cat_real_estate'),
        amount: categoryTotals.REAL_ESTATE || 0,
        percentage: totalAssets > 0 ? ((categoryTotals.REAL_ESTATE || 0) / totalAssets) * 100 : 0,
        barColor: 'bg-purple-400',
        dotColor: 'bg-purple-400',
      },
      {
        type: 'LIABILITY',
        label: t('cat_debt'),
        amount: totalLiabilities,
        percentage: totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0,
        barColor: 'bg-amber-400/80',
        dotColor: 'bg-amber-400/80',
      },
    ],
    [categoryTotals, totalAssets, totalLiabilities, t]
  );

  const assetCategories = useMemo<VaultAssetCategoryMeta[]>(
    () => [
      { type: 'BROKERAGE', label: isKo ? '투자' : 'Investments', color: 'from-blue-500 to-indigo-600' },
      { type: 'BANK', label: isKo ? '예적금' : 'Banking', color: 'from-sky-500 to-blue-600' },
      { type: 'CRYPTO', label: isKo ? '가상자산' : 'Crypto', color: 'from-amber-500 to-yellow-600' },
      { type: 'REAL_ESTATE', label: isKo ? '부동산' : 'Real Estate', color: 'from-purple-500 to-pink-600' },
      { type: 'CASH', label: isKo ? '현금' : 'Cash', color: 'from-sky-500 to-cyan-600' },
      { type: 'LIABILITY', label: isKo ? '부채' : 'Liabilities', color: 'from-neutral-700 to-neutral-800' },
    ],
    [isKo]
  );

  const filteredAccounts = useMemo(() => {
    if (selectedFilter === 'ALL') return accounts;
    if (selectedFilter === 'LIABILITY') {
      return accounts.filter(
        (a) => a.assetType === 'LIABILITY' || (a.isOverdraft && a.currentBalance < 0) || a.currentBalance < 0
      );
    }
    return accounts.filter((a) => a.assetType === selectedFilter);
  }, [accounts, selectedFilter]);

  // Stable action callbacks for memoized children
  const handleOpenScan = useCallback(() => setShowScanModal(true), []);
  const handleCloseScan = useCallback(() => setShowScanModal(false), []);
  const handleOpenTransfer = useCallback(() => setIsTransferModalOpen(true), []);
  const handleCloseTransfer = useCallback(() => setIsTransferModalOpen(false), []);
  const handleOpenAddAccount = useCallback(() => setShowAddModal(true), []);
  const handleCloseAddAccount = useCallback(() => setShowAddModal(false), []);
  const handleCloseEditBalance = useCallback(() => setEditingBalanceAccount(null), []);
  const handleCloseDeleteModal = useCallback(() => setDeletingAccount(null), []);
  const handleCloseReconcileModal = useCallback(() => setReconcilingCard(null), []);

  const handleRequestDeleteAccount = useCallback((id: string, name: string) => {
    setDeletingAccount({ id, name });
  }, []);

  const handleLoadSampleFromVault = useCallback(async () => {
    try {
      await loadSampleData();
      await loadVaultData();
      onTransactionAdded?.();
      showToast('샘플 자산 및 거래 데이터가 등록되었습니다.');
    } catch (err: any) {
      showToast('샘플 데이터 로드 실패: ' + (err.message || '오류 발생'), 'error');
    }
  }, [loadVaultData, onTransactionAdded, showToast]);

  const handleSaveQuickBalance = useCallback(
    async (account: AssetAccount, newBalance: number) => {
      try {
        if (newBalance < 0 && !account.isOverdraft) {
          await saveAssetAccount({
            ...account,
            currentBalance: newBalance,
            isOverdraft: true,
            lastUpdated: new Date().toISOString(),
          });
        } else {
          await updateAssetAccountBalance(account.id, newBalance);
        }
        await loadVaultData();
        showToast(`${account.accountName} 잔고가 업데이트되었습니다.`);
        setEditingBalanceAccount(null);
      } catch (err: any) {
        showToast(err.message || '업데이트 실패', 'error');
      }
    },
    [loadVaultData, showToast]
  );

  const handleCreateAccount = useCallback(
    async (newAcc: AssetAccount) => {
      try {
        await saveAssetAccount(newAcc);
        await loadVaultData();
        setShowAddModal(false);
        showToast(`${newAcc.accountName} 계좌가 추가되었습니다.`);
      } catch {
        showToast('계좌 추가 실패', 'error');
      }
    },
    [loadVaultData, showToast]
  );

  const handleSaveScannedAsset = useCallback(
    async (account: AssetAccount, isNew: boolean) => {
      try {
        await saveAssetAccount(account);
        await loadVaultData();
        if (isNew) {
          showToast(`'${account.accountName}' 계좌가 신규 등록되었습니다.`);
        } else {
          showToast(
            `'${account.accountName}' 잔고가 ₩${account.currentBalance.toLocaleString()}으로 업데이트되었습니다.`
          );
        }
      } catch {
        showToast('잔고 반영 실패', 'error');
      }
    },
    [loadVaultData, showToast]
  );

  const handleConfirmDeleteAccount = useCallback(async () => {
    if (!deletingAccount) return;
    try {
      await deleteAssetAccount(deletingAccount.id);
      await loadVaultData();
      showToast('계좌가 삭제되었습니다.');
    } catch {
      showToast('삭제 실패', 'error');
    } finally {
      setDeletingAccount(null);
    }
  }, [deletingAccount, loadVaultData, showToast]);

  const handleApplyReconciliation = useCallback(
    async (card: TrackedCreditCard, targetAmount: number) => {
      const newOffset = Math.round(targetAmount - card.rawRunningBalance);
      saveReconcileOffset(card.name, newOffset);

      if (card.associatedAccountId) {
        try {
          await updateAssetAccountBalance(card.associatedAccountId, targetAmount);
          await loadVaultData();
        } catch (e) {
          console.warn('Failed to update associated account balance:', e);
        }
      }

      showToast(
        `${card.name} 미결제 잔액이 ${formatCurrency(targetAmount, currentCurrency)}으로 정상 조정(Reconcile)되었습니다.`
      );
      setReconcilingCard(null);
    },
    [saveReconcileOffset, loadVaultData, showToast, currentCurrency]
  );

  const handleTransferComplete = useCallback(async () => {
    await loadVaultData();
    onTransactionAdded?.();
    showToast('계좌 간 이체가 안전하게 완료되었습니다 (소비 지출 제외).');
  }, [loadVaultData, onTransactionAdded, showToast]);

  return (
    <div className="w-full flex flex-col gap-4 pb-8">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-semibold backdrop-blur-xl border animate-in fade-in slide-in-from-top-2 duration-150 ${
            notification.type === 'success'
              ? 'bg-sky-500/20 text-sky-400 border-sky-500/30'
              : 'bg-white/10 text-neutral-200 border-white/20'
          }`}
        >
          {notification.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* 1. Hero Net Worth, Action Grid & Empty Quick-Start */}
      <VaultNetWorthHero
        currentCurrency={currentCurrency}
        isLight={isLight}
        stealthMode={stealthMode}
        hasRegisteredAccounts={hasRegisteredAccounts}
        accountsCount={accounts.length}
        transactionsCount={localTransactions.length}
        formattedNetWorth={formattedNetWorth}
        totalAssets={totalAssets}
        ledgerNetCashflow={ledgerNetCashflow}
        totalCardLiabilities={totalCardLiabilities}
        formattedTotalUnpaid={formattedTotalUnpaid}
        isMultiCurrencyMode={isMultiCurrencyMode}
        dualCurrency={dualCurrency}
        onToggleStealth={onToggleStealth}
        onOpenScan={handleOpenScan}
        onOpenTransfer={handleOpenTransfer}
        onOpenAddAccount={handleOpenAddAccount}
        onLoadSample={handleLoadSampleFromVault}
      />

      {/* 2. Asset Portfolio Allocation & Multi-Currency Exposure */}
      {hasRegisteredAccounts && (
        <VaultAllocationChart
          portfolioRows={portfolioRows}
          accounts={accounts}
          currentCurrency={currentCurrency}
          fxRates={fxRates}
          isLight={isLight}
          stealthMode={stealthMode}
        />
      )}

      {/* 3. Categorized Account Cards, Credit Card Liabilities & Recent Transactions */}
      <VaultAccountList
        accounts={accounts}
        filteredAccounts={filteredAccounts}
        assetCategories={assetCategories}
        selectedFilter={selectedFilter}
        onSelectFilter={setSelectedFilter}
        currentCurrency={currentCurrency}
        fxRates={fxRates}
        isLight={isLight}
        stealthMode={stealthMode}
        onEditBalance={setEditingBalanceAccount}
        onDeleteAccount={handleRequestDeleteAccount}
        trackedCreditCards={trackedCreditCards}
        totalCardLiabilities={totalCardLiabilities}
        formattedTotalUnpaid={formattedTotalUnpaid}
        onOpenReconcile={setReconcilingCard}
        recentTransactions={localTransactions}
        onNavigateToLedger={onNavigateToLedger}
      />

      {/* Lazy-Loaded Transfer Modal */}
      {isTransferModalOpen && (
        <Suspense fallback={null}>
          <TransferModal
            isOpen={isTransferModalOpen}
            onClose={handleCloseTransfer}
            accounts={accounts}
            currentCurrency={currentCurrency}
            theme={theme}
            onTransferComplete={handleTransferComplete}
            onOpenAddAccount={handleOpenAddAccount}
          />
        </Suspense>
      )}

      {/* Isolated Account CRUD / OCR / Reconciliation Portal Modals */}
      <VaultActionModals
        isLight={isLight}
        currentCurrency={currentCurrency}
        accounts={accounts}
        assetCategories={assetCategories}
        showToast={showToast}
        editingBalanceAccount={editingBalanceAccount}
        onCloseEditBalance={handleCloseEditBalance}
        onSaveQuickBalance={handleSaveQuickBalance}
        showScanModal={showScanModal}
        onCloseScanModal={handleCloseScan}
        onSaveScannedAsset={handleSaveScannedAsset}
        showAddModal={showAddModal}
        onCloseAddModal={handleCloseAddAccount}
        onCreateAccount={handleCreateAccount}
        deletingAccount={deletingAccount}
        onCloseDeleteModal={handleCloseDeleteModal}
        onConfirmDeleteAccount={handleConfirmDeleteAccount}
        reconcilingCard={reconcilingCard}
        onCloseReconcileModal={handleCloseReconcileModal}
        onApplyReconciliation={handleApplyReconciliation}
      />
    </div>
  );
};

export default VaultOverviewSection;
