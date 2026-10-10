import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Transaction, AssetAccount, DebtItem, LedgerSpace } from './types';
import {
  encryptTransaction,
  decryptTransaction,
  encryptAssetAccount,
  decryptAssetAccount,
  encryptDebtItem,
  decryptDebtItem,
  resetVaultSecurity,
  hasVaultPin,
  registerGuestWipeHandler
} from './vaultSecurity';
import { evictAllServiceWorkerCaches } from './usePWAInstall';
import {
  sanitizeTransactionInput,
  sanitizeAssetAccountInput,
  sanitizeDebtItemInput
} from './utils';

export const DEFAULT_SPACE: LedgerSpace = {
  id: 'default',
  name: '일상 장부',
  currency: 'KRW',
  createdAt: new Date().toISOString(),
};

export const SAMPLE_DEBT_ITEMS: DebtItem[] = [
  {
    id: 'debt-kakao-loan',
    name: '카카오뱅크 직장인 신용대출',
    type: 'LOAN_PAYABLE',
    counterpartyOrBank: '카카오뱅크',
    originalPrincipal: 30000000,
    remainingPrincipal: 24500000,
    currency: 'KRW',
    interestRateAnnual: 4.8,
    monthlyPaymentDay: 25,
    monthlyEstimatedPayment: 1000000,
    startDate: '2025-01-25',
    dueDate: '2028-01-25',
    notes: '원리금 균등 분할 상환',
    lastUpdated: new Date().toISOString(),
    isActive: true,
  },
  {
    id: 'debt-minsu-receivable',
    name: '김민수 빌려준 돈',
    type: 'LOAN_RECEIVABLE',
    counterpartyOrBank: '김민수',
    originalPrincipal: 300000,
    remainingPrincipal: 200000,
    currency: 'KRW',
    notes: '여행 경비 대납 정산 잔액',
    lastUpdated: new Date().toISOString(),
    isActive: true,
  }
];

export const SAMPLE_ASSET_ACCOUNTS: AssetAccount[] = [
  {
    id: 'account-toss-sec',
    institution: '토스증권',
    accountName: '토스 해외/국내 종합주식',
    assetType: 'BROKERAGE',
    currentBalance: 12500000,
    currency: 'KRW',
    lastUpdated: new Date().toISOString(),
    accountNumberMasked: '토스 ***-***-1234',
    note: 'S&P 500 ETF, 테크주 포트폴리오'
  },
  {
    id: 'account-kakao-sec',
    institution: '카카오페이증권',
    accountName: '카카오 국내 배당 ISA',
    assetType: 'BROKERAGE',
    currentBalance: 4800000,
    currency: 'KRW',
    lastUpdated: new Date().toISOString(),
    accountNumberMasked: '카카오증권 ***-**-5678',
    note: '국내 고배당주 및 미국 배당다우존스'
  },
  {
    id: 'account-kakaobank',
    institution: '카카오뱅크',
    accountName: '주거래 급여/생활비 통장',
    assetType: 'BANK',
    currentBalance: 3200000,
    currency: 'KRW',
    lastUpdated: new Date().toISOString(),
    accountNumberMasked: '카카오뱅크 3333-**-****',
    note: '급여 및 자동이체 계좌'
  },
  {
    id: 'account-upbit-crypto',
    institution: '업비트',
    accountName: '가상자산 포트폴리오',
    assetType: 'CRYPTO',
    currentBalance: 2150000,
    currency: 'KRW',
    lastUpdated: new Date().toISOString(),
    note: '비트코인, 이더리움 적립식'
  },
  {
    id: 'account-cash',
    institution: '현금/비상금',
    accountName: '자택 비상금 금고',
    assetType: 'CASH',
    currentBalance: 500000,
    currency: 'KRW',
    lastUpdated: new Date().toISOString(),
    note: '비상용 현금'
  }
];

// Backwards compatibility aliases
export const INITIAL_DEBT_ITEMS = SAMPLE_DEBT_ITEMS;
export const INITIAL_ASSET_ACCOUNTS = SAMPLE_ASSET_ACCOUNTS;

/**
 * Rich realistic sample transactions for previewing charts and analytics
 */
export function generateSampleTransactions(): Transaction[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const getDate = (day: number, hour: number = 12): string => {
    return new Date(year, month, Math.min(day, 28), hour, 30).toISOString();
  };

  return [
    {
      id: 'tx-sample-salary',
      type: 'INCOME',
      amount: 3600000,
      currency: 'KRW',
      category: 'Fixed',
      subCategory: 'Salary',
      description: '주거래 급여 입금',
      date: getDate(5, 9),
      paymentMethod: '통장'
    },
    {
      id: 'tx-sample-dining-1',
      type: 'EXPENSE',
      amount: 48000,
      currency: 'KRW',
      category: 'Food',
      subCategory: 'Dining',
      description: '파스타 & 피자 외식',
      date: getDate(6, 19),
      paymentMethod: '현대카드'
    },
    {
      id: 'tx-sample-starbucks',
      type: 'EXPENSE',
      amount: 5500,
      currency: 'KRW',
      category: 'Food',
      subCategory: 'Coffee',
      description: '스타벅스 아메리카노',
      date: getDate(7, 14),
      paymentMethod: '토스카드'
    },
    {
      id: 'tx-sample-groceries',
      type: 'EXPENSE',
      amount: 67200,
      currency: 'KRW',
      category: 'Living',
      subCategory: 'Groceries',
      description: '이마트 주말 장보기',
      date: getDate(10, 16),
      paymentMethod: '현대카드'
    },
    {
      id: 'tx-sample-sub-netflix',
      type: 'EXPENSE',
      amount: 17000,
      currency: 'KRW',
      category: 'Fixed',
      subCategory: '구독',
      description: '넷플릭스 프리미엄 월정액',
      date: getDate(12, 10),
      paymentMethod: '신용카드'
    },
    {
      id: 'tx-sample-transit',
      type: 'EXPENSE',
      amount: 14500,
      currency: 'KRW',
      category: 'Living',
      subCategory: 'Transit',
      description: '카카오택시 심야 귀가',
      date: getDate(14, 23),
      paymentMethod: '카카오페이'
    },
    {
      id: 'tx-sample-shopping',
      type: 'EXPENSE',
      amount: 32000,
      currency: 'KRW',
      category: 'Culture',
      subCategory: 'Shopping',
      description: '교보문고 재테크 서적',
      date: getDate(16, 15),
      paymentMethod: '체크카드'
    },
    {
      id: 'tx-sample-dutch-settle',
      type: 'SETTLEMENT',
      amount: 24000,
      currency: 'KRW',
      category: 'Fixed',
      subCategory: '더치페이',
      description: '주말 저녁 모임 정산 입금',
      date: getDate(18, 20),
      paymentMethod: '카카오뱅크',
      originalTotal: 48000,
      isInternalTransfer: true
    },
    {
      id: 'tx-sample-invest-transfer',
      type: 'TRANSFER',
      amount: 500000,
      currency: 'KRW',
      category: 'Fixed',
      subCategory: '자산이체',
      description: '카카오뱅크 ➔ 토스증권 주식 예수금 이체',
      date: getDate(20, 11),
      paymentMethod: '계좌이체',
      isInternalTransfer: true
    },
    {
      id: 'tx-sample-loan-interest',
      type: 'EXPENSE',
      amount: 98000,
      currency: 'KRW',
      category: 'Fixed',
      subCategory: '대출이자',
      description: '카카오뱅크 신용대출 정기 이자',
      date: getDate(25, 9),
      paymentMethod: '카카오뱅크'
    }
  ];
}

interface VibeVaultDB extends DBSchema {
  transactions: {
    key: string;
    value: Transaction;
    indexes: { 
      'by-date': string;
      'by-category': string;
      'by-type': string;
    };
  };
  assetAccounts: {
    key: string;
    value: AssetAccount;
    indexes: {
      'by-type': string;
      'by-institution': string;
    };
  };
  debts: {
    key: string;
    value: DebtItem;
    indexes: {
      'by-type': string;
      'by-counterparty': string;
    };
  };
  spaces: {
    key: string;
    value: LedgerSpace;
    indexes: {
      'by-created': string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<VibeVaultDB>>;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<VibeVaultDB>('vibe-vault-db', 5, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        let txStore;
        if (oldVersion < 1) {
          txStore = db.createObjectStore('transactions', {
            keyPath: 'id',
          });
          txStore.createIndex('by-date', 'date');
        } else {
          txStore = transaction.objectStore('transactions');
        }

        // Migration to Schema v2: Multi-index support
        if (oldVersion < 2) {
          if (!txStore.indexNames.contains('by-category')) {
            txStore.createIndex('by-category', 'category');
          }
          if (!txStore.indexNames.contains('by-type')) {
            txStore.createIndex('by-type', 'type');
          }
        }

        // Migration to Schema v3: Multi-Brokerage Asset Accounts Store
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('assetAccounts')) {
            const assetStore = db.createObjectStore('assetAccounts', {
              keyPath: 'id',
            });
            assetStore.createIndex('by-type', 'assetType');
            assetStore.createIndex('by-institution', 'institution');
          }
        }

        // Migration to Schema v4: Debts & Loans Store
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains('debts')) {
            const debtStore = db.createObjectStore('debts', {
              keyPath: 'id',
            });
            debtStore.createIndex('by-type', 'type');
            debtStore.createIndex('by-counterparty', 'counterpartyOrBank');
          }
        }

        // Migration to Schema v5: Multi-Ledger Spaces Store
        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains('spaces')) {
            const spaceStore = db.createObjectStore('spaces', {
              keyPath: 'id',
            });
            spaceStore.createIndex('by-created', 'createdAt');
            spaceStore.put({
              id: 'default',
              name: '일상 장부',
              currency: 'KRW',
              createdAt: new Date().toISOString(),
            });
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function addTransaction(transaction: Transaction) {
  const db = await getDB();
  const sanitized = sanitizeTransactionInput(transaction) as Transaction;
  const encrypted = await encryptTransaction(sanitized);
  await db.add('transactions', encrypted);
}

export async function addTransactions(transactions: Transaction[]) {
  const db = await getDB();
  const encryptedList = await Promise.all(
    transactions.map(t => encryptTransaction(sanitizeTransactionInput(t) as Transaction))
  );
  const tx = db.transaction('transactions', 'readwrite');
  for (const t of encryptedList) {
    tx.store.put(t);
  }
  await tx.done;
}

export async function replaceAllTransactions(transactions: Transaction[]) {
  const db = await getDB();
  const encryptedList = await Promise.all(
    transactions.map(t => encryptTransaction(sanitizeTransactionInput(t) as Transaction))
  );
  const tx = db.transaction('transactions', 'readwrite');
  await tx.store.clear();
  for (const t of encryptedList) {
    tx.store.put(t);
  }
  await tx.done;
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDB();
  const txs = await db.getAllFromIndex('transactions', 'by-date');
  const decrypted = await Promise.all(txs.map(decryptTransaction));
  return decrypted.reverse(); // newest first
}

export async function deleteTransaction(id: string) {
  const db = await getDB();
  await db.delete('transactions', id);
}

export async function updateTransaction(transaction: Transaction) {
  const db = await getDB();
  const sanitized = sanitizeTransactionInput(transaction) as Transaction;
  const encrypted = await encryptTransaction(sanitized);
  await db.put('transactions', encrypted);
}

export async function clearAllTransactions() {
  const db = await getDB();
  await db.clear('transactions');
}

/**
 * Differential Query: Retrieves records on or after a given ISO timestamp
 * Used for differential cloud sync and incremental backups.
 */
export async function getTransactionsSince(sinceIsoDate: string): Promise<Transaction[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('transactions', 'by-date');
  const filtered = all.filter(t => t.date >= sinceIsoDate);
  const decrypted = await Promise.all(filtered.map(decryptTransaction));
  return decrypted.reverse();
}

/**
 * Filtered queries using IndexedDB secondary indexes
 */
export async function getTransactionsByCategory(category: string): Promise<Transaction[]> {
  const db = await getDB();
  const txs = await db.getAllFromIndex('transactions', 'by-category', category);
  return Promise.all(txs.map(decryptTransaction));
}

export async function getTransactionsByType(type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'SETTLEMENT'): Promise<Transaction[]> {
  const db = await getDB();
  const txs = await db.getAllFromIndex('transactions', 'by-type', type);
  return Promise.all(txs.map(decryptTransaction));
}

/**
 * Dispatches a vault data change event so all active screens (VaultOverview, Insights)
 * automatically refresh when assets or debts are modified in IndexedDB.
 */
export function notifyVaultDataChanged(source?: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vibe-vault-data-changed', {
      detail: { source: source || 'db_mutation', timestamp: Date.now() }
    }));
  }
}

/**
 * Multi-Brokerage Asset Account Persistence
 */
export async function getAllAssetAccounts(): Promise<AssetAccount[]> {
  const db = await getDB();
  const accounts = await db.getAll('assetAccounts');
  if (!accounts || accounts.length === 0) {
    return [];
  }
  return Promise.all(accounts.map(decryptAssetAccount));
}

export async function clearAllAssetAccounts(): Promise<void> {
  const db = await getDB();
  await db.clear('assetAccounts');
  notifyVaultDataChanged('clearAllAssetAccounts');
}

export async function saveAssetAccount(account: AssetAccount): Promise<void> {
  const db = await getDB();
  const sanitized = sanitizeAssetAccountInput(account) as AssetAccount;
  const encrypted = await encryptAssetAccount(sanitized);
  await db.put('assetAccounts', encrypted);
  notifyVaultDataChanged('saveAssetAccount');
}

export async function deleteAssetAccount(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('assetAccounts', id);
  notifyVaultDataChanged('deleteAssetAccount');
}

export async function updateAssetAccountBalance(id: string, newBalance: number): Promise<AssetAccount | null> {
  const db = await getDB();
  const account = await db.get('assetAccounts', id);
  if (!account) return null;

  account.currentBalance = newBalance;
  account.lastUpdated = new Date().toISOString();
  await db.put('assetAccounts', account);
  notifyVaultDataChanged('updateAssetAccountBalance');
  return decryptAssetAccount(account);
}

export async function bulkSaveAssetAccounts(accounts: AssetAccount[]): Promise<void> {
  const db = await getDB();
  const encryptedList = await Promise.all(
    accounts.map(acc => encryptAssetAccount(sanitizeAssetAccountInput(acc) as AssetAccount))
  );
  const tx = db.transaction('assetAccounts', 'readwrite');
  for (const acc of encryptedList) {
    tx.store.put(acc);
  }
  await tx.done;
  notifyVaultDataChanged('bulkSaveAssetAccounts');
}

/**
 * Account-to-Account Transfer Execution:
 * Decreases source account balance, increases target account balance,
 * and creates a non-expense TRANSFER transaction in the Ledger.
 */
export async function executeAccountTransfer(
  sourceAccountId: string,
  targetAccountId: string,
  amount: number,
  note?: string
): Promise<{ transaction: Transaction; sourceAccount: AssetAccount; targetAccount: AssetAccount }> {
  if (sourceAccountId === targetAccountId) {
    throw new Error('출금 계좌와 입금 계좌는 서로 달라야 합니다.');
  }
  if (amount <= 0) {
    throw new Error('이체 금액은 0보다 커야 합니다.');
  }

  const db = await getDB();
  const rawSource = await db.get('assetAccounts', sourceAccountId);
  const rawTarget = await db.get('assetAccounts', targetAccountId);

  if (!rawSource) throw new Error('출금 계좌를 찾을 수 없습니다.');
  if (!rawTarget) throw new Error('입금 계좌를 찾을 수 없습니다.');

  const source = await decryptAssetAccount(rawSource);
  const target = await decryptAssetAccount(rawTarget);

  // Adjust balances
  source.currentBalance = Math.max(0, source.currentBalance - amount);
  source.lastUpdated = new Date().toISOString();

  target.currentBalance = target.currentBalance + amount;
  target.lastUpdated = new Date().toISOString();

  const nowIso = new Date().toISOString();
  const transferTx: Transaction = {
    id: `tx-transfer-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    type: 'TRANSFER',
    amount: amount,
    currency: source.currency || 'KRW',
    category: 'Fixed',
    subCategory: '자산이체',
    description: note || `${source.institution} ➔ ${target.institution} 계좌이체`,
    date: nowIso,
    paymentMethod: source.institution,
    sourceAccountId: source.id,
    targetAccountId: target.id,
    isInternalTransfer: true,
  };

  const encryptedTx = await encryptTransaction(sanitizeTransactionInput(transferTx) as Transaction);
  const encryptedSource = await encryptAssetAccount(source);
  const encryptedTarget = await encryptAssetAccount(target);

  // Perform atomic multi-store write
  const tx = db.transaction(['assetAccounts', 'transactions'], 'readwrite');
  tx.objectStore('assetAccounts').put(encryptedSource);
  tx.objectStore('assetAccounts').put(encryptedTarget);
  tx.objectStore('transactions').put(encryptedTx);
  await tx.done;

  notifyVaultDataChanged('executeAccountTransfer');
  return { transaction: transferTx, sourceAccount: source, targetAccount: target };
}

/**
 * Advanced Debt & Loan Persistence
 */
export async function getAllDebts(): Promise<DebtItem[]> {
  const db = await getDB();
  const debts = await db.getAll('debts');
  if (!debts || debts.length === 0) {
    return [];
  }
  return Promise.all(debts.map(decryptDebtItem));
}

export async function clearAllDebts(): Promise<void> {
  const db = await getDB();
  await db.clear('debts');
  notifyVaultDataChanged('clearAllDebts');
}

export async function saveDebt(debt: DebtItem): Promise<void> {
  const db = await getDB();
  const sanitized = sanitizeDebtItemInput(debt) as DebtItem;
  const encrypted = await encryptDebtItem(sanitized);
  await db.put('debts', encrypted);
  notifyVaultDataChanged('saveDebt');
}

export async function deleteDebt(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('debts', id);
  notifyVaultDataChanged('deleteDebt');
}

export async function updateDebtRemainingPrincipal(id: string, newRemaining: number): Promise<DebtItem | null> {
  const db = await getDB();
  const debt = await db.get('debts', id);
  if (!debt) return null;

  debt.remainingPrincipal = Math.max(0, newRemaining);
  if (debt.remainingPrincipal === 0) {
    debt.isActive = false;
  }
  debt.lastUpdated = new Date().toISOString();
  await db.put('debts', debt);
  notifyVaultDataChanged('updateDebtRemainingPrincipal');
  return decryptDebtItem(debt);
}

/**
 * Executes a one-tap Loan Repayment Split:
 * Atomically creates the interest expense transaction,
 * and reduces the debt's remaining principal!
 */
export async function executeLoanRepaymentSplit(
  debtId: string,
  principalReduction: number,
  interestAmount: number,
  currency: string = 'KRW',
  paymentMethod?: string
): Promise<{ interestTransaction?: Transaction; principalTransaction: Transaction; updatedDebt: DebtItem }> {
  const db = await getDB();
  const rawDebt = await db.get('debts', debtId);
  if (!rawDebt) throw new Error('대출/부채 항목을 찾을 수 없습니다.');

  const debt = await decryptDebtItem(rawDebt);

  // 1. Calculate new remaining balance
  debt.remainingPrincipal = Math.max(0, debt.remainingPrincipal - principalReduction);
  if (debt.remainingPrincipal === 0) {
    debt.isActive = false;
  }
  debt.lastUpdated = new Date().toISOString();

  const nowIso = new Date().toISOString();
  const groupId = `loan-repay-${debtId}-${Date.now()}`;

  // 2. Principal repayment transaction (Non-expense liability reduction)
  const principalTx: Transaction = {
    id: `tx-principal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    type: 'TRANSFER',
    amount: principalReduction,
    currency,
    category: 'Fixed',
    subCategory: '원금상환',
    description: `${debt.name} 원금 상환`,
    date: nowIso,
    paymentMethod: paymentMethod || debt.counterpartyOrBank,
    groupId,
    isInternalTransfer: true,
  };

  // 3. Interest transaction (Financial Expense)
  let interestTx: Transaction | undefined;
  if (interestAmount > 0) {
    interestTx = {
      id: `tx-interest-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: 'EXPENSE',
      amount: interestAmount,
      currency,
      category: 'Fixed',
      subCategory: '대출이자',
      description: `${debt.name} 이자 비용`,
      date: nowIso,
      paymentMethod: paymentMethod || debt.counterpartyOrBank,
      groupId,
      isInternalTransfer: false,
    };
  }

  // Encrypt records before writing
  const encryptedDebt = await encryptDebtItem(debt);
  const encryptedPrincipalTx = await encryptTransaction(sanitizeTransactionInput(principalTx) as Transaction);
  const encryptedInterestTx = interestTx ? await encryptTransaction(sanitizeTransactionInput(interestTx) as Transaction) : undefined;

  // 4. Perform atomic multi-store write
  const tx = db.transaction(['debts', 'transactions'], 'readwrite');
  tx.objectStore('debts').put(encryptedDebt);
  tx.objectStore('transactions').put(encryptedPrincipalTx);
  if (encryptedInterestTx) {
    tx.objectStore('transactions').put(encryptedInterestTx);
  }
  await tx.done;

  notifyVaultDataChanged('executeLoanRepaymentSplit');
  return {
    interestTransaction: interestTx,
    principalTransaction: principalTx,
    updatedDebt: debt
  };
}

/**
 * Executes a one-tap Receivable Recovery:
 * Atomically marks money returned from borrower as SETTLEMENT (preventing false income inflate)
 * and reduces the receivable principal.
 */
export async function executeReceivableRecovery(
  debtId: string,
  recoveryAmount: number,
  currency: string = 'KRW',
  paymentMethod?: string
): Promise<{ settlementTransaction: Transaction; updatedDebt: DebtItem }> {
  const db = await getDB();
  const rawDebt = await db.get('debts', debtId);
  if (!rawDebt) throw new Error('미수금/빌려준 돈 항목을 찾을 수 없습니다.');

  const debt = await decryptDebtItem(rawDebt);

  debt.remainingPrincipal = Math.max(0, debt.remainingPrincipal - recoveryAmount);
  if (debt.remainingPrincipal === 0) {
    debt.isActive = false;
  }
  debt.lastUpdated = new Date().toISOString();

  const nowIso = new Date().toISOString();
  const settlementTx: Transaction = {
    id: `tx-receivable-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    type: 'SETTLEMENT',
    amount: recoveryAmount,
    currency,
    category: 'Fixed',
    subCategory: '대여금회수',
    description: `${debt.name} 상환 입금 (${debt.counterpartyOrBank})`,
    date: nowIso,
    paymentMethod: paymentMethod || '계좌이체',
    originalTotal: debt.originalPrincipal,
    isInternalTransfer: true, // Do not inflate new income
  };

  const encryptedDebt = await encryptDebtItem(debt);
  const encryptedSettlementTx = await encryptTransaction(sanitizeTransactionInput(settlementTx) as Transaction);

  const tx = db.transaction(['debts', 'transactions'], 'readwrite');
  tx.objectStore('debts').put(encryptedDebt);
  tx.objectStore('transactions').put(encryptedSettlementTx);
  await tx.done;

  notifyVaultDataChanged('executeReceivableRecovery');
  return {
    settlementTransaction: settlementTx,
    updatedDebt: debt
  };
}

/**
 * Multi-Ledger Space Persistence (프로젝트 / 행사 장부)
 */
export async function getSpaces(): Promise<LedgerSpace[]> {
  const db = await getDB();
  let spaces: LedgerSpace[] = [];
  try {
    spaces = await db.getAll('spaces');
  } catch (err) {
    console.warn('[db] Failed to getAll spaces:', err);
  }
  if (!spaces || spaces.length === 0) {
    const defaultSpace = { ...DEFAULT_SPACE, createdAt: new Date().toISOString() };
    await db.put('spaces', defaultSpace);
    return [defaultSpace];
  }
  if (!spaces.some(s => s.id === 'default')) {
    const defaultSpace = { ...DEFAULT_SPACE, createdAt: new Date().toISOString() };
    await db.put('spaces', defaultSpace);
    spaces.unshift(defaultSpace);
  }
  return spaces;
}

export async function createSpace(space: LedgerSpace): Promise<void> {
  const db = await getDB();
  await db.put('spaces', space);
}

export async function deleteSpace(id: string): Promise<void> {
  if (id === 'default') return; // Cannot delete default space
  const db = await getDB();
  await db.delete('spaces', id);
  // Clean up all transactions belonging to this space
  try {
    const allTxs = await getAllTransactions();
    const spaceTxs = allTxs.filter(t => t.spaceId === id);
    for (const t of spaceTxs) {
      await deleteTransaction(t.id);
    }
  } catch (err) {
    console.warn('[db] Error cleaning up transactions for space:', id, err);
  }
}

/**
 * Loads realistic sample portfolio data (5 asset accounts, 2 debts, 10 transactions)
 * into IndexedDB for previewing and testing dashboard charts.
 */
export async function loadSampleData(): Promise<{
  transactionsCount: number;
  accountsCount: number;
  debtsCount: number;
}> {
  const db = await getDB();

  // 1. Asset Accounts
  const encryptedAccounts = await Promise.all(
    SAMPLE_ASSET_ACCOUNTS.map(item =>
      encryptAssetAccount(sanitizeAssetAccountInput(item) as AssetAccount)
    )
  );

  // 2. Debt Items
  const encryptedDebts = await Promise.all(
    SAMPLE_DEBT_ITEMS.map(item =>
      encryptDebtItem(sanitizeDebtItemInput(item) as DebtItem)
    )
  );

  // 3. Transactions
  const sampleTxs = generateSampleTransactions();
  const encryptedTxs = await Promise.all(
    sampleTxs.map(item =>
      encryptTransaction(sanitizeTransactionInput(item) as Transaction)
    )
  );

  // Write atomically across stores
  const tx = db.transaction(['assetAccounts', 'debts', 'transactions'], 'readwrite');
  for (const acc of encryptedAccounts) {
    tx.objectStore('assetAccounts').put(acc);
  }
  for (const d of encryptedDebts) {
    tx.objectStore('debts').put(d);
  }
  for (const t of encryptedTxs) {
    tx.objectStore('transactions').put(t);
  }
  await tx.done;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vibe-vault-data-changed', {
      detail: { source: 'sample_data_load' }
    }));
  }

  return {
    accountsCount: SAMPLE_ASSET_ACCOUNTS.length,
    debtsCount: SAMPLE_DEBT_ITEMS.length,
    transactionsCount: sampleTxs.length
  };
}

/**
 * Completely wipes all IndexedDB stores (transactions, accounts, debts, spaces),
 * evicts browser CacheStorage, clears session/localStorage settings,
 * and resets vault security state to an absolute clean zero slate (₩0).
 */
export async function resetAllDataToZero(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['transactions', 'assetAccounts', 'debts', 'spaces'], 'readwrite');
  await tx.objectStore('transactions').clear();
  await tx.objectStore('assetAccounts').clear();
  await tx.objectStore('debts').clear();
  await tx.objectStore('spaces').clear();
  await tx.objectStore('spaces').put({
    id: 'default',
    name: '일상 장부',
    currency: 'KRW',
    createdAt: new Date().toISOString(),
  });
  await tx.done;

  // Clear related localStorage flags
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('vibe_user_assets');
    localStorage.removeItem('vibe_saved_subscriptions');
    localStorage.removeItem('vibe_last_export_date');
    localStorage.removeItem('vibe_engine_config');
    localStorage.removeItem('vibe_user_preferences');
    localStorage.removeItem('vibe_active_space_id');
  }

  // Clear session storage flags
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }

  // Reset vault security master keys and PIN challenge
  resetVaultSecurity();

  // Purge any caches stored in Service Worker CacheStorage
  await evictAllServiceWorkerCaches().catch(() => false);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vibe-vault-data-reset', {
      detail: { timestamp: Date.now() }
    }));
  }
}

// Register guest session data wipe with vaultSecurity
registerGuestWipeHandler(async () => {
  try {
    const db = await getDB();
    const tx = db.transaction(['transactions', 'assetAccounts', 'debts', 'spaces'], 'readwrite');
    await tx.objectStore('transactions').clear();
    await tx.objectStore('assetAccounts').clear();
    await tx.objectStore('debts').clear();
    await tx.objectStore('spaces').clear();
    await tx.objectStore('spaces').put({
      id: 'default',
      name: '일상 장부',
      currency: 'KRW',
      createdAt: new Date().toISOString(),
    });
    await tx.done;
  } catch (err) {
    console.warn('[Ephemeral Guest Mode] IndexedDB clear failed:', err);
  }
});

/**
 * Ensures absolute zero clean slate on startup if in Ephemeral Guest Mode (no PIN set)
 * Guarantees that data is strictly volatile unless the user has established a Master Vault PIN.
 */
export async function ensureCleanSlateIfGuest(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!hasVaultPin()) {
    if (!sessionStorage.getItem('vibe_active_guest_session')) {
      try {
        const db = await getDB();
        const tx = db.transaction(['transactions', 'assetAccounts', 'debts', 'spaces'], 'readwrite');
        await tx.objectStore('transactions').clear();
        await tx.objectStore('assetAccounts').clear();
        await tx.objectStore('debts').clear();
        await tx.objectStore('spaces').clear();
        await tx.objectStore('spaces').put({
          id: 'default',
          name: '일상 장부',
          currency: 'KRW',
          createdAt: new Date().toISOString(),
        });
        await tx.done;
      } catch (err) {
        console.warn('[Ephemeral Guest Mode] Startup clear error:', err);
      }
      sessionStorage.setItem('vibe_active_guest_session', 'true');
    }
  }
}




