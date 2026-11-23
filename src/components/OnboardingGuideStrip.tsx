import React from 'react';
import { Check, X, ArrowRight, Compass } from 'lucide-react';
import {
  ContextNudge,
  ContextNudgeId,
  OnboardingProgress,
  getQuickTryInsightQuery,
  getQuickTryPrompts,
} from '../onboardingGuide';
import { useI18n } from '../i18n';

interface OnboardingGuideStripProps {
  progress: OnboardingProgress;
  activeNudge: ContextNudge | null;
  transactionCount: number;
  accountCount: number;
  isGuestMode: boolean;
  onTryTransaction: (promptText: string) => void;
  onAddAccount: () => void;
  onLoadSampleData: () => void;
  onTryInsightQuery: (queryText: string) => void;
  onCreateLocalAccount: () => void;
  onOpenQuickGuide: () => void;
  onDismissChecklist: () => void;
  onDismissNudge: (id: ContextNudgeId) => void;
}

export const OnboardingGuideStrip: React.FC<OnboardingGuideStripProps> = ({
  progress,
  activeNudge,
  transactionCount,
  accountCount,
  isGuestMode,
  onTryTransaction,
  onAddAccount,
  onLoadSampleData,
  onTryInsightQuery,
  onCreateLocalAccount,
  onOpenQuickGuide,
  onDismissChecklist,
  onDismissNudge,
}) => {
  const { language } = useI18n();
  const isKo = language === 'ko';
  const tryPrompts = getQuickTryPrompts(language);
  const tryInsightQuery = getQuickTryInsightQuery(language);

  // 1. Progressive 3-Step Quick-Start Checklist Card (auto-hides once complete or dismissed)
  if (progress.shouldShowChecklist) {
    const contextHint = progress.isTransactionFirstState
      ? isKo
        ? `거래 ${transactionCount}건이 가계부(현금흐름)에 기록되었습니다. 아래 02번에서 계좌를 등록하면 순자산이 함께 집계됩니다.`
        : `${transactionCount} transaction(s) logged in your ledger cashflow. Add an account in step 02 to calculate net worth.`
      : accountCount > 0 && transactionCount === 0
      ? isKo
        ? '자산 계좌가 준비되었습니다. 하단 입력창이나 아래 예시로 첫 거래를 기록해 보세요.'
        : 'Your account is ready. Log your first transaction using the omnibar or an example below.'
      : isGuestMode
      ? isKo
        ? '게스트 모드로 자유롭게 체험해 보세요. 아래 3단계를 눌러 핵심 흐름을 바로 확인할 수 있습니다.'
        : 'Explore freely in Guest Mode. Try the 3 steps below to see the full workflow.'
      : isKo
      ? '거래(현금흐름)와 계좌(순자산)는 분리 집계됩니다. 아래 순서대로 첫 기록을 시작해 보세요.'
      : 'Transactions (cashflow) and accounts (net worth) are tracked separately. Start with these 3 steps.';

    return (
      <section
        id="onboarding-quickstart-card"
        aria-label={isKo ? '시작 가이드' : 'Quick Start Guide'}
        className="mb-4 rounded-2xl border border-[var(--surface-guide-border)] [background-image:var(--surface-guide-bg)] backdrop-blur-xl text-white shadow-[0_14px_34px_-14px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.14)] overflow-hidden"
      >
        {/* Top Accent Strip for clear visual separation from main canvas */}
        <div
          aria-hidden="true"
          className="h-[2px] w-full opacity-85 bg-[var(--surface-guide-accent)]"
        />

        {/* Header */}
        <div className="px-4 sm:px-5 pt-3.5 pb-3 border-b border-white/[0.1] bg-[var(--surface-guide-header)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs">
              <Compass size={14} className="shrink-0 text-[var(--surface-guide-accent)]" />
              <h2 className="font-semibold text-white tracking-tight">
                {isKo ? '시작 가이드' : 'Quick Start'}
              </h2>
              <span className="px-1.5 py-0.5 rounded-md bg-white/[0.1] border border-white/[0.12] text-[11px] text-neutral-100 font-mono tabular-nums leading-none">
                {progress.completedCount}/{progress.totalCount} {isKo ? '완료' : 'done'}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-neutral-200 leading-relaxed">
              {contextHint}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0 -mr-1">
            <button
              type="button"
              onClick={onOpenQuickGuide}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-200 hover:text-white hover:bg-white/[0.1] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              {isKo ? '사용법' : 'Guide'}
            </button>
            <button
              type="button"
              onClick={onDismissChecklist}
              aria-label={isKo ? '시작 가이드 닫기' : 'Dismiss Quick Start'}
              title={isKo ? '시작 가이드 닫기' : 'Dismiss Quick Start'}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/[0.1] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* 3 Hairline-Separated Steps */}
        <ol className="divide-y divide-white/[0.09]">
          {progress.steps.map((step) => {
            if (step.id === 'first_transaction') {
              return (
                <li key={step.id} className="px-4 sm:px-5 py-3.5 flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className={`mt-0.5 w-6 h-5 rounded-md flex items-center justify-center text-[11px] font-mono font-semibold tabular-nums shrink-0 border ${
                          step.completed
                            ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                            : 'bg-white/[0.08] border-white/[0.14] text-[var(--surface-guide-accent)]'
                        }`}
                      >
                        {step.completed ? <Check size={12} aria-label={isKo ? '완료' : 'Done'} /> : step.indexLabel}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold leading-snug ${step.completed ? 'text-neutral-400 line-through' : 'text-white'}`}>
                          {isKo ? '첫 지출·수입 한 줄 기록하기' : 'Log your first expense or income'}
                        </p>
                        {!step.completed && (
                          <p className="text-[11px] text-neutral-300 mt-0.5 leading-relaxed">
                            {isKo
                              ? '하단 입력창에 자연어로 적거나 아래 예시를 눌러 바로 테스트해 보세요.'
                              : 'Type naturally in the omnibar below or tap an example to try it instantly.'}
                          </p>
                        )}
                      </div>
                    </div>
                    {step.completed && (
                      <span className="text-[11px] text-emerald-300 font-medium shrink-0">
                        {isKo ? '완료' : 'Done'}
                      </span>
                    )}
                  </div>

                  {!step.completed && (
                    <div className="pl-8 flex flex-wrap items-center gap-2">
                      {tryPrompts.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => onTryTransaction(item.text)}
                          className="h-8 px-3 rounded-lg border border-white/[0.18] bg-white/[0.08] hover:bg-white/[0.15] text-[11px] font-medium text-white transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                        >
                          <span>{item.label}</span>
                          <ArrowRight size={11} className="opacity-75" />
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            }

            if (step.id === 'first_account') {
              return (
                <li key={step.id} className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span
                      className={`mt-0.5 w-6 h-5 rounded-md flex items-center justify-center text-[11px] font-mono font-semibold tabular-nums shrink-0 border ${
                        step.completed
                          ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                          : 'bg-white/[0.08] border-white/[0.14] text-[var(--surface-guide-accent)]'
                      }`}
                    >
                      {step.completed ? <Check size={12} aria-label={isKo ? '완료' : 'Done'} /> : step.indexLabel}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold leading-snug ${step.completed ? 'text-neutral-400 line-through' : 'text-white'}`}>
                        {isKo ? '첫 자산 계좌 등록하기' : 'Add your first asset account'}
                      </p>
                      {!step.completed && (
                        <p className="text-[11px] text-neutral-300 mt-0.5 leading-relaxed">
                          {isKo
                            ? '통장·증권 잔액을 등록해야 총 순자산과 비상 유동성이 계산됩니다.'
                            : 'Add a bank or brokerage balance to calculate net worth and runway.'}
                        </p>
                      )}
                    </div>
                  </div>

                  {step.completed ? (
                    <span className="text-[11px] text-emerald-300 font-medium shrink-0">
                      {isKo ? '완료' : 'Done'}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {transactionCount === 0 && (
                        <button
                          type="button"
                          onClick={onLoadSampleData}
                          className="h-8 px-2.5 rounded-lg border border-white/[0.16] bg-white/[0.06] hover:bg-white/[0.13] text-[11px] font-medium text-neutral-100 hover:text-white transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                        >
                          {isKo ? '샘플 체험' : 'Sample'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onAddAccount}
                        className="h-8 px-3 rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--color-accent-hover)] text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap active:scale-95 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                      >
                        {isKo ? '계좌 등록' : 'Add Account'}
                      </button>
                    </div>
                  )}
                </li>
              );
            }

            return (
              <li key={step.id} className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className={`mt-0.5 w-6 h-5 rounded-md flex items-center justify-center text-[11px] font-mono font-semibold tabular-nums shrink-0 border ${
                      step.completed
                        ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                        : 'bg-white/[0.08] border-white/[0.14] text-[var(--surface-guide-accent)]'
                    }`}
                  >
                    {step.completed ? <Check size={12} aria-label={isKo ? '완료' : 'Done'} /> : step.indexLabel}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold leading-snug ${step.completed ? 'text-neutral-400 line-through' : 'text-white'}`}>
                      {isKo ? 'AI 인사이트로 자연어 질문하기' : 'Ask AI Insights in plain language'}
                    </p>
                    {!step.completed && (
                      <p className="text-[11px] text-neutral-300 mt-0.5 leading-relaxed">
                        {isKo
                          ? '인사이트 탭에서 지출 비중이나 월별 흐름을 질문할 수 있습니다.'
                          : 'Query spending ratios and monthly cashflow trends from the Insights tab.'}
                      </p>
                    )}
                  </div>
                </div>

                {step.completed ? (
                  <span className="text-[11px] text-emerald-300 font-medium shrink-0">
                    {isKo ? '완료' : 'Done'}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onTryInsightQuery(tryInsightQuery)}
                    className="h-8 px-3 rounded-lg border border-white/[0.18] bg-white/[0.08] hover:bg-white/[0.15] text-[11px] font-medium text-white transition-colors cursor-pointer whitespace-nowrap shrink-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  >
                    {isKo ? '질문 해보기' : 'Try Query'}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  // 2. Context-Aware 1-Line Nudge Strip (only when checklist is dismissed/completed)
  if (!activeNudge) {
    return null;
  }

  const handleNudgeAction = () => {
    if (activeNudge.actionType === 'add_account') {
      onAddAccount();
    } else if (activeNudge.actionType === 'try_transaction') {
      onTryTransaction(tryPrompts[0].text);
    } else if (activeNudge.actionType === 'create_local_account') {
      onCreateLocalAccount();
    }
  };

  return (
    <aside
      id={`context-nudge-${activeNudge.id}`}
      aria-label={isKo ? '상황별 안내' : 'Contextual tip'}
      className="mb-4 rounded-2xl border border-[var(--surface-guide-border)] [background-image:var(--surface-guide-bg)] backdrop-blur-xl px-4 py-3 text-white shadow-[0_10px_28px_-14px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.12)] flex items-center justify-between gap-3"
    >
      <p className="text-xs text-neutral-100 leading-relaxed min-w-0">
        {activeNudge.message}
      </p>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleNudgeAction}
          className="h-8 px-3 rounded-lg border border-white/[0.18] bg-white/[0.1] hover:bg-white/[0.18] text-[11px] font-medium text-white transition-colors cursor-pointer whitespace-nowrap active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          {activeNudge.actionLabel}
        </button>
        <button
          type="button"
          onClick={() => onDismissNudge(activeNudge.id)}
          aria-label={isKo ? '안내 닫기' : 'Dismiss tip'}
          title={isKo ? '안내 닫기' : 'Dismiss tip'}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/[0.1] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          <X size={14} />
        </button>
      </div>
    </aside>
  );
};
