import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, Coins, Layers, ArrowRight, ArrowUpRight } from 'lucide-react';
import { useI18n, LanguageCode } from '../i18n';

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

const NET_TO_DOT_MANIFESTO: Record<LanguageCode, string> = {
  ko: '거대 클라우드(Net)의 종속에서 벗어나, 당신의 기기(Dot) 안에서 완벽한 데이터 주권을 실현하세요.',
  en: 'Break free from passive cloud (Net) dependency and realize complete data sovereignty inside your own device (Dot).',
  ja: '巨大クラウド(Net)への依存から離れ、あなたのデバイス(Dot)の中で完全なデータ主権を実現しましょう。',
  eu: 'Break free from passive cloud (Net) dependency and realize complete data sovereignty inside your own device (Dot).',
};

export const WelcomeDashboardModal: React.FC<WelcomeDashboardModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t, language } = useI18n();

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
      icon: <ShieldCheck className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-emerald-400 shrink-0 mt-0.5" strokeWidth={1.75} />,
      titleColor: 'text-emerald-300',
      delayClass: '[animation-delay:60ms]',
      title: t('welcome_phil1_title'),
      desc: t('welcome_phil1_desc'),
    },
    {
      id: 'currency',
      icon: <Coins className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-amber-400 shrink-0 mt-0.5" strokeWidth={1.75} />,
      titleColor: 'text-amber-300',
      delayClass: '[animation-delay:140ms]',
      title: t('welcome_phil2_title'),
      desc: t('welcome_phil2_desc'),
    },
    {
      id: 'space',
      icon: <Layers className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-sky-400 shrink-0 mt-0.5" strokeWidth={1.75} />,
      titleColor: 'text-sky-300',
      delayClass: '[animation-delay:220ms]',
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
        className="w-full max-w-3xl rounded-3xl bg-[#090A0D]/95 backdrop-blur-3xl border border-white/5 text-neutral-100 antialiased shadow-[0_32px_64px_-16px_rgba(0,0,0,0.95)] px-6 py-7 sm:p-10 relative max-h-[94dvh] sm:max-h-[92dvh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
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

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-10 md:gap-12 items-start sm:pt-2">
          {/* Left Side: Hero Typography */}
          <div className="md:col-span-5 flex flex-col justify-between pr-9 sm:pr-0">
            <div>
              <h2
                id="welcome-dashboard-title"
                className="text-[28px] leading-tight sm:text-4xl font-semibold tracking-tight text-white"
              >
                Vibe Vault
              </h2>
              <p className="text-[13.5px] sm:text-sm font-normal text-neutral-300 leading-relaxed mt-2.5 sm:mt-5">
                {t('welcome_manifesto')}
              </p>
              <p className="text-xs sm:text-[13px] font-normal text-neutral-400 leading-relaxed mt-3">
                {NET_TO_DOT_MANIFESTO[language] || NET_TO_DOT_MANIFESTO.en}
              </p>
            </div>

            <div className="mt-5 sm:mt-8 pt-4 border-t border-white/[0.06]">
              <a
                href="https://nettodot.org"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-neutral-400 hover:text-sky-400 transition-colors"
              >
                <span>A Net to Dot Movement Initiative</span>
                <span aria-hidden="true" className="text-neutral-500">·</span>
                <span className="underline underline-offset-2 decoration-white/20">nettodot.org</span>
                <ArrowUpRight size={11} className="shrink-0 opacity-80" />
              </a>
            </div>
          </div>

          {/* Right Side: 3 Core Pillars (Borderless Editorial List) */}
          <div className="md:col-span-7 flex flex-col gap-5 sm:gap-8">
            {pillars.map((pillar) => (
              <div
                key={pillar.id}
                className={`flex items-start gap-3.5 sm:gap-4 animate-in fade-in slide-in-from-bottom-2 ${pillar.delayClass}`}
              >
                {pillar.icon}
                <div className="min-w-0 flex-1">
                  <h3 className={`text-[15px] sm:text-base font-semibold tracking-tight ${pillar.titleColor}`}>
                    {pillar.title}
                  </h3>
                  <p className="text-[13px] sm:text-sm font-normal text-neutral-300 leading-relaxed mt-1.5">
                    {pillar.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Single Primary Action */}
        <div className="mt-7 sm:mt-12 flex justify-end">
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
