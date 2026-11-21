import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Mic, 
  MicOff, 
  Plus,
  X, 
  Send, 
  Sparkles,
  Check,
  Loader2 
} from 'lucide-react';
import { SupportedCurrency, LaunchScreenMode } from '../types';
import { 
  getCurrencySymbol, 
  getCategoryKo, 
  AIEngineConfig, 
  getAIEngineConfig, 
  saveAIEngineConfig 
} from '../utils';
import { useI18n } from '../i18n';
import { isAnalyticalQueryInput } from '../finance/lightweightDetectors';

// Global Quick Suggestion Chips (Featured analytical query tags + quick ledger entries)
const SUGGESTION_CHIPS = [
  { label: '#9월 환차익', value: '9월 환차익', isQuery: true },
  { label: '#식비 분석', value: '식비 분석', isQuery: true },
  { label: '#주말 지출', value: '주말 지출', isQuery: true },
  { label: '#커피 4,500원', value: '스타벅스 아메리카노 4500원 카드 결제', isQuery: false },
  { label: '#식사 12,000원', value: '점심 순두부찌개 12000원 계좌이체', isQuery: false },
  { label: '#장보기 35,000원', value: '이마트 장보기 35000원 현대카드', isQuery: false }
];

type QuickEngineId = 'cloud' | 'ollama' | 'webllm';

const ENGINE_OPTIONS: {
  id: QuickEngineId;
  menuLabel: string;
  badgeLabel: string;
  patch: Partial<AIEngineConfig>;
}[] = [
  {
    id: 'cloud',
    menuLabel: 'Cloud AI',
    badgeLabel: 'C',
    patch: { engineType: 'byok' },
  },
  {
    id: 'ollama',
    menuLabel: 'Ollama Local',
    badgeLabel: 'O',
    patch: { engineType: 'local', localSubMode: 'ollama' },
  },
  {
    id: 'webllm',
    menuLabel: 'WebLLM',
    badgeLabel: 'W',
    patch: { engineType: 'local', localSubMode: 'webllm' },
  },
];

export interface RealtimePreviewData {
  merchant?: string;
  amount?: number;
  category?: string;
  currency?: SupportedCurrency;
  isDutch?: boolean;
  paidBy?: string;
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
  engineConfig?: AIEngineConfig;
  updateEngineConfig?: (partial: Partial<AIEngineConfig>) => void;
  onSubmit: () => void;
  onOpenReceiptScanner: () => void;
  isListening?: boolean;
  onToggleListen?: () => void;
  error?: string | null;
  onClearError?: () => void;
  mode?: LaunchScreenMode;
  onRunQuery?: (queryText: string) => void;
  placeholder?: string;
  onFocusChange?: (isFocused: boolean) => void;
}

export const OmnibarDock: React.FC<OmnibarDockProps> = ({
  input,
  setInput,
  isProcessing,
  isOnline,
  currentCurrency,
  isMultiCurrencyMode: _isMultiCurrencyMode,
  realtimePreview,
  engineStatus: _engineStatus,
  engineConfig,
  updateEngineConfig,
  onSubmit,
  onOpenReceiptScanner,
  isListening = false,
  onToggleListen,
  error,
  onClearError,
  mode = 'ledger',
  onRunQuery,
  placeholder,
  onFocusChange,
}) => {
  const { t } = useI18n();
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isEngineMenuOpen, setIsEngineMenuOpen] = useState(false);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [localFallbackConfig, setLocalFallbackConfig] = useState<AIEngineConfig>(() => getAIEngineConfig());
  const engineMenuRef = useRef<HTMLDivElement | null>(null);
  const plusMenuRef = useRef<HTMLDivElement | null>(null);

  const isInsightsMode = mode === 'insights';
  const isTyping = input.trim().length > 0;
  const resolvedConfig = engineConfig || localFallbackConfig;

  const activeEngineId: QuickEngineId =
    resolvedConfig.engineType === 'local'
      ? resolvedConfig.localSubMode === 'webllm'
        ? 'webllm'
        : 'ollama'
      : 'cloud';

  const activeEngineOption =
    ENGINE_OPTIONS.find((opt) => opt.id === activeEngineId) || ENGINE_OPTIONS[0];

  useEffect(() => {
    if (!isEngineMenuOpen && !isPlusMenuOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (engineMenuRef.current && !engineMenuRef.current.contains(e.target as Node)) {
        setIsEngineMenuOpen(false);
      }
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setIsPlusMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsEngineMenuOpen(false);
        setIsPlusMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEngineMenuOpen, isPlusMenuOpen]);

  const handleSelectEngine = (option: (typeof ENGINE_OPTIONS)[number]) => {
    if (updateEngineConfig) {
      updateEngineConfig(option.patch);
    } else {
      const next = { ...getAIEngineConfig(), ...option.patch };
      saveAIEngineConfig(next);
      setLocalFallbackConfig(next);
    }
    setIsEngineMenuOpen(false);
  };

  const getPlaceholderByMode = (currentMode?: LaunchScreenMode | string) => {
    switch (currentMode) {
      case 'vault':
        return t('placeholder_vault');
      case 'insights':
        return t('placeholder_insights');
      case 'ledger':
      default:
        return t('placeholder_ledger');
    }
  };

  const inputPlaceholder = placeholder || getPlaceholderByMode(mode);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    
    // Check if input is an analytical query
    const isQueryIntent = isAnalyticalQueryInput(input, mode);

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
    <div className="w-full relative">
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

          {/* Payer Chip */}
          {realtimePreview.paidBy && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full shrink-0 bg-emerald-500/15 text-emerald-300">
              <span>결제자:</span>
              <strong className="font-bold">{realtimePreview.paidBy}</strong>
            </span>
          )}
        </div>
      )}

      {/* Search Bar Wrapper with Floating Suggestion Chips (Zero DOM Reflow) */}
      <div className="relative">
        {isInputFocused && !isEngineMenuOpen && !isPlusMenuOpen && !realtimePreview && (
          <div className="absolute bottom-full mb-2 left-0 w-full z-30 flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 animate-in fade-in slide-in-from-bottom-1 duration-150">
            {SUGGESTION_CHIPS.map(chip => (
              <button
                key={chip.label}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleChipClick(chip);
                }}
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-2xl transition-colors cursor-pointer ${
                  chip.isQuery 
                    ? 'bg-[#090A0D]/95 hover:bg-sky-500/20 active:bg-sky-500/30 text-sky-300 border border-sky-500/30' 
                    : 'bg-[var(--surface-panel)]/95 hover:bg-white/[0.12] active:bg-white/15 text-neutral-300 hover:text-white border border-white/[0.08]'
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
          className={`relative rounded-2xl p-[1px] transition-all duration-500 border ${
            isProcessing
              ? 'border-sky-500/40 bg-sky-500/10 shadow-[0_0_24px_rgba(56,189,248,0.25)] animate-pulse'
              : isInputFocused
              ? 'border-transparent bg-white/30 shadow-[0_0_15px_rgba(255,255,255,0.08)]'
              : 'border-transparent bg-white/15'
          }`}
        >
          <div className="flex items-center gap-1.5 rounded-[15px] px-2.5 py-1.5 transition-colors bg-[var(--surface-panel)]/95 backdrop-blur-2xl">
            {/* Compact Left Controls: Consolidated + Action Menu (Camera & Mic) + Single-letter Engine Switcher */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div ref={plusMenuRef} className="relative shrink-0">
                <button
                  id="omnibar-plus-menu-btn"
                  type="button"
                  onClick={() => {
                    setIsEngineMenuOpen(false);
                    setIsPlusMenuOpen((prev) => !prev);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={isPlusMenuOpen}
                  title={isListening ? '음성 입력 중 · 추가 기능' : '영수증 스캔 및 음성 입력'}
                  aria-label={isListening ? '음성 입력 중 · 추가 기능' : '영수증 스캔 및 음성 입력'}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                    isListening
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.25)] animate-pulse'
                      : isPlusMenuOpen
                      ? 'bg-white/[0.1] text-white'
                      : 'text-neutral-300 hover:text-white hover:bg-white/[0.08] active:scale-95'
                  }`}
                >
                  {isListening ? (
                    <Mic size={14} />
                  ) : (
                    <Plus size={15} className={`transition-transform duration-150 ${isPlusMenuOpen ? 'rotate-45' : ''}`} />
                  )}
                </button>

                {isPlusMenuOpen && (
                  <div
                    role="menu"
                    aria-label="입력 도구"
                    className="absolute bottom-full mb-2.5 left-0 min-w-[152px] rounded-xl bg-[var(--surface-panel)]/95 backdrop-blur-2xl border border-white/[0.06] text-neutral-200 shadow-2xl p-1 z-40 animate-in fade-in slide-in-from-bottom-1 duration-150"
                  >
                    <button
                      id="omnibar-receipt-scanner-btn"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsPlusMenuOpen(false);
                        onOpenReceiptScanner();
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-neutral-200 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                    >
                      <Camera size={14} className="text-neutral-300 shrink-0" />
                      <span className="whitespace-nowrap">영수증 AI 스캔</span>
                    </button>

                    {onToggleListen && (
                      <button
                        id="voice-stt-btn"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsPlusMenuOpen(false);
                          onToggleListen();
                        }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          isListening
                            ? 'bg-sky-500/15 text-sky-300 hover:bg-sky-500/20'
                            : 'text-neutral-200 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        {isListening ? (
                          <MicOff size={14} className="text-sky-400 shrink-0" />
                        ) : (
                          <Mic size={14} className="text-neutral-300 shrink-0" />
                        )}
                        <span className="whitespace-nowrap">
                          {isListening ? '음성 입력 중지' : '음성으로 입력하기'}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Single-letter Inline AI Engine Switcher Badge + Floating Quick Menu */}
              <div ref={engineMenuRef} className="relative shrink-0">
                <button
                  id="omnibar-engine-switcher-btn"
                  type="button"
                  onClick={() => {
                    setIsPlusMenuOpen(false);
                    setIsEngineMenuOpen((prev) => !prev);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={isEngineMenuOpen}
                  title={`AI 엔진 전환 (${activeEngineOption.menuLabel})`}
                  aria-label={`AI 엔진 전환 (${activeEngineOption.menuLabel})`}
                  className="w-7 h-7 text-[11px] font-bold tracking-wider uppercase border border-white/10 rounded-md text-neutral-300 hover:text-white hover:border-white/25 cursor-pointer transition-colors flex items-center justify-center shrink-0"
                >
                  {activeEngineOption.badgeLabel}
                </button>

                {isEngineMenuOpen && (
                  <div
                    role="menu"
                    aria-label="AI 엔진 선택"
                    className="absolute bottom-full mb-2.5 left-0 min-w-[136px] rounded-xl bg-[var(--surface-panel)]/95 backdrop-blur-2xl border border-white/[0.06] text-neutral-300 shadow-2xl p-1 z-40 animate-in fade-in slide-in-from-bottom-1 duration-150"
                  >
                    {ENGINE_OPTIONS.map((option) => {
                      const isActive = option.id === activeEngineId;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActive}
                          onClick={() => handleSelectEngine(option)}
                          className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-white/[0.08] text-white'
                              : 'text-neutral-300 hover:text-white hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className="whitespace-nowrap">{option.menuLabel}</span>
                          {isActive && <Check size={12} className="text-white shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Maximized Input field */}
            <input
              id="instant-ingest-input"
              type="text"
              value={input}
              onFocus={() => {
                setIsInputFocused(true);
                onFocusChange?.(true);
              }}
              onBlur={() => {
                setIsInputFocused(false);
                onFocusChange?.(false);
              }}
              onChange={(e) => setInput(e.target.value)}
              placeholder={inputPlaceholder}
              className="flex-1 w-full min-w-0 text-[16px] sm:text-sm text-white placeholder:text-neutral-400 font-normal bg-transparent focus:outline-none"
            />

            {/* Clear button if text exists */}
            {input && (
              <button
                type="button"
                onClick={() => setInput('')}
                title="입력 내용 지우기"
                aria-label="입력 내용 지우기"
                className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-300 hover:text-white cursor-pointer shrink-0 transition-colors"
              >
                <X size={15} />
              </button>
            )}

            {/* Submit Action Button */}
            <button
              id="parse-submit-btn"
              type="submit"
              disabled={isProcessing || !input.trim() || !isOnline}
              title={isInsightsMode ? 'AI 재정 분석 실행' : '기록'}
              aria-label={isInsightsMode ? 'AI 재정 분석 실행' : '기록'}
              className={`w-9 h-9 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                isProcessing
                  ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border border-[var(--color-accent-border)] pointer-events-none'
                  : isTyping
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--color-accent-hover)] active:scale-95 shadow-sm'
                  : 'bg-white/[0.06] text-neutral-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none'
              }`}
            >
              {isProcessing ? (
                <Loader2 size={14} className="animate-spin text-sky-400" />
              ) : isInsightsMode ? (
                <Sparkles size={14} />
              ) : (
                <Send size={14} className="translate-x-[0.5px]" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
