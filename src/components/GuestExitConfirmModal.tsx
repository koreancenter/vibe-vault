import React, { useEffect } from 'react';
import { AlertTriangle, KeyRound, LogOut, X } from 'lucide-react';
import { useI18n } from '../i18n';

export interface GuestExitConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmExit: () => void;
  onSetupPin?: () => void;
  setupPinLabel?: string;
}

/**
 * In-app confirmation modal shown when exiting Guest Mode (no local PIN configured).
 * Prevents accidental wipe of temporary IndexedDB & session data and offers a direct
 * shortcut to protect data with a local security PIN.
 */
export const GuestExitConfirmModal: React.FC<GuestExitConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirmExit,
  onSetupPin,
  setupPinLabel,
}) => {
  const { language } = useI18n();
  const isKo = language === 'ko';

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-exit-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/[0.1] bg-[#0E1015] text-white shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150 antialiased"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl border border-amber-400/25 bg-amber-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle size={17} className="text-amber-300" />
            </div>
            <div>
              <h3
                id="guest-exit-modal-title"
                className="text-sm font-bold tracking-tight text-white"
              >
                {isKo ? '게스트 모드를 종료할까요?' : 'Exit Guest Mode?'}
              </h3>
              <p className="text-[11px] text-amber-200/90 font-medium mt-0.5">
                {isKo ? '임시 세션 데이터 초기화 안내' : 'Temporary session data will be cleared'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isKo ? '닫기' : 'Close'}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-neutral-200 leading-relaxed">
          {isKo
            ? '게스트 모드를 종료하면 시작 화면으로 돌아가며, 이번 세션에서 입력한 계좌·거래·설정 데이터가 모두 즉시 초기화됩니다.'
            : 'Exiting Guest Mode returns to the welcome screen and immediately clears all temporary accounts, transactions, and settings entered in this session.'}
        </p>

        {onSetupPin && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-neutral-300 leading-relaxed">
            {isKo
              ? '데이터를 기기에 암호화해 계속 보관하려면 보안 PIN(로컬 계정)을 먼저 설정하세요.'
              : 'To keep your data encrypted on this device, set up a Security PIN (Local Account) first.'}
          </div>
        )}

        <div className="space-y-2 pt-1">
          {onSetupPin && (
            <button
              type="button"
              onClick={onSetupPin}
              className="w-full h-10 px-4 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--color-accent-hover)] text-xs font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <KeyRound size={14} />
              <span>{setupPinLabel || (isKo ? '보안 PIN 설정하고 데이터 보관' : 'Set Security PIN & Keep Data')}</span>
            </button>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 rounded-xl border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.07] text-neutral-200 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            >
              {isKo ? '계속 사용하기' : 'Stay'}
            </button>
            <button
              type="button"
              onClick={onConfirmExit}
              className="flex-1 h-9 rounded-xl border border-rose-400/30 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 hover:text-white text-xs font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut size={13} />
              <span>{isKo ? '게스트 종료' : 'Exit Guest'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
