import React, { useState, useEffect, useCallback } from 'react';
import { Fingerprint } from 'lucide-react';
import { 
  isVaultLocked, 
  hasVaultPin, 
  unlockVault, 
  setVaultPin 
} from '../vaultSecurity';
import { LegalNoticeModal } from './LegalNoticeModal';
import { OnboardingModal } from './OnboardingModal';

interface VaultLockScreenProps {
  onUnlocked?: () => void;
  onGuestMode?: () => void;
}

export const VaultLockScreen: React.FC<VaultLockScreenProps> = ({ 
  onUnlocked,
  onGuestMode 
}) => {
  const [locked, setLocked] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    return isVaultLocked() || (!hasVaultPin() && !sessionStorage.getItem('vibe_vault_setup_skipped'));
  });

  const [isPinSet, setIsPinSet] = useState<boolean>(() => hasVaultPin());
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    const isSetup = !hasVaultPin();
    const completed = localStorage.getItem('vibe_onboarding_completed') === 'true';
    return isSetup && !completed;
  });
  const [pin, setPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [setupStep, setSetupStep] = useState<'create' | 'confirm'>('create');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [shake, setShake] = useState<boolean>(false);
  const [isLegalNoticeOpen, setIsLegalNoticeOpen] = useState<boolean>(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState<boolean>(false);

  const isSetupMode = !isPinSet;

  // Check WebAuthn platform authenticator availability
  useEffect(() => {
    if (
      typeof window !== 'undefined' && 
      window.PublicKeyCredential && 
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    ) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then((available) => setIsBiometricAvailable(available))
        .catch(() => setIsBiometricAvailable(false));
    }
  }, []);

  // Sync state on custom event and mount
  useEffect(() => {
    const handleLockEvent = (e: Event) => {
      const custom = e as CustomEvent<{ isLocked: boolean }>;
      const isNowLocked = custom.detail?.isLocked ?? isVaultLocked();
      const pinConfigured = hasVaultPin();
      setIsPinSet(pinConfigured);
      setLocked(isNowLocked || (!pinConfigured && !sessionStorage.getItem('vibe_vault_setup_skipped')));
      setPin('');
      setConfirmPin('');
      setSetupStep('create');
      setError(null);
    };

    window.addEventListener('vault-lock-state-changed', handleLockEvent);

    // Initial check
    const pinConfigured = hasVaultPin();
    setIsPinSet(pinConfigured);
    if (!pinConfigured && !sessionStorage.getItem('vibe_vault_setup_skipped')) {
      setLocked(true);
    }

    return () => {
      window.removeEventListener('vault-lock-state-changed', handleLockEvent);
    };
  }, []);

  const triggerShake = useCallback((errMsg: string) => {
    setError(errMsg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }, []);

  // Unlock attempt handler
  const handleAttemptUnlock = useCallback(async (candidatePin: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await unlockVault(candidatePin);
      if (res.success) {
        setLocked(false);
        setPin('');
        if (onUnlocked) onUnlocked();
      } else {
        triggerShake(res.error || '올바르지 않은 PIN 번호입니다.');
        setPin('');
      }
    } catch (err: any) {
      triggerShake(err.message || '금고 잠금 해제 중 오류가 발생했습니다.');
      setPin('');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, onUnlocked, triggerShake]);

  // Handle PIN Setup completion
  const handleCompleteSetup = useCallback(async () => {
    if (setupStep === 'create') {
      if (pin.length < 4 || pin.length > 6) {
        triggerShake('PIN 번호는 4~6자리 숫자로 입력해주세요.');
        return;
      }
      setSetupStep('confirm');
      setError(null);
      return;
    }

    // Confirm step
    if (confirmPin !== pin) {
      triggerShake('PIN 번호가 일치하지 않습니다. 다시 입력해주세요.');
      setConfirmPin('');
      return;
    }

    setIsSubmitting(true);
    try {
      await setVaultPin(pin);
      setIsPinSet(true);
      setLocked(false);
      setPin('');
      setConfirmPin('');
      sessionStorage.setItem('vibe_vault_setup_skipped', 'true');
      if (onUnlocked) onUnlocked();
    } catch (err: any) {
      triggerShake(err.message || 'PIN 설정 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }, [confirmPin, onUnlocked, pin, setupStep, triggerShake]);

  // Guest mode handler (Skip setup or proceed without PIN lock)
  const handleGuestMode = useCallback(() => {
    sessionStorage.setItem('vibe_vault_setup_skipped', 'true');
    unlockVault().catch(() => {});
    setLocked(false);
    if (onGuestMode) {
      onGuestMode();
    }
    if (onUnlocked) {
      onUnlocked();
    }
  }, [onGuestMode, onUnlocked]);

  // Biometric Unlock Trigger (WebAuthn Platform Authenticator)
  const handleBiometricUnlock = useCallback(async () => {
    if (isSubmitting) return;
    try {
      if (typeof window === 'undefined' || !navigator.credentials) {
        triggerShake('현재 기기에서 생체 인증을 지원하지 않습니다.');
        return;
      }

      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const credential = await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'preferred'
        }
      }).catch(() => null);

      if (credential) {
        const res = await unlockVault();
        if (res.success) {
          setLocked(false);
          setPin('');
          if (onUnlocked) onUnlocked();
          return;
        }
      }
      triggerShake('생체 인증이 완료되지 않았습니다. PIN 번호를 입력해주세요.');
    } catch (err: any) {
      triggerShake('생체 인증 실패: PIN 번호로 잠금을 해제해주세요.');
    }
  }, [isSubmitting, onUnlocked, triggerShake]);

  // On-screen keypad button click
  const handleKeypadPress = (val: string) => {
    if (isSubmitting) return;

    if (!isPinSet) {
      // Setup Mode
      if (setupStep === 'create') {
        if (val === 'backspace') {
          setPin(prev => prev.slice(0, -1));
        } else if (val === 'clear') {
          setPin('');
        } else if (pin.length < 6 && /^\d$/.test(val)) {
          setPin(prev => prev + val);
        }
      } else {
        // Confirm Step
        if (val === 'backspace') {
          setConfirmPin(prev => prev.slice(0, -1));
        } else if (val === 'clear') {
          setConfirmPin('');
        } else if (confirmPin.length < 6 && /^\d$/.test(val)) {
          const next = confirmPin + val;
          setConfirmPin(next);
          if (next.length === pin.length) {
            setTimeout(() => {
              if (next === pin) {
                setVaultPin(pin)
                  .then(() => {
                    setIsPinSet(true);
                    setLocked(false);
                    sessionStorage.setItem('vibe_vault_setup_skipped', 'true');
                    if (onUnlocked) onUnlocked();
                  })
                  .catch((e) => triggerShake(e.message));
              } else {
                triggerShake('PIN 번호가 일치하지 않습니다.');
                setConfirmPin('');
              }
            }, 100);
          }
        }
      }
    } else {
      // Unlock Mode
      if (val === 'backspace') {
        setPin(prev => prev.slice(0, -1));
      } else if (val === 'clear') {
        setPin('');
      } else if (pin.length < 6 && /^\d$/.test(val)) {
        const next = pin + val;
        setPin(next);
        if (next.length === 6) {
          handleAttemptUnlock(next);
        }
      }
    }
  };

  // Physical keyboard support
  useEffect(() => {
    if (!locked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKeypadPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleKeypadPress('backspace');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleKeypadPress('clear');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!isPinSet) {
          handleCompleteSetup();
        } else if (pin.length >= 4) {
          handleAttemptUnlock(pin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmPin, handleAttemptUnlock, handleCompleteSetup, isPinSet, locked, pin, setupStep]);

  if (!locked) {
    return null;
  }

  const activeInput = !isPinSet && setupStep === 'confirm' ? confirmPin : pin;

  return (
    <div
      id="vault-lock-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-300 select-none"
    >
      <div
        className={`w-full max-w-[320px] bg-[#090A0D] border border-white/[0.08] rounded-3xl p-5 shadow-2xl flex flex-col justify-between my-auto transition-all ${
          shake ? 'animate-bounce duration-200' : ''
        }`}
      >
        {/* 1. Streamlined Top Header */}
        <div className="text-center mb-4">
          <h1 className="text-base font-bold tracking-tight text-white">Vibe Vault</h1>
          <p className="text-xs text-neutral-300 font-normal mt-1">
            {isSetupMode 
              ? (setupStep === 'confirm' ? '확인을 위해 동일한 PIN 번호를 다시 입력해주세요' : '마스터 PIN을 설정해주세요 (4~6자리)')
              : '마스터 PIN을 입력해주세요'}
          </p>

          {/* Compact PIN Dots */}
          <div className="flex justify-center items-center gap-2 my-2.5 mx-auto w-fit">
            {[0, 1, 2, 3, 4, 5].map((idx) => {
              const isFilled = idx < activeInput.length;
              return (
                <div
                  key={idx}
                  className={
                    isFilled
                      ? 'w-2 h-2 rounded-full bg-white border border-white shadow-[0_0_8px_rgba(255,255,255,0.4)] transition-all'
                      : 'w-2 h-2 rounded-full border border-white/25 bg-white/[0.04] transition-all'
                  }
                />
              );
            })}
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-[11px] text-neutral-300 font-light mt-1 animate-in fade-in duration-150">
              {error}
            </div>
          )}
        </div>

        {/* 2. Tactile Numeric Keypad Grid (3x4) */}
        <div className="w-full flex flex-col items-center">
          <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto w-full">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleKeypadPress(digit)}
                className="h-12 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.06] text-white text-lg font-medium transition-all active:scale-95 flex items-center justify-center cursor-pointer select-none"
              >
                {digit}
              </button>
            ))}

            {/* Clear Key */}
            <button
              type="button"
              onClick={() => handleKeypadPress('clear')}
              aria-label="입력 전체 지우기"
              className="h-12 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.06] text-neutral-300 hover:text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center cursor-pointer select-none"
            >
              C
            </button>

            {/* Digit 0 */}
            <button
              type="button"
              onClick={() => handleKeypadPress('0')}
              className="h-12 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.06] text-white text-lg font-medium transition-all active:scale-95 flex items-center justify-center cursor-pointer select-none"
            >
              0
            </button>

            {/* Backspace Key */}
            <button
              type="button"
              onClick={() => handleKeypadPress('backspace')}
              aria-label="지우기"
              className="h-12 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.06] text-neutral-300 hover:text-white text-base font-medium transition-all active:scale-95 flex items-center justify-center cursor-pointer select-none"
            >
              ←
            </button>
          </div>

          {/* Biometric Unlock Option (if supported on platform) */}
          {isPinSet && isBiometricAvailable && (
            <button
              type="button"
              onClick={handleBiometricUnlock}
              className="mt-2.5 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-[11px] text-neutral-300 hover:text-white transition-all cursor-pointer mx-auto"
            >
              <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
              <span>생체 인증(지문/Face ID)으로 해제</span>
            </button>
          )}

          {/* 3. Compressed Action & Guest Mode Link */}
          <div className="w-full max-w-[260px] mx-auto">
            {!isPinSet ? (
              <>
                <button
                  type="button"
                  onClick={handleCompleteSetup}
                  disabled={activeInput.length < 4 || isSubmitting}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold bg-white text-black hover:bg-neutral-200 transition-all active:scale-95 mt-3 disabled:bg-white/[0.08] disabled:text-neutral-400 disabled:border-white/[0.06] disabled:pointer-events-none border border-transparent shadow-xs cursor-pointer flex items-center justify-center"
                >
                  {setupStep === 'create' ? 'PIN 확인 단계로 이동' : '마스터 PIN 설정 완료'}
                </button>

                {setupStep === 'confirm' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSetupStep('create');
                      setConfirmPin('');
                      setError(null);
                    }}
                    className="text-xs text-neutral-300 hover:text-white transition-colors mt-2 block mx-auto underline underline-offset-4 cursor-pointer"
                  >
                    이전 단계로 돌아가기
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onGuestMode || handleGuestMode}
                    className="text-xs text-neutral-300 hover:text-white transition-colors mt-2 block mx-auto underline underline-offset-4 cursor-pointer"
                  >
                    나중에 설정하기 (게스트 모드)
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleAttemptUnlock(pin)}
                  disabled={pin.length < 4 || isSubmitting}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold bg-white text-black hover:bg-neutral-200 transition-all active:scale-95 mt-3 disabled:bg-white/[0.08] disabled:text-neutral-400 disabled:border-white/[0.06] disabled:pointer-events-none border border-transparent shadow-xs cursor-pointer flex items-center justify-center"
                >
                  {isSubmitting ? '잠금 해제 중...' : '잠금 해제'}
                </button>

                <button
                  type="button"
                  onClick={onGuestMode || handleGuestMode}
                  className="text-xs text-neutral-300 hover:text-white transition-colors mt-2 block mx-auto underline underline-offset-4 cursor-pointer"
                >
                  나중에 설정하기 (게스트 모드)
                </button>
              </>
            )}
          </div>
        </div>

        {/* 4. Minimal Footer & Credits */}
        <div className="w-full flex flex-col items-center mt-1">
          <div className="my-2.5 border-t border-white/[0.04] w-full" />
          
          <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-300">
            <button 
              type="button" 
              onClick={() => setShowOnboarding(true)} 
              className="hover:text-white transition-colors cursor-pointer"
            >
              기능 다시보기
            </button>
            <span className="text-neutral-500">·</span>
            <button 
              type="button" 
              onClick={() => setIsLegalNoticeOpen(true)} 
              className="hover:text-white transition-colors cursor-pointer"
            >
              개인정보취급방침
            </button>
          </div>

          <p className="text-[10px] text-neutral-400 text-center mt-1.5 leading-normal">
            © 2026 한국센터글로벌네트워크 지식관리실
          </p>
        </div>
      </div>

      <OnboardingModal 
        isOpen={showOnboarding} 
        onClose={() => setShowOnboarding(false)} 
      />

      <LegalNoticeModal 
        isOpen={isLegalNoticeOpen} 
        onClose={() => setIsLegalNoticeOpen(false)} 
      />
    </div>
  );
};
