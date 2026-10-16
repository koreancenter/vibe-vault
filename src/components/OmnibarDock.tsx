import React, { useState } from 'react';
import { 
  Camera, 
  Mic, 
  MicOff, 
  X, 
  Send, 
  Sparkles,
  Loader2 
} from 'lucide-react';
import { SupportedCurrency, LaunchScreenMode } from '../types';
import { getCurrencySymbol, getCategoryKo } from '../utils';

// Global Quick Suggestion Chips (Featured analytical query tags + quick ledger entries)
const SUGGESTION_CHIPS = [
  { label: '#9월 환차익', value: '9월 환차익', isQuery: true },
  { label: '#식비 분석', value: '식비 분석', isQuery: true },
  { label: '#주말 지출', value: '주말 지출', isQuery: true },
  { label: '#커피 4,500원', value: '스타벅스 아메리카노 4500원 카드 결제', isQuery: false },
  { label: '#식사 12,000원', value: '점심 순두부찌개 12000원 계좌이체', isQuery: false },
  { label: '#장보기 35,000원', value: '이마트 장보기 35000원 현대카드', isQuery: false }
];

export interface RealtimePreviewData {
  merchant?: string;
  amount?: number;
  category?: string;
  currency?: SupportedCurrency;
  isDutch?: boolean;
}

export interface OmnibarDockProps {
  input: string;
  setInput: (value: string) => void;
  isProcessing: boolean;
  isOnline: boolean;
  currentCurrency: SupportedCurrency;
  isMultiCurrencyMode: boolean;
  realtimePreview: RealtimePreviewData | null;
  engineStatus: string;
  onSubmit: () => void;
  onOpenReceiptScanner: () => void;
  onCycleCurrency: () => void;
  isListening?: boolean;
  onToggleListen?: () => void;
  error?: string | null;
  onClearError?: () => void;
  mode?: LaunchScreenMode;
  onRunQuery?: (queryText: string) => void;
  placeholder?: string;
}

const getPlaceholderByMode = (mode?: LaunchScreenMode | string) => {
  switch (mode) {
    case 'vault':
      return '예: 신한 마통 -350만, 토스증권 1,250만';
    case 'insights':
      return '예: 9월 환차익 얼마야?, 이번 달 식비 비중';
    case 'ledger':
    default:
      return '예: 점심 9천원, 갤럭시북 180만 10개월 할부';
  }
};

export const OmnibarDock: React.FC<OmnibarDockProps> = ({
  input,
  setInput,
  isProcessing,
  isOnline,
  currentCurrency,
  isMultiCurrencyMode: _isMultiCurrencyMode,
  realtimePreview,
  engineStatus: _engineStatus,
  onSubmit,
  onOpenReceiptScanner,
  onCycleCurrency,
  isListening = false,
  onToggleListen,
  error,
  onClearError,
  mode = 'ledger',
  onRunQuery,
  placeholder,
}) => {
  const [isInputFocused, setIsInputFocused] = useState(false);
  const isInsightsMode = mode === 'insights';
  const isTyping = input.trim().length > 0;

  const inputPlaceholder = placeholder || getPlaceholderByMode(mode);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    
    // Check if input is an analytical query
    const isQueryIntent = /(?:환차익|환손익|환차|환율|외환|분석|총액|얼마|추이|주말\s*지출)/i.test(input) || 
      /^(?:식비|교통비|생활비)(?:\s*분석)?$/i.test(input) || 
      isInsightsMode;

    if (isQueryIntent && onRunQuery) {
      onRunQuery(input);
    } else {
      onSubmit();
    }
  };

  const handleChipClick = (chip: { label: string; value: string; isQuery: boolean }) => {
    setInput(chip.value);
    if (chip.isQuery && onRunQuery) {
      onRunQuery(chip.value);
    } else if (!chip.isQuery) {
      onSubmit();
    }
  };

  return (
    <div className="w-full">
      {/* Error notification */}
      {error && (
        <div className="mb-2 text-xs text-neutral-300 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-1.5 flex items-center justify-between">
          <span className="truncate">{error}</span>
          {onClearError && (
            <button 
              type="button" 
              onClick={onClearError} 
              aria-label="오류 알림 닫기"
              className="text-neutral-400 hover:text-white ml-1 font-bold cursor-pointer transition-colors"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Real-time Extraction Preview Chips (Ledger mode only) */}
      {!isInsightsMode && realtimePreview && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1.5 animate-in fade-in duration-150">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-white/10 text-slate-300">
            실시간 분석
          </span>

          {/* Merchant Chip */}
          {realtimePreview.merchant && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full shrink-0 bg-blue-500/15 text-blue-300">
              <span>가맹점:</span>
              <strong className="font-bold">{realtimePreview.merchant}</strong>
            </span>
          )}

          {/* Amount Chip */}
          {realtimePreview.amount !== undefined && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0 bg-[#38bdf8]/15 text-[#38bdf8]">
              <span>금액:</span>
              <strong>{getCurrencySymbol(realtimePreview.currency || currentCurrency)}{realtimePreview.amount.toLocaleString()}</strong>
            </span>
          )}

          {/* Category Chip */}
          {realtimePreview.category && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full shrink-0 bg-purple-500/15 text-purple-300">
              <span>분류:</span>
              <strong>{getCategoryKo(realtimePreview.category)}</strong>
            </span>
          )}

          {/* Dutch Pay Tag */}
          {realtimePreview.isDutch && (
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0 bg-amber-500/15 text-amber-300">
              정산/더치페이
            </span>
          )}
        </div>
      )}

      {/* Quick Tag Chips Row: displayed when input field is focused (featuring #9월 환차익, #식비 분석, #주말 지출) */}
      {isInputFocused && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150">
          {SUGGESTION_CHIPS.map(chip => (
            <button
              key={chip.label}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleChipClick(chip);
              }}
              className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs transition-colors cursor-pointer ${
                chip.isQuery 
                  ? 'bg-indigo-500/15 hover:bg-indigo-500/25 active:bg-indigo-500/30 text-indigo-300 border border-indigo-500/20' 
                  : 'bg-white/[0.06] hover:bg-white/10 active:bg-white/15 text-slate-300'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Modern AI Search Bar */}
      <form 
        onSubmit={handleFormSubmit}
        className={`relative rounded-2xl p-[1px] transition-all duration-200 ${
          isInputFocused 
            ? 'bg-white/20 shadow-[0_0_15px_rgba(255,255,255,0.06)]' 
            : 'bg-white/[0.08]'
        }`}
      >
        <div className="flex items-center gap-1 rounded-[15px] px-2 py-1 transition-colors bg-[#090A0D]/95 backdrop-blur-2xl">
          {/* Left Icon Group (Camera & Mic): Auto-collapsed when typing to give 100% width to text input */}
          {!isTyping && (
            <div className="flex items-center gap-0.5 shrink-0 animate-in fade-in duration-150">
              {/* Camera / Receipt Scanner Trigger */}
              <button
                id="omnibar-receipt-scanner-btn"
                type="button"
                onClick={onOpenReceiptScanner}
                title="영수증 AI 스캔"
                aria-label="영수증 AI 스캔"
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all text-neutral-400 hover:text-white hover:bg-white/[0.04] active:scale-95 cursor-pointer shrink-0"
              >
                <Camera size={16} />
              </button>

              {/* Mic button */}
              {onToggleListen && (
                <button
                  id="voice-stt-btn"
                  type="button"
                  onClick={onToggleListen}
                  title={isListening ? '음성 입력 중지' : '음성으로 입력하기'}
                  aria-label="음성으로 입력하기"
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                    isListening
                      ? 'bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.3)] animate-pulse'
                      : 'text-neutral-400 hover:text-white hover:bg-white/[0.04] active:scale-95'
                  }`}
                >
                  {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}
            </div>
          )}

          {/* Slim Currency Cycle Button */}
          <button
            id="omnibar-currency-badge"
            type="button"
            onClick={onCycleCurrency}
            title={`현재 통화: ${currentCurrency} (클릭하여 변경)`}
            aria-label={`현재 통화: ${currentCurrency} (클릭하여 변경)`}
            className="px-1.5 py-0.5 text-[10px] font-mono font-medium text-neutral-400 hover:text-white border-r border-white/[0.08] pr-2 mr-1 shrink-0 transition-colors cursor-pointer flex items-center gap-0.5"
          >
            <span>{getCurrencySymbol(currentCurrency)}</span>
          </button>

          {/* Input field */}
          <input
            id="instant-ingest-input"
            type="text"
            value={input}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            onChange={(e) => setInput(e.target.value)}
            placeholder={inputPlaceholder}
            className="text-xs sm:text-sm text-white placeholder:text-neutral-500 font-light bg-transparent focus:outline-none w-full min-w-0"
          />

          {/* Clear button if text exists */}
          {input && (
            <button
              type="button"
              onClick={() => setInput('')}
              title="입력 내용 지우기"
              aria-label="입력 내용 지우기"
              className="p-1 rounded-full text-neutral-500 hover:text-white cursor-pointer shrink-0 transition-colors"
            >
              <X size={14} />
            </button>
          )}

          {/* Submit Action Button */}
          <button
            id="parse-submit-btn"
            type="submit"
            disabled={isProcessing || !input.trim() || !isOnline}
            title={isInsightsMode ? 'AI 재정 분석 실행' : '기록'}
            aria-label={isInsightsMode ? 'AI 재정 분석 실행' : '기록'}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer ${
              isTyping
                ? 'bg-white text-black hover:bg-neutral-200 active:scale-95 shadow-xs'
                : 'bg-white/[0.04] text-neutral-500 hover:text-neutral-300 disabled:opacity-30 disabled:pointer-events-none'
            }`}
          >
            {isProcessing ? (
              <Loader2 size={14} className="animate-spin text-current" />
            ) : isInsightsMode ? (
              <Sparkles size={14} />
            ) : (
              <Send size={14} className="translate-x-[0.5px]" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
