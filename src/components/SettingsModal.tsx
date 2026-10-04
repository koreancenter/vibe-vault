import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Cpu, 
  KeyRound, 
  Lock, 
  Sliders, 
  Database, 
  Download, 
  Upload, 
  AlertTriangle, 
  Check, 
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Plus,
  Minus,
  Trash2,
  Wallet,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { 
  getAIEngineConfig, 
  saveAIEngineConfig, 
  AIEngineConfig, 
  getUserPreferences, 
  saveUserPreferences, 
  applyTheme,
  getEffectiveTheme,
  ThemeMode,
  UserPreferences,
  getUserActiveCurrencies,
  saveUserActiveCurrencies,
  KNOWN_CURRENCY_NAMES,
  getCurrencySymbol
} from '../utils';
import {
  sanitizeApiKey,
  maskApiKey,
  isValidGeminiKeyFormat,
  getSecureGeminiApiKey,
  setSecureGeminiApiKey,
  clearSecureGeminiApiKey,
  testGeminiApiKeyOnline
} from '../geminiKeyManager';
import { 
  getAllTransactions, 
  addTransactions, 
  clearAllTransactions, 
  replaceAllTransactions,
  loadSampleData,
  resetAllDataToZero,
  getSpaces,
  deleteSpace,
  DEFAULT_SPACE
} from '../db';
import { PWAInstallButton } from './PWAInstallButton';
import { Transaction, EncryptedBackupPayload, UnencryptedBackupPayloadV2, SupportedCurrency, LedgerSpace } from '../types';
import { SmartAssetSetup } from './SmartAssetSetup';
import {
  encryptBackupData,
  decryptBackupData,
  mergeTransactionsDeduplicated,
  isBinaryEnvelope,
  CryptoBackupError
} from '../cryptoBackup';
import { loadSavedSubscriptions, saveSubscriptions } from '../autonomousFinance';
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

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
  onDataReset?: () => void;
  initialTab?: 'assets' | 'engine' | 'preferences' | 'privacy';
  initialSubTab?: 'assets' | 'budget' | 'subscriptions';
  spaces?: LedgerSpace[];
  activeSpaceId?: string;
  onSelectSpace?: (space: LedgerSpace) => void;
  onDeleteSpace?: (spaceId: string) => void;
  onOpenNewSpace?: () => void;
}

// Custom Dark Dropdown Component (replaces browser native <select> to fix white scrollbars and OS styling)
interface CustomSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (val: string) => void;
  id?: string;
  className?: string;
  theme?: 'dark' | 'light';
  size?: 'sm' | 'md';
  showSublabelInTrigger?: boolean;
}

const CustomDarkSelect: React.FC<CustomSelectProps> = ({ 
  value, 
  options, 
  onChange, 
  id, 
  className = '', 
  theme = 'dark',
  size = 'md',
  showSublabelInTrigger = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const isLight = theme === 'light';
  const isSm = size === 'sm';

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        id={id}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-left rounded-xl text-xs flex items-center justify-between transition-all focus:outline-none active:scale-[0.99] ${
          isSm ? 'px-2.5 py-1.5 rounded-lg' : 'px-3.5 py-2.5 rounded-xl'
        } ${
          isLight
            ? 'bg-white border border-slate-300 hover:border-slate-400 text-slate-900 shadow-xs'
            : 'bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-slate-100'
        }`}
      >
        <span className="truncate font-medium">
          {selectedOption?.label}
          {showSublabelInTrigger && selectedOption?.sublabel && (
            <span className={`text-[11px] ml-2 font-normal ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {selectedOption.sublabel}
            </span>
          )}
        </span>
        <ChevronDown 
          size={isSm ? 12 : 14} 
          className={`transition-transform duration-200 shrink-0 ml-1 ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          } ${isOpen ? 'rotate-180 text-emerald-500' : ''}`} 
        />
      </button>

      {isOpen && (
        <div className={`absolute right-0 min-w-full top-full mt-1 backdrop-blur-md rounded-xl shadow-2xl z-50 overflow-hidden max-h-48 overflow-y-auto py-1 animate-in fade-in zoom-in-95 duration-150 scrollbar-none ${
          isLight
            ? 'bg-white border border-slate-300 text-slate-800'
            : 'bg-slate-900/95 border border-slate-700/80 text-slate-100'
        }`}>
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left text-xs flex items-center justify-between transition-colors ${
                  isSm ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5'
                } ${
                  isSelected 
                    ? isLight
                      ? 'bg-emerald-50 text-emerald-700 font-bold'
                      : 'bg-emerald-500/15 text-emerald-400 font-semibold' 
                    : isLight
                      ? 'text-slate-800 hover:bg-slate-100 hover:text-slate-950'
                      : 'text-slate-200 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="truncate pr-2">
                  <span className="block truncate font-medium">{opt.label}</span>
                  {opt.sublabel && (
                    <span className={`text-[11px] block truncate font-normal ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {opt.sublabel}
                    </span>
                  )}
                </div>
                {isSelected && <Check size={isSm ? 12 : 14} className={isLight ? 'text-emerald-600 shrink-0' : 'text-emerald-400 shrink-0'} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const VALID_SETTINGS_TABS: ('assets' | 'engine' | 'preferences' | 'privacy')[] = ['assets', 'engine', 'preferences', 'privacy'];
const resolveSafeTab = (tab: unknown): 'assets' | 'engine' | 'preferences' | 'privacy' => {
  return typeof tab === 'string' && (VALID_SETTINGS_TABS as string[]).includes(tab)
    ? (tab as 'assets' | 'engine' | 'preferences' | 'privacy')
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
  // Multi-Ledger Spaces State in Settings
  const [internalSpaces, setInternalSpaces] = useState<LedgerSpace[]>(spaces || [DEFAULT_SPACE]);

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
    setStatusMessage({ type: 'success', text: `'${sp.name}' 장부로 전환되었습니다.` });
  };

  const handleDeleteSpaceItem = async (spId: string) => {
    if (spId === 'default') return;
    if (!window.confirm('이 프로젝트 장부와 관련 거래 내역을 삭제하시겠습니까?')) return;
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

  // 4-Tab Segmented Control: [ 스마트 자산 | AI 엔진 | 일반 설정 | 데이터 관리 ]
  const [activeTab, setActiveTab] = useState<'assets' | 'engine' | 'preferences' | 'privacy'>(resolveSafeTab(initialTab));
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
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [autoCategorization, setAutoCategorization] = useState<boolean>(true);
  const [defaultLaunchScreen, setDefaultLaunchScreen] = useState<'vault' | 'insights' | 'ledger'>('vault');
  const [activeCurrenciesList, setActiveCurrenciesList] = useState<string[]>(() => {
    const list = getUserActiveCurrencies();
    return list.length > 0 ? list : ['KRW'];
  });
  const [newCurrencyInput, setNewCurrencyInput] = useState('');
  const [currencyError, setCurrencyError] = useState<string | null>(null);

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

  // Phase 4: AES-GCM-256 Encrypted Backup & Smart Deduplicated Merge
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [enablePasswordProtection, setEnablePasswordProtection] = useState(false);
  const [isDecryptModalOpen, setIsDecryptModalOpen] = useState(false);
  const [decryptPassphrase, setDecryptPassphrase] = useState('');
  const [pendingEncryptedData, setPendingEncryptedData] = useState<any>(null);
  const [pendingRestorePayload, setPendingRestorePayload] = useState<any>(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  
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
      setModelTier(engineCfg.modelTier || (engineCfg.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-3.8-flash'));
      setApiKey(engineCfg.apiKey || getSecureGeminiApiKey() || '');
      setShowKey(false);
      setTestResult({ status: null, message: '' });

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
  }, [isOpen]);

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

  // Provider options
  const providerOptions: CustomSelectOption[] = [
    { value: 'gemini', label: 'Google Gemini' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
  ];

  // Model tier options dynamically mapped
  const getModelTierOptions = (): CustomSelectOption[] => {
    if (provider === 'gemini') {
      return [
        { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', sublabel: '기본 권장, 초고속 멀티모달 인식' },
        { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', sublabel: '초경량 초고속' },
        { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', sublabel: '심층 추론 및 복잡 분석' },
      ];
    }
    if (provider === 'openai') {
      return [
        { value: 'gpt-4o-mini', label: 'GPT-4o-mini', sublabel: '경량 및 신속 처리' },
        { value: 'gpt-4o', label: 'GPT-4o', sublabel: '옴니 플래그십 모델' },
      ];
    }
    return [
      { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', sublabel: '고정밀 분석' },
      { value: 'claude-3-haiku', label: 'Claude 3 Haiku', sublabel: '저지연 초고속' },
    ];
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

  const handleProviderChange = (newProvider: string) => {
    const prov = newProvider as 'gemini' | 'openai' | 'anthropic';
    setProvider(prov);
    setTestResult({ status: null, message: '' });
    if (prov === 'gemini') setModelTier('gemini-3.8-flash');
    else if (prov === 'openai') setModelTier('gpt-4o-mini');
    else setModelTier('claude-3-5-sonnet');
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
          setTestResult({ status: 'valid', message: '🟢 유효한 API 키 확인됨' });
        } else {
          setTestResult({ status: 'invalid', message: '🔴 연결 실패 (키를 다시 확인해 주세요)' });
        }
      }
    } catch {
      setTestResult({ status: 'invalid', message: '🔴 연결 실패 (네트워크를 확인해 주세요)' });
    } finally {
      setIsTestingKey(false);
    }
  };

  // WebLLM Tier 3 Download & Purge Actions
  const handleStartWebLLMDownload = async () => {
    setDownloadError(null);
    setIsDownloadingModel(true);
    setDownloadProgress({
      progress: 0,
      loadedMB: 0,
      totalMB: localModel === 'llama3-8b' ? 4500 : 1520,
      text: '다운로드 준비 중...'
    });

    try {
      await downloadAndInitWebLLM(localModel, (prog) => {
        setDownloadProgress(prog);
      });
      setIsModelDownloaded(true);
      setStatusMessage({ type: 'success', text: '온디바이스 AI 모델 가중치가 안전하게 로컬에 준비되었습니다.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDownloadError(msg);
      setStatusMessage({ type: 'error', text: `다운로드 실패: ${msg}` });
    } finally {
      setIsDownloadingModel(false);
    }
  };

  const handleCancelWebLLMDownload = () => {
    cancelWebLLMDownload();
    setIsDownloadingModel(false);
    setDownloadProgress(null);
    setStatusMessage({ type: 'error', text: '모델 다운로드가 취소되었습니다.' });
  };

  const handlePurgeWebLLMCache = async () => {
    await purgeWebLLMCache();
    setIsModelDownloaded(false);
    setDownloadProgress(null);
    setStatusMessage({ type: 'success', text: '온디바이스 모델 가중치(1.5GB+) 및 캐시가 완전히 삭제되었습니다.' });
  };

  // Save Settings
  const handleSaveAll = () => {
    const cleanKey = sanitizeApiKey(apiKey);
    const engineConfig: AIEngineConfig = {
      engineType,
      localModel,
      provider,
      modelTier,
      apiKey: cleanKey
    };
    saveAIEngineConfig(engineConfig);

    if (provider === 'gemini') {
      if (cleanKey) {
        setSecureGeminiApiKey(cleanKey);
      } else {
        clearSecureGeminiApiKey();
      }
    }

    const userPrefs: UserPreferences = {
      budgetStartDay,
      currencySymbol,
      stealthMode,
      theme: 'dark',
      autoCategorization,
      defaultLaunchScreen
    };
    saveUserPreferences(userPrefs);
    applyTheme('dark');

    if (onDataChanged) onDataChanged();
    setStatusMessage({ type: 'success', text: '모든 설정이 기기에 안전하게 저장되었습니다.' });
    setTimeout(() => {
      onClose();
    }, 300);
  };

  // Phase 4: Export with optional AES-GCM-256 Encryption
  const handleOpenExportModal = () => {
    setExportPassphrase('');
    setEnablePasswordProtection(false);
    setIsExportModalOpen(true);
  };

  const handlePerformExport = async () => {
    try {
      const txs = await getAllTransactions();
      const subs = loadSavedSubscriptions();
      const assetsRaw = localStorage.getItem('vibe_user_assets');
      const assets = assetsRaw ? JSON.parse(assetsRaw) : [];

      const backupPayload: UnencryptedBackupPayloadV2 = {
        version: '2.0',
        format: 'vibe-backup-v2',
        createdAt: new Date().toISOString(),
        transactions: txs,
        preferences: getUserPreferences(),
        subscriptions: subs,
        assets
      };

      let downloadDataStr = '';
      let downloadFilename = `vibe-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;

      if (enablePasswordProtection) {
        if (!exportPassphrase.trim()) {
          setStatusMessage({ type: 'error', text: '암호화할 비밀번호를 입력해주세요.' });
          return;
        }
        const encrypted = await encryptBackupData(backupPayload, exportPassphrase.trim(), {
          appName: 'Vibe Vault Pro'
        });
        downloadDataStr = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(encrypted, null, 2));
        downloadFilename = `vibe-vault-backup-encrypted-${new Date().toISOString().slice(0, 10)}.vibe.enc`;
      } else {
        downloadDataStr = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupPayload, null, 2));
      }

      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", downloadDataStr);
      downloadAnchor.setAttribute("download", downloadFilename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      const nowFormatted = new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
      setLastExportedDate(nowFormatted);
      localStorage.setItem('vibe_last_export_date', nowFormatted);

      setIsExportModalOpen(false);
      setStatusMessage({ 
        type: 'success', 
        text: enablePasswordProtection 
          ? `AES-GCM-256 (PBKDF2 60만 회) 강화 암호화 백업(${txs.length}건)을 안전하게 내보냈습니다.` 
          : `${txs.length}건의 거래 내역을 JSON 파일로 내보냈습니다.` 
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: '내보내기 실패: ' + (err.message || String(err)) });
    }
  };

  // Phase 4 / Hardening: Restore File (handles plain JSON, armored .vibe.enc & binary .enc)
  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      // Check if it starts with the "VVLT_V1" binary magic envelope
      if (isBinaryEnvelope(uint8)) {
        setPendingEncryptedData(uint8);
        setDecryptPassphrase('');
        setIsDecryptModalOpen(true);
        return;
      }

      // Otherwise attempt to decode as UTF-8 JSON text
      const text = new TextDecoder('utf-8').decode(uint8);
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        setStatusMessage({ type: 'error', text: '백업 파일을 읽을 수 없습니다. 올바른 .json 또는 .enc 암호화 파일인지 확인해주세요.' });
        return;
      }

      // Check if file is encrypted (Hardened VVLT_V1 or Legacy v2)
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

      // Plain JSON backup
      prepareRestore(json);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: '백업 파일을 읽는 데 실패했습니다: ' + (err.message || String(err)) });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Decryption execution with typed CryptoBackupError handling
  const handlePerformDecryption = async () => {
    if (!decryptPassphrase.trim() || !pendingEncryptedData) return;
    try {
      const decrypted = await decryptBackupData(pendingEncryptedData, decryptPassphrase.trim());
      setIsDecryptModalOpen(false);
      setPendingEncryptedData(null);
      prepareRestore(decrypted);
    } catch (err: any) {
      let errorText = '복호화에 실패했습니다.';
      if (err instanceof CryptoBackupError) {
        if (err.code === 'INVALID_PASSPHRASE') {
          errorText = '비밀번호가 올바르지 않거나 데이터가 변조되어 인증 태그 검증에 실패했습니다.';
        } else if (err.code === 'CORRUPTED_PAYLOAD') {
          errorText = '백업 파일이 손상되었거나 형식이 유효하지 않습니다.';
        } else if (err.code === 'UNSUPPORTED_VERSION') {
          errorText = '지원되지 않는 백업 파일 버전입니다.';
        } else {
          errorText = err.message;
        }
      } else if (err?.message) {
        errorText = err.message;
      }
      setStatusMessage({ type: 'error', text: errorText });
    }
  };

  // Prepare restore payload and prompt for merge choice
  const prepareRestore = (payload: any) => {
    let importedTxs: Transaction[] = [];
    if (Array.isArray(payload.transactions)) {
      importedTxs = payload.transactions;
    } else if (Array.isArray(payload)) {
      importedTxs = payload;
    }

    if (importedTxs.length === 0) {
      setStatusMessage({ type: 'error', text: '파일에서 유효한 거래 내역을 찾을 수 없습니다.' });
      return;
    }

    setPendingRestorePayload(payload);
    setIsMergeModalOpen(true);
  };

  // Execute restore with selected mode ('merge' vs 'overwrite')
  const handleExecuteRestore = async (mode: 'merge' | 'overwrite') => {
    if (!pendingRestorePayload) return;
    try {
      let importedTxs: Transaction[] = [];
      if (Array.isArray(pendingRestorePayload.transactions)) {
        importedTxs = pendingRestorePayload.transactions;
      } else if (Array.isArray(pendingRestorePayload)) {
        importedTxs = pendingRestorePayload;
      }

      const currentTxs = await getAllTransactions();
      const { finalTransactions, addedCount, updatedCount, skippedCount } = mergeTransactionsDeduplicated(
        currentTxs,
        importedTxs,
        mode
      );

      if (mode === 'overwrite') {
        await replaceAllTransactions(finalTransactions);
      } else {
        await addTransactions(finalTransactions);
      }

      // Restore preferences & assets & subscriptions if present
      if (pendingRestorePayload.preferences) {
        saveUserPreferences(pendingRestorePayload.preferences);
        setBudgetStartDay(pendingRestorePayload.preferences.budgetStartDay ?? 1);
        setCurrencySymbol(pendingRestorePayload.preferences.currencySymbol || 'KRW');
        setStealthMode(!!pendingRestorePayload.preferences.stealthMode);
        if (pendingRestorePayload.preferences.theme) {
          setTheme(pendingRestorePayload.preferences.theme);
          applyTheme(pendingRestorePayload.preferences.theme);
        }
      }

      if (Array.isArray(pendingRestorePayload.subscriptions)) {
        saveSubscriptions(pendingRestorePayload.subscriptions);
      }

      if (Array.isArray(pendingRestorePayload.assets)) {
        localStorage.setItem('vibe_user_assets', JSON.stringify(pendingRestorePayload.assets));
      }

      setIsMergeModalOpen(false);
      setPendingRestorePayload(null);

      const msg = mode === 'merge'
        ? `스마트 병합 완료: 신규 ${addedCount}건 추가, ${updatedCount}건 갱신 (중복 ${skippedCount}건 제외)`
        : `전체 덮어쓰기 완료: ${finalTransactions.length}건 반영`;

      setStatusMessage({ type: 'success', text: msg });
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: '복원 처리 중 오류가 발생했습니다: ' + err.message });
    }
  };

  // Data Utility Action 1: Load Sample Data
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

  // Data Utility Action 2: Consolidated Reset All Data
  const handleResetAllData = async () => {
    if (!window.confirm('모든 데이터(자산, 대출, 거래 내역, 보안 PIN, 설정)를 완전히 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }
    setIsClearingData(true);
    try {
      await resetAllDataToZero();
      await clearAllTransactions().catch(() => {});

      // Clear all related storage
      localStorage.removeItem('vibe_engine_config');
      localStorage.removeItem('vibe_user_preferences');
      localStorage.removeItem('vibe_user_assets');
      localStorage.removeItem('vibe_last_export_date');
      localStorage.removeItem('vibe_saved_subscriptions');

      // Reset local states in modal
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

      // Evict all service worker CacheStorage buckets upon full database reset
      await evictAllServiceWorkerCaches().catch(() => false);

      setStatusMessage({ type: 'success', text: '전체 데이터와 설정이 성공적으로 초기화되었습니다.' });
      if (onDataReset) onDataReset();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: '데이터 초기화 오류: ' + (err?.message || err) });
    } finally {
      setIsClearingData(false);
    }
  };

  if (!isOpen) return null;

  const isLight = false;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-[#0B0C0E]/95 backdrop-blur-2xl border border-white/[0.08] shadow-2xl rounded-2xl max-w-lg w-full max-md:rounded-b-none max-md:fixed max-md:bottom-0 max-md:max-h-[90vh] text-neutral-100 flex flex-col h-[84dvh] sm:h-[640px] overflow-hidden animate-in slide-in-from-bottom-6 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle indicator */}
        <div className="w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 bg-white/20" />

        {/* Top Header */}
        <div className="flex justify-between items-center px-5 sm:px-6 py-3.5 border-b border-white/[0.06] bg-transparent shrink-0">
          <h2 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-neutral-300" />
            <span>환경 설정</span>
          </h2>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
            aria-label="설정 창 닫기"
          >
            <X size={17} />
          </button>
        </div>

        {/* Tab Bar: Minimal text tabs with a subtle sage line */}
        <div className="flex sm:grid sm:grid-cols-4 border-b border-white/[0.06] shrink-0 px-4 sm:px-6 overflow-x-auto no-scrollbar scrollbar-none pt-2.5 gap-2 sm:gap-0">
          <button
            id="tab-assets"
            onClick={() => setActiveTab('assets')}
            className={`text-xs text-center transition-colors relative whitespace-nowrap shrink-0 flex-1 pb-2 ${
              activeTab === 'assets'
                ? 'border-b border-emerald-400 text-white font-medium'
                : 'text-neutral-400 hover:text-white font-normal border-b border-transparent'
            }`}
          >
            자산 관리
          </button>

          <button
            id="tab-ai-engine"
            onClick={() => setActiveTab('engine')}
            className={`text-xs text-center transition-colors relative whitespace-nowrap shrink-0 flex-1 pb-2 ${
              activeTab === 'engine'
                ? 'border-b border-emerald-400 text-white font-medium'
                : 'text-neutral-400 hover:text-white font-normal border-b border-transparent'
            }`}
          >
            AI 엔진
          </button>

          <button
            id="tab-prefs"
            onClick={() => setActiveTab('preferences')}
            className={`text-xs text-center transition-colors relative whitespace-nowrap shrink-0 flex-1 pb-2 ${
              activeTab === 'preferences'
                ? 'border-b border-emerald-400 text-white font-medium'
                : 'text-neutral-400 hover:text-white font-normal border-b border-transparent'
            }`}
          >
            일반 설정
          </button>

          <button
            id="tab-data"
            onClick={() => setActiveTab('privacy')}
            className={`text-xs text-center transition-colors relative whitespace-nowrap shrink-0 flex-1 pb-2 ${
              activeTab === 'privacy'
                ? 'border-b border-emerald-400 text-white font-medium'
                : 'text-neutral-400 hover:text-white font-normal border-b border-transparent'
            }`}
          >
            데이터 관리
          </button>
        </div>

        {/* Status Toast inside Modal */}
        {statusMessage && (
          <div className={`mx-6 mt-2 px-3.5 py-2 rounded-xl text-xs flex items-center justify-between shrink-0 ${
            statusMessage.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/25 text-rose-400'
          }`}>
            <span className="truncate">{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)} className="ml-1 text-sm font-bold">×</button>
          </div>
        )}

        {/* Tab Body */}
        <div className="flex-1 px-5 py-4 overflow-y-auto text-sm flex flex-col justify-between scrollbar-none">
          
          {/* TAB 0: SMART ASSET SETUP */}
          {activeTab === 'assets' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <SmartAssetSetup 
                theme={theme}
                currentCurrency={(currencySymbol as SupportedCurrency) || 'KRW'}
                initialSubTab={subTab}
                onAssetsUpdated={() => {
                  if (onDataChanged) onDataChanged();
                }} 
              />
            </div>
          )}

          {/* TAB 1: AI ENGINE CONFIGURATION */}
          {activeTab === 'engine' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Clean Engine Toggle */}
              <div className="p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] grid grid-cols-2 gap-1 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setEngineType('byok');
                    setProvider('gemini');
                  }}
                  className={`py-2 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 active:scale-[0.99] ${
                    engineType === 'byok'
                      ? 'bg-white/10 text-white shadow-xs font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <KeyRound size={13} className={engineType === 'byok' ? 'text-emerald-400' : ''} />
                  <span className="truncate">클라우드 AI (Gemini, 권장)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEngineType('local')}
                  className={`py-2 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 active:scale-[0.99] ${
                    engineType === 'local'
                      ? 'bg-white/10 text-white shadow-xs font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Cpu size={13} className={engineType === 'local' ? 'text-amber-400' : ''} />
                  <span className="truncate">온디바이스 로컬 AI (오프라인)</span>
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
                      className="text-[11px] font-normal text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
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
                        className="w-full rounded-xl pl-3 pr-8 py-2 text-xs outline-none font-mono transition-colors border bg-white/[0.03] border-white/10 text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500/50"
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
                      theme={theme}
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
                          className="h-full bg-emerald-400 transition-all duration-200"
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

                  {/* Action Button: Download / Cancel / Purge - Luxury Ghost Button */}
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

                  {/* Condensed Warning Caption below Download Button */}
                  <p className="text-[10px] leading-relaxed text-neutral-500 font-light">
                    ⚠️ 모바일 브라우저 환경에서는 대용량 가중치 다운로드 시 메모리 부족(OOM)이나 급격한 배터리 소모가 발생할 수 있습니다.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GENERAL SETTINGS (일반 설정) - Pure Dark Luxury Minimalist Layout */}
          {activeTab === 'preferences' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              
              {/* PWA 설치 안내 카드 (미설치 상태인 경우) */}
              <PWAInstallButton variant="settings" theme="dark" />

              {/* Group 1: 화면 설정 (기본 시작 화면) */}
              <div className="space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider block text-slate-500">
                  화면 설정
                </span>
                
                <div className="space-y-3 pb-4 border-b border-white/[0.06]">
                  {/* Row 1: 기본 시작 화면 (자산 | 인사이트 | 장부) */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-slate-200">
                      기본 시작 화면
                    </span>
                    <div className="flex p-0.5 rounded-xl border bg-black/40 border-white/5">
                      <button
                        type="button"
                        id="launch-screen-vault-btn"
                        onClick={() => {
                          setDefaultLaunchScreen('vault');
                          const prefs = getUserPreferences();
                          saveUserPreferences({ ...prefs, defaultLaunchScreen: 'vault' });
                          if (onDataChanged) onDataChanged();
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                          defaultLaunchScreen === 'vault'
                            ? 'bg-white/15 text-white shadow-xs font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        자산
                      </button>
                      <button
                        type="button"
                        id="launch-screen-insights-btn"
                        onClick={() => {
                          setDefaultLaunchScreen('insights');
                          const prefs = getUserPreferences();
                          saveUserPreferences({ ...prefs, defaultLaunchScreen: 'insights' });
                          if (onDataChanged) onDataChanged();
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                          defaultLaunchScreen === 'insights'
                            ? 'bg-white/15 text-white shadow-xs font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        인사이트
                      </button>
                      <button
                        type="button"
                        id="launch-screen-ledger-btn"
                        onClick={() => {
                          setDefaultLaunchScreen('ledger');
                          const prefs = getUserPreferences();
                          saveUserPreferences({ ...prefs, defaultLaunchScreen: 'ledger' });
                          if (onDataChanged) onDataChanged();
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                          defaultLaunchScreen === 'ledger'
                            ? 'bg-white/15 text-white shadow-xs font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        장부
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Group 2: 표시 및 통화 (Display & Currency) */}
              <div className="space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider block text-slate-500">
                  표시 및 통화
                </span>
                
                <div className="space-y-3 pb-4 border-b border-white/[0.06]">
                  {/* Row 1: 기본 통화 & 내 활성 통화 매니저 */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-semibold text-slate-200 block">
                          기본 기준 통화
                        </span>
                        <span className="text-[10px] text-slate-400">
                          대시보드 및 모든 자산 평가의 기준
                        </span>
                      </div>
                      <div className="w-36">
                        <CustomDarkSelect
                          id="currency-select"
                          value={currencySymbol}
                          options={currencyOptions}
                          onChange={(val) => {
                            setCurrencySymbol(val);
                            const prefs = getUserPreferences();
                            saveUserPreferences({ ...prefs, currencySymbol: val });
                            if (!activeCurrenciesList.includes(val)) {
                              const updated = [val, ...activeCurrenciesList];
                              setActiveCurrenciesList(updated);
                              saveUserActiveCurrencies(updated);
                            }
                            if (onDataChanged) onDataChanged();
                          }}
                          theme="dark"
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Active Currencies */}
                    <div className="pt-3 border-t border-white/[0.04] space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-200">
                            나의 활성 통화 (Active Currencies)
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            ({activeCurrenciesList.length})
                          </span>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          activeCurrenciesList.length > 1
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                            : 'bg-white/[0.04] text-neutral-400 border border-white/5'
                        }`}>
                          {activeCurrenciesList.length > 1 ? '다중 통화 모드' : '단일 통화 모드'}
                        </span>
                      </div>

                      {/* Active Currencies Chips with Delete / Select */}
                      <div className="flex flex-wrap gap-2">
                        {activeCurrenciesList.map((code) => {
                          const isBase = code === currencySymbol;
                          const info = KNOWN_CURRENCY_NAMES[code];
                          const sym = getCurrencySymbol(code);
                          return (
                            <div
                              key={code}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs transition-all ${
                                isBase
                                  ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 font-semibold'
                                  : 'bg-white/[0.04] border-white/5 text-slate-300 hover:border-white/10'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setCurrencySymbol(code);
                                  const prefs = getUserPreferences();
                                  saveUserPreferences({ ...prefs, currencySymbol: code });
                                  if (onDataChanged) onDataChanged();
                                }}
                                className="flex items-center gap-1 hover:text-white"
                                title={isBase ? '현재 기준 통화' : '클릭하여 기본 기준 통화로 설정'}
                              >
                                <span className="font-mono font-bold">{code}</span>
                                <span className="text-[11px] opacity-80">({sym})</span>
                                {info && (
                                  <span className="text-[10px] text-slate-400 hidden sm:inline ml-0.5">
                                    {info.nameKo}
                                  </span>
                                )}
                                {isBase && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-400/20 text-emerald-300 font-normal ml-0.5">
                                    기준
                                  </span>
                                )}
                              </button>

                              {/* Remove button (disabled for base currency or when only 1 remains) */}
                              {!isBase && activeCurrenciesList.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveActiveCurrency(code)}
                                  className="text-slate-400 hover:text-rose-400 transition-colors p-0.5 ml-0.5 rounded"
                                  title={`${code} 활성 통화에서 제거`}
                                  aria-label={`${code} 활성 통화에서 제거`}
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Subtle Prompt when only 1 currency is present */}
                      {activeCurrenciesList.length <= 1 && (
                        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15 text-[11px] text-slate-300 animate-in fade-in duration-150">
                          <Sparkles size={13} className="text-emerald-400 shrink-0" />
                          <span>새 통화를 추가하면 다중 통화 비교 모드가 자동으로 활성화됩니다.</span>
                        </div>
                      )}

                      {/* Quick Add Presets + Custom Inline Input */}
                      <div className="pt-2 border-t border-white/[0.04] space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>추천 통화 빠른 추가:</span>
                          <div className="flex items-center gap-1">
                            {['USD', 'IDR', 'JPY', 'EUR'].filter(c => !activeCurrenciesList.includes(c)).map(preset => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => handleAddActiveCurrency(preset)}
                                className="px-2 py-0.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[10px] font-mono text-slate-300 border border-white/5 active:scale-95 transition-all"
                              >
                                +{preset}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={newCurrencyInput}
                            onChange={(e) => {
                              setNewCurrencyInput(e.target.value.toUpperCase());
                              if (currencyError) setCurrencyError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddActiveCurrency(newCurrencyInput);
                              }
                            }}
                            maxLength={3}
                            placeholder="3자리 통화 코드 (예: SGD, VND, AUD)..."
                            className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-hidden focus:border-emerald-400/50 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddActiveCurrency(newCurrencyInput)}
                            disabled={!newCurrencyInput.trim()}
                            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 active:scale-95 text-xs font-medium transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1"
                          >
                            <Plus size={12} strokeWidth={2.5} />
                            <span>추가</span>
                          </button>
                        </div>

                        {currencyError && (
                          <p className="text-[11px] text-rose-400 flex items-center gap-1 pt-0.5">
                            <span>⚠️ {currencyError}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: 스텔스 모드 (금액 숨김) */}
                  <div
                    onClick={() => {
                      const next = !stealthMode;
                      setStealthMode(next);
                      const prefs = getUserPreferences();
                      saveUserPreferences({ ...prefs, stealthMode: next });
                      if (onDataChanged) onDataChanged();
                    }}
                    className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.04] cursor-pointer select-none group"
                  >
                    <div className="flex items-center gap-2">
                      {stealthMode ? (
                        <EyeOff size={15} className="text-emerald-400 shrink-0" />
                      ) : (
                        <Eye size={15} className="text-neutral-400 group-hover:text-white transition-colors shrink-0" />
                      )}
                      <div>
                        <span className="text-xs font-semibold group-hover:text-emerald-400 transition-colors text-slate-200 block">
                          스텔스 모드 (금액 숨김)
                        </span>
                        <span className="text-[11px] text-neutral-500 font-light block">
                          {stealthMode ? '모든 잔고 및 금액이 마스킹되어 보호 중입니다' : '화면에 모든 금액이 표시됩니다'}
                        </span>
                      </div>
                    </div>
                    <button
                      id="toggle-stealth-mode"
                      type="button"
                      aria-label="스텔스 모드 토글"
                      className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 shrink-0 pointer-events-none ${
                        stealthMode ? 'bg-emerald-400' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                          stealthMode ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Group 3: 장부 설정 (Ledger Settings) */}
              <div className="space-y-3 pt-3 border-t border-white/[0.04]">
                <span className="text-[11px] font-bold uppercase tracking-wider block text-neutral-400">
                  장부 설정
                </span>
                
                <div className="space-y-3">
                  {/* Row 1: 예산 시작일 */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-slate-200">
                      예산 시작일
                    </span>
                    <div className="w-24">
                      <CustomDarkSelect
                        id="budget-start-day-select"
                        value={String(budgetStartDay)}
                        options={budgetDayOptions}
                        onChange={(val) => {
                          const num = parseInt(val, 10) || 1;
                          setBudgetStartDay(num);
                          const prefs = getUserPreferences();
                          saveUserPreferences({ ...prefs, budgetStartDay: num });
                          if (onDataChanged) onDataChanged();
                        }}
                        theme="dark"
                        size="sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Group 4: 장부 관리 (Ledger Spaces) */}
              <div className="space-y-3 pt-3 border-t border-white/[0.04]">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-white block">
                      장부 관리 (Ledger Spaces)
                    </span>
                    <span className="text-[11px] text-neutral-400 font-light block">
                      일상 가계부와 분리된 프로젝트·행사 전용 정산 장부
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateNewSpace}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-normal bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.08] transition-all active:scale-95 shrink-0"
                  >
                    <Plus size={12} />
                    <span>새 장부 만들기</span>
                  </button>
                </div>

                {/* Spaces List */}
                <div className="space-y-1.5 pt-1">
                  {internalSpaces.map((sp) => {
                    const isCurrent = sp.id === (activeSpaceId || 'default');
                    const isDefault = sp.id === 'default';
                    const isEvent = sp.type === 'EVENT' || Boolean(sp.memberCount && sp.memberCount > 1);

                    return (
                      <div
                        key={sp.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                          isCurrent
                            ? 'bg-emerald-500/10 border-emerald-500/25 text-white'
                            : 'bg-white/[0.02] border-white/[0.06] text-neutral-300 hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="truncate">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-xs text-white truncate">{sp.name}</span>
                              {isDefault && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-neutral-400 font-normal border border-white/[0.08]">
                                  기본
                                </span>
                              )}
                              {isEvent && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-normal border border-indigo-500/25">
                                  행사/정산
                                </span>
                              )}
                              {isCurrent && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-normal border border-emerald-500/25 flex items-center gap-1">
                                  <Check size={10} />
                                  <span>현재 활성</span>
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-neutral-400 font-light mt-0.5 flex items-center gap-2">
                              <span>기준 통화: {sp.currency}</span>
                              {sp.memberCount && <span>· 정산 인원: {sp.memberCount}명</span>}
                              {sp.description && <span className="truncate">· {sp.description}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => handleSelectSpaceItem(sp)}
                              className="px-2.5 py-1 rounded-full text-[11px] font-normal border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-neutral-300 hover:text-white transition-all active:scale-95"
                            >
                              전환
                            </button>
                          )}
                          {!isDefault && (
                            <button
                              type="button"
                              onClick={() => handleDeleteSpaceItem(sp.id)}
                              className="p-1.5 rounded-full hover:bg-rose-500/15 text-neutral-400 hover:text-rose-400 border border-transparent hover:border-rose-500/20 transition-all"
                              title="장부 삭제"
                              aria-label={`${sp.name} 장부 삭제`}
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

            </div>
          )}

          {/* TAB 3: DATA & PRIVACY (LOCAL-FIRST) */}
          {activeTab === 'privacy' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Group 1: 금고 보안 & 자동 잠금 */}
              <div className="space-y-3.5 border-b border-white/[0.06] pb-5 mb-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-white">
                    <Lock size={13} className="text-neutral-400" />
                    <span>금고 보안 & 자동 잠금</span>
                  </div>
                  {isPinSet && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        lockVault();
                      }}
                      className="text-[11px] px-2.5 py-1 rounded-full font-normal bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 text-neutral-300 transition-colors"
                    >
                      지금 잠그기
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {/* PIN 설정 상태 & 버튼 */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-400 font-light">보안 PIN</span>
                      {isPinSet ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          설정됨
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-normal bg-white/[0.04] text-neutral-400 border border-white/[0.06]">
                          미설정
                        </span>
                      )}
                    </div>

                    {isPinSet ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPinModalMode('set');
                            setPinInput('');
                            setPinConfirmInput('');
                            setPinError(null);
                            setShowPinModal(true);
                          }}
                          className="bg-white/[0.05] hover:bg-white/[0.09] text-neutral-200 border border-white/10 rounded-lg px-3 py-1 text-xs font-normal transition-all active:scale-95"
                        >
                          PIN 변경
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPinModalMode('remove');
                            setCurrentPinInput('');
                            setPinError(null);
                            setShowPinModal(true);
                          }}
                          className="bg-white/[0.05] hover:bg-rose-500/15 text-neutral-300 hover:text-rose-400 border border-white/10 rounded-lg px-3 py-1 text-xs font-normal transition-all active:scale-95"
                        >
                          PIN 해제
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setPinModalMode('set');
                          setPinInput('');
                          setPinConfirmInput('');
                          setPinError(null);
                          setShowPinModal(true);
                        }}
                        className="bg-white/[0.05] hover:bg-white/[0.09] text-neutral-200 border border-white/10 rounded-lg px-3 py-1 text-xs font-normal transition-all active:scale-95"
                      >
                        PIN 설정
                      </button>
                    )}
                  </div>

                  {/* 자동 잠금 드롭다운 */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.04]">
                    <span className="text-xs text-neutral-400 font-light">자동 잠금</span>
                    <div className="w-28">
                      <CustomDarkSelect
                        value={!autoLockConfigState.enabled ? 'disabled' : String(autoLockConfigState.timeoutMinutes)}
                        options={[
                          { value: '0', label: '즉시' },
                          { value: '5', label: '5분' },
                          { value: '15', label: '15분' },
                          { value: '30', label: '30분' },
                          { value: '60', label: '1시간' },
                          { value: 'disabled', label: '비활성화' },
                        ]}
                        onChange={(val) => {
                          const isDisabled = val === 'disabled';
                          const mins = isDisabled ? 0 : parseInt(val, 10);
                          const updated = { 
                            ...autoLockConfigState, 
                            timeoutMinutes: mins, 
                            enabled: !isDisabled,
                            lockOnVisibilityHidden: !isDisabled && mins === 0
                          };
                          setAutoLockConfigState(updated);
                          saveAutoLockConfig(updated);
                        }}
                        theme="dark"
                        size="sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Group 2: 데이터 백업 및 복원 */}
              <div className="space-y-3.5 border-b border-white/[0.06] pb-5 mb-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-white">
                    <Database size={13} className="text-neutral-400" />
                    <span>데이터 백업 및 복원</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-light">
                    마지막 백업: <span className="font-normal text-neutral-300">{lastExportedDate}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleOpenExportModal}
                    className="py-2.5 px-3 rounded-xl text-xs font-normal bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 text-neutral-200 hover:text-white flex items-center justify-center gap-2 transition-all active:scale-98"
                  >
                    <Download size={13} className="shrink-0 text-neutral-400" />
                    <span>백업 파일 내보내기</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-2.5 px-3 rounded-xl text-xs font-normal bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 text-neutral-200 hover:text-white flex items-center justify-center gap-2 transition-all active:scale-98"
                  >
                    <Upload size={13} className="shrink-0 text-neutral-400" />
                    <span>백업 파일 가져오기/복원</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.enc,.vibe.enc"
                    className="hidden"
                    onChange={handleRestoreFile}
                  />
                </div>
              </div>

              {/* Group 3: 데이터 유틸리티 */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-white">
                  <AlertTriangle size={13} className="text-amber-400/80 shrink-0" />
                  <span>데이터 유틸리티</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    id="load-sample-data-btn"
                    onClick={handleLoadSampleData}
                    disabled={isClearingData}
                    className="py-2.5 px-3 rounded-xl text-xs font-normal flex items-center justify-center gap-1.5 transition-all active:scale-98 disabled:opacity-50 bg-white/[0.05] hover:bg-white/[0.09] text-neutral-200 hover:text-white border border-white/10"
                  >
                    <Sparkles size={13} className="text-neutral-400 shrink-0" />
                    <span>✦ 샘플 데이터 불러오기</span>
                  </button>

                  <button
                    type="button"
                    id="reset-all-data-btn"
                    onClick={handleResetAllData}
                    disabled={isClearingData}
                    className="py-2.5 px-3 rounded-xl text-xs font-normal flex items-center justify-center gap-1.5 transition-all active:scale-98 disabled:opacity-50 bg-rose-500/10 hover:bg-rose-500/15 text-rose-400 border border-rose-500/20"
                  >
                    <Trash2 size={13} className="text-rose-400 shrink-0" />
                    <span>전체 데이터 초기화</span>
                  </button>
                </div>

                <p className="text-[10px] leading-relaxed text-neutral-500 font-light">
                  ⚠️ 전체 데이터 초기화 시 기기에 암호화되어 저장된 모든 자산, 거래 내역, PIN이 영구 삭제됩니다.
                </p>
              </div>
            </div>
          )}

          {/* Bottom Action Bar (Apply & Save + Session Logout) */}
          <div className="pt-3.5 border-t border-white/[0.06] mt-auto shrink-0 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                lockVault();
              }}
              title="금고 잠그기 (로그아웃)"
              className="h-10 px-3.5 rounded-xl font-normal text-xs transition-all flex items-center gap-1.5 active:scale-95 border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white"
            >
              <Lock size={13} className="shrink-0 text-neutral-400" />
              <span>금고 잠그기</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              className="bg-white text-black hover:bg-neutral-200 font-medium rounded-xl px-5 py-2 text-sm transition-all active:scale-95 flex items-center gap-1.5"
            >
              <Check size={14} />
              <span>설정 저장</span>
            </button>
          </div>
        </div>

      </div>

      {/* Phase 4: Export Modal with AES-256 Password Protection */}
      {isExportModalOpen && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setIsExportModalOpen(false)}
        >
          <div 
            className="w-full max-w-sm border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 bg-[#0B0C0E]/95 backdrop-blur-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-white/[0.05] text-emerald-400 border border-white/10">
                <Download size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">데이터 백업 내보내기 (v2.0)</h3>
                <p className="text-[11px] text-neutral-400">거래, 구독, 자산 설정 통합 저장</p>
              </div>
            </div>

            {/* Password Protection Toggle */}
            <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02] flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-white flex items-center gap-1.5">
                  <Lock size={12} className="text-neutral-400" />
                  AES-256 비밀번호 암호화
                </span>
                <span className="text-[10px] text-neutral-400 block mt-0.5">
                  비밀번호 없이는 타인이 열람할 수 없도록 암호화합니다
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEnablePasswordProtection(!enablePasswordProtection)}
                className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 shrink-0 ${
                  enablePasswordProtection ? 'bg-emerald-400' : 'bg-white/10'
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform transform ${
                  enablePasswordProtection ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {enablePasswordProtection && (
              <div className="space-y-1.5 animate-in fade-in duration-150">
                <label className="text-[11px] font-medium text-neutral-400 block">
                  암호화 비밀번호 설정
                </label>
                <input
                  type="password"
                  value={exportPassphrase}
                  onChange={(e) => setExportPassphrase(e.target.value)}
                  placeholder="8자 이상의 안전한 비밀번호 입력"
                  className="w-full px-3 py-2 rounded-xl text-xs border outline-none bg-white/[0.03] border-white/10 text-white placeholder:text-neutral-600 focus:border-emerald-500/50"
                />
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-neutral-300 hover:text-white hover:bg-white/[0.06] text-xs font-normal transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handlePerformExport}
                className="flex-1 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-200 font-medium text-xs transition-all active:scale-95 shadow-sm"
              >
                내보내기 실행
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 4: Decrypt Password Prompt Modal */}
      {isDecryptModalOpen && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setIsDecryptModalOpen(false)}
        >
          <div 
            className="w-full max-w-sm border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 bg-[#0B0C0E]/95 backdrop-blur-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20">
                <Lock size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">암호화된 백업 복호화</h3>
                <p className="text-[11px] text-neutral-400">AES-GCM 256 암호화 보호됨</p>
              </div>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed font-light">
              이 백업 파일은 비밀번호로 안전하게 암호화되어 있습니다. 백업 생성 시 설정한 복호화 비밀번호를 입력해주세요.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-neutral-400 block">
                복호화 비밀번호
              </label>
              <input
                type="password"
                value={decryptPassphrase}
                onChange={(e) => setDecryptPassphrase(e.target.value)}
                placeholder="비밀번호 입력"
                autoFocus
                className="w-full px-3 py-2 rounded-xl text-xs border outline-none bg-white/[0.03] border-white/10 text-white placeholder:text-neutral-600 focus:border-emerald-500/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePerformDecryption();
                }}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsDecryptModalOpen(false);
                  setPendingEncryptedData(null);
                }}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-neutral-300 hover:text-white hover:bg-white/[0.06] text-xs font-normal transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                disabled={!decryptPassphrase.trim()}
                onClick={handlePerformDecryption}
                className="flex-1 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-200 disabled:opacity-40 font-medium text-xs transition-all active:scale-95 shadow-sm"
              >
                복호화 및 계속
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 4: Smart Deduplicated Merge Choice Modal */}
      {isMergeModalOpen && pendingRestorePayload && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setIsMergeModalOpen(false)}
        >
          <div 
            className="w-full max-w-sm border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 bg-[#0B0C0E]/95 backdrop-blur-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-white/[0.05] text-neutral-300 border border-white/10">
                <Database size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">백업 데이터 복원 방식</h3>
                <p className="text-[11px] text-neutral-400">
                  가져올 거래: {pendingRestorePayload.transactions?.length || 0}건
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed font-light">
              기존에 기록된 거래 내역과 백업 파일을 어떻게 합칠지 선택해주세요.
            </p>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => handleExecuteRestore('merge')}
                className="w-full p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 text-white text-left transition-all flex flex-col gap-1"
              >
                <div className="flex items-center gap-1.5 font-medium text-xs text-emerald-400">
                  <CheckCircle2 size={14} />
                  <span>스마트 중복제거 병합 (권장)</span>
                </div>
                <span className="text-[11px] text-neutral-400 font-light">
                  기존 데이터를 안전하게 유지하며, 중복 없는 신규 거래만 덧붙입니다.
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleExecuteRestore('overwrite')}
                className="w-full p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-white text-left transition-all flex flex-col gap-1"
              >
                <div className="flex items-center gap-1.5 font-medium text-xs text-amber-400">
                  <AlertTriangle size={14} />
                  <span>전체 덮어쓰기 (Overwrite)</span>
                </div>
                <span className="text-[11px] text-neutral-400 font-light">
                  기존 가계부 내역을 모두 지우고 백업 데이터로 완전히 교체합니다.
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsMergeModalOpen(false);
                setPendingRestorePayload(null);
              }}
              className="w-full py-2 rounded-xl text-xs font-normal text-neutral-400 hover:text-white transition-colors"
            >
              복원 취소
            </button>
          </div>
        </div>
      )}

      {/* Vault PIN Setup / Remove Modal */}
      {showPinModal && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setShowPinModal(false)}
        >
          <div 
            className="w-full max-w-xs border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 bg-[#0B0C0E]/95 backdrop-blur-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-white/[0.05] text-neutral-200 border border-white/10">
                <KeyRound size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {pinModalMode === 'set' ? '금고 보안 PIN 설정' : '금고 보안 PIN 해제'}
                </h3>
                <p className="text-[11px] text-neutral-400 font-light">
                  {pinModalMode === 'set' ? '4자리 이상의 숫자 또는 비밀번호' : '현재 사용 중인 PIN 번호 확인'}
                </p>
              </div>
            </div>

            <form onSubmit={handlePinSubmit} className="space-y-3">
              {pinModalMode === 'set' ? (
                <>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-neutral-400 block">
                      새 PIN 번호 입력
                    </label>
                    <input
                      type="password"
                      maxLength={12}
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="새 PIN 번호 입력"
                      className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono tracking-widest text-center bg-white/[0.03] border-white/10 text-white focus:border-emerald-500/50"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-neutral-400 block">
                      PIN 번호 재입력 확인
                    </label>
                    <input
                      type="password"
                      maxLength={12}
                      value={pinConfirmInput}
                      onChange={(e) => setPinConfirmInput(e.target.value)}
                      placeholder="새 PIN 번호 다시 입력"
                      className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono tracking-widest text-center bg-white/[0.03] border-white/10 text-white focus:border-emerald-500/50"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-neutral-400 block">
                    현재 PIN 번호 입력
                  </label>
                  <input
                    type="password"
                    maxLength={12}
                    value={currentPinInput}
                    onChange={(e) => setCurrentPinInput(e.target.value)}
                    placeholder="현재 PIN 번호 입력"
                    className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono tracking-widest text-center bg-white/[0.03] border-white/10 text-white focus:border-emerald-500/50"
                    autoFocus
                  />
                </div>
              )}

              {pinError && (
                <div className="text-[11px] text-rose-400 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  <span>{pinError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="flex-1 py-2 rounded-xl border border-white/10 text-neutral-300 hover:text-white hover:bg-white/[0.06] text-xs font-normal transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 font-medium text-xs transition-all active:scale-95 shadow-sm"
                >
                  {pinModalMode === 'set' ? 'PIN 저장' : 'PIN 해제'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
