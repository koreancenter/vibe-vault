import React, { useState, useRef, useCallback, useMemo } from 'react';
import { 
  Transaction, 
  TransactionType, 
  SupportedCurrency, 
  LaunchScreenMode, 
  FxRates, 
  FinancialQueryResult,
  CurrencyCode
} from '../types';
import { 
  parseFinancialInputDeterministically, 
  parseFinancialText, 
  detectPeerDebt, 
  isAnalyticalQueryInput, 
  normalizeTransactionCategory,
  ParsedItem,
  planPeerDebtUpdate,
  PeerDebtEvent
} from '../financialParser';
import { 
  executeFinancialQuery, 
  commitAutonomousLoanSplit, 
  commitAutonomousReceivableRecovery 
} from '../autonomousFinance';
import { 
  getAllAssetAccounts, 
  getAllDebts, 
  saveDebt 
} from '../db';
import { 
  getAIEngineConfig, 
  UserPreferences 
} from '../utils';
import { generateSecureId } from '../identifiers';
import { findRefundTarget, buildLinkedRefund } from '../financialParser';
import { RealtimePreviewData } from '../components/OmnibarDock';
import { DEFAULT_FX_RATES } from '../fxRates';

async function applyPeerDebt(event: PeerDebtEvent, debts: any[], currency?: string): Promise<void> {
  const planned = planPeerDebtUpdate(event, debts, (currency as CurrencyCode) || 'KRW');
  if (planned) await saveDebt(planned);
}

export interface UseOmnibarControllerProps {
  transactions: Transaction[];
  fxRates: FxRates;
  currentCurrency: SupportedCurrency;
  mainMode: LaunchScreenMode;
  setMainMode: (mode: LaunchScreenMode) => void;
  activeSpaceId: string;
  activeSpaceCurrency?: string;
  userPrefs: UserPreferences;
  isOnline: boolean;
  batchAddTxs: (txs: Transaction[]) => Promise<void>;
  setPendingCategorizationTxs: (txs: Transaction[]) => void;
  showToast: (message: string) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function useOmnibarController({
  transactions,
  fxRates,
  currentCurrency,
  mainMode,
  setMainMode,
  activeSpaceId,
  activeSpaceCurrency,
  userPrefs,
  isOnline,
  batchAddTxs,
  setPendingCategorizationTxs,
  showToast,
  scrollContainerRef,
}: UseOmnibarControllerProps) {
  const [input, setInput] = useState('');
  const [isOmnibarFocused, setIsOmnibarFocused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeQueryResult, setActiveQueryResult] = useState<FinancialQueryResult | null>(null);
  const [isQuerying, setIsQuerying] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);

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

  // Conversational Financial Query Execution (Ask AI Vault / Omnibar)
  const handleRunFinancialQuery = useCallback(async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || isQuerying) return;

    setIsQuerying(true);
    setError(null);

    try {
      const accounts = await getAllAssetAccounts();
      const result = await executeFinancialQuery(
        trimmed,
        transactions,
        accounts,
        fxRates,
        currentCurrency,
        getAIEngineConfig()
      );
      setActiveQueryResult(result);
      setInput('');
      setMainMode('insights');
      showToast(`AI 재정 브리핑 생성 완료`);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: unknown) {
      console.error('Financial query error:', err);
      const msg = err instanceof Error ? err.message : '금융 질문을 분석하는 중 오류가 발생했습니다.';
      setError(msg);
    } finally {
      setIsQuerying(false);
    }
  }, [isQuerying, transactions, fxRates, currentCurrency, setMainMode, showToast, scrollContainerRef]);

  // Real-time zero-latency input preview for ledger Omnibar
  const realtimePreview = useMemo<RealtimePreviewData | null>(() => {
    if (mainMode !== 'ledger' || input.trim().length <= 2) return null;
    try {
      const results = parseFinancialInputDeterministically(input);
      if (results && results.length > 0) {
        const first = results[0];
        if (first.amount > 0 || first.merchant || first.category) {
          const isDutch = Boolean(
            first.peerDebt || 
            first.splitInfo || 
            first.note?.includes('더치페이') || 
            first.note?.includes('분담') ||
            /더치페이|엔빵|n빵|반반|각자/i.test(input)
          );
          return {
            merchant: first.merchant || first.description,
            amount: first.amount > 0 ? first.amount : undefined,
            category: first.category,
            currency: (first.currency as SupportedCurrency) || currentCurrency,
            isDutch
          };
        }
      }
    } catch {
      // Safe fallback on partial syntax
    }
    return null;
  }, [mainMode, input, currentCurrency]);

  // AI Omnibar Ingestion Process
  const handleProcessInput = useCallback(async (customText?: string) => {
    const textToProcess = (customText || input).trim();
    if (!textToProcess || isProcessing || isQuerying) return;

    const isAnalyticalQuery = isAnalyticalQueryInput(textToProcess, mainMode);

    if (isAnalyticalQuery) {
      await handleRunFinancialQuery(textToProcess);
      return;
    }

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
        const hasSpecialFlow = debtOrCardResults.some(r => r.loanSplitSuggestion || r.receivableRecoverySuggestion || r.isInternalTransfer || r.peerDebt || r.splitInfo || r.clarification || r.subCategory === 'Refund' || r.type === 'SETTLEMENT' || Boolean(r.installment));
        
        if (hasSpecialFlow) {
          parsedTransactions = debtOrCardResults;
        } else {
          const items: ParsedItem[] = parseFinancialText(
            textToProcess, 
            (activeSpaceCurrency as SupportedCurrency) || userPrefs.currencySymbol || 'KRW'
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

      const needsClarification = parsedTransactions.find((t: any) => t.clarification);
      if (needsClarification) {
        throw new Error(needsClarification.clarification);
      }

      if (!Array.isArray(parsedTransactions) || parsedTransactions.length === 0) {
        throw new Error(
          detectPeerDebt(textToProcess)
            ? '상대방이 대신 낸 금액은 갚을 돈으로 기록해야 합니다. 다시 시도해 주세요.'
            : '내역을 정확히 인식하지 못했습니다. 다시 말씀해 주세요.'
        );
      }

      const newTxs: Transaction[] = [];
      let debtOnlyCount = 0;

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

        if (t.peerDebt) {
          await applyPeerDebt(t.peerDebt, debts, t.currency);
          if (t.peerDebt.debtOnly) {
            debtOnlyCount += 1;
            continue;
          }
        }

        if (t.subCategory === 'Refund' && t.type === 'INCOME') {
          const target = findRefundTarget(
            { amount: Math.abs(Number(t.amount)), text: `${textToProcess} ${t.description || ''}`, currency: t.currency },
            transactions.filter(x => (x.spaceId || 'default') === activeSpaceId)
          );
          if (target) {
            const linked = buildLinkedRefund(target, {
              amount: Math.abs(Number(t.amount)),
              date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
              description: t.description || '',
              paymentMethod: t.paymentMethod
            });
            newTxs.push({ ...linked, id: generateSecureId('tx-refund'), spaceId: activeSpaceId });
            continue;
          }
        }

        let type: TransactionType = t.type || 'EXPENSE';
        const keywordSource = parsedTransactions.length > 1 ? (t.description || '') : textToProcess;
        const isIncomeKeyword = /(?:월급|급여|보너스|상여금|수당|용돈|배당금|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|salary|paycheck|bonus|allowance)/i.test(keywordSource) || /(?:월급|급여|보너스|상여금|수당|용돈|배당금|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|salary|paycheck|bonus|allowance)/i.test(t.description || '');
        const isExplicitExpense = /(?:결제|지출|썼|씀|냄|냈|사먹|구입|구매|샀)/i.test(keywordSource);

        if (isIncomeKeyword && !isExplicitExpense && type !== 'TRANSFER' && type !== 'SETTLEMENT') {
          type = 'INCOME';
        }

        const { category, subCategory } = normalizeTransactionCategory(
          t.subCategory === 'Refund' ? 'Refund' : t.category,
          t.description || textToProcess,
          type
        );

        let desc = (t.description || t.merchant || '').trim();
        desc = desc.replace(/만\s*원\s*들어옴/i, '들어옴')
                   .replace(/^[\s,·\.\-원\d]+(?:\s*원)?\s*/i, '')
                   .replace(/\s+/g, ' ')
                   .trim();
        if (!desc || desc === '원') {
          desc = type === 'INCOME' ? '급여 수입' : '지출 내역';
        }

        const txCurrency = t.currency || (activeSpaceCurrency as SupportedCurrency) || userPrefs.currencySymbol || 'KRW';
        const entryFx = (txCurrency && txCurrency !== 'KRW')
          ? (fxRates?.rates?.[txCurrency] || DEFAULT_FX_RATES.rates[txCurrency] || 1)
          : undefined;

        newTxs.push({
          id: generateSecureId('tx-import'),
          type,
          amount: Math.abs(Number(t.amount)) || 0,
          currency: txCurrency,
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
          installment: t.installment,
          paidBy: t.paidBy || '나',
          splitParticipants: t.splitParticipants,
          fxRateAtEntry: entryFx,
        });
      }

      if (newTxs.length === 0 && debtOnlyCount > 0) {
        if (!customText) setInput('');
        showToast('상대방이 대신 낸 금액을 갚을 돈으로 기록했습니다.');
        return;
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
  }, [
    input, 
    isProcessing, 
    isQuerying, 
    mainMode, 
    isOnline, 
    activeSpaceCurrency, 
    userPrefs.currencySymbol, 
    userPrefs.autoCategorization, 
    activeSpaceId, 
    transactions, 
    batchAddTxs, 
    setPendingCategorizationTxs, 
    showToast, 
    scrollContainerRef, 
    handleRunFinancialQuery
  ]);

  return {
    input,
    setInput,
    isOmnibarFocused,
    setIsOmnibarFocused,
    isProcessing,
    setIsProcessing,
    isListening,
    error,
    setError,
    activeQueryResult,
    setActiveQueryResult,
    isQuerying,
    toggleListen,
    handleRunFinancialQuery,
    handleProcessInput,
    realtimePreview
  };
}
