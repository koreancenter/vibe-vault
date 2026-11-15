import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ShieldCheck,
  Coins,
  FileText,
  Terminal,
  Camera,
  Database,
  ArrowRight,
  Lock,
  Loader2,
} from 'lucide-react';
import { useI18n } from '../i18n';

export interface WelcomeDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPopulateOmnibar?: (exampleText: string) => void;
  onOpenScanner?: () => void;
  onLoadSampleData?: () => Promise<void> | void;
  isLocked?: boolean;
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
  onPopulateOmnibar,
  onOpenScanner,
  onLoadSampleData,
  isLocked = false,
}) => {
  const { t } = useI18n();
  const [isLoadingSample, setIsLoadingSample] = useState(false);

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

  const actionsDisabled = isLocked;

  const handleTryOmnibar = () => {
    if (actionsDisabled || !onPopulateOmnibar) return;
    persistWelcomeSeen();
    onPopulateOmnibar(t('guide_step1_example'));
    onClose();
  };

  const handleTestScanner = () => {
    if (actionsDisabled || !onOpenScanner) return;
    persistWelcomeSeen();
    onClose();
    onOpenScanner();
  };

  const handleLoadSample = async () => {
    if (actionsDisabled || !onLoadSampleData || isLoadingSample) return;
    setIsLoadingSample(true);
    try {
      await onLoadSampleData();
      persistWelcomeSeen();
      onClose();
    } finally {
      setIsLoadingSample(false);
    }
  };

  const philosophyItems = [
    {
      id: 'privacy',
      icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />,
      iconContainerClass: 'bg-emerald-500/[0.08] border-emerald-500/20',
      tagClass: 'text-emerald-400',
      tag: t('welcome_phil1_tag'),
      title: t('welcome_phil1_title'),
      desc: t('welcome_phil1_desc'),
      meta: t('welcome_phil1_meta'),
    },
    {
      id: 'currency',
      icon: <Coins className="w-4 h-4 text-sky-400" />,
      iconContainerClass: 'bg-sky-500/[0.08] border-sky-500/20',
      tagClass: 'text-sky-400',
      tag: t('welcome_phil2_tag'),
      title: t('welcome_phil2_title'),
      desc: t('welcome_phil2_desc'),
      meta: t('welcome_phil2_meta'),
    },
    {
      id: 'space',
      icon: <FileText className="w-4 h-4 text-amber-400" />,
      iconContainerClass: 'bg-amber-500/[0.08] border-amber-500/20',
      tagClass: 'text-amber-400',
      tag: t('welcome_phil3_tag'),
      title: t('welcome_phil3_title'),
      desc: t('welcome_phil3_desc'),
      meta: t('welcome_phil3_meta'),
    },
  ];

  const quickStartItems = [
    {
      step: '01',
      tag: 'AI Omnibar',
      tagClass: 'text-emerald-400',
      icon: <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
      title: t('guide_step1_title'),
      desc: t('guide_step1_desc'),
      actionLabel: t('guide_step1_btn'),
      onAction: handleTryOmnibar,
      canRun: Boolean(onPopulateOmnibar) && !actionsDisabled,
      isLoading: false,
    },
    {
      step: '02',
      tag: 'Vision OCR',
      tagClass: 'text-sky-400',
      icon: <Camera className="w-3.5 h-3.5 text-sky-400 shrink-0" />,
      title: t('guide_step2_title'),
      desc: t('guide_step2_desc'),
      actionLabel: t('guide_step2_btn'),
      onAction: handleTestScanner,
      canRun: Boolean(onOpenScanner) && !actionsDisabled,
      isLoading: false,
    },
    {
      step: '03',
      tag: 'Ledger & Demo',
      tagClass: 'text-amber-400',
      icon: <Database className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
      title: t('guide_step3_title'),
      desc: t('guide_step3_desc'),
      actionLabel: isLoadingSample ? t('welcome_loading_sample') : t('guide_step3_btn'),
      onAction: handleLoadSample,
      canRun: Boolean(onLoadSampleData) && !actionsDisabled,
      isLoading: isLoadingSample,
    },
  ];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-dashboard-title"
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-4xl rounded-t-3xl sm:rounded-3xl bg-[#090A0D]/95 backdrop-blur-2xl border border-white/[0.06] text-neutral-100 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.06)] flex flex-col max-h-[92dvh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle Horological Surface Specular Sheen */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.03),transparent_55%)] pointer-events-none"
        />

        {/* Mobile drag cue */}
        <div className="w-10 h-1 rounded-full mx-auto mt-2.5 sm:hidden shrink-0 bg-white/15 relative z-10" />

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between gap-4 px-5 py-4 sm:px-7 sm:py-5 border-b border-white/[0.06] shrink-0">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <h2
              id="welcome-dashboard-title"
              className="text-base sm:text-lg font-semibold tracking-tight text-white whitespace-nowrap shrink-0"
            >
              Vibe Vault
            </h2>
            <span aria-hidden="true" className="text-neutral-600 text-xs">
              ·
            </span>
            <span className="text-xs sm:text-[13px] text-neutral-400 truncate">
              {t('welcome_subtitle')}
            </span>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label={t('close')}
            className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.06] border border-transparent hover:border-white/[0.06] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Bento Split-View Body */}
        <div className="relative z-10 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
            {/* Left Column: The Philosophy */}
            <section aria-label={t('welcome_col_philosophy')} className="flex flex-col">
              <div className="flex items-baseline justify-between mb-3 px-0.5">
                <h3 className="text-xs font-semibold text-neutral-200 tracking-tight">
                  {t('welcome_col_philosophy')}
                </h3>
                <span className="text-[11px] text-neutral-400 tabular-nums">01 — 03</span>
              </div>

              <div className="flex flex-col gap-3 flex-1">
                {philosophyItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-[#121318]/90 border border-white/[0.06] p-4 flex items-start gap-3.5 transition-colors hover:border-white/[0.1] flex-1"
                  >
                    <div
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${item.iconContainerClass}`}
                    >
                      {item.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[11px] font-medium tracking-tight ${item.tagClass}`}>
                        {item.tag}
                      </div>
                      <h4 className="text-sm font-semibold text-white mt-0.5 leading-snug">
                        {item.title}
                      </h4>
                      <p className="text-xs text-neutral-400 leading-relaxed mt-1">
                        {item.desc}
                      </p>
                      <div className="text-[11px] text-neutral-500 tabular-nums mt-2">
                        {item.meta}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Right Column: Quick Start & Actions */}
            <section aria-label={t('welcome_col_quickstart')} className="flex flex-col">
              <div className="flex items-baseline justify-between mb-3 px-0.5">
                <h3 className="text-xs font-semibold text-neutral-200 tracking-tight">
                  {t('welcome_col_quickstart')}
                </h3>
                <span className="text-[11px] text-neutral-400 tabular-nums">3 Actions</span>
              </div>

              <div className="flex flex-col gap-3 flex-1">
                {quickStartItems.map((item) => (
                  <div
                    key={item.step}
                    className="rounded-2xl bg-[#121318]/90 border border-white/[0.06] p-4 flex flex-col justify-between gap-3 transition-colors hover:border-white/[0.12] flex-1"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="font-mono tabular-nums text-neutral-400">
                            {item.step}
                          </span>
                          <span aria-hidden="true" className="text-neutral-600">
                            ·
                          </span>
                          <span className={`font-medium ${item.tagClass}`}>{item.tag}</span>
                        </div>
                      </div>

                      <h4 className="text-sm font-semibold text-white mt-1.5 leading-snug">
                        {item.title}
                      </h4>
                      <p className="text-xs text-neutral-400 leading-relaxed mt-1">
                        {item.desc}
                      </p>
                    </div>

                    <div className="flex items-center justify-end pt-0.5">
                      <button
                        type="button"
                        onClick={item.onAction}
                        disabled={!item.canRun || item.isLoading}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.09] hover:border-white/[0.18] text-xs font-medium text-white transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      >
                        {item.isLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-300 shrink-0" />
                        ) : (
                          item.icon
                        )}
                        <span>{item.actionLabel}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 px-5 py-4 sm:px-7 border-t border-white/[0.06] bg-black/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-neutral-400 min-w-0">
            {isLocked ? (
              <>
                <Lock size={13} className="text-amber-400 shrink-0" />
                <span className="truncate">{t('welcome_locked_hint')}</span>
              </>
            ) : (
              <>
                <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
                <span className="truncate">{t('local_safe_vault_badge')}</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-white text-[#090A0D] hover:bg-neutral-200 text-xs font-semibold transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <span>{t('welcome_start_btn')}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default WelcomeDashboardModal;
