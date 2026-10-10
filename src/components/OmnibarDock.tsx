import React, { useState } from 'react';
import { 
  Camera, 
  Mic, 
  MicOff, 
  X, 
  Send, 
  Loader2 
} from 'lucide-react';
import { SupportedCurrency } from '../types';
import { getCurrencySymbol, getCategoryKo } from '../utils';

// Quick Suggestion Chips
const QUICK_CHIPS = [
  { label: '#커피 4,500원', value: '스타벅스 아메리카노 4500원 카드 결제' },
  { label: '#식사 12,000원', value: '점심 순두부찌개 12000원 계좌이체' },
  { label: '#장보기 35,000원', value: '이마트 장보기 35000원 현대카드' },
  { label: '#택시 14,800원', value: '카카오택시 14800원' }
];

export interface RealtimePreviewData {
  merchant?: string;
  amount?: number;
  category?: string;
  currency?: SupportedCurrency;
  isDutch?: boolean;
}

interface OmnibarDockProps {
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
}

export const OmnibarDock: React.FC<OmnibarDockProps> = ({
  input,
  setInput,
  isProcessing,
  isOnline,
  currentCurrency,
  isMultiCurrencyMode,
  realtimePreview,
  engineStatus,
  onSubmit,
  onOpenReceiptScanner,
  onCycleCurrency,
  isListening = false,
  onToggleListen,
  error,
  onClearError,
}) => {
  const [isInputFocused, setIsInputFocused] = useState(false);

  return (
    <div className="w-full">
      {/* Error notification */}
      {error && (
        <div className="mb-2 text-xs text-rose-500 bg-rose-500/10 rounded-xl px-3 py-1.5 flex items-center justify-between">
          <span className="truncate">{error}</span>
          {onClearError && (
            <button 
              type="button" 
              onClick={onClearError} 
              aria-label="오류 알림 닫기"
              className="text-rose-500 hover:text-rose-700 ml-1 font-bold"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Real-time Extraction Preview Chips */}
      {realtimePreview && (
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

      {/* Quick Tag Chips Row: displayed when input field is focused */}
      {isInputFocused && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150">
          {QUICK_CHIPS.map(chip => (
            <button
              key={chip.label}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setInput(chip.value);
              }}
              className="shrink-0 px-2.5 py-0.5 rounded-full text-xs transition-colors bg-white/[0.06] hover:bg-white/10 active:bg-white/15 text-slate-300"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Modern AI Search Bar */}
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className={`relative rounded-2xl p-[1px] transition-all duration-200 ${
          isInputFocused 
            ? 'bg-gradient-to-r from-sky-400 via-blue-500 to-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.15)]' 
            : 'bg-white/[0.08]'
        }`}
      >
        <div className="flex items-center gap-1.5 rounded-[15px] px-2.5 py-1 transition-colors bg-[#08090D]/90 backdrop-blur-2xl">
          {/* Camera / Receipt Scanner Trigger */}
          <button
            id="omnibar-receipt-scanner-btn"
            type="button"
            onClick={onOpenReceiptScanner}
            title="영수증 AI 스캔"
            aria-label="영수증 AI 스캔"
            className="w-8 h-8 min-w-[32px] rounded-xl flex items-center justify-center transition-all text-slate-400 hover:text-sky-400 hover:bg-white/5 active:scale-95"
          >
            <Camera size={16} />
          </button>

          {/* Mic button */}
          {onToggleListen && (
            <button
              id="voice-stt-btn"
              type="button"
              onClick={onToggleListen}
              aria-label="음성으로 입력하기"
              className={`w-8 h-8 min-w-[32px] rounded-xl flex items-center justify-center transition-all ${
                isListening
                  ? 'bg-rose-500/20 text-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)] animate-pulse'
                  : 'text-slate-400 hover:text-sky-400 hover:bg-white/5 active:scale-95'
              }`}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}

          {/* Currency Pill inside Omnibar: only shown in multi-currency mode */}
          {isMultiCurrencyMode && (
            <button
              id="omnibar-currency-badge"
              type="button"
              onClick={onCycleCurrency}
              title="클릭하여 통화 변경"
              aria-label="클릭하여 통화 변경"
              className="px-2 py-0.5 rounded-lg text-[11px] font-bold shrink-0 transition-all bg-white/[0.06] hover:bg-white/10 text-white"
            >
              {currentCurrency}
            </button>
          )}

          {/* Input field */}
          <input
            id="instant-ingest-input"
            type="text"
            value={input}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 파스타 4만원 또는 $15 Starbucks"
            className="w-full bg-transparent text-xs sm:text-sm outline-none transition-colors text-white placeholder:text-slate-400"
          />

          {/* Clear button if text exists */}
          {input && (
            <button
              type="button"
              onClick={() => setInput('')}
              title="입력 내용 지우기"
              aria-label="입력 내용 지우기"
              className="p-1 rounded-full text-slate-400 hover:text-white cursor-pointer shrink-0"
            >
              <X size={13} />
            </button>
          )}

          {/* Submit Action Button */}
          <button
            id="parse-submit-btn"
            type="submit"
            disabled={isProcessing || !input.trim() || !isOnline}
            title="기록"
            aria-label="기록"
            className="w-8 h-8 min-w-[32px] rounded-xl bg-sky-500/15 hover:bg-sky-500/25 active:scale-95 text-sky-300 border border-sky-500/30 transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center shadow-sm shrink-0 cursor-pointer"
          >
            {isProcessing ? (
              <Loader2 size={14} className="animate-spin text-sky-300" />
            ) : (
              <Send size={14} className="text-sky-300 translate-x-[0.5px]" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
