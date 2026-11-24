import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { ArrowRight, Fingerprint, Loader2, Lock, LogOut } from 'lucide-react';
import { useI18n } from '../i18n';
import { patchUserPreferences, type AIEngineConfig } from '../utils';
import { lazyWithRetry, LazyErrorBoundary } from '../lazyWithRetry';
import {
  hasVaultPin, isVaultLocked, lockVault, unlockVault, subscribeVaultLock,
  getLocalVaultProfile, type LocalVaultProfile,
  authenticateBiometricUnlock, isBiometricUnlockEnabled, isBiometricAvailable,
} from '../vaultSecurity';
import type { LegalNoticeTab } from './LegalNoticeModal';
import { GuestExitConfirmModal } from './GuestExitConfirmModal';
import { LocalVaultAuthModal } from './LocalVaultAuthModal';
import { SEASON_THEMES, type SeasonThemeId, applySeasonTheme, getStoredSeasonTheme, SEASON_CHANGE_EVENT } from '../seasonTheme';

const LegalNoticeModal = lazyWithRetry(() => import('./LegalNoticeModal').then((m) => ({ default: m.LegalNoticeModal })));

export interface WelcomeDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  engineConfig?: AIEngineConfig;
  onUpdateEngineConfig?: (partial: Partial<AIEngineConfig>) => void;
  onEnterVault?: () => void;
  canReturnToVault?: boolean;
}

export const WELCOME_SEEN_STORAGE_KEY = 'vibe_welcome_seen';
export function persistWelcomeSeen(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(WELCOME_SEEN_STORAGE_KEY, 'true');
    localStorage.setItem('vibe_onboarding_completed', 'true');
  } catch { /* ignore */ }
}

const POLICIES: [LegalNoticeTab, string, string][] = [
  ['privacy', '개인정보처리방침', 'Privacy'],
  ['terms', '이용약관', 'Terms'],
  ['licenses', '오픈소스', 'Licenses'],
  ['cookies', '쿠키 정책', 'Cookies'],
];

const BTN_BASE = 'h-11 rounded-xl text-xs sm:text-sm transition-all cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0';
const BTN_PRI = `${BTN_BASE} px-5 bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 font-semibold active:scale-[0.98]`;
const BTN_SEC = `${BTN_BASE} px-4 border border-white/[0.16] bg-white/[0.04] hover:bg-white/[0.09] text-neutral-100 hover:text-white font-medium`;

export const WelcomeDashboardModal: React.FC<WelcomeDashboardModalProps> = ({
  isOpen, onClose, onEnterVault, canReturnToVault = false,
}) => {
  const { t, language, setLanguage } = useI18n();
  const isKo = language === 'ko';
  const [isPinSet, setIsPinSet] = useState(() => hasVaultPin());
  const [vaultLocked, setVaultLocked] = useState(() => isVaultLocked());
  const [profile, setProfile] = useState<LocalVaultProfile | null>(() => getLocalVaultProfile());
  const [authMode, setAuthMode] = useState<'create' | 'unlock' | null>(null);
  const [guestExitOpen, setGuestExitOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bioReady, setBioReady] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(() => isBiometricUnlockEnabled());
  const [season, setSeason] = useState<SeasonThemeId>(() => getStoredSeasonTheme());
  const [legal, setLegal] = useState<{ open: boolean; tab: LegalNoticeTab }>({ open: false, tab: 'privacy' });

  useEffect(() => {
    const onSeason = (e: Event) => { const next = (e as CustomEvent<SeasonThemeId>).detail; if (next) setSeason(next); };
    window.addEventListener(SEASON_CHANGE_EVENT, onSeason);
    return () => window.removeEventListener(SEASON_CHANGE_EVENT, onSeason);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setIsPinSet(hasVaultPin()); setVaultLocked(isVaultLocked()); setProfile(getLocalVaultProfile());
    setBioEnabled(isBiometricUnlockEnabled()); setAuthMode(null); setError(null);
    isBiometricAvailable().then(setBioReady).catch(() => setBioReady(false));
    return subscribeVaultLock((locked) => {
      setVaultLocked(locked); setIsPinSet(hasVaultPin()); setProfile(getLocalVaultProfile());
    });
  }, [isOpen]);

  const selectSeason = useCallback((next: SeasonThemeId) => {
    setSeason(next); patchUserPreferences({ seasonTheme: next }); applySeasonTheme(next);
  }, []);

  const enterVault = useCallback(() => {
    persistWelcomeSeen();
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('vibe_vault_setup_skipped', 'true');
    (onEnterVault || onClose)();
  }, [onClose, onEnterVault]);

  const handleGuest = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await unlockVault();
      setVaultLocked(false);
      enterVault();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isKo ? '게스트 금고를 여는 중 오류가 발생했습니다.' : 'Failed to open guest vault.'));
    } finally {
      setBusy(false);
    }
  };

  const handleLock = () => {
    lockVault(); setVaultLocked(true); setIsPinSet(hasVaultPin()); setProfile(getLocalVaultProfile()); setAuthMode(null);
  };

  const handleBio = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await authenticateBiometricUnlock();
      if (res.success) { setVaultLocked(false); enterVault(); }
      else setError(res.error || (isKo ? '생체 인증에 실패했습니다.' : 'Biometric unlock failed.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : (isKo ? '생체 인증 실패' : 'Biometric failed.'));
    } finally { setBusy(false); }
  };

  if (!isOpen) return null;
  const revisit = canReturnToVault && !vaultLocked;
  const sessionText = revisit
    ? (isPinSet ? `${profile?.userName || 'Local'} · ${isKo ? '열림' : 'Active'}` : (isKo ? '게스트 · 활성' : 'Guest · Active'))
    : isPinSet ? `${profile?.userName || 'Vault'} · ${isKo ? '잠김' : 'Locked'}` : (isKo ? '미등록 · 게스트 가능' : 'Unregistered · Guest');
  const specs = [
    [isKo ? '세션' : 'Session', sessionText],
    [isKo ? '저장소' : 'Storage', 'IndexedDB (Local)'],
    [isKo ? '암호화' : 'Crypto', 'AES-GCM-256'],
    [isKo ? '서버 전송' : 'Telemetry', isKo ? '없음 · 제로 쿠키' : 'Zero · No Cookies'],
  ] as const;
  const pillars = [
    { idx: '01', title: t('welcome_phil1_title'), desc: t('welcome_phil1_desc'), cls: 'text-emerald-400' },
    { idx: '02', title: t('welcome_phil2_title'), desc: t('welcome_phil2_desc'), cls: 'text-amber-300' },
    { idx: '03', title: t('welcome_phil3_title'), desc: t('welcome_phil3_desc'), cls: 'text-sky-400' },
  ];

  return (
    <div id="welcome-top" className="fixed inset-0 z-[70] bg-[var(--surface-backdrop)] text-neutral-100 overflow-y-auto overscroll-contain antialiased">
      <div className="min-h-[100dvh] max-w-4xl mx-auto px-5 sm:px-8 py-6 sm:py-10 flex flex-col justify-between gap-10">
        <header className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
          <div className="flex items-baseline gap-2.5">
            <span className="text-base sm:text-lg font-bold tracking-tight text-white">Vibe Vault</span>
            <span className="font-mono text-[11px] text-neutral-400 tabular-nums">v0.1.2</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5" role="group" aria-label={isKo ? '사계절 테마' : 'Season Theme'}>
              {SEASON_THEMES.map((item) => (
                <button
                  key={item.id} id={`welcome-season-${item.id}`} type="button" onClick={() => selectSeason(item.id)}
                  title={isKo ? `${item.seasonKo} (${item.poeticKo})` : `${item.labelEn} (${item.poeticEn})`}
                  aria-label={isKo ? item.seasonKo : item.labelEn} aria-pressed={season === item.id}
                  className={`w-5 h-5 rounded-full transition-transform cursor-pointer border ${season === item.id ? 'border-white scale-110' : 'border-white/20 opacity-65 hover:opacity-100'}`}
                  style={{ backgroundColor: item.accentHex }}
                />
              ))}
            </div>
            <div className="flex items-center border-l border-white/[0.1] pl-3 gap-1">
              {(['ko', 'en'] as const).map((code) => (
                <button key={code} id={`welcome-lang-${code}`} type="button" onClick={() => setLanguage(code)}
                  className={`px-2 py-1 rounded-md font-mono text-[11px] cursor-pointer ${language === code ? 'bg-white/[0.12] text-white font-semibold' : 'text-neutral-400 hover:text-white'}`}>
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            {revisit && (
              <button id="welcome-logout-btn" type="button" onClick={() => (isPinSet ? handleLock() : setGuestExitOpen(true))}
                className="h-8 px-3 rounded-lg border border-white/[0.12] text-xs text-neutral-300 hover:text-white hover:bg-white/[0.06] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                {isPinSet ? <Lock size={12} /> : <LogOut size={12} />}
                <span>{isPinSet ? t('lock_vault') : (isKo ? '게스트 종료' : 'Exit Guest')}</span>
              </button>
            )}
          </div>
        </header>

        <main className="space-y-10 my-auto">
          <section className="space-y-6">
            <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-accent)]">NET TO DOT · LOCAL-FIRST VAULT</p>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.15] max-w-2xl">
              {isKo ? '당신의 기기 안에서만 완성되는 프라이빗 금융 금고.' : 'A private financial vault that lives solely on your device.'}
            </h1>
            <p className="text-sm sm:text-base text-neutral-300 leading-relaxed max-w-2xl">{t('welcome_manifesto')}</p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              {revisit ? (
                <>
                  <button type="button" onClick={() => { persistWelcomeSeen(); onClose(); }} className={BTN_PRI}>
                    <span>{isKo ? '프라이빗 금고로 돌아가기' : 'Return to Private Vault'}</span><ArrowRight size={15} />
                  </button>
                  {!isPinSet && (
                    <button id="welcome-create-local-account-btn" type="button" onClick={() => setAuthMode('create')} className={BTN_SEC}>
                      <Lock size={14} /><span>{isKo ? '로컬 계정 만들기' : 'Create Local Account'}</span>
                    </button>
                  )}
                </>
              ) : isPinSet ? (
                <>
                  <button id="welcome-login-btn" type="button" onClick={() => setAuthMode('unlock')} className={BTN_PRI}>
                    <Lock size={14} /><span>{isKo ? 'PIN으로 금고 열기' : 'Unlock with PIN'}</span><ArrowRight size={15} />
                  </button>
                  {bioReady && bioEnabled && (
                    <button type="button" onClick={handleBio} disabled={busy} className={BTN_SEC}>
                      <Fingerprint size={15} className="text-emerald-300" /><span>{t('biometric_unlock')}</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button id="welcome-create-local-account-btn" type="button" onClick={() => setAuthMode('create')} className={BTN_PRI}>
                    <Lock size={14} /><span>{isKo ? '로컬 계정 만들기' : 'Create Local Account'}</span><ArrowRight size={15} />
                  </button>
                  <button id="welcome-guest-mode-btn" type="button" onClick={handleGuest} disabled={busy} className={BTN_SEC}>
                    {busy && <Loader2 size={14} className="animate-spin" />}
                    <span>{isKo ? '게스트로 바로 시작' : 'Enter as Guest'}</span>
                  </button>
                </>
              )}
            </div>
            {error && <p role="alert" className="text-xs text-amber-300 font-medium">{error}</p>}

            <dl className="pt-5 border-t border-white/[0.08] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              {specs.map(([label, val]) => (
                <div key={label}>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">{label}</dt>
                  <dd className="mt-1 font-medium text-neutral-100 truncate tabular-nums">{val}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="welcome-pillars" className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-white/[0.08]">
            {pillars.map((p) => (
              <article key={p.idx} className="space-y-2">
                <span className={`font-mono text-xs font-semibold tabular-nums ${p.cls}`}>{p.idx}</span>
                <h2 className="text-sm font-semibold text-white tracking-tight">{p.title}</h2>
                <p className="text-xs text-neutral-300 leading-relaxed">{p.desc}</p>
              </article>
            ))}
          </section>
        </main>

        <footer id="welcome-footer" className="pt-5 border-t border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-neutral-400">
          <p className="font-mono text-[11px]">
            © 2026 Vibe Vault · <a href="https://nettodot.org" target="_blank" rel="noopener noreferrer" className="text-neutral-300 hover:text-white underline underline-offset-2 decoration-white/20">Net to Dot Movement</a>
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {POLICIES.map(([tab, ko, en]) => (
              <button key={tab} type="button" onClick={() => setLegal({ open: true, tab })} className="text-[11px] text-neutral-400 hover:text-white cursor-pointer">
                {isKo ? ko : en}
              </button>
            ))}
          </div>
        </footer>
      </div>

      <LocalVaultAuthModal
        mode={authMode}
        profile={profile}
        biometricReady={bioReady && bioEnabled}
        onClose={() => setAuthMode(null)}
        onAuthenticated={(saved, pinCreated) => {
          setProfile(saved);
          if (pinCreated) setIsPinSet(true);
          setVaultLocked(false);
          setAuthMode(null);
          enterVault();
        }}
      />
      <GuestExitConfirmModal
        isOpen={guestExitOpen} onClose={() => setGuestExitOpen(false)}
        setupPinLabel={isKo ? '로컬 계정 만들기' : 'Create Local Account'}
        onSetupPin={() => { setGuestExitOpen(false); setAuthMode('create'); }}
        onConfirmExit={() => { setGuestExitOpen(false); handleLock(); }}
      />
      {legal.open && (
        <LazyErrorBoundary><Suspense fallback={null}>
          <LegalNoticeModal isOpen={legal.open} onClose={() => setLegal((s) => ({ ...s, open: false }))} initialTab={legal.tab} />
        </Suspense></LazyErrorBoundary>
      )}
    </div>
  );
};

export const WelcomePage = WelcomeDashboardModal;
export default WelcomeDashboardModal;
