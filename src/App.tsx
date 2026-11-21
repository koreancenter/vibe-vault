import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { I18nProvider } from './i18n';
import { WelcomeDashboardModal } from './components/WelcomeDashboardModal';
import { lazyWithRetry, LazyErrorBoundary } from './lazyWithRetry';
import { hasVaultPin, isVaultLocked, subscribeVaultLock } from './vaultSecurity';
import { applySeasonTheme, getStoredSeasonTheme } from './seasonTheme';

const VaultWorkspace = lazyWithRetry(() =>
  import('./VaultWorkspace').then((m) => ({ default: m.VaultWorkspace }))
);

function shouldShowWelcomeInitially(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const needsPinSetup =
    !hasVaultPin() &&
    (typeof sessionStorage === 'undefined' || !sessionStorage.getItem('vibe_vault_setup_skipped'));
  const needsPinUnlock = hasVaultPin() && isVaultLocked();
  const hasSeenWelcome = Boolean(localStorage.getItem('vibe_welcome_seen'));
  return needsPinSetup || needsPinUnlock || !hasSeenWelcome;
}

function AppShell() {
  const [isVaultLockedState, setIsVaultLockedState] = useState<boolean>(() => isVaultLocked());
  const [isWelcomeOpen, setIsWelcomeOpen] = useState<boolean>(() => shouldShowWelcomeInitially());
  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState<boolean>(() => !shouldShowWelcomeInitially());

  useEffect(() => {
    applySeasonTheme(getStoredSeasonTheme());
  }, []);

  useEffect(() => {
    return subscribeVaultLock((locked) => {
      setIsVaultLockedState(locked);
      if (locked) {
        setIsWelcomeOpen(true);
        setHasEnteredWorkspace(false);
      }
    });
  }, []);

  const handleEnterVault = useCallback(() => {
    setIsVaultLockedState(isVaultLocked());
    setHasEnteredWorkspace(true);
    setIsWelcomeOpen(false);
  }, []);

  const handleOpenWelcome = useCallback(() => {
    setIsWelcomeOpen(true);
  }, []);

  const canReturnToVault =
    !isVaultLockedState &&
    (hasVaultPin() ||
      (typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem('vibe_vault_setup_skipped'))));

  return (
    <>
      {isWelcomeOpen && (
        <WelcomeDashboardModal
          isOpen={true}
          onClose={() => setIsWelcomeOpen(false)}
          canReturnToVault={canReturnToVault}
          onEnterVault={handleEnterVault}
        />
      )}

      {hasEnteredWorkspace && !isVaultLockedState && (
        <div className={isWelcomeOpen ? 'hidden' : 'contents'}>
          <LazyErrorBoundary>
            <Suspense
              fallback={
                <div className="min-h-[100dvh] w-full bg-[var(--surface-backdrop)] text-neutral-300 flex items-center justify-center text-xs font-medium tracking-wide">
                  Vibe Vault 불러오는 중...
                </div>
              }
            >
              <VaultWorkspace onOpenWelcome={handleOpenWelcome} />
            </Suspense>
          </LazyErrorBoundary>
        </div>
      )}
    </>
  );
}

export function App() {
  return (
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  );
}

export default App;
