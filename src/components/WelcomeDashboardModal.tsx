import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Eye,
  EyeOff,
  Fingerprint,
  Loader2,
  Lock,
  LogOut,
  X,
} from 'lucide-react';
import { useI18n, LanguageCode } from '../i18n';
import type { AIEngineConfig } from '../utils';
import { lazyWithRetry, LazyErrorBoundary } from '../lazyWithRetry';
import {
  hasVaultPin,
  isVaultLocked,
  lockVault,
  setVaultPin,
  unlockVault,
  subscribeVaultLock,
  getLocalVaultProfile,
  saveLocalVaultProfile,
  LocalVaultProfile,
  authenticateBiometricUnlock,
  isBiometricUnlockEnabled,
  isBiometricAvailable,
} from '../vaultSecurity';
import type { LegalNoticeTab } from './LegalNoticeModal';
import { GuestExitConfirmModal } from './GuestExitConfirmModal';
import {
  SEASON_THEMES,
  SeasonThemeId,
  applySeasonTheme,
  getStoredSeasonTheme,
  SEASON_CHANGE_EVENT,
} from '../seasonTheme';
import { patchUserPreferences } from '../utils';

const LegalNoticeModal = lazyWithRetry(() =>
  import('./LegalNoticeModal').then((m) => ({ default: m.LegalNoticeModal }))
);

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
  } catch {
    // Ignore storage quota or private browsing failures
  }
}

const NET_TO_DOT_MANIFESTO: Record<LanguageCode, string> = {
  ko: '거대 클라우드(Net)의 종속에서 벗어나, 당신의 기기(Dot) 안에서 완벽한 데이터 주권을 실현하세요.',
  en: 'Break free from passive cloud (Net) dependency and realize complete data sovereignty inside your own device (Dot).',
  ja: '巨大クラウド(Net)への依存から離れ、あなたのデバイス(Dot)の中で完全なデータ主権を実現しましょう。',
  eu: 'Break free from passive cloud (Net) dependency and realize complete data sovereignty inside your own device (Dot).',
};

const FOOTER_POLICY_LINKS: { tab: LegalNoticeTab; label: string }[] = [
  { tab: 'privacy', label: '개인정보처리방침' },
  { tab: 'terms', label: '이용약관' },
  { tab: 'licenses', label: '오픈소스 라이선스' },
  { tab: 'community', label: '커뮤니티 이용 규약' },
  { tab: 'cookies', label: '쿠키 정책' },
];

const FOOTER_POLICY_LABELS_EN: Record<LegalNoticeTab, string> = {
  legal: 'Legal Notice',
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  licenses: 'Open Source Licenses',
  community: 'Community Guidelines',
  cookies: 'Cookie Policy',
};

const GOGUMA_UNIVERSE_LINKS: { label: string; labelEn: string; href: string }[] = [
  { label: '디지털 명함', labelEn: 'Digital Namecard', href: 'https://eerum.goguma.app' },
  { label: 'AI 앱 기획', labelEn: 'AI App Studio', href: 'https://goguma.app' },
  { label: 'AI 슬라이드', labelEn: 'AI Slides', href: 'https://vibeslide.goguma.app' },
  { label: 'AI 일정관리', labelEn: 'AI Calendar', href: 'https://vibecalendar.goguma.app' },
];

const RELATED_SITE_LINKS: { label: string; href: string }[] = [
  { label: 'Net-to-Dot', href: 'https://nettodot.org' },
  { label: 'AI Podium', href: 'https://aipodium.net' },
  { label: 'K-Design.md', href: 'https://kdesign.koreancenter.net' },
  { label: '한국센터글로벌네트워크', href: 'https://koreancenter.net' },
  { label: 'Global K-Edu Community', href: 'https://kedu.koreancenter.net' },
  { label: '인도네시아센터', href: 'https://indonesiacenter.net' },
  { label: '인도네시아 창업지원센터', href: 'https://visas.indonesiacenter.net' },
];

interface FooterLinkListboxProps {
  id: string;
  label: string;
  links: { label: string; href: string }[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

const FooterLinkListbox: React.FC<FooterLinkListboxProps> = ({
  id,
  label,
  links,
  isOpen,
  onToggle,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={containerRef} className="relative w-full sm:w-52">
      <button
        id={`${id}-trigger`}
        type="button"
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-listbox`}
        className={`w-full h-10 px-3.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
          isOpen
            ? 'bg-white/[0.06] border-white/25 text-white'
            : 'bg-[#0C0E13] border-white/[0.1] text-neutral-200 hover:border-white/20 hover:text-white'
        }`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`shrink-0 text-neutral-400 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-white' : ''
          }`}
        />
      </button>

      {isOpen && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          aria-label={label}
          className="absolute bottom-full left-0 right-0 mb-2 py-1.5 rounded-xl bg-[#0E1016] border border-white/[0.12] shadow-2xl z-30 max-h-64 overflow-y-auto animate-in fade-in slide-in-from-bottom-1 duration-150"
        >
          {links.map((link) => (
            <li key={link.href} role="option" aria-selected={false}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="w-full px-3.5 py-2 text-xs text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors flex items-center justify-between gap-2 group"
              >
                <span className="truncate">{link.label}</span>
                <ArrowUpRight
                  size={11}
                  aria-hidden="true"
                  className="shrink-0 opacity-40 group-hover:opacity-100 transition-opacity"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

type AccountModalMode = 'create' | 'unlock' | null;

export const WelcomeDashboardModal: React.FC<WelcomeDashboardModalProps> = ({
  isOpen,
  onClose,
  onEnterVault,
  canReturnToVault = false,
}) => {
  const { t, language, setLanguage } = useI18n();
  const isKo = language === 'ko';

  // Local account & vault state
  const [isPinSet, setIsPinSet] = useState<boolean>(() => hasVaultPin());
  const [vaultLocked, setVaultLocked] = useState<boolean>(() => isVaultLocked());
  const [localProfile, setLocalProfile] = useState<LocalVaultProfile | null>(() =>
    getLocalVaultProfile()
  );

  // Local account modal state
  const [accountModalMode, setAccountModalMode] = useState<AccountModalMode>(null);
  const [showGuestExitConfirm, setShowGuestExitConfirm] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>('');
  const [pinName, setPinName] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Biometric availability for returning PIN users
  const [isBiometricSupported, setIsBiometricSupported] = useState<boolean>(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState<boolean>(() =>
    isBiometricUnlockEnabled()
  );

  // Korean Four Seasons color theme state
  const [seasonTheme, setSeasonTheme] = useState<SeasonThemeId>(() => getStoredSeasonTheme());

  useEffect(() => {
    const onSeasonChange = (e: Event) => {
      const next = (e as CustomEvent<SeasonThemeId>).detail;
      if (next) setSeasonTheme(next);
    };
    window.addEventListener(SEASON_CHANGE_EVENT, onSeasonChange);
    return () => window.removeEventListener(SEASON_CHANGE_EVENT, onSeasonChange);
  }, []);

  const handleSelectSeason = useCallback((next: SeasonThemeId) => {
    setSeasonTheme(next);
    patchUserPreferences({ seasonTheme: next });
    applySeasonTheme(next);
  }, []);

  // Policy modal & footer listbox state
  const [legalModalOpen, setLegalModalOpen] = useState<boolean>(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalNoticeTab>('privacy');
  const [openFooterListbox, setOpenFooterListbox] = useState<'universe' | 'related' | null>(null);

  const userNameInputRef = useRef<HTMLInputElement>(null);
  const unlockPinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIsPinSet(hasVaultPin());
    setVaultLocked(isVaultLocked());
    setLocalProfile(getLocalVaultProfile());
    setIsBiometricEnabled(isBiometricUnlockEnabled());
    setAccountModalMode(null);
    setFormError(null);

    isBiometricAvailable()
      .then((available) => setIsBiometricSupported(available))
      .catch(() => setIsBiometricSupported(false));

    const unsub = subscribeVaultLock((locked) => {
      setVaultLocked(locked);
      setIsPinSet(hasVaultPin());
      setLocalProfile(getLocalVaultProfile());
    });
    return () => unsub();
  }, [isOpen]);

  // Focus first field & handle Escape key when local account modal opens
  useEffect(() => {
    if (!accountModalMode) return;

    const focusTimer = setTimeout(() => {
      if (accountModalMode === 'create') {
        userNameInputRef.current?.focus();
      } else {
        unlockPinInputRef.current?.focus();
      }
    }, 60);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        setAccountModalMode(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountModalMode, isSubmitting]);

  const completeEntry = useCallback(() => {
    persistWelcomeSeen();
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('vibe_vault_setup_skipped', 'true');
    }
    if (onEnterVault) {
      onEnterVault();
    } else {
      onClose();
    }
  }, [onClose, onEnterVault]);

  const openCreateAccountModal = useCallback(() => {
    setUserName(localProfile?.userName || '');
    setPinName(localProfile?.pinName || '');
    setPin('');
    setConfirmPin('');
    setShowPin(false);
    setFormError(null);
    setAccountModalMode('create');
  }, [localProfile]);

  const openUnlockAccountModal = useCallback(() => {
    setPin('');
    setShowPin(false);
    setFormError(null);
    setAccountModalMode('unlock');
  }, []);

  const handleGuestModeEnter = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await unlockVault();
      setVaultLocked(false);
      completeEntry();
    } catch {
      completeEntry();
    } finally {
      setIsSubmitting(false);
    }
  }, [completeEntry, isSubmitting]);

  const handleLogout = useCallback(() => {
    lockVault();
    setVaultLocked(true);
    setIsPinSet(hasVaultPin());
    setLocalProfile(getLocalVaultProfile());
    setAccountModalMode(null);
  }, []);

  const handleReturnToVault = useCallback(() => {
    persistWelcomeSeen();
    onClose();
  }, [onClose]);

  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedUser = userName.trim();
    const trimmedPinName = pinName.trim() || (isKo ? '마스터 PIN' : 'Master PIN');

    if (!trimmedUser) {
      setFormError(isKo ? '사용자 이름을 입력해 주세요.' : 'Please enter a display name.');
      return;
    }
    if (pin.length < 4 || pin.length > 6) {
      setFormError(isKo ? '마스터 PIN은 4~6자리 숫자로 입력해 주세요.' : 'Master PIN must be 4 to 6 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setFormError(isKo ? 'PIN 확인 번호가 일치하지 않습니다.' : 'PIN confirmation does not match.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      await setVaultPin(pin);
      const saved = saveLocalVaultProfile({
        userName: trimmedUser,
        pinName: trimmedPinName,
      });
      setLocalProfile(saved);
      setIsPinSet(true);
      setVaultLocked(false);
      setAccountModalMode(null);
      setPin('');
      setConfirmPin('');
      completeEntry();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : (isKo ? '로컬 계정 생성 중 오류가 발생했습니다.' : 'An error occurred while creating your local account.');
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlockAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (pin.length < 4 || pin.length > 6) {
      setFormError(isKo ? '설정한 4~6자리 PIN 번호를 입력해 주세요.' : 'Please enter your 4 to 6 digit PIN.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await unlockVault(pin);
      if (res.success) {
        setVaultLocked(false);
        setAccountModalMode(null);
        setPin('');
        completeEntry();
      } else {
        setFormError(res.error || (isKo ? '올바르지 않은 PIN 번호입니다.' : 'Incorrect PIN. Please try again.'));
        setPin('');
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : isKo
            ? '금고 잠금 해제 중 오류가 발생했습니다.'
            : 'Failed to unlock the vault.';
      setFormError(message);
      setPin('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBiometricUnlock = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await authenticateBiometricUnlock();
      if (res.success) {
        setVaultLocked(false);
        setAccountModalMode(null);
        completeEntry();
      } else {
        setFormError(
          res.error ||
            (isKo
              ? '생체 인증에 실패했습니다. PIN 번호를 입력해 주세요.'
              : 'Biometric authentication failed. Please enter your PIN.')
        );
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : isKo
            ? '생체 인증에 실패했습니다.'
            : 'Biometric authentication failed.';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPolicyModal = (tab: LegalNoticeTab) => {
    setLegalModalTab(tab);
    setLegalModalOpen(true);
  };

  if (!isOpen) {
    return null;
  }

  const isUnlockedRevisit = canReturnToVault && !vaultLocked;

  const pillars = [
    {
      index: '01',
      title: t('welcome_phil1_title'),
      desc: t('welcome_phil1_desc'),
      accent: 'text-emerald-400',
    },
    {
      index: '02',
      title: t('welcome_phil2_title'),
      desc: t('welcome_phil2_desc'),
      accent: 'text-amber-300',
    },
    {
      index: '03',
      title: t('welcome_phil3_title'),
      desc: t('welcome_phil3_desc'),
      accent: 'text-sky-400',
    },
  ];

  const colophonSpecs = isKo
    ? [
        isUnlockedRevisit
          ? {
              label: '현재 세션',
              value: isPinSet
                ? `${localProfile?.userName || '로컬 계정'} · 로그인됨`
                : '게스트 모드 · 활성',
            }
          : isPinSet
            ? {
                label: '로컬 계정',
                value: `${localProfile?.userName || '로컬 금고'} · 로그아웃됨`,
              }
            : {
                label: '계정 상태',
                value: '미등록 · 게스트 이용 가능',
              },
        { label: '저장 방식', value: '브라우저 로컬 IndexedDB' },
        { label: '암호화 규격', value: 'AES-GCM-256 · PBKDF2' },
        { label: '데이터 원칙', value: '서버 수집 · 쿠키 없음' },
      ]
    : [
        isUnlockedRevisit
          ? {
              label: 'Session',
              value: isPinSet
                ? `${localProfile?.userName || 'Local Account'} · Signed in`
                : 'Guest Mode · Active',
            }
          : isPinSet
            ? {
                label: 'Account',
                value: `${localProfile?.userName || 'Local Vault'} · Locked`,
              }
            : {
                label: 'Account',
                value: 'Not set · Guest available',
              },
        { label: 'Storage', value: 'Local IndexedDB' },
        { label: 'Encryption', value: 'AES-GCM-256 · PBKDF2' },
        { label: 'Privacy', value: 'Zero server sync · No cookies' },
      ];

  const localizedUniverseLinks = GOGUMA_UNIVERSE_LINKS.map((item) => ({
    label: isKo ? item.label : item.labelEn,
    href: item.href,
  }));

  return (
    <div className="h-[100dvh] w-full overflow-y-auto bg-transparent text-neutral-100 antialiased font-sans flex flex-col selection:bg-white/20">
      {/* Main Minimal Editorial Canvas */}
      <main id="welcome-top" className="flex-1 w-full flex items-center">
        <div className="w-full max-w-5xl mx-auto px-6 sm:px-10 py-14 sm:py-20 lg:py-24">
          {/* Editorial Hero Spread */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-start">
            {/* Primary Editorial Statement & Actions */}
            <div className="lg:col-span-8 space-y-6">
              <h1 className="text-[clamp(2.6rem,5.2vw,4rem)] leading-[1.08] font-semibold tracking-tight text-white [text-wrap:balance]">
                Vibe Vault
              </h1>

              <div className="space-y-3.5 max-w-xl">
                <p className="text-base sm:text-[17px] font-normal text-neutral-200 leading-[1.7]">
                  {t('welcome_manifesto')}
                </p>
                <p className="text-sm font-normal text-neutral-400 leading-[1.7]">
                  {NET_TO_DOT_MANIFESTO[language] || NET_TO_DOT_MANIFESTO.en}
                </p>
              </div>

              {/* Primary / Secondary Entry Actions */}
              <div className="pt-3 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
                  {isUnlockedRevisit ? (
                    <>
                      <button
                        type="button"
                        onClick={handleReturnToVault}
                        className="h-12 px-6 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--color-accent-hover)] text-sm font-semibold transition-all active:scale-[0.98] cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/60"
                      >
                        <span>{isKo ? '프라이빗 금고로 돌아가기' : 'Return to Private Vault'}</span>
                        <ArrowRight size={15} />
                      </button>

                      {!isPinSet && (
                        <button
                          type="button"
                          onClick={openCreateAccountModal}
                          className="h-12 px-6 rounded-xl border border-white/[0.18] bg-transparent hover:bg-white/[0.06] hover:border-white/30 text-neutral-100 text-sm font-medium transition-all active:scale-[0.98] cursor-pointer inline-flex items-center justify-center whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                        >
                          {isKo ? '로컬 계정 만들기' : 'Create Local Account'}
                        </button>
                      )}

                      <button
                        id="welcome-logout-btn"
                        type="button"
                        onClick={() => {
                          if (isPinSet) {
                            handleLogout();
                          } else {
                            setShowGuestExitConfirm(true);
                          }
                        }}
                        className="h-12 px-5 rounded-xl border border-white/[0.14] bg-transparent hover:bg-white/[0.06] hover:border-white/25 text-neutral-300 hover:text-white text-sm font-medium transition-all active:scale-[0.98] cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      >
                        {isPinSet ? <Lock size={14} /> : <LogOut size={14} />}
                        <span>
                          {isPinSet
                            ? (isKo ? '금고 잠그기' : 'Lock Vault')
                            : (isKo ? '게스트 종료' : 'Exit Guest')}
                        </span>
                      </button>
                    </>
                  ) : isPinSet ? (
                    <>
                      <button
                        id="welcome-login-btn"
                        type="button"
                        onClick={openUnlockAccountModal}
                        className="h-12 px-6 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--color-accent-hover)] text-sm font-semibold transition-all active:scale-[0.98] cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/60"
                      >
                        <span>
                          {isKo
                            ? localProfile?.userName
                              ? `${localProfile.userName}님 로그인`
                              : '로컬 계정 로그인'
                            : localProfile?.userName
                              ? `Sign in as ${localProfile.userName}`
                              : 'Sign in to Local Vault'}
                        </span>
                        <ArrowRight size={15} />
                      </button>

                      {isBiometricSupported && isBiometricEnabled && (
                        <button
                          type="button"
                          onClick={handleBiometricUnlock}
                          disabled={isSubmitting}
                          className="h-12 px-6 rounded-xl border border-white/[0.18] bg-transparent hover:bg-white/[0.06] hover:border-white/30 text-neutral-100 text-sm font-medium transition-all active:scale-[0.98] cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                        >
                          <Fingerprint size={15} className="text-emerald-300" />
                          <span>{t('biometric_unlock')}</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        id="welcome-create-local-account-btn"
                        type="button"
                        onClick={openCreateAccountModal}
                        className="h-12 px-6 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--color-accent-hover)] text-sm font-semibold transition-all active:scale-[0.98] cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/60"
                      >
                        <span>{isKo ? '로컬 계정 만들기' : 'Create Local Account'}</span>
                        <ArrowRight size={15} />
                      </button>

                      <button
                        id="welcome-guest-mode-btn"
                        type="button"
                        onClick={handleGuestModeEnter}
                        disabled={isSubmitting}
                        className="h-12 px-6 rounded-xl border border-white/[0.18] bg-transparent hover:bg-white/[0.06] hover:border-white/30 text-neutral-100 text-sm font-medium transition-all active:scale-[0.98] cursor-pointer inline-flex items-center justify-center whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      >
                        {isKo ? '게스트 모드' : 'Guest Mode'}
                      </button>
                    </>
                  )}
                </div>

                <p className="text-xs text-neutral-400 leading-relaxed">
                  {isUnlockedRevisit
                    ? isKo
                      ? '현재 금고가 열려 있습니다. 로그아웃하면 메모리 내 암호화 키가 즉시 파기됩니다.'
                      : 'Your vault is currently unlocked. Signing out immediately clears encryption keys from memory.'
                    : isPinSet
                      ? isKo
                        ? `${localProfile?.userName ? `${localProfile.userName}님의 로컬 계정이` : '이 기기에 로컬 계정이'} 안전하게 잠겨 있습니다. PIN 로그인 후 금고가 열립니다.`
                        : `${localProfile?.userName ? `${localProfile.userName}'s local account` : 'Your local account'} is safely locked on this device. Enter your PIN to unlock.`
                      : isKo
                        ? '로컬 계정은 기기 내 영구 암호화되며, 게스트 모드는 바로 체험 후 로그아웃 시 초기화됩니다.'
                        : 'Local accounts are permanently encrypted on-device. Guest Mode lets you explore immediately and resets on sign-out.'}
                </p>
              </div>
            </div>

            {/* Quiet Editorial Colophon / Specifications */}
            <aside
              aria-label={isKo ? '아키텍처 요약' : 'Architecture summary'}
              className="lg:col-span-4 lg:pt-3 border-t border-white/[0.09] divide-y divide-white/[0.08]"
            >
              <dl className="divide-y divide-white/[0.08]">
                {colophonSpecs.map((spec) => (
                  <div
                    key={spec.label}
                    className="py-3.5 first:pt-4 flex items-baseline justify-between gap-4"
                  >
                    <dt className="text-xs text-neutral-400 shrink-0">{spec.label}</dt>
                    <dd className="text-xs font-medium text-neutral-200 text-right truncate">
                      {spec.value}
                    </dd>
                  </div>
                ))}
              </dl>

              {/* Korean Four Seasons Color Set Quick Switcher */}
              {(() => {
                const activeSeason =
                  SEASON_THEMES.find((s) => s.id === seasonTheme) || SEASON_THEMES[3];
                return (
                  <div className="py-3.5 space-y-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span id="welcome-season-label" className="text-xs text-neutral-400 shrink-0">
                        {isKo ? '사계 테마' : 'Seasons'}
                      </span>
                      <span className="text-[11px] text-neutral-400 truncate text-right">
                        {isKo
                          ? `${activeSeason.poeticKo} · ${activeSeason.subtitleKo}`
                          : activeSeason.poeticEn}
                      </span>
                    </div>
                    <div
                      className="grid grid-cols-4 gap-1.5"
                      role="radiogroup"
                      aria-labelledby="welcome-season-label"
                    >
                      {SEASON_THEMES.map((season) => {
                        const isActive = seasonTheme === season.id;
                        return (
                          <button
                            key={season.id}
                            id={`welcome-season-${season.id}`}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            onClick={() => handleSelectSeason(season.id)}
                            title={
                              isKo
                                ? `${season.seasonKo} · ${season.poeticKo} (${season.subtitleKo})`
                                : `${season.labelEn} · ${season.poeticEn} (${season.subtitleEn})`
                            }
                            className={`inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
                              isActive
                                ? 'bg-[var(--color-accent-subtle)] text-white font-semibold'
                                : 'bg-white/[0.02] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.05]'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="w-2 h-2 rounded-full shrink-0 border border-white/25"
                              style={{ backgroundColor: season.accentHex }}
                            />
                            <span>{isKo ? season.seasonKo : season.labelEn}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Language Quick Switcher (KO / EN) */}
              <div className="py-3.5 flex items-center justify-between gap-3">
                <span id="welcome-lang-label" className="text-xs text-neutral-400 shrink-0">
                  {isKo ? '언어' : 'Language'}
                </span>
                <div
                  className="flex items-center gap-1"
                  role="radiogroup"
                  aria-labelledby="welcome-lang-label"
                >
                  {([
                    { code: 'ko' as const, label: '한국어' },
                    { code: 'en' as const, label: 'English' },
                  ]).map((opt) => {
                    const isActive = (isKo ? 'ko' : 'en') === opt.code;
                    return (
                      <button
                        key={opt.code}
                        id={`welcome-lang-${opt.code}`}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() => setLanguage(opt.code)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
                          isActive
                            ? 'bg-[var(--color-accent-subtle)] text-white font-semibold'
                            : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>
          </section>

          {/* 3-Column Horizontal Editorial Principles Index */}
          <section
            id="welcome-pillars"
            aria-label={isKo ? '핵심 설계 원칙' : 'Core design principles'}
            className="mt-14 sm:mt-20 pt-10 sm:pt-12 border-t border-white/[0.09]"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-9 md:gap-10">
              {pillars.map((pillar) => (
                <article key={pillar.index} className="space-y-3">
                  <div className="flex items-baseline gap-2.5">
                    <span className={`font-mono text-xs tabular-nums ${pillar.accent}`}>
                      {pillar.index}
                    </span>
                    <h2 className="text-[15px] font-semibold tracking-tight text-white">
                      {pillar.title}
                    </h2>
                  </div>
                  <p className="text-[13.5px] text-neutral-400 leading-[1.7]">{pillar.desc}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* Minimalist Editorial Footer */}
      <footer id="welcome-footer" className="w-full border-t border-[var(--surface-subtle-border)] bg-[var(--surface-footer)] transition-colors">
        <div className="max-w-5xl mx-auto px-6 sm:px-10 py-10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
            {/* Left: Policy Menu & Company Info */}
            <div className="space-y-4">
              <nav
                aria-label={isKo ? '정책 및 약관 메뉴' : 'Policies and legal links'}
                className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutral-300"
              >
                {FOOTER_POLICY_LINKS.map((item) => (
                  <button
                    key={item.tab}
                    type="button"
                    onClick={() => openPolicyModal(item.tab)}
                    className="hover:text-white transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:underline"
                  >
                    {isKo ? item.label : FOOTER_POLICY_LABELS_EN[item.tab]}
                  </button>
                ))}
              </nav>

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-neutral-400">
                <span className="text-neutral-200 font-medium">
                  {isKo ? '한국센터글로벌네트워크 지식관리실' : 'Korean Center Global Network · Knowledge Lab'}
                </span>
                <span aria-hidden="true" className="text-neutral-600">
                  ·
                </span>
                <span className="tabular-nums">
                  {isKo ? '사업자등록번호 141-82-83410' : 'Reg. 141-82-83410'}
                </span>
                <span aria-hidden="true" className="text-neutral-600">
                  ·
                </span>
                <a
                  href="mailto:master@goguma.app"
                  className="font-mono text-neutral-300 hover:text-white transition-colors underline underline-offset-4 decoration-white/20 hover:decoration-white"
                >
                  master@goguma.app
                </a>
              </div>
            </div>

            {/* Right: Goguma Universe & Related Sites Listboxes */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
              <FooterLinkListbox
                id="goguma-universe"
                label={isKo ? '고구마 유니버스' : 'Goguma Universe'}
                links={localizedUniverseLinks}
                isOpen={openFooterListbox === 'universe'}
                onToggle={() =>
                  setOpenFooterListbox((prev) => (prev === 'universe' ? null : 'universe'))
                }
                onClose={() => setOpenFooterListbox(null)}
              />

              <FooterLinkListbox
                id="related-sites"
                label={isKo ? '관련 사이트' : 'Related Sites'}
                links={RELATED_SITE_LINKS}
                isOpen={openFooterListbox === 'related'}
                onToggle={() =>
                  setOpenFooterListbox((prev) => (prev === 'related' ? null : 'related'))
                }
                onClose={() => setOpenFooterListbox(null)}
              />
            </div>
          </div>

          {/* Quiet Copyright & Principles Row */}
          <div className="mt-8 pt-5 pb-[env(safe-area-inset-bottom)] border-t border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11.5px] text-neutral-400">
            <p className="tabular-nums">© 2026 Vibe Vault · MIT License</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{isKo ? '개인정보수집 없음' : 'No Data Collection'}</span>
              <span aria-hidden="true">·</span>
              <span>No Cookies</span>
              <span aria-hidden="true">·</span>
              <span>Zero-Knowledge Local Storage</span>
            </p>
          </div>
        </div>
      </footer>

      {/* Local Account Creation / Unlock Modal */}
      {accountModalMode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="local-account-modal-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) {
              setAccountModalMode(null);
            }
          }}
        >
          <div className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--surface-panel)] border border-[var(--surface-subtle-border)] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-7 shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-5 border-b border-white/[0.08]">
              <div className="space-y-1">
                <h2
                  id="local-account-modal-title"
                  className="text-lg font-semibold tracking-tight text-white"
                >
                  {accountModalMode === 'create'
                    ? isKo
                      ? '로컬 계정 만들기'
                      : 'Create Local Account'
                    : isKo
                      ? localProfile?.userName
                        ? `${localProfile.userName}님 로그인`
                        : '로컬 계정 로그인'
                      : localProfile?.userName
                        ? `Sign in as ${localProfile.userName}`
                        : 'Sign in to Local Vault'}
                </h2>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  {accountModalMode === 'create'
                    ? isKo
                      ? '입력한 정보는 서버로 전송되지 않으며, 이 기기 내부에만 암호화 저장됩니다.'
                      : 'Your details are never sent to any server and are encrypted strictly on this device.'
                    : localProfile?.pinName
                      ? isKo
                        ? `PIN 이름 · ${localProfile.pinName}`
                        : `PIN label · ${localProfile.pinName}`
                      : isKo
                        ? '설정한 4~6자리 마스터 PIN 번호를 입력해 로그인하세요.'
                        : 'Enter your 4–6 digit Master PIN to unlock your vault.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !isSubmitting && setAccountModalMode(null)}
                aria-label={isKo ? '닫기' : 'Close'}
                className="p-1.5 -mr-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {accountModalMode === 'create' ? (
              <form onSubmit={handleCreateAccountSubmit} className="pt-5 space-y-4">
                {/* 1. User Name */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="local-account-username"
                    className="block text-xs font-medium text-neutral-200"
                  >
                    {isKo ? '사용자 이름' : 'Display Name'}{' '}
                    <span className="text-neutral-500 font-normal">
                      {isKo ? '(필수)' : '(Required)'}
                    </span>
                  </label>
                  <input
                    ref={userNameInputRef}
                    id="local-account-username"
                    type="text"
                    maxLength={40}
                    autoComplete="off"
                    value={userName}
                    onChange={(e) => {
                      setUserName(e.target.value);
                      setFormError(null);
                    }}
                    placeholder={isKo ? '예: 김민수 또는 개인 별명' : 'e.g. Alex Kim'}
                    className="w-full h-11 px-3.5 rounded-xl bg-black/40 border border-white/[0.12] focus:border-white/40 focus:outline-none text-[16px] sm:text-sm text-white placeholder:text-neutral-400 transition-colors"
                  />
                </div>

                {/* 2. PIN Name */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="local-account-pin-name"
                    className="block text-xs font-medium text-neutral-200"
                  >
                    {isKo ? 'PIN 이름' : 'PIN Label'}{' '}
                    <span className="text-neutral-500 font-normal">
                      {isKo ? '(선택 · 구분용 라벨)' : '(Optional)'}
                    </span>
                  </label>
                  <input
                    id="local-account-pin-name"
                    type="text"
                    maxLength={40}
                    autoComplete="off"
                    value={pinName}
                    onChange={(e) => {
                      setPinName(e.target.value);
                      setFormError(null);
                    }}
                    placeholder={isKo ? '예: 메인 개인 금고 PIN' : 'e.g. Personal Main Vault'}
                    className="w-full h-11 px-3.5 rounded-xl bg-black/40 border border-white/[0.12] focus:border-white/40 focus:outline-none text-[16px] sm:text-sm text-white placeholder:text-neutral-400 transition-colors"
                  />
                </div>

                {/* 3. Master PIN */}
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <label
                      htmlFor="local-account-pin"
                      className="block text-xs font-medium text-neutral-200"
                    >
                      {isKo ? '마스터 PIN' : 'Master PIN'}{' '}
                      <span className="text-neutral-500 font-normal">
                        {isKo ? '(4~6자리 숫자)' : '(4–6 digits)'}
                      </span>
                    </label>
                    <span className="text-[11px] font-mono text-neutral-500 tabular-nums">
                      {pin.length}/6
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      id="local-account-pin"
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoComplete="new-password"
                      value={pin}
                      onChange={(e) => {
                        setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setFormError(null);
                      }}
                      placeholder={isKo ? '숫자 4~6자리 입력' : 'Enter 4–6 digits'}
                      className="w-full h-11 pl-3.5 pr-10 rounded-xl bg-black/40 border border-white/[0.12] focus:border-white/40 focus:outline-none text-[16px] sm:text-sm text-white placeholder:text-neutral-400 tracking-[0.2em] font-mono tabular-nums transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((prev) => !prev)}
                      aria-label={showPin ? (isKo ? 'PIN 숨기기' : 'Hide PIN') : (isKo ? 'PIN 표시' : 'Show PIN')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                      {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* 4. Confirm Master PIN */}
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <label
                      htmlFor="local-account-pin-confirm"
                      className="block text-xs font-medium text-neutral-200"
                    >
                      {isKo ? '마스터 PIN 확인' : 'Confirm Master PIN'}
                    </label>
                    <span className="text-[11px] font-mono text-neutral-500 tabular-nums">
                      {confirmPin.length}/6
                    </span>
                  </div>
                  <input
                    id="local-account-pin-confirm"
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoComplete="new-password"
                    value={confirmPin}
                    onChange={(e) => {
                      setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setFormError(null);
                    }}
                    placeholder={isKo ? '마스터 PIN 한 번 더 입력' : 'Re-enter Master PIN'}
                    className="w-full h-11 px-3.5 rounded-xl bg-black/40 border border-white/[0.12] focus:border-white/40 focus:outline-none text-[16px] sm:text-sm text-white placeholder:text-neutral-400 tracking-[0.2em] font-mono tabular-nums transition-colors"
                  />
                </div>

                {formError && (
                  <p role="alert" className="text-xs text-amber-300 font-medium pt-0.5">
                    {formError}
                  </p>
                )}

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setAccountModalMode(null)}
                    disabled={isSubmitting}
                    className="h-11 px-4 rounded-xl border border-white/[0.14] text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {isKo ? '취소' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-11 px-5 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--color-accent-hover)] disabled:bg-white/20 disabled:text-white/60 text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {isSubmitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <span>{isKo ? '로컬 계정 시작하기' : 'Create & Open Vault'}</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleUnlockAccountSubmit} className="pt-5 space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <label
                      htmlFor="local-account-unlock-pin"
                      className="block text-xs font-medium text-neutral-200"
                    >
                      {isKo ? '마스터 PIN 입력' : 'Enter Master PIN'}
                    </label>
                    <span className="text-[11px] font-mono text-neutral-400 tabular-nums">
                      {pin.length}/6
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      ref={unlockPinInputRef}
                      id="local-account-unlock-pin"
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoComplete="current-password"
                      value={pin}
                      onChange={(e) => {
                        setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setFormError(null);
                      }}
                      placeholder={isKo ? '4~6자리 숫자 입력' : 'Enter 4–6 digits'}
                      className="w-full h-11 pl-3.5 pr-11 rounded-xl bg-black/40 border border-white/[0.12] focus:border-white/40 focus:outline-none text-[16px] sm:text-sm text-white placeholder:text-neutral-400 tracking-[0.2em] font-mono tabular-nums transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((prev) => !prev)}
                      aria-label={showPin ? (isKo ? 'PIN 숨기기' : 'Hide PIN') : (isKo ? 'PIN 표시' : 'Show PIN')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                      {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {formError && (
                  <p role="alert" className="text-xs text-amber-300 font-medium">
                    {formError}
                  </p>
                )}

                {isBiometricSupported && isBiometricEnabled && (
                  <button
                    type="button"
                    onClick={handleBiometricUnlock}
                    disabled={isSubmitting}
                    className="w-full h-10 px-4 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.15] text-emerald-200 text-xs font-medium transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    <Fingerprint size={14} className="text-emerald-300" />
                    <span>{t('biometric_unlock')}</span>
                  </button>
                )}

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setAccountModalMode(null)}
                    disabled={isSubmitting}
                    className="h-11 px-4 rounded-xl border border-white/[0.14] text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {isKo ? '취소' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || pin.length < 4}
                    className="h-11 px-5 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--color-accent-hover)] disabled:bg-white/20 disabled:text-white/60 text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {isSubmitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <span>{isKo ? '로그인' : 'Sign In'}</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Guest Mode Exit Confirmation Modal */}
      <GuestExitConfirmModal
        isOpen={showGuestExitConfirm}
        onClose={() => setShowGuestExitConfirm(false)}
        setupPinLabel={isKo ? '로컬 계정 만들기' : 'Create Local Account'}
        onSetupPin={() => {
          setShowGuestExitConfirm(false);
          openCreateAccountModal();
        }}
        onConfirmExit={() => {
          setShowGuestExitConfirm(false);
          handleLogout();
        }}
      />

      {/* Policy & License Viewer Modal (Lazy-loaded on demand) */}
      {legalModalOpen && (
        <LazyErrorBoundary>
          <Suspense fallback={null}>
            <LegalNoticeModal
              isOpen={legalModalOpen}
              onClose={() => setLegalModalOpen(false)}
              initialTab={legalModalTab}
            />
          </Suspense>
        </LazyErrorBoundary>
      )}
    </div>
  );
};

export const WelcomePage = WelcomeDashboardModal;
export default WelcomeDashboardModal;
