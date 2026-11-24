import React, { useState, useEffect } from 'react';
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
  Sparkles
} from 'lucide-react';
import { CustomDarkSelect, CustomSelectOption } from './CustomDarkSelect';
import {
  checkWebGPUSupport,
  isWebLLMModelCached,
  isLocalLLMReady,
  downloadAndInitWebLLM,
  cancelWebLLMDownload,
  purgeWebLLMCache,
  ModelDownloadProgress,
} from '../../webllmManager';
import {
  sanitizeApiKey,
  getSecureGeminiApiKey,
  clearSecureGeminiApiKey,
  testGeminiApiKeyOnline,
} from '../../geminiKeyManager';
import { getAIEngineConfig } from '../../utils';
import {
  BuiltInAIStatus,
  detectBuiltInAI,
  getCachedBuiltInAIStatus,
  prepareBuiltInAI,
} from '../../builtInAI';
import { useI18n } from '../../i18n';

export interface AIEngineDraft {
  engineType: 'local' | 'byok';
  provider: 'gemini' | 'openai' | 'anthropic';
  modelTier: string;
  localModel: 'gemma-2b' | 'llama3-8b';
  apiKey: string;
  localSubMode: 'ollama' | 'webllm';
  ollamaEndpoint: string;
  ollamaModel: string;
}

export interface SettingsAITabProps {
  initialDraft?: AIEngineDraft | null;
  onDraftChange: (draft: AIEngineDraft) => void;
  onStatusMessage?: (msg: { type: 'success' | 'error'; text: string }) => void;
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

const LOCAL_MODEL_OPTIONS: CustomSelectOption[] = [
  { value: 'gemma-2b', label: 'Gemma 2B', sublabel: '초고속 경량 - 1.3GB' },
  { value: 'llama3-8b', label: 'Llama 3 8B', sublabel: '심층 처리 - 4.5GB' },
];

function loadInitialDraft(initialDraft?: AIEngineDraft | null): AIEngineDraft {
  if (initialDraft) return initialDraft;
  const cfg = getAIEngineConfig();
  return {
    engineType: cfg.engineType || 'byok',
    provider: cfg.provider || 'gemini',
    modelTier: cfg.modelTier || 'gemini-3.8-flash',
    localModel: cfg.localModel || 'gemma-2b',
    apiKey: cfg.apiKey || getSecureGeminiApiKey() || '',
    localSubMode: cfg.localSubMode || 'ollama',
    ollamaEndpoint: cfg.ollamaEndpoint || 'http://localhost:11434',
    ollamaModel: cfg.ollamaModel || 'gemma2:9b',
  };
}

export const SettingsAITab: React.FC<SettingsAITabProps> = ({
  initialDraft,
  onDraftChange,
  onStatusMessage,
}) => {
  const { language } = useI18n();
  const isKo = language === 'ko';

  const initial = loadInitialDraft(initialDraft);
  const [engineType, setEngineType] = useState<'local' | 'byok'>(initial.engineType);
  const [provider, setProvider] = useState<'gemini' | 'openai' | 'anthropic'>(initial.provider);
  const [modelTier, setModelTier] = useState<string>(initial.modelTier);
  const [localModel, setLocalModel] = useState<'gemma-2b' | 'llama3-8b'>(initial.localModel);
  const [apiKey, setApiKey] = useState<string>(initial.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'valid' | 'invalid' | null; message: string }>({
    status: null,
    message: '',
  });

  const [localSubMode, setLocalSubMode] = useState<'ollama' | 'webllm'>(initial.localSubMode);
  const [ollamaEndpoint, setOllamaEndpoint] = useState<string>(initial.ollamaEndpoint);
  const [ollamaModel, setOllamaModel] = useState<string>(initial.ollamaModel);
  const [ollamaModelsList, setOllamaModelsList] = useState<string[]>([]);
  const [isTestingOllama, setIsTestingOllama] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<{ status: 'connected' | 'error' | null; message: string }>({
    status: null,
    message: '',
  });
  const [isManualOllamaInput, setIsManualOllamaInput] = useState(false);

  const [webGpuStatus, setWebGpuStatus] = useState<{ supported: boolean; reason?: string } | null>(null);
  const [isModelDownloaded, setIsModelDownloaded] = useState<boolean>(() => isWebLLMModelCached() || isLocalLLMReady());
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [builtInStatus, setBuiltInStatus] = useState<BuiltInAIStatus | null>(() => getCachedBuiltInAIStatus());
  const [isCheckingBuiltIn, setIsCheckingBuiltIn] = useState(false);
  const [isPreparingBuiltIn, setIsPreparingBuiltIn] = useState(false);
  const [builtInProgress, setBuiltInProgress] = useState(0);

  useEffect(() => {
    onDraftChange({
      engineType,
      provider,
      modelTier,
      localModel,
      apiKey,
      localSubMode,
      ollamaEndpoint,
      ollamaModel,
    });
  }, [engineType, provider, modelTier, localModel, apiKey, localSubMode, ollamaEndpoint, ollamaModel, onDraftChange]);

  useEffect(() => {
    let cancelled = false;
    checkWebGPUSupport().then((res) => {
      if (!cancelled) setWebGpuStatus(res);
    });
    setIsCheckingBuiltIn(true);
    detectBuiltInAI(true)
      .then((res) => {
        if (!cancelled) setBuiltInStatus(res);
      })
      .finally(() => {
        if (!cancelled) setIsCheckingBuiltIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleActivateBuiltInAI = async () => {
    if (isPreparingBuiltIn) return;
    setIsPreparingBuiltIn(true);
    setBuiltInProgress(0);
    try {
      const updated = await prepareBuiltInAI((pct) => setBuiltInProgress(pct));
      setBuiltInStatus(updated);
    } finally {
      setIsPreparingBuiltIn(false);
    }
  };

  const handleClearKey = () => {
    setApiKey('');
    clearSecureGeminiApiKey();
    setTestResult({ status: null, message: '' });
    onStatusMessage?.({ type: 'success', text: 'API 키가 안전하게 완전히 삭제되었습니다.' });
  };

  const handleTestKey = async () => {
    const cleanKey = sanitizeApiKey(apiKey);
    if (!cleanKey) {
      setTestResult({ status: 'invalid', message: 'API 키를 먼저 입력해 주세요' });
      return;
    }
    setIsTestingKey(true);
    setTestResult({ status: null, message: '' });
    try {
      if (provider === 'gemini') {
        const testRes = await testGeminiApiKeyOnline(cleanKey);
        setTestResult({ status: testRes.valid ? 'valid' : 'invalid', message: testRes.message });
      } else {
        const res = await fetch('/api/validate-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey: cleanKey, modelTier }),
        });
        const data = await res.json();
        setTestResult(
          res.ok && data.valid
            ? { status: 'valid', message: 'API 키가 유효합니다.' }
            : { status: 'invalid', message: data.message || 'API 키 검증 실패' }
        );
      }
    } catch (err: any) {
      setTestResult({ status: 'invalid', message: err.message || '검증 서버 통신 실패' });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleTestOllamaConnection = async () => {
    const ep = ollamaEndpoint.trim().replace(/\/+$/, '');
    if (!ep) {
      setOllamaStatus({ status: 'error', message: 'Ollama 엔드포인트 URL을 입력해주세요.' });
      return;
    }

    let safeOrigin: string;
    try {
      const parsed = new URL(ep);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('INVALID_PROTOCOL');
      if (parsed.username || parsed.password) throw new Error('CREDENTIALS_NOT_ALLOWED');
      safeOrigin = parsed.origin;
    } catch {
      setOllamaStatus({ status: 'error', message: '올바른 http:// 또는 https:// Ollama 서버 주소를 입력해주세요.' });
      return;
    }

    setIsTestingOllama(true);
    setOllamaStatus({ status: null, message: '' });
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${safeOrigin}/api/tags`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const models: string[] = Array.isArray(data?.models)
          ? data.models.map((m: any) => m.name || m.model).filter(Boolean)
          : [];
        setOllamaModelsList(models);
        if (models.length > 0 && (!ollamaModel || !models.includes(ollamaModel))) {
          setOllamaModel(models[0]);
        }
        setOllamaStatus({
          status: 'connected',
          message: models.length > 0
            ? `Ollama 서버 연결 성공 (${models.length}개 로컬 모델 감지)`
            : 'Ollama 서버 연결 성공 (설치된 모델 없음)',
        });
      } else {
        setOllamaStatus({ status: 'error', message: `HTTP ${res.status}: Ollama 서버 응답 오류` });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setOllamaStatus({ status: 'error', message: '연결 시간 초과 (6초). Ollama가 실행 중인지 확인해주세요.' });
      } else {
        const isHttpsMixedLocalhost =
          typeof window !== 'undefined'
          && window.location.protocol === 'https:'
          && /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(ep);
        setOllamaStatus({
          status: 'error',
          message: isHttpsMixedLocalhost
            ? 'Ollama 서버에 연결할 수 없습니다. CORS 설정 및 HTTPS 환경에서의 HTTP localhost 차단(Mixed Content) 여부를 확인해 주세요.'
            : 'Ollama 서버에 연결할 수 없습니다. Ollama 실행 여부 및 CORS 설정을 확인해 주세요 (OLLAMA_ORIGINS="*" ollama serve).',
        });
      }
    } finally {
      setIsTestingOllama(false);
    }
  };

  const handleStartWebLLMDownload = async () => {
    setIsDownloadingModel(true);
    setDownloadError(null);
    setDownloadProgress({ progress: 0, text: '가중치 다운로드 준비 중...', loadedMB: 0, totalMB: localModel === 'llama3-8b' ? 4500 : 1520 });
    try {
      await downloadAndInitWebLLM(localModel, (progress) => setDownloadProgress(progress));
      setIsModelDownloaded(true);
      onStatusMessage?.({ type: 'success', text: `${localModel} 모델 가중치가 로컬 캐시에 안전하게 저장되었습니다.` });
    } catch (err: any) {
      setDownloadError(err.message || '모델 다운로드 중 문제가 발생했습니다.');
    } finally {
      setIsDownloadingModel(false);
      setDownloadProgress(null);
    }
  };

  const handleCancelWebLLMDownload = () => {
    cancelWebLLMDownload();
    setIsDownloadingModel(false);
    setDownloadProgress(null);
    onStatusMessage?.({ type: 'error', text: '모델 다운로드가 취소되었습니다.' });
  };

  const handlePurgeWebLLMCache = async () => {
    if (!window.confirm('로컬 저장소에 캐시된 모델 가중치를 삭제하시겠습니까? (약 1.3GB~4.5GB 저장공간 확보)')) {
      return;
    }
    try {
      await purgeWebLLMCache();
      setIsModelDownloaded(false);
      onStatusMessage?.({ type: 'success', text: '로컬 모델 캐시가 완전히 삭제되었습니다.' });
    } catch (err: any) {
      onStatusMessage?.({ type: 'error', text: '캐시 삭제 실패: ' + err.message });
    }
  };

  const localModelOptions = LOCAL_MODEL_OPTIONS;
  const ollamaSelectOptions: CustomSelectOption[] = ollamaModelsList.map((name) => ({
    value: name,
    label: name,
    badge: 'LOCAL',
  }));

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* 0. Chrome Built-in AI (LanguageModel) Auto-Detection Status Card */}
      <div
        id="builtin-ai-status-card"
        className={`rounded-2xl border p-3.5 space-y-2.5 transition-colors ${
          builtInStatus?.state === 'available'
            ? 'border-emerald-400/25 bg-emerald-500/[0.07]'
            : builtInStatus?.state === 'downloadable' || builtInStatus?.state === 'downloading'
              ? 'border-sky-400/25 bg-sky-500/[0.07]'
              : 'border-white/[0.08] bg-white/[0.025]'
        }`}
      >
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-2 min-w-0">
            <Sparkles
              size={14}
              className={`shrink-0 mt-0.5 ${
                builtInStatus?.state === 'available'
                  ? 'text-emerald-300'
                  : builtInStatus?.state === 'downloadable' || builtInStatus?.state === 'downloading'
                    ? 'text-sky-300'
                    : 'text-neutral-300'
              }`}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-white">
                  {isKo ? 'Chrome 내장 AI (LanguageModel)' : 'Chrome Built-in AI (LanguageModel)'}
                </span>
                {isCheckingBuiltIn && !builtInStatus ? (
                  <span className="text-[11px] text-neutral-300 inline-flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" />
                    {isKo ? '자동 감지 중' : 'Detecting'}
                  </span>
                ) : builtInStatus ? (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${
                      builtInStatus.state === 'available'
                        ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
                        : builtInStatus.state === 'downloadable' || builtInStatus.state === 'downloading'
                          ? 'bg-sky-500/15 border-sky-400/30 text-sky-200'
                          : 'bg-white/[0.05] border-white/[0.1] text-neutral-300'
                    }`}
                  >
                    {isKo ? builtInStatus.labelKo : builtInStatus.labelEn}
                  </span>
                ) : null}
              </div>
              {builtInStatus && (
                <p className="text-[11px] text-neutral-200 leading-relaxed mt-1">
                  {isKo ? builtInStatus.detailKo : builtInStatus.detailEn}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsCheckingBuiltIn(true);
              detectBuiltInAI(true)
                .then(setBuiltInStatus)
                .finally(() => setIsCheckingBuiltIn(false));
            }}
            disabled={isCheckingBuiltIn || isPreparingBuiltIn}
            title={isKo ? '브라우저 내장 AI 상태 다시 확인' : 'Re-check Built-in AI status'}
            aria-label={isKo ? '브라우저 내장 AI 상태 다시 확인' : 'Re-check Built-in AI status'}
            className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0 cursor-pointer disabled:opacity-40"
          >
            <RefreshCw size={12} className={isCheckingBuiltIn ? 'animate-spin' : ''} />
          </button>
        </div>

        {builtInStatus?.state === 'downloadable' && (
          <div className="pt-1 space-y-2">
            {isPreparingBuiltIn ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-sky-200">
                  <span>{isKo ? '브라우저 내장 AI 준비 중...' : 'Preparing Built-in AI...'}</span>
                  <span className="font-mono tabular-nums">{builtInProgress}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full bg-sky-300 transition-all duration-200"
                    style={{ width: `${Math.max(4, builtInProgress)}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleActivateBuiltInAI}
                className="w-full h-8 rounded-xl bg-sky-400/20 hover:bg-sky-400/30 border border-sky-300/30 text-sky-100 text-xs font-semibold transition-all active:scale-[0.99] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download size={12} />
                <span>{isKo ? '브라우저 내장 AI 원탭 활성화' : 'Enable Built-in AI'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 1. Master Engine Segmented Toggle */}
      <div className="p-1 rounded-xl bg-white/[0.02] border border-white/[0.08] grid grid-cols-2 gap-1 mb-4">
        <button
          type="button"
          onClick={() => {
            setEngineType('byok');
            setProvider('gemini');
          }}
          className={`py-2 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center active:scale-[0.99] cursor-pointer ${
            engineType === 'byok'
              ? 'bg-white/[0.08] text-white shadow-xs font-semibold'
              : 'text-neutral-200 hover:text-white'
          }`}
        >
          <span className="truncate">클라우드 AI</span>
        </button>

        <button
          type="button"
          onClick={() => setEngineType('local')}
          className={`py-2 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center active:scale-[0.99] cursor-pointer ${
            engineType === 'local'
              ? 'bg-white/[0.08] text-white shadow-xs font-semibold'
              : 'text-neutral-200 hover:text-white'
          }`}
        >
          <span className="truncate">온디바이스 로컬 AI</span>
        </button>
      </div>

      {/* 2. CLOUD AI (GEMINI) CONFIGURATION */}
      {engineType === 'byok' && (
        <div className="space-y-4 pb-5 mb-5 border-b border-white/[0.06] animate-in fade-in duration-150">
          {/* Model Tier Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white">
                Gemini 모델 선택
              </label>
              <span className="text-xs text-neutral-200 font-normal">
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
              <label className="text-xs font-semibold text-white">
                Gemini API 키
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-sky-300 hover:text-sky-200 flex items-center gap-1 transition-colors"
              >
                <span>Google AI Studio에서 키 발급</span>
                <ExternalLink size={11} />
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
                  className="w-full rounded-xl pl-3 pr-8 py-2 text-xs outline-none font-mono transition-colors border bg-white/[0.03] border-white/[0.08] text-white placeholder:text-neutral-300 focus:border-white/25"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  title={showKey ? "API 키 마스킹" : "API 키 보기"}
                  className="absolute right-2.5 top-2.5 text-neutral-200 hover:text-white transition-colors cursor-pointer"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {apiKey.trim() && (
                <button
                  type="button"
                  onClick={handleClearKey}
                  title="API 키 삭제 및 초기화"
                  className="p-2 rounded-xl text-xs font-medium border shrink-0 transition-all active:scale-95 bg-white/[0.03] hover:bg-white/[0.07] text-neutral-100 hover:text-white border-white/[0.08] cursor-pointer"
                >
                  <Trash2 size={13} />
                </button>
              )}

              <button
                type="button"
                onClick={handleTestKey}
                disabled={isTestingKey || !apiKey.trim()}
                className="px-3 py-2 rounded-xl text-xs font-medium border shrink-0 transition-all active:scale-95 bg-white/[0.04] hover:bg-white/[0.08] text-white border-white/[0.08] disabled:bg-white/[0.02] disabled:text-neutral-300 disabled:border-white/[0.06] cursor-pointer flex items-center gap-1.5"
              >
                {isTestingKey ? <Loader2 size={13} className="animate-spin" /> : '키 검증'}
              </button>
            </div>
          </div>

          {/* Inline Validation Status Badge */}
          {testResult.status && (
            <div className={`text-xs px-3 py-2 rounded-xl flex items-center gap-2 border ${
              testResult.status === 'valid' 
                ? 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20' 
                : 'bg-rose-500/10 text-rose-200 border-rose-500/20'
            }`}>
              {testResult.status === 'valid' ? (
                <CheckCircle2 size={14} className="shrink-0 text-emerald-300" />
              ) : (
                <XCircle size={14} className="shrink-0 text-rose-300" />
              )}
              <span className="leading-tight font-normal">{testResult.message}</span>
            </div>
          )}

          {/* Security Guarantee Note */}
          <p className="text-xs leading-relaxed text-neutral-200 font-normal flex items-center gap-1.5 pt-1">
            <span>🔒 API 키는 브라우저 내부 하드웨어 레벨 AES-GCM으로 암호화되어 안전하게 보관됩니다.</span>
          </p>
        </div>
      )}

      {/* 3. ON-DEVICE / LOCAL AI CONFIGURATION */}
      {engineType === 'local' && (
        <div className="space-y-4 pb-5 mb-5 border-b border-white/[0.06] animate-in fade-in duration-150">
          {/* Sub-Mode Segmented Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white">
              로컬 실행 엔진 방식
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white/[0.02] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setLocalSubMode('ollama')}
                className={`py-2 px-2.5 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  localSubMode === 'ollama'
                    ? 'bg-white/[0.08] text-white font-semibold border border-white/10 shadow-xs'
                    : 'text-neutral-200 hover:text-white font-medium border border-transparent'
                }`}
              >
                <Server size={13} className={localSubMode === 'ollama' ? 'text-sky-300' : 'text-neutral-200'} />
                <span className="truncate">Ollama Local Server</span>
              </button>

              <button
                type="button"
                onClick={() => setLocalSubMode('webllm')}
                className={`py-2 px-2.5 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  localSubMode === 'webllm'
                    ? 'bg-white/[0.08] text-white font-semibold border border-white/10 shadow-xs'
                    : 'text-neutral-200 hover:text-white font-medium border border-transparent'
                }`}
              >
                <Cpu size={13} className={localSubMode === 'webllm' ? 'text-indigo-300' : 'text-neutral-200'} />
                <span className="truncate">Browser WebGPU (WebLLM)</span>
              </button>
            </div>
          </div>

          {/* SUB-MODE A: OLLAMA LOCAL SERVER */}
          {localSubMode === 'ollama' && (
            <div className="space-y-3.5 pt-1 animate-in fade-in duration-150">
              {/* Dynamic Helper Text for currently selected engine */}
              <p className="text-xs text-neutral-200 font-normal leading-snug">
                권장 · 로컬 PC의 Ollama 프로세스를 통해 고속 오프라인 추론을 실행합니다.
              </p>

              {/* Ollama Endpoint Input & Test Connection Button */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white">
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
                    className="flex-1 rounded-xl px-3 py-2 text-xs font-mono outline-none transition-colors border bg-white/[0.03] border-white/[0.08] text-white placeholder:text-neutral-300 focus:border-white/25"
                  />
                  <button
                    type="button"
                    onClick={handleTestOllamaConnection}
                    disabled={isTestingOllama || !ollamaEndpoint.trim()}
                    className="px-3 py-2 rounded-xl text-xs font-medium border shrink-0 transition-all active:scale-95 bg-white/[0.04] hover:bg-white/[0.08] text-white border-white/[0.08] disabled:bg-white/[0.02] disabled:text-neutral-300 disabled:border-white/[0.06] cursor-pointer flex items-center gap-1.5"
                  >
                    {isTestingOllama ? (
                      <Loader2 size={13} className="animate-spin text-sky-300" />
                    ) : (
                      <RefreshCw size={13} className="text-neutral-100" />
                    )}
                    <span>연결 테스트</span>
                  </button>
                </div>
              </div>

              {/* Installed Model Dropdown / Manual Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-white">
                    Ollama 모델 선택
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsManualOllamaInput(!isManualOllamaInput)}
                    className="text-xs font-medium text-neutral-200 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
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
                    showSublabelInTrigger={false}
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
                      className="w-full rounded-xl px-3 py-2 text-xs font-mono outline-none transition-colors border bg-white/[0.03] border-white/[0.08] text-white placeholder:text-neutral-300 focus:border-white/25"
                    />
                    {ollamaSelectOptions.length === 0 && (
                      <p className="text-xs text-neutral-200 font-normal">
                        💡 "연결 테스트"를 누르면 Ollama에 설치된 모델 태그를 자동으로 불러옵니다.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Ollama Connection Status Badge & CORS / Mixed Content Help */}
              {ollamaStatus.status && (
                <div className={`text-xs px-3 py-2.5 rounded-xl border space-y-2 ${
                  ollamaStatus.status === 'connected'
                    ? 'bg-emerald-500/[0.06] text-emerald-200 border-emerald-500/20'
                    : 'bg-amber-500/[0.04] text-neutral-100 border-amber-500/25'
                }`}>
                  <div className="flex items-center gap-2 font-medium">
                    {ollamaStatus.status === 'connected' ? (
                      <CheckCircle2 size={13} className="shrink-0 text-emerald-300" />
                    ) : (
                      <AlertTriangle size={13} className="shrink-0 text-amber-300" />
                    )}
                    <span className="text-xs font-medium">{ollamaStatus.message}</span>
                  </div>

                  {ollamaStatus.status === 'error' && (
                    <div className="pt-2 border-t border-amber-500/20 text-xs leading-relaxed space-y-2 font-normal">
                      <div className="space-y-1">
                        <div className="text-neutral-100">
                          브라우저 보안(CORS) 허용을 위해 터미널에서 다음 환경변수를 지정하여 Ollama를 실행해 주세요:
                        </div>
                        <div className="px-2 py-1 rounded bg-white/[0.03] border border-white/[0.08] text-white font-mono text-xs select-all">
                          OLLAMA_ORIGINS="*" ollama serve
                        </div>
                      </div>
                      <p className="text-neutral-100 leading-relaxed pt-1.5 border-t border-white/[0.06]">
                        HTTPS 환경에서는 브라우저가 HTTP localhost 요청(Mixed Content)을 차단할 수 있습니다. 로컬 데스크톱 앱을 사용하거나 브라우저 플래그(
                        <code className="px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-white font-mono text-xs select-all">
                          chrome://flags/#allow-insecure-localhost
                        </code>
                        )에서 안전하지 않은 localhost 허용 설정이 필요할 수 있습니다.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Proactive HTTPS Mixed Content Advisory (Quiet Obsidian Style) */}
              {ollamaStatus.status !== 'error' &&
                ollamaStatus.status !== 'connected' &&
                typeof window !== 'undefined' &&
                window.location.protocol === 'https:' &&
                /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(ollamaEndpoint.trim()) && (
                  <div className="px-3 py-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] flex items-start gap-2">
                    <AlertTriangle size={13} className="shrink-0 text-amber-300 mt-0.5" />
                    <p className="text-xs text-neutral-100 font-normal leading-relaxed">
                      HTTPS 환경에서는 브라우저가 HTTP localhost 요청(Mixed Content)을 차단할 수 있습니다. 로컬 데스크톱 앱을 사용하거나 브라우저 플래그(
                      <code className="px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-white font-mono text-xs select-all">
                        chrome://flags/#allow-insecure-localhost
                      </code>
                      )에서 안전하지 않은 localhost 허용 설정이 필요할 수 있습니다.
                    </p>
                  </div>
                )}
            </div>
          )}

          {/* SUB-MODE B: BROWSER WEBGPU (WEBLLM) */}
          {localSubMode === 'webllm' && (
            <div className="space-y-3.5 pt-1 animate-in fade-in duration-150">
              {/* Dynamic Helper Text for currently selected engine */}
              <p className="text-xs text-neutral-200 font-normal leading-snug">
                클라이언트 순수 브라우저 환경에서 WebGPU 가속을 활용해 직접 추론합니다.
              </p>

              {/* WebGPU Status Check */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-white">
                    온디바이스 브라우저 모델
                  </label>
                  {webGpuStatus === null ? (
                    <span className="text-xs text-neutral-200 flex items-center gap-1 font-normal">
                      <Loader2 size={11} className="animate-spin" /> WebGPU 확인 중
                    </span>
                  ) : webGpuStatus.supported ? (
                    <span className="text-xs font-medium flex items-center gap-1 text-emerald-300">
                      <CheckCircle2 size={12} className="text-emerald-300" />
                      WebGPU 가속 지원
                    </span>
                  ) : (
                    <span className="text-xs font-normal flex items-center gap-1 text-neutral-200">
                      <XCircle size={12} />
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
                  <div className="flex justify-between text-xs text-neutral-200 font-normal">
                    <span>{downloadProgress.text}</span>
                    <span className="font-mono font-medium tabular-nums">{downloadProgress.progress}%</span>
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
                <div className="text-xs text-rose-200 font-normal flex items-center gap-1.5 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <AlertTriangle size={13} className="text-rose-300 shrink-0" />
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
                      className="flex-1 py-2.5 px-3 rounded-xl text-xs font-medium border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-100 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <X size={13} />
                      <span>다운로드 취소</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartWebLLMDownload}
                      disabled={webGpuStatus?.supported === false}
                      className="w-full bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.08] rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition-all active:scale-98 text-xs font-medium disabled:bg-white/[0.02] disabled:text-neutral-300 disabled:border-white/[0.06] cursor-pointer"
                    >
                      <Download size={13} />
                      <span>모델 다운로드 ({localModel === 'llama3-8b' ? '4.5GB' : '1.5GB'})</span>
                    </button>
                  )
                ) : (
                  <div className="flex items-center justify-between gap-2 w-full p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-xs text-emerald-200 font-medium flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-300 shrink-0" />
                      <span>오프라인 추론 준비 완료 (캐시 보관 중)</span>
                    </div>
                    <button
                      type="button"
                      onClick={handlePurgeWebLLMCache}
                      title="로컬 저장소 모델 가중치 삭제"
                      className="py-1 px-2 rounded-lg text-xs border border-white/[0.08] bg-white/[0.04] text-neutral-100 hover:text-white hover:bg-white/[0.08] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 size={12} />
                      <span>캐시 삭제</span>
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs leading-relaxed text-neutral-200 font-normal">
                ⚠️ 모바일 브라우저 환경에서는 대용량 가중치 다운로드 시 메모리 부족(OOM)이나 급격한 배터리 소모가 발생할 수 있습니다.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
