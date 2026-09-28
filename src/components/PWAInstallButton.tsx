import React, { useState } from 'react';
import { 
  Download, 
  Share2, 
  PlusSquare, 
  X, 
  Smartphone, 
  Sparkles, 
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePWAInstall } from '../usePWAInstall';

interface PWAInstallProps {
  theme?: 'light' | 'dark' | 'system';
  className?: string;
  variant?: 'header' | 'settings' | 'compact';
  onInstalled?: () => void;
}

/**
 * iOS Installation Instructions Modal
 */
export const IOSInstallModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  theme?: string;
}> = ({ isOpen, onClose, theme = 'dark' }) => {
  if (!isOpen) return null;

  const isLight = theme === 'light';

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={`relative w-full max-w-sm rounded-3xl p-6 shadow-2xl border ${
            isLight
              ? 'bg-white text-slate-900 border-slate-200'
              : 'bg-[#0F172A] text-white border-white/10'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Smartphone size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight">홈 화면에 추가하기</h3>
                <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  iOS Safari 앱 설치 안내
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-full transition-colors ${
                isLight 
                  ? 'hover:bg-slate-100 text-slate-400 hover:text-slate-700' 
                  : 'hover:bg-white/10 text-slate-400 hover:text-white'
              }`}
              aria-label="닫기"
            >
              <X size={18} />
            </button>
          </div>

          {/* Step list */}
          <div className="space-y-3 my-4">
            <div className={`p-3 rounded-2xl flex items-start gap-3 border ${
              isLight ? 'bg-slate-50 border-slate-100' : 'bg-white/[0.03] border-white/5'
            }`}>
              <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                1
              </div>
              <div className="text-xs leading-relaxed">
                Safari 브라우저 하단(또는 상단)의{' '}
                <span className="inline-flex items-center gap-1 font-semibold text-blue-400 mx-0.5">
                  <Share2 size={12} className="inline" /> 공유
                </span>{' '}
                아이콘을 탭합니다.
              </div>
            </div>

            <div className={`p-3 rounded-2xl flex items-start gap-3 border ${
              isLight ? 'bg-slate-50 border-slate-100' : 'bg-white/[0.03] border-white/5'
            }`}>
              <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                2
              </div>
              <div className="text-xs leading-relaxed">
                메뉴 목록을 아래로 스크롤하여{' '}
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-400 mx-0.5">
                  <PlusSquare size={12} className="inline" /> 홈 화면에 추가
                </span>{' '}
                를 선택합니다.
              </div>
            </div>

            <div className={`p-3 rounded-2xl flex items-start gap-3 border ${
              isLight ? 'bg-slate-50 border-slate-100' : 'bg-white/[0.03] border-white/5'
            }`}>
              <div className="w-6 h-6 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                3
              </div>
              <div className="text-xs leading-relaxed">
                우측 상단의 <strong className="text-purple-400">추가</strong>를 누르면 오프라인 캐싱과 전체 화면 독립 앱으로 구동됩니다.
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl font-bold text-xs transition-all active:scale-98 bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-lg shadow-emerald-500/20"
          >
            확인 완료
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

/**
 * Compact PWA Install Button (for headers, toolbars, or settings menus)
 */
export const PWAInstallButton: React.FC<PWAInstallProps> = ({ 
  theme = 'dark', 
  className = '',
  variant = 'header',
  onInstalled
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  const isLight = theme === 'light';

  // In Settings Modal Variant
  if (variant === 'settings') {
    if (isInstalled) {
      return (
        <div className={`p-3 rounded-xl border flex items-center justify-between ${
          isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        } ${className}`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <div className="text-xs">
              <span className="font-bold">PWA 독립 앱으로 설치되어 실행 중</span>
              <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>오프라인 캐싱 및 전체화면 모드가 활성화되어 있습니다.</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
          isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-white/[0.03] border-white/10 text-white'
        } ${className}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Download size={15} />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold block truncate">PWA 홈 화면 / 데스크톱 앱 설치</span>
              <p className={`text-[11px] truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                브라우저 주소창 없이 네이티브 앱처럼 실행하세요.
              </p>
            </div>
          </div>

          <div className="shrink-0">
            {isInstallable ? (
              <button
                type="button"
                onClick={async () => {
                  const success = await install();
                  if (success && onInstalled) onInstalled();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
              >
                <Download size={13} />
                <span>앱 설치</span>
              </button>
            ) : isIOS ? (
              <button
                type="button"
                onClick={() => setShowIOSModal(true)}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
              >
                <Share2 size={13} />
                <span>iOS 설치 안내</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const success = await install();
                  if (!success) {
                    setShowIOSModal(true);
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                  isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-white/15 text-slate-200 hover:bg-white/10'
                }`}
              >
                <span>설치 가이드</span>
              </button>
            )}
          </div>
        </div>

        <IOSInstallModal
          isOpen={showIOSModal}
          onClose={() => setShowIOSModal(false)}
          theme={theme}
        />
      </>
    );
  }

  // Header compact variant: hide if already running in standalone PWA
  if (isInstalled) {
    return null;
  }

  // Handle header install click: try native prompt first; if not available (or iOS), show install guide modal
  const handleHeaderInstallClick = async () => {
    if (isInstallable) {
      const success = await install();
      if (success) {
        if (onInstalled) onInstalled();
        return;
      }
    }
    // For iOS Safari or browsers without immediate prompt, open the elegant guide modal
    setShowIOSModal(true);
  };

  return (
    <>
      <button
        id="pwa-install-header-btn"
        type="button"
        onClick={handleHeaderInstallClick}
        title="홈 화면 또는 기기 앱으로 설치 (PWA)"
        className={`h-8 px-2.5 flex items-center gap-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-xs ${
          isLight
            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
            : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30'
        } ${className}`}
      >
        {isIOS ? (
          <Share2 size={13} className="shrink-0 text-blue-400" />
        ) : (
          <Download size={13} className="shrink-0 text-emerald-400" />
        )}
        <span>앱 설치</span>
      </button>

      <IOSInstallModal
        isOpen={showIOSModal}
        onClose={() => setShowIOSModal(false)}
        theme={theme}
      />
    </>
  );
};

/**
 * Subtle Automatic Top/Bottom Notification Banner for PWA Installation
 */
export const PWAInstallBanner: React.FC<{
  theme?: 'light' | 'dark' | 'system';
  position?: 'top' | 'bottom';
  onInstalled?: () => void;
}> = ({ theme = 'dark', position = 'bottom', onInstalled }) => {
  const { isInstallable, isInstalled, isIOS, isDismissed, install, dismiss } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  // Suppress if already installed or explicitly dismissed in this session
  if (isInstalled || isDismissed) {
    return null;
  }

  // Only show if prompt is captured or on iOS Safari
  if (!isInstallable && !isIOS) {
    return null;
  }

  const isLight = theme === 'light';

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: position === 'bottom' ? 20 : -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: position === 'bottom' ? 20 : -20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={`fixed left-4 right-4 z-40 max-w-md mx-auto pointer-events-auto ${
            position === 'bottom' ? 'bottom-20' : 'top-18'
          }`}
        >
          <div className={`p-3.5 rounded-2xl shadow-xl backdrop-blur-xl border flex items-center justify-between gap-3 ${
            isLight
              ? 'bg-white/95 text-slate-900 border-slate-200/80 shadow-slate-200/50'
              : 'bg-[#0B0F17]/95 text-white border-white/15 shadow-black/60'
          }`}>
            {/* App Icon + Title */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-[#0E1524] flex items-center justify-center">
                <img 
                  src="/icon.svg" 
                  alt="Vibe Vault" 
                  className="w-7 h-7 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/apple-touch-icon.png';
                  }}
                />
              </div>
              <div className="flex flex-col truncate">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold tracking-tight truncate">Vibe Ledger AI 앱 설치</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">PWA</span>
                </div>
                <span className={`text-[11px] truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  홈 화면에서 더 빠르고 편리하게 사용하세요
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {isInstallable ? (
                <button
                  id="pwa-banner-install-btn"
                  type="button"
                  onClick={async () => {
                    const success = await install();
                    if (success && onInstalled) {
                      onInstalled();
                    }
                  }}
                  className="h-8 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition-all active:scale-95 shadow-md shadow-emerald-500/20"
                >
                  <Download size={13} />
                  <span>설치</span>
                </button>
              ) : (
                <button
                  id="pwa-banner-ios-btn"
                  type="button"
                  onClick={() => setShowIOSModal(true)}
                  className="h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1 transition-all active:scale-95 shadow-md shadow-blue-600/20"
                >
                  <Share2 size={13} />
                  <span>설치 방법</span>
                </button>
              )}

              <button
                id="pwa-banner-dismiss-btn"
                type="button"
                onClick={dismiss}
                title="닫기"
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  isLight 
                    ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700' 
                    : 'text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
                aria-label="알림 닫기"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <IOSInstallModal
        isOpen={showIOSModal}
        onClose={() => setShowIOSModal(false)}
        theme={theme}
      />
    </>
  );
};
