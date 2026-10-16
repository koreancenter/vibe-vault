import React from 'react';
import { CustomDarkSelect } from './CustomDarkSelect';
import { VaultLockConfig, lockVault } from '../../vaultSecurity';

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
}) => {
  return (
    <div className="space-y-3.5 animate-in fade-in duration-150">
      {/* Group 1: 금고 보안 & 자동 잠금 */}
      <div className="space-y-2.5 border-b border-white/[0.06] pb-3.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-white">
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

        <div className="space-y-2.5">
          {/* PIN 설정 상태 & 버튼 */}
          <div className="flex items-center justify-between gap-2 py-1.5">
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
                  className="h-10 px-3.5 rounded-xl text-xs font-normal bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-neutral-200 hover:text-white transition-all active:scale-95 flex items-center justify-center"
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
                  className="h-10 px-3.5 rounded-xl text-xs font-normal bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 hover:text-white transition-all active:scale-95 flex items-center justify-center"
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
                className="h-10 px-4 rounded-xl text-xs font-normal bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-neutral-200 hover:text-white transition-all active:scale-95 flex items-center justify-center"
              >
                PIN 설정
              </button>
            )}
          </div>

          {/* 자동 잠금 드롭다운 */}
          <div className="flex items-center justify-between gap-2 py-1.5 border-t border-white/[0.04]">
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
      <div className="space-y-2 border-b border-white/[0.06] pb-3.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-white">
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
            className="py-2.5 px-3 rounded-xl text-xs font-normal bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-neutral-200 hover:text-white flex items-center justify-center transition-all active:scale-98"
          >
            <span>백업 내보내기</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="py-2.5 px-3 rounded-xl text-xs font-normal bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-neutral-200 hover:text-white flex items-center justify-center transition-all active:scale-98"
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
        <div className="text-xs font-medium text-white">
          <span>데이터 유틸리티</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            id="load-sample-data-btn"
            onClick={handleLoadSampleData}
            disabled={isClearingData}
            className="py-2.5 px-3 rounded-xl text-xs font-normal flex items-center justify-center transition-all active:scale-98 disabled:opacity-50 bg-white/[0.03] hover:bg-white/[0.07] text-neutral-200 hover:text-white border border-white/[0.08]"
          >
            <span>샘플 데이터 불러오기</span>
          </button>

          <button
            type="button"
            id="reset-all-data-btn"
            onClick={handleResetAllData}
            disabled={isClearingData}
            className="bg-white/[0.04] text-neutral-300 border border-white/[0.08] hover:text-white rounded-xl py-2.5 px-3 text-xs flex items-center justify-center transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
          >
            <span>전체 데이터 초기화</span>
          </button>
        </div>

        <p className="text-[11px] text-neutral-400 leading-snug mt-1.5 font-light">
          ⚠️ 전체 데이터 초기화 시 기기에 암호화되어 저장된 모든 자산, 거래 내역, PIN이 영구 삭제됩니다.
        </p>

        {/* Canonical Legal Notice & Disclaimer Link */}
        <button
          type="button"
          id="legal-notice-btn"
          onClick={() => setLegalOpen(true)}
          className="w-full py-2 mt-1 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] text-[11px] text-neutral-400 hover:text-white transition-all"
        >
          <span>법적 고지 및 면책 조항</span>
        </button>
      </div>
    </div>
  );
};
