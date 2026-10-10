import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  Lock, 
  Check, 
  CheckCircle2, 
  AlertTriangle
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
  getAllTransactions, 
  addTransactions, 
  clearAllTransactions, 
  replaceAllTransactions,
  loadSampleData,
  resetAllDataToZero,
  getSpaces,
  createSpace,
  deleteSpace,
  DEFAULT_SPACE
} from '../db';
import { Transaction, UnencryptedBackupPayloadV2, SupportedCurrency, LedgerSpace } from '../types';
import { SmartAssetSetup } from './SmartAssetSetup';
import {
  exportEncryptedBackup,
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
import { LegalNoticeModal } from './LegalNoticeModal';
import { CustomSelectOption } from './settings/CustomDarkSelect';
import { SettingsAITab } from './settings/SettingsAITab';
import { SettingsPreferencesTab } from './settings/SettingsPreferencesTab';
import { SettingsDataTab } from './settings/SettingsDataTab';

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

  const handleCreateSpaceInline = async () => {
    const trimmed = newSpaceNameInput.trim();
    if (!trimmed) return;
    const newSp: LedgerSpace = {
      id: `space-${Date.now()}`,
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

  // Phase 4: AES-GCM-256 Encrypted Backup & Smart Deduplicated Merge
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
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
  const handleSaveAll = () => {
    try {
      const cleanKey = sanitizeApiKey(apiKey);
      saveAIEngineConfig({
        engineType,
        provider,
        modelTier,
        localModel,
        apiKey: cleanKey,
      });

      if (cleanKey) {
        setSecureGeminiApiKey(cleanKey);
      } else {
        clearSecureGeminiApiKey();
      }

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
      applyTheme('dark');

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

  // Open Export Modal
  const handleOpenExportModal = () => {
    setExportPassphrase('');
    setIsExportModalOpen(true);
  };

  // Perform Encrypted Export
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

      if (!exportPassphrase.trim()) {
        setStatusMessage({ type: 'error', text: '금융 데이터 평문 유출 방지를 위해 AES-GCM 암호화 비밀번호를 입력해주세요.' });
        return;
      }

      const { filename, dataUrl } = await exportEncryptedBackup(backupPayload, exportPassphrase.trim(), {
        appName: 'Vibe Vault Pro'
      });

      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataUrl);
      downloadAnchor.setAttribute("download", filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      const nowFormatted = new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
      setLastExportedDate(nowFormatted);
      localStorage.setItem('vibe_last_export_date', nowFormatted);

      setIsExportModalOpen(false);
      setStatusMessage({ 
        type: 'success', 
        text: `AES-GCM-256 (PBKDF2 60만 회) 강화 암호화 백업(${txs.length}건)을 안전하게 내보냈습니다.` 
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: '내보내기 실패: ' + (err.message || String(err)) });
    }
  };

  // Phase 4 / Hardening: Restore File
  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        setStatusMessage({ type: 'error', text: '백업 파일을 읽을 수 없습니다. 올바른 .json 또는 .enc 암호화 파일인지 확인해주세요.' });
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
      setStatusMessage({ type: 'error', text: '백업 파일을 읽는 데 실패했습니다: ' + (err.message || String(err)) });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Decryption execution
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
          errorText = '비밀번호가 올바르지 않거나 인증 태그 검증에 실패했습니다.';
        } else if (err.code === 'TAMPERED_PAYLOAD') {
          errorText = '백업 데이터가 변조되었거나 무결성 검증에 실패했습니다 (TAMPERED_PAYLOAD).';
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg rounded-3xl border shadow-2xl flex flex-col max-h-[85vh] transition-all bg-[#0B0C0E]/95 backdrop-blur-2xl border-white/[0.08] text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b flex items-center justify-between shrink-0 border-white/[0.06]">
          <h2 className="text-sm font-semibold tracking-tight text-white">설정</h2>
          <button 
            type="button" 
            onClick={onClose}
            className="p-1 rounded-full text-neutral-400 hover:text-white transition-colors"
            title="닫기"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        {/* 4-Tab Navigation */}
        <div className="px-4 pt-2.5 flex items-center gap-1 border-b overflow-x-auto scrollbar-none shrink-0 border-white/[0.06]">
          <button
            id="tab-assets"
            onClick={() => setActiveTab('assets')}
            className={`text-xs text-center transition-colors relative whitespace-nowrap shrink-0 flex-1 pb-2.5 ${
              activeTab === 'assets'
                ? 'border-b-2 border-white text-white font-medium'
                : 'text-neutral-400 hover:text-white font-normal border-b-2 border-transparent'
            }`}
          >
            스마트 자산
          </button>

          <button
            id="tab-ai-engine"
            onClick={() => setActiveTab('engine')}
            className={`text-xs text-center transition-colors relative whitespace-nowrap shrink-0 flex-1 pb-2.5 ${
              activeTab === 'engine'
                ? 'border-b-2 border-white text-white font-medium'
                : 'text-neutral-400 hover:text-white font-normal border-b-2 border-transparent'
            }`}
          >
            AI 엔진
          </button>

          <button
            id="tab-prefs"
            onClick={() => setActiveTab('preferences')}
            className={`text-xs text-center transition-colors relative whitespace-nowrap shrink-0 flex-1 pb-2.5 ${
              activeTab === 'preferences'
                ? 'border-b-2 border-white text-white font-medium'
                : 'text-neutral-400 hover:text-white font-normal border-b-2 border-transparent'
            }`}
          >
            일반 설정
          </button>

          <button
            id="tab-data"
            onClick={() => setActiveTab('privacy')}
            className={`text-xs text-center transition-colors relative whitespace-nowrap shrink-0 flex-1 pb-2.5 ${
              activeTab === 'privacy'
                ? 'border-b-2 border-white text-white font-medium'
                : 'text-neutral-400 hover:text-white font-normal border-b-2 border-transparent'
            }`}
          >
            데이터 관리
          </button>
        </div>

        {/* Status Toast inside Modal */}
        {statusMessage && (
          <div className={`mx-6 mt-2 px-3.5 py-2 rounded-xl text-xs flex items-center justify-between shrink-0 ${
            statusMessage.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/25 text-rose-400'
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
                theme="dark"
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
            <SettingsAITab
              engineType={engineType}
              setEngineType={setEngineType}
              setProvider={setProvider}
              apiKey={apiKey}
              setApiKey={setApiKey}
              showKey={showKey}
              setShowKey={setShowKey}
              handleClearKey={handleClearKey}
              handleTestKey={handleTestKey}
              isTestingKey={isTestingKey}
              testResult={testResult}
              setTestResult={setTestResult}
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

          {/* TAB 2: GENERAL SETTINGS */}
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
              newSpaceNameInput={newSpaceNameInput}
              setNewSpaceNameInput={setNewSpaceNameInput}
              handleCreateSpaceInline={handleCreateSpaceInline}
              handleCreateNewSpace={handleCreateNewSpace}
              internalSpaces={internalSpaces}
              activeSpaceId={activeSpaceId}
              handleSelectSpaceItem={handleSelectSpaceItem}
              handleDeleteSpaceItem={handleDeleteSpaceItem}
              setLegalOpen={setLegalOpen}
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
            />
          )}

          {/* Bottom Action Bar */}
          <div className="pt-3.5 border-t border-white/[0.06] mt-auto shrink-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  lockVault();
                }}
                title="금고 잠그기"
                className="h-10 px-3.5 rounded-xl font-normal text-xs transition-all flex items-center gap-1.5 active:scale-95 border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white"
              >
                <Lock size={13} className="shrink-0 text-neutral-400" />
                <span>금고 잠그기</span>
              </button>

              <button
                type="button"
                onClick={() => setLegalOpen(true)}
                className="text-[11px] text-neutral-400 hover:text-white underline underline-offset-4 cursor-pointer hidden sm:inline-block"
              >
                법적 고지 및 면책 조항
              </button>
            </div>

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
            <div>
              <h3 className="text-sm font-semibold text-white">데이터 백업 내보내기 (v2.0)</h3>
              <p className="text-[11px] text-neutral-400">거래, 구독, 자산 설정 통합 저장</p>
            </div>

            <div className="p-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-sky-300 flex items-center gap-1.5">
                  <Lock size={12} className="text-sky-400" />
                  AES-GCM-256 암호화 강제 (평문 유출 차단)
                </span>
                <span className="text-[10px] text-neutral-400 block mt-0.5">
                  PBKDF2 60만 회 + 128-bit MAC 인증 태그로 금융 내역을 보호합니다
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-medium">
                보안 강제
              </span>
            </div>

            <div className="space-y-1.5 animate-in fade-in duration-150">
              <label className="text-[11px] font-medium text-neutral-400 block">
                암호화 비밀번호 설정 (필수)
              </label>
              <input
                type="password"
                value={exportPassphrase}
                onChange={(e) => setExportPassphrase(e.target.value)}
                placeholder="안전한 복호화 비밀번호 입력 (필수)"
                className="w-full px-3 py-2 rounded-xl text-xs border outline-none bg-white/[0.03] border-white/10 text-white placeholder:text-neutral-600 focus:border-white/30"
              />
            </div>

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
            <div>
              <h3 className="text-sm font-semibold text-white">암호화된 백업 복호화</h3>
              <p className="text-[11px] text-neutral-400">AES-GCM 256 암호화 보호됨</p>
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
                className="w-full px-3 py-2 rounded-xl text-xs border outline-none bg-white/[0.03] border-white/10 text-white placeholder:text-neutral-600 focus:border-white/30"
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
            <div>
              <h3 className="text-sm font-semibold text-white">백업 데이터 복원 방식</h3>
              <p className="text-[11px] text-neutral-400">
                가져올 거래: {pendingRestorePayload.transactions?.length || 0}건
              </p>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed font-light">
              기존에 기록된 거래 내역과 백업 파일을 어떻게 합칠지 선택해주세요.
            </p>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => handleExecuteRestore('merge')}
                className="w-full p-3 rounded-xl border border-white/20 bg-white/[0.06] hover:bg-white/[0.1] text-white text-left transition-all flex flex-col gap-1"
              >
                <div className="flex items-center gap-1.5 font-medium text-xs text-white">
                  <CheckCircle2 size={14} />
                  <span>스마트 중복 제외 병합 (권장)</span>
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
                  <span>전체 덮어쓰기</span>
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
            <div>
              <h3 className="text-sm font-semibold text-white">
                {pinModalMode === 'set' ? '금고 보안 PIN 설정' : '금고 보안 PIN 해제'}
              </h3>
              <p className="text-[11px] text-neutral-400 font-light">
                {pinModalMode === 'set' ? '4자리 이상의 숫자 또는 비밀번호' : '현재 사용 중인 PIN 번호 확인'}
              </p>
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
                      className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono tracking-widest text-center bg-white/[0.03] border-white/10 text-white focus:border-white/30"
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
                      className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono tracking-widest text-center bg-white/[0.03] border-white/10 text-white focus:border-white/30"
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
                    className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono tracking-widest text-center bg-white/[0.03] border-white/10 text-white focus:border-white/30"
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

      {/* Legal Notice & Terms Modal */}
      <LegalNoticeModal isOpen={legalOpen} onClose={() => setLegalOpen(false)} />
    </div>
  );
};
