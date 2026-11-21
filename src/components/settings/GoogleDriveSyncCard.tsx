import React, { useEffect, useState, useCallback } from 'react';
import {
  Cloud,
  RefreshCw,
  Upload,
  Download,
  Trash2,
  Lock,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import {
  clearDriveAccessToken,
  DriveAuthUserInfo,
  getCurrentDriveUser,
  getDriveAccessToken,
  googleDriveSignIn,
  googleDriveSignOut,
  initDriveAuth,
} from '../../googleDriveAuth';
import {
  applyRemoteVaultSnapshot,
  deleteRemoteVaultBackup,
  DRIVE_SYNC_FILENAME,
  DriveSyncError,
  findRemoteVaultBackup,
  getLastDriveSyncTimestamp,
  RemoteVaultBackupMeta,
  syncPullAndPreviewFromGoogleDrive,
  syncPushToGoogleDrive,
  syncTwoWaySmartMergeWithGoogleDrive,
} from '../../googleDriveSync';
import { CryptoBackupError } from '../../cryptoBackup';
import {
  buildVaultSnapshot,
  summarizeBackupPayload,
  VaultRestoreMode,
  VaultSnapshotSummary,
} from '../../vaultSnapshot';
import { UnencryptedBackupPayloadV2 } from '../../types';

interface GoogleDriveSyncCardProps {
  onDataChanged?: () => void;
  onStatusMessage?: (msg: { type: 'success' | 'error'; text: string }) => void;
}

type PendingDriveConfirmAction =
  | { type: 'two_way'; localSummary: VaultSnapshotSummary | null }
  | { type: 'push'; localSummary: VaultSnapshotSummary | null }
  | { type: 'delete' }
  | null;

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatSyncDateTime = (iso: string | null | undefined, isKo: boolean): string => {
  if (!iso) return isKo ? '없음' : 'Never';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString(isKo ? 'ko-KR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const GoogleDriveSyncCard: React.FC<GoogleDriveSyncCardProps> = ({
  onDataChanged,
  onStatusMessage,
}) => {
  const { language } = useI18n();
  const isKo = language === 'ko';

  const [needsAuth, setNeedsAuth] = useState<boolean>(() => !getDriveAccessToken());
  const [driveUser, setDriveUser] = useState<DriveAuthUserInfo | null>(() => getCurrentDriveUser());
  const [accessToken, setAccessToken] = useState<string | null>(() => getDriveAccessToken());
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [remoteMeta, setRemoteMeta] = useState<RemoteVaultBackupMeta | null>(null);
  const [isCheckingRemote, setIsCheckingRemote] = useState<boolean>(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => getLastDriveSyncTimestamp());

  // Passphrase lives strictly in ephemeral React state — never persisted.
  const [syncPassphrase, setSyncPassphrase] = useState<string>('');
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [busyLabel, setBusyLabel] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  // Explicit user confirmation modals (mandatory before any Drive mutation or local restore)
  const [confirmAction, setConfirmAction] = useState<PendingDriveConfirmAction>(null);
  const [pendingPullData, setPendingPullData] = useState<{
    payload: UnencryptedBackupPayloadV2;
    summary: VaultSnapshotSummary;
  } | null>(null);

  const refreshRemoteStatus = useCallback(
    async (token: string) => {
      setIsCheckingRemote(true);
      setLocalError(null);
      try {
        const meta = await findRemoteVaultBackup(token);
        setRemoteMeta(meta);
        if (meta?.modifiedTime) {
          setLastSyncAt(meta.modifiedTime);
        }
      } catch (err: any) {
        if (err instanceof DriveSyncError && err.code === 'AUTH_EXPIRED') {
          clearDriveAccessToken();
          setAccessToken(null);
          setNeedsAuth(true);
          setLocalError(
            isKo
              ? 'Google 인증 세션이 만료되었습니다. 다시 로그인해주세요.'
              : 'Google session expired. Please sign in again.'
          );
        } else {
          setLocalError(
            err?.message ||
              (isKo ? 'Google Drive 상태를 불러오지 못했습니다.' : 'Failed to check Google Drive status.')
          );
        }
      } finally {
        setIsCheckingRemote(false);
      }
    },
    [isKo]
  );

  useEffect(() => {
    const unsubscribe = initDriveAuth(
      (user, token) => {
        setDriveUser(user);
        setAccessToken(token);
        setNeedsAuth(false);
      },
      (signedInWithoutToken) => {
        setDriveUser(signedInWithoutToken ?? null);
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );

    const existingToken = getDriveAccessToken();
    if (existingToken) {
      setAccessToken(existingToken);
      setNeedsAuth(false);
      refreshRemoteStatus(existingToken);
    }

    return () => unsubscribe();
  }, [refreshRemoteStatus]);

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setLocalError(null);
    try {
      const result = await googleDriveSignIn();
      setDriveUser(result.user);
      setAccessToken(result.accessToken);
      setNeedsAuth(false);
      await refreshRemoteStatus(result.accessToken);
      onStatusMessage?.({
        type: 'success',
        text: isKo
          ? `Google Drive 연결됨 (${result.user.email || 'Google 계정'})`
          : `Connected to Google Drive (${result.user.email || 'Google Account'})`,
      });
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      const msg = isKo
        ? `Google 로그인 실패: ${err?.message || '팝업이 차단되었거나 취소되었습니다.'}`
        : `Google sign-in failed: ${err?.message || 'Popup was blocked or cancelled.'}`;
      setLocalError(msg);
      onStatusMessage?.({ type: 'error', text: msg });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await googleDriveSignOut();
      setAccessToken(null);
      setDriveUser(null);
      setRemoteMeta(null);
      setSyncPassphrase('');
      setNeedsAuth(true);
      setLocalError(null);
      onStatusMessage?.({
        type: 'success',
        text: isKo
          ? 'Google Drive 연결을 해제했습니다. 로컬 볼트 데이터는 유지됩니다.'
          : 'Disconnected from Google Drive. Your local vault remains intact.',
      });
    } catch (err: any) {
      setLocalError(err?.message || String(err));
    }
  };

  const requireValidTokenAndPassphrase = (): string | null => {
    const token = accessToken || getDriveAccessToken();
    if (!token) {
      setNeedsAuth(true);
      setLocalError(
        isKo
          ? '동기화를 실행하려면 먼저 Google 계정으로 로그인해주세요.'
          : 'Please sign in with Google before syncing.'
      );
      return null;
    }
    if (!syncPassphrase.trim()) {
      setLocalError(
        isKo
          ? '클라우드 암·복호화에 사용할 동기화 비밀번호를 입력해주세요.'
          : 'Please enter your encryption passphrase for cloud sync.'
      );
      return null;
    }
    return token;
  };

  const handleSyncError = (err: unknown) => {
    let message = isKo ? 'Google Drive 동기화 중 오류가 발생했습니다.' : 'Google Drive sync error.';
    if (err instanceof DriveSyncError) {
      if (err.code === 'AUTH_EXPIRED') {
        clearDriveAccessToken();
        setAccessToken(null);
        setNeedsAuth(true);
        message = isKo
          ? 'Google 인증 토큰이 만료되었습니다. 다시 로그인 후 시도해주세요.'
          : 'Google access token expired. Please sign in again.';
      } else {
        message = err.message;
      }
    } else if (err instanceof CryptoBackupError) {
      if (err.code === 'INVALID_PASSPHRASE') {
        message = isKo
          ? '동기화 비밀번호가 일치하지 않습니다. 다른 기기에서 설정한 동일한 비밀번호를 입력해주세요.'
          : 'Passphrase mismatch. Please enter the same passphrase used on your other device.';
      } else if (err.code === 'TAMPERED_PAYLOAD') {
        message = isKo
          ? '클라우드 백업 무결성 검증에 실패했습니다 (데이터 변조 의심).'
          : 'Cloud backup integrity check failed (payload may be tampered).';
      } else {
        message = err.message;
      }
    } else if (err instanceof Error) {
      message = err.message;
    }
    setLocalError(message);
    onStatusMessage?.({ type: 'error', text: message });
  };

  const openConfirmForMutation = async (type: 'two_way' | 'push') => {
    setLocalError(null);
    if (!requireValidTokenAndPassphrase()) return;
    try {
      const snap = await buildVaultSnapshot();
      setConfirmAction({ type, localSummary: summarizeBackupPayload(snap) });
    } catch {
      setConfirmAction({ type, localSummary: null });
    }
  };

  const handleExecuteConfirmedMutation = async () => {
    if (!confirmAction || isBusy) return;
    const token = accessToken || getDriveAccessToken();
    if (!token) {
      setConfirmAction(null);
      setNeedsAuth(true);
      return;
    }

    const actionType = confirmAction.type;
    setConfirmAction(null);
    setLocalError(null);
    setIsBusy(true);

    try {
      if (actionType === 'delete') {
        if (!remoteMeta) return;
        setBusyLabel(isKo ? '클라우드 백업 삭제 중...' : 'Deleting cloud backup...');
        await deleteRemoteVaultBackup(token, remoteMeta.fileId);
        setRemoteMeta(null);
        onStatusMessage?.({
          type: 'success',
          text: isKo
            ? 'Google Drive 앱 전용 공간의 암호화 백업을 삭제했습니다.'
            : 'Deleted encrypted backup from Google Drive app storage.',
        });
        return;
      }

      const pass = syncPassphrase.trim();
      if (!pass) {
        setLocalError(isKo ? '동기화 비밀번호를 입력해주세요.' : 'Enter sync passphrase.');
        return;
      }

      if (actionType === 'push') {
        setBusyLabel(isKo ? 'AES-GCM-256 암호화 및 업로드 중...' : 'Encrypting & uploading...');
        const { remoteMeta: savedMeta, summary } = await syncPushToGoogleDrive(
          token,
          pass,
          remoteMeta?.fileId ?? null
        );
        setRemoteMeta(savedMeta);
        setLastSyncAt(savedMeta.modifiedTime);
        onStatusMessage?.({
          type: 'success',
          text: isKo
            ? `Google Drive 암호화 업로드 완료 (계좌 ${summary.accountCount} · 대출 ${summary.debtCount} · 거래 ${summary.transactionCount} · 장부 ${summary.spaceCount})`
            : `Encrypted upload complete (${summary.accountCount} accounts · ${summary.debtCount} debts · ${summary.transactionCount} txns · ${summary.spaceCount} ledgers)`,
        });
      } else if (actionType === 'two_way') {
        setBusyLabel(isKo ? '양방향 암호화 스마트 동기화 중...' : 'Running two-way E2EE smart sync...');
        const res = await syncTwoWaySmartMergeWithGoogleDrive(
          token,
          pass,
          remoteMeta?.fileId ?? null
        );
        setRemoteMeta(res.remoteMeta);
        setLastSyncAt(res.remoteMeta.modifiedTime);
        if (res.mergeResult) {
          onDataChanged?.();
        }
        const s = res.finalSummary;
        onStatusMessage?.({
          type: 'success',
          text: res.createdInitialRemote
            ? isKo
              ? `최초 Google Drive 암호화 백업 생성 완료 (계좌 ${s.accountCount} · 대출 ${s.debtCount} · 거래 ${s.transactionCount} · 장부 ${s.spaceCount})`
              : `Initial encrypted Google Drive backup created (${s.accountCount} accounts · ${s.debtCount} debts · ${s.transactionCount} txns · ${s.spaceCount} ledgers)`
            : isKo
              ? `양방향 스마트 동기화 완료 · 최종 볼트(계좌 ${s.accountCount} · 대출 ${s.debtCount} · 거래 ${s.transactionCount} · 장부 ${s.spaceCount})`
              : `Two-way smart sync complete · Unified vault (${s.accountCount} accounts · ${s.debtCount} debts · ${s.transactionCount} txns · ${s.spaceCount} ledgers)`,
        });
      }
    } catch (err) {
      handleSyncError(err);
    } finally {
      setIsBusy(false);
      setBusyLabel('');
    }
  };

  const handlePullPreview = async () => {
    setLocalError(null);
    const token = requireValidTokenAndPassphrase();
    if (!token) return;
    if (!remoteMeta) {
      setLocalError(
        isKo
          ? 'Google Drive에 저장된 백업 파일이 없습니다. 먼저 업로드를 실행해주세요.'
          : 'No encrypted backup found in Google Drive yet. Upload from a device first.'
      );
      return;
    }

    setIsBusy(true);
    setBusyLabel(isKo ? '클라우드 백업 다운로드 및 복호화 중...' : 'Downloading & decrypting...');
    try {
      const result = await syncPullAndPreviewFromGoogleDrive(
        token,
        remoteMeta.fileId,
        syncPassphrase.trim()
      );
      if (!result.summary.hasAnyData) {
        setLocalError(
          isKo ? '클라우드 백업에 복원할 데이터가 없습니다.' : 'No restorable data in cloud backup.'
        );
        return;
      }
      setPendingPullData(result);
    } catch (err) {
      handleSyncError(err);
    } finally {
      setIsBusy(false);
      setBusyLabel('');
    }
  };

  const handleApplyPulledSnapshot = async (mode: VaultRestoreMode) => {
    if (!pendingPullData || isBusy) return;
    setIsBusy(true);
    setBusyLabel(isKo ? '볼트 데이터 반영 중...' : 'Applying vault snapshot...');
    try {
      const { stats } = await applyRemoteVaultSnapshot(pendingPullData.payload, mode);
      setPendingPullData(null);
      setLastSyncAt(new Date().toISOString());
      onDataChanged?.();
      onStatusMessage?.({
        type: 'success',
        text:
          mode === 'merge'
            ? isKo
              ? `Drive 스마트 병합 완료 · 계좌 ${stats.assetAccounts.total}개 · 대출 ${stats.debts.total}건 · 거래 +${stats.transactions.added}건(중복 ${stats.transactions.skipped}건 제외)`
              : `Drive smart merge complete · ${stats.assetAccounts.total} accounts · ${stats.debts.total} debts · +${stats.transactions.added} txns (${stats.transactions.skipped} skipped)`
            : isKo
              ? `Drive 전체 덮어쓰기 완료 · 계좌 ${stats.assetAccounts.total}개 · 대출 ${stats.debts.total}건 · 거래 ${stats.transactions.total}건 반영`
              : `Drive overwrite complete · ${stats.assetAccounts.total} accounts · ${stats.debts.total} debts · ${stats.transactions.total} txns restored`,
      });
    } catch (err) {
      handleSyncError(err);
    } finally {
      setIsBusy(false);
      setBusyLabel('');
    }
  };

  return (
    <div className="space-y-2.5 border-b border-white/[0.06] pb-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
          <Cloud size={14} className="text-sky-300 shrink-0" />
          <span>{isKo ? 'Google Drive 암호화 동기화 (Zero-Knowledge)' : 'Google Drive Encrypted Sync (Zero-Knowledge)'}</span>
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-200 border border-sky-500/20 font-medium shrink-0">
          appDataFolder
        </span>
      </div>

      <p className="text-xs text-neutral-300 leading-relaxed font-normal">
        {isKo
          ? '개인 Google Drive의 앱 전용 숨김 공간만 사용하며, 모든 금융 데이터는 기기에서 AES-GCM-256으로 암호화된 상태로만 저장됩니다.'
          : 'Uses only your private Google Drive hidden app storage. All financial data is encrypted with AES-GCM-256 on your device before upload.'}
      </p>

      {needsAuth ? (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2.5">
          {driveUser?.email && (
            <p className="text-xs text-neutral-200">
              {isKo
                ? `보안을 위해 OAuth 토큰은 메모리에만 보관됩니다. ${driveUser.email} 계정으로 다시 인증해주세요.`
                : `For security, access tokens stay in memory only. Re-authenticate ${driveUser.email} to sync.`}
            </p>
          )}

          {/* Official Google Identity Services styled Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoggingIn}
            className="w-full h-10 px-4 rounded-xl bg-white hover:bg-[#f8f9fa] active:scale-[0.99] text-[#1f1f1f] border border-[#747775]/40 font-medium text-xs flex items-center justify-center gap-2.5 transition-all shadow-sm disabled:opacity-60 cursor-pointer"
          >
            <svg
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              className="w-4 h-4 shrink-0 block"
              aria-hidden="true"
            >
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
              <path fill="none" d="M0 0h48v48H0z" />
            </svg>
            <span>
              {isLoggingIn
                ? isKo
                  ? 'Google 계정 연결 중...'
                  : 'Signing in with Google...'
                : isKo
                  ? 'Google 계정으로 로그인 (Sign in with Google)'
                  : 'Sign in with Google'}
            </span>
          </button>

          {lastSyncAt && (
            <div className="text-[11px] text-neutral-400 text-center">
              {isKo ? '마지막 클라우드 동기화:' : 'Last cloud sync:'} {formatSyncDateTime(lastSyncAt, isKo)}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-3">
          {/* Connected Account Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-white truncate">
                <ShieldCheck size={13} className="text-emerald-300 shrink-0" />
                <span className="truncate">{driveUser?.email || (isKo ? 'Google 연결됨' : 'Google Connected')}</span>
              </div>
              <div className="text-[11px] text-neutral-300 mt-0.5">
                {isCheckingRemote
                  ? isKo
                    ? '클라우드 백업 확인 중...'
                    : 'Checking cloud backup...'
                  : remoteMeta
                    ? isKo
                      ? `클라우드 백업 있음 · ${formatSyncDateTime(remoteMeta.modifiedTime, isKo)} (${formatBytes(remoteMeta.sizeBytes)})`
                      : `Cloud backup ready · ${formatSyncDateTime(remoteMeta.modifiedTime, isKo)} (${formatBytes(remoteMeta.sizeBytes)})`
                    : isKo
                      ? '클라우드 백업 없음 · 첫 업로드를 실행하세요'
                      : 'No cloud backup yet · Upload to start syncing'}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={isCheckingRemote || isBusy}
                onClick={() => accessToken && refreshRemoteStatus(accessToken)}
                title={isKo ? '클라우드 상태 새로고침' : 'Refresh cloud status'}
                aria-label={isKo ? '클라우드 상태 새로고침' : 'Refresh cloud status'}
                className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-neutral-200 hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
              >
                <RefreshCw size={12} className={isCheckingRemote ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={handleGoogleSignOut}
                title={isKo ? '연결 해제' : 'Disconnect'}
                aria-label={isKo ? '연결 해제' : 'Disconnect'}
                className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-neutral-200 hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
              >
                <LogOut size={12} />
              </button>
            </div>
          </div>

          {/* Non-PII Remote Snapshot Counts */}
          {remoteMeta && (
            <div className="grid grid-cols-4 gap-1.5 rounded-lg border border-white/[0.06] bg-black/25 p-2 text-center">
              <div>
                <div className="text-xs font-semibold text-white tabular-nums">
                  {remoteMeta.accountCount ?? '—'}
                </div>
                <div className="text-[11px] text-neutral-300">{isKo ? '계좌' : 'Accounts'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-white tabular-nums">
                  {remoteMeta.debtCount ?? '—'}
                </div>
                <div className="text-[11px] text-neutral-300">{isKo ? '대출/정산' : 'Debts'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-white tabular-nums">
                  {remoteMeta.transactionCount ?? '—'}
                </div>
                <div className="text-[11px] text-neutral-300">{isKo ? '거래' : 'Txns'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-white tabular-nums">
                  {remoteMeta.spaceCount ?? '—'}
                </div>
                <div className="text-[11px] text-neutral-300">{isKo ? '장부' : 'Ledgers'}</div>
              </div>
            </div>
          )}

          {/* Ephemeral Sync Passphrase Input */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-neutral-200 flex items-center gap-1">
              <Lock size={11} className="text-sky-300" />
              <span>
                {isKo
                  ? '동기화 암호화 비밀번호 (기기 간 동일하게 입력 · 서버 미전송)'
                  : 'Sync Encryption Passphrase (same across devices · never sent to server)'}
              </span>
            </label>
            <input
              type="password"
              value={syncPassphrase}
              onChange={(e) => {
                setSyncPassphrase(e.target.value);
                if (localError) setLocalError(null);
              }}
              disabled={isBusy}
              placeholder={isKo ? '암·복호화 비밀번호 입력' : 'Enter sync passphrase'}
              className="w-full px-3 py-2 rounded-xl text-xs border outline-none bg-white/[0.03] border-white/[0.08] text-white placeholder:text-neutral-400 focus:border-white/25"
            />
          </div>

          {/* Primary Action: Two-Way Smart Sync */}
          <button
            type="button"
            disabled={isBusy || !syncPassphrase.trim()}
            onClick={() => openConfirmForMutation('two_way')}
            className="w-full py-2.5 px-3 rounded-xl bg-white text-black hover:bg-neutral-100 disabled:bg-white/30 disabled:text-black font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
          >
            <RefreshCw size={13} className={isBusy ? 'animate-spin' : ''} />
            <span>
              {isBusy
                ? busyLabel
                : isKo
                  ? '양방향 스마트 동기화 (병합 후 암호화 업로드)'
                  : 'Two-Way Smart Sync (Merge & Upload)'}
            </span>
          </button>

          {/* Secondary Actions: Manual Push / Pull / Delete */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isBusy || !syncPassphrase.trim()}
              onClick={() => openConfirmForMutation('push')}
              className="py-2 px-2.5 rounded-xl text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-white disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Upload size={12} />
              <span>{isKo ? 'Drive에 업로드' : 'Upload to Drive'}</span>
            </button>

            <button
              type="button"
              disabled={isBusy || !syncPassphrase.trim() || !remoteMeta}
              onClick={handlePullPreview}
              className="py-2 px-2.5 rounded-xl text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-white disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download size={12} />
              <span>{isKo ? 'Drive에서 복원' : 'Restore from Drive'}</span>
            </button>
          </div>

          {remoteMeta && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setConfirmAction({ type: 'delete' })}
              className="w-full py-1.5 px-2.5 rounded-lg text-[11px] font-medium text-neutral-300 hover:text-amber-200 hover:bg-white/[0.04] flex items-center justify-center gap-1 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Trash2 size={11} />
              <span>{isKo ? 'Google Drive 클라우드 백업 삭제' : 'Delete Cloud Backup from Drive'}</span>
            </button>
          )}
        </div>
      )}

      {localError && (
        <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 flex items-start gap-1.5">
          <AlertTriangle size={13} className="text-amber-300 shrink-0 mt-0.5" />
          <span>{localError}</span>
        </div>
      )}

      {/* Mandatory Confirmation Modal for Drive Mutations (Two-Way Update, Push Overwrite, Delete) */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setConfirmAction(null)}
        >
          <div
            className="w-full max-w-sm border border-white/[0.08] rounded-2xl p-6 space-y-4 shadow-2xl bg-[#0E1015] text-white antialiased"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold tracking-tight text-white">
                {confirmAction.type === 'delete'
                  ? isKo
                    ? 'Google Drive 클라우드 백업 삭제'
                    : 'Delete Google Drive Backup?'
                  : confirmAction.type === 'push'
                    ? isKo
                      ? 'Google Drive 암호화 백업 업로드 확인'
                      : 'Confirm Google Drive Upload'
                    : isKo
                      ? 'Google Drive 양방향 스마트 동기화 확인'
                      : 'Confirm Two-Way Smart Sync'}
              </h3>
              <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                {confirmAction.type === 'delete'
                  ? isKo
                    ? `Google Drive 앱 전용 공간에 저장된 암호화 백업 파일(${DRIVE_SYNC_FILENAME})을 영구 삭제합니다. 현재 기기의 로컬 데이터는 삭제되지 않습니다.`
                    : `This will permanently delete '${DRIVE_SYNC_FILENAME}' from your Google Drive app storage. Your local device data will not be deleted.`
                  : confirmAction.type === 'push'
                    ? isKo
                      ? remoteMeta
                        ? `현재 기기의 전체 볼트 데이터를 AES-GCM-256으로 암호화해 Google Drive의 기존 백업 파일(${DRIVE_SYNC_FILENAME})을 덮어씁니다.`
                        : `현재 기기의 전체 볼트 데이터를 AES-GCM-256으로 암호화해 Google Drive 앱 전용 공간에 새 백업 파일(${DRIVE_SYNC_FILENAME})을 생성합니다.`
                      : remoteMeta
                        ? `Encrypts this device's full vault with AES-GCM-256 and overwrites '${DRIVE_SYNC_FILENAME}' in Google Drive.`
                        : `Encrypts this device's full vault with AES-GCM-256 and creates '${DRIVE_SYNC_FILENAME}' in your Google Drive app storage.`
                    : isKo
                      ? remoteMeta
                        ? `Google Drive의 기존 백업(${DRIVE_SYNC_FILENAME})을 복호화해 이 기기 데이터와 중복 없이 스마트 병합한 뒤, 최신 통합 스냅샷으로 Drive 파일을 업데이트합니다.`
                        : `Google Drive에 아직 백업이 없어 현재 기기의 전체 볼트를 암호화해 첫 클라우드 백업(${DRIVE_SYNC_FILENAME})을 생성합니다.`
                      : remoteMeta
                        ? `Decrypts '${DRIVE_SYNC_FILENAME}' from Google Drive, smart-merges it with this device, and updates the encrypted file in Drive.`
                        : `Creates your initial encrypted cloud backup '${DRIVE_SYNC_FILENAME}' in Google Drive from this device's vault.`}
              </p>
            </div>

            {confirmAction.type !== 'delete' && confirmAction.localSummary && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5 text-xs text-neutral-200 flex items-center justify-between">
                <span>{isKo ? '현재 기기 볼트' : 'Local vault'}</span>
                <span className="font-medium text-white tabular-nums">
                  {isKo
                    ? `계좌 ${confirmAction.localSummary.accountCount} · 대출 ${confirmAction.localSummary.debtCount} · 거래 ${confirmAction.localSummary.transactionCount} · 장부 ${confirmAction.localSummary.spaceCount}`
                    : `${confirmAction.localSummary.accountCount} accts · ${confirmAction.localSummary.debtCount} debts · ${confirmAction.localSummary.transactionCount} txns`}
                </span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-neutral-100 hover:bg-white/[0.07] text-xs font-medium transition-colors cursor-pointer"
              >
                {isKo ? '취소' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleExecuteConfirmedMutation}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-xs transition-all active:scale-95 cursor-pointer ${
                  confirmAction.type === 'delete'
                    ? 'bg-amber-400 text-black hover:bg-amber-300'
                    : 'bg-white text-black hover:bg-neutral-100'
                }`}
              >
                {confirmAction.type === 'delete'
                  ? isKo
                    ? '영구 삭제'
                    : 'Delete'
                  : isKo
                    ? '확인 및 실행'
                    : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Applying Decrypted Remote Drive Backup Locally */}
      {pendingPullData && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => !isBusy && setPendingPullData(null)}
        >
          <div
            className="w-full max-w-sm border border-white/[0.08] rounded-2xl p-6 space-y-4 shadow-2xl bg-[#0E1015] text-white antialiased"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold tracking-tight text-white">
                {isKo ? 'Google Drive 백업 복원 방식' : 'Restore from Google Drive'}
              </h3>
              <p className="text-xs text-neutral-300 mt-0.5">
                {isKo
                  ? `복호화 완료 · 스냅샷 v${pendingPullData.summary.version}`
                  : `Decrypted · Snapshot v${pendingPullData.summary.version}`}
              </p>
            </div>

            <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5 text-center">
              <div>
                <div className="text-xs font-semibold text-white tabular-nums">
                  {pendingPullData.summary.accountCount}
                </div>
                <div className="text-[11px] text-neutral-300">{isKo ? '계좌' : 'Accounts'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-white tabular-nums">
                  {pendingPullData.summary.debtCount}
                </div>
                <div className="text-[11px] text-neutral-300">{isKo ? '대출/정산' : 'Debts'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-white tabular-nums">
                  {pendingPullData.summary.transactionCount}
                </div>
                <div className="text-[11px] text-neutral-300">{isKo ? '거래' : 'Txns'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-white tabular-nums">
                  {pendingPullData.summary.spaceCount}
                </div>
                <div className="text-[11px] text-neutral-300">{isKo ? '장부' : 'Ledgers'}</div>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleApplyPulledSnapshot('merge')}
                className="w-full p-3 rounded-xl border border-white/15 bg-white/[0.05] hover:bg-white/[0.09] text-white text-left transition-all flex flex-col gap-1 cursor-pointer"
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-white">
                  <CheckCircle2 size={14} />
                  <span>{isKo ? '스마트 중복 제외 병합 (권장)' : 'Smart Deduplicated Merge (Recommended)'}</span>
                </div>
                <span className="text-xs text-neutral-200 font-normal">
                  {isKo
                    ? '이 기기의 데이터를 유지하면서 Drive 백업과 중복 없이 합칩니다.'
                    : 'Keeps local data and merges Drive items by ID & latest timestamp.'}
                </span>
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleApplyPulledSnapshot('overwrite')}
                className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] text-white text-left transition-all flex flex-col gap-1 cursor-pointer"
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-300">
                  <AlertTriangle size={14} />
                  <span>{isKo ? '이 기기 전체 덮어쓰기' : 'Overwrite This Device'}</span>
                </div>
                <span className="text-xs text-neutral-200 font-normal">
                  {isKo
                    ? '이 기기의 로컬 볼트를 Drive 백업 상태로 완전히 교체합니다.'
                    : 'Replaces all local vault data on this device with the Drive backup.'}
                </span>
              </button>
            </div>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => setPendingPullData(null)}
              className="w-full py-2 rounded-xl text-xs font-medium text-neutral-200 hover:text-white transition-colors cursor-pointer"
            >
              {isKo ? '복원 취소' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoogleDriveSyncCard;
