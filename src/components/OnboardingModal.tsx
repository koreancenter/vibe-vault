import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Coins, FileText, ChevronRight, ChevronLeft, Sparkles, CheckCircle2 } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StepItem {
  id: number;
  emblem: React.ReactNode;
  tag: string;
  title: string;
  subtitle: string;
  highlights: string[];
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState<number>(0);

  // Reset to first slide when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  const handleFinish = useCallback(() => {
    try {
      localStorage.setItem('vibe_onboarding_completed', 'true');
    } catch {
      // ignore storage errors
    }
    onClose();
  }, [onClose]);

  const handleNext = () => {
    if (currentStep < 2) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleFinish();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep, handleFinish]);

  if (!isOpen) return null;

  const steps: StepItem[] = [
    {
      id: 0,
      emblem: <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto" />,
      tag: 'ZERO-KNOWLEDGE PRIVACY',
      title: '로컬 우선 암호화 프라이버시',
      subtitle: '금융 데이터는 이 브라우저의 IndexedDB에 AES-GCM-256으로 암호화 보관됩니다. Gemini 클라우드 AI를 선택하면 분석 입력이 로컬 API를 거쳐 Google로 전송됩니다.',
      highlights: ['AES-GCM-256 로컬 암호화 보관', 'Gemini 요청은 Google로 전송', '온디바이스 모드는 입력을 전송하지 않음']
    },
    {
      id: 1,
      emblem: <Coins className="w-8 h-8 text-sky-400 mx-auto" />,
      tag: 'MULTI-CURRENCY TREASURY',
      title: '다중 통화 글로벌 자산 금고',
      subtitle: '원화(KRW), 달러(USD), 유로(EUR), 루피아(IDR) 등 지원 통화 자산과 마이너스 통장 잔액을 일일 기준 환율로 통합 평가합니다.',
      highlights: ['KRW · USD · EUR · IDR 다중 통화', '일일 기준 환율 자동 평가', '음수 부채 잔액 및 마이너스 통장 통합']
    },
    {
      id: 2,
      emblem: <FileText className="w-8 h-8 text-amber-400 mx-auto" />,
      tag: 'EPISODIC SPACE & SETTLEMENT',
      title: '일상 장부 & 행사 결산 격리',
      subtitle: '여행, 동호회, 스터디 등 일회성 모임 지출을 일상 가계부와 분리하고, 스마트 N분의 1 정산과 한국식 표준 결산서를 즉시 인쇄합니다.',
      highlights: ['목적별 독립 가계부 스페이스', '스마트 N분의 1 자동 분할 정산', '한국식 표준 결산서 A4 인쇄 / PDF 출력']
    }
  ];

  const step = steps[currentStep];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      className="fixed inset-0 z-[60] z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300 select-none"
    >
      <div
        className="w-full max-w-[380px] sm:max-w-md bg-[#090A0D] border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col justify-between min-h-[500px] transition-all relative overflow-hidden"
      >
        {/* Subtle Luxury Ambient Glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header: Progress Indicator & Skip Action */}
        <div className="w-full flex items-center justify-between z-10">
          {/* Progress Indicators */}
          <div className="flex items-center gap-1.5" aria-label={`Step ${currentStep + 1} of 3`}>
            {[0, 1, 2].map((idx) => {
              const isActive = idx === currentStep;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentStep(idx)}
                  aria-label={`스텝 ${idx + 1}로 이동`}
                  className={`h-1 rounded-full transition-all duration-300 cursor-pointer ${
                    isActive ? 'bg-white w-6 shadow-[0_0_8px_rgba(255,255,255,0.4)]' : 'bg-white/[0.1] hover:bg-white/[0.25] w-2'
                  }`}
                />
              );
            })}
          </div>

          {/* Skip Button */}
          <button
            type="button"
            onClick={handleFinish}
            className="text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer py-1 px-1.5 flex items-center gap-1"
          >
            건너뛰기
          </button>
        </div>

        {/* Carousel Content */}
        <div className="w-full my-auto py-6 flex flex-col items-center text-center z-10 transition-all duration-200">
          {/* Tag Pill */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.08] text-[9px] sm:text-[10px] tracking-widest uppercase font-mono text-neutral-400 mb-5">
            <Sparkles className="w-2.5 h-2.5 text-neutral-300" />
            <span>{step.tag}</span>
          </div>

          {/* Emblem Icon */}
          <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mx-auto mb-4 shadow-inner">
            {step.emblem}
          </div>

          {/* Title */}
          <h2
            id="onboarding-modal-title"
            className="text-base sm:text-lg font-bold tracking-tight text-white mb-2 leading-snug"
          >
            {step.title}
          </h2>

          {/* Subtitle */}
          <p className="text-xs sm:text-[13px] text-neutral-400 font-light leading-relaxed px-1 sm:px-2 min-h-[58px]">
            {step.subtitle}
          </p>

          {/* Feature Highlights Pills */}
          <div className="mt-4 flex flex-col gap-1.5 w-full">
            {step.highlights.map((highlight, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.02] border border-white/[0.04] text-[11px] text-neutral-300 text-left"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span>{highlight}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Navigation & Actions */}
        <div className="w-full pt-4 border-t border-white/[0.06] flex flex-col gap-2 z-10">
          <div className="flex items-center gap-2 w-full">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="py-3 px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 hover:text-white text-xs font-medium active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                aria-label="이전 안내"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}

            {currentStep < 2 ? (
              <button
                type="button"
                onClick={handleNext}
                className="w-full py-3 rounded-xl bg-white text-black font-semibold text-xs active:scale-95 hover:bg-neutral-200 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-white/5"
              >
                <span>다음</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="w-full py-3 rounded-xl bg-white text-black font-semibold text-xs shadow-md active:scale-95 hover:bg-neutral-200 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-emerald-500/10"
              >
                <span>프라이빗 금고 시작하기</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="text-center">
            <span className="text-[10px] text-neutral-500 font-mono">
              {currentStep + 1} / 3
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
