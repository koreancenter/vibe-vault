import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  getAllTransactions, 
  addTransaction, 
  deleteTransaction, 
  updateTransaction, 
  clearAllTransactions 
} from '../db';
import { Transaction } from '../types';
import { format } from 'date-fns';

export type LedgerFilterType = 'ALL' | 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'SETTLEMENT';

export interface UseTransactionsReturn {
  // Primary state
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  count: number;
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  clearError: () => void;

  // View and Filter State
  selectedCategory: string | null;
  setSelectedCategory: (cat: string | null) => void;
  ledgerFilter: LedgerFilterType;
  setLedgerFilter: React.Dispatch<React.SetStateAction<LedgerFilterType>>;
  filteredStreamTransactions: Transaction[];
  filteredLedgerTransactions: Transaction[];

  // Mutative Operations
  loadTransactions: () => Promise<Transaction[]>;
  add: (tx: Transaction) => Promise<void>;
  batchAdd: (txs: Transaction[]) => Promise<void>;
  update: (tx: Transaction) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;

  // Utilities
  exportCSV: () => void;
}

/**
 * Custom Hook: useTransactions
 * Architectural Domain: Persistence & Transaction State Lifecycle
 * 
 * Encapsulates all IndexedDB CRUD operations, filtering, optimistic local updates,
 * and structured data export for the transaction stream.
 */
export function useTransactions(): UseTransactionsReturn {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilterType>('ALL');

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Load all transactions from local IndexedDB
   */
  const loadTransactions = useCallback(async (): Promise<Transaction[]> => {
    setIsLoading(true);
    try {
      const data = await getAllTransactions();

      // Auto-repair any erroneously categorized income transactions stored in DB
      const repaired = data.map((t) => {
        let changed = false;
        let updated: Transaction = { ...t };

        const desc = updated.description || '';
        const isIncomeText = /(?:월급|급여|보너스|상여금|수당|용돈|배당금|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|salary|paycheck|bonus|allowance)/i.test(desc);
        const isExpenseText = /(?:결제|지출|썼|사먹|구입|구매)/i.test(desc);

        if (updated.type === 'EXPENSE' && isIncomeText && !isExpenseText) {
          let cleanedDesc = desc.replace(/만\s*원\s*들어옴/i, '들어옴').replace(/\s+/g, ' ').trim();
          if (!cleanedDesc || cleanedDesc === '원') cleanedDesc = '급여 수입';
          updated.type = 'INCOME';
          updated.category = '급여';
          updated.subCategory = '정기수입';
          updated.description = cleanedDesc;
          updated.paymentMethod = '통장';
          changed = true;
        }

        // Repair income paymentMethod from Card/카드 to 통장
        if (updated.type === 'INCOME' && (!updated.paymentMethod || /^(?:card|카드|check\s*card|체크카드)$/i.test(updated.paymentMethod))) {
          updated.paymentMethod = '통장';
          changed = true;
        }

        // Repair subCategory from Subscriptions to 구독
        if (updated.subCategory === 'Subscriptions') {
          updated.subCategory = '구독';
          changed = true;
        }

        // Repair paymentMethod from Card to 카드 for expenses
        if (updated.type !== 'INCOME' && updated.paymentMethod === 'Card') {
          updated.paymentMethod = '카드';
          changed = true;
        }

        // Repair card bill payment transactions to TRANSFER with isInternalTransfer
        if (
          updated.subCategory === '카드대금' ||
          (updated.subCategory === '카드대금 납부' && (updated.type !== 'TRANSFER' || !updated.isInternalTransfer)) ||
          (updated.type === 'EXPENSE' && /(?:결제대금\s*출금|대금\s*자동이체|카드대금\s*납부|card\s*bill\s*payment)/i.test(updated.description || ''))
        ) {
          updated.type = 'TRANSFER';
          updated.subCategory = '카드대금 납부';
          updated.isInternalTransfer = true;
          changed = true;
        }

        if (changed) {
          updateTransaction(updated).catch((e) => console.warn('Failed to persist transaction auto-repair:', e));
          return updated;
        }
        return t;
      });

      // Ensure most recent transactions appear first
      const sorted = [...repaired].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setTransactions(sorted);
      setError(null);
      return sorted;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '데이터베이스에서 거래 내역을 불러오지 못했습니다.';
      console.error('[useTransactions] loadTransactions error:', err);
      setError(msg);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load on mount & custom events
  useEffect(() => {
    loadTransactions();

    const handleDataEvent = () => {
      loadTransactions();
    };

    window.addEventListener('vibe-vault-data-changed', handleDataEvent);
    window.addEventListener('vibe-vault-data-reset', handleDataEvent);

    return () => {
      window.removeEventListener('vibe-vault-data-changed', handleDataEvent);
      window.removeEventListener('vibe-vault-data-reset', handleDataEvent);
    };
  }, [loadTransactions]);

  /**
   * Add a single transaction
   */
  const add = useCallback(async (tx: Transaction): Promise<void> => {
    try {
      await addTransaction(tx);
      setTransactions(prev => [tx, ...prev]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '내역 저장에 실패했습니다.';
      console.error('[useTransactions] add error:', err);
      setError(msg);
      throw err;
    }
  }, []);

  /**
   * Add multiple transactions in a batch (e.g. from Dutch-pay or split expenses)
   */
  const batchAdd = useCallback(async (txs: Transaction[]): Promise<void> => {
    if (!txs || txs.length === 0) return;
    try {
      for (const tx of txs) {
        await addTransaction(tx);
      }
      setTransactions(prev => [...txs, ...prev]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '일괄 내역 저장에 실패했습니다.';
      console.error('[useTransactions] batchAdd error:', err);
      setError(msg);
      throw err;
    }
  }, []);

  /**
   * Update an existing transaction
   */
  const update = useCallback(async (updated: Transaction): Promise<void> => {
    try {
      await updateTransaction(updated);
      setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '내역 수정에 실패했습니다.';
      console.error('[useTransactions] update error:', err);
      setError(msg);
      throw err;
    }
  }, []);

  /**
   * Delete a transaction by ID
   */
  const remove = useCallback(async (id: string): Promise<void> => {
    try {
      await deleteTransaction(id);
      setTransactions(prev => prev.filter(t => t.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '내역 삭제에 실패했습니다.';
      console.error('[useTransactions] remove error:', err);
      setError(msg);
      throw err;
    }
  }, []);

  /**
   * Clear all records
   */
  const clearAll = useCallback(async (): Promise<void> => {
    try {
      await clearAllTransactions();
      setTransactions([]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '가계부 초기화에 실패했습니다.';
      console.error('[useTransactions] clearAll error:', err);
      setError(msg);
      throw err;
    }
  }, []);

  /**
   * Filtered stream transactions based on selected category pill
   */
  const filteredStreamTransactions = useMemo(() => {
    if (!selectedCategory) return transactions;
    return transactions.filter(t => t.category === selectedCategory);
  }, [transactions, selectedCategory]);

  /**
   * Filtered ledger transactions based on ledgerFilter pill and optional selected category
   */
  const filteredLedgerTransactions = useMemo(() => {
    let result = transactions;
    if (selectedCategory) {
      result = result.filter(t => t.category === selectedCategory);
    }
    if (ledgerFilter !== 'ALL') {
      result = result.filter(t => t.type === ledgerFilter);
    }
    return result;
  }, [transactions, ledgerFilter, selectedCategory]);

  /**
   * Export all transactions to CSV with UTF-8 BOM encoding
   */
  const exportCSV = useCallback((): void => {
    if (transactions.length === 0) return;
    const headers = ['ID', 'Date', 'Type', 'Amount', 'Currency', 'Category', 'SubCategory', 'Description', 'PaymentMethod'];
    const rows = transactions.map(t => [
      t.id,
      t.date,
      t.type,
      t.amount,
      t.currency,
      t.category,
      t.subCategory || '',
      `"${(t.description || '').replace(/"/g, '""')}"`,
      t.paymentMethod || ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `vibe_ledger_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [transactions]);

  return {
    transactions,
    isLoading,
    error,
    count: transactions.length,
    setTransactions,
    clearError,

    selectedCategory,
    setSelectedCategory,
    ledgerFilter,
    setLedgerFilter,
    filteredStreamTransactions,
    filteredLedgerTransactions,

    loadTransactions,
    add,
    batchAdd,
    update,
    remove,
    clearAll,

    exportCSV
  };
}
