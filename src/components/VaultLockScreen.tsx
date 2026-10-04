import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Lock, 
  Unlock, 
  Shield, 
  KeyRound, 
  AlertCircle, 
  Sparkles, 
  Delete, 
  Check, 
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { 
  isVaultLocked, 
  hasVaultPin, 
  unlockVault, 
  setVaultPin, 
  lockVault 
} from '../vaultSecurity';

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
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-2xl animate-in fade-in duration-200 select-none overflow-y-auto"
    >
      <div
        className={`w-full max-w-sm rounded-3xl border border-white/10 bg-[#0B0F17]/95 p-6 sm:p-7 shadow-2xl text-center space-y-5 transition-transform ${
          shake ? 'animate-bounce duration-200' : ''
        }`}
      >
        {/* Shield & Lock Header Visual */}
        <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
          <div className="absolute inset-0 rounded-2xl bg-emerald-500/20 blur-xl animate-pulse" />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-b from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
            {!isPinSet ? (
              <KeyRound size={28} className="text-emerald-400 stroke-[2.2]" />
            ) : (
              <Lock size={28} className="text-emerald-400 stroke-[2.2]" />
            )}
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-1.5">
          {!isPinSet ? (
            <>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center justify-center gap-1.5">
                <span>마스터 보안 PIN 설정</span>
                <Sparkles size={16} className="text-emerald-400" />
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                {setupStep === 'create'
                  ? '금고 및 가계부 기록을 영구 암호화 보관할 4~6자리 마스터 PIN을 설정하세요.'
                  : '확인을 위해 동일한 PIN 번호를 다시 입력해주세요.'}
              </p>
              <div className="py-1 px-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 font-medium inline-block">
                ⚠️ PIN 미설정 시 세션 종료와 함께 데이터가 초기화됩니다.
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center justify-center gap-2">
                <span>Vibe Vault 보호 중</span>
                <Shield size={16} className="text-emerald-400" />
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                자산 및 장부 데이터가 <span className="text-emerald-400 font-semibold">AES-GCM-256</span>으로 잠겨 있습니다.
              </p>
            </>
          )}
        </div>

        {/* PIN Dot Indicators */}
        <div className="flex items-center justify-center gap-3 py-2">
          {[0, 1, 2, 3, 4, 5].map((idx) => {
            const isFilled = idx < activeInput.length;
            return (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                  isFilled
                    ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] scale-110'
                    : 'bg-white/10 border border-white/20'
                }`}
              />
            );
          })}
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-rose-400 animate-in fade-in duration-150">
            <AlertCircle size={13} className="shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        )}

        {/* Interactive Numeric Touch Keypad */}
        <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto pt-1">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleKeypadPress(digit)}
              className="h-12 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] active:bg-emerald-500/20 text-white font-medium text-lg border border-white/5 transition-all active:scale-95 flex items-center justify-center shadow-xs"
            >
              {digit}
            </button>
          ))}

          {/* Clear Key */}
          <button
            type="button"
            onClick={() => handleKeypadPress('clear')}
            className="h-12 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] active:bg-white/10 text-slate-400 text-xs font-semibold border border-white/5 transition-all active:scale-95 flex items-center justify-center"
          >
            C
          </button>

          {/* Digit 0 */}
          <button
            type="button"
            onClick={() => handleKeypadPress('0')}
            className="h-12 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] active:bg-emerald-500/20 text-white font-medium text-lg border border-white/5 transition-all active:scale-95 flex items-center justify-center shadow-xs"
          >
            0
          </button>

          {/* Backspace Key */}
          <button
            type="button"
            onClick={() => handleKeypadPress('backspace')}
            className="h-12 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] active:bg-white/10 text-slate-400 border border-white/5 transition-all active:scale-95 flex items-center justify-center"
            aria-label="지우기"
          >
            <Delete size={18} />
          </button>
        </div>

        {/* Primary Action Button */}
        <div className="space-y-2 pt-1">
          {!isPinSet ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleCompleteSetup}
                disabled={activeInput.length < 4 || isSubmitting}
                className="w-full py-3 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
              >
                {setupStep === 'create' ? (
                  <>
                    <span>PIN 확인 단계로 이동</span>
                    <ArrowRight size={14} />
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>마스터 PIN 생성 및 금고 활성화</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSkipSetup}
                className="w-full py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                나중에 설정하기 (게스트 모드 · 세션 종료 시 초기화)
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleAttemptUnlock(pin)}
              disabled={pin.length < 4 || isSubmitting}
              className="w-full py-3 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
            >
              <Unlock size={15} />
              <span>{isSubmitting ? '잠금 해제 중...' : '금고 잠금 해제 (Unlock)'}</span>
            </button>
          )}
        </div>

        {/* Security badge footer */}
        <div className="pt-2 border-t border-white/5 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <Sparkles size={11} className="text-emerald-400" />
          <span>Zero-Knowledge Local At-Rest AES-GCM-256</span>
        </div>
      </div>
    </div>
  );
};
