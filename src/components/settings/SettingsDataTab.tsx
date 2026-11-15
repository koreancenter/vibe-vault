import React, { useState, useEffect } from 'react';
import { CustomDarkSelect } from './CustomDarkSelect';
import { 
  VaultLockConfig, 
  lockVault,
  registerBiometricUnlock,
  disableBiometricUnlock,
  isBiometricUnlockEnabled,
  isBiometricAvailable as checkBiometricAvailable
} from '../../vaultSecurity';
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
  handleOpenExportModal: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleRestoreFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleLoadSampleData: () => void;
  handleResetAllData: () => void;
  isClearingData: boolean;
  setLegalOpen: (open: boolean) => void;
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
  handleOpenExportModal,
  fileInputRef,
  handleRestoreFile,
  handleLoadSampleData,
  handleResetAllData,
  isClearingData,
  setLegalOpen,
  onStatusMessage
}) => {
  const { t } = useI18n();
  const [isBiometricSupported, setIsBiometricSupported] = useState<boolean>(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState<boolean>(() => isBiometricUnlockEnabled());
  const [showBiometricEnrollModal, setShowBiometricEnrollModal] = useState<boolean>(false);
  const [biometricPin, setBiometricPin] = useState<string>('');
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [isEnrollingBiometric, setIsEnrollingBiometric] = useState<boolean>(false);

  useEffect(() => {
    checkBiometricAvailable()
      .then((available) => setIsBiometricSupported(available))
      .catch(() => setIsBiometricSupported(false));
    setIsBiometricEnabled(isBiometricUnlockEnabled());
  }, [isPinSet]);

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
              className="text-xs px-2.5 py-1 rounded-full font-medium bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 text-neutral-200 hover:text-white transition-colors"
            >
              지금 잠그기
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {/* PIN 설정 상태 & 버튼 */}
          <div className="flex items-center justify-between gap-2 py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-200 font-medium">보안 PIN</span>
              {isPinSet ? (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  설정됨
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/[0.04] text-neutral-300 border border-white/[0.06]">
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
                  className="h-10 px-3.5 rounded-xl text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-neutral-100 hover:text-white transition-all active:scale-95 flex items-center justify-center"
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
                  className="h-10 px-3.5 rounded-xl text-xs font-medium bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-200 hover:text-white transition-all active:scale-95 flex items-center justify-center"
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
                className="h-10 px-4 rounded-xl text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-neutral-100 hover:text-white transition-all active:scale-95 flex items-center justify-center"
              >
                PIN 설정
              </button>
            )}
          </div>

          {/* 자동 잠금 드롭다운 */}
          <div className="flex items-center justify-between gap-2 py-1.5 border-t border-white/[0.04]">
            <span className="text-xs text-neutral-200 font-medium">자동 잠금</span>
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
          <div className="flex items-center justify-between gap-2 py-1.5 border-t border-white/[0.04]">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-200 font-medium">생체인증 잠금 해제</span>
                {isBiometricEnabled ? (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    활성화됨
                  </span>
                ) : !isBiometricSupported ? (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/[0.04] text-neutral-300 border border-white/[0.06]">
                    기기 미지원
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/[0.04] text-neutral-300 border border-white/[0.06]">
                    {isPinSet ? '미설정' : 'PIN 필요'}
                  </span>
                )}
              </div>
              <span className="text-xs text-neutral-300 font-normal mt-0.5">
                지문 / Face ID / Windows Hello 빠른 잠금 해제
              </span>
            </div>

            {isBiometricEnabled ? (
              <button
                type="button"
                onClick={handleDisableBiometric}
                className="h-10 px-3.5 rounded-xl text-xs font-medium bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-200 hover:text-white transition-all active:scale-95 flex items-center justify-center cursor-pointer"
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
                className="h-10 px-4 rounded-xl text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-neutral-100 hover:text-white transition-all active:scale-95 flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                등록
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Group 2: 데이터 백업 및 복원 */}
      <div className="space-y-2 border-b border-white/[0.06] pb-3.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-white">
            <span>데이터 백업 및 복원</span>
          </div>
          <span className="text-xs text-neutral-300 font-normal">
            마지막 백업: <span className="font-medium text-neutral-100">{lastExportedDate}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleOpenExportModal}
            className="py-2.5 px-3 rounded-xl text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-neutral-100 hover:text-white flex items-center justify-center transition-all active:scale-98"
          >
            <span>백업 내보내기</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="py-2.5 px-3 rounded-xl text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-neutral-100 hover:text-white flex items-center justify-center transition-all active:scale-98"
          >
            <span>백업 복원/가져오기</span>
          </button>
          <input
            ref={fileInputRef as any}
            type="file"
            accept=".json,.enc,.vibe.enc"
            className="hidden"
            onChange={handleRestoreFile}
          />
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
            className="py-2.5 px-3 rounded-xl text-xs font-medium flex items-center justify-center transition-all active:scale-98 disabled:opacity-50 bg-white/[0.03] hover:bg-white/[0.07] text-neutral-100 hover:text-white border border-white/[0.08]"
          >
            <span>샘플 데이터 불러오기</span>
          </button>

          <button
            type="button"
            id="reset-all-data-btn"
            onClick={handleResetAllData}
            disabled={isClearingData}
            className="bg-white/[0.04] text-neutral-200 border border-white/[0.08] hover:text-white rounded-xl py-2.5 px-3 text-xs font-medium flex items-center justify-center transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
          >
            <span>전체 데이터 초기화</span>
          </button>
        </div>

        <p className="text-xs text-neutral-300 leading-snug mt-1.5 font-normal">
          ⚠️ 전체 데이터 초기화 시 기기에 암호화되어 저장된 모든 자산, 거래 내역, PIN이 영구 삭제됩니다.
        </p>

        {/* Canonical Legal Notice & Disclaimer Link */}
        <button
          type="button"
          id="legal-notice-btn"
          onClick={() => setLegalOpen(true)}
          className="w-full py-2 mt-1 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] text-xs font-normal text-neutral-300 hover:text-white transition-all cursor-pointer"
        >
          <span>{t('legal_notice_link')}</span>
        </button>
      </div>

      {/* WebAuthn Biometric Enrollment Modal */}
      {showBiometricEnrollModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setShowBiometricEnrollModal(false)}
        >
          <div
            className="w-full max-w-xs border border-white/[0.08] rounded-2xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 bg-[#0B0C0E]/95 backdrop-blur-2xl text-white antialiased"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-semibold tracking-tight text-white">생체인증 빠른 잠금 해제 등록</h3>
              <p className="text-xs text-neutral-300 font-normal mt-0.5">
                지문 / Face ID 등록을 위해 현재 금고 PIN 번호를 입력해주세요.
              </p>
            </div>

            <form onSubmit={handleEnrollBiometric} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-neutral-200 block">
                  현재 PIN 번호 입력
                </label>
                <input
                  type="password"
                  maxLength={12}
                  value={biometricPin}
                  onChange={(e) => setBiometricPin(e.target.value)}
                  placeholder="PIN 번호 입력"
                  className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono tracking-widest text-center bg-white/[0.03] border-white/10 text-white placeholder:text-neutral-400 focus:border-white/30"
                  autoFocus
                />
              </div>

              {biometricError && (
                <div className="text-xs text-neutral-200 font-normal flex items-center gap-1">
                  <span>{biometricError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBiometricEnrollModal(false)}
                  className="flex-1 py-2 rounded-xl border border-white/10 text-neutral-200 hover:text-white hover:bg-white/[0.06] text-xs font-medium transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={biometricPin.length < 4 || isEnrollingBiometric}
                  className="flex-1 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 font-medium text-xs transition-all active:scale-95 shadow-sm disabled:opacity-50"
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
