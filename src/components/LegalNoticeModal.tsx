import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export interface LegalNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'legal' | 'licenses';
}

interface OpenSourceDependency {
  name: string;
  license: string;
  author: string;
  description: string;
  category?: string;
}

const CORE_DEPENDENCIES: OpenSourceDependency[] = [
  {
    name: 'React 19',
    license: 'MIT License',
    author: 'Meta Platforms, Inc.',
    description: '고성능 반응형 컴포넌트 아키텍처 및 훅(Hooks) 기반 상태 관리 런타임',
    category: 'Core Runtime',
  },
  {
    name: 'Vite & @vitejs/plugin-react',
    license: 'MIT License',
    author: 'Evan You & Vite Contributors',
    description: 'ES 모듈 기반 초고속 번들러 빌드 툴체인 및 개발 환경',
    category: 'Build Toolchain',
  },
  {
    name: 'Tailwind CSS v4',
    license: 'MIT License',
    author: 'Tailwind Labs, Inc.',
    description: '차세대 유틸리티 퍼스트 디자인 시스템 및 옵시디언 다크 테마 토큰',
    category: 'Design System',
  },
  {
    name: 'idb',
    license: 'ISC License',
    author: 'Jake Archibald',
    description: 'IndexedDB 프로미스 래퍼 기반 영구 로컬 암호화 데이터베이스 저장소',
    category: 'Local Storage',
  },
  {
    name: 'date-fns',
    license: 'MIT License',
    author: 'Sasha Koss & Lesha Koss',
    description: '불변 객체 기반 모듈식 경량 날짜 계산 및 금융 타임스탬프 포맷팅',
    category: 'Utility',
  },
  {
    name: 'Recharts',
    license: 'MIT License',
    author: 'Recharts Community',
    description: '순자산 추이 및 월별·연간 지출 통계 반응형 시각화 차트 엔진',
    category: 'Visualization',
  },
  {
    name: 'Lucide React',
    license: 'ISC License',
    author: 'Lucide Contributors',
    description: '엄격한 그리드 정렬을 보장하는 고해상도 벡터 마이크로 아이콘셋',
    category: 'Iconography',
  },
  {
    name: 'Motion',
    license: 'MIT License',
    author: 'Framer / Motion Team',
    description: '유려한 마이크로 인터랙션, 모달 제스처 및 트랜지션 애니메이션',
    category: 'Animation',
  },
  {
    name: 'Google Gen AI SDK',
    license: 'Apache-2.0 License',
    author: 'Google LLC',
    description: '멀티모달 Gemini 모델 금융 영수증 OCR 및 자연어 파싱 연동 인터페이스',
    category: 'AI Interface',
  },
  {
    name: 'Web Crypto API',
    license: 'W3C Recommendation Standard',
    author: 'W3C Web Cryptography Working Group',
    description: '브라우저 네이티브 AES-256-GCM / PBKDF2 영지식 암호화 표준 스펙',
    category: 'Security Standard',
  },
  {
    name: 'Frankfurter API',
    license: 'Open Reference Data',
    author: 'European Central Bank & Frankfurter Team',
    description: '유럽중앙은행(ECB) 공시 기준 실시간 다통화(KRW/USD/EUR/JPY 등) 환율 데이터',
    category: 'Financial FX Data',
  },
];

export const LegalNoticeModal: React.FC<LegalNoticeModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'legal',
}) => {
  const [activeTab, setActiveTab] = useState<'legal' | 'licenses'>(initialTab);

  // Sync active tab whenever modal opens with specified initialTab
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

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
      className="fixed inset-0 z-70 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-notice-title"
    >
      {/* 
        Fixed height container (h-[580px] sm:h-[600px] max-h-[85vh]):
        Prevents vertical displacement or wobble when toggling between tabs.
      */}
      <div
        className="w-full max-w-lg h-[580px] sm:h-[600px] max-h-[85vh] flex flex-col bg-[#0E1015] border border-white/[0.08] rounded-3xl overflow-hidden text-neutral-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed Height & Position */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-white/[0.06] shrink-0 bg-[#0E1015]">
          <div>
            <h2 id="legal-notice-title" className="text-sm font-semibold text-white tracking-tight">
              {activeTab === 'legal'
                ? '법적 고지 및 면책 조항'
                : '소프트웨어 라이센스 및 이용약관'}
            </h2>
            <p className="text-[11px] text-neutral-400 font-light mt-0.5">
              {activeTab === 'legal'
                ? 'Vibe Vault 이용자 유의사항 및 서비스 운영 원칙'
                : '개인 비영리 무상 사용 허가 및 상업적 배포·수정 금지 규정'}
            </p>
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

        {/* Segmented Tab Control - Fixed Anchor without icons */}
        <div className="px-6 pt-3 pb-2 shrink-0 bg-[#0E1015]">
          <div className="grid grid-cols-2 gap-1 bg-white/[0.04] p-1 rounded-2xl border border-white/[0.06]">
            <button
              type="button"
              onClick={() => setActiveTab('legal')}
              className={`py-1.5 px-3 transition-all cursor-pointer text-center ${
                activeTab === 'legal'
                  ? 'bg-white text-black font-semibold text-xs rounded-xl shadow-xs'
                  : 'text-neutral-400 hover:text-white text-xs'
              }`}
            >
              법적 고지
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('licenses')}
              className={`py-1.5 px-3 transition-all cursor-pointer text-center ${
                activeTab === 'licenses'
                  ? 'bg-white text-black font-semibold text-xs rounded-xl shadow-xs'
                  : 'text-neutral-400 hover:text-white text-xs'
              }`}
            >
              소프트웨어 라이센스
            </button>
          </div>
        </div>

        {/* Scrollable Content Body - Optimized Typography without Box-in-Box Nesting */}
        <div className="flex-1 overflow-y-auto px-6 py-4 text-xs text-neutral-300 leading-relaxed scrollbar-none font-sans [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {activeTab === 'legal' ? (
            <div className="divide-y divide-white/[0.05] space-y-4">
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
                  자산 및 거래 내역은 브라우저 내부 <code className="text-neutral-300 font-mono text-[11px] bg-white/[0.04] px-1 py-0.5 rounded">IndexedDB</code>에 로컬 보관됩니다. 클라우드 Gemini 분석을 선택하면 분석에 사용한 텍스트·이미지가 동일 기기의 로컬 Express 서버를 거쳐 Google로 전송될 수 있습니다. 온디바이스 모드에서는 해당 입력을 Gemini로 전송하지 않습니다. 브라우저 캐시 삭제, 시크릿 모드 종료, 기기 변경 또는 하드웨어 장애로 인한 데이터 유실에 대비해 설정 메뉴의 <strong>암호화 백업(VVLT_V1)</strong> 기능을 이용하시기 바랍니다.
                </p>
              </div>

              {/* Section 3: AI Parsing & Exchange Rate Notice */}
              <div className="pt-4 space-y-1.5">
                <h3 className="text-xs font-semibold text-white tracking-tight">
                  03. AI 파싱 및 환율 오차 고지
                </h3>
                <p className="text-neutral-400 text-[11.5px] leading-relaxed">
                  영수증 카메라 OCR 및 자연어 거래 파싱은 온디바이스 정규식 엔진 및 거대 언어 모델(LLM)의 확률적 추론에 기반하므로, 촬영 상태나 문맥에 따라 금액·가맹점 오인식이 발생할 수 있습니다. 거래 확정 전 파싱된 내역을 반드시 직접 검토하십시오. 환산에는 Frankfurter의 일일 기준 환율을 사용하며, 연결이 끊긴 경우 표시된 추정치 또는 오래된 환율은 실제 카드사 수수료와 은행 전신환율이 반영된 결제액과 다를 수 있습니다.
                </p>
              </div>

              {/* Section 4: AI API Key Security & Billing Disclaimer */}
              <div className="pt-4 space-y-1.5">
                <h3 className="text-xs font-semibold text-white tracking-tight">
                  04. AI API Key 보안 및 과금 면책
                </h3>
                <p className="text-neutral-400 text-[11.5px] leading-relaxed">
                  등록한 Gemini API 키는 브라우저의 vault 암호화 저장소에 보관되며, Gemini 분석 시 요청 본문에 포함되어 동일 기기의 로컬 Express 서버에서 사용됩니다. 서버는 루프백 주소에만 바인딩되며 원격 요청을 받지 않습니다. 분석 요청은 Google Gemini로 전달될 수 있고, 설정된 경우 서버 환경 변수의 키가 사용될 수도 있습니다. Google AI 사용료는 사용자의 계정에 부과됩니다.
                </p>
              </div>

              {/* Privacy Guarantee Note - Clean typographic border instead of box */}
              <div className="pt-4 pb-2">
                <div className="flex items-start gap-2.5 text-[11px] text-emerald-400/90 leading-relaxed border-l-2 border-emerald-400/50 pl-3 py-0.5">
                  <span>Vibe Vault는 광고 추적기와 외부 분석 픽셀을 포함하지 않습니다. 클라우드 AI 요청은 Google로 전송됩니다.</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 1. Proprietary Software License Statement */}
              <div className="pb-4 border-b border-white/[0.06] space-y-2.5">
                <p className="font-mono text-[10.5px] text-neutral-400">
                  © 2026 한국센터글로벌네트워크 지식관리실. All rights reserved.
                </p>

                {/* Korean Official License Terms */}
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                    라이센스 규정 (한국어)
                  </span>
                  <p className="text-[11px] text-neutral-300 leading-relaxed bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.04]">
                    본 소프트웨어(Vibe Vault)는 개인의 자율적인 가계부 관리 및 행사 정산을 위한 비영리적·개인적 용도의 무상 사용만을 허가합니다. 본 소프트웨어의 소스 코드 및 바이너리의 무단 수정, 2차 저작물 작성, 공공 배포, 서브라이선스 및 상업적 판매 행위는 저작권법 및 국제 협약에 의해 엄격히 금지됩니다. 본 소프트웨어는 어떠한 명시적·묵시적 보증 없이 있는 그대로(AS IS) 제공됩니다.
                  </p>
                </div>

                {/* English Official License Terms */}
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider font-mono">
                    Official Terms (English)
                  </span>
                  <p className="text-[11px] text-neutral-400 leading-relaxed font-mono bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.04]">
                    &quot;This software (Vibe Vault) is made available free of charge strictly for non-commercial, personal use in tracking personal finances and event settlements. Unauthorized modification, derivative works, public distribution, sublicensing, or commercial resale of the software source code or binaries is strictly prohibited by copyright laws and international treaties. This software is provided &apos;AS IS&apos;, without warranty of any kind.&quot;
                  </p>
                </div>
              </div>

              {/* 2. Core Dependencies Section - Third-Party Open Source Infrastructure Credits */}
              <div>
                <div className="pb-2 mb-1 border-b border-white/[0.04] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-neutral-300">
                      오픈소스 인프라 의존성 및 서드파티 크레딧
                    </span>
                    <span className="text-[10.5px] text-neutral-500 font-mono">
                      {CORE_DEPENDENCIES.length} Packages
                    </span>
                  </div>
                  <p className="text-[10.5px] text-neutral-500 leading-snug">
                    본 소프트웨어가 탑재한 하위 오픈소스 프레임워크 및 라이브러리는 각 원저작권자의 독립 라이센스(MIT, ISC, Apache-2.0 등)가 적용됩니다.
                  </p>
                </div>

                <div className="divide-y divide-white/[0.04]">
                  {CORE_DEPENDENCIES.map((dep) => (
                    <div
                      key={dep.name}
                      className="py-2.5 first:pt-1.5 last:pb-1 group hover:bg-white/[0.015] -mx-2 px-2 rounded-lg transition-colors"
                    >
                      {/* Name & License line */}
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-medium text-white tracking-tight group-hover:text-emerald-300 transition-colors">
                            {dep.name}
                          </h4>
                          {dep.category && (
                            <span className="text-[9.5px] font-mono text-neutral-500">
                              · {dep.category}
                            </span>
                          )}
                        </div>
                        <span className="text-[10.5px] font-mono text-neutral-400 shrink-0">
                          {dep.license}
                        </span>
                      </div>

                      {/* Author metadata */}
                      <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
                        {dep.author}
                      </div>

                      {/* Description */}
                      <p className="text-[11px] text-neutral-400 mt-1 leading-snug">
                        {dep.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Fixed Height & Position */}
        <div className="px-6 py-3.5 border-t border-white/[0.06] shrink-0 bg-[#0E1015] space-y-2.5">
          <div className="text-[10.5px] text-neutral-400 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-neutral-300">한국센터글로벌네트워크 지식관리실</span>
              <a
                href="mailto:master@goguma.app"
                className="text-neutral-400 hover:text-white transition-colors underline underline-offset-2 font-mono text-[10px]"
              >
                master@goguma.app
              </a>
            </div>
            <p className="text-[9.5px] text-neutral-400">
              © 2026 한국센터글로벌네트워크 지식관리실. All rights reserved.
            </p>
          </div>

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
