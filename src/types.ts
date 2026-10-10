export type AssetType = 'CARD' | 'BANK' | 'CASH' | 'OTHER';

// Multi-Brokerage & Comprehensive Asset Classification
export type AssetCategoryType = 'BROKERAGE' | 'BANK' | 'CRYPTO' | 'REAL_ESTATE' | 'CASH' | 'LIABILITY';

export type LaunchScreenMode = 'vault' | 'insights' | 'ledger';

export interface HoldingItem {
  name: string;
  valuation: number;
  currency?: string;
  quantity?: number;
  profitRate?: number; // e.g. +14.2% -> 14.2
}

export interface AssetAccount {
  id: string;
  institution: string; // e.g., 'Toss Securities', 'Kakao Pay Securities', 'KakaoBank', 'Manual'
  accountName: string; // e.g., 'Toss US Stock', 'Kakao Domestic ISA'
  assetType: AssetCategoryType;
  currentBalance: number;
  cashBalance?: number; // 예수금 / 출금가능 현금
  investedAssets?: number; // 주식/코인/펀드 평가금액
  currency: string; // 'KRW', 'USD', etc.
  lastUpdated: string; // ISO date
  note?: string;
  accountNumberMasked?: string;
  holdings?: HoldingItem[];
}

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'SETTLEMENT';
export type SupportedCurrency = 'KRW' | 'USD' | 'EUR' | 'JPY' | 'GBP' | 'IDR' | 'CNY' | 'CAD' | 'AUD' | 'SGD' | 'HKD' | 'THB' | 'VND' | 'CHF' | 'TWD' | string;
export type CurrencyCode = SupportedCurrency | string;

export interface FxRates {
  base: string; // e.g. 'KRW'
  rates: Record<string, number>; // e.g. { 'USD': 0.00075, 'EUR': 0.00069, 'JPY': 0.11, 'GBP': 0.00059, 'KRW': 1 }
  updatedAt: string; // ISO date
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  billingDay?: number; // 1 to 31 (e.g. credit card billing cycle day)
  enabled: boolean;
  note?: string;
  currency?: SupportedCurrency;
  balance?: number;
}

export interface LedgerSpace {
  id: string; // 'default' for everyday living, UUID for custom projects/events
  name: string; // e.g., "일상 장부", "동창회 유럽 여행"
  currency: string; // e.g., 'KRW', 'EUR', 'IDR'
  budget?: number; // target budget or collected dues
  memberCount?: number; // number of participants for N-split calculations
  startDate?: string;
  endDate?: string;
  isArchived?: boolean;
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: CurrencyCode;
  category: string;
  subCategory?: string;
  description: string;
  date: string; // ISO string
  paymentMethod?: string;
  groupId?: string; // Links related multi-part expenses or Dutch-pay settlements
  originalTotal?: number; // Pre-settlement original sum if applicable
  convertedAmount?: number; // Normalized to current base currency if different
  sourceAccountId?: string; // Source account for account-to-account transfer
  targetAccountId?: string; // Destination account for account-to-account transfer
  isInternalTransfer?: boolean; // Transfer between user's own accounts
  spaceId?: string; // defaults to 'default'
  note?: string; // for settlement remarks, receipt info, or payer
}

export interface CategoryBudget {
  category: string;
  limit: number;
}

export type ChartPaletteType = 'default' | 'sage' | 'clay' | 'burgundy';

export type FinancialCategory = 'Food' | 'Living' | 'Transport' | 'Fixed' | 'Health' | 'Leisure' | 'Uncategorized';

export interface ReceiptItem {
  name: string;
  price: number;
  quantity?: number;
  // Backward compatibility aliases
  amount?: number;
  category?: string;
}

export interface ParsedReceiptData {
  merchantName: string;
  date: string; // ISO-8601 format YYYY-MM-DD
  totalAmount: number;
  currency: string; // ISO code, e.g., "KRW", "USD"
  category: FinancialCategory | string;
  items: ReceiptItem[];
  confidenceScore: number; // 0.0 to 1.0
  // Backward compatibility fields
  merchant?: string;
  suggestedCategory?: string;
  paymentMethod?: string;
}

// Phase 4: Subscription & Recurring Fixed Expense Model
export interface SubscriptionItem {
  id: string;
  merchant: string;
  amount: number;
  currency: CurrencyCode;
  category: string;
  cycleDays: number; // e.g. 30 (monthly)
  lastBillingDate: string; // ISO date
  nextBillingDate: string; // ISO date
  dDay: number; // e.g. 3 (D-3), 0 (D-Day), -1 (overdue/paid)
  confidence: number; // 0 to 1
  occurrencesCount: number;
  isManual?: boolean;
  isActive: boolean;
  notes?: string;
}

// Phase 4: Predictive Cashflow Forecast Models
export interface CashflowForecastPoint {
  day: number;
  date: string; // YYYY-MM-DD
  isPast: boolean;
  isToday: boolean;
  actualBalance?: number;
  projectedBalance: number;
  dailyBurn: number;
  projectedBurn: number;
  upcomingSubscriptionSum: number;
}

export interface CashflowForecastSummary {
  currentBalance: number;
  projectedMonthEndBalance: number;
  dailyAverageBurn: number;
  daysRemainingInMonth: number;
  totalUpcomingSubscriptions: number;
  runwayDays: number;
  status: 'HEALTHY' | 'MODERATE' | 'DEFICIT_WARNING';
  recommendation: string;
  dataPoints: CashflowForecastPoint[];
}

// Cryptographic Backup Hardening: Hardened Envelope Protocol
export type CryptoBackupErrorCode =
  | 'INVALID_PASSPHRASE'
  | 'CORRUPTED_PAYLOAD'
  | 'UNSUPPORTED_VERSION'
  | 'EMPTY_PASSPHRASE'
  | 'TAMPERED_PAYLOAD';

export interface EncryptedBackupPayload {
  version: '2.0' | 'VVLT_V1' | string;
  format: 'vibe-encrypted-v2' | 'vibe-vault-encrypted-v1' | string;
  kdf: 'PBKDF2' | 'PBKDF2-SHA-256' | string;
  cipher: 'AES-GCM-256';
  iterations: number;
  salt: string; // Hex
  iv: string; // Hex
  ciphertext: string; // Base64
  createdAt: string;
  magic?: string; // e.g. "VVLT_V1"
  tagLength?: number; // 128
  rawBinaryBase64?: string; // Optional embedded binary envelope in base64
  keyVerifier?: string; // Hex key commitment
  meta: {
    transactionCount: number;
    appName: string;
    envelope?: 'armored-json' | 'binary-enc';
    checksum?: string;
    keyVerifier?: string;
    [key: string]: any;
  };
}

// Advanced Debt & Receivable Model
export type DebtType = 'LOAN_PAYABLE' | 'LOAN_RECEIVABLE' | 'MORTGAGE' | 'CREDIT_LINE';

export interface DebtItem {
  id: string;
  name: string; // e.g. "카카오뱅크 신용대출", "김민수 빌려준 돈", "신한은행 마이너스통장"
  type: DebtType;
  counterpartyOrBank: string; // e.g. "카카오뱅크", "김민수", "신한은행"
  originalPrincipal: number;
  remainingPrincipal: number;
  currency: CurrencyCode;
  interestRateAnnual?: number; // e.g. 4.5% annual interest
  monthlyPaymentDay?: number; // e.g. 25th of month
  monthlyEstimatedPayment?: number; // e.g. 1,000,000 KRW
  startDate?: string;
  dueDate?: string;
  notes?: string;
  lastUpdated: string;
  isActive: boolean;
}

export interface LoanSplitSuggestion {
  debtId: string;
  debtName: string;
  totalPayment: number;
  principalAmount: number; // Reduces liability
  interestAmount: number; // Logged as Fixed expense
  currency: CurrencyCode;
  remainingPrincipalAfter: number;
  counterpartyOrBank: string;
  explanation: string;
}

export interface ReceivableRecoverySuggestion {
  debtId: string;
  debtName: string;
  recoveredAmount: number;
  currency: CurrencyCode;
  remainingPrincipalAfter: number;
  counterparty: string;
  explanation: string;
}

export interface AssetScreenshotMutation {
  action: 'UPDATE_EXISTING' | 'CREATE_NEW';
  targetAccountId?: string;
  institution: string;
  accountName: string;
  totalAccountValue: number;
  cashBalance?: number;
  investedAssets?: number;
  currency: string;
  holdings?: HoldingItem[];
  confidenceScore: number;
  explanation: string;
}

export interface UnencryptedBackupPayloadV2 {
  version: '2.0';
  format: 'vibe-backup-v2';
  createdAt: string;
  transactions: Transaction[];
  preferences?: Record<string, any>;
  subscriptions?: SubscriptionItem[];
  assets?: Asset[];
  assetAccounts?: AssetAccount[];
  debts?: DebtItem[];
}

// Conversational Financial Query ("Ask AI Vault") Models
export type FinancialQueryMetric = 
  | 'fx_gain_loss'
  | 'category_sum'
  | 'weekend_expense'
  | 'total_expense'
  | 'total_income'
  | 'net_savings'
  | 'merchant_expense'
  | 'general_financial';

export interface FinancialQueryParameters {
  metric: FinancialQueryMetric;
  dateRange?: string; // e.g. "2026-09"
  year?: number;
  month?: number;
  targetCurrency?: SupportedCurrency;
  category?: string;
  merchantKeyword?: string;
  querySummary?: string;
}

export interface CalculationBreakdownPill {
  label: string;
  value: string;
  highlight?: boolean;
  color?: 'sky' | 'blue' | 'amber' | 'purple' | 'slate';
}

export interface FinancialQueryResult {
  query: string;
  directAnswer: string;
  summarySentence: string;
  breakdownPills: CalculationBreakdownPill[];
  metric: FinancialQueryMetric;
  parameters: FinancialQueryParameters;
  calculatedValue: number;
  calculatedCurrency: SupportedCurrency;
  details?: Record<string, any>;
  timestamp: string;
}

