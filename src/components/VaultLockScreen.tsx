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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-2xl animate-in fade-in duration-300 select-none overflow-hidden"
    >
      <div
        className={`w-full max-w-sm h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col justify-between px-6 py-6 sm:h-auto sm:max-h-[620px] sm:rounded-3xl sm:border sm:border-white/[0.08] bg-[#0A0D14]/95 text-center transition-all ${
          shake ? 'animate-bounce duration-200' : ''
        }`}
      >
        {/* Compact Hero */}
        <div className="pt-1">
          <div className="w-10 h-10 mb-2 mx-auto rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)] text-base">
            ✦
          </div>

          {!isPinSet ? (
            <>
              <h2 className="text-lg font-light text-white tracking-tight">
                {setupStep === 'create' ? '프라이빗 금고 시작하기' : 'PIN 번호 확인'}
              </h2>
              <p className="text-[11px] text-neutral-400 mt-0.5 font-light leading-relaxed break-keep">
                {setupStep === 'create'
                  ? '기기 내부에 암호화 보관될 4~6자리 마스터 PIN을 설정하세요'
                  : '확인을 위해 동일한 PIN 번호를 다시 입력해주세요'}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-light text-white tracking-tight">
                Vibe Vault
              </h2>
              <p className="text-[11px] text-neutral-400 mt-0.5 font-light leading-relaxed break-keep">
                자산 및 장부 데이터를 확인하려면 PIN 번호를 입력하세요
              </p>
            </>
          )}

          {/* PIN Dots */}
          <div className="my-3 flex justify-center gap-2.5">
            {[0, 1, 2, 3, 4, 5].map((idx) => {
              const isFilled = idx < activeInput.length;
              return (
                <div
                  key={idx}
                  className={
                    isFilled
                      ? 'w-3 h-3 rounded-full bg-emerald-400 border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)] scale-110 transition-all duration-200'
                      : 'w-3 h-3 rounded-full border border-white/20 transition-all duration-200'
                  }
                />
              );
            })}
          </div>

          {/* Error message */}
          {error && (
            <div className="text-[11px] text-rose-400 font-light animate-in fade-in duration-150">
              {error}
            </div>
          )}
        </div>

        {/* Compact Keypad Grid */}
        <div className="grid grid-cols-3 gap-2.5 max-w-[220px] mx-auto my-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleKeypadPress(digit)}
              className="w-14 h-14 rounded-2xl text-lg font-light bg-white/[0.04] active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none hover:bg-white/[0.08] border border-white/[0.06] text-white"
            >
              {digit}
            </button>
          ))}

          {/* Clear Key */}
          <button
            type="button"
            onClick={() => handleKeypadPress('clear')}
            aria-label="입력 전체 지우기"
            className="w-14 h-14 rounded-2xl text-xs font-normal text-neutral-400 hover:text-white bg-white/[0.02] active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none border border-white/[0.04]"
          >
            C
          </button>

          {/* Digit 0 */}
          <button
            type="button"
            onClick={() => handleKeypadPress('0')}
            className="w-14 h-14 rounded-2xl text-lg font-light bg-white/[0.04] active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none hover:bg-white/[0.08] border border-white/[0.06] text-white"
          >
            0
          </button>

          {/* Backspace Key */}
          <button
            type="button"
            onClick={() => handleKeypadPress('backspace')}
            className="w-14 h-14 rounded-2xl text-base font-light text-neutral-400 hover:text-white bg-white/[0.02] active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none border border-white/[0.04]"
            aria-label="지우기"
          >
            ←
          </button>
        </div>

        {/* Footer Action */}
        <div className="w-full max-w-[260px] mx-auto space-y-1.5 pt-1">
          {!isPinSet ? (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={handleCompleteSetup}
                disabled={activeInput.length < 4 || isSubmitting}
                className="w-full py-2.5 text-sm rounded-xl bg-white hover:bg-neutral-200 text-black font-medium transition-all shadow-lg shadow-white/5 active:scale-[0.99] disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center justify-center"
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
                  className="w-full text-xs text-neutral-400 hover:text-white transition-colors py-1 cursor-pointer"
                >
                  이전 단계로 돌아가기
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSkipSetup}
                  className="w-full text-xs text-neutral-400 hover:text-white transition-colors py-1 cursor-pointer"
                >
                  나중에 설정하기 (게스트 모드)
                </button>
              )}

              <p className="text-[10px] text-neutral-500 mt-2 text-center">
                온디바이스 로컬 금고 ·{' '}
                <button
                  type="button"
                  onClick={() => setLegalOpen(true)}
                  className="underline hover:text-neutral-400 transition-colors cursor-pointer"
                >
                  법적 고지 및 면책
                </button>
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => handleAttemptUnlock(pin)}
                disabled={pin.length < 4 || isSubmitting}
                className="w-full py-2.5 text-sm rounded-xl bg-white hover:bg-neutral-200 text-black font-medium transition-all shadow-lg shadow-white/5 active:scale-[0.99] disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center justify-center"
              >
                {isSubmitting ? '잠금 해제 중...' : '잠금 해제'}
              </button>

              <p className="text-[10px] text-neutral-500 mt-2 text-center">
                온디바이스 로컬 금고 ·{' '}
                <button
                  type="button"
                  onClick={() => setLegalOpen(true)}
                  className="underline hover:text-neutral-400 transition-colors cursor-pointer"
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
