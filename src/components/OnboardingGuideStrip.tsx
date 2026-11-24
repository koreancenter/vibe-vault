import React from 'react';
import { Check, X, ArrowRight, Compass } from 'lucide-react';
import {
  ContextNudge, ContextNudgeId, OnboardingProgress,
  getQuickTryInsightQuery, getQuickTryPrompts,
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
  onOpenWelcome: () => void;
  onDismissChecklist: () => void;
  onDismissNudge: (id: ContextNudgeId) => void;
}

const ACTION_BTN = 'h-8 px-3 rounded-lg border border-white/[0.16] bg-white/[0.07] hover:bg-white/[0.14] text-[11px] font-medium text-white transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95';

export const OnboardingGuideStrip: React.FC<OnboardingGuideStripProps> = ({
  progress, activeNudge, transactionCount, accountCount, isGuestMode,
  onTryTransaction, onAddAccount, onLoadSampleData, onTryInsightQuery,
  onCreateLocalAccount, onOpenWelcome, onDismissChecklist, onDismissNudge,
}) => {
  const { language } = useI18n();
  const isKo = language === 'ko';
  const tryPrompts = getQuickTryPrompts(language);
  const tryInsightQuery = getQuickTryInsightQuery(language);

  if (progress.shouldShowChecklist) {
    const hint = progress.isTransactionFirstState
      ? (isKo ? `거래 ${transactionCount}건 기록됨 · 02번에서 계좌를 등록하면 순자산이 집계됩니다.` : `${transactionCount} logged · Add an account in 02 to calculate net worth.`)
      : accountCount > 0 && transactionCount === 0
        ? (isKo ? '계좌가 준비되었습니다. 하단 입력창이나 아래 예시로 첫 거래를 기록해 보세요.' : 'Account ready. Log your first transaction via the omnibar or an example.')
        : isGuestMode
          ? (isKo ? '게스트 모드 체험 중 · 아래 3단계로 핵심 흐름을 바로 확인하세요.' : 'Guest Mode · Try the 3 steps below to explore the workflow.')
          : (isKo ? '거래(현금흐름)와 계좌(순자산)는 분리 집계됩니다. 아래 순서로 시작하세요.' : 'Cashflow and net worth are tracked separately. Start with these 3 steps.');

    const stepCopy = {
      first_transaction: isKo ? '첫 지출·수입 한 줄 기록하기' : 'Log your first expense or income',
      first_account: isKo ? '첫 자산 계좌 등록하기' : 'Add your first asset account',
      first_query: isKo ? 'AI 인사이트로 자연어 질문하기' : 'Ask AI Insights in plain language',
    } as const;

    return (
      <section
        id="onboarding-quickstart-card"
        aria-label={isKo ? '시작 체크리스트' : 'Quick Start Checklist'}
        className="mb-4 rounded-2xl border border-[var(--surface-guide-border)] [background-image:var(--surface-guide-bg)] backdrop-blur-xl text-white shadow-lg overflow-hidden"
      >
        <div aria-hidden="true" className="h-[2px] w-full opacity-85 bg-[var(--surface-guide-accent)]" />

        <div className="px-4 py-3 border-b border-white/[0.1] bg-[var(--surface-guide-header)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs">
              <Compass size={14} className="shrink-0 text-[var(--surface-guide-accent)]" />
              <h2 className="font-semibold text-white tracking-tight">{isKo ? '시작 체크리스트' : 'Quick Start'}</h2>
              <span className="font-mono text-[11px] text-neutral-300 tabular-nums">
                {progress.completedCount}/{progress.totalCount}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-200 leading-relaxed">{hint}</p>
          </div>

          <div className="flex items-center gap-1 shrink-0 -mr-1">
            <button type="button" onClick={onOpenWelcome} className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-200 hover:text-white hover:bg-white/[0.1] transition-colors cursor-pointer whitespace-nowrap">
              {isKo ? '안내' : 'About'}
            </button>
            <button type="button" onClick={onDismissChecklist} aria-label={isKo ? '체크리스트 닫기' : 'Dismiss checklist'} className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/[0.1] transition-colors cursor-pointer">
              <X size={14} />
            </button>
          </div>
        </div>

        <ol className="divide-y divide-white/[0.08]">
          {progress.steps.map((step) => (
            <li key={step.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-6 h-5 rounded-md flex items-center justify-center text-[11px] font-mono font-semibold tabular-nums shrink-0 border ${
                  step.completed ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300' : 'bg-white/[0.08] border-white/[0.14] text-[var(--surface-guide-accent)]'
                }`}>
                  {step.completed ? <Check size={12} aria-label={isKo ? '완료' : 'Done'} /> : step.indexLabel}
                </span>
                <p className={`text-xs font-medium ${step.completed ? 'text-neutral-400 line-through' : 'text-white'}`}>
                  {stepCopy[step.id]}
                </p>
              </div>

              {step.completed ? (
                <span className="text-[11px] text-emerald-300 font-medium shrink-0">{isKo ? '완료' : 'Done'}</span>
              ) : step.id === 'first_transaction' ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {tryPrompts.slice(0, 2).map((item) => (
                    <button key={item.label} type="button" onClick={() => onTryTransaction(item.text)} className={ACTION_BTN}>
                      <span>{item.label}</span>
                      <ArrowRight size={11} className="opacity-70" />
                    </button>
                  ))}
                </div>
              ) : step.id === 'first_account' ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  {transactionCount === 0 && (
                    <button type="button" onClick={onLoadSampleData} className={ACTION_BTN}>
                      {isKo ? '샘플 체험' : 'Sample'}
                    </button>
                  )}
                  <button type="button" onClick={onAddAccount} className="h-8 px-3 rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--color-accent-hover)] text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap active:scale-95">
                    {isKo ? '계좌 등록' : 'Add Account'}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => onTryInsightQuery(tryInsightQuery)} className={ACTION_BTN}>
                  {isKo ? '질문 해보기' : 'Try Query'}
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (!activeNudge) return null;

  const handleNudgeAction = () => {
    if (activeNudge.actionType === 'add_account') onAddAccount();
    else if (activeNudge.actionType === 'try_transaction') onTryTransaction(tryPrompts[0].text);
    else if (activeNudge.actionType === 'create_local_account') onCreateLocalAccount();
  };

  return (
    <aside
      id={`context-nudge-${activeNudge.id}`}
      aria-label={isKo ? '상황별 안내' : 'Contextual tip'}
      className="mb-4 rounded-2xl border border-[var(--surface-guide-border)] [background-image:var(--surface-guide-bg)] backdrop-blur-xl px-4 py-3 text-white shadow-md flex items-center justify-between gap-3"
    >
      <p className="text-xs text-neutral-100 leading-relaxed min-w-0">{activeNudge.message}</p>
      <div className="flex items-center gap-1.5 shrink-0">
        <button type="button" onClick={handleNudgeAction} className={ACTION_BTN}>{activeNudge.actionLabel}</button>
        <button type="button" onClick={() => onDismissNudge(activeNudge.id)} aria-label={isKo ? '안내 닫기' : 'Dismiss tip'} className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/[0.1] transition-colors cursor-pointer">
          <X size={14} />
        </button>
      </div>
    </aside>
  );
};
