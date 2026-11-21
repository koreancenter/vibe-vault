import type { LaunchScreenMode } from './types';

export type ChecklistStepId = 'first_transaction' | 'first_account' | 'first_insight_query';

export type ContextNudgeId = 'tx_without_account' | 'account_without_tx' | 'guest_with_data';

export interface OnboardingSnapshot {
  accountCount: number;
  transactionCount: number;
  hasRunQuery: boolean;
  isGuestMode: boolean;
  activeTab: LaunchScreenMode;
  checklistDismissed: boolean;
  dismissedNudges: readonly string[];
  language?: string;
}

export interface OnboardingChecklistStep {
  id: ChecklistStepId;
  indexLabel: string;
  completed: boolean;
}

export interface OnboardingProgress {
  steps: OnboardingChecklistStep[];
  completedCount: number;
  totalCount: number;
  allCompleted: boolean;
  shouldShowChecklist: boolean;
  /** True when the user logged transactions before adding any asset account */
  isTransactionFirstState: boolean;
}

export interface ContextNudge {
  id: ContextNudgeId;
  message: string;
  actionLabel: string;
  actionType: 'add_account' | 'try_transaction' | 'create_local_account';
}

export const ONBOARDING_STORAGE_KEYS = {
  checklistDismissed: 'vibe_guide_checklist_dismissed',
  dismissedNudges: 'vibe_guide_dismissed_nudges',
  hasRunQuery: 'vibe_guide_has_queried',
} as const;

export const QUICK_TRY_TRANSACTION_PROMPTS = [
  { label: '점심 12,000원', text: '점심 식사 12000원 카드 결제' },
  { label: '용돈 25만원 입금', text: '용돈 25만원 통장 입금' },
] as const;

export const QUICK_TRY_TRANSACTION_PROMPTS_EN = [
  { label: 'Lunch $15', text: 'Lunch $15 card' },
  { label: 'Income $250', text: 'Allowance $250 bank deposit' },
] as const;

export const QUICK_TRY_INSIGHT_QUERY = '이번 달 식비 얼마야?';
export const QUICK_TRY_INSIGHT_QUERY_EN = 'How much did I spend on food this month?';

export function getQuickTryPrompts(language: string = 'ko') {
  return language === 'ko' ? QUICK_TRY_TRANSACTION_PROMPTS : QUICK_TRY_TRANSACTION_PROMPTS_EN;
}

export function getQuickTryInsightQuery(language: string = 'ko'): string {
  return language === 'ko' ? QUICK_TRY_INSIGHT_QUERY : QUICK_TRY_INSIGHT_QUERY_EN;
}

export function loadOnboardingGuideFlags(): {
  checklistDismissed: boolean;
  dismissedNudges: string[];
  hasRunQuery: boolean;
} {
  if (typeof localStorage === 'undefined') {
    return { checklistDismissed: false, dismissedNudges: [], hasRunQuery: false };
  }
  try {
    const checklistDismissed = localStorage.getItem(ONBOARDING_STORAGE_KEYS.checklistDismissed) === 'true';
    const hasRunQuery = localStorage.getItem(ONBOARDING_STORAGE_KEYS.hasRunQuery) === 'true';
    const rawNudges = localStorage.getItem(ONBOARDING_STORAGE_KEYS.dismissedNudges);
    const parsedNudges = rawNudges ? JSON.parse(rawNudges) : [];
    const dismissedNudges = Array.isArray(parsedNudges)
      ? parsedNudges.filter((item): item is string => typeof item === 'string')
      : [];
    return { checklistDismissed, dismissedNudges, hasRunQuery };
  } catch {
    return { checklistDismissed: false, dismissedNudges: [], hasRunQuery: false };
  }
}

export function saveChecklistDismissed(dismissed: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (dismissed) {
      localStorage.setItem(ONBOARDING_STORAGE_KEYS.checklistDismissed, 'true');
    } else {
      localStorage.removeItem(ONBOARDING_STORAGE_KEYS.checklistDismissed);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function saveHasRunQuery(hasRun: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (hasRun) {
      localStorage.setItem(ONBOARDING_STORAGE_KEYS.hasRunQuery, 'true');
    } else {
      localStorage.removeItem(ONBOARDING_STORAGE_KEYS.hasRunQuery);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function saveDismissedNudges(nudges: readonly string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEYS.dismissedNudges, JSON.stringify(Array.from(new Set(nudges))));
  } catch {
    // Ignore storage quota errors
  }
}

export function getOnboardingProgress(snapshot: OnboardingSnapshot): OnboardingProgress {
  const steps: OnboardingChecklistStep[] = [
    {
      id: 'first_transaction',
      indexLabel: '01',
      completed: snapshot.transactionCount > 0,
    },
    {
      id: 'first_account',
      indexLabel: '02',
      completed: snapshot.accountCount > 0,
    },
    {
      id: 'first_insight_query',
      indexLabel: '03',
      completed: snapshot.hasRunQuery,
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const totalCount = steps.length;
  const allCompleted = completedCount === totalCount;
  const shouldShowChecklist = !snapshot.checklistDismissed && !allCompleted;
  const isTransactionFirstState = snapshot.transactionCount > 0 && snapshot.accountCount === 0;

  return {
    steps,
    completedCount,
    totalCount,
    allCompleted,
    shouldShowChecklist,
    isTransactionFirstState,
  };
}

/**
 * Selects at most ONE context-aware nudge based on the user's real data state.
 * Never duplicates an already-visible checklist card (Single Focal Anchor).
 */
export function getActiveContextNudge(
  snapshot: OnboardingSnapshot,
  progress: OnboardingProgress
): ContextNudge | null {
  if (progress.shouldShowChecklist) {
    return null;
  }

  const isKo = (snapshot.language || 'ko') === 'ko';
  const isDismissed = (id: ContextNudgeId) => snapshot.dismissedNudges.includes(id);

  // 1. User entered transactions before registering any asset account
  if (
    snapshot.transactionCount > 0 &&
    snapshot.accountCount === 0 &&
    (snapshot.activeTab === 'vault' || snapshot.activeTab === 'insights') &&
    !isDismissed('tx_without_account')
  ) {
    return {
      id: 'tx_without_account',
      message: isKo
        ? `거래 ${snapshot.transactionCount}건이 가계부(현금흐름)에 기록되었습니다. 순자산까지 함께 보려면 보유 계좌를 등록해 주세요.`
        : `${snapshot.transactionCount} transaction(s) logged in your ledger cashflow. Add an asset account to calculate net worth.`,
      actionLabel: isKo ? '계좌 등록' : 'Add Account',
      actionType: 'add_account',
    };
  }

  // 2. User registered asset accounts but hasn't logged any transactions yet
  if (
    snapshot.accountCount > 0 &&
    snapshot.transactionCount === 0 &&
    (snapshot.activeTab === 'vault' || snapshot.activeTab === 'ledger') &&
    !isDismissed('account_without_tx')
  ) {
    return {
      id: 'account_without_tx',
      message: isKo
        ? '자산 계좌가 준비되었습니다. 하단 입력창에 오늘 지출이나 수입을 한 줄로 적어 가계부를 시작해 보세요.'
        : 'Your account is ready. Type an expense or income in the omnibar below to start tracking cashflow.',
      actionLabel: isKo ? '예시 입력' : 'Try Example',
      actionType: 'try_transaction',
    };
  }

  // 3. Guest mode user who has already started adding data
  if (
    snapshot.isGuestMode &&
    (snapshot.accountCount > 0 || snapshot.transactionCount > 0) &&
    !isDismissed('guest_with_data')
  ) {
    return {
      id: 'guest_with_data',
      message: isKo
        ? '게스트 체험 중입니다. 브라우저 종료 시 초기화되므로 계속 기록하려면 로컬 계정을 만들어 보관하세요.'
        : 'You are in Guest Mode — data clears on sign-out. Create a local account to keep encrypted records.',
      actionLabel: isKo ? '로컬 계정 만들기' : 'Create Account',
      actionType: 'create_local_account',
    };
  }

  return null;
}
