import { describe, it, expect } from 'vitest';
import {
  getOnboardingProgress,
  getActiveContextNudge,
  type OnboardingSnapshot,
} from '../src/onboardingGuide';

function makeSnapshot(overrides: Partial<OnboardingSnapshot> = {}): OnboardingSnapshot {
  return {
    accountCount: 0,
    transactionCount: 0,
    hasRunQuery: false,
    isGuestMode: false,
    activeTab: 'vault',
    checklistDismissed: false,
    dismissedNudges: [],
    ...overrides,
  };
}

describe('onboardingGuide state logic', () => {
  it('shows 0/3 checklist on fresh empty workspace and suppresses duplicate nudges', () => {
    const snapshot = makeSnapshot();
    const progress = getOnboardingProgress(snapshot);

    expect(progress.completedCount).toBe(0);
    expect(progress.totalCount).toBe(3);
    expect(progress.allCompleted).toBe(false);
    expect(progress.shouldShowChecklist).toBe(true);
    expect(progress.isTransactionFirstState).toBe(false);
    expect(getActiveContextNudge(snapshot, progress)).toBeNull();
  });

  it('detects transaction-first state when user logs transactions before adding an account', () => {
    const snapshot = makeSnapshot({ transactionCount: 2, accountCount: 0 });
    const progress = getOnboardingProgress(snapshot);

    expect(progress.completedCount).toBe(1);
    expect(progress.isTransactionFirstState).toBe(true);
    expect(progress.shouldShowChecklist).toBe(true);
  });

  it('auto-hides checklist once all 3 steps are completed', () => {
    const snapshot = makeSnapshot({
      transactionCount: 1,
      accountCount: 1,
      hasRunQuery: true,
    });
    const progress = getOnboardingProgress(snapshot);

    expect(progress.completedCount).toBe(3);
    expect(progress.allCompleted).toBe(true);
    expect(progress.shouldShowChecklist).toBe(false);
  });

  it('shows tx_without_account nudge on vault/insights after checklist is dismissed', () => {
    const snapshot = makeSnapshot({
      transactionCount: 2,
      accountCount: 0,
      activeTab: 'vault',
      checklistDismissed: true,
    });
    const progress = getOnboardingProgress(snapshot);
    const nudge = getActiveContextNudge(snapshot, progress);

    expect(nudge?.id).toBe('tx_without_account');
    expect(nudge?.actionType).toBe('add_account');
  });

  it('shows account_without_tx nudge when accounts exist without transactions', () => {
    const snapshot = makeSnapshot({
      transactionCount: 0,
      accountCount: 2,
      activeTab: 'vault',
      checklistDismissed: true,
    });
    const progress = getOnboardingProgress(snapshot);
    const nudge = getActiveContextNudge(snapshot, progress);

    expect(nudge?.id).toBe('account_without_tx');
    expect(nudge?.actionType).toBe('try_transaction');
  });

  it('shows guest_with_data nudge in guest mode once user has entered data and dismissed earlier nudges', () => {
    const snapshot = makeSnapshot({
      transactionCount: 1,
      accountCount: 1,
      hasRunQuery: true,
      isGuestMode: true,
      activeTab: 'vault',
    });
    const progress = getOnboardingProgress(snapshot);
    const nudge = getActiveContextNudge(snapshot, progress);

    expect(nudge?.id).toBe('guest_with_data');
    expect(nudge?.actionType).toBe('create_local_account');
  });

  it('respects dismissed nudges and returns null when all relevant nudges are dismissed', () => {
    const snapshot = makeSnapshot({
      transactionCount: 2,
      accountCount: 0,
      isGuestMode: true,
      activeTab: 'vault',
      checklistDismissed: true,
      dismissedNudges: ['tx_without_account', 'guest_with_data'],
    });
    const progress = getOnboardingProgress(snapshot);

    expect(getActiveContextNudge(snapshot, progress)).toBeNull();
  });
});
