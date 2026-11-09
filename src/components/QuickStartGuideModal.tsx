import React from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2 } from 'lucide-react';

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
  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const handleStep1Try = () => {
    onPopulateOmnibar('스타벅스 아메리카노 4,500원 현대카드 결제');
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
          <h2 className="text-base font-semibold text-white">Vibe Vault 시작 가이드</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            aria-label="닫기"
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
                  하단 AI 입력창(Omnibar)으로 3초 기록
                </h3>
                <p className="text-xs text-neutral-300 font-normal leading-relaxed mt-1">
                  복잡한 입력 폼 없이 하단 채팅창에 카톡처럼 입력해 보세요. 더치페이, 무이자 할부, 계좌 잔고까지 자동 인식합니다.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end pl-9">
              <button
                type="button"
                onClick={handleStep1Try}
                className="px-3.5 py-1.5 rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-medium transition-all active:scale-95 cursor-pointer shadow-xs whitespace-nowrap"
              >
                <span>예시 문구 자동 입력해보기</span>
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
                  스크린샷 & 영수증 AI 스캔
                </h3>
                <p className="text-xs text-neutral-300 font-normal leading-relaxed mt-1">
                  은행·증권 앱 화면을 캡처하거나 종이 영수증을 찍어 올리면 계좌 잔고와 지출 내역이 자동 등록됩니다.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end pl-9">
              <button
                type="button"
                onClick={handleStep2Try}
                className="px-3.5 py-1.5 rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-medium transition-all active:scale-95 cursor-pointer shadow-xs whitespace-nowrap"
              >
                <span>영수증/화면 스캔 열기</span>
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
                  일상 가계부와 모임/행사 장부 분리
                </h3>
                <p className="text-xs text-neutral-300 font-normal leading-relaxed mt-1">
                  동창회, 여행, 프로젝트 경비는 별도 장부 공간을 만들어 관리하고 A4 표준 결산서를 인쇄하세요.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end pl-9">
              <button
                type="button"
                onClick={handleStep3Try}
                className="px-4 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-sm whitespace-nowrap"
              >
                <span>샘플 데이터 채워서 전체 화면 체험하기</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:px-6 border-t border-white/[0.08] flex items-center justify-between shrink-0 bg-black/20">
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-300">
            <CheckCircle2 size={13} className="text-sky-400 shrink-0" />
            <span>기기 로컬 안전 저장 (영지식 암호화 금고)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white transition-all cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default QuickStartGuideModal;
