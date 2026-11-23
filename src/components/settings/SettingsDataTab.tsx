import React, { useState, useEffect, useMemo } from 'react';
import { Download, Share2, Upload } from 'lucide-react';
import { CustomDarkSelect } from './CustomDarkSelect';
import { 
  VaultLockConfig, 
  lockVault,
  registerBiometricUnlock,
  disableBiometricUnlock,
  isBiometricUnlockEnabled,
  isBiometricAvailable as checkBiometricAvailable
} from '../../vaultSecurity';
import { getAllTransactions } from '../../db';
import {
  formatLastBackupDate,
  shouldShowBackupReminder,
} from '../../cryptoBackup';
import { canShareBackupFile } from '../../vaultSnapshot';
import { useI18n } from '../../i18n';

interface SettingsDataTabProps {
  onClose: () => void;
  isPinSet: boolean;
  autoLockConfigState: VaultLockConfig;
  setAutoLockConfigState: (config: VaultLockConfig) => void;
  saveAutoLockConfig: (config: VaultLockConfig) => void;
  setPinModalMode: (mode: 'set' | 'remove') => void;
  setPinInput: (val: string) => void;
  setPinConfirmInput: (val: string) => void;
  setCurrentPinInput: (val: string) => void;
  setPinError: (err: string | null) => void;
  setShowPinModal: (show: boolean) => void;
  lastExportedDate: string;
  lastBackupAt: string | null;
  handleOpenExportModal: (delivery?: 'download' | 'share') => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleRestoreFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleLoadSampleData: () => void;
  handleResetAllData: () => void;
  isClearingData: boolean;
  setLegalOpen: (open: boolean) => void;
  onDataChanged?: () => void;
  onStatusMessage?: (msg: { type: 'success' | 'error'; text: string }) => void;
}

export const SettingsDataTab: React.FC<SettingsDataTabProps> = ({
  onClose,
  isPinSet,
  autoLockConfigState,
  setAutoLockConfigState,
  saveAutoLockConfig,
  setPinModalMode,
  setPinInput,
  setPinConfirmInput,
  setCurrentPinInput,
  setPinError,
  setShowPinModal,
  lastExportedDate,
  lastBackupAt,
  handleOpenExportModal,
  fileInputRef,
  handleRestoreFile,
  handleLoadSampleData,
  handleResetAllData,
  isClearingData,
  setLegalOpen,
  onStatusMessage
}) => {
  const { t, language } = useI18n();
  const isKo = language === 'ko';
  const [isBiometricSupported, setIsBiometricSupported] = useState<boolean>(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState<boolean>(() => isBiometricUnlockEnabled());
  const [showBiometricEnrollModal, setShowBiometricEnrollModal] = useState<boolean>(false);
  const [biometricPin, setBiometricPin] = useState<string>('');
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [isEnrollingBiometric, setIsEnrollingBiometric] = useState<boolean>(false);
  const [transactionCount, setTransactionCount] = useState<number>(0);

  const supportsWebShare = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return 'share' in navigator && 'canShare' in navigator && canShareBackupFile();
  }, []);

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
    </div>
  );
};
