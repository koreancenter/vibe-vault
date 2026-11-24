import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Eye, EyeOff, Fingerprint, Loader2, X } from 'lucide-react';
import { useI18n } from '../i18n';
import {
  setVaultPin,
  unlockVault,
  saveLocalVaultProfile,
  type LocalVaultProfile,
  authenticateBiometricUnlock,
} from '../vaultSecurity';

interface LocalVaultAuthModalProps {
  mode: 'create' | 'unlock' | null;
  profile: LocalVaultProfile | null;
  biometricReady: boolean;
  onClose: () => void;
  onAuthenticated: (profile: LocalVaultProfile | null, pinCreated: boolean) => void;
}

const INPUT = 'w-full h-11 px-3.5 rounded-xl bg-[#0B0D12] border border-white/[0.14] text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[var(--color-accent)]';
const BTN_PRI = 'h-11 px-5 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0';
const BTN_SEC = 'h-11 px-4 rounded-xl border border-white/[0.16] bg-white/[0.04] hover:bg-white/[0.09] text-neutral-100 hover:text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0';
const digitsOnly = (v: string) => v.replace(/\D/g, '').slice(0, 6);

export const LocalVaultAuthModal: React.FC<LocalVaultAuthModalProps> = ({
  mode, profile, biometricReady, onClose, onAuthenticated,
}) => {
  const { t, language } = useI18n();
  const isKo = language === 'ko';
  const [form, setForm] = useState({ userName: '', pinName: '', pin: '', confirmPin: '' });
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const unlockRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!mode) return;
    setForm({ userName: profile?.userName || '', pinName: profile?.pinName || '', pin: '', confirmPin: '' });
    setShowPin(false);
    setError(null);
    const timer = setTimeout(() => (mode === 'create' ? nameRef : unlockRef).current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(timer); window.removeEventListener('keydown', onKey); };
  }, [mode, profile, busy, onClose]);

  if (!mode) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === 'create') {
      const name = form.userName.trim();
      if (!name) return setError(isKo ? '사용자 이름을 입력해 주세요.' : 'Please enter a display name.');
      if (form.pin.length < 4 || form.pin.length > 6) return setError(isKo ? '마스터 PIN은 4~6자리 숫자여야 합니다.' : 'PIN must be 4–6 digits.');
      if (form.pin !== form.confirmPin) return setError(isKo ? 'PIN 확인 번호가 일치하지 않습니다.' : 'PINs do not match.');
      setBusy(true); setError(null);
      try {
        await setVaultPin(form.pin);
        const saved = saveLocalVaultProfile({ userName: name, pinName: form.pinName.trim() || (isKo ? '마스터 PIN' : 'Master PIN') });
        onAuthenticated(saved, true);
      } catch (err) {
        setError(err instanceof Error ? err.message : (isKo ? '계정 생성 오류' : 'Account creation failed.'));
      } finally { setBusy(false); }
    } else {
      if (form.pin.length < 4) return setError(isKo ? '4~6자리 PIN을 입력해 주세요.' : 'Enter your 4–6 digit PIN.');
      setBusy(true); setError(null);
      try {
        const res = await unlockVault(form.pin);
        if (res.success) onAuthenticated(profile, false);
        else { setError(res.error || (isKo ? '올바르지 않은 PIN 번호입니다.' : 'Incorrect PIN.')); setForm((f) => ({ ...f, pin: '' })); }
      } catch (err) {
        setError(err instanceof Error ? err.message : (isKo ? '잠금 해제 실패' : 'Unlock failed.'));
        setForm((f) => ({ ...f, pin: '' }));
      } finally { setBusy(false); }
    }
  };

  const handleBio = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await authenticateBiometricUnlock();
      if (res.success) onAuthenticated(profile, false);
      else setError(res.error || (isKo ? '생체 인증에 실패했습니다.' : 'Biometric unlock failed.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : (isKo ? '생체 인증 실패' : 'Biometric failed.'));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="local-account-modal-title" className="w-full max-w-md rounded-2xl bg-[var(--surface-panel)] border border-white/[0.12] p-6 shadow-2xl space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="local-account-modal-title" className="text-base font-bold text-white">
              {mode === 'create' ? (isKo ? '로컬 계정 만들기' : 'Create Local Account') : (isKo ? '프라이빗 금고 잠금 해제' : 'Unlock Private Vault')}
            </h2>
            <p className="mt-1 text-xs text-neutral-400">
              {mode === 'create'
                ? (isKo ? '서버 전송 없이 이 기기에만 암호화 저장됩니다.' : 'Stored encrypted on this device only.')
                : `${profile?.userName || 'Vault'} · ${profile?.pinName || 'Master PIN'}`}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t('close')} className="p-1 text-neutral-400 hover:text-white cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'create' && (
            <>
              <div>
                <label htmlFor="local-account-username" className="block text-xs text-neutral-300 mb-1">{isKo ? '사용자 이름' : 'Display Name'}</label>
                <input id="local-account-username" ref={nameRef} type="text" value={form.userName} onChange={(e) => setForm((f) => ({ ...f, userName: e.target.value }))} placeholder={isKo ? '예: 홍길동' : 'e.g. Alex'} maxLength={32} className={INPUT} />
              </div>
              <div>
                <label htmlFor="local-account-pin-name" className="block text-xs text-neutral-300 mb-1">{isKo ? 'PIN 별칭 (선택)' : 'PIN Label (Optional)'}</label>
                <input id="local-account-pin-name" type="text" value={form.pinName} onChange={(e) => setForm((f) => ({ ...f, pinName: e.target.value }))} placeholder={isKo ? '예: 개인 금고 PIN' : 'e.g. Personal PIN'} maxLength={32} className={INPUT} />
              </div>
            </>
          )}
          <div>
            <label htmlFor={mode === 'create' ? 'local-account-pin' : 'local-account-unlock-pin'} className="block text-xs text-neutral-300 mb-1">
              {isKo ? '마스터 PIN (4~6자리 숫자)' : 'Master PIN (4–6 digits)'}
            </label>
            <div className="relative">
              <input
                id={mode === 'create' ? 'local-account-pin' : 'local-account-unlock-pin'}
                ref={mode === 'unlock' ? unlockRef : undefined}
                type={showPin ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: digitsOnly(e.target.value) }))}
                placeholder="••••" className={`${INPUT} pr-10 font-mono tracking-widest`}
              />
              <button type="button" onClick={() => setShowPin((v) => !v)} aria-label="Toggle PIN visibility" className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer">
                {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          {mode === 'create' && (
            <div>
              <label htmlFor="local-account-pin-confirm" className="block text-xs text-neutral-300 mb-1">{isKo ? 'PIN 확인' : 'Confirm PIN'}</label>
              <input id="local-account-pin-confirm" type={showPin ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]*" maxLength={6} value={form.confirmPin} onChange={(e) => setForm((f) => ({ ...f, confirmPin: digitsOnly(e.target.value) }))} placeholder="••••" className={`${INPUT} font-mono tracking-widest`} />
            </div>
          )}
          {error && <p role="alert" className="text-xs text-amber-300 font-medium">{error}</p>}
          {mode === 'unlock' && biometricReady && (
            <button type="button" onClick={handleBio} disabled={busy} className="w-full h-10 px-4 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.15] text-emerald-200 text-xs font-medium inline-flex items-center justify-center gap-2 cursor-pointer">
              <Fingerprint size={14} className="text-emerald-300" /><span>{t('biometric_unlock')}</span>
            </button>
          )}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={BTN_SEC}>{isKo ? '취소' : 'Cancel'}</button>
            <button type="submit" disabled={busy || (mode === 'unlock' && form.pin.length < 4)} className={BTN_PRI}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <><span>{mode === 'create' ? (isKo ? '생성 후 시작' : 'Create & Enter') : (isKo ? '잠금 해제' : 'Unlock')}</span><ArrowRight size={14} /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
