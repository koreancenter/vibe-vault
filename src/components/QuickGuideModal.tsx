import React, { useEffect } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { useI18n } from '../i18n';

interface QuickGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTryPrompt: (promptText: string, isQuery: boolean) => void;
  onResetChecklist: () => void;
  onOpenWelcome: () => void;
  showResetChecklistButton: boolean;
}

const TAB_GUIDE_KO = [
  {
    name: '자산',
    description: '은행·증권·현금 계좌 잔액과 신용카드 미결제 잔액을 통합해 총 순자산을 집계합니다.',
  },
  {
    name: '장부',
    description: '일일 지출·수입·이체·더치페이 정산 등 현금흐름을 기록합니다. 계좌 잔액과는 정석 분리 관리됩니다.',
  },
  {
    name: '인사이트',
    description: '월별 저축률, 카테고리별 지출 비중, AI 재정 진단 및 자연어 재무 질의를 제공합니다.',
  },
] as const;

const TAB_GUIDE_EN = [
  {
    name: 'Vault',
    description: 'Tracks bank, brokerage, cash balances, and unpaid credit card balances to calculate total net worth.',
  },
  {
    name: 'Ledger',
    description: 'Records daily expenses, income, transfers, and split settlements as cashflow separate from account snapshots.',
  },
  {
    name: 'Insights',
    description: 'Provides monthly savings rate, category spending breakdown, AI executive diagnosis, and natural-language queries.',
  },
] as const;

const OMNIBAR_EXAMPLES_KO = [
  { category: '지출 기록', prompt: '점심 김치찌개 11,000원 카드 결제', isQuery: false },
  { category: '수입 기록', prompt: '월급 320만원 통장 입금', isQuery: false },
  { category: '할부 · 정산', prompt: '저녁 회식 12만원 4명 더치페이', isQuery: false },
  { category: 'AI 질문', prompt: '이번 달 식비 얼마야?', isQuery: true },
] as const;

const OMNIBAR_EXAMPLES_EN = [
  { category: 'Expense', prompt: 'Lunch pasta $18 card', isQuery: false },
  { category: 'Income', prompt: 'Monthly salary $3,200 bank deposit', isQuery: false },
  { category: 'Split', prompt: 'Team dinner $120 split 4 ways', isQuery: false },
  { category: 'AI Query', prompt: 'How much did I spend on food this month?', isQuery: true },
] as const;

export const QuickGuideModal: React.FC<QuickGuideModalProps> = ({
  isOpen,
  onClose,
  onTryPrompt,
  onResetChecklist,
  onOpenWelcome,
  showResetChecklistButton,
}) => {
  const { language } = useI18n();
  const isKo = language === 'ko';
  const tabGuideItems = isKo ? TAB_GUIDE_KO : TAB_GUIDE_EN;
  const omnibarExamples = isKo ? OMNIBAR_EXAMPLES_KO : OMNIBAR_EXAMPLES_EN;

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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-guide-modal-title"
    >
      <div
        className="w-full sm:max-w-lg max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[var(--surface-panel)] text-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2 id="quick-guide-modal-title" className="text-sm font-semibold text-white tracking-tight">
              {isKo ? 'Vibe Vault 사용 가이드' : 'Vibe Vault Usage Guide'}
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {isKo
                ? '3개 탭 구조와 옴니바 자연어 입력 예시를 확인하세요.'
                : 'Explore the 3-tab structure and tap any omnibar example to try it.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isKo ? '사용 가이드 닫기' : 'Close guide'}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* 1. Three-Tab Architecture */}
          <section aria-labelledby="guide-section-tabs">
            <h3 id="guide-section-tabs" className="text-xs font-semibold text-neutral-200 mb-2.5">
              {isKo ? '01. 3개 탭 구조 한눈에 보기' : '01. Three-Tab Overview'}
            </h3>
            <dl className="divide-y divide-white/[0.07] border-t border-b border-white/[0.07]">
              {tabGuideItems.map((item) => (
                <div key={item.name} className="py-3 grid grid-cols-[4.5rem_1fr] gap-3 items-baseline">
                  <dt className="text-xs font-semibold text-white">{item.name}</dt>
                  <dd className="text-xs text-neutral-300 leading-relaxed">{item.description}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* 2. Click-to-Try Omnibar Examples */}
          <section aria-labelledby="guide-section-omnibar">
            <div className="flex items-baseline justify-between gap-2 mb-2.5">
              <h3 id="guide-section-omnibar" className="text-xs font-semibold text-neutral-200">
                {isKo ? '02. 옴니바 입력 예시' : '02. Omnibar Input Examples'}
              </h3>
              <span className="text-[11px] text-neutral-400">
                {isKo ? '클릭하면 바로 실행' : 'Tap to run'}
              </span>
            </div>
            <div className="divide-y divide-white/[0.07] border-t border-b border-white/[0.07]">
              {omnibarExamples.map((example) => (
                <button
                  key={example.prompt}
                  type="button"
                  onClick={() => {
                    onClose();
                    onTryPrompt(example.prompt, example.isQuery);
                  }}
                  className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.04] transition-colors cursor-pointer group px-1 -mx-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                >
                  <div className="min-w-0 flex items-baseline gap-2.5">
                    <span className="text-[11px] font-medium text-[var(--color-accent)] shrink-0 w-16">
                      {example.category}
                    </span>
                    <span className="text-xs text-neutral-200 group-hover:text-white truncate">
                      {example.prompt}
                    </span>
                  </div>
                  <ArrowRight
                    size={13}
                    className="text-neutral-500 group-hover:text-white shrink-0 transition-transform group-hover:translate-x-0.5"
                  />
                </button>
              ))}
            </div>
          </section>

          {/* 3. Key FAQ */}
          <section aria-labelledby="guide-section-faq">
            <h3 id="guide-section-faq" className="text-xs font-semibold text-neutral-200 mb-2.5">
              {isKo ? '03. 자주 묻는 질문' : '03. Frequently Asked Questions'}
            </h3>
            <div className="space-y-3.5 text-xs">
              <div>
                <p className="font-medium text-white">
                  {isKo
                    ? '수입을 입력했는데 총 순자산이 올라가지 않아요.'
                    : 'Why did my Net Worth stay the same after logging income?'}
                </p>
                <p className="mt-1 text-neutral-300 leading-relaxed">
                  {isKo
                    ? '옴니바에 입력한 거래는 장부(월간 현금흐름)에 기록되며, 총 순자산은 자산 탭에 등록된 실제 계좌 잔액을 기준으로 집계됩니다. 자산 탭에서 보유 계좌를 1개 이상 등록해 주세요.'
                    : 'Omnibar entries are recorded in your Ledger (monthly cashflow), while Net Worth is calculated strictly from registered account balances in the Vault tab. Add at least one account to track Net Worth.'}
                </p>
              </div>
              <div className="pt-3 border-t border-white/[0.07]">
                <p className="font-medium text-white">
                  {isKo
                    ? '게스트 모드 데이터는 계속 보관되나요?'
                    : 'Is Guest Mode data saved permanently?'}
                </p>
                <p className="mt-1 text-neutral-300 leading-relaxed">
                  {isKo
                    ? '게스트 모드는 현재 브라우저 세션에서만 체험용으로 유지되며 종료 시 초기화됩니다. 영구 암호화 보관을 원하시면 로컬 계정을 생성해 이용해 주세요.'
                    : 'Guest Mode keeps temporary session data only and clears when you sign out. Create a local account with a Master PIN for persistent on-device AES-GCM-256 encryption.'}
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/[0.08] flex items-center justify-between gap-2 shrink-0 bg-black/20">
          <div className="flex items-center gap-3">
            {showResetChecklistButton && (
              <button
                type="button"
                onClick={() => {
                  onResetChecklist();
                  onClose();
                }}
                className="text-xs text-neutral-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                {isKo ? '시작 가이드 다시 표시' : 'Show Quick Start'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenWelcome();
              }}
              className="text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              {isKo ? '웰컴 화면 보기' : 'Welcome Screen'}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap active:scale-95"
          >
            {isKo ? '닫기' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickGuideModal;
