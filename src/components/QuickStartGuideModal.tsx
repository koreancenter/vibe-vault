import React from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2 } from 'lucide-react';
import { useI18n } from '../i18n';

export interface QuickStartGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPopulateOmnibar: (exampleText: string) => void;
  onOpenScanner: () => void;
  onLoadSampleData: () => Promise<void> | void;
  theme?: 'light' | 'dark' | 'system';
}

export const QuickStartGuideModal: React.FC<QuickStartGuideModalProps> = ({
  isOpen,
  onClose,
  onPopulateOmnibar,
  onOpenScanner,
  onLoadSampleData,
  theme = 'dark',
}) => {
  const { t } = useI18n();
  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const handleStep1Try = () => {
    onPopulateOmnibar(t('guide_step1_example'));
    onClose();
  };

  const handleStep2Try = () => {
    onClose();
    onOpenScanner();
  };

  const handleStep3Try = async () => {
    await onLoadSampleData();
    onClose();
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-0 sm:p-4"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-white/15 bg-[#111217] text-neutral-100 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.08)] flex flex-col max-h-[90dvh] overflow-hidden animate-in slide-in-from-bottom-6 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 bg-white/20" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] shrink-0">
          <h2 className="text-base font-semibold text-white">{t('quick_start_title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            aria-label={t('close')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content - Linear divided flow without box-in-box */}
        <div className="flex-1 overflow-y-auto px-6 py-2 divide-y divide-white/[0.08] overscroll-contain">
          {/* Step 1 */}
          <div className="py-4 space-y-2.5">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-white/[0.08] border border-white/15 text-white font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5">
                1
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white">
                  {t('guide_step1_title')}
                </h3>
                <p className="text-xs text-neutral-300 font-normal leading-relaxed mt-1">
                  {t('guide_step1_desc')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end pl-9">
              <button
                type="button"
                onClick={handleStep1Try}
                className="px-3.5 py-1.5 rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-medium transition-all active:scale-95 cursor-pointer shadow-xs whitespace-nowrap"
              >
                <span>{t('guide_step1_btn')}</span>
              </button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="py-4 space-y-2.5">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-white/[0.08] border border-white/15 text-white font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5">
                2
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white">
                  {t('guide_step2_title')}
                </h3>
                <p className="text-xs text-neutral-300 font-normal leading-relaxed mt-1">
                  {t('guide_step2_desc')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end pl-9">
              <button
                type="button"
                onClick={handleStep2Try}
                className="px-3.5 py-1.5 rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-medium transition-all active:scale-95 cursor-pointer shadow-xs whitespace-nowrap"
              >
                <span>{t('guide_step2_btn')}</span>
              </button>
            </div>
          </div>

          {/* Step 3 */}
          <div className="py-4 space-y-2.5">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-white/[0.08] border border-white/15 text-white font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5">
                3
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white">
                  {t('guide_step3_title')}
                </h3>
                <p className="text-xs text-neutral-300 font-normal leading-relaxed mt-1">
                  {t('guide_step3_desc')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end pl-9">
              <button
                type="button"
                onClick={handleStep3Try}
                className="px-4 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-sm whitespace-nowrap"
              >
                <span>{t('guide_step3_btn')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:px-6 border-t border-white/[0.08] flex items-center justify-between shrink-0 bg-black/20">
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-300">
            <CheckCircle2 size={13} className="text-sky-400 shrink-0" />
            <span>{t('local_safe_vault_badge')}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white transition-all cursor-pointer"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default QuickStartGuideModal;
