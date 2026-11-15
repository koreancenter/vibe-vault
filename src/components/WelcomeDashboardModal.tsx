import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, Coins, Layers, ArrowRight } from 'lucide-react';
import { useI18n } from '../i18n';

export interface WelcomeDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
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

export const WelcomeDashboardModal: React.FC<WelcomeDashboardModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useI18n();

  const handleClose = useCallback(() => {
    persistWelcomeSeen();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const pillars = [
    {
      id: 'privacy',
      icon: <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" strokeWidth={1.75} />,
      titleColor: 'text-emerald-300',
      title: t('welcome_phil1_title'),
      desc: t('welcome_phil1_desc'),
    },
    {
      id: 'currency',
      icon: <Coins className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" strokeWidth={1.75} />,
      titleColor: 'text-amber-300',
      title: t('welcome_phil2_title'),
      desc: t('welcome_phil2_desc'),
    },
    {
      id: 'space',
      icon: <Layers className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" strokeWidth={1.75} />,
      titleColor: 'text-sky-300',
      title: t('welcome_phil3_title'),
      desc: t('welcome_phil3_desc'),
    },
  ];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-dashboard-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-3xl rounded-3xl bg-[#090A0D]/95 backdrop-blur-2xl border border-white/[0.08] text-neutral-100 antialiased shadow-[0_32px_64px_-16px_rgba(0,0,0,0.95)] p-6 sm:p-10 relative max-h-[92dvh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label={t('close')}
          className="absolute top-5 right-5 sm:top-7 sm:right-7 w-9 h-9 rounded-full flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <X size={18} />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-12 items-start pt-2">
          {/* Left Side: Hero Typography */}
          <div className="md:col-span-5 flex flex-col justify-between">
            <div>
              <h2
                id="welcome-dashboard-title"
                className="text-3xl sm:text-4xl font-semibold tracking-tight text-white"
              >
                Vibe Vault
              </h2>
              <p className="text-sm font-normal text-neutral-300 leading-relaxed mt-5">
                {t('welcome_manifesto')}
              </p>
            </div>
          </div>

          {/* Right Side: 3 Core Pillars (Borderless Editorial List) */}
          <div className="md:col-span-7 flex flex-col gap-8">
            {pillars.map((pillar) => (
              <div key={pillar.id} className="flex items-start gap-4">
                {pillar.icon}
                <div className="min-w-0 flex-1">
                  <h3 className={`text-base font-semibold tracking-tight ${pillar.titleColor}`}>
                    {pillar.title}
                  </h3>
                  <p className="text-sm font-normal text-neutral-300 leading-relaxed mt-1.5">
                    {pillar.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Single Primary Action */}
        <div className="mt-10 sm:mt-12 flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-[#090A0D] hover:bg-neutral-200 text-sm font-semibold transition-all active:scale-95 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <span>{t('welcome_start_btn')}</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default WelcomeDashboardModal;
