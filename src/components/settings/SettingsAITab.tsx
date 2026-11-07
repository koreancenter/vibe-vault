import React, { useState } from 'react';
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
  X,
  Server,
  Cpu,
  RefreshCw,
  Edit3,
  Check
} from 'lucide-react';
import { CustomDarkSelect, CustomSelectOption } from './CustomDarkSelect';
import { ModelDownloadProgress } from '../../webllmManager';
import { sanitizeApiKey } from '../../geminiKeyManager';

export interface SettingsAITabProps {
  engineType: 'local' | 'byok';
  setEngineType: (type: 'local' | 'byok') => void;
  setProvider: (provider: 'gemini' | 'openai' | 'anthropic') => void;
  modelTier: string;
  setModelTier: (tier: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  showKey: boolean;
  setShowKey: (show: boolean) => void;
  handleClearKey: () => void;
  handleTestKey: () => void;
  isTestingKey: boolean;
  testResult: { status: 'valid' | 'invalid' | null; message: string };
  setTestResult: React.Dispatch<React.SetStateAction<{ status: 'valid' | 'invalid' | null; message: string }>>;

  // Local AI: Sub-mode
  localSubMode: 'ollama' | 'webllm';
  setLocalSubMode: (mode: 'ollama' | 'webllm') => void;

  // Ollama
  ollamaEndpoint: string;
  setOllamaEndpoint: (endpoint: string) => void;
  ollamaModel: string;
  setOllamaModel: (model: string) => void;
  ollamaModelsList: string[];
  isTestingOllama: boolean;
  ollamaStatus: { status: 'connected' | 'error' | null; message: string };
  handleTestOllamaConnection: () => void;

  // WebLLM
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

const CLOUD_MODEL_OPTIONS: CustomSelectOption[] = [
  {
    value: 'gemini-3.8-flash',
    label: 'gemini-3.8-flash',
    sublabel: '권장 · 초고속 재무 결정론적 파싱 (Recommended · Ultra-fast)',
  },
  {
    value: 'gemini-2.5-flash',
    label: 'gemini-2.5-flash',
    sublabel: '표준 고속 파싱 (Standard fast parsing)',
  },
];

export const SettingsAITab: React.FC<SettingsAITabProps> = ({
  engineType,
  setEngineType,
  setProvider,
  modelTier,
  setModelTier,
  apiKey,
  setApiKey,
  showKey,
  setShowKey,
  handleClearKey,
  handleTestKey,
  isTestingKey,
  testResult,
  setTestResult,
  localSubMode,
  setLocalSubMode,
  ollamaEndpoint,
  setOllamaEndpoint,
  ollamaModel,
  setOllamaModel,
  ollamaModelsList,
  isTestingOllama,
  ollamaStatus,
  handleTestOllamaConnection,
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
  const [isManualOllamaInput, setIsManualOllamaInput] = useState(false);

  // Map fetched Ollama models to CustomSelectOption
  const ollamaSelectOptions: CustomSelectOption[] = ollamaModelsList.map(name => ({
    value: name,
    label: name,
    sublabel: '로컬 설치 모델'
  }));

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* 1. Master Engine Segmented Toggle */}
      <div className="p-1 rounded-xl bg-white/[0.03] border border-white/[0.08] grid grid-cols-2 gap-1 mb-4">
        <button
          type="button"
          onClick={() => {
            setEngineType('byok');
            setProvider('gemini');
          }}
          className={`py-2 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center active:scale-[0.99] cursor-pointer ${
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
          className={`py-2 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center active:scale-[0.99] cursor-pointer ${
            engineType === 'local'
              ? 'bg-white/10 text-white shadow-xs font-semibold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <span className="truncate">온디바이스 로컬 AI</span>
        </button>
      </div>

      {/* 2. CLOUD AI (GEMINI) CONFIGURATION */}
      {engineType === 'byok' && (
        <div className="space-y-4 pb-5 mb-5 border-b border-white/[0.08] animate-in fade-in duration-150">
          {/* Model Tier Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-300">
                Gemini 모델 선택
              </label>
              <span className="text-[10px] text-neutral-500 font-light">
                Google AI Studio API
              </span>
            </div>
            <CustomDarkSelect
              value={modelTier || 'gemini-3.8-flash'}
              options={CLOUD_MODEL_OPTIONS}
              onChange={(val) => setModelTier(val)}
              theme="dark"
              size="md"
              showSublabelInTrigger={true}
            />
          </div>

          {/* API Key Input & Verification */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-300">
                Gemini API 키
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-normal text-sky-400/90 hover:text-sky-300 flex items-center gap-1 transition-colors"
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
                  className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {apiKey.trim() && (
                <button
                  type="button"
                  onClick={handleClearKey}
                  title="API 키 삭제 및 초기화"
                  className="p-2 rounded-xl text-xs font-medium border shrink-0 transition-all active:scale-95 bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border-white/10 cursor-pointer"
                >
                  <Trash2 size={13} />
                </button>
              )}

              <button
                type="button"
                onClick={handleTestKey}
                disabled={isTestingKey || !apiKey.trim()}
                className="px-3 py-2 disabled:opacity-40 rounded-xl text-xs font-medium border shrink-0 transition-all active:scale-95 bg-white/[0.05] hover:bg-white/[0.09] text-white border-white/10 cursor-pointer flex items-center gap-1.5"
              >
                {isTestingKey ? <Loader2 size={13} className="animate-spin" /> : '키 검증'}
              </button>
            </div>
          </div>

          {/* Inline Validation Status Badge */}
          {testResult.status && (
            <div className={`text-xs px-3 py-2 rounded-xl flex items-center gap-2 border ${
              testResult.status === 'valid' 
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' 
                : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
            }`}>
              {testResult.status === 'valid' ? (
                <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
              ) : (
                <XCircle size={14} className="shrink-0 text-rose-400" />
              )}
              <span className="leading-tight">{testResult.message}</span>
            </div>
          )}

          {/* Security Guarantee Note */}
          <p className="text-[11px] leading-tight text-neutral-400 font-light flex items-center gap-1.5 pt-1">
            <span>🔒 API 키는 브라우저 내부 하드웨어 레벨 AES-GCM으로 암호화되어 안전하게 보관됩니다.</span>
          </p>
        </div>
      )}

      {/* 3. ON-DEVICE / LOCAL AI CONFIGURATION */}
      {engineType === 'local' && (
        <div className="space-y-4 pb-5 mb-5 border-b border-white/[0.08] animate-in fade-in duration-150">
          {/* Sub-Mode Segmented Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300">
              로컬 실행 엔진 방식
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <button
                type="button"
                onClick={() => setLocalSubMode('ollama')}
                className={`py-2 px-2.5 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  localSubMode === 'ollama'
                    ? 'bg-white/10 text-white font-semibold border border-white/10 shadow-xs'
                    : 'text-neutral-400 hover:text-white border border-transparent'
                }`}
              >
                <Server size={13} className={localSubMode === 'ollama' ? 'text-sky-400' : 'text-neutral-500'} />
                <span className="truncate">Ollama Local Server</span>
              </button>

              <button
                type="button"
                onClick={() => setLocalSubMode('webllm')}
                className={`py-2 px-2.5 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  localSubMode === 'webllm'
                    ? 'bg-white/10 text-white font-semibold border border-white/10 shadow-xs'
                    : 'text-neutral-400 hover:text-white border border-transparent'
                }`}
              >
                <Cpu size={13} className={localSubMode === 'webllm' ? 'text-indigo-400' : 'text-neutral-500'} />
                <span className="truncate">Browser WebGPU (WebLLM)</span>
              </button>
            </div>
            <p className="text-[10px] text-neutral-400 font-light leading-tight">
              {localSubMode === 'ollama' 
                ? '권장 · 데스크톱/로컬 PC에 설치된 Ollama 프로세스를 통해 고속 오프라인 추론'
                : '클라이언트 순수 브라우저 환경에서 WebGPU 가속을 활용해 직접 추론'}
            </p>
          </div>

          {/* SUB-MODE A: OLLAMA LOCAL SERVER */}
          {localSubMode === 'ollama' && (
            <div className="space-y-3.5 pt-2 animate-in fade-in duration-150">
              {/* Ollama Endpoint Input & Test Connection Button */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">
                  Ollama 엔드포인트 URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ollamaEndpoint}
                    onChange={(e) => setOllamaEndpoint(e.target.value)}
                    placeholder="http://localhost:11434"
                    autoComplete="off"
                    spellCheck={false}
                    className="flex-1 rounded-xl px-3 py-2 text-xs font-mono outline-none transition-colors border bg-white/[0.03] border-white/10 text-neutral-100 placeholder:text-neutral-600 focus:border-white/30"
                  />
                  <button
                    type="button"
                    onClick={handleTestOllamaConnection}
                    disabled={isTestingOllama || !ollamaEndpoint.trim()}
                    className="px-3 py-2 disabled:opacity-40 rounded-xl text-xs font-medium border shrink-0 transition-all active:scale-95 bg-white/[0.05] hover:bg-white/[0.09] text-white border-white/10 cursor-pointer flex items-center gap-1.5"
                  >
                    {isTestingOllama ? (
                      <Loader2 size={13} className="animate-spin text-sky-400" />
                    ) : (
                      <RefreshCw size={13} className="text-neutral-300" />
                    )}
                    <span>연결 테스트</span>
                  </button>
                </div>
              </div>

              {/* Installed Model Dropdown / Manual Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-300">
                    Ollama 모델 선택
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsManualOllamaInput(!isManualOllamaInput)}
                    className="text-[11px] font-normal text-neutral-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Edit3 size={11} />
                    <span>{isManualOllamaInput ? '목록에서 선택' : '직접 모델명 입력'}</span>
                  </button>
                </div>

                {!isManualOllamaInput && ollamaSelectOptions.length > 0 ? (
                  <CustomDarkSelect
                    value={ollamaModel || (ollamaSelectOptions[0]?.value ?? 'gemma2:9b')}
                    options={ollamaSelectOptions}
                    onChange={(val) => setOllamaModel(val)}
                    theme="dark"
                    size="md"
                    showSublabelInTrigger={true}
                  />
                ) : (
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      placeholder="예: gemma2:9b, llama3.2:3b, qwen2.5:7b"
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full rounded-xl px-3 py-2 text-xs font-mono outline-none transition-colors border bg-white/[0.03] border-white/10 text-neutral-100 placeholder:text-neutral-600 focus:border-white/30"
                    />
                    {ollamaSelectOptions.length === 0 && (
                      <p className="text-[10px] text-neutral-500 font-light">
                        💡 "연결 테스트"를 누르면 Ollama에 설치된 모델 태그를 자동으로 불러옵니다.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Ollama Connection Status Badge & CORS Help */}
              {ollamaStatus.status && (
                <div className={`text-xs p-3 rounded-xl border space-y-1.5 ${
                  ollamaStatus.status === 'connected'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-200 border-amber-500/20'
                }`}>
                  <div className="flex items-center gap-2 font-medium">
                    {ollamaStatus.status === 'connected' ? (
                      <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
                    ) : (
                      <AlertTriangle size={14} className="shrink-0 text-amber-400" />
                    )}
                    <span>{ollamaStatus.message}</span>
                  </div>

                  {ollamaStatus.status === 'error' && (
                    <div className="pt-1 border-t border-amber-500/15 text-[11px] font-mono leading-relaxed space-y-1">
                      <div className="text-neutral-400 font-sans">
                        브라우저 보안(CORS) 허용을 위해 터미널에서 다음 환경변수를 지정하여 Ollama를 실행해 주세요:
                      </div>
                      <div className="px-2 py-1 rounded bg-black/40 text-amber-300 select-all font-light">
                        OLLAMA_ORIGINS="*" ollama serve
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SUB-MODE B: BROWSER WEBGPU (WEBLLM) */}
          {localSubMode === 'webllm' && (
            <div className="space-y-3.5 pt-2 animate-in fade-in duration-150">
              {/* WebGPU Status Check */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-300">
                    온디바이스 브라우저 모델
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
                    <span className="text-[10px] font-normal flex items-center gap-1 text-neutral-400">
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
                  size="md"
                  showSublabelInTrigger={true}
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
                <div className="text-[11px] text-rose-300 flex items-center gap-1.5 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <AlertTriangle size={13} className="text-rose-400 shrink-0" />
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
                      className="flex-1 py-2.5 px-3 rounded-xl text-xs font-normal border border-white/10 bg-white/[0.05] hover:bg-white/[0.09] text-neutral-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <X size={13} />
                      <span>다운로드 취소</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartWebLLMDownload}
                      disabled={webGpuStatus?.supported === false}
                      className="w-full bg-white/[0.05] hover:bg-white/[0.09] text-white border border-white/10 rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition-all active:scale-98 text-xs font-medium disabled:opacity-40 cursor-pointer"
                    >
                      <Download size={13} />
                      <span>모델 다운로드 ({localModel === 'llama3-8b' ? '4.5GB' : '1.5GB'})</span>
                    </button>
                  )
                ) : (
                  <div className="flex items-center justify-between gap-2 w-full p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-xs text-emerald-300 font-medium flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                      <span>오프라인 추론 준비 완료 (캐시 보관 중)</span>
                    </div>
                    <button
                      type="button"
                      onClick={handlePurgeWebLLMCache}
                      title="로컬 저장소 모델 가중치 삭제"
                      className="py-1 px-2 rounded-lg text-xs border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white hover:bg-white/[0.08] font-normal flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 size={12} />
                      <span>캐시 삭제</span>
                    </button>
                  </div>
                )}
              </div>

              <p className="text-[10px] leading-relaxed text-neutral-500 font-light">
                ⚠️ 모바일 브라우저 환경에서는 대용량 가중치 다운로드 시 메모리 부족(OOM)이나 급격한 배터리 소모가 발생할 수 있습니다.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
