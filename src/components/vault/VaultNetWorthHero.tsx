import React from 'react';
import { SupportedCurrency } from '../../types';
import { formatCurrency } from '../../utils';
import { useI18n } from '../../i18n';

export interface DualCurrencyMetrics {
  secondaryFormatted: string;
  rateText: string;
}

export interface VaultNetWorthHeroProps {
  currentCurrency: SupportedCurrency;
  isLight: boolean;
  stealthMode: boolean;
  hasRegisteredAccounts: boolean;
  accountsCount: number;
  transactionsCount: number;
  formattedNetWorth: string;
  totalAssets: number;
  ledgerNetCashflow: number;
  totalCardLiabilities: number;
  formattedTotalUnpaid: string;
  isMultiCurrencyMode: boolean;
  dualCurrency: DualCurrencyMetrics | null;
  onToggleStealth?: () => void;
  onOpenScan: () => void;
  onOpenTransfer: () => void;
  onOpenAddAccount: () => void;
  onLoadSample: () => void;
}

export const VaultNetWorthHero: React.FC<VaultNetWorthHeroProps> = React.memo(({
  currentCurrency,
  isLight,
  stealthMode,
  hasRegisteredAccounts,
  accountsCount,
  transactionsCount,
  formattedNetWorth,
  totalAssets,
  ledgerNetCashflow,
  totalCardLiabilities,
  formattedTotalUnpaid,
  isMultiCurrencyMode,
  dualCurrency,
  onToggleStealth,
  onOpenScan,
  onOpenTransfer,
  onOpenAddAccount,
  onLoadSample,
}) => {
  const { t, language } = useI18n();
  const isKo = language === 'ko';

  return (
    <>
      {/* 1. Hero Net Worth Card (총 순자산) */}
      <div
        className={`relative overflow-hidden rounded-2xl p-5 border backdrop-blur-xl transition-all ${
          isLight
            ? 'bg-white/85 border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900'
            : 'bg-[var(--surface-card)]/90 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white'
        }`}
      >
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <div
              onClick={onToggleStealth}
              className="cursor-pointer group select-none transition-all min-w-0"
              title="Toggle stealth"
            >
              <div className="flex items-center gap-1.5 text-xs text-neutral-300 font-normal">
                <span>{t('net_worth')}</span>
                <span className="text-[10px] opacity-0 group-hover:opacity-80 transition-opacity">
                  {stealthMode ? '· masked' : ''}
                </span>
              </div>

              {hasRegisteredAccounts ? (
                <>
                  <div
                    className={`mt-1 text-fluid-hero font-medium tracking-tight tabular-nums transition-all ${
                      stealthMode ? 'blur-md select-none opacity-60' : 'text-white'
                    }`}
                  >
                    {formattedNetWorth}
                  </div>
                  <div
                    className={`mt-1 text-xs font-normal text-neutral-300 tabular-nums ${
                      stealthMode ? 'blur-xs select-none' : ''
                    }`}
                  >
                    {t('total_assets')} {formatCurrency(Math.round(totalAssets), currentCurrency)}
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-1.5 text-2xl sm:text-3xl font-medium tracking-tight text-neutral-300">
                    {isKo ? '계좌 미등록' : 'No accounts yet'}
                  </div>
                  <div
                    className={`mt-1.5 text-xs font-normal text-neutral-300 tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5 ${
                      stealthMode ? 'blur-xs select-none' : ''
                    }`}
                  >
                    {transactionsCount > 0 ? (
                      <>
                        <span>
                          {isKo ? '가계부 순현금흐름' : 'Ledger net cashflow'}{' '}
                          <span
                            className={
                              ledgerNetCashflow >= 0
                                ? 'text-sky-400 font-medium'
                                : 'text-amber-400 font-medium'
                            }
                          >
                            {ledgerNetCashflow > 0 ? '+' : ''}
                            {formatCurrency(ledgerNetCashflow, currentCurrency)}
                          </span>
                        </span>
                        {totalCardLiabilities > 0 && (
                          <>
                            <span className="opacity-40">·</span>
                            <span>
                              {isKo ? '미결제 카드' : 'Unpaid card'} {formattedTotalUnpaid}
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <span>
                        {isKo
                          ? '자산 계좌를 등록하면 순자산이 집계됩니다.'
                          : 'Add an account to calculate your net worth.'}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
            <span className="text-xs font-normal text-neutral-300 tabular-nums pt-0.5 shrink-0">
              {t('accounts_count', { count: accountsCount })}
            </span>
          </div>

          {hasRegisteredAccounts && isMultiCurrencyMode && dualCurrency && (
            <div className={`mt-1 ${stealthMode ? 'blur-xs select-none opacity-60' : ''}`}>
              <span className="text-xs font-normal text-neutral-300 tracking-wide whitespace-nowrap tabular-nums">
                ≈ {dualCurrency.secondaryFormatted} · FX {dualCurrency.rateText}
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
          onClick={onOpenScan}
          className="h-10 bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs py-2 px-1 rounded-xl text-white font-medium transition-all active:scale-95 flex items-center justify-center text-center whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
        >
          <span className="whitespace-nowrap">{t('screen_scan')}</span>
        </button>

        <button
          id="vault-transfer-btn"
          type="button"
          onClick={onOpenTransfer}
          className="h-10 bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs py-2 px-1 rounded-xl text-white font-medium transition-all active:scale-95 flex items-center justify-center text-center whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
        >
          <span className="whitespace-nowrap">{t('account_transfer')}</span>
        </button>

        <button
          id="vault-add-account-btn"
          type="button"
          onClick={onOpenAddAccount}
          className="h-10 bg-white text-black hover:bg-neutral-200 border border-white/20 text-xs py-2 px-1 rounded-xl font-semibold transition-all active:scale-95 flex items-center justify-center text-center whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
        >
          <span className="whitespace-nowrap">{t('add_asset')}</span>
        </button>
      </div>

      {/* Empty-Accounts Quick-Start Card */}
      {!hasRegisteredAccounts && (
        <div
          className={`p-6 sm:p-7 rounded-2xl border text-center space-y-4 transition-all ${
            isLight
              ? 'bg-white/80 backdrop-blur-2xl border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900'
              : 'bg-white/[0.04] border border-white/15 rounded-2xl text-white shadow-xl backdrop-blur-xl'
          }`}
        >
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-white font-semibold text-base sm:text-lg">
              {isKo
                ? '첫 자산 계좌를 등록하거나 샘플 데이터로 체험해보세요'
                : 'Add your first account or explore with sample data'}
            </h2>
            <p className="text-neutral-300 text-xs leading-relaxed">
              {isKo
                ? '은행·증권 앱 캡처 화면을 스캔하거나, 샘플 데이터를 불러와 모든 기능을 즉시 확인할 수 있습니다.'
                : 'Scan a banking or brokerage screenshot, or load sample data to explore every feature right away.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2 max-w-md mx-auto">
            <button
              type="button"
              id="vault-quick-sample-btn"
              onClick={onLoadSample}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-all active:scale-95 cursor-pointer shadow-sm flex items-center justify-center whitespace-nowrap"
            >
              <span>{isKo ? '샘플 데이터로 체험하기' : 'Try Sample Data'}</span>
            </button>

            <button
              type="button"
              id="vault-quick-add-btn"
              onClick={onOpenAddAccount}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-white border border-white/15 text-xs font-medium transition-all active:scale-95 cursor-pointer flex items-center justify-center whitespace-nowrap"
            >
              <span>{isKo ? '+ 계좌 직접 등록' : '+ Add Account'}</span>
            </button>

            <button
              type="button"
              id="vault-quick-scan-btn"
              onClick={onOpenScan}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-white border border-white/15 text-xs font-medium transition-all active:scale-95 cursor-pointer flex items-center justify-center whitespace-nowrap"
            >
              <span>{isKo ? '앱 화면 캡처 스캔' : 'Scan Screenshot'}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
});

VaultNetWorthHero.displayName = 'VaultNetWorthHero';
