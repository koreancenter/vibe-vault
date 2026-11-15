import { 
  Transaction, 
  SupportedCurrency, 
  ParsedReceiptData,
  ReceiptItem,
  AssetAccount,
  AssetScreenshotMutation,
  DebtItem,
  LoanSplitSuggestion,
  ReceivableRecoverySuggestion
} from './types';
import { 
  parseReceiptTextLocally, 
  parseFinancialInputDeterministically,
  ParsedTransactionResult 
} from './financialParser';
import { assertCloudScanSource } from './scanValidation';
import { generateSecureId } from './identifiers';
import { isLocalLLMReady } from './webllmManager';
import { 
  saveAssetAccount, 
  getAllAssetAccounts, 
  executeLoanRepaymentSplit, 
  executeReceivableRecovery
} from './db';
import {
  AIEngineConfig,
} from './utils';
import {
  getSecureGeminiApiKey,
  sanitizeApiKey,
  redactSensitiveKey,
  directGeminiReceiptOCR
} from './geminiKeyManager';
import { 
  differenceInDays
} from 'date-fns';

// ---------------------------------------------------------------------------
// Re-export Modular Domain Engines from src/finance/
// ---------------------------------------------------------------------------
export {
  KNOWN_SUBSCRIPTION_KEYWORDS,
  detectSubscriptions,
  loadSavedSubscriptions,
  saveSubscriptions
} from './finance/subscriptionDetector';

export {
  calculateCashflowForecast,
  computeSafeToSpend
} from './finance/cashflowForecast';
export type {
  SafeToSpendResult
} from './finance/cashflowForecast';

export {
  extractFinancialQueryIntent,
  computeDeterministicFinancialQuery,
  executeFinancialQuery
} from './finance/queryEngine';

// ---------------------------------------------------------------------------
// Phase 1: AI Resilience, Structured Outputs & Error Recovery
// ---------------------------------------------------------------------------

export interface ResilientReceiptParseOptions {
  imageBase64: string;
  mimeType?: string;
  engineConfig?: unknown;
  defaultCurrency?: string;
  rawFallbackText?: string;
  maxRetries?: number;
  onRetry?: (attempt: number, delayMs: number, reason: string) => void;
}

export interface ResilientReceiptParseResult {
  receipt: ParsedReceiptData;
  source: 'gemini' | 'local_fallback' | 'local_deterministic';
  attempts: number;
}

/**
 * Resilient Receipt Parsing Engine:
 * - Pre-flight offline verification.
 * - Exponential backoff retry logic (up to 3 attempts) for HTTP 429 and transient 5xx network spikes.
 * - Enforces strict schema conformance and type-safe fallbacks.
 * - Seamlessly falls back to local heuristic text parser (financialParser.ts) when offline or upon terminal failure.
 */
export async function parseReceiptWithResilience(
  options: ResilientReceiptParseOptions
): Promise<ResilientReceiptParseResult> {
  const {
    imageBase64,
    mimeType = 'image/webp',
    engineConfig,
    defaultCurrency = 'KRW',
    rawFallbackText = '',
    maxRetries = 3,
    onRetry
  } = options;

  // 1. Offline Pre-flight Check
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (rawFallbackText.trim()) {
      const fallbackData = parseReceiptTextLocally(rawFallbackText, defaultCurrency);
      return {
        receipt: fallbackData,
        source: 'local_fallback',
        attempts: 0
      };
    }
    // Check if on-device model is ready
    if (isLocalLLMReady()) {
      const localData = parseReceiptTextLocally(rawFallbackText || '오프라인 영수증 분석', defaultCurrency);
      return {
        receipt: localData,
        source: 'local_deterministic',
        attempts: 0
      };
    }
    throw new Error('OFFLINE: 현재 오프라인 상태입니다. 영수증 이미지 OCR은 인터넷 연결이 필요하며, 영수증 텍스트를 직접 입력하거나 붙여넣어 주세요.');
  }

  // 2. Pre-flight API Key & Engine Config Resolution
  const resolvedConfig = (engineConfig as Partial<AIEngineConfig> | undefined) || {};
  const effectiveApiKey = sanitizeApiKey(resolvedConfig.apiKey) || getSecureGeminiApiKey() || '';
  const effectiveConfig: AIEngineConfig = {
    engineType: resolvedConfig.engineType || (effectiveApiKey ? 'byok' : 'local'),
    localModel: resolvedConfig.localModel || 'gemma-2b',
    provider: resolvedConfig.provider || 'gemini',
    modelTier: resolvedConfig.modelTier || 'gemini-3.8-flash',
    apiKey: effectiveApiKey
  };

  // Tier 3: On-Device AI mode check
  if (effectiveConfig.engineType === 'local') {
    if (!isLocalLLMReady() && !effectiveApiKey) {
      if (rawFallbackText.trim()) {
        const fallbackData = parseReceiptTextLocally(rawFallbackText, defaultCurrency);
        return {
          receipt: fallbackData,
          source: 'local_fallback',
          attempts: 0
        };
      }
      throw new Error('ON_DEVICE_MODEL_NOT_READY: 온디바이스 AI(Beta / Labs) 모델이 아직 다운로드되지 않았습니다. 설정 > AI 엔진에서 모델을 다운로드하거나, 영수증 텍스트를 직접 입력해주세요.');
    }
  }

  // Tier 2: If BYOK is active and no key is configured anywhere, fail early with user-friendly actionable prompt
  if (effectiveConfig.engineType === 'byok' && !effectiveApiKey) {
    if (rawFallbackText.trim()) {
      const fallbackData = parseReceiptTextLocally(rawFallbackText, defaultCurrency);
      return {
        receipt: fallbackData,
        source: 'local_fallback',
        attempts: 0
      };
    }
    throw new Error('API_KEY_REQUIRED: 클라우드 AI 영수증 인식을 위해 Gemini API 키가 필요합니다. 설정에서 API 키를 등록해주세요.');
  }

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    attempt++;
    try {
      let data: any = null;

      try {
        const res = await fetch('/api/parse-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: imageBase64,
            mimeType,
            engineConfig: effectiveConfig
          })
        });

        // Check for 401/403 Invalid API key
        if (res.status === 401 || res.status === 403) {
          throw new Error('INVALID_API_KEY: 등록된 Gemini API 키 인증에 실패했습니다 (만료 또는 권한 없음). 설정에서 키를 확인해주세요.');
        }

        // Handle Rate Limit (HTTP 429) or Server Unavailable (500/502/503/504)
        if (res.status === 429 || res.status >= 500) {
          const errorText = await res.text().catch(() => '');
          const isRateLimit = res.status === 429;
          const reason = isRateLimit ? 'API 호출 한도 초과' : `서버 일시 오류 (${res.status})`;

          if (attempt < maxRetries) {
            const delayMs = Math.min(5000, 1000 * Math.pow(2, attempt - 1) + Math.random() * 300);
            onRetry?.(attempt, delayMs, reason);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          }

          throw new Error(`${reason}: 영수증 분석에 실패했습니다. (${redactSensitiveKey(errorText, effectiveApiKey) || '응답 없음'})`);
        }

        if (res.ok) {
          data = await res.json();
        } else if (res.status === 404 && effectiveApiKey) {
          // Cloudflare Pages static environment where /api is not present: direct BYOK Gemini API call
          data = await directGeminiReceiptOCR(imageBase64, mimeType, effectiveApiKey, defaultCurrency as SupportedCurrency);
        } else {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `영수증 인식 실패 (HTTP ${res.status})`);
        }
      } catch (fetchErr: unknown) {
        const errStr = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        if (errStr.includes('API_KEY_REQUIRED') || errStr.includes('INVALID_API_KEY')) {
          throw fetchErr;
        }

        // If backend fetch failed with network/404 on static hosting, attempt direct client-side OCR
        if (effectiveApiKey && (errStr.includes('Failed to fetch') || errStr.includes('404') || errStr.includes('NetworkError'))) {
          data = await directGeminiReceiptOCR(imageBase64, mimeType, effectiveApiKey, defaultCurrency as SupportedCurrency);
        } else {
          throw fetchErr;
        }
      }
      if (!data.receipt) {
        throw new Error('유효한 영수증 데이터 구조가 반환되지 않았습니다.');
      }
      assertCloudScanSource(
        data.source,
        '영수증 이미지 분석 결과를 확인할 수 없습니다. 영수증 텍스트를 직접 입력해 로컬 파서를 이용해주세요.',
      );

      // Enforce strict schema validation and default safety
      const raw = data.receipt;
      const today = new Date().toISOString().slice(0, 10);
      const validDate = raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : today;

      const items: ReceiptItem[] = Array.isArray(raw.items)
        ? raw.items.map((it: Record<string, unknown>) => ({
            name: String(it.name || '품목').trim(),
            price: Math.abs(Number(it.price ?? it.amount ?? 0)),
            quantity: it.quantity ? Math.max(1, Number(it.quantity)) : 1,
            amount: Math.abs(Number(it.price ?? it.amount ?? 0)),
            category: typeof it.category === 'string' ? it.category : undefined
          }))
        : [];

      const totalAmount = Math.abs(Number(raw.totalAmount)) ||
        items.reduce((acc, it) => acc + (it.price * (it.quantity || 1)), 0);

      const normalizedReceipt: ParsedReceiptData = {
        merchantName: String(raw.merchantName || raw.merchant || '영수증 결제').trim(),
        date: validDate,
        totalAmount,
        currency: raw.currency ? String(raw.currency).toUpperCase() : defaultCurrency,
        category: String(raw.category || raw.suggestedCategory || 'Living'),
        items,
        confidenceScore: typeof raw.confidenceScore === 'number'
          ? Math.max(0, Math.min(1, raw.confidenceScore))
          : 0.95,
        // Backward compatibility
        merchant: String(raw.merchantName || raw.merchant || '영수증 결제').trim(),
        suggestedCategory: String(raw.category || raw.suggestedCategory || 'Living'),
        paymentMethod: raw.paymentMethod ? String(raw.paymentMethod) : undefined
      };

      return {
        receipt: normalizedReceipt,
        source: data.source === 'local' ? 'local_deterministic' : 'gemini',
        attempts: attempt
      };
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      if (errStr.includes('API_KEY_REQUIRED') || errStr.includes('INVALID_API_KEY')) {
        throw err;
      }
      const safeMsg = redactSensitiveKey(errStr, effectiveApiKey);
      lastError = new Error(safeMsg);
      if (attempt < maxRetries) {
        const delayMs = Math.min(5000, 1000 * Math.pow(2, attempt - 1) + Math.random() * 300);
        onRetry?.(attempt, delayMs, safeMsg || '네트워크 재시도');
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // Final fallback: If raw text is available, run local heuristic parser
  if (rawFallbackText.trim()) {
    const fallbackData = parseReceiptTextLocally(rawFallbackText, defaultCurrency);
    return {
      receipt: fallbackData,
      source: 'local_fallback',
      attempts: attempt
    };
  }

  throw lastError || new Error('영수증 분석 중 오류가 발생했습니다. 다시 시도해주세요.');
}

/**
 * Transaction Reconciliation & Deduplication Checker:
 * Analyzes whether a parsed receipt coincides with an existing recorded transaction
 * (same merchant, within 2 days, and same amount).
 */
export function reconcileReceiptWithTransactions(
  receipt: ParsedReceiptData,
  recentTransactions: Transaction[]
): { isDuplicate: boolean; matchedTransaction?: Transaction } {
  const receiptAmount = receipt.totalAmount;
  const receiptDate = new Date(receipt.date);
  const receiptMerchant = (receipt.merchantName || receipt.merchant || '').toLowerCase().replace(/\s+/g, '');

  for (const tx of recentTransactions) {
    if (Math.abs(tx.amount - receiptAmount) < 1) {
      const txDate = new Date(tx.date);
      const dayDiff = Math.abs(differenceInDays(receiptDate, txDate));
      if (dayDiff <= 2) {
        const txDesc = (tx.description || '').toLowerCase().replace(/\s+/g, '');
        if (receiptMerchant && (txDesc.includes(receiptMerchant) || receiptMerchant.includes(txDesc))) {
          return { isDuplicate: true, matchedTransaction: tx };
        }
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * ============================================================================
 * AUTONOMOUS FINANCE ORCHESTRATION PIPELINE
 * Zero financial calculation friction & autonomous execution engine
 * ============================================================================
 */

export interface ParsedScreenshotResult {
  asset: {
    institution: string;
    accountName: string;
    assetType: 'BROKERAGE' | 'BANK' | 'CRYPTO' | 'REAL_ESTATE' | 'CASH' | 'LIABILITY';
    currentBalance: number;
    cashBalance?: number;
    investedAssets?: number;
    currency: SupportedCurrency;
    holdings?: Array<{
      name: string;
      valuation: number;
      quantity?: number;
      profitRate?: number;
    }>;
    confidenceScore: number;
    notes?: string;
  };
  mutation: AssetScreenshotMutation;
  matchedExistingAccount?: AssetAccount;
  source: 'gemini';
}

/**
 * 1. Screenshot-to-Balance Extraction (Multimodal):
 * Sends screenshot to /api/parse-asset-screenshot, cross-references with existing accounts,
 * and creates a ready-to-commit AssetScreenshotMutation without asking user to type single numbers.
 */
export async function parseBrokerageScreenshot(
  imageBase64: string,
  mimeType: string = 'image/webp',
  engineConfig?: AIEngineConfig,
  existingAccounts: AssetAccount[] = []
): Promise<ParsedScreenshotResult> {
  // Pre-flight offline verification
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('OFFLINE: 현재 오프라인 상태입니다. 자산 스크린샷 OCR 인식은 인터넷 연결이 필요합니다. 네트워크 연결 후 다시 시도하거나 직접 계좌 잔고를 입력해주세요.');
  }

  const currentKey = sanitizeApiKey(engineConfig?.apiKey) || getSecureGeminiApiKey() || '';
  const effectiveConfig: AIEngineConfig = {
    engineType: engineConfig?.engineType || (currentKey ? 'byok' : 'local'),
    localModel: engineConfig?.localModel || 'gemma-2b',
    provider: engineConfig?.provider || 'gemini',
    modelTier: engineConfig?.modelTier || 'gemini-3.8-flash',
    apiKey: currentKey
  };

  if (effectiveConfig.engineType === 'local' && !isLocalLLMReady() && !currentKey) {
    throw new Error('ON_DEVICE_MODEL_NOT_READY: 온디바이스 AI(Beta / Labs) 모델이 로드되지 않았습니다. 설정 > AI 엔진에서 모델을 다운로드하거나 클라우드 AI(Gemini API 키)를 활성화해주세요.');
  }

  if (effectiveConfig.engineType === 'byok' && !currentKey) {
    throw new Error('API_KEY_REQUIRED: 클라우드 AI 스크린샷 인식을 위해 Gemini API 키가 필요합니다. 설정에서 API 키를 등록해주세요.');
  }

  const res = await fetch('/api/parse-asset-screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageBase64,
      mimeType,
      engineConfig: effectiveConfig
    })
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('INVALID_API_KEY: Gemini API 키 인증에 실패했습니다. 설정에서 키를 확인해주세요.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const rawError = err.error || `스크린샷 분석에 실패했습니다. (HTTP ${res.status})`;
    throw new Error(redactSensitiveKey(rawError, currentKey));
  }

  const data = await res.json();
  assertCloudScanSource(
    data.source,
    '자산 이미지 분석 결과를 확인할 수 없습니다. 잔고를 직접 입력해주세요.',
  );
  const rawAsset = data.asset;
  if (!rawAsset) {
    throw new Error('자산 스크린샷에서 유효한 계좌 정보를 찾을 수 없습니다.');
  }

  const institution = String(rawAsset.institution || '기타 금융기관').trim();
  const accountName = String(rawAsset.accountName || '자산 계좌').trim();
  const totalAccountValue = Math.abs(Number(rawAsset.currentBalance)) || 0;
  const cashBalance = typeof rawAsset.cashBalance === 'number' ? Math.abs(rawAsset.cashBalance) : undefined;
  const investedAssets = typeof rawAsset.investedAssets === 'number' 
    ? Math.abs(rawAsset.investedAssets) 
    : (cashBalance !== undefined ? Math.max(0, totalAccountValue - cashBalance) : undefined);
  const currency: SupportedCurrency = (['KRW', 'USD', 'EUR', 'JPY', 'GBP'].includes(rawAsset.currency)
    ? rawAsset.currency
    : 'KRW') as SupportedCurrency;
  const confidenceScore = typeof rawAsset.confidenceScore === 'number' ? rawAsset.confidenceScore : 0.95;

  // Try to find matching existing account by institution or account name
  const matched = existingAccounts.find(acc => {
    const instMatch = acc.institution.toLowerCase().includes(institution.toLowerCase()) ||
                      institution.toLowerCase().includes(acc.institution.toLowerCase());
    const nameMatch = acc.accountName.toLowerCase().includes(accountName.toLowerCase()) ||
                      accountName.toLowerCase().includes(acc.accountName.toLowerCase());
    return instMatch || (acc.institution === institution && nameMatch);
  });

  const action = matched ? 'UPDATE_EXISTING' : 'CREATE_NEW';
  const explanation = matched
    ? `기존 '${matched.accountName}' (${matched.institution})의 잔고를 ${totalAccountValue.toLocaleString()} ${currency}로 업데이트합니다.`
    : `신규 '${institution} - ${accountName}' 계좌를 등록하고 총 자산 ${totalAccountValue.toLocaleString()} ${currency}를 반영합니다.`;

  const mutation: AssetScreenshotMutation = {
    action,
    targetAccountId: matched?.id,
    institution,
    accountName,
    totalAccountValue,
    cashBalance,
    investedAssets,
    currency,
    holdings: rawAsset.holdings,
    confidenceScore,
    explanation
  };

  return {
    asset: {
      institution,
      accountName,
      assetType: rawAsset.assetType || 'BROKERAGE',
      currentBalance: totalAccountValue,
      cashBalance,
      investedAssets,
      currency,
      holdings: rawAsset.holdings,
      confidenceScore,
      notes: rawAsset.notes
    },
    mutation,
    matchedExistingAccount: matched,
    source: data.source
  };
}

export interface AutonomousTextParseResult {
  transactions: ParsedTransactionResult[];
  hasLoanSplit: boolean;
  loanSplitSuggestion?: LoanSplitSuggestion;
  hasReceivableRecovery: boolean;
  receivableRecoverySuggestion?: ReceivableRecoverySuggestion;
  hasCardSettlementDeduplication: boolean;
  summary: string;
  source: 'gemini' | 'local_deterministic';
}

/**
 * 2. Autonomous Financial Text & Notification Orchestration:
 * Dispatches input to deterministic heuristics (loan splits, receivable matching, card settlement)
 * and optionally enhances with Gemini if cloud engine is enabled.
 */
export async function orchestrateAutonomousFinancialText(
  text: string,
  debts: DebtItem[] = [],
  engineConfig?: AIEngineConfig
): Promise<AutonomousTextParseResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      transactions: [],
      hasLoanSplit: false,
      hasReceivableRecovery: false,
      hasCardSettlementDeduplication: false,
      summary: '입력된 내용이 없습니다.',
      source: 'local_deterministic'
    };
  }

  // First run local deterministic parser with active debts context
  const localResults = parseFinancialInputDeterministically(trimmed, debts);

  const loanSplit = localResults.find(r => r.loanSplitSuggestion)?.loanSplitSuggestion;
  const receivableRecovery = localResults.find(r => r.receivableRecoverySuggestion)?.receivableRecoverySuggestion;
  const hasCardSettlement = localResults.some(r => r.type === 'TRANSFER' && (r.subCategory === '카드대금 납부' || r.subCategory === '카드대금'));

  // If local parser detected high-confidence debt split or card settlement, return immediately
  if (loanSplit || receivableRecovery || hasCardSettlement) {
    let summary = '금융 내역이 자동으로 분석되었습니다.';
    if (loanSplit) {
      summary = `대출 원리금 상환 감지: 원금 감채 ${loanSplit.principalAmount.toLocaleString()}원 + 이자 비용 ${loanSplit.interestAmount.toLocaleString()}원`;
    } else if (receivableRecovery) {
      summary = `${receivableRecovery.counterparty}님 대여금 회수 입금 감지: ${receivableRecovery.recoveredAmount.toLocaleString()}원 채권 차감 (수입 부풀림 방지)`;
    } else if (hasCardSettlement) {
      summary = `카드 대금 결제 감지: 내부 이체로 처리하여 월간 지출 예산 중복 반영을 방지했습니다.`;
    }

    return {
      transactions: localResults,
      hasLoanSplit: Boolean(loanSplit),
      loanSplitSuggestion: loanSplit,
      hasReceivableRecovery: Boolean(receivableRecovery),
      receivableRecoverySuggestion: receivableRecovery,
      hasCardSettlementDeduplication: hasCardSettlement,
      summary,
      source: 'local_deterministic'
    };
  }

  // If engineConfig allows Gemini AI, attempt enhanced parsing
  if (engineConfig?.engineType !== 'local') {
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          engineConfig
        })
      });

      if (res.ok) {
        const data = await res.json();
        const txs: ParsedTransactionResult[] = data.transactions || [];
        if (txs.length > 0) {
          const aiLoanSplit = txs.find(t => t.loanSplitSuggestion)?.loanSplitSuggestion;
          const aiReceivable = txs.find(t => t.receivableRecoverySuggestion)?.receivableRecoverySuggestion;
          const aiCardSettlement = txs.some(t => t.type === 'TRANSFER' && (t.subCategory === '카드대금 납부' || t.subCategory === '카드대금' || t.isInternalTransfer));

          return {
            transactions: txs,
            hasLoanSplit: Boolean(aiLoanSplit),
            loanSplitSuggestion: aiLoanSplit,
            hasReceivableRecovery: Boolean(aiReceivable),
            receivableRecoverySuggestion: aiReceivable,
            hasCardSettlementDeduplication: aiCardSettlement,
            summary: 'AI 모델을 통해 금융 내역이 정밀 파싱되었습니다.',
            source: 'gemini'
          };
        }
      }
    } catch {
      // Fallback seamlessly to local deterministic parser
    }
  }

  return {
    transactions: localResults,
    hasLoanSplit: false,
    hasReceivableRecovery: false,
    hasCardSettlementDeduplication: false,
    summary: `${localResults.length}건의 거래 내역이 로컬 파서로 분석되었습니다.`,
    source: 'local_deterministic'
  };
}

/**
 * 3. Autonomous Execution: One-tap commit of Screenshot Mutation
 * Directly updates or creates the target AssetAccount in local IndexedDB.
 */
export async function commitAutonomousAssetMutation(
  mutation: AssetScreenshotMutation
): Promise<AssetAccount> {
  const existingAccounts = await getAllAssetAccounts();
  const now = new Date().toISOString();

  let target: AssetAccount;

  if (mutation.action === 'UPDATE_EXISTING' && mutation.targetAccountId) {
    const existing = existingAccounts.find(a => a.id === mutation.targetAccountId);
    if (!existing) {
      throw new Error(`대상 자산 계좌(${mutation.targetAccountId})를 찾을 수 없습니다.`);
    }

    target = {
      ...existing,
      currentBalance: mutation.totalAccountValue,
      cashBalance: mutation.cashBalance !== undefined ? mutation.cashBalance : existing.cashBalance,
      investedAssets: mutation.investedAssets !== undefined ? mutation.investedAssets : existing.investedAssets,
      currency: mutation.currency,
      lastUpdated: now,
      note: `${now.slice(0, 10)} 스크린샷 자동 동기화`,
      holdings: mutation.holdings || existing.holdings
    };
  } else {
    // Create new AssetAccount
    target = {
      id: generateSecureId('acc'),
      accountName: mutation.accountName,
      institution: mutation.institution,
      assetType: 'BROKERAGE',
      currency: mutation.currency,
      currentBalance: mutation.totalAccountValue,
      cashBalance: mutation.cashBalance,
      investedAssets: mutation.investedAssets,
      lastUpdated: now,
      note: '스크린샷 OCR 자동 등록',
      holdings: mutation.holdings
    };
  }

  await saveAssetAccount(target);
  return target;
}

/**
 * 4. Autonomous Execution: One-tap Loan Repayment Split
 * Executes atomic principal reduction and interest expense logging.
 */
export async function commitAutonomousLoanSplit(
  suggestion: LoanSplitSuggestion,
  paymentMethod?: string
): Promise<{ principalTx: Transaction; interestTx?: Transaction; updatedDebt: DebtItem }> {
  const res = await executeLoanRepaymentSplit(
    suggestion.debtId,
    suggestion.principalAmount,
    suggestion.interestAmount,
    suggestion.currency,
    paymentMethod || suggestion.counterpartyOrBank
  );
  return {
    principalTx: res.principalTransaction,
    interestTx: res.interestTransaction,
    updatedDebt: res.updatedDebt
  };
}

/**
 * 5. Autonomous Execution: One-tap Receivable Recovery
 * Executes atomic receivable settlement, reducing debt without inflating income.
 */
export async function commitAutonomousReceivableRecovery(
  suggestion: ReceivableRecoverySuggestion,
  paymentMethod?: string
): Promise<{ settlementTx: Transaction; updatedDebt: DebtItem }> {
  const res = await executeReceivableRecovery(
    suggestion.debtId,
    suggestion.recoveredAmount,
    suggestion.currency,
    paymentMethod || suggestion.counterparty
  );
  return {
    settlementTx: res.settlementTransaction,
    updatedDebt: res.updatedDebt
  };
}
