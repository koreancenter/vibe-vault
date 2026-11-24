import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Download, Lock, Share2, Upload } from 'lucide-react';
import { CustomDarkSelect } from './CustomDarkSelect';
import {
  VaultLockConfig,
  getAutoLockConfig,
  saveAutoLockConfig,
  setVaultPin,
  removeVaultPin,
  lockVault,
  registerBiometricUnlock,
  disableBiometricUnlock,
  isBiometricUnlockEnabled,
  isBiometricAvailable as checkBiometricAvailable,
} from '../../vaultSecurity';
import {
  getAllTransactions,
  clearAllTransactions,
  loadSampleData,
  resetAllDataToZero,
} from '../../db';
import {
  exportEncryptedBackup,
  decryptBackupData,
  isBinaryEnvelope,
  CryptoBackupError,
  recordLastBackupTimestamp,
  getLastBackupTimestamp,
  formatLastBackupDate,
  shouldShowBackupReminder,
} from '../../cryptoBackup';
import {
  buildVaultSnapshot,
  applyVaultSnapshot,
  normalizeBackupPayload,
  summarizeBackupPayload,
  canShareBackupFile,
  triggerEncryptedBackupDownload,
  shareEncryptedBackupFile,
  VaultSnapshotSummary,
} from '../../vaultSnapshot';
import { applyTheme } from '../../utils';
import { evictAllServiceWorkerCaches } from '../../usePWAInstall';
import { UnencryptedBackupPayloadV2 } from '../../types';
import { useI18n } from '../../i18n';

export interface SettingsDataTabProps {
  onClose: () => void;
  isPinSet: boolean;
  onPinChanged: (isSet: boolean) => void;
  openPinSetupSignal?: number;
  setLegalOpen: (open: boolean) => void;
  onDataChanged?: () => void;
  onDataReset?: () => void;
  onStatusMessage?: (msg: { type: 'success' | 'error'; text: string }) => void;
}

export const SettingsDataTab: React.FC<SettingsDataTabProps> = ({
  onClose,
  isPinSet,
  onPinChanged,
  openPinSetupSignal = 0,
  setLegalOpen,
  onDataChanged,
  onDataReset,
  onStatusMessage,
}) => {
  const { t, language } = useI18n();
  const isKo = language === 'ko';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [autoLockConfigState, setAutoLockConfigState] = useState<VaultLockConfig>(() => getAutoLockConfig());
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<'set' | 'remove'>('set');
  const [pinInput, setPinInput] = useState('');
  const [pinConfirmInput, setPinConfirmInput] = useState('');
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => getLastBackupTimestamp());
  const [lastExportedDate, setLastExportedDate] = useState<string>(() => {
    const stored = getLastBackupTimestamp();
    return formatLastBackupDate(stored) || (typeof localStorage !== 'undefined' ? localStorage.getItem('vibe_last_export_date') : null) || '없음';
  });
  const [isClearingData, setIsClearingData] = useState(false);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [preferredExportDelivery, setPreferredExportDelivery] = useState<'download' | 'share'>('download');
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

  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState<boolean>(() => isBiometricUnlockEnabled());
  const [showBiometricEnrollModal, setShowBiometricEnrollModal] = useState(false);
  const [biometricPin, setBiometricPin] = useState('');
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [isEnrollingBiometric, setIsEnrollingBiometric] = useState(false);
  const [transactionCount, setTransactionCount] = useState(0);

  const supportsFileShare = useMemo(() => canShareBackupFile(), []);
  const supportsWebShare = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return 'share' in navigator && 'canShare' in navigator && supportsFileShare;
  }, [supportsFileShare]);

  useEffect(() => {
    if (openPinSetupSignal > 0) {
      setPinModalMode('set');
      setPinInput('');
      setPinConfirmInput('');
      setPinError(null);
      setShowPinModal(true);
    }
  }, [openPinSetupSignal]);

  useEffect(() => {
    checkBiometricAvailable()
      .then((available) => setIsBiometricSupported(available))
      .catch(() => setIsBiometricSupported(false));
    setIsBiometricEnabled(isBiometricUnlockEnabled());
  }, [isPinSet]);

  useEffect(() => {
    let cancelled = false;
    getAllTransactions()
      .then((list) => {
        if (!cancelled) setTransactionCount(list.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lastBackupAt]);

  const formattedLastBackupDate = useMemo(() => {
    const isoDate = formatLastBackupDate(lastBackupAt);
    if (isoDate) return isoDate;
    if (lastExportedDate && lastExportedDate !== '없음') return lastExportedDate;
    return null;
  }, [lastBackupAt, lastExportedDate]);

  const showQuietBackupReminder = useMemo(
    () => shouldShowBackupReminder(lastBackupAt, transactionCount),
    [lastBackupAt, transactionCount]
  );

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
        onPinChanged(true);
        setShowPinModal(false);
        setPinInput('');
        setPinConfirmInput('');
        onStatusMessage?.({ type: 'success', text: '금고 PIN 보안 설정이 완료되었습니다.' });
      } else {
        const removed = await removeVaultPin(currentPinInput);
        if (!removed) {
          setPinError('현재 PIN 번호가 올바르지 않습니다.');
          return;
        }
        onPinChanged(false);
        setShowPinModal(false);
        setCurrentPinInput('');
        onStatusMessage?.({ type: 'success', text: '금고 PIN 보호가 해제되었습니다. (기기 마스터 키로 암호화 유지)' });
      }
    } catch (err: any) {
      setPinError(err.message || 'PIN 처리 중 오류가 발생했습니다.');
    }
  };

  const handleOpenExportModal = (delivery: 'download' | 'share' = 'download') => {
    setPreferredExportDelivery(delivery);
    setExportPassphrase('');
    setExportPreview(null);
    setIsExportModalOpen(true);
    buildVaultSnapshot()
      .then((snap) => setExportPreview(summarizeBackupPayload(snap)))
      .catch(() => {});
  };

  const handlePerformExport = async (delivery: 'download' | 'share' = preferredExportDelivery) => {
    if (!exportPassphrase.trim()) {
      onStatusMessage?.({
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
      const { filename: baseFilename, encryptedPayload } = await exportEncryptedBackup(
        snapshot,
        exportPassphrase.trim(),
        { appName: 'Vibe Vault Pro' }
      );
      const vvltFilename = baseFilename.replace(/\.vibe\.enc$/i, '.vvlt');

      let deliveryStatus: 'downloaded' | 'shared' | 'cancelled' = 'downloaded';
      if (delivery === 'share') {
        const shareResult = await shareEncryptedBackupFile(vvltFilename, encryptedPayload, {
          title: 'Vibe Vault Encrypted Backup',
          text: isKo
            ? 'AES-GCM-256 암호화된 전체 볼트 백업 파일 (.vvlt)입니다.'
            : 'AES-GCM-256 encrypted full vault backup file (.vvlt).',
        });
        if (shareResult === 'shared') {
          deliveryStatus = 'shared';
        } else if (shareResult === 'cancelled') {
          deliveryStatus = 'cancelled';
        } else {
          triggerEncryptedBackupDownload(vvltFilename, encryptedPayload);
        }
      } else {
        triggerEncryptedBackupDownload(vvltFilename, encryptedPayload);
      }

      if (deliveryStatus === 'cancelled') return;

      const savedIso = recordLastBackupTimestamp();
      setLastBackupAt(savedIso);
      setLastExportedDate(formatLastBackupDate(savedIso) || '없음');
      setIsExportModalOpen(false);
      setExportPassphrase('');
      onStatusMessage?.({
        type: 'success',
        text: isKo
          ? `전체 볼트 암호화 백업(.vvlt) ${deliveryStatus === 'shared' ? '공유' : '저장'} 완료 (계좌 ${summary.accountCount} · 대출 ${summary.debtCount} · 거래 ${summary.transactionCount} · 장부 ${summary.spaceCount})`
          : `Encrypted backup (.vvlt) ${deliveryStatus === 'shared' ? 'shared' : 'saved'} (${summary.accountCount} accounts · ${summary.debtCount} debts · ${summary.transactionCount} transactions · ${summary.spaceCount} ledgers)`,
      });
    } catch (err: any) {
      onStatusMessage?.({
        type: 'error',
        text: (isKo ? '내보내기 실패: ' : 'Export failed: ') + (err?.message || String(err)),
      });
    } finally {
      setIsExportingBackup(false);
    }
  };

  const prepareRestore = (payload: any) => {
    const normalized = normalizeBackupPayload(payload);
    const summary = summarizeBackupPayload(normalized);
    if (!normalized || !summary.hasAnyData) {
      onStatusMessage?.({
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

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uint8 = new Uint8Array(await file.arrayBuffer());
      if (isBinaryEnvelope(uint8)) {
        setPendingEncryptedData(uint8);
        setDecryptPassphrase('');
        setIsDecryptModalOpen(true);
        return;
      }

      let json: any;
      try {
        json = JSON.parse(new TextDecoder('utf-8').decode(uint8));
      } catch {
        onStatusMessage?.({
          type: 'error',
          text: isKo
            ? '백업 파일을 읽을 수 없습니다. 올바른 .vvlt, .vibe.enc, .enc 또는 .json 백업 파일인지 확인해주세요.'
            : 'Unable to read backup file. Please verify it is a valid .vvlt, .vibe.enc, .enc, or .json backup.',
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
      onStatusMessage?.({
        type: 'error',
        text: (isKo ? '백업 파일을 읽는 데 실패했습니다: ' : 'Failed to read backup file: ') + (err?.message || String(err)),
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePerformDecryption = async () => {
    if (!decryptPassphrase.trim() || !pendingEncryptedData || isDecryptingBackup) return;
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
          errorText = isKo ? '지원되지 않는 백업 파일 버전입니다.' : 'Unsupported backup file version.';
        } else {
          errorText = err.message;
        }
      } else if (err?.message) {
        errorText = err.message;
      }
      onStatusMessage?.({ type: 'error', text: errorText });
    } finally {
      setIsDecryptingBackup(false);
    }
  };

  const handleExecuteRestore = async (mode: 'merge' | 'overwrite') => {
    if (!pendingRestorePayload || isRestoringBackup) return;
    setIsRestoringBackup(true);
    try {
      const { stats } = await applyVaultSnapshot(pendingRestorePayload, mode);
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

      onStatusMessage?.({ type: 'success', text: msg });
      onDataChanged?.();
    } catch (err: any) {
      onStatusMessage?.({
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
      onStatusMessage?.({
        type: 'success',
        text: `샘플 데이터 로드 완료 (자산 ${res.accountsCount}개, 대출 ${res.debtsCount}건, 거래 ${res.transactionsCount}건)`,
      });
      onDataChanged?.();
    } catch (err: any) {
      onStatusMessage?.({ type: 'error', text: '샘플 데이터 로드 실패: ' + err.message });
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
      applyTheme('dark');
      setLastBackupAt(null);
      setLastExportedDate('없음');
      onPinChanged(false);
      await evictAllServiceWorkerCaches().catch(() => false);
      onStatusMessage?.({ type: 'success', text: '전체 데이터와 설정이 성공적으로 초기화되었습니다.' });
      onDataReset?.();
      onDataChanged?.();
    } catch (err: any) {
      onStatusMessage?.({ type: 'error', text: '데이터 초기화 실패: ' + err.message });
    } finally {
      setIsClearingData(false);
    }
  };


  const handleEnrollBiometric = async (e: React.FormEvent) => {
    e.preventDefault();
    setBiometricError(null);
    setIsEnrollingBiometric(true);
    try {
      const res = await registerBiometricUnlock(biometricPin);
      if (res.success) {
        setIsBiometricEnabled(true);
        setShowBiometricEnrollModal(false);
        setBiometricPin('');
        if (onStatusMessage) {
          onStatusMessage({ type: 'success', text: '생체인증 빠른 잠금 해제가 설정되었습니다.' });
        }
      } else {
        setBiometricError(res.error || '생체인증 등록에 실패했습니다.');
      }
    } catch (err: any) {
      setBiometricError(err.message || '생체인증 등록 중 오류가 발생했습니다.');
    } finally {
      setIsEnrollingBiometric(false);
    }
  };

  const handleDisableBiometric = async () => {
    await disableBiometricUnlock();
    setIsBiometricEnabled(false);
    if (onStatusMessage) {
      onStatusMessage({ type: 'success', text: '생체인증 잠금 해제가 비활성화되었습니다.' });
    }
  };

  return (
    <div className="space-y-3.5 animate-in fade-in duration-150">
      {/* Group 1: 금고 보안 & 자동 잠금 */}
      <div className="space-y-2.5 border-b border-white/[0.06] pb-3.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-white">
            <span>금고 보안 & 자동 잠금</span>
          </div>
          {isPinSet && (
            <button
              type="button"
              onClick={() => {
                onClose();
                lockVault();
              }}
              className="text-xs px-2.5 py-1 rounded-full font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white transition-colors cursor-pointer"
            >
              지금 잠그기
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {/* PIN 설정 상태 & 버튼 */}
          <div className="flex items-center justify-between gap-2 py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-100 font-medium">보안 PIN</span>
              {isPinSet ? (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  설정됨
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/[0.03] text-neutral-100 border border-white/[0.08]">
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
                  className="h-10 px-3.5 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white transition-all active:scale-95 flex items-center justify-center cursor-pointer"
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
                  className="h-10 px-3.5 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-100 hover:text-white transition-all active:scale-95 flex items-center justify-center cursor-pointer"
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
                className="h-10 px-4 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white transition-all active:scale-95 flex items-center justify-center cursor-pointer"
              >
                PIN 설정
              </button>
            )}
          </div>

          {/* 자동 잠금 드롭다운 */}
          <div className="flex items-center justify-between gap-2 py-1.5 border-t border-white/[0.06]">
            <span className="text-xs text-neutral-100 font-medium">자동 잠금</span>
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

          {/* 생체인증 잠금 해제 (WebAuthn / Passkey) */}
          <div className="flex items-center justify-between gap-2 py-1.5 border-t border-white/[0.06]">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-100 font-medium">생체인증 잠금 해제</span>
                {isBiometricEnabled ? (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    활성화됨
                  </span>
                ) : !isBiometricSupported ? (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/[0.03] text-neutral-100 border border-white/[0.08]">
                    기기 미지원
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/[0.03] text-neutral-100 border border-white/[0.08]">
                    {isPinSet ? '미설정' : 'PIN 필요'}
                  </span>
                )}
              </div>
              <span className="text-xs text-neutral-200 font-normal mt-0.5">
                지문 / Face ID / Windows Hello 빠른 잠금 해제
              </span>
            </div>

            {isBiometricEnabled ? (
              <button
                type="button"
                onClick={handleDisableBiometric}
                className="h-10 px-3.5 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white transition-all active:scale-95 flex items-center justify-center cursor-pointer"
              >
                해제
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setBiometricPin('');
                  setBiometricError(null);
                  setShowBiometricEnrollModal(true);
                }}
                disabled={!isPinSet || !isBiometricSupported}
                className="h-10 px-4 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white transition-all active:scale-95 flex items-center justify-center disabled:bg-white/[0.02] disabled:text-neutral-300 disabled:border-white/[0.06] disabled:pointer-events-none cursor-pointer"
              >
                등록
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Group 2: 100% 로컬 암호화 백업 및 기기 간 스마트 병합 */}
      <div className="space-y-2.5 border-b border-white/[0.06] pb-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-white">
            <span>{isKo ? '암호화 백업 및 기기 간 이전' : 'Encrypted Backup & Transfer'}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {showQuietBackupReminder && (
              <span
                id="quiet-backup-reminder"
                className="inline-flex items-center gap-1.5 text-[11px] text-amber-300/85 font-normal"
              >
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
                <span>{isKo ? '백업 권장' : 'Backup suggested'}</span>
              </span>
            )}
            <span className="text-xs text-neutral-300 font-normal">
              {isKo ? '마지막 백업:' : 'Last backup:'}{' '}
              <span className="font-mono text-white tabular-nums">
                {formattedLastBackupDate || (isKo ? '백업 기록 없음' : 'None')}
              </span>
            </span>
          </div>
        </div>

        <p className="text-xs text-neutral-300 leading-relaxed font-normal">
          {isKo
            ? '외부 서버나 계정 연동 없이 AES-GCM 암호화 파일(.vvlt)로 저장·공유하고, 다른 기기에서 중복 없이 스마트 병합합니다.'
            : '100% local-first AES-GCM encrypted snapshots (.vvlt). Export or share directly to your drive/devices and smart-merge without duplicates.'}
        </p>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleOpenExportModal('download')}
              className="py-2.5 px-3 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
            >
              <Download size={13} className="shrink-0 text-neutral-200" />
              <span className="truncate">{isKo ? '암호화 백업 저장' : 'Download Backup'}</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="py-2.5 px-3 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
            >
              <Upload size={13} className="shrink-0 text-neutral-200" />
              <span className="truncate">{isKo ? '백업 복원 / 병합' : 'Restore / Merge'}</span>
            </button>
            <input
              ref={fileInputRef as any}
              type="file"
              accept=".vvlt,.vibe.enc,.enc,.json"
              className="hidden"
              onChange={handleRestoreFile}
            />
          </div>

          {supportsWebShare && (
            <button
              type="button"
              id="share-backup-btn"
              onClick={() => handleOpenExportModal('share')}
              className="w-full py-2.5 px-3 rounded-xl text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.1] text-neutral-100 hover:text-white flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
            >
              <Share2 size={13} className="shrink-0 text-sky-300" />
              <span>{isKo ? '모바일/클라우드로 공유 (Share Backup)' : 'Share Backup to Mobile / Cloud'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Group 3: 데이터 유틸리티 */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-white">
          <span>데이터 유틸리티</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            id="load-sample-data-btn"
            onClick={handleLoadSampleData}
            disabled={isClearingData}
            className="py-2.5 px-3 rounded-xl text-xs font-medium flex items-center justify-center transition-all active:scale-98 disabled:opacity-50 bg-white/[0.03] hover:bg-white/[0.07] text-white border border-white/[0.08] cursor-pointer"
          >
            <span>샘플 데이터 불러오기</span>
          </button>

          <button
            type="button"
            id="reset-all-data-btn"
            onClick={handleResetAllData}
            disabled={isClearingData}
            className="bg-white/[0.03] hover:bg-white/[0.07] text-white border border-white/[0.08] rounded-xl py-2.5 px-3 text-xs font-medium flex items-center justify-center transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
          >
            <span>전체 데이터 초기화</span>
          </button>
        </div>

        <p className="text-xs text-neutral-200 leading-snug mt-1.5 font-normal">
          ⚠️ 전체 데이터 초기화 시 기기에 암호화되어 저장된 모든 자산, 거래 내역, PIN이 영구 삭제됩니다.
        </p>

        {/* Canonical Legal Notice & Disclaimer Link */}
        <button
          type="button"
          id="legal-notice-btn"
          onClick={() => setLegalOpen(true)}
          className="w-full py-2 mt-1 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.08] text-xs font-medium text-neutral-100 hover:text-white transition-all cursor-pointer"
        >
          <span>{t('legal_notice_link')}</span>
        </button>
      </div>

      {/* WebAuthn Biometric Enrollment Modal */}
      {showBiometricEnrollModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setShowBiometricEnrollModal(false)}
        >
          <div
            className="w-full max-w-xs border border-white/[0.08] rounded-2xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 bg-[#0E1015] backdrop-blur-2xl text-white antialiased"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold tracking-tight text-white">생체인증 빠른 잠금 해제 등록</h3>
              <p className="text-xs text-neutral-200 font-normal mt-0.5">
                지문 / Face ID 등록을 위해 현재 금고 PIN 번호를 입력해주세요.
              </p>
            </div>

            <form onSubmit={handleEnrollBiometric} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-neutral-100 block">
                  현재 PIN 번호 입력
                </label>
                <input
                  type="password"
                  maxLength={12}
                  value={biometricPin}
                  onChange={(e) => setBiometricPin(e.target.value)}
                  placeholder="PIN 번호 입력"
                  className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono tracking-widest text-center bg-white/[0.03] border-white/[0.08] text-white placeholder:text-neutral-300 focus:border-white/25"
                  autoFocus
                />
              </div>

              {biometricError && (
                <div className="text-xs text-amber-200 font-medium flex items-center gap-1">
                  <span>{biometricError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBiometricEnrollModal(false)}
                  className="flex-1 py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-neutral-100 hover:text-white hover:bg-white/[0.07] text-xs font-medium transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={biometricPin.length < 4 || isEnrollingBiometric}
                  className="flex-1 py-2 rounded-xl bg-white text-black hover:bg-neutral-100 font-semibold text-xs transition-all active:scale-95 shadow-sm disabled:bg-white/35 disabled:text-black"
                >
                  {isEnrollingBiometric ? '등록 중...' : '생체인증 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Encrypted Full Vault Backup Export Modal */}
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
                {isKo ? '전체 볼트 암호화 백업 (v3.0)' : 'Full Vault Encrypted Backup (v3.0)'}
              </h3>
              <p className="text-xs text-neutral-200 font-normal mt-0.5">
                {isKo
                  ? '자산 계좌 · 대출/정산 · 거래 · 다중 장부 · 구독 · 테마 설정 통합 저장'
                  : 'Includes accounts, debts, transactions, ledgers, subscriptions & theme settings'}
              </p>
            </div>

            {exportPreview && (
              <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5 text-center">
                {[
                  { count: exportPreview.accountCount, label: isKo ? '계좌' : 'Accounts' },
                  { count: exportPreview.debtCount, label: isKo ? '대출/정산' : 'Debts' },
                  { count: exportPreview.transactionCount, label: isKo ? '거래' : 'Txns' },
                  { count: exportPreview.spaceCount, label: isKo ? '장부' : 'Ledgers' },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="text-xs font-semibold text-white tabular-nums">{item.count}</div>
                    <div className="text-[11px] text-neutral-300">{item.label}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="p-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-medium text-sky-200 flex items-center gap-1.5">
                  <Lock size={12} className="text-sky-300 shrink-0" />
                  {isKo ? 'AES-GCM-256 암호화 강제' : 'Mandatory AES-GCM-256 Encryption'}
                </span>
                <span className="text-xs text-neutral-200 font-normal block mt-0.5">
                  {isKo
                    ? 'PBKDF2 60만 회 + 128-bit MAC 태그로 다른 기기 전송 시에도 안전합니다'
                    : 'PBKDF2 600k rounds + 128-bit MAC tag for safe cross-device transfer'}
                </span>
              </div>
              <span className="text-xs text-sky-200 font-mono font-medium shrink-0">E2EE</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-100 block">
                {isKo ? '암호화 비밀번호 설정 (필수)' : 'Encryption Passphrase (Required)'}
              </label>
              <input
                type="password"
                value={exportPassphrase}
                onChange={(e) => setExportPassphrase(e.target.value)}
                disabled={isExportingBackup}
                placeholder={isKo ? '복호화 시 사용할 비밀번호 입력' : 'Enter passphrase for decryption'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && exportPassphrase.trim() && !isExportingBackup) {
                    void handlePerformExport(preferredExportDelivery);
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
                  {isKo ? '취소' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={isExportingBackup || !exportPassphrase.trim()}
                  onClick={() => void handlePerformExport(preferredExportDelivery === 'share' && supportsFileShare ? 'share' : 'download')}
                  className="flex-1 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-100 disabled:bg-white/35 disabled:text-black font-semibold text-xs transition-all active:scale-95 shadow-sm flex items-center justify-center gap-1.5"
                >
                  {preferredExportDelivery === 'share' && supportsFileShare ? <Share2 size={13} /> : <Download size={13} />}
                  <span>
                    {isExportingBackup
                      ? (isKo ? '암호화 중...' : 'Encrypting...')
                      : preferredExportDelivery === 'share' && supportsFileShare
                        ? (isKo ? '공유 시트 열기' : 'Share Backup')
                        : (isKo ? '파일로 저장 (.vvlt)' : 'Save File (.vvlt)')}
                  </span>
                </button>
              </div>

              {supportsFileShare && preferredExportDelivery === 'download' && (
                <button
                  type="button"
                  disabled={isExportingBackup || !exportPassphrase.trim()}
                  onClick={() => void handlePerformExport('share')}
                  className="w-full py-2.5 rounded-xl border border-sky-400/25 bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-40 text-sky-100 font-medium text-xs transition-all flex items-center justify-center gap-1.5"
                >
                  <Share2 size={13} />
                  <span>
                    {isKo
                      ? '모바일/클라우드로 바로 공유 (Drive · iCloud · 메신저)'
                      : 'Share Backup to Mobile / Cloud (Drive · iCloud)'}
                  </span>
                </button>
              )}

              {preferredExportDelivery === 'share' && (
                <button
                  type="button"
                  disabled={isExportingBackup || !exportPassphrase.trim()}
                  onClick={() => void handlePerformExport('download')}
                  className="w-full py-2 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] disabled:opacity-40 text-neutral-200 hover:text-white font-medium text-xs transition-all flex items-center justify-center gap-1.5"
                >
                  <Download size={13} />
                  <span>{isKo ? '대신 이 기기에 파일로 저장 (.vvlt)' : 'Download .vvlt File Instead'}</span>
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
                {isKo ? '암호화된 백업 복호화' : 'Decrypt Encrypted Backup'}
              </h3>
              <p className="text-xs text-neutral-200 font-normal mt-0.5">
                {isKo ? 'AES-GCM-256 암호화 보호됨' : 'Protected with AES-GCM-256'}
              </p>
            </div>

            <p className="text-xs text-neutral-200 leading-relaxed font-normal">
              {isKo
                ? '이 백업 파일은 비밀번호로 안전하게 암호화되어 있습니다. 백업 생성 시 설정한 복호화 비밀번호를 입력해주세요.'
                : 'This backup is encrypted with a passphrase. Enter the passphrase you used when creating the backup.'}
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-100 block">
                {isKo ? '복호화 비밀번호' : 'Decryption Passphrase'}
              </label>
              <input
                type="password"
                value={decryptPassphrase}
                onChange={(e) => setDecryptPassphrase(e.target.value)}
                disabled={isDecryptingBackup}
                placeholder={isKo ? '비밀번호 입력' : 'Enter passphrase'}
                autoFocus
                className="w-full px-3 py-2 rounded-xl text-xs border outline-none bg-white/[0.03] border-white/[0.08] text-white placeholder:text-neutral-300 focus:border-white/25"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && decryptPassphrase.trim() && !isDecryptingBackup) {
                    void handlePerformDecryption();
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
                {isKo ? '취소' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!decryptPassphrase.trim() || isDecryptingBackup}
                onClick={() => void handlePerformDecryption()}
                className="flex-1 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-100 disabled:bg-white/35 disabled:text-black font-semibold text-xs transition-all active:scale-95 shadow-sm"
              >
                {isDecryptingBackup
                  ? (isKo ? '복호화 중...' : 'Decrypting...')
                  : (isKo ? '복호화 및 계속' : 'Decrypt & Continue')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Deduplicated Merge / Overwrite Modal */}
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
                {isKo ? '백업 데이터 복원 방식' : 'Choose Restore Mode'}
              </h3>
              <p className="text-xs text-neutral-200 font-normal mt-0.5">
                {isKo
                  ? `스냅샷 v${pendingRestoreSummary.version} · 복원 대상 항목`
                  : `Snapshot v${pendingRestoreSummary.version} · Contents to restore`}
              </p>
            </div>

            <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5 text-center">
              {[
                { count: pendingRestoreSummary.accountCount, label: isKo ? '계좌' : 'Accounts' },
                { count: pendingRestoreSummary.debtCount, label: isKo ? '대출/정산' : 'Debts' },
                { count: pendingRestoreSummary.transactionCount, label: isKo ? '거래' : 'Txns' },
                { count: pendingRestoreSummary.spaceCount, label: isKo ? '장부' : 'Ledgers' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="text-xs font-semibold text-white tabular-nums">{item.count}</div>
                  <div className="text-[11px] text-neutral-300">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={isRestoringBackup}
                onClick={() => void handleExecuteRestore('merge')}
                className="w-full p-3 rounded-xl border border-white/15 bg-white/[0.05] hover:bg-white/[0.09] disabled:opacity-50 text-white text-left transition-all flex flex-col gap-1"
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-white">
                  <CheckCircle2 size={14} />
                  <span>{isKo ? '스마트 중복 제외 병합 (권장)' : 'Smart Deduplicated Merge (Recommended)'}</span>
                </div>
                <span className="text-xs text-neutral-200 font-normal">
                  {isKo
                    ? '계좌·대출·장부·거래를 ID와 최신 수정 시각 기준으로 중복 없이 병합합니다.'
                    : 'Merges accounts, debts, ledgers & transactions cleanly by ID and latest timestamp.'}
                </span>
              </button>

              <button
                type="button"
                disabled={isRestoringBackup}
                onClick={() => void handleExecuteRestore('overwrite')}
                className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] disabled:opacity-50 text-white text-left transition-all flex flex-col gap-1"
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-300">
                  <AlertTriangle size={14} />
                  <span>{isKo ? '전체 덮어쓰기' : 'Full Overwrite'}</span>
                </div>
                <span className="text-xs text-neutral-200 font-normal">
                  {isKo
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
                ? (isKo ? '복원 반영 중...' : 'Restoring...')
                : (isKo ? '복원 취소' : 'Cancel Restore')}
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
                    <label className="text-xs font-medium text-neutral-100 block">새 PIN 번호 입력</label>
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
                    <label className="text-xs font-medium text-neutral-100 block">PIN 번호 재입력 확인</label>
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
                  <label className="text-xs font-medium text-neutral-100 block">현재 PIN 번호 입력</label>
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
    </div>
  );
};

