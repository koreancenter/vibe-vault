import React, { useState, useEffect, useCallback } from 'react';
import { 
  isVaultLocked, 
  hasVaultPin, 
  unlockVault, 
  setVaultPin 
} from '../vaultSecurity';
import { LegalNoticeModal } from './LegalNoticeModal';

interface VaultLockScreenProps {
  onUnlocked?: () => void;
}

export const VaultLockScreen: React.FC<VaultLockScreenProps> = ({ onUnlocked }) => {
  const [locked, setLocked] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    return isVaultLocked() || (!hasVaultPin() && !sessionStorage.getItem('vibe_vault_setup_skipped'));
  });

  const [isPinSet, setIsPinSet] = useState<boolean>(() => hasVaultPin());
  const [pin, setPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [setupStep, setSetupStep] = useState<'create' | 'confirm'>('create');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [shake, setShake] = useState<boolean>(false);
  const [legalOpen, setLegalOpen] = useState<boolean>(false);

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

  // Skip PIN setup for this session
  const handleSkipSetup = () => {
    sessionStorage.setItem('vibe_vault_setup_skipped', 'true');
    unlockVault().catch(() => {});
    setLocked(false);
    if (onUnlocked) onUnlocked();
  };

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
            // Auto submit confirmation
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
        // Auto attempt unlock when reaching 4 to 6 digits
        if (next.length >= 4) {
          // If 6 digits or candidate matches, try unlock
          if (next.length === 6) {
            handleAttemptUnlock(next);
          }
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#090A0D] sm:bg-black/90 backdrop-blur-2xl animate-in fade-in duration-300 select-none overflow-y-auto p-3 sm:p-4"
    >
      <div
        className={`w-full max-w-[320px] sm:max-w-sm text-center transition-all px-2 py-2 sm:px-6 sm:py-5 flex flex-col items-center my-auto bg-transparent border-0 shadow-none sm:border sm:border-white/[0.08] sm:bg-[#0A0D14]/95 sm:shadow-2xl sm:rounded-3xl ${
          shake ? 'animate-bounce duration-200' : ''
        }`}
      >
        {/* Compact Header (Badge removed as requested) */}
        <div className="w-full flex flex-col items-center pt-0.5 sm:pt-1">
          {!isPinSet ? (
            <>
              <h2 className="text-fluid-title font-light text-white tracking-tight h-[31.7969px] flex items-center justify-center">
                {setupStep === 'create' ? '프라이빗 금고 시작하기' : 'PIN 번호 확인'}
              </h2>
              <p className="text-fluid-caption text-neutral-400 mt-0.5 font-light leading-snug break-keep px-2 h-[22.375px]">
                {setupStep === 'create'
                  ? '기기 내부에 암호화 보관될 4~6자리 마스터 PIN을 설정하세요'
                  : '확인을 위해 동일한 PIN 번호를 다시 입력해주세요'}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-fluid-title font-light text-white tracking-tight h-[31.7969px] flex items-center justify-center">
                Vibe Vault
              </h2>
              <p className="text-fluid-caption text-neutral-400 mt-0.5 font-light leading-snug break-keep px-2 h-[22.375px]">
                자산 및 장부 데이터를 확인하려면 PIN 번호를 입력하세요
              </p>
            </>
          )}

          {/* PIN Dots */}
          <div className="mt-2 sm:mt-2.5 flex justify-center gap-2 sm:gap-2.5 h-[27px] items-center">
            {[0, 1, 2, 3, 4, 5].map((idx) => {
              const isFilled = idx < activeInput.length;
              return (
                <div
                  key={idx}
                  className={
                    isFilled
                      ? 'w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-400 border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)] scale-110 transition-all duration-200'
                      : 'w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border border-white/20 transition-all duration-200'
                  }
                />
              );
            })}
          </div>

          {/* Error message */}
          {error && (
            <div className="text-fluid-caption text-rose-400 font-light mt-1 animate-in fade-in duration-150">
              {error}
            </div>
          )}
        </div>

        {/* Viewport-Height Calibrated Keypad Grid (Reduced top padding, vh-scaled gaps) */}
        <div className="grid grid-cols-3 gap-y-[clamp(0.25rem,1.1dvh,0.5rem)] gap-x-[clamp(0.375rem,2vw,0.625rem)] max-w-[210px] sm:max-w-[230px] mx-auto mt-2 mb-2 sm:mt-2.5 sm:mb-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleKeypadPress(digit)}
              className="w-[clamp(2.5rem,6.2dvh,3.25rem)] h-[clamp(2.5rem,6.2dvh,3.25rem)] rounded-xl sm:rounded-2xl text-fluid-title font-light bg-white/[0.04] active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none hover:bg-white/[0.08] border border-white/[0.06] text-white"
            >
              {digit}
            </button>
          ))}

          {/* Clear Key */}
          <button
            type="button"
            onClick={() => handleKeypadPress('clear')}
            aria-label="입력 전체 지우기"
            className="w-[clamp(2.5rem,6.2dvh,3.25rem)] h-[clamp(2.5rem,6.2dvh,3.25rem)] rounded-xl sm:rounded-2xl text-fluid-caption font-normal text-neutral-400 hover:text-white bg-white/[0.02] active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none border border-white/[0.04]"
          >
            C
          </button>

          {/* Digit 0 */}
          <button
            type="button"
            onClick={() => handleKeypadPress('0')}
            className="w-[clamp(2.5rem,6.2dvh,3.25rem)] h-[clamp(2.5rem,6.2dvh,3.25rem)] rounded-xl sm:rounded-2xl text-fluid-title font-light bg-white/[0.04] active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none hover:bg-white/[0.08] border border-white/[0.06] text-white"
          >
            0
          </button>

          {/* Backspace Key */}
          <button
            type="button"
            onClick={() => handleKeypadPress('backspace')}
            className="w-[clamp(2.5rem,6.2dvh,3.25rem)] h-[clamp(2.5rem,6.2dvh,3.25rem)] rounded-xl sm:rounded-2xl text-fluid-body font-light text-neutral-400 hover:text-white bg-white/[0.02] active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none border border-white/[0.04]"
            aria-label="지우기"
          >
            ←
          </button>
        </div>

        {/* Footer Action */}
        <div className="w-full max-w-[230px] sm:max-w-[250px] mx-auto space-y-1 sm:space-y-1.5">
          {!isPinSet ? (
            <div className="space-y-1 sm:space-y-1.5 h-[80.2344px] pl-0">
              <button
                type="button"
                onClick={handleCompleteSetup}
                disabled={activeInput.length < 4 || isSubmitting}
                className="w-full py-1.5 sm:py-2 text-fluid-body rounded-xl bg-white hover:bg-neutral-200 text-black font-medium transition-all shadow-lg shadow-white/5 active:scale-[0.99] disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center justify-center"
              >
                {setupStep === 'create'
                  ? 'PIN 확인 단계로 이동'
                  : '마스터 PIN 설정 완료'}
              </button>

              {setupStep === 'confirm' ? (
                <button
                  type="button"
                  onClick={() => {
                    setSetupStep('create');
                    setConfirmPin('');
                    setError(null);
                  }}
                  className="w-full text-fluid-caption text-neutral-400 hover:text-white transition-colors py-0.5 cursor-pointer h-[32.3906px] flex items-center justify-center"
                >
                  이전 단계로 돌아가기
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSkipSetup}
                  className="w-full text-fluid-caption text-neutral-400 hover:text-white transition-colors py-0.5 cursor-pointer h-[32.3906px] flex items-center justify-center"
                >
                  나중에 설정하기 (게스트 모드)
                </button>
              )}

              <p className="text-[10px] sm:text-[11px] text-neutral-400 mt-0.5 text-center">
                온디바이스 로컬 금고 ·{' '}
                <button
                  type="button"
                  onClick={() => setLegalOpen(true)}
                  className="underline hover:text-white transition-colors cursor-pointer"
                >
                  법적 고지 및 면책
                </button>
              </p>
            </div>
          ) : (
            <div className="space-y-1 sm:space-y-1.5 h-[80.2344px] pl-0">
              <button
                type="button"
                onClick={() => handleAttemptUnlock(pin)}
                disabled={pin.length < 4 || isSubmitting}
                className="w-full py-1.5 sm:py-2 text-fluid-body rounded-xl bg-white hover:bg-neutral-200 text-black font-medium transition-all shadow-lg shadow-white/5 active:scale-[0.99] disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center justify-center"
              >
                {isSubmitting ? '잠금 해제 중...' : '잠금 해제'}
              </button>

              <p className="text-[10px] sm:text-[11px] text-neutral-400 mt-0.5 text-center">
                온디바이스 로컬 금고 ·{' '}
                <button
                  type="button"
                  onClick={() => setLegalOpen(true)}
                  className="underline hover:text-white transition-colors cursor-pointer"
                >
                  법적 고지 및 면책
                </button>
              </p>
            </div>
          )}
        </div>
      </div>

      <LegalNoticeModal isOpen={legalOpen} onClose={() => setLegalOpen(false)} />
    </div>
  );
};
