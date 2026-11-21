import React, { useState, useEffect, useRef, useMemo } from 'react';
import { generateSecureId } from '../identifiers';
import { 
  X, 
  Lock, 
  Check, 
  CheckCircle2, 
  AlertTriangle,
  Plus,
  Trash2,
  Download,
  Share2
} from 'lucide-react';
import { 
  getAIEngineConfig, 
  saveAIEngineConfig, 
  getUserPreferences, 
  saveUserPreferences, 
  applyTheme,
  ThemeMode,
  getUserActiveCurrencies,
  saveUserActiveCurrencies,
  KNOWN_CURRENCY_NAMES,
  getCurrencySymbol
} from '../utils';
import {
  sanitizeApiKey,
  getSecureGeminiApiKey,
  setSecureGeminiApiKey,
  clearSecureGeminiApiKey,
  testGeminiApiKeyOnline
} from '../geminiKeyManager';
import { 
  clearAllTransactions, 
  loadSampleData,
  resetAllDataToZero,
  getSpaces,
  createSpace,
  deleteSpace,
  DEFAULT_SPACE
} from '../db';
import { SupportedCurrency, LedgerSpace, UnencryptedBackupPayloadV2 } from '../types';
import { SmartAssetSetup } from './SmartAssetSetup';
import {
  exportEncryptedBackup,
  decryptBackupData,
  isBinaryEnvelope,
  CryptoBackupError
} from '../cryptoBackup';
import {
  buildVaultSnapshot,
  applyVaultSnapshot,
  normalizeBackupPayload,
  summarizeBackupPayload,
  canShareBackupFile,
  triggerEncryptedBackupDownload,
  shareEncryptedBackupFile,
  VaultSnapshotSummary
} from '../vaultSnapshot';
import {
  hasVaultPin,
  setVaultPin,
  removeVaultPin,
  getAutoLockConfig,
  saveAutoLockConfig,
  lockVault,
  VaultLockConfig
} from '../vaultSecurity';
import { evictAllServiceWorkerCaches } from '../usePWAInstall';
import {
  checkWebGPUSupport,
  isWebLLMModelCached,
  isLocalLLMReady,
  downloadAndInitWebLLM,
  cancelWebLLMDownload,
  purgeWebLLMCache,
  ModelDownloadProgress
} from '../webllmManager';
import { LegalNoticeModal } from './LegalNoticeModal';
import { CustomSelectOption } from './settings/CustomDarkSelect';
import { SettingsAITab } from './settings/SettingsAITab';
import { SettingsPreferencesTab } from './settings/SettingsPreferencesTab';
import { SettingsDataTab } from './settings/SettingsDataTab';
import { useI18n } from '../i18n';

export type SettingsTabKey = 'assets' | 'spaces' | 'engine' | 'preferences' | 'privacy';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
  onDataReset?: () => void;
  initialTab?: SettingsTabKey;
  initialSubTab?: 'assets' | 'budget' | 'subscriptions';
  spaces?: LedgerSpace[];
  activeSpaceId?: string;
  onSelectSpace?: (space: LedgerSpace) => void;
  onDeleteSpace?: (spaceId: string) => void;
  onOpenNewSpace?: () => void;
}

const VALID_SETTINGS_TABS: SettingsTabKey[] = ['assets', 'spaces', 'engine', 'preferences', 'privacy'];
const resolveSafeTab = (tab: unknown): SettingsTabKey => {
  return typeof tab === 'string' && (VALID_SETTINGS_TABS as string[]).includes(tab)
    ? (tab as SettingsTabKey)
    : 'assets';
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  onDataChanged, 
  onDataReset, 
  initialTab,
  initialSubTab,
  spaces,
  activeSpaceId,
  onSelectSpace,
  onDeleteSpace,
  onOpenNewSpace
}) => {
  const { t, language } = useI18n();
  // Multi-Ledger Spaces State in Settings
  const [internalSpaces, setInternalSpaces] = useState<LedgerSpace[]>(spaces || [DEFAULT_SPACE]);
  const [legalOpen, setLegalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (spaces) {
      setInternalSpaces(spaces);
    } else if (isOpen) {
      getSpaces().then(s => setInternalSpaces(s)).catch(() => {});
    }
  }, [spaces, isOpen]);

  const handleSelectSpaceItem = (sp: LedgerSpace) => {
    if (onSelectSpace) {
      onSelectSpace(sp);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vibe_active_space_id', sp.id);
    }
    const msg = language === 'ko' ? `'${sp.name}' 장부로 전환되었습니다.` : `Switched to '${sp.name}' ledger.`;
    setStatusMessage({ type: 'success', text: msg });
  };

  const handleDeleteSpaceItem = async (spId: string) => {
    if (spId === 'default') return;
    const confirmMsg = language === 'ko'
      ? '이 프로젝트 장부와 관련 거래 내역을 삭제하시겠습니까?'
      : 'Are you sure you want to delete this project ledger and its transactions?';
    if (!window.confirm(confirmMsg)) return;
    if (onDeleteSpace) {
      onDeleteSpace(spId);
    } else {
      await deleteSpace(spId);
      const updated = await getSpaces();
      setInternalSpaces(updated);
    }
    if (onDataChanged) onDataChanged();
  };

  const handleCreateNewSpace = () => {
    if (onOpenNewSpace) {
      onOpenNewSpace();
    }
  };

  const handleCreateSpaceInline = async () => {
    const trimmed = newSpaceNameInput.trim();
    if (!trimmed) return;
    const newSp: LedgerSpace = {
      id: generateSecureId('space'),
      name: trimmed,
      currency: (currencySymbol as SupportedCurrency) || 'KRW',
      createdAt: new Date().toISOString(),
    };
    await createSpace(newSp);
    const updated = await getSpaces();
    setInternalSpaces(updated);
    setNewSpaceNameInput('');
    if (onSelectSpace) onSelectSpace(newSp);
    if (onDataChanged) onDataChanged();
  };

  // 5-Tab Segmented Control: [ 스마트 자산 | 다중 장부 | AI 엔진 | 일반 설정 | 데이터 관리 ]
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(resolveSafeTab(initialTab));
  const [isAddingSpace, setIsAddingSpace] = useState<boolean>(false);
  const [subTab, setSubTab] = useState<'assets' | 'budget' | 'subscriptions'>(initialSubTab || 'assets');

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Tab 1: AI Engine state
  const [engineType, setEngineType] = useState<'local' | 'byok'>('byok');
  const [localModel, setLocalModel] = useState<'gemma-2b' | 'llama3-8b'>('gemma-2b');
  const [provider, setProvider] = useState<'gemini' | 'openai' | 'anthropic'>('gemini');
  const [modelTier, setModelTier] = useState<string>('gemini-3.8-flash');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'valid' | 'invalid' | null; message: string }>({
    status: null,
    message: ''
  });

  // Local AI (Ollama vs WebLLM) state
  const [localSubMode, setLocalSubMode] = useState<'ollama' | 'webllm'>('ollama');
  const [ollamaEndpoint, setOllamaEndpoint] = useState<string>('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState<string>('gemma2:9b');
  const [ollamaModelsList, setOllamaModelsList] = useState<string[]>([]);
  const [isTestingOllama, setIsTestingOllama] = useState<boolean>(false);
  const [ollamaStatus, setOllamaStatus] = useState<{ status: 'connected' | 'error' | null; message: string }>({
    status: null,
    message: ''
  });

  // WebLLM Tier 3 state
  const [webGpuStatus, setWebGpuStatus] = useState<{ supported: boolean; reason?: string } | null>(null);
  const [isModelDownloaded, setIsModelDownloaded] = useState<boolean>(false);
  const [isDownloadingModel, setIsDownloadingModel] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Tab 2: Financial Preferences state
  const [budgetStartDay, setBudgetStartDay] = useState<number>(1);
  const [currencySymbol, setCurrencySymbol] = useState<string>('KRW');
  const [stealthMode, setStealthMode] = useState<boolean>(false);
  const [, setTheme] = useState<ThemeMode>('dark');
  const [autoCategorization, setAutoCategorization] = useState<boolean>(true);
  const [defaultLaunchScreen, setDefaultLaunchScreen] = useState<'vault' | 'insights' | 'ledger'>('vault');
  const [activeCurrenciesList, setActiveCurrenciesList] = useState<string[]>(() => {
    const list = getUserActiveCurrencies();
    return list.length > 0 ? list : ['KRW'];
  });
  const [newCurrencyInput, setNewCurrencyInput] = useState('');
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [newSpaceNameInput, setNewSpaceNameInput] = useState('');

  // Sync active currencies if changed externally or in storage
  useEffect(() => {
    const syncCurrencies = () => {
      const stored = getUserActiveCurrencies();
      setActiveCurrenciesList(stored.length > 0 ? stored : ['KRW']);
    };
    window.addEventListener('storage', syncCurrencies);
    return () => window.removeEventListener('storage', syncCurrencies);
  }, []);

  // Tab 3: Data & Privacy state
  const [lastExportedDate, setLastExportedDate] = useState<string>('없음');
  const [isClearingData, setIsClearingData] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Tab 3: Vault Security & At-Rest Encryption state
  const [isPinSet, setIsPinSet] = useState<boolean>(false);
  const [autoLockConfigState, setAutoLockConfigState] = useState<VaultLockConfig>({
    enabled: true,
    timeoutMinutes: 15,
    lockOnVisibilityHidden: true,
  });
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [pinModalMode, setPinModalMode] = useState<'set' | 'remove'>('set');
  const [pinInput, setPinInput] = useState('');
  const [pinConfirmInput, setPinConfirmInput] = useState('');
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Phase 4 / Step 1: AES-GCM-256 Encrypted Full Vault Backup (v3) & Smart Deduplicated Merge
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportPreview, setExportPreview] = useState<VaultSnapshotSummary | null>(null);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isDecryptModalOpen, setIsDecryptModalOpen] = useState(false);
  const [decryptPassphrase, setDecryptPassphrase] = useState('');
  const [isDecryptingBackup, setIsDecryptingBackup] = useState(false);
  const [pendingEncryptedData, setPendingEncryptedData] = useState<any>(null);
  const [pendingRestorePayload, setPendingRestorePayload] = useState<UnencryptedBackupPayloadV2 | null>(null);
  const [pendingRestoreSummary, setPendingRestoreSummary] = useState<VaultSnapshotSummary | null>(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const supportsFileShare = useMemo(() => canShareBackupFile(), []);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Budget Day Options (1일 ~ 31일) for sleek dropdown picker
  const budgetDayOptions: CustomSelectOption[] = Array.from({ length: 31 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1}일`,
  }));

  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(resolveSafeTab(initialTab));
      }
      // Load current AI Engine config
      const engineCfg = getAIEngineConfig();
      setEngineType(engineCfg.engineType || 'byok');
      setLocalModel(engineCfg.localModel || 'gemma-2b');
      setProvider(engineCfg.provider || 'gemini');
      setModelTier(engineCfg.modelTier || 'gemini-3.8-flash');
      setApiKey(engineCfg.apiKey || getSecureGeminiApiKey() || '');
      setShowKey(false);
      setTestResult({ status: null, message: '' });
      setLocalSubMode(engineCfg.localSubMode || 'ollama');
      setOllamaEndpoint(engineCfg.ollamaEndpoint || 'http://localhost:11434');
      setOllamaModel(engineCfg.ollamaModel || 'gemma2:9b');
      setOllamaStatus({ status: null, message: '' });

      // Check WebGPU hardware & model cache state
      checkWebGPUSupport().then(res => setWebGpuStatus(res));
      setIsModelDownloaded(isWebLLMModelCached() || isLocalLLMReady());

      // Load User Preferences
      const prefs = getUserPreferences();
      setBudgetStartDay(prefs.budgetStartDay ?? 1);
      setCurrencySymbol(prefs.currencySymbol || 'KRW');
      setStealthMode(prefs.stealthMode ?? false);
      setTheme('dark');
      setAutoCategorization(prefs.autoCategorization !== undefined ? !!prefs.autoCategorization : true);
      setDefaultLaunchScreen(prefs.defaultLaunchScreen || 'vault');

      // Load last export date from localStorage
      const lastExp = localStorage.getItem('vibe_last_export_date');
      setLastExportedDate(lastExp || '없음');

      // Load Vault Security & PIN state
      setIsPinSet(hasVaultPin());
      setAutoLockConfigState(getAutoLockConfig());
      setStatusMessage(null);
    }
  }, [isOpen, initialTab]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    try {
      if (pinModalMode === 'set') {
        if (pinInput.length < 4) {
          setPinError('PIN 번호는 최소 4자리 이상이어야 합니다.');
          return;
        }
        if (pinInput !== pinConfirmInput) {
          setPinError('PIN 번호 확인이 일치하지 않습니다.');
          return;
        }
        await setVaultPin(pinInput);
        setIsPinSet(true);
        setShowPinModal(false);
        setPinInput('');
        setPinConfirmInput('');
        setStatusMessage({ type: 'success', text: '금고 PIN 보안 설정이 완료되었습니다.' });
      } else if (pinModalMode === 'remove') {
        const removed = await removeVaultPin(currentPinInput);
        if (!removed) {
          setPinError('현재 PIN 번호가 올바르지 않습니다.');
          return;
        }
        setIsPinSet(false);
        setShowPinModal(false);
        setCurrentPinInput('');
        setStatusMessage({ type: 'success', text: '금고 PIN 보호가 해제되었습니다. (기기 마스터 키로 암호화 유지)' });
      }
    } catch (err: any) {
      setPinError(err.message || 'PIN 처리 중 오류가 발생했습니다.');
    }
  };

  // Local model options
  const localModelOptions: CustomSelectOption[] = [
    { value: 'gemma-2b', label: 'Gemma 2B', sublabel: '초고속 경량 - 1.3GB' },
    { value: 'llama3-8b', label: 'Llama 3 8B', sublabel: '심층 처리 - 4.5GB' },
  ];

  // Dynamic Currency options based on user active currencies list
  const currencyOptions: CustomSelectOption[] = useMemo(() => {
    const all = Array.from(new Set([...activeCurrenciesList, currencySymbol])).filter(Boolean);
    return all.map((c) => {
      const info = KNOWN_CURRENCY_NAMES[c];
      const sym = getCurrencySymbol(c);
      const label = info ? `${info.nameKo} (${sym})` : `${c} (${sym})`;
      return { value: c, label };
    });
  }, [activeCurrenciesList, currencySymbol]);

  const handleAddActiveCurrency = (rawCode: string) => {
    setCurrencyError(null);
    const code = rawCode.trim().toUpperCase();
    if (!code) {
      setCurrencyError('통화 코드를 입력해주세요 (예: IDR, USD).');
      return;
    }
    if (!/^[A-Z]{3}$/.test(code)) {
      setCurrencyError('유효한 3자리 ISO 통화 코드를 입력해주세요.');
      return;
    }
    if (activeCurrenciesList.includes(code)) {
      setCurrencyError(`이미 등록된 통화입니다: ${code}`);
      return;
    }
    const updated = [...activeCurrenciesList, code];
    setActiveCurrenciesList(updated);
    saveUserActiveCurrencies(updated);
    setNewCurrencyInput('');
    if (onDataChanged) onDataChanged();
  };

  const handleRemoveActiveCurrency = (codeToRemove: string) => {
    const upper = codeToRemove.toUpperCase();
    if (upper === currencySymbol.toUpperCase()) {
      setCurrencyError('현재 기본 기준 통화는 목록에서 삭제할 수 없습니다.');
      return;
    }
    if (activeCurrenciesList.length <= 1) {
      setCurrencyError('최소 1개 이상의 통화가 유지되어야 합니다.');
      return;
    }
    setCurrencyError(null);
    const updated = activeCurrenciesList.filter((c) => c !== upper);
    setActiveCurrenciesList(updated);
    saveUserActiveCurrencies(updated);
    if (onDataChanged) onDataChanged();
  };

  // Clear API Key completely from state and secure storage
  const handleClearKey = () => {
    setApiKey('');
    clearSecureGeminiApiKey();
    setTestResult({ status: null, message: '' });
    setStatusMessage({ type: 'success', text: 'API 키가 안전하게 완전히 삭제되었습니다.' });
  };

  // Test API Key with zero key leakage
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
        setTestResult({
          status: testRes.valid ? 'valid' : 'invalid',
          message: testRes.message
        });
      } else {
        const res = await fetch('/api/validate-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey: cleanKey, modelTier })
        });
        const data = await res.json();
        if (res.ok && data.valid) {
          setTestResult({ status: 'valid', message: 'API 키가 유효합니다.' });
        } else {
          setTestResult({ status: 'invalid', message: data.message || 'API 키 검증 실패' });
        }
      }
    } catch (err: any) {
      setTestResult({ status: 'invalid', message: err.message || '검증 서버 통신 실패' });
    } finally {
      setIsTestingKey(false);
    }
  };

  // Ollama Connection Test Handler
  const handleTestOllamaConnection = async () => {
    const ep = ollamaEndpoint.trim().replace(/\/+$/, '');
    if (!ep) {
      setOllamaStatus({
        status: 'error',
        message: 'Ollama 엔드포인트 URL을 입력해주세요.'
      });
      return;
    }

    let safeOrigin: string;
    try {
      const parsed = new URL(ep);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('INVALID_PROTOCOL');
      }
      if (parsed.username || parsed.password) {
        throw new Error('CREDENTIALS_NOT_ALLOWED');
      }
      safeOrigin = parsed.origin;
    } catch {
      setOllamaStatus({
        status: 'error',
        message: '올바른 http:// 또는 https:// Ollama 서버 주소를 입력해주세요.'
      });
      return;
    }

    setIsTestingOllama(true);
    setOllamaStatus({ status: null, message: '' });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${safeOrigin}/api/tags`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: controller.signal
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
            : 'Ollama 서버 연결 성공 (설치된 모델 없음)'
        });
      } else {
        setOllamaStatus({
          status: 'error',
          message: `HTTP ${res.status}: Ollama 서버 응답 오류`
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setOllamaStatus({
          status: 'error',
          message: '연결 시간 초과 (6초). Ollama가 실행 중인지 확인해주세요.'
        });
      } else {
        const isHttpsMixedLocalhost =
          typeof window !== 'undefined'
          && window.location.protocol === 'https:'
          && /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(ep);

        setOllamaStatus({
          status: 'error',
          message: isHttpsMixedLocalhost
            ? 'Ollama 서버에 연결할 수 없습니다. CORS 설정 및 HTTPS 환경에서의 HTTP localhost 차단(Mixed Content) 여부를 확인해 주세요.'
            : 'Ollama 서버에 연결할 수 없습니다. Ollama 실행 여부 및 CORS 설정을 확인해 주세요 (OLLAMA_ORIGINS="*" ollama serve).'
        });
      }
    } finally {
      setIsTestingOllama(false);
    }
  };

  // WebLLM Model Management Handlers
  const handleStartWebLLMDownload = async () => {
    setIsDownloadingModel(true);
    setDownloadError(null);
    setDownloadProgress({ progress: 0, text: '가중치 다운로드 준비 중...' });

    try {
      await downloadAndInitWebLLM(localModel, (progress) => {
        setDownloadProgress(progress);
      });
      setIsModelDownloaded(true);
      setStatusMessage({ type: 'success', text: `${localModel} 모델 가중치가 로컬 캐시에 안전하게 저장되었습니다.` });
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
    setStatusMessage({ type: 'error', text: '모델 다운로드가 취소되었습니다.' });
  };

  const handlePurgeWebLLMCache = async () => {
    if (!window.confirm('로컬 저장소에 캐시된 모델 가중치를 삭제하시겠습니까? (약 1.3GB~4.5GB 저장공간 확보)')) {
      return;
    }
    try {
      await purgeWebLLMCache();
      setIsModelDownloaded(false);
      setStatusMessage({ type: 'success', text: '로컬 모델 캐시가 완전히 삭제되었습니다.' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: '캐시 삭제 실패: ' + err.message });
    }
  };

  // Save All Settings
  const handleSaveAll = async () => {
    try {
      const cleanKey = sanitizeApiKey(apiKey);
      if (cleanKey && provider === 'gemini') {
        await setSecureGeminiApiKey(cleanKey);
      } else {
        clearSecureGeminiApiKey();
      }
      saveAIEngineConfig({
        engineType,
        provider,
        modelTier,
        localModel,
        apiKey: cleanKey,
        localSubMode,
        ollamaEndpoint: ollamaEndpoint.trim(),
        ollamaModel: ollamaModel.trim(),
      });

      const currentPrefs = getUserPreferences();
      const updatedPrefs = {
        ...currentPrefs,
        budgetStartDay,
        currencySymbol,
        stealthMode,
        theme: 'dark' as ThemeMode,
        autoCategorization,
        defaultLaunchScreen,
      };
      saveUserPreferences(updatedPrefs);
      applyTheme('dark', updatedPrefs.seasonTheme);

      setStatusMessage({ type: 'success', text: '모든 설정이 안전하게 저장되었습니다.' });

      if (onDataChanged) {
        onDataChanged();
      }

      setTimeout(() => {
        onClose();
      }, 400);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: '설정 저장 중 오류가 발생했습니다: ' + err.message });
    }
  };

  // Open Export Modal & load live v3 vault snapshot summary
  const handleOpenExportModal = () => {
    setExportPassphrase('');
    setExportPreview(null);
    setIsExportModalOpen(true);
    buildVaultSnapshot()
      .then((snap) => setExportPreview(summarizeBackupPayload(snap)))
      .catch(() => {});
  };

  // Perform Encrypted Full Vault Export (v3) — Download or OS Share Sheet
  const handlePerformExport = async (delivery: 'download' | 'share' = 'download') => {
    const isKo = language === 'ko';
    if (!exportPassphrase.trim()) {
      setStatusMessage({
        type: 'error',
        text: isKo
          ? '금융 데이터 평문 유출 방지를 위해 AES-GCM 암호화 비밀번호를 입력해주세요.'
          : 'Please enter an AES-GCM encryption passphrase to protect your financial backup.',
      });
      return;
    }

    setIsExportingBackup(true);
    try {
      const snapshot = await buildVaultSnapshot();
      const summary = summarizeBackupPayload(snapshot);

      const { filename, encryptedPayload } = await exportEncryptedBackup(
        snapshot,
        exportPassphrase.trim(),
        { appName: 'Vibe Vault Pro' }
      );

      let deliveryStatus: 'downloaded' | 'shared' | 'cancelled' = 'downloaded';
      if (delivery === 'share') {
        const shareResult = await shareEncryptedBackupFile(filename, encryptedPayload, {
          title: 'Vibe Vault Encrypted Backup (.vibe.enc)',
          text: isKo
            ? 'AES-GCM-256 암호화된 전체 볼트 백업 파일입니다.'
            : 'AES-GCM-256 encrypted full vault backup file.',
        });
        if (shareResult === 'shared') {
          deliveryStatus = 'shared';
        } else if (shareResult === 'cancelled') {
          deliveryStatus = 'cancelled';
        } else {
          triggerEncryptedBackupDownload(filename, encryptedPayload);
          deliveryStatus = 'downloaded';
        }
      } else {
        triggerEncryptedBackupDownload(filename, encryptedPayload);
      }

      if (deliveryStatus === 'cancelled') {
        return;
      }

      const nowFormatted = new Date().toLocaleDateString(isKo ? 'ko-KR' : 'en-US', {
        month: 'short',
        day: 'numeric',
      });
      setLastExportedDate(nowFormatted);
      localStorage.setItem('vibe_last_export_date', nowFormatted);

      setIsExportModalOpen(false);
      setExportPassphrase('');
      setStatusMessage({
        type: 'success',
        text: isKo
          ? `전체 볼트 v3 암호화 백업 ${deliveryStatus === 'shared' ? '공유' : '저장'} 완료 (계좌 ${summary.accountCount} · 대출 ${summary.debtCount} · 거래 ${summary.transactionCount} · 장부 ${summary.spaceCount})`
          : `Full Vault v3 encrypted backup ${deliveryStatus === 'shared' ? 'shared' : 'saved'} (${summary.accountCount} accounts · ${summary.debtCount} debts · ${summary.transactionCount} transactions · ${summary.spaceCount} ledgers)`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: (isKo ? '내보내기 실패: ' : 'Export failed: ') + (err?.message || String(err)),
      });
    } finally {
      setIsExportingBackup(false);
    }
  };

  // Phase 4 / Step 1: Restore File (.vibe.enc / .enc / .json)
  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isKo = language === 'ko';

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      if (isBinaryEnvelope(uint8)) {
        setPendingEncryptedData(uint8);
        setDecryptPassphrase('');
        setIsDecryptModalOpen(true);
        return;
      }

      const text = new TextDecoder('utf-8').decode(uint8);
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        setStatusMessage({
          type: 'error',
          text: isKo
            ? '백업 파일을 읽을 수 없습니다. 올바른 .vibe.enc, .enc 또는 .json 백업 파일인지 확인해주세요.'
            : 'Unable to read backup file. Please verify it is a valid .vibe.enc, .enc, or .json backup.',
        });
        return;
      }

      if (
        json.cipher === 'AES-GCM-256' ||
        json.format === 'vibe-vault-encrypted-v1' ||
        json.format === 'vibe-encrypted-v2' ||
        json.version === 'VVLT_V1' ||
        json.magic === 'VVLT_V1'
      ) {
        setPendingEncryptedData(json);
        setDecryptPassphrase('');
        setIsDecryptModalOpen(true);
        return;
      }

      prepareRestore(json);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: (isKo ? '백업 파일을 읽는 데 실패했습니다: ' : 'Failed to read backup file: ') + (err?.message || String(err)),
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Decryption execution
  const handlePerformDecryption = async () => {
    if (!decryptPassphrase.trim() || !pendingEncryptedData || isDecryptingBackup) return;
    const isKo = language === 'ko';
    setIsDecryptingBackup(true);
    try {
      const decrypted = await decryptBackupData(pendingEncryptedData, decryptPassphrase.trim());
      setIsDecryptModalOpen(false);
      setPendingEncryptedData(null);
      setDecryptPassphrase('');
      prepareRestore(decrypted);
    } catch (err: any) {
      let errorText = isKo ? '복호화에 실패했습니다.' : 'Decryption failed.';
      if (err instanceof CryptoBackupError) {
        if (err.code === 'INVALID_PASSPHRASE') {
          errorText = isKo
            ? '비밀번호가 올바르지 않거나 인증 태그 검증에 실패했습니다.'
            : 'Incorrect passphrase or authentication tag verification failed.';
        } else if (err.code === 'TAMPERED_PAYLOAD') {
          errorText = isKo
            ? '백업 데이터가 변조되었거나 무결성 검증에 실패했습니다 (TAMPERED_PAYLOAD).'
            : 'Backup integrity check failed — payload may have been tampered with.';
        } else if (err.code === 'CORRUPTED_PAYLOAD') {
          errorText = isKo
            ? '백업 파일이 손상되었거나 형식이 유효하지 않습니다.'
            : 'Backup file is corrupted or has an invalid format.';
        } else if (err.code === 'UNSUPPORTED_VERSION') {
          errorText = isKo
            ? '지원되지 않는 백업 파일 버전입니다.'
            : 'Unsupported backup file version.';
        } else {
          errorText = err.message;
        }
      } else if (err?.message) {
        errorText = err.message;
      }
      setStatusMessage({ type: 'error', text: errorText });
    } finally {
      setIsDecryptingBackup(false);
    }
  };

  const prepareRestore = (payload: any) => {
    const isKo = language === 'ko';
    const normalized = normalizeBackupPayload(payload);
    const summary = summarizeBackupPayload(normalized);

    if (!normalized || !summary.hasAnyData) {
      setStatusMessage({
        type: 'error',
        text: isKo
          ? '파일에서 복원할 유효한 볼트 데이터(계좌, 대출, 거래, 장부, 설정)를 찾을 수 없습니다.'
          : 'No valid vault data (accounts, debts, transactions, ledgers, or settings) found in this file.',
      });
      return;
    }

    setPendingRestorePayload(normalized);
    setPendingRestoreSummary(summary);
    setIsMergeModalOpen(true);
  };

  const handleExecuteRestore = async (mode: 'merge' | 'overwrite') => {
    if (!pendingRestorePayload || isRestoringBackup) return;
    const isKo = language === 'ko';
    setIsRestoringBackup(true);
    try {
      const { snapshot, stats, appliedPreferences } = await applyVaultSnapshot(
        pendingRestorePayload,
        mode
      );

      if (appliedPreferences) {
        setBudgetStartDay(appliedPreferences.budgetStartDay ?? 1);
        setCurrencySymbol(appliedPreferences.currencySymbol || 'KRW');
        setStealthMode(!!appliedPreferences.stealthMode);
        if (appliedPreferences.theme) {
          setTheme(appliedPreferences.theme);
        }
      }
      setInternalSpaces(snapshot.spaces);
      setActiveCurrenciesList(snapshot.activeCurrencies);

      setIsMergeModalOpen(false);
      setPendingRestorePayload(null);
      setPendingRestoreSummary(null);

      const msg =
        mode === 'merge'
          ? isKo
            ? `스마트 병합 완료 · 계좌 ${stats.assetAccounts.total}개(+${stats.assetAccounts.added}/갱신 ${stats.assetAccounts.updated}) · 대출 ${stats.debts.total}건 · 거래 +${stats.transactions.added}건(중복 ${stats.transactions.skipped}건 제외) · 장부 ${stats.spaces.total}개`
            : `Smart merge complete · ${stats.assetAccounts.total} accounts (+${stats.assetAccounts.added}/${stats.assetAccounts.updated} updated) · ${stats.debts.total} debts · +${stats.transactions.added} transactions (${stats.transactions.skipped} skipped) · ${stats.spaces.total} ledgers`
          : isKo
            ? `전체 덮어쓰기 완료 · 계좌 ${stats.assetAccounts.total}개 · 대출 ${stats.debts.total}건 · 거래 ${stats.transactions.total}건 · 장부 ${stats.spaces.total}개 반영`
            : `Full overwrite complete · ${stats.assetAccounts.total} accounts · ${stats.debts.total} debts · ${stats.transactions.total} transactions · ${stats.spaces.total} ledgers restored`;

      setStatusMessage({ type: 'success', text: msg });
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: (isKo ? '복원 처리 중 오류가 발생했습니다: ' : 'Restore failed: ') + (err?.message || String(err)),
      });
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleLoadSampleData = async () => {
    setIsClearingData(true);
    try {
      const res = await loadSampleData();
      setStatusMessage({ 
        type: 'success', 
        text: `샘플 데이터 로드 완료 (자산 ${res.accountsCount}개, 대출 ${res.debtsCount}건, 거래 ${res.transactionsCount}건)` 
      });
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: '샘플 데이터 로드 실패: ' + err.message });
    } finally {
      setIsClearingData(false);
    }
  };

  const handleResetAllData = async () => {
    if (!window.confirm('모든 데이터(자산, 대출, 거래 내역, 보안 PIN, 설정)를 완전히 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }
    setIsClearingData(true);
    try {
      await resetAllDataToZero();
      await clearAllTransactions().catch(() => {});

      localStorage.removeItem('vibe_engine_config');
      localStorage.removeItem('vibe_user_preferences');
      localStorage.removeItem('vibe_user_assets');
      localStorage.removeItem('vibe_last_export_date');
      localStorage.removeItem('vibe_saved_subscriptions');

      setApiKey('');
      setEngineType('byok');
      setProvider('gemini');
      setBudgetStartDay(1);
      setCurrencySymbol('KRW');
      setStealthMode(false);
      setTheme('dark');
      applyTheme('dark');
      setLastExportedDate('없음');
      setIsPinSet(false);

      await evictAllServiceWorkerCaches().catch(() => false);

      setStatusMessage({ type: 'success', text: '전체 데이터와 설정이 성공적으로 초기화되었습니다.' });
      if (onDataReset) onDataReset();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: '데이터 초기화 실패: ' + err.message });
    } finally {
      setIsClearingData(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg sm:max-w-xl md:max-w-2xl h-[680px] max-h-[88vh] bg-[var(--surface-panel)] border border-[var(--surface-subtle-border)] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white antialiased transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header: px-6 py-5 border-b border-white/[0.06] */}
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <h2 className="text-base font-bold tracking-tight text-white">{t('settings')}</h2>
          <button 
            type="button" 
            onClick={onClose}
            className="p-1.5 -mr-1 rounded-full text-neutral-200 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            title={t('close')}
            aria-label={t('close')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Sticky Tab Bar: responsive 5-tab layout so Data Management is always visible on mobile */}
        <div className="px-2.5 sm:px-6 pt-2 border-b border-white/[0.06] shrink-0">
          <div
            role="tablist"
            aria-label={t('settings')}
            className="flex items-center justify-between sm:justify-start sm:gap-2 whitespace-nowrap"
          >
            <button
              id="tab-assets"
              role="tab"
              aria-selected={activeTab === 'assets'}
              type="button"
              onClick={() => setActiveTab('assets')}
              className={`text-[11px] sm:text-xs text-center transition-colors relative whitespace-nowrap shrink-0 px-1.5 sm:px-3 pb-2.5 cursor-pointer ${
                activeTab === 'assets'
                  ? 'border-b-2 border-[var(--color-accent)] text-white font-semibold'
                  : 'text-neutral-200 hover:text-white font-medium border-b-2 border-transparent'
              }`}
            >
              {language === 'ko' ? (
                t('tab_smart_assets')
              ) : (
                <>
                  <span className="sm:hidden">Assets</span>
                  <span className="hidden sm:inline">{t('tab_smart_assets')}</span>
                </>
              )}
            </button>

            <button
              id="tab-spaces"
              role="tab"
              aria-selected={activeTab === 'spaces'}
              type="button"
              onClick={() => setActiveTab('spaces')}
              className={`text-[11px] sm:text-xs text-center transition-colors relative whitespace-nowrap shrink-0 px-1.5 sm:px-3 pb-2.5 cursor-pointer ${
                activeTab === 'spaces'
                  ? 'border-b-2 border-[var(--color-accent)] text-white font-semibold'
                  : 'text-neutral-200 hover:text-white font-medium border-b-2 border-transparent'
              }`}
            >
              {language === 'ko' ? (
                t('tab_multi_ledger')
              ) : (
                <>
                  <span className="sm:hidden">Ledgers</span>
                  <span className="hidden sm:inline">{t('tab_multi_ledger')}</span>
                </>
              )}
            </button>

            <button
              id="tab-ai-engine"
              role="tab"
              aria-selected={activeTab === 'engine'}
              type="button"
              onClick={() => setActiveTab('engine')}
              className={`text-[11px] sm:text-xs text-center transition-colors relative whitespace-nowrap shrink-0 px-1.5 sm:px-3 pb-2.5 cursor-pointer ${
                activeTab === 'engine'
                  ? 'border-b-2 border-[var(--color-accent)] text-white font-semibold'
                  : 'text-neutral-200 hover:text-white font-medium border-b-2 border-transparent'
              }`}
            >
              {language === 'ko' ? (
                t('tab_ai_engine')
              ) : (
                <>
                  <span className="sm:hidden">AI</span>
                  <span className="hidden sm:inline">{t('tab_ai_engine')}</span>
                </>
              )}
            </button>

            <button
              id="tab-prefs"
              role="tab"
              aria-selected={activeTab === 'preferences'}
              type="button"
              onClick={() => setActiveTab('preferences')}
              className={`text-[11px] sm:text-xs text-center transition-colors relative whitespace-nowrap shrink-0 px-1.5 sm:px-3 pb-2.5 cursor-pointer ${
                activeTab === 'preferences'
                  ? 'border-b-2 border-[var(--color-accent)] text-white font-semibold'
                  : 'text-neutral-200 hover:text-white font-medium border-b-2 border-transparent'
              }`}
            >
              {language === 'ko' ? (
                t('tab_preferences')
              ) : (
                <>
                  <span className="sm:hidden">General</span>
                  <span className="hidden sm:inline">{t('tab_preferences')}</span>
                </>
              )}
            </button>

            <button
              id="tab-data"
              role="tab"
              aria-selected={activeTab === 'privacy'}
              type="button"
              onClick={() => setActiveTab('privacy')}
              className={`text-[11px] sm:text-xs text-center transition-colors relative whitespace-nowrap shrink-0 px-1.5 sm:px-3 pb-2.5 cursor-pointer ${
                activeTab === 'privacy'
                  ? 'border-b-2 border-[var(--color-accent)] text-white font-semibold'
                  : 'text-neutral-200 hover:text-white font-medium border-b-2 border-transparent'
              }`}
            >
              {language === 'ko' ? (
                t('tab_privacy_data')
              ) : (
                <>
                  <span className="sm:hidden">Data</span>
                  <span className="hidden sm:inline">{t('tab_privacy_data')}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Status Toast inside Modal */}
        {statusMessage && (
          <div className={`mx-6 mt-3 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between shrink-0 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200' 
              : 'bg-white/[0.04] border border-white/[0.08] text-neutral-100'
          }`}>
            <span className="truncate">{statusMessage.text}</span>
            <button 
              type="button"
              onClick={() => setStatusMessage(null)} 
              aria-label="상태 메시지 닫기"
              className="ml-1 text-sm font-bold text-neutral-200 hover:text-white cursor-pointer transition-colors"
            >
              ×
            </button>
          </div>
        )}

        {/* Main Body: flex-1 overflow-y-auto overscroll-contain p-6 space-y-4 scrollbar-none */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-4 scrollbar-none text-sm">
          {/* TAB 0: SMART ASSET SETUP */}
          {activeTab === 'assets' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <SmartAssetSetup 
                theme="dark"
                currentCurrency={(currencySymbol as SupportedCurrency) || 'KRW'}
                initialSubTab={subTab}
                onAssetsUpdated={() => {
                  if (onDataChanged) onDataChanged();
                }} 
              />
            </div>
          )}

          {/* TAB 1: MULTI-LEDGER SPACES */}
          {activeTab === 'spaces' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-100">
                      {t('multi_ledger_spaces')}
                    </h3>
                    <span className="text-xs text-neutral-200 font-mono tabular-nums">
                      ({internalSpaces.length})
                    </span>
                  </div>
                  <p className="text-xs text-neutral-200 leading-relaxed font-normal">
                    {t('multi_ledger_desc')}
                  </p>
                </div>

                <button
                  id="btn-new-space"
                  type="button"
                  onClick={() => setIsAddingSpace((prev) => !prev)}
                  className="text-xs px-3 py-1.5 rounded-full font-medium border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-white transition-all flex items-center gap-1 active:scale-95 shrink-0 whitespace-nowrap cursor-pointer"
                >
                  <Plus size={12} />
                  <span>{t('new_space')}</span>
                </button>
              </div>

              {/* Collapsible / Inline Space Creation Card */}
              {isAddingSpace && (
                <div className="p-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newSpaceNameInput}
                      onChange={(e) => setNewSpaceNameInput(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          await handleCreateSpaceInline();
                          setIsAddingSpace(false);
                        }
                      }}
                      autoFocus
                      placeholder={t('space_name_placeholder')}
                      className="flex-1 bg-white/[0.02] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder:text-neutral-300 focus:outline-none focus:border-white/25 transition-all"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await handleCreateSpaceInline();
                        setIsAddingSpace(false);
                      }}
                      disabled={!newSpaceNameInput.trim()}
                      className="h-8 px-3.5 rounded-xl bg-white text-black hover:bg-neutral-100 active:scale-95 text-xs font-semibold transition-all disabled:bg-white/35 disabled:text-black shrink-0 cursor-pointer"
                    >
                      {t('create')}
                    </button>
                  </div>
                  {onOpenNewSpace && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleCreateNewSpace}
                        className="text-xs text-neutral-200 hover:text-white font-normal transition-colors underline underline-offset-2 cursor-pointer"
                      >
                        {t('create_with_details')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Ledger Spaces List */}
              <div className="space-y-2">
                {internalSpaces.map((sp) => {
                  const isCurrent = sp.id === (activeSpaceId || 'default');
                  const isDefault = sp.id === 'default';

                  return (
                    <div
                      key={sp.id}
                      className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-colors ${
                        isCurrent
                          ? 'bg-white/[0.05] border-white/15 text-white'
                          : 'bg-white/[0.02] border-white/[0.06] text-neutral-100 hover:border-white/[0.12]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-medium text-xs sm:text-[13px] text-white truncate">
                          {sp.name}
                        </span>
                        {sp.currency && (
                          <span className="text-[10px] font-mono text-neutral-200 shrink-0">
                            · {sp.currency}
                          </span>
                        )}
                        {isDefault && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.05] text-neutral-100 border border-white/[0.08] font-medium shrink-0">
                            {t('default')}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium shrink-0">
                            {t('active')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleSelectSpaceItem(sp)}
                            className="px-2.5 py-1 rounded-full text-xs font-medium border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-white transition-all active:scale-95 cursor-pointer"
                          >
                            {t('switch')}
                          </button>
                        )}
                        {!isDefault && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSpaceItem(sp.id)}
                            className="p-1.5 rounded-full text-neutral-200 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                            title={t('delete_space')}
                            aria-label={`${sp.name} ${t('delete_space')}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 1: AI ENGINE CONFIGURATION */}
          {activeTab === 'engine' && (
            <SettingsAITab
              engineType={engineType}
              setEngineType={setEngineType}
              setProvider={setProvider}
              modelTier={modelTier}
              setModelTier={setModelTier}
              apiKey={apiKey}
              setApiKey={setApiKey}
              showKey={showKey}
              setShowKey={setShowKey}
              handleClearKey={handleClearKey}
              handleTestKey={handleTestKey}
              isTestingKey={isTestingKey}
              testResult={testResult}
              setTestResult={setTestResult}
              localSubMode={localSubMode}
              setLocalSubMode={setLocalSubMode}
              ollamaEndpoint={ollamaEndpoint}
              setOllamaEndpoint={setOllamaEndpoint}
              ollamaModel={ollamaModel}
              setOllamaModel={setOllamaModel}
              ollamaModelsList={ollamaModelsList}
              isTestingOllama={isTestingOllama}
              ollamaStatus={ollamaStatus}
              handleTestOllamaConnection={handleTestOllamaConnection}
              localModel={localModel}
              setLocalModel={setLocalModel}
              webGpuStatus={webGpuStatus}
              localModelOptions={localModelOptions}
              isDownloadingModel={isDownloadingModel}
              downloadProgress={downloadProgress}
              downloadError={downloadError}
              isModelDownloaded={isModelDownloaded}
              handleCancelWebLLMDownload={handleCancelWebLLMDownload}
              handleStartWebLLMDownload={handleStartWebLLMDownload}
              handlePurgeWebLLMCache={handlePurgeWebLLMCache}
            />
          )}

          {/* TAB 3: GENERAL SETTINGS */}
          {activeTab === 'preferences' && (
            <SettingsPreferencesTab
              defaultLaunchScreen={defaultLaunchScreen}
              setDefaultLaunchScreen={setDefaultLaunchScreen}
              currencySymbol={currencySymbol}
              setCurrencySymbol={setCurrencySymbol}
              currencyOptions={currencyOptions}
              activeCurrenciesList={activeCurrenciesList}
              setActiveCurrenciesList={setActiveCurrenciesList}
              newCurrencyInput={newCurrencyInput}
              setNewCurrencyInput={setNewCurrencyInput}
              currencyError={currencyError}
              setCurrencyError={setCurrencyError}
              handleAddActiveCurrency={handleAddActiveCurrency}
              handleRemoveActiveCurrency={handleRemoveActiveCurrency}
              stealthMode={stealthMode}
              setStealthMode={setStealthMode}
              budgetStartDay={budgetStartDay}
              setBudgetStartDay={setBudgetStartDay}
              budgetDayOptions={budgetDayOptions}
              onDataChanged={onDataChanged}
            />
          )}

          {/* TAB 3: DATA & PRIVACY */}
          {activeTab === 'privacy' && (
            <SettingsDataTab
              onClose={onClose}
              isPinSet={isPinSet}
              autoLockConfigState={autoLockConfigState}
              setAutoLockConfigState={setAutoLockConfigState}
              saveAutoLockConfig={saveAutoLockConfig}
              setPinModalMode={setPinModalMode}
              setPinInput={setPinInput}
              setPinConfirmInput={setPinConfirmInput}
              setCurrentPinInput={setCurrentPinInput}
              setPinError={setPinError}
              setShowPinModal={setShowPinModal}
              lastExportedDate={lastExportedDate}
              handleOpenExportModal={handleOpenExportModal}
              fileInputRef={fileInputRef}
              handleRestoreFile={handleRestoreFile}
              handleLoadSampleData={handleLoadSampleData}
              handleResetAllData={handleResetAllData}
              isClearingData={isClearingData}
              setLegalOpen={setLegalOpen}
              onDataChanged={onDataChanged}
              onStatusMessage={setStatusMessage}
            />
          )}
        </div>

        {/* Sticky Footer Action Bar */}
        <div className="px-6 py-3.5 border-t border-white/[0.06] bg-[var(--surface-nav)] flex flex-col gap-2.5 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                lockVault();
              }}
              title={t('lock_vault')}
              aria-label={t('lock_vault')}
              className="h-9 px-3 rounded-xl font-medium text-xs transition-all flex items-center gap-1.5 active:scale-95 border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-white shrink-0 cursor-pointer"
            >
              <Lock size={13} className="shrink-0 text-neutral-100" />
              <span>{t('lock_vault')}</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              className="bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--color-accent-hover)] font-semibold rounded-xl px-4 py-2 text-xs transition-all active:scale-95 flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer"
            >
              <Check size={14} />
              <span>{t('save_settings')}</span>
            </button>
          </div>

          <p className="text-center font-mono text-[10px] text-neutral-400">
            © 2026 Vibe Vault. A proud initiative of the{' '}
            <a
              href="https://nettodot.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-300 hover:text-sky-400 transition-colors underline underline-offset-2 decoration-white/20"
            >
              Net to Dot Movement
            </a>
            .
          </p>
        </div>

      </div>

      {/* Step 1 / Full Vault v3 Export Modal with AES-256 Password Protection */}
      {isExportModalOpen && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => !isExportingBackup && setIsExportModalOpen(false)}
        >
          <div 
            className="w-full max-w-sm border border-white/[0.08] rounded-2xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 bg-[#0E1015] backdrop-blur-2xl text-white antialiased"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold tracking-tight text-white">
                {language === 'ko' ? '전체 볼트 암호화 백업 (v3.0)' : 'Full Vault Encrypted Backup (v3.0)'}
              </h3>
              <p className="text-xs text-neutral-200 font-normal mt-0.5">
                {language === 'ko'
                  ? '자산 계좌 · 대출/정산 · 거래 · 다중 장부 · 구독 · 테마 설정 통합 저장'
                  : 'Includes accounts, debts, transactions, ledgers, subscriptions & theme settings'}
              </p>
            </div>

            {exportPreview && (
              <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5 text-center">
                <div>
                  <div className="text-xs font-semibold text-white tabular-nums">{exportPreview.accountCount}</div>
                  <div className="text-[11px] text-neutral-300">{language === 'ko' ? '계좌' : 'Accounts'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-white tabular-nums">{exportPreview.debtCount}</div>
                  <div className="text-[11px] text-neutral-300">{language === 'ko' ? '대출/정산' : 'Debts'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-white tabular-nums">{exportPreview.transactionCount}</div>
                  <div className="text-[11px] text-neutral-300">{language === 'ko' ? '거래' : 'Txns'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-white tabular-nums">{exportPreview.spaceCount}</div>
                  <div className="text-[11px] text-neutral-300">{language === 'ko' ? '장부' : 'Ledgers'}</div>
                </div>
              </div>
            )}

            <div className="p-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-medium text-sky-200 flex items-center gap-1.5">
                  <Lock size={12} className="text-sky-300 shrink-0" />
                  {language === 'ko' ? 'AES-GCM-256 암호화 강제' : 'Mandatory AES-GCM-256 Encryption'}
                </span>
                <span className="text-xs text-neutral-200 font-normal block mt-0.5">
                  {language === 'ko'
                    ? 'PBKDF2 60만 회 + 128-bit MAC 태그로 다른 기기 전송 시에도 안전합니다'
                    : 'PBKDF2 600k rounds + 128-bit MAC tag for safe cross-device transfer'}
                </span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-200 border border-sky-500/25 font-medium shrink-0">
                {language === 'ko' ? 'E2EE' : 'E2EE'}
              </span>
            </div>

            <div className="space-y-1.5 animate-in fade-in duration-150">
              <label className="text-xs font-medium text-neutral-100 block">
                {language === 'ko' ? '암호화 비밀번호 설정 (필수)' : 'Encryption Passphrase (Required)'}
              </label>
              <input
                type="password"
                value={exportPassphrase}
                onChange={(e) => setExportPassphrase(e.target.value)}
                disabled={isExportingBackup}
                placeholder={language === 'ko' ? '복호화 시 사용할 비밀번호 입력' : 'Enter passphrase for decryption'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && exportPassphrase.trim() && !isExportingBackup) {
                    handlePerformExport('download');
                  }
                }}
                className="w-full px-3 py-2 rounded-xl text-xs border outline-none bg-white/[0.03] border-white/[0.08] text-white placeholder:text-neutral-300 focus:border-white/25"
              />
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isExportingBackup}
                  onClick={() => setIsExportModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-neutral-100 hover:text-white hover:bg-white/[0.07] text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {language === 'ko' ? '취소' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={isExportingBackup || !exportPassphrase.trim()}
                  onClick={() => handlePerformExport('download')}
                  className="flex-1 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-100 disabled:bg-white/35 disabled:text-black font-semibold text-xs transition-all active:scale-95 shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Download size={13} />
                  <span>
                    {isExportingBackup
                      ? (language === 'ko' ? '암호화 중...' : 'Encrypting...')
                      : (language === 'ko' ? '파일로 저장' : 'Save File')}
                  </span>
                </button>
              </div>

              {supportsFileShare && (
                <button
                  type="button"
                  disabled={isExportingBackup || !exportPassphrase.trim()}
                  onClick={() => handlePerformExport('share')}
                  className="w-full py-2.5 rounded-xl border border-sky-400/25 bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-40 text-sky-100 font-medium text-xs transition-all active:scale-98 flex items-center justify-center gap-1.5"
                >
                  <Share2 size={13} />
                  <span>
                    {language === 'ko'
                      ? '다른 기기로 바로 공유 (AirDrop · Drive · 메신저)'
                      : 'Share to Another Device (AirDrop · Drive)'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Decrypt Password Prompt Modal */}
      {isDecryptModalOpen && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => !isDecryptingBackup && setIsDecryptModalOpen(false)}
        >
          <div 
            className="w-full max-w-sm border border-white/[0.08] rounded-2xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 bg-[#0E1015] backdrop-blur-2xl text-white antialiased"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold tracking-tight text-white">
                {language === 'ko' ? '암호화된 백업 복호화' : 'Decrypt Encrypted Backup'}
              </h3>
              <p className="text-xs text-neutral-200 font-normal mt-0.5">
                {language === 'ko' ? 'AES-GCM-256 암호화 보호됨' : 'Protected with AES-GCM-256'}
              </p>
            </div>

            <p className="text-xs text-neutral-200 leading-relaxed font-normal">
              {language === 'ko'
                ? '이 백업 파일은 비밀번호로 안전하게 암호화되어 있습니다. 백업 생성 시 설정한 복호화 비밀번호를 입력해주세요.'
                : 'This backup is encrypted with a passphrase. Enter the passphrase you used when creating the backup.'}
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-100 block">
                {language === 'ko' ? '복호화 비밀번호' : 'Decryption Passphrase'}
              </label>
              <input
                type="password"
                value={decryptPassphrase}
                onChange={(e) => setDecryptPassphrase(e.target.value)}
                disabled={isDecryptingBackup}
                placeholder={language === 'ko' ? '비밀번호 입력' : 'Enter passphrase'}
                autoFocus
                className="w-full px-3 py-2 rounded-xl text-xs border outline-none bg-white/[0.03] border-white/[0.08] text-white placeholder:text-neutral-300 focus:border-white/25"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && decryptPassphrase.trim() && !isDecryptingBackup) {
                    handlePerformDecryption();
                  }
                }}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={isDecryptingBackup}
                onClick={() => {
                  setIsDecryptModalOpen(false);
                  setPendingEncryptedData(null);
                }}
                className="flex-1 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-neutral-100 hover:text-white hover:bg-white/[0.07] text-xs font-medium transition-colors disabled:opacity-50"
              >
                {language === 'ko' ? '취소' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!decryptPassphrase.trim() || isDecryptingBackup}
                onClick={handlePerformDecryption}
                className="flex-1 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-100 disabled:bg-white/35 disabled:text-black font-semibold text-xs transition-all active:scale-95 shadow-sm"
              >
                {isDecryptingBackup
                  ? (language === 'ko' ? '복호화 중...' : 'Decrypting...')
                  : (language === 'ko' ? '복호화 및 계속' : 'Decrypt & Continue')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Vault Smart Deduplicated Merge Choice Modal */}
      {isMergeModalOpen && pendingRestorePayload && pendingRestoreSummary && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => !isRestoringBackup && setIsMergeModalOpen(false)}
        >
          <div 
            className="w-full max-w-sm border border-white/[0.08] rounded-2xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 bg-[#0E1015] backdrop-blur-2xl text-white antialiased"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold tracking-tight text-white">
                {language === 'ko' ? '백업 데이터 복원 방식' : 'Choose Restore Mode'}
              </h3>
              <p className="text-xs text-neutral-200 font-normal mt-0.5">
                {language === 'ko'
                  ? `스냅샷 v${pendingRestoreSummary.version} · 복원 대상 항목`
                  : `Snapshot v${pendingRestoreSummary.version} · Contents to restore`}
              </p>
            </div>

            <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5 text-center">
              <div>
                <div className="text-xs font-semibold text-white tabular-nums">{pendingRestoreSummary.accountCount}</div>
                <div className="text-[11px] text-neutral-300">{language === 'ko' ? '계좌' : 'Accounts'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-white tabular-nums">{pendingRestoreSummary.debtCount}</div>
                <div className="text-[11px] text-neutral-300">{language === 'ko' ? '대출/정산' : 'Debts'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-white tabular-nums">{pendingRestoreSummary.transactionCount}</div>
                <div className="text-[11px] text-neutral-300">{language === 'ko' ? '거래' : 'Txns'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-white tabular-nums">{pendingRestoreSummary.spaceCount}</div>
                <div className="text-[11px] text-neutral-300">{language === 'ko' ? '장부' : 'Ledgers'}</div>
              </div>
            </div>

            <p className="text-xs text-neutral-200 leading-relaxed font-normal">
              {language === 'ko'
                ? '이 기기의 기존 볼트 데이터와 가져온 백업 스냅샷을 어떻게 반영할지 선택해주세요.'
                : 'Choose how to combine this backup snapshot with the vault data currently on this device.'}
            </p>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={isRestoringBackup}
                onClick={() => handleExecuteRestore('merge')}
                className="w-full p-3 rounded-xl border border-white/15 bg-white/[0.05] hover:bg-white/[0.09] disabled:opacity-50 text-white text-left transition-all flex flex-col gap-1"
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-white">
                  <CheckCircle2 size={14} />
                  <span>
                    {language === 'ko' ? '스마트 중복 제외 병합 (권장)' : 'Smart Deduplicated Merge (Recommended)'}
                  </span>
                </div>
                <span className="text-xs text-neutral-200 font-normal">
                  {language === 'ko'
                    ? '계좌·대출·장부·거래를 ID와 최신 수정 시각 기준으로 중복 없이 병합합니다.'
                    : 'Merges accounts, debts, ledgers & transactions cleanly by ID and latest timestamp.'}
                </span>
              </button>

              <button
                type="button"
                disabled={isRestoringBackup}
                onClick={() => handleExecuteRestore('overwrite')}
                className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] disabled:opacity-50 text-white text-left transition-all flex flex-col gap-1"
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-300">
                  <AlertTriangle size={14} />
                  <span>{language === 'ko' ? '전체 덮어쓰기' : 'Full Overwrite'}</span>
                </div>
                <span className="text-xs text-neutral-200 font-normal">
                  {language === 'ko'
                    ? '이 기기의 기존 볼트 데이터를 지우고 백업 스냅샷으로 완전히 교체합니다.'
                    : 'Replaces all vault data on this device with the imported backup snapshot.'}
                </span>
              </button>
            </div>

            <button
              type="button"
              disabled={isRestoringBackup}
              onClick={() => {
                setIsMergeModalOpen(false);
                setPendingRestorePayload(null);
                setPendingRestoreSummary(null);
              }}
              className="w-full py-2 rounded-xl text-xs font-medium text-neutral-200 hover:text-white transition-colors disabled:opacity-50"
            >
              {isRestoringBackup
                ? (language === 'ko' ? '복원 반영 중...' : 'Restoring...')
                : (language === 'ko' ? '복원 취소' : 'Cancel Restore')}
            </button>
          </div>
        </div>
      )}

      {/* Vault PIN Setup / Remove Modal */}
      {showPinModal && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setShowPinModal(false)}
        >
          <div 
            className="w-full max-w-xs border border-white/[0.08] rounded-2xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 bg-[#0E1015] backdrop-blur-2xl text-white antialiased"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold tracking-tight text-white">
                {pinModalMode === 'set' ? '금고 보안 PIN 설정' : '금고 보안 PIN 해제'}
              </h3>
              <p className="text-xs text-neutral-200 font-normal mt-0.5">
                {pinModalMode === 'set' ? '4자리 이상의 숫자 또는 비밀번호' : '현재 사용 중인 PIN 번호 확인'}
              </p>
            </div>

            <form onSubmit={handlePinSubmit} className="space-y-3">
              {pinModalMode === 'set' ? (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-100 block">
                      새 PIN 번호 입력
                    </label>
                    <input
                      type="password"
                      maxLength={12}
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="새 PIN 번호 입력"
                      className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono tracking-widest text-center bg-white/[0.03] border-white/[0.08] text-white placeholder:text-neutral-300 focus:border-white/25"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-100 block">
                      PIN 번호 재입력 확인
                    </label>
                    <input
                      type="password"
                      maxLength={12}
                      value={pinConfirmInput}
                      onChange={(e) => setPinConfirmInput(e.target.value)}
                      placeholder="새 PIN 번호 다시 입력"
                      className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono tracking-widest text-center bg-white/[0.03] border-white/[0.08] text-white placeholder:text-neutral-300 focus:border-white/25"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-neutral-100 block">
                    현재 PIN 번호 입력
                  </label>
                  <input
                    type="password"
                    maxLength={12}
                    value={currentPinInput}
                    onChange={(e) => setCurrentPinInput(e.target.value)}
                    placeholder="현재 PIN 번호 입력"
                    className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono tracking-widest text-center bg-white/[0.03] border-white/[0.08] text-white placeholder:text-neutral-300 focus:border-white/25"
                    autoFocus
                  />
                </div>
              )}

              {pinError && (
                <div className="text-xs text-amber-200 font-medium flex items-center gap-1">
                  <AlertTriangle size={12} className="text-amber-300 shrink-0" />
                  <span>{pinError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="flex-1 py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-neutral-100 hover:text-white hover:bg-white/[0.07] text-xs font-medium transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-white text-black hover:bg-neutral-100 font-semibold text-xs transition-all active:scale-95 shadow-sm"
                >
                  {pinModalMode === 'set' ? 'PIN 저장' : 'PIN 해제'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Legal Notice & Terms Modal */}
      <LegalNoticeModal isOpen={legalOpen} onClose={() => setLegalOpen(false)} />
    </div>
  );
};
