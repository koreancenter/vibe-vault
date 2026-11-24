import React, { useMemo, useCallback, Suspense } from 'react';
import { ArrowLeftRight, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { lazyWithRetry, LazyErrorBoundary } from '../lazyWithRetry';
import { FxRates, LedgerSpace, SupportedCurrency, Transaction } from '../types';
import { LedgerFilterType } from '../hooks/useTransactions';
import { cleanMerchantTitle } from '../merchantSanitizer';
import {
  convertCurrency,
  getCategoryLabel,
  getCurrencySymbol,
  getPaymentMethodLabel,
  sanitizeCsvCell,
} from '../utils';
import { useI18n } from '../i18n';

const FinancialSummaryCard = lazyWithRetry(() =>
  import('./FinancialSummaryCard').then((m) => ({ default: m.FinancialSummaryCard }))
);

function formatTransactionTitle(desc?: string, merchant?: string): string {
  if (!desc) return cleanMerchantTitle(merchant || '', '지출 내역');
  return cleanMerchantTitle(desc, merchant || '지출 내역');
}

const EXAMPLE_PROMPTS_KO = [
  { text: '민수랑 파스타 4만원 더치페이하고 토스로 2만원 받음', category: '식사' },
  { text: '쿠팡에서 화장지 2만원, 영양제 3만원 결제함', category: '생활 / 쇼핑' },
  { text: '이번 달 월급 3,500,000원 기업은행 입금', category: '수입' },
  { text: '주택청약 통장으로 150만원 자동이체', category: '저축 / 이체' },
];

const EXAMPLE_PROMPTS_EN = [
  { text: 'Lunch pasta $40 split with Alex, received $20 back', category: 'Dining' },
  { text: 'Household supplies $20 and vitamins $30 card', category: 'Living' },
  { text: 'Monthly salary $3,500 bank deposit', category: 'Income' },
  { text: 'Auto-transfer $1,500 to savings account', category: 'Savings' },
];

export interface LedgerSectionProps {
  activeSpace: LedgerSpace;
  currentSpaceTransactions: Transaction[];
  selectedCategory: string | null;
  onClearCategory: () => void;
  ledgerFilter: LedgerFilterType;
  onChangeLedgerFilter: (filter: LedgerFilterType) => void;
  currentCurrency: SupportedCurrency;
  activeCurrencies: string[];
  isMultiCurrencyMode: boolean;
  fxRates: FxRates;
  isStealth: boolean;
  theme: 'light' | 'dark' | 'system';
  onOpenReportModal: () => void;
  onOpenReceiptModal: () => void;
  onLoadSampleData: () => void;
  onRunPrompt: (promptText: string) => void;
  onSelectTransaction: (tx: Transaction) => void;
}

export const LedgerSection: React.FC<LedgerSectionProps> = React.memo(({
  activeSpace,
  currentSpaceTransactions,
  selectedCategory,
  onClearCategory,
  ledgerFilter,
  onChangeLedgerFilter,
  currentCurrency,
  activeCurrencies,
  isMultiCurrencyMode,
  fxRates,
  isStealth,
  theme,
  onOpenReportModal,
  onOpenReceiptModal,
  onLoadSampleData,
  onRunPrompt,
  onSelectTransaction,
}) => {
  const { t, language } = useI18n();

  const spaceFilteredLedgerTransactions = useMemo(() => {
    let result = currentSpaceTransactions;
    if (selectedCategory) {
      result = result.filter((tx) => tx.category === selectedCategory);
    }
    if (ledgerFilter !== 'ALL') {
      result = result.filter((tx) => tx.type === ledgerFilter);
    }
    return result;
  }, [currentSpaceTransactions, selectedCategory, ledgerFilter]);

  const handleExportSpaceCSV = useCallback(() => {
    const list = spaceFilteredLedgerTransactions;
    if (list.length === 0) return;
    const isKo = language === 'ko';
    const bom = '\uFEFF';
    let csv = isKo
      ? `날짜,구분,카테고리,상세카테고리,내역,금액,통화,결제수단,비고\r\n`
      : `Date,Type,Category,Subcategory,Description,Amount,Currency,Payment Method,Note\r\n`;
    list.forEach((tx) => {
      const typeStr = sanitizeCsvCell(
        isKo
          ? tx.type === 'EXPENSE'
            ? '지출'
            : tx.type === 'INCOME'
            ? '수입'
            : tx.type === 'TRANSFER'
            ? '이체'
            : '정산'
          : tx.type === 'EXPENSE'
          ? 'Expense'
          : tx.type === 'INCOME'
          ? 'Income'
          : tx.type === 'TRANSFER'
          ? 'Transfer'
          : 'Settlement'
      );
      const catStr = sanitizeCsvCell(getCategoryLabel(tx.category, tx.subCategory, language));
      const subCat = sanitizeCsvCell(tx.subCategory || '');
      const safeDesc = sanitizeCsvCell(tx.description || '');
      const safeNote = sanitizeCsvCell(tx.note || '');
      const pay = sanitizeCsvCell(getPaymentMethodLabel(tx.paymentMethod, tx.type, language));
      csv += `"${tx.date}","${typeStr}","${catStr}","${subCat}","${safeDesc}",${tx.amount},"${
        tx.currency || activeSpace.currency || currentCurrency
      }","${pay}","${safeNote}"\r\n`;
    });
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSpace.name}_${isKo ? '내역' : 'ledger'}_${format(new Date(), 'yyyyMMdd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [spaceFilteredLedgerTransactions, activeSpace.name, activeSpace.currency, currentCurrency, language]);

  const secondaryCurrency = useMemo(
    () =>
      activeCurrencies.find(
        (c) => c.toUpperCase() !== (activeSpace.currency || currentCurrency).toUpperCase()
      ),
    [activeCurrencies, activeSpace.currency, currentCurrency]
  );

  const recommendedPrompts = useMemo(() => {
    if (activeSpace.id !== 'default') {
      return language === 'ko'
        ? [
            {
              text: `회비 ${activeSpace.currency === 'KRW' ? '5만원' : '50EUR'} 전원 통장 입금 완료`,
              category: '회비 수입',
            },
            { text: '단체 저녁 식사 및 음료 비용 카드 결제', category: '단체 식비' },
            { text: '현지 관광지 단체 입장료 현금 결제', category: '관광/입장료' },
            { text: '이동 버스 대절 및 주유비 결제', category: '교통비' },
          ]
        : [
            {
              text: `Group dues ${activeSpace.currency === 'KRW' ? '50,000 KRW' : '$50'} bank deposit`,
              category: 'Dues',
            },
            { text: 'Group dinner and drinks $180 card', category: 'Dining' },
            { text: 'Museum group tickets $90 cash', category: 'Tickets' },
            { text: 'Shuttle van rental and fuel $140', category: 'Transport' },
          ];
    }
    return language === 'ko' ? EXAMPLE_PROMPTS_KO : EXAMPLE_PROMPTS_EN;
  }, [activeSpace.id, activeSpace.currency, language]);

  return (
    <div className="w-full space-y-4">
      {/* Financial Summary Card */}
      <LazyErrorBoundary>
        <Suspense fallback={null}>
          <FinancialSummaryCard
            transactions={currentSpaceTransactions}
            currencySymbol={activeSpace.currency || currentCurrency}
            fxRates={fxRates}
            isStealth={isStealth}
            theme={theme}
            isMultiCurrencyMode={isMultiCurrencyMode}
            secondaryCurrency={secondaryCurrency}
            activeSpace={activeSpace}
          />
        </Suspense>
      </LazyErrorBoundary>

      {/* In Event Ledger mode: Event Budget Summary */}
      {activeSpace.id !== 'default' && (
        <div className="p-5 rounded-2xl border backdrop-blur-2xl bg-white/[0.03] border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white">
              {language === 'ko' ? '프로젝트·행사 정산 관리' : 'Event & Group Settlement'}
            </span>
            <span className="text-xs text-neutral-400 font-light tabular-nums">
              {activeSpace.memberCount
                ? language === 'ko'
                  ? `${activeSpace.memberCount}명 정산`
                  : `${activeSpace.memberCount} members`
                : language === 'ko'
                ? '참여자 미지정'
                : 'No member count'}
            </span>
          </div>
          <p className="text-xs text-neutral-300 font-light leading-relaxed">
            {language === 'ko'
              ? '공동 회비 및 지출 영수증을 취합하여 대한민국 표준 정산 내역서(모임/행사/워크숍)를 생성합니다.'
              : 'Compile shared dues and expense receipts into a clean A4 settlement report for trips, clubs, or workshops.'}
          </p>
          <button
            id="event-settlement-report-btn"
            type="button"
            onClick={onOpenReportModal}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-white text-neutral-950 hover:bg-neutral-200 active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            <span>{language === 'ko' ? '결산서 출력' : 'Print Settlement Report'}</span>
          </button>
        </div>
      )}

      {/* Category Filter Status Pill */}
      {selectedCategory && (
        <div className="flex items-center justify-between px-2 text-xs text-[#94A3B8]">
          <span>
            {language === 'ko' ? '카테고리 필터링:' : 'Filtered by category:'}{' '}
            <strong className="text-[#38bdf8] font-semibold">
              {getCategoryLabel(selectedCategory, undefined, language)}
            </strong>
          </span>
          <button
            type="button"
            onClick={onClearCategory}
            className="text-xs text-slate-400 hover:text-white font-medium cursor-pointer transition-colors"
          >
            {language === 'ko' ? '필터 해제' : 'Clear filter'}
          </button>
        </div>
      )}

      {/* Filter Pills & Actions */}
      <div className="flex items-center justify-between gap-2 min-h-[36px] flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {(['ALL', 'EXPENSE', 'INCOME', 'TRANSFER', 'SETTLEMENT'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onChangeLedgerFilter(f as LedgerFilterType)}
              className={`px-3.5 py-1 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all border cursor-pointer ${
                ledgerFilter === f
                  ? 'bg-white text-black font-semibold border-white shadow-xs'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 hover:text-white border-white/15'
              }`}
            >
              {f === 'ALL'
                ? t('filter_all')
                : f === 'EXPENSE'
                ? t('filter_expense')
                : f === 'INCOME'
                ? t('filter_income')
                : f === 'TRANSFER'
                ? t('filter_transfer')
                : t('filter_settlement')}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            id="export-csv-btn"
            type="button"
            onClick={handleExportSpaceCSV}
            className="px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all active:scale-95 border bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 hover:text-white border-white/15 cursor-pointer shadow-xs"
            title={t('export_csv')}
            aria-label={t('export_csv')}
          >
            <span>{t('export_csv')}</span>
          </button>
        </div>
      </div>

      {/* Empty State / Recommended Prompts / Transaction Stream */}
      {currentSpaceTransactions.length === 0 ? (
        <div className="p-6 sm:p-8 rounded-2xl border text-center space-y-4 my-2 transition-all bg-white/[0.03] backdrop-blur-2xl border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white">
          <h2 className="text-base font-semibold tracking-tight text-white">
            {activeSpace.id !== 'default'
              ? `[${activeSpace.name}] ${t('empty_ledger_title')}`
              : t('empty_ledger_title')}
          </h2>

          <div className="flex items-center justify-center flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenReceiptModal}
              className="h-8 px-4 rounded-xl font-semibold text-xs bg-white hover:bg-neutral-200 text-neutral-950 flex items-center justify-center active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              <span>{t('scan_receipt')}</span>
            </button>

            {activeSpace.id === 'default' && (
              <button
                type="button"
                onClick={onLoadSampleData}
                className="h-8 px-4 rounded-xl font-medium text-xs border flex items-center justify-center active:scale-95 transition-all cursor-pointer bg-white/[0.08] hover:bg-white/[0.14] text-white border-white/15 shadow-xs"
              >
                <span>{t('load_sample_data')}</span>
              </button>
            )}
          </div>

          <div className="pt-3 text-left space-y-1 border-t border-white/[0.05]">
            <span className="text-[11px] font-medium block px-1 pb-0.5 text-neutral-300">
              {t('recommended_prompts')}
            </span>
            <div className="space-y-1">
              {recommendedPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onRunPrompt(prompt.text)}
                  className="w-full text-left text-xs py-2 px-2.5 rounded-xl transition-colors flex items-center justify-between group hover:bg-white/[0.06] text-neutral-200 cursor-pointer"
                >
                  <div className="truncate pr-2">
                    <span className="font-semibold mr-1.5 text-sky-400">[{prompt.category}]</span>
                    <span className="font-normal text-neutral-200">{prompt.text}</span>
                  </div>
                  <ChevronRight
                    size={13}
                    className="shrink-0 opacity-40 group-hover:opacity-100 transition-opacity text-slate-400 group-hover:text-sky-400"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : spaceFilteredLedgerTransactions.length === 0 ? (
        <div className="py-12 text-center text-xs space-y-2 text-neutral-300">
          <p className="font-normal text-neutral-300">{t('empty_filter_message')}</p>
          {ledgerFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => onChangeLedgerFilter('ALL')}
              className="mt-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 hover:text-white border-white/15 cursor-pointer shadow-xs"
            >
              {t('view_all_transactions')}
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {spaceFilteredLedgerTransactions.map((tx) => {
            const isExpense = tx.type === 'EXPENSE';
            const isIncome = tx.type === 'INCOME';
            const isSettlement = tx.type === 'SETTLEMENT';
            const displayTitle = formatTransactionTitle(tx.description);
            const categoryLabel = tx.isInternalTransfer
              ? tx.subCategory || (language === 'ko' ? '내부이체/원금상환' : 'Internal Transfer')
              : getCategoryLabel(tx.category, tx.subCategory, language);
            const currSymbol = getCurrencySymbol(tx.currency || currentCurrency);

            return (
              <div
                key={tx.id}
                onClick={() => onSelectTransaction(tx)}
                className="py-3.5 px-1.5 transition-colors cursor-pointer group select-none hover:bg-white/[0.03] active:bg-white/[0.06]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium leading-snug truncate text-white">
                      {displayTitle}
                    </span>

                    <div className="flex items-center gap-1.5 text-xs font-normal mt-0.5 flex-wrap text-neutral-300">
                      <span>{categoryLabel}</span>
                      {(tx.paymentMethod || tx.type === 'INCOME') && (
                        <>
                          <span className="opacity-30">·</span>
                          <span>{getPaymentMethodLabel(tx.paymentMethod, tx.type, language)}</span>
                        </>
                      )}
                      <span className="opacity-30">·</span>
                      <span>
                        {(() => {
                          try {
                            const d = parseISO(tx.date);
                            return Number.isNaN(d.getTime()) ? '' : format(d, 'M.d HH:mm');
                          } catch {
                            return '';
                          }
                        })()}
                      </span>
                      {tx.note && (
                        <>
                          <span className="opacity-30">·</span>
                          <span className="text-amber-400/90 font-medium truncate max-w-[150px]">
                            {tx.note}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0 pl-2">
                    <span
                      className={`text-sm font-medium tracking-tight tabular-nums whitespace-nowrap transition-all ${
                        isStealth ? 'blur-sm select-none' : ''
                      } ${
                        tx.isInternalTransfer
                          ? 'text-blue-400'
                          : isExpense
                          ? 'text-white'
                          : isIncome || isSettlement
                          ? 'text-sky-400'
                          : 'text-blue-400'
                      }`}
                    >
                      {tx.isInternalTransfer ? '⇄ ' : isExpense ? '-' : '+'}
                      {currSymbol}
                      {(Number(tx.amount) || 0).toLocaleString()}
                    </span>

                    {isMultiCurrencyMode &&
                      (() => {
                        const txCurr = (tx.currency || currentCurrency).toUpperCase();
                        const baseCurr = currentCurrency.toUpperCase();
                        const secondaryCode =
                          txCurr === baseCurr
                            ? activeCurrencies.find((c) => c.toUpperCase() !== baseCurr) || 'KRW'
                            : baseCurr;

                        if (secondaryCode === txCurr) return null;

                        const convertedSecondary = convertCurrency(
                          tx.amount,
                          txCurr,
                          secondaryCode,
                          fxRates
                        );
                        const secSym = getCurrencySymbol(secondaryCode);
                        const isIntSec =
                          secondaryCode === 'KRW' ||
                          secondaryCode === 'JPY' ||
                          secondaryCode === 'IDR' ||
                          secondaryCode === 'VND';
                        const formattedSec = isIntSec
                          ? Math.round(convertedSecondary).toLocaleString()
                          : convertedSecondary.toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            });
                        const sign = tx.isInternalTransfer ? '⇄ ' : isExpense ? '-' : '+';

                        return (
                          <span
                            className={`text-[11px] font-normal mt-0.5 tabular-nums whitespace-nowrap text-neutral-300 ${
                              isStealth ? 'blur-xs select-none' : ''
                            }`}
                          >
                            ≈ {sign}
                            {secSym}
                            {formattedSec}
                          </span>
                        );
                      })()}
                  </div>
                </div>

                {isSettlement && (
                  <div className="mt-2 px-2.5 py-1 rounded-full text-xs flex items-center justify-between font-normal bg-sky-500/10 text-sky-300 border border-sky-500/20">
                    <span className="flex items-center gap-1.5">
                      <ArrowLeftRight size={13} /> {t('dutch_pay_completed')}
                    </span>
                    <span className="tabular-nums">
                      {t('dutch_pay_received', {
                        symbol: currSymbol,
                        amount: tx.amount.toLocaleString(),
                      })}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

LedgerSection.displayName = 'LedgerSection';
