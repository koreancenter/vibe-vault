import React, { useEffect } from 'react';
import { X, Scale, ShieldCheck } from 'lucide-react';

interface LegalNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LegalNoticeModal: React.FC<LegalNoticeModalProps> = ({
  isOpen,
  onClose
}) => {
  // Keyboard ESC listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-70 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-notice-title"
    >
      <div 
        className="w-full max-w-md max-h-[85vh] flex flex-col bg-[#0E1015] border border-white/[0.08] rounded-3xl overflow-hidden text-neutral-200 animate-in zoom-in-95 duration-150 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0 bg-[#0E1015]/90 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white">
              <Scale size={16} />
            </div>
            <div>
              <h2 id="legal-notice-title" className="text-sm font-semibold text-white tracking-tight">
                법적 고지 및 면책 조항
              </h2>
              <p className="text-[11px] text-neutral-400 font-light mt-0.5">
                Vibe Vault 이용자 유의사항 및 서비스 운영 원칙
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-full border border-transparent hover:border-white/[0.08] hover:bg-white/[0.06] text-neutral-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 divide-y divide-white/[0.05] space-y-4 text-xs text-neutral-300 leading-relaxed scrollbar-none font-sans">
          
          {/* Section 1: Financial & Investment Advisory Disclaimer */}
          <div className="pt-4 first:pt-0 space-y-1.5">
            <h3 className="text-xs font-semibold text-white tracking-tight">
              01. 금융 및 투자 자문 면책
            </h3>
            <p className="text-neutral-400 text-[11.5px] leading-relaxed">
              Vibe Vault는 개인의 자율적인 가계부 관리 및 행사 경비 정산을 보조하는 <strong>비수익 목적의 독립 소프트웨어</strong>입니다. 본 애플리케이션은 자본시장법상의 금융투자업자, 투자자문업자, 또는 공인 금융기관이 아니며, 어떠한 금융상품에 대한 투자 권유나 세무·재정 자문도 제공하지 않습니다. 대시보드에 표시되는 순자산, 평가손익 및 현금 흐름 분석은 참고용 추산치이며, 실제 금융기관의 확정 잔액과 차이가 발생할 수 있습니다.
            </p>
          </div>

          {/* Section 2: Local-First Storage & Data Loss Disclaimer */}
          <div className="pt-4 space-y-1.5">
            <h3 className="text-xs font-semibold text-white tracking-tight">
              02. 로컬 데이터 보관 및 유실 면책
            </h3>
            <p className="text-neutral-400 text-[11.5px] leading-relaxed">
              본 서비스는 <strong>로컬 퍼스트(Local-First) 원칙</strong>에 따라 서버로 금융 데이터를 전송하거나 원격 저장하지 않으며, 모든 자산 및 거래 내역은 오직 사용자의 브라우저 내부 <code className="text-neutral-300 font-mono text-[11px] bg-white/[0.04] px-1 py-0.5 rounded">IndexedDB</code>에만 암호화 보관됩니다. 따라서 브라우저 캐시 삭제, 시크릿 모드 종료, 기기 변경 또는 하드웨어 장애 등으로 인해 발생하는 데이터 유실에 대해 개발자는 기술적·법적 책임을 부담하지 않습니다. 중요한 데이터는 설정 메뉴의 <strong>암호화 백업(VVLT_V1)</strong> 기능을 통해 주기적으로 별도 저장소에 보관하시기 바랍니다.
            </p>
          </div>

          {/* Section 3: AI Parsing & Exchange Rate Notice */}
          <div className="pt-4 space-y-1.5">
            <h3 className="text-xs font-semibold text-white tracking-tight">
              03. AI 파싱 및 환율 오차 고지
            </h3>
            <p className="text-neutral-400 text-[11.5px] leading-relaxed">
              영수증 카메라 OCR 및 자연어 거래 파싱은 온디바이스 정규식 엔진 및 거대 언어 모델(LLM)의 확률적 추론에 기반하므로, 촬영 상태나 문맥에 따라 금액·가맹점 오인식이 발생할 수 있습니다. 거래 확정 전 파싱된 내역을 반드시 직접 검토하십시오. 또한 다중 통화 환율은 공개 외환 지표에 기반한 근사치이며, 실제 카드사 수수료 및 은행 전신환 매매율이 반영된 최종 결제 금액과 오차가 있을 수 있습니다.
            </p>
          </div>

          {/* Privacy Guarantee Note */}
          <div className="pt-4">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/15 text-emerald-400/90 text-[11px]">
              <ShieldCheck size={14} className="shrink-0 text-emerald-400" />
              <span>Vibe Vault는 광고 추적기, 외부 분석 픽셀, 서버 텔레메트리를 포함하지 않습니다.</span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/[0.06] shrink-0 bg-[#0E1015]/90">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] active:scale-[0.99] text-white text-xs font-medium border border-white/[0.08] transition-all cursor-pointer"
          >
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
};
