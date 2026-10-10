import React from 'react';
import { 
  Eye, 
  EyeOff, 
  Trash2, 
  ExternalLink, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Download, 
  X 
} from 'lucide-react';
import { CustomDarkSelect, CustomSelectOption } from './CustomDarkSelect';
import { ModelDownloadProgress } from '../../webllmManager';
import { sanitizeApiKey } from '../../geminiKeyManager';

interface SettingsAITabProps {
  engineType: 'local' | 'byok';
  setEngineType: (type: 'local' | 'byok') => void;
  setProvider: (provider: 'gemini' | 'openai' | 'anthropic') => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  showKey: boolean;
  setShowKey: (show: boolean) => void;
  handleClearKey: () => void;
  handleTestKey: () => void;
  isTestingKey: boolean;
  testResult: { status: 'valid' | 'invalid' | null; message: string };
  setTestResult: React.Dispatch<React.SetStateAction<{ status: 'valid' | 'invalid' | null; message: string }>>;
  localModel: 'gemma-2b' | 'llama3-8b';
  setLocalModel: (model: 'gemma-2b' | 'llama3-8b') => void;
  webGpuStatus: { supported: boolean; reason?: string } | null;
  localModelOptions: CustomSelectOption[];
  isDownloadingModel: boolean;
  downloadProgress: ModelDownloadProgress | null;
  downloadError: string | null;
  isModelDownloaded: boolean;
  handleCancelWebLLMDownload: () => void;
  handleStartWebLLMDownload: () => void;
  handlePurgeWebLLMCache: () => void;
}

export const SettingsAITab: React.FC<SettingsAITabProps> = ({
  engineType,
  setEngineType,
  setProvider,
  apiKey,
  setApiKey,
  showKey,
  setShowKey,
  handleClearKey,
  handleTestKey,
  isTestingKey,
  testResult,
  setTestResult,
  localModel,
  setLocalModel,
  webGpuStatus,
  localModelOptions,
  isDownloadingModel,
  downloadProgress,
  downloadError,
  isModelDownloaded,
  handleCancelWebLLMDownload,
  handleStartWebLLMDownload,
  handlePurgeWebLLMCache,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Clean Engine Toggle */}
      <div className="p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] grid grid-cols-2 gap-1 mb-4">
        <button
          type="button"
          onClick={() => {
            setEngineType('byok');
            setProvider('gemini');
          }}
          className={`py-2 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center active:scale-[0.99] ${
            engineType === 'byok'
              ? 'bg-white/10 text-white shadow-xs font-semibold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <span className="truncate">클라우드 AI</span>
        </button>

        <button
          type="button"
          onClick={() => setEngineType('local')}
          className={`py-2 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center active:scale-[0.99] ${
            engineType === 'local'
              ? 'bg-white/10 text-white shadow-xs font-semibold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <span className="truncate">온디바이스 로컬 AI</span>
        </button>
      </div>

      {/* Cloud AI (Gemini) Flat Group */}
      {engineType === 'byok' && (
        <div className="space-y-3.5 pb-5 mb-5 border-b border-white/[0.06] animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-neutral-200">
              Gemini API 키
            </label>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-normal text-neutral-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <span>Google AI Studio에서 키 발급</span>
              <ExternalLink size={10} />
            </a>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => { 
                  const sanitized = sanitizeApiKey(e.target.value);
                  setApiKey(sanitized); 
                  setTestResult({ status: null, message: '' }); 
                }}
                placeholder="AIzaSy... (Gemini API 키)"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl pl-3 pr-8 py-2 text-xs outline-none font-mono transition-colors border bg-white/[0.03] border-white/10 text-neutral-100 placeholder:text-neutral-600 focus:border-white/30"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                title={showKey ? "API 키 마스킹" : "API 키 보기"}
                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {apiKey.trim() && (
              <button
                type="button"
                onClick={handleClearKey}
                title="API 키 삭제 및 초기화"
                className="p-2 rounded-xl text-xs font-medium border shrink-0 transition-all active:scale-95 bg-white/[0.04] hover:bg-rose-500/15 text-neutral-300 hover:text-rose-400 border-white/10"
              >
                <Trash2 size={13} />
              </button>
            )}

            <button
              type="button"
              onClick={handleTestKey}
              disabled={isTestingKey || !apiKey.trim()}
              className="px-3 py-2 disabled:opacity-40 rounded-xl text-xs font-normal border shrink-0 transition-all active:scale-95 bg-white/[0.05] hover:bg-white/[0.09] text-white border-white/10"
            >
              {isTestingKey ? <Loader2 size={13} className="animate-spin" /> : '키 검증'}
            </button>
          </div>

          {/* Inline Validation Status Badge */}
          {testResult.status && (
            <div className={`text-xs px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 ${
              testResult.status === 'valid' 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-normal' 
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              {testResult.status === 'valid' ? <CheckCircle2 size={13} className="shrink-0" /> : <XCircle size={13} className="shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* 1-Line Clean Note */}
          <p className="text-[11px] leading-tight text-neutral-400 font-light flex items-center gap-1">
            <span>🔒 API 키는 브라우저 내부 암호화 스토리지에만 안전하게 보관됩니다.</span>
          </p>
        </div>
      )}

      {/* On-Device AI Flat Group */}
      {engineType === 'local' && (
        <div className="space-y-3.5 pb-5 mb-5 border-b border-white/[0.06] animate-in fade-in duration-150">
          {/* Model Selector & WebGPU status */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-200">
                온디바이스 로컬 모델
              </label>
              {webGpuStatus === null ? (
                <span className="text-[10px] text-neutral-400 flex items-center gap-1 font-light">
                  <Loader2 size={10} className="animate-spin" /> WebGPU 확인 중
                </span>
              ) : webGpuStatus.supported ? (
                <span className="text-[10px] font-normal flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  WebGPU 가속 지원
                </span>
              ) : (
                <span className="text-[10px] font-normal flex items-center gap-1 text-rose-400">
                  <XCircle size={11} />
                  WebGPU 미지원 ({webGpuStatus.reason || '가속 불가'})
                </span>
              )}
            </div>
            <CustomDarkSelect
              value={localModel}
              options={localModelOptions}
              onChange={(val) => setLocalModel(val as any)}
              theme="dark"
              size="sm"
            />
          </div>

          {/* Progress Bar when downloading */}
          {isDownloadingModel && downloadProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-neutral-400">
                <span>{downloadProgress.text}</span>
                <span className="font-mono font-normal">{downloadProgress.progress}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div 
                  className="h-full bg-white transition-all duration-200"
                  style={{ width: `${downloadProgress.progress}%` }}
                />
              </div>
            </div>
          )}

          {downloadError && (
            <div className="text-[11px] text-rose-400 flex items-center gap-1">
              <AlertTriangle size={12} />
              <span>{downloadError}</span>
            </div>
          )}

          {/* Action Button: Download / Cancel / Purge */}
          <div className="flex items-center gap-2">
            {!isModelDownloaded ? (
              isDownloadingModel ? (
                <button
                  type="button"
                  onClick={handleCancelWebLLMDownload}
                  className="flex-1 py-2.5 px-3 rounded-xl text-xs font-normal border border-white/10 bg-white/[0.05] hover:bg-white/[0.09] text-rose-300 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <X size={13} />
                  <span>다운로드 취소</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartWebLLMDownload}
                  disabled={webGpuStatus?.supported === false}
                  className="w-full bg-white/[0.05] hover:bg-white/[0.09] text-white border border-white/10 rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition-all active:scale-98 text-xs font-medium disabled:opacity-40"
                >
                  <Download size={13} />
                  <span>모델 다운로드 ({localModel === 'llama3-8b' ? '4.5GB' : '1.5GB'})</span>
                </button>
              )
            ) : (
              <div className="flex items-center justify-between gap-2 w-full">
                <div className="text-[11px] text-emerald-400 font-normal flex items-center gap-1">
                  <CheckCircle2 size={13} />
                  <span>오프라인 추론 사용 가능 (캐시 보관 중)</span>
                </div>
                <button
                  type="button"
                  onClick={handlePurgeWebLLMCache}
                  title="로컬 저장소 모델 가중치 삭제"
                  className="py-1.5 px-2.5 rounded-lg text-xs border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white hover:bg-white/[0.08] font-normal flex items-center gap-1 transition-colors"
                >
                  <Trash2 size={12} />
                  <span>캐시 삭제</span>
                </button>
              </div>
            )}
          </div>

          <p className="text-[10px] leading-relaxed text-neutral-400 font-light">
            ⚠️ 모바일 브라우저 환경에서는 대용량 가중치 다운로드 시 메모리 부족(OOM)이나 급격한 배터리 소모가 발생할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
};
