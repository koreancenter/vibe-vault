import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n, LanguageCode } from '../i18n';

export const APP_VERSION = '0.1.2';
export const CHANGELOG_SEEN_KEY = 'vibe_changelog_seen_version';

export interface ChangelogEntry {
  version: string;
  date: string;
  title: Record<LanguageCode, string>;
  tag: Record<LanguageCode, string>;
  note: Record<LanguageCode, string>;
  highlights: Record<LanguageCode, string[]>;
  isLatest?: boolean;
}

const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: 'v0.1.2',
    date: '2026.11.15',
    isLatest: true,
    tag: {
      ko: 'Latest Release',
      en: 'Latest Release',
      ja: 'Latest Release',
      eu: 'Latest Release',
    },
    title: {
      ko: 'AI 추론 글로우 & 옴니바 도크 리파인먼트',
      en: 'Added AI Inference Glow & Refined Omnibar Dock',
      ja: 'AI推論グロー & オムニバードック洗練化',
      eu: 'AI Inference Glow & Refined Omnibar Dock',
    },
    note: {
      ko: '명령을 입력하는 찰나의 순간에도 AI가 살아 숨 쉬며 분석하고 있다는 감각을 전하고 싶었습니다. 하단 Omnibar의 불필요한 부피를 줄여 입력 공간을 넓히고, 추론 중에는 차분한 스카이블루 브리딩 글로우로 시각적 리듬을 더했습니다. PIN 잠금 화면과 설정 모달의 텍스트 명도 또한 어두운 화면에서도 또렷하게 읽히도록 정교하게 다듬었습니다.',
      en: 'We wanted every prompt to feel responsive the moment you hit enter. We streamlined the bottom Omnibar controls into a compact launcher, added a quiet sky-blue breathing glow during AI inference, and refined typography luminance across the lock screen and settings for effortless night reading.',
      ja: '入力した瞬間にAIが静かに思考している感覚を伝えるため、下部Omnibarのコントロールを整理し、推論中の穏やかなスカイブルーのグロー演出を追加しました。あわせてロック画面や設定モーダルの文字輝度も夜間でも読みやすいコントラストへと磨き上げています。',
      eu: 'We streamlined the bottom Omnibar controls into a compact launcher, added a subtle sky-blue breathing glow during AI inference, and refined typography luminance across the lock screen and settings for crisp contrast on dark surfaces.',
    },
    highlights: {
      ko: [
        'Omnibar AI 추론 대기 상태 스카이블루 브리딩 글로우 효과',
        'AI 엔진 뱃지 압축(C · O · W) 및 카메라·음성 입력 통합 메뉴(+)',
        '대시보드·설정·PIN 화면 텍스트 명도 개선 및 초기 번들 경량화',
      ],
      en: [
        'Sky-blue breathing inference glow on the Omnibar during active AI parsing',
        'Compact engine badges (C · O · W) and unified + menu for camera & voice input',
        'Higher typographic contrast across Settings & Lock Screen with leaner chunks',
      ],
      ja: [
        'AI解析中のOmnibarにスカイブルーの呼吸グロー効果を追加',
        'エンジン表記の簡略化(C・O・W)とカメラ・音声入力の統合メニュー(+)対応',
        '設定・ロック画面のテキスト視認性向上および初期バンドルの最適化',
      ],
      eu: [
        'Sky-blue breathing inference glow on the Omnibar during active AI parsing',
        'Compact engine badges (C · O · W) and unified + menu for camera & voice',
        'Refined typographic luminance across Settings and Lock Screen views',
      ],
    },
  },
  {
    version: 'v0.1.1',
    date: '2026.11.08',
    tag: {
      ko: 'Architecture',
      en: 'Architecture',
      ja: 'Architecture',
      eu: 'Architecture',
    },
    title: {
      ko: '다중 통화 금고 & 로컬 우선 AI 하이브리드 엔진',
      en: 'Multi-Currency Vault & Hybrid Local-First AI Engine',
      ja: 'マルチ通貨金庫 & ローカル優先ハイブリッドAI',
      eu: 'Multi-Currency Vault & Hybrid Local-First AI Engine',
    },
    note: {
      ko: '여행과 해외 결제, 그리고 모임 경비까지 하나의 일상 장부에 뒤섞이지 않도록 스페이스 격리 구조를 완성했습니다. Cloud AI의 정확함은 유지하면서도, 민감한 금융 기록을 기기 밖으로 한 줄도 내보내고 싶지 않을 때는 Ollama와 WebLLM(WebGPU)으로 즉시 전환할 수 있습니다.',
      en: 'We built isolated ledger spaces so trips, study groups, and project settlements never clutter your everyday budget. Alongside Gemini Cloud AI, you can switch seamlessly to Ollama or in-browser WebLLM (WebGPU) whenever you want zero bytes leaving your device.',
      ja: '旅行やイベントの精算が日常の家計簿と混ざらないよう、独立したスペース分離構造を実装しました。Gemini Cloud AIに加え、データを1バイトも外部へ送らず推論できるOllamaおよびWebLLM(WebGPU)への即時切替に対応しています。',
      eu: 'We built isolated ledger spaces so trips and project settlements stay separate from daily spending, paired with seamless switching between Cloud AI, Ollama Local, and in-browser WebLLM (WebGPU).',
    },
    highlights: {
      ko: [
        'KRW · USD · EUR · JPY · IDR 다중 통화 통합 순자산 평가 및 환율 연동',
        '일상 가계부와 독립된 프로젝트·행사 장부(Spaces) 및 1/N 정산 리포트',
        'Ollama Local Server 및 브라우저 내장 WebGPU(WebLLM) 오프라인 추론',
      ],
      en: [
        'Unified multi-currency net worth valuation across KRW, USD, EUR, JPY & IDR',
        'Isolated project & event spaces with instant Korean-style split settlement reports',
        'Offline AI inference via Ollama Local Server and in-browser WebLLM',
      ],
      ja: [
        'KRW・USD・EUR・JPY・IDRの多通貨統合評価および基準為替レート連動',
        '日常家計簿から分離されたイベントスペースと割り勘精算レポート出力',
        'Ollamaローカルサーバーおよびブラウザ内WebGPU(WebLLM)によるオフライン推論',
      ],
      eu: [
        'Unified multi-currency valuation across KRW, USD, EUR, JPY, and IDR',
        'Isolated project spaces with instant split-settlement reporting',
        'Offline AI inference via Ollama Local Server and in-browser WebLLM',
      ],
    },
  },
  {
    version: 'v0.1.0',
    date: '2026.10.29',
    tag: {
      ko: 'Initial Manifesto',
      en: 'Initial Manifesto',
      ja: 'Initial Manifesto',
      eu: 'Initial Manifesto',
    },
    title: {
      ko: '초기 선언: 100% 로컬 암호화 프라이빗 자산 금고',
      en: 'Initial Manifesto: 100% Local Encrypted Private Vault',
      ja: '初期マニフェスト：100%ローカル暗号化プライベート金庫',
      eu: 'Initial Manifesto: 100% Local Encrypted Private Vault',
    },
    note: {
      ko: 'Vibe Vault는 "내 금융 기록을 왜 남의 서버에 맡겨야 할까?"라는 질문에서 시작했습니다. 회원가입도, 중앙 데이터베이스도, 광고 추적기도 두지 않았습니다. 모든 장부와 영수증은 오직 당신의 브라우저 IndexedDB 안에서 AES-GCM-256으로 잠겨 있으며, 마스터 PIN을 아는 오직 당신만이 열 수 있습니다.',
      en: 'Vibe Vault began with a simple question: why should your financial life sit on someone else’s server? There are no sign-ups, no central databases, and no trackers. Every ledger entry stays sealed inside your browser’s IndexedDB with AES-GCM-256 encryption—readable only with your Master PIN.',
      ja: 'Vibe Vaultは「なぜ自分の金融記録を他人のサーバーに預けなければならないのか」という疑問から始まりました。会員登録も中央データベースも存在せず、すべての記録はブラウザ内のIndexedDBにAES-GCM-256で暗号化保存されます。',
      eu: 'Vibe Vault started with one principle: no accounts, no central databases, and no trackers. Every record remains sealed inside your browser IndexedDB with AES-GCM-256 encryption and your Master PIN.',
    },
    highlights: {
      ko: [
        'Zero-Knowledge 영지식 AES-GCM-256 로컬 암호화 및 마스터 PIN 잠금',
        '네트워크 단절 상태에서도 동작하는 오프라인 우선 PWA 금고 아키텍처',
        'Obsidian Minimalist 다크 인터페이스 & 프라이버시 스텔스 마스킹 모드',
      ],
      en: [
        'Zero-Knowledge AES-GCM-256 local encryption with Master PIN & biometric unlock',
        'Offline-first PWA architecture engineered to run smoothly without connectivity',
        'Obsidian Minimalist workspace with one-tap privacy stealth amount masking',
      ],
      ja: [
        'Zero-Knowledge AES-GCM-256ローカル暗号化とマスターPIN・生体認証ロック',
        'オフライン環境でも動作するローカル優先PWAアーキテクチャ',
        'Obsidian Minimalist UIおよび金額を即座に隠すステルスモード',
      ],
      eu: [
        'Zero-Knowledge AES-GCM-256 local encryption with Master PIN & biometrics',
        'Offline-first PWA architecture engineered for zero external dependencies',
        'Obsidian Minimalist workspace with one-tap stealth amount masking',
      ],
    },
  },
];

const UI_COPY: Record<
  LanguageCode,
  {
    kicker: string;
    heading: string;
    foreword: string;
    forewordLinkLabel: string;
    privacyFooter: string;
    closeBtn: string;
  }
> = {
  ko: {
    kicker: 'Release Chronology',
    heading: '개발자 노트 & 릴리스 연대기',
    foreword:
      "Vibe Vault의 모든 업데이트는 Net to Dot Movement 철학에 따라 '로컬 우선(Local-First), 영지식 암호화(Zero-Knowledge), 능동적 기기 활용(Active Usage)'을 최우선 원칙으로 삼습니다.",
    forewordLinkLabel: 'Net to Dot Movement · nettodot.org',
    privacyFooter: '100% 오프라인 정적 아카이브 · 외부 전송 없음',
    closeBtn: '닫기',
  },
  en: {
    kicker: 'Release Chronology',
    heading: "Changelog & Developer's Notes",
    foreword:
      'In accordance with the Net to Dot Movement, every Vibe Vault update will always prioritize Local-First architecture, Zero-Knowledge privacy, and Active Mobile Device Usage.',
    forewordLinkLabel: 'Net to Dot Movement · nettodot.org',
    privacyFooter: '100% Offline Static Archive · Zero External Requests',
    closeBtn: 'Close',
  },
  ja: {
    kicker: 'Release Chronology',
    heading: '開発者ノート & リリース年表',
    foreword:
      'Vibe Vaultのすべてのアップデートは、Net to Dot Movementの理念に基づき「ローカル優先・ゼロ知識暗号化・能動的なデバイス活用」を最優先原則とします。',
    forewordLinkLabel: 'Net to Dot Movement · nettodot.org',
    privacyFooter: '100% オフライン静的アーカイブ · 外部通信なし',
    closeBtn: '閉じる',
  },
  eu: {
    kicker: 'Release Chronology',
    heading: "Changelog & Developer's Notes",
    foreword:
      'In accordance with the Net to Dot Movement, every Vibe Vault update will always prioritize Local-First architecture, Zero-Knowledge privacy, and Active Mobile Device Usage.',
    forewordLinkLabel: 'Net to Dot Movement · nettodot.org',
    privacyFooter: '100% Offline Static Archive · Zero External Requests',
    closeBtn: 'Close',
  },
};

export interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
  const { language, t } = useI18n();
  const copy = UI_COPY[language] || UI_COPY.en;

  const handleClose = useCallback(() => {
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

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl bg-[#090A0D] border border-white/[0.08] text-neutral-100 antialiased shadow-[0_32px_64px_-16px_rgba(0,0,0,0.95)] flex flex-col max-h-[90dvh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scrollable Borderless Editorial Canvas */}
        <div className="flex-1 overflow-y-auto px-7 py-8 sm:px-11 sm:py-10">
          {/* Header */}
          <header className="flex items-start justify-between gap-6 mb-8">
            <div className="min-w-0">
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-sky-300">
                {copy.kicker}
              </p>
              <h2
                id="changelog-modal-title"
                className="text-2xl sm:text-[26px] font-medium tracking-tight text-white mt-2 leading-tight"
              >
                {copy.heading}
              </h2>
            </div>

            <button
              type="button"
              onClick={handleClose}
              aria-label={t('close')}
              className="w-9 h-9 -mr-1.5 -mt-1 rounded-full flex items-center justify-center text-neutral-200 hover:text-white transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </header>

          {/* Foreword: Net to Dot Movement Manifesto */}
          <blockquote className="mb-12 text-xs text-neutral-200 font-normal leading-relaxed border-l border-white/20 pl-4 space-y-2">
            <p>{copy.foreword}</p>
            <div>
              <a
                href="https://nettodot.org"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-neutral-100 hover:text-sky-300 transition-colors underline underline-offset-4 decoration-white/30"
              >
                {copy.forewordLinkLabel}
              </a>
            </div>
          </blockquote>

          {/* Vertical Editorial Timeline */}
          <div className="relative pl-6 sm:pl-7">
            {/* Continuous Subtle Vertical Hairline */}
            <span
              aria-hidden="true"
              className="absolute left-[2.5px] top-1.5 bottom-2 w-px bg-white/10"
            />

            <div className="flex flex-col gap-8">
              {CHANGELOG_ENTRIES.map((entry, idx) => {
                const isLast = idx === CHANGELOG_ENTRIES.length - 1;
                const entryTitle = entry.title[language] || entry.title.en;
                const entryTag = entry.tag[language] || entry.tag.en;
                const entryNote = entry.note[language] || entry.note.en;
                const entryHighlights = entry.highlights[language] || entry.highlights.en;

                return (
                  <article
                    key={entry.version}
                    className={`relative ${isLast ? '' : 'pb-2'}`}
                  >
                    {/* Timeline Node Dot aligned on the w-px hairline */}
                    <span
                      aria-hidden="true"
                      className={`absolute -left-6 sm:-left-7 top-1.5 w-1.5 h-1.5 rounded-full ${
                        entry.isLatest
                          ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]'
                          : 'bg-sky-400/70 shadow-[0_0_6px_rgba(56,189,248,0.35)]'
                      }`}
                    />

                    {/* Date & Version Row */}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="text-sky-300 font-mono text-xs font-medium tabular-nums">
                        {entry.version}
                      </span>
                      <span aria-hidden="true" className="text-neutral-400 text-[10px]">
                        /
                      </span>
                      <time
                        dateTime={entry.date.replace(/\./g, '-')}
                        className="text-[10px] text-neutral-200 font-mono tabular-nums"
                      >
                        {entry.date}
                      </time>
                      <span aria-hidden="true" className="text-neutral-400 text-[10px]">
                        ·
                      </span>
                      <span className="text-[10px] text-neutral-200 font-mono tracking-wide">
                        {entryTag}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-base text-white font-medium tracking-tight mt-2 leading-snug">
                      {entryTitle}
                    </h3>

                    {/* Free-flowing Developer's Note */}
                    <p className="text-sm text-neutral-100 font-normal leading-relaxed mt-3">
                      {entryNote}
                    </p>

                    {/* Borderless Typographic Highlights */}
                    <ul className="mt-4 space-y-1.5">
                      {entryHighlights.map((item) => (
                        <li
                          key={item}
                          className="flex items-baseline gap-2.5 text-xs text-neutral-200 leading-relaxed"
                        >
                          <span aria-hidden="true" className="font-mono text-sky-300 text-[10px] shrink-0">
                            —
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </div>

          {/* Quiet Typographic Sign-off */}
          <footer className="mt-12 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <span className="font-mono text-[10px] text-neutral-200 tracking-wide">
              {copy.privacyFooter}
            </span>
            <button
              type="button"
              onClick={handleClose}
              className="self-start sm:self-auto font-mono text-xs text-white hover:text-sky-300 transition-colors underline underline-offset-4 decoration-white/30 cursor-pointer"
            >
              {copy.closeBtn}
            </button>
          </footer>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ChangelogModal;
