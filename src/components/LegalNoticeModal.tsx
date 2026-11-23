import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type LegalNoticeTab =
  | 'privacy'
  | 'terms'
  | 'licenses'
  | 'community'
  | 'cookies'
  | 'legal';

type ResolvedTab = 'privacy' | 'terms' | 'licenses' | 'community' | 'cookies';

export interface LegalNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: LegalNoticeTab;
}

interface OpenSourceDependency {
  name: string;
  license: string;
  author: string;
  description: string;
  category: string;
}

const CORE_DEPENDENCIES: OpenSourceDependency[] = [
  {
    name: 'React 19 (react, react-dom)',
    license: 'MIT License',
    author: 'Meta Platforms, Inc.',
    description: '반응형 UI 컴포넌트 아키텍처 및 훅(Hooks) 기반 상태 관리 런타임',
    category: 'Core Runtime',
  },
  {
    name: 'TypeScript',
    license: 'Apache-2.0 License',
    author: 'Microsoft Corporation',
    description: '정적 타입 검증 기반 안전한 금융 데이터 모델링 및 컴파일러',
    category: 'Language',
  },
  {
    name: 'Vite & @vitejs/plugin-react',
    license: 'MIT License',
    author: 'Evan You & Vite Contributors',
    description: 'ES 모듈 기반 고속 번들러 빌드 툴체인 및 개발 서버',
    category: 'Build Toolchain',
  },
  {
    name: 'Tailwind CSS v4 & @tailwindcss/vite',
    license: 'MIT License',
    author: 'Tailwind Labs, Inc.',
    description: '유틸리티 퍼스트 스타일 엔진 및 옵시디언 다크 디자인 토큰',
    category: 'Design System',
  },
  {
    name: 'vite-plugin-pwa & Workbox',
    license: 'MIT License',
    author: 'Anthony Fu & Google Chrome Team',
    description: '오프라인 우선 프로그레시브 웹 앱(PWA) 및 캐시 격리 서비스 워커',
    category: 'Offline / PWA',
  },
  {
    name: 'Express',
    license: 'MIT License',
    author: 'OpenJS Foundation & Express Contributors',
    description: '로컬 루프백 API 프록시 및 정적 자산 서빙 미들웨어',
    category: 'Local Server',
  },
  {
    name: 'idb',
    license: 'ISC License',
    author: 'Jake Archibald',
    description: 'IndexedDB 프로미스 래퍼 기반 영구 로컬 암호화 저장소',
    category: 'Local Storage',
  },
  {
    name: 'Recharts',
    license: 'MIT License',
    author: 'Recharts Community',
    description: '순자산 추이 및 월별·연간 지출 통계 반응형 시각화 차트 엔진',
    category: 'Visualization',
  },
  {
    name: 'date-fns',
    license: 'MIT License',
    author: 'Sasha Koss & Lesha Koss',
    description: '불변 객체 기반 모듈식 경량 날짜 계산 및 금융 타임스탬프 포맷팅',
    category: 'Date Utility',
  },
  {
    name: 'Lucide React',
    license: 'ISC License',
    author: 'Lucide Contributors',
    description: '일관된 그리드 정렬을 제공하는 경량 벡터 아이콘 라이브러리',
    category: 'Iconography',
  },
  {
    name: '@google/genai (Google Gen AI SDK)',
    license: 'Apache-2.0 License',
    author: 'Google LLC',
    description: '선택적 클라우드 Gemini 모델 영수증 OCR 및 자연어 거래 파싱 인터페이스',
    category: 'AI Interface',
  },
  {
    name: 'Web Crypto API',
    license: 'W3C Recommendation Standard',
    author: 'W3C Web Cryptography Working Group',
    description: '브라우저 네이티브 AES-256-GCM / PBKDF2 영지식 암호화 표준',
    category: 'Security Standard',
  },
  {
    name: 'Frankfurter API',
    license: 'MIT / Open Reference Data',
    author: 'European Central Bank & Frankfurter Team',
    description: '유럽중앙은행(ECB) 공시 기준 다통화(KRW/USD/EUR/JPY 등) 일일 기준 환율',
    category: 'Financial FX Data',
  },
];

const TAB_ITEMS: { id: ResolvedTab; label: string; title: string }[] = [
  {
    id: 'privacy',
    label: '개인정보처리방침',
    title: '개인정보처리방침',
  },
  {
    id: 'terms',
    label: '이용약관',
    title: '이용약관 및 법적 고지',
  },
  {
    id: 'licenses',
    label: '오픈소스 라이선스',
    title: '오픈소스 라이선스',
  },
  {
    id: 'community',
    label: '커뮤니티 이용 규약',
    title: '커뮤니티 이용 규약',
  },
  {
    id: 'cookies',
    label: '쿠키 정책',
    title: '쿠키 정책 (No Cookies)',
  },
];

function resolveInitialTab(tab?: LegalNoticeTab): ResolvedTab {
  if (!tab || tab === 'legal') return 'terms';
  return tab;
}

export const LegalNoticeModal: React.FC<LegalNoticeModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'privacy' as LegalNoticeTab,
}) => {
  const [activeTab, setActiveTab] = useState<ResolvedTab>(() => resolveInitialTab(initialTab));

  useEffect(() => {
    if (isOpen) {
      setActiveTab(resolveInitialTab(initialTab));
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const currentMeta = TAB_ITEMS.find((t) => t.id === activeTab) || TAB_ITEMS[0];

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-notice-title"
    >
      <div
        className="w-full max-w-2xl h-[620px] max-h-[88dvh] flex flex-col bg-[#0C0E13] border border-white/[0.09] rounded-2xl overflow-hidden text-neutral-100 antialiased shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-white/[0.07] shrink-0">
          <h2 id="legal-notice-title" className="text-base font-semibold text-white tracking-tight">
            {currentMeta.title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-lg border border-transparent hover:border-white/[0.09] hover:bg-white/[0.06] text-neutral-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 py-3 border-b border-white/[0.06] shrink-0 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1.5 min-w-max" role="tablist" aria-label="정책 및 약관 메뉴">
            {TAB_ITEMS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                    isActive
                      ? 'bg-white text-[#090A0D] font-semibold'
                      : 'text-neutral-300 hover:text-white hover:bg-white/[0.05] font-medium'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-xs text-neutral-300 leading-relaxed scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {/* 1. 개인정보처리방침 */}
          {activeTab === 'privacy' && (
            <div className="divide-y divide-white/[0.06] space-y-5">
              <div className="pt-0 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  01. 개인정보수집 없음 (Zero Personal Data Collection)
                </h3>
                <p className="leading-relaxed">
                  Vibe Vault(이하 &quot;본 서비스&quot;)는 회원가입, 로그인, 이름, 이메일, 전화번호, 계좌 실명 등 <strong className="text-white">어떠한 개인정보도 수집·저장·전송하지 않습니다.</strong> 운영자(한국센터글로벌네트워크 지식관리실)는 이용자의 금융 데이터에 접근할 수 있는 서버 데이터베이스를 운영하지 않습니다.
                </p>
              </div>

              <div className="pt-5 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  02. 온디바이스 로컬 암호화 보관
                </h3>
                <p className="leading-relaxed">
                  사용자가 입력하는 모든 자산, 거래 내역, 행사 정산 기록은 오직 사용자 본인의 기기 내 브라우저 <code className="text-white font-mono text-[11px] bg-white/[0.05] px-1 py-0.5 rounded">IndexedDB</code>에 Web Crypto API 기반 <strong className="text-white">AES-GCM-256</strong> 방식으로 암호화되어 보관됩니다. 마스터 PIN은 평문으로 저장되지 않으며, 파생된 암호화 키는 잠금 시 메모리에서 즉시 소거됩니다.
                </p>
              </div>

              <div className="pt-5 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  03. 선택적 AI 모델 연동 및 외부 전송 범위
                </h3>
                <p className="leading-relaxed">
                  온디바이스 로컬 AI(Ollama 또는 WebLLM)를 선택하면 입력 데이터는 외부 서버로 일절 전송되지 않습니다. 사용자가 명시적으로 <strong className="text-white">클라우드 AI(Google Gemini)</strong>를 선택한 경우에 한해, 영수증 이미지나 자연어 입력 텍스트가 파싱 목적으로 Google Gemini API로 전송될 수 있으며 운영자 서버에는 별도 저장되지 않습니다.
                </p>
              </div>

              <div className="pt-5 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  04. 추적기·광고·제3자 제공 없음
                </h3>
                <p className="leading-relaxed">
                  본 서비스는 개인을 식별하는 광고 SDK, 마케팅 픽셀, 행동 프로파일링 도구를 탑재하지 않으며, 수집하는 개인정보 자체가 없으므로 제3자 제공이나 위탁 처리도 발생하지 않습니다.
                </p>
              </div>
            </div>
          )}

          {/* 2. 이용약관 */}
          {activeTab === 'terms' && (
            <div className="divide-y divide-white/[0.06] space-y-5">
              <div className="pt-0 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  01. 서비스 성격 및 개인정보 미수집 원칙
                </h3>
                <p className="leading-relaxed">
                  Vibe Vault는 개인의 자율적인 자산 관리, 일상 가계부 기록 및 행사 경비 정산을 보조하는 <strong className="text-white">개인정보수집 없는 로컬 우선(Local-First) 웹 소프트웨어</strong>입니다. 별도의 계정 가입 없이 즉시 사용할 수 있으며, 이용자의 개인정보 및 금융 기록은 서버에 수집되지 않습니다.
                </p>
              </div>

              <div className="pt-5 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  02. 금융 및 투자 자문 면책
                </h3>
                <p className="leading-relaxed">
                  본 서비스는 자본시장법상의 금융투자업자, 투자자문업자 또는 공인 금융기관이 아니며, 어떠한 금융상품에 대한 투자 권유나 세무·회계·법률 자문을 제공하지 않습니다. 화면에 표시되는 순자산, 환산 금액, 현금흐름 예측은 참고용 추산치입니다.
                </p>
              </div>

              <div className="pt-5 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  03. 로컬 데이터 관리 및 백업 책임
                </h3>
                <p className="leading-relaxed">
                  모든 데이터는 사용자의 기기 브라우저에 단독 보관됩니다. 브라우저 데이터 초기화, 기기 분실·교체, 시크릿 모드 종료 또는 마스터 PIN 분실로 인한 데이터 유실은 서버에서 복구할 수 없으므로, 설정 메뉴의 <strong className="text-white">암호화 백업(VVLT_V1)</strong> 기능을 정기적으로 활용하시기 바랍니다.
                </p>
              </div>

              <div className="pt-5 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  04. AI 파싱 및 환율 정보 정확성 고지
                </h3>
                <p className="leading-relaxed">
                  영수증 OCR 및 자연어 거래 파싱은 AI 모델의 확률적 추론을 활용하므로 금액·가맹점 오인식이 발생할 수 있습니다. 저장 전 파싱 결과를 직접 확인하시기 바라며, 다중 통화 환산에 사용되는 일일 기준 환율(Frankfurter/ECB)은 실제 카드사 및 은행의 결제 환율과 차이가 있을 수 있습니다.
                </p>
              </div>
            </div>
          )}

          {/* 3. 오픈소스 라이선스 (MIT + Stack) */}
          {activeTab === 'licenses' && (
            <div className="space-y-6">
              {/* App's Own MIT License */}
              <div className="pb-5 border-b border-white/[0.07] space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[13px] font-semibold text-white tracking-tight">
                    Vibe Vault 자체 라이선스 — MIT License
                  </h3>
                  <span className="font-mono text-[11px] text-neutral-400">
                    SPDX: MIT
                  </span>
                </div>

                <p className="text-xs text-neutral-300 leading-relaxed">
                  Vibe Vault는 <strong className="text-white">MIT 라이선스</strong>로 배포되는 오픈소스 소프트웨어입니다. 저작권 표시 및 라이선스 고지를 유지하는 조건으로 누구나 자유롭게 사용, 복제, 수정, 병합, 게시, 배포할 수 있으며, 소프트웨어는 어떠한 보증 없이 있는 그대로(AS IS) 제공됩니다.
                </p>

                <pre className="text-[11px] text-neutral-300 leading-relaxed font-mono bg-white/[0.025] p-4 rounded-xl border border-white/[0.07] whitespace-pre-wrap overflow-x-auto">
{`MIT License

Copyright (c) 2026 한국센터글로벌네트워크 지식관리실 (Vibe Vault)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}
                </pre>
              </div>

              {/* Used Technology Stack & Third-Party Open Source Libraries */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2 pb-2 border-b border-white/[0.06]">
                  <h3 className="text-[13px] font-semibold text-white tracking-tight">
                    앱에 사용된 오픈소스 스택 및 라이브러리
                  </h3>
                  <span className="text-[11px] text-neutral-400 font-mono tabular-nums">
                    {CORE_DEPENDENCIES.length} Packages
                  </span>
                </div>

                <div className="divide-y divide-white/[0.05]">
                  {CORE_DEPENDENCIES.map((dep) => (
                    <div key={dep.name} className="py-3 first:pt-2 last:pb-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <h4 className="text-xs font-semibold text-white tracking-tight">
                            {dep.name}
                          </h4>
                          <span className="text-[11px] text-neutral-400">
                            · {dep.category}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-neutral-300 shrink-0">
                          {dep.license}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-neutral-500 mt-0.5">
                        {dep.author}
                      </div>
                      <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                        {dep.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 4. 커뮤니티 이용 규약 */}
          {activeTab === 'community' && (
            <div className="divide-y divide-white/[0.06] space-y-5">
              <div className="pt-0 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  01. 상호 존중과 열린 협업
                </h3>
                <p className="leading-relaxed">
                  Vibe Vault 및 Net-to-Dot / 고구마 유니버스 커뮤니티는 국적, 배경, 기술 숙련도와 무관하게 모든 구성원이 안전하고 존중받으며 의견을 나눌 수 있는 공간을 지향합니다. 건설적인 피드백과 예의 있는 소통을 기본 원칙으로 합니다.
                </p>
              </div>

              <div className="pt-5 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  02. 프라이버시 및 데이터 주권 존중
                </h3>
                <p className="leading-relaxed">
                  커뮤니티 채널에 이슈 리포트, 스크린샷, 거래 예시 등을 공유할 때 본인 또는 타인의 민감한 금융 정보, 계좌번호, API 키, 실명 등 개인식별정보가 노출되지 않도록 반드시 마스킹(가림 처리)해야 합니다.
                </p>
              </div>

              <div className="pt-5 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  03. 금지 행위
                </h3>
                <p className="leading-relaxed">
                  혐오 표현, 괴롭힘, 허위 금융 정보 유포, 불법적인 투자 리딩·스팸 홍보, 악성 코드 배포, 타인의 저작물 무단 도용 및 보안 취약점의 악의적 악용은 엄격히 금지됩니다.
                </p>
              </div>

              <div className="pt-5 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  04. 보안 제보 및 운영 문의
                </h3>
                <p className="leading-relaxed">
                  보안 취약점 발견, 라이선스 문의 또는 커뮤니티 규약 위반 신고는 공식 이메일{' '}
                  <a
                    href="mailto:master@goguma.app"
                    className="text-white underline underline-offset-2 decoration-white/30 hover:decoration-white font-mono"
                  >
                    master@goguma.app
                  </a>
                  으로 연락해 주시기 바랍니다.
                </p>
              </div>
            </div>
          )}

          {/* 5. 쿠키 정책 (No Cookies) */}
          {activeTab === 'cookies' && (
            <div className="divide-y divide-white/[0.06] space-y-5">
              <div className="pt-0 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  01. 쿠키 미사용 선언 (No Cookies)
                </h3>
                <p className="leading-relaxed">
                  Vibe Vault는 <strong className="text-white">어떠한 HTTP 쿠키(필수 쿠키, 세션 쿠키, 분석 쿠키, 제3자 광고 쿠키 포함)도 생성하거나 읽지 않습니다.</strong> 별도의 쿠키 동의 배너를 띄우지 않는 이유 역시 추적용 쿠키를 일절 사용하지 않기 때문입니다.
                </p>
              </div>

              <div className="pt-5 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  02. 브라우저 로컬 저장소 사용 안내
                </h3>
                <p className="leading-relaxed">
                  쿠키 대신 앱의 정상적인 오프라인 동작과 영지식 보안을 위해 사용자 기기 내부에만 머무는 브라우저 저장소를 사용합니다. 이 데이터는 외부 서버로 자동 전송되지 않습니다.
                </p>
                <ul className="mt-2 space-y-1.5 text-neutral-300 list-disc pl-4">
                  <li>
                    <strong className="text-white font-mono text-[11px]">IndexedDB</strong> — AES-GCM-256으로 암호화된 자산·거래 내역 및 비추출형 암호화 키 저장
                  </li>
                  <li>
                    <strong className="text-white font-mono text-[11px]">localStorage</strong> — 선택한 AI 모델, 통화·언어 설정, PIN 검증 메타데이터(솔트·검증 토큰) 저장
                  </li>
                  <li>
                    <strong className="text-white font-mono text-[11px]">sessionStorage</strong> — 현재 탭의 게스트 세션 여부 등 일시적 상태 유지 (탭 종료 시 자동 삭제)
                  </li>
                </ul>
              </div>

              <div className="pt-5 space-y-2">
                <h3 className="text-[13px] font-semibold text-white tracking-tight">
                  03. 데이터 직접 삭제 방법
                </h3>
                <p className="leading-relaxed">
                  사용자는 언제든지 앱 내 설정 메뉴의 데이터 초기화 기능 또는 브라우저의 사이트 데이터 삭제 기능을 통해 기기에 저장된 모든 로컬 데이터를 즉시 완전히 삭제할 수 있습니다.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.07] shrink-0 bg-[#0A0C10] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-[11px] text-neutral-400 space-y-0.5">
            <div className="text-neutral-200 font-medium">
              한국센터글로벌네트워크 지식관리실
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
              <span>사업자등록번호 141-82-83410</span>
              <span aria-hidden="true">·</span>
              <a
                href="mailto:master@goguma.app"
                className="font-mono text-neutral-300 hover:text-white transition-colors underline underline-offset-2 decoration-white/25"
              >
                master@goguma.app
              </a>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white text-[#090A0D] hover:bg-neutral-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
