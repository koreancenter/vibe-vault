import React, { useMemo } from 'react';
import { ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  AssetAccount,
  AssetCategoryType,
  FxRates,
  SupportedCurrency,
  Transaction,
} from '../../types';
import {
  convertCurrency,
  formatCurrency,
  getAssetCategoryKo,
  getCategoryLabel,
  getCurrencySymbol,
  getPaymentMethodLabel,
} from '../../utils';
import { useI18n } from '../../i18n';

export interface VaultAssetCategoryMeta {
  type: AssetCategoryType;
  label: string;
  color: string;
}

export interface TrackedCreditCard {
  id: string;
  name: string;
  billingDay?: number;
  totalExpenses: number;
  totalPayments: number;
  totalRefunds: number;
  reconcileOffset: number;
  rawRunningBalance: number;
  unpaidLiability: number;
  unpaidAmount: number;
  hasMismatch: boolean;
  associatedAccountId?: string;
}

export interface VaultAccountListProps {
  accounts: AssetAccount[];
  filteredAccounts: AssetAccount[];
  assetCategories: VaultAssetCategoryMeta[];
  selectedFilter: 'ALL' | AssetCategoryType;
  onSelectFilter: (filter: 'ALL' | AssetCategoryType) => void;
  currentCurrency: SupportedCurrency;
  fxRates: FxRates;
  isLight: boolean;
  stealthMode: boolean;
  onEditBalance: (account: AssetAccount) => void;
  onDeleteAccount: (id: string, name: string) => void;
  trackedCreditCards: TrackedCreditCard[];
  totalCardLiabilities: number;
  formattedTotalUnpaid: string;
  onOpenReconcile: (card: TrackedCreditCard) => void;
  recentTransactions: Transaction[];
  onNavigateToLedger?: () => void;
}

export const VaultAccountList: React.FC<VaultAccountListProps> = React.memo(({
  accounts,
  filteredAccounts,
  assetCategories,
  selectedFilter,
  onSelectFilter,
  currentCurrency,
  fxRates,
  isLight,
  stealthMode,
  onEditBalance,
  onDeleteAccount,
  trackedCreditCards,
  totalCardLiabilities,
  formattedTotalUnpaid,
  onOpenReconcile,
  recentTransactions,
  onNavigateToLedger,
}) => {
  const { language } = useI18n();
  const isKo = language === 'ko';

  const categoryCounts = useMemo(() => {
    const counts: Record<AssetCategoryType, number> = {
      BROKERAGE: 0,
      BANK: 0,
      CRYPTO: 0,
      REAL_ESTATE: 0,
      CASH: 0,
      LIABILITY: 0,
    };

    for (const acc of accounts) {
      if (acc.assetType === 'LIABILITY' || (acc.isOverdraft && acc.currentBalance < 0) || acc.currentBalance < 0) {
        counts.LIABILITY += 1;
      }
      if (acc.assetType !== 'LIABILITY') {
        counts[acc.assetType] = (counts[acc.assetType] || 0) + 1;
      }
    }
    return counts;
  }, [accounts]);

  const getAssetTypeLabel = (type: AssetCategoryType) => {
    if (isKo) return getAssetCategoryKo(type);
    const found = assetCategories.find((c) => c.type === type);
    return found ? found.label : type;
  };

  const hasAccounts = accounts.length > 0;

  return (
    <>
      {hasAccounts && (
        <>
          {/* 4. Account Type Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
            <button
              type="button"
              onClick={() => onSelectFilter('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border shrink-0 cursor-pointer ${
                selectedFilter === 'ALL'
                  ? 'bg-white text-black border-white shadow-xs'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 hover:text-white border-white/15'
              }`}
            >
              {isKo ? '전체' : 'All'} ({accounts.length})
            </button>

            {assetCategories.map((cat) => {
              const count = categoryCounts[cat.type] || 0;
              return (
                <button
                  key={cat.type}
                  type="button"
                  onClick={() => onSelectFilter(cat.type)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1 border shrink-0 cursor-pointer ${
                    selectedFilter === cat.type
                      ? 'bg-white text-black border-white shadow-xs'
                      : 'bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 hover:text-white border-white/15'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span className="opacity-85 tabular-nums">({count})</span>
                </button>
              );
            })}
          </div>

          {/* 5. Account List Feed */}
          {filteredAccounts.length === 0 ? (
            <div
              className={`p-6 rounded-2xl border text-center space-y-2.5 ${
                isLight
                  ? 'bg-slate-50/70 border-slate-200 text-slate-600'
                  : 'bg-[var(--surface-card)]/90 backdrop-blur-xl border border-white/10 text-neutral-300'
              }`}
            >
              <p className="text-xs font-normal">
                {isKo ? '선택한 분류에 해당하는 자산 계좌가 없습니다.' : 'No accounts found in this category.'}
              </p>
              <button
                type="button"
                onClick={() => onSelectFilter('ALL')}
                className="text-xs text-white hover:underline font-medium cursor-pointer"
              >
                {isKo ? '전체 계좌 보기' : 'View All Accounts'}
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
                const isNegativeOverdraft = (acc.isOverdraft || acc.currentBalance < 0) && acc.currentBalance < 0;

                return (
                  <div
                    key={acc.id}
                    className={`group relative rounded-2xl p-4 border transition-all duration-150 backdrop-blur-xl ${
                      isLight
                        ? 'bg-white/85 border-slate-200/80 hover:border-slate-300 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)]'
                        : 'bg-[var(--surface-card)]/90 backdrop-blur-xl border border-white/10 hover:border-white/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]'
                    }`}
                  >
                    {/* Header: Institution/Account info (Left) & Balance (Right) */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="text-sm font-medium truncate text-white"
                            title={acc.institution}
                          >
                            {acc.institution}
                          </span>
                          <span className="text-white/30 font-normal text-xs">·</span>
                          <span className="text-xs font-normal text-neutral-300 shrink-0">
                            {acc.isOverdraft
                              ? isKo
                                ? '마이너스통장'
                                : 'Credit Line'
                              : getAssetTypeLabel(acc.assetType)}
                          </span>
                          {(acc.isOverdraft || isNegativeOverdraft) && (
                            <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border border-white/15 bg-white/[0.06] text-amber-300 font-mono tracking-tight">
                              {acc.currentBalance < 0
                                ? isKo
                                  ? `마이너스 대출 이용 중${acc.overdraftLimit ? ` (한도 ${formatCurrency(acc.overdraftLimit, acc.currency || currentCurrency)})` : ''}`
                                  : `Overdraft active${acc.overdraftLimit ? ` (Limit ${formatCurrency(acc.overdraftLimit, acc.currency || currentCurrency)})` : ''}`
                                : isKo
                                ? `마이너스 통장${acc.overdraftLimit ? ` (한도 ${formatCurrency(acc.overdraftLimit, acc.currency || currentCurrency)})` : ''}`
                                : `Credit line${acc.overdraftLimit ? ` (Limit ${formatCurrency(acc.overdraftLimit, acc.currency || currentCurrency)})` : ''}`}
                            </span>
                          )}
                        </div>
                        <p
                          className="text-xs font-normal truncate mt-0.5 text-neutral-300"
                          title={acc.accountName}
                        >
                          {acc.accountName}
                        </p>
                      </div>

                      {/* Right: Balance strictly right-aligned */}
                      <div className="flex-none text-right">
                        <div
                          className={`text-sm font-semibold tracking-tight tabular-nums text-right ${
                            isNegativeOverdraft
                              ? 'text-amber-400 font-mono'
                              : acc.assetType === 'LIABILITY'
                              ? 'text-amber-400 font-mono'
                              : 'text-white'
                          } ${stealthMode ? 'blur-sm select-none' : ''}`}
                        >
                          {formatCurrency(converted, currentCurrency)}
                        </div>
                      </div>
                    </div>

                    {/* Sub row: Account details / Note & Edit/Delete Actions */}
                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-white/[0.06]">
                      <div className="min-w-0 flex-1">
                        {acc.accountNumberMasked || acc.note ? (
                          <p
                            className="text-[11px] font-normal truncate text-neutral-300"
                            title={acc.accountNumberMasked || acc.note}
                          >
                            {acc.accountNumberMasked || acc.note}
                          </p>
                        ) : (
                          <div />
                        )}
                      </div>

                      {/* Actions (수정 & 삭제) */}
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          onClick={() => onEditBalance(acc)}
                          title={isKo ? '잔고 수정' : 'Edit balance'}
                          aria-label={isKo ? `${acc.accountName} 잔고 수정` : `Edit balance for ${acc.accountName}`}
                          className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteAccount(acc.id, acc.accountName)}
                          title={isKo ? '계좌 삭제' : 'Delete account'}
                          aria-label={isKo ? `${acc.accountName} 계좌 삭제` : `Delete ${acc.accountName}`}
                          className="p-1.5 rounded-lg text-neutral-300 hover:text-rose-400 hover:bg-white/[0.08] transition-colors cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Holdings Sub-List if available */}
                    {acc.holdings && acc.holdings.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-white/[0.06] space-y-1.5">
                        <span className="text-[11px] font-medium text-neutral-300 block">
                          {isKo ? '보유 종목' : 'Holdings'} ({acc.holdings.length})
                        </span>
                        <div className="space-y-1 max-h-24 overflow-y-auto scrollbar-none divide-y divide-white/[0.04]">
                          {acc.holdings.map((h, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs font-normal gap-2 pt-1">
                              <span className="truncate min-w-0 flex-1 text-neutral-200" title={h.name}>
                                {h.name}
                              </span>
                              <div className="flex items-center gap-1.5 flex-none">
                                <span className="font-medium text-white tabular-nums">
                                  {formatCurrency(h.valuation, currentCurrency)}
                                </span>
                                {h.profitRate !== undefined && (
                                  <span
                                    className={`text-[11px] font-medium tabular-nums ${
                                      h.profitRate >= 0 ? 'text-emerald-400' : 'text-sky-400'
                                    }`}
                                  >
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
        </>
      )}

      {/* 6. Credit Card Liability Tracking & Settlement Section (신용카드 미결제 잔액) */}
      {(totalCardLiabilities > 0 || (hasAccounts && trackedCreditCards.some((c) => c.unpaidLiability > 0))) && (
        <div
          className={`p-5 rounded-2xl border backdrop-blur-xl transition-all ${
            isLight
              ? 'bg-white/85 border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900'
              : 'bg-[var(--surface-card)]/90 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <h2 className="text-xs font-semibold tracking-tight text-white">
              {isKo ? '신용카드 미결제 잔액' : 'Unpaid Credit Card Balance'}
            </h2>
            <span
              className={`text-xs font-mono font-medium text-neutral-200 tabular-nums ${
                stealthMode ? 'blur-xs select-none' : ''
              }`}
            >
              {isKo ? '총' : 'Total'} {formattedTotalUnpaid}
            </span>
          </div>

          {trackedCreditCards.length === 0 ? (
            <div className="py-4 text-center text-xs font-normal text-neutral-300">
              {isKo ? '기록된 신용카드 사용 내역이 없습니다.' : 'No credit card charges recorded.'}
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {trackedCreditCards.map((card) => (
                <div
                  key={card.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs border-b border-white/[0.04] last:border-0"
                >
                  <span className="font-medium truncate min-w-0 text-white">
                    {isKo ? card.name : card.name === '카드' ? 'Card' : card.name}
                  </span>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`font-mono text-sm font-semibold tabular-nums text-white ${
                        stealthMode ? 'blur-xs select-none' : ''
                      }`}
                    >
                      {getCurrencySymbol(currentCurrency)}
                      {card.unpaidAmount.toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenReconcile(card)}
                      className="px-2.5 py-1 rounded-lg border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-neutral-200 hover:text-white font-medium transition-all active:scale-95 cursor-pointer"
                    >
                      {isKo ? '차액 조정' : 'Reconcile'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7. Recent Transactions Preview (최근 거래) */}
      {(hasAccounts || recentTransactions.length > 0) && (
        <div
          className={`p-5 rounded-2xl border backdrop-blur-xl transition-all ${
            isLight
              ? 'bg-white/85 border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900'
              : 'bg-[var(--surface-card)]/90 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <h2 className="text-sm font-medium tracking-wide text-white">
              {isKo ? '최근 거래' : 'Recent Transactions'}
            </h2>
            {onNavigateToLedger && (
              <button
                type="button"
                onClick={onNavigateToLedger}
                className="text-xs text-neutral-300 hover:text-white font-medium flex items-center gap-1 transition-colors group cursor-pointer"
              >
                <span>{isKo ? '전체보기' : 'View All'}</span>
                <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
          </div>

          {recentTransactions.length === 0 ? (
            <div className="py-6 text-center text-xs font-normal text-neutral-300">
              {isKo ? '기록된 거래 내역이 없습니다.' : 'No transactions recorded yet.'}
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {recentTransactions.slice(0, 5).map((tx) => {
                const isExpense = tx.type === 'EXPENSE';
                const isIncome = tx.type === 'INCOME';
                const categoryLabel = tx.isInternalTransfer
                  ? tx.subCategory || (isKo ? '내부이체/원금상환' : 'Internal Transfer')
                  : isIncome && tx.category === 'Fixed' && !tx.subCategory
                  ? isKo
                    ? '급여'
                    : 'Salary'
                  : tx.category
                  ? getCategoryLabel(tx.category, tx.subCategory, language)
                  : '';
                const paymentLabel = tx.paymentMethod
                  ? getPaymentMethodLabel(tx.paymentMethod, tx.type, language)
                  : '';
                let dateLabel = '';
                try {
                  const parsed = parseISO(tx.date);
                  if (!Number.isNaN(parsed.getTime())) {
                    dateLabel = format(parsed, 'M.d HH:mm');
                  }
                } catch {
                  dateLabel = '';
                }

                return (
                  <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-normal text-white truncate">{tx.description}</span>
                        <span className="text-[11px] text-neutral-300 font-normal shrink-0">
                          {categoryLabel}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-300 font-normal mt-0.5">
                        <span>{dateLabel}</span>
                        {paymentLabel && <span className="ml-1.5 opacity-80">· {paymentLabel}</span>}
                      </div>
                    </div>
                    <div
                      className={`font-semibold tabular-nums whitespace-nowrap text-xs ${
                        isIncome ? 'text-sky-400' : isExpense ? 'text-white' : 'text-blue-400'
                      } ${stealthMode ? 'blur-xs' : ''}`}
                    >
                      {isExpense ? (tx.amount < 0 ? '+' : '-') : isIncome ? '+' : ''}
                      {getCurrencySymbol(tx.currency || currentCurrency)}
                      {Math.abs(tx.amount).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
});

VaultAccountList.displayName = 'VaultAccountList';
