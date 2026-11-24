import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, UploadCloud, X } from 'lucide-react';
import { AssetAccount, AssetCategoryType, SupportedCurrency } from '../../types';
import { formatCurrency, getAIEngineConfig, getAssetCategoryKo } from '../../utils';
import { assertCloudScanSource } from '../../scanValidation';
import { generateSecureId } from '../../identifiers';
import { TrackedCreditCard, VaultAssetCategoryMeta } from './VaultAccountList';

export interface VaultActionModalsProps {
  isLight: boolean;
  currentCurrency: SupportedCurrency;
  accounts: AssetAccount[];
  assetCategories: VaultAssetCategoryMeta[];
  showToast: (message: string, type?: 'success' | 'error') => void;
  // Quick Balance Edit Modal
  editingBalanceAccount: AssetAccount | null;
  onCloseEditBalance: () => void;
  onSaveQuickBalance: (account: AssetAccount, newBalance: number) => Promise<void>;
  // Screenshot Scan Modal
  showScanModal: boolean;
  onCloseScanModal: () => void;
  onSaveScannedAsset: (account: AssetAccount, isNew: boolean) => Promise<void>;
  // Add Account Modal
  showAddModal: boolean;
  onCloseAddModal: () => void;
  onCreateAccount: (account: AssetAccount) => Promise<void>;
  // Delete Confirmation Modal
  deletingAccount: { id: string; name: string } | null;
  onCloseDeleteModal: () => void;
  onConfirmDeleteAccount: () => Promise<void>;
  // Credit Card Reconciliation Modal
  reconcilingCard: TrackedCreditCard | null;
  onCloseReconcileModal: () => void;
  onApplyReconciliation: (card: TrackedCreditCard, targetAmount: number) => Promise<void>;
}

interface NewAccountFormState {
  institution: string;
  accountName: string;
  assetType: AssetCategoryType;
  balance: string;
  currency: SupportedCurrency;
  note: string;
  isOverdraft: boolean;
  overdraftLimit: string;
}

const createInitialAccountForm = (currency: SupportedCurrency): NewAccountFormState => ({
  institution: '토스증권',
  accountName: '',
  assetType: 'BROKERAGE',
  balance: '',
  currency,
  note: '',
  isOverdraft: false,
  overdraftLimit: '',
});

export const VaultActionModals: React.FC<VaultActionModalsProps> = React.memo(({
  isLight,
  currentCurrency,
  accounts,
  assetCategories,
  showToast,
  editingBalanceAccount,
  onCloseEditBalance,
  onSaveQuickBalance,
  showScanModal,
  onCloseScanModal,
  onSaveScannedAsset,
  showAddModal,
  onCloseAddModal,
  onCreateAccount,
  deletingAccount,
  onCloseDeleteModal,
  onConfirmDeleteAccount,
  reconcilingCard,
  onCloseReconcileModal,
  onApplyReconciliation,
}) => {
  // Quick balance input state (isolated so keystrokes don't re-render the Vault dashboard)
  const [newBalanceInput, setNewBalanceInput] = useState<string>('');
  useEffect(() => {
    if (editingBalanceAccount) {
      setNewBalanceInput(editingBalanceAccount.currentBalance.toString());
    }
  }, [editingBalanceAccount]);

  // Credit card reconciliation input state
  const [reconcileTargetInput, setReconcileTargetInput] = useState<string>('');
  useEffect(() => {
    if (reconcilingCard) {
      setReconcileTargetInput(reconcilingCard.unpaidLiability.toString());
    }
  }, [reconcilingCard]);

  // New Account form state
  const [newAccountForm, setNewAccountForm] = useState<NewAccountFormState>(() =>
    createInitialAccountForm(currentCurrency)
  );
  useEffect(() => {
    if (showAddModal) {
      setNewAccountForm((prev) => ({ ...prev, currency: currentCurrency }));
    }
  }, [showAddModal, currentCurrency]);

  // AI Screenshot OCR state
  const [isScanning, setIsScanning] = useState(false);
  const [scannedResult, setScannedResult] = useState<any | null>(null);
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanTargetAccountId, setScanTargetAccountId] = useState<string>('new');
  const [isScreenshotDraggingOver, setIsScreenshotDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenshotDragCounterRef = useRef<number>(0);

  const resetScanModal = useCallback(() => {
    onCloseScanModal();
    setScannedResult(null);
    setScanPreviewUrl(null);
  }, [onCloseScanModal]);

  // Handle Screenshot Upload with Pixel Sanitization & Canvas Downscaling
  const processScreenshotFile = useCallback(async (file: File) => {
    setIsScanning(true);
    setScannedResult(null);

    const { sanitizeAndProcessImage, ImageSanitizationError } = await import('../../imageSanitizer');

    try {
      const sanitized = await sanitizeAndProcessImage(file, {
        maxDimension: 1280,
        quality: 0.8,
        preferredMime: 'image/webp',
      });

      setScanPreviewUrl(sanitized.dataUrl);

      const engineConfig = getAIEngineConfig();
      const res = await fetch('/api/parse-asset-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: sanitized.dataUrl,
          mimeType: sanitized.mimeType,
          engineConfig,
        }),
      });

      if (!res.ok) {
        throw new Error('자산 스크린샷 분석에 실패했습니다.');
      }

      const data = await res.json();
      assertCloudScanSource(
        data.source,
        '이미지에서 확인된 잔고가 없습니다. 잔고를 직접 입력해주세요.'
      );
      if (data?.asset) {
        setScannedResult(data.asset);
        const match = accounts.find(
          (a) =>
            a.institution.toLowerCase().includes(data.asset.institution.toLowerCase()) ||
            data.asset.institution.toLowerCase().includes(a.institution.toLowerCase())
        );
        setScanTargetAccountId(match ? match.id : 'new');
      }
    } catch (err: unknown) {
      console.error('Scan error:', err);
      if (err instanceof ImageSanitizationError) {
        let msg = err.message;
        if (err.code === 'SVG_XSS_DETECTED') {
          msg =
            'SVG 및 스크립트 벡터 형식은 XSS 보안 방지를 위해 차단되었습니다. 안전한 JPG, PNG, WebP 사진을 사용해주세요.';
        } else if (err.code === 'FILE_TOO_LARGE') {
          msg = '파일 용량이 너무 큽니다 (최대 15MB 제한).';
        }
        showToast(msg, 'error');
      } else {
        showToast(
          err instanceof Error ? err.message : '스크린샷 OCR 분석 중 오류가 발생했습니다.',
          'error'
        );
      }
    } finally {
      setIsScanning(false);
    }
  }, [accounts, showToast]);

  // Clipboard Paste listener for Screenshot OCR Modal
  useEffect(() => {
    if (!showScanModal) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;
      const hasImageItem = Array.from(items).some((it) => it.type.startsWith('image/'));
      if (hasImageItem) {
        e.preventDefault();
      }
      const { extractImageFileFromClipboard } = await import('../../imageSanitizer');
      const file = extractImageFileFromClipboard(e);
      if (file) {
        processScreenshotFile(file);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [showScanModal, processScreenshotFile]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processScreenshotFile(file);
  };

  const handleScreenshotDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    screenshotDragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsScreenshotDraggingOver(true);
    }
  };

  const handleScreenshotDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isScreenshotDraggingOver) {
      setIsScreenshotDraggingOver(true);
    }
  };

  const handleScreenshotDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    screenshotDragCounterRef.current = Math.max(0, screenshotDragCounterRef.current - 1);
    if (screenshotDragCounterRef.current === 0) {
      setIsScreenshotDraggingOver(false);
    }
  };

  const handleScreenshotDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsScreenshotDraggingOver(false);
    screenshotDragCounterRef.current = 0;

    const { extractImageFileFromDataTransfer } = await import('../../imageSanitizer');
    const file = extractImageFileFromDataTransfer(e.dataTransfer);
    if (file) {
      processScreenshotFile(file);
    } else {
      showToast('유효한 이미지 파일(JPG, PNG, WebP)만 업로드할 수 있습니다.', 'error');
    }
  };

  const handleConfirmScannedAsset = async () => {
    if (!scannedResult) return;

    if (scanTargetAccountId === 'new') {
      const newAcc: AssetAccount = {
        id: generateSecureId('acc'),
        institution: scannedResult.institution || '기타 금융기관',
        accountName: scannedResult.accountName || '스캔된 자산 계좌',
        assetType: scannedResult.assetType || 'BROKERAGE',
        currentBalance: scannedResult.currentBalance || 0,
        cashBalance: scannedResult.cashBalance,
        investedAssets: scannedResult.investedAssets,
        currency: scannedResult.currency || currentCurrency,
        lastUpdated: new Date().toISOString(),
        holdings: scannedResult.holdings,
        note: scannedResult.notes || 'AI 스크린샷 자동 파싱',
      };
      await onSaveScannedAsset(newAcc, true);
    } else {
      const target = accounts.find((a) => a.id === scanTargetAccountId);
      if (target) {
        const updatedTarget: AssetAccount = {
          ...target,
          currentBalance: scannedResult.currentBalance,
          cashBalance:
            scannedResult.cashBalance !== undefined ? scannedResult.cashBalance : target.cashBalance,
          investedAssets:
            scannedResult.investedAssets !== undefined
              ? scannedResult.investedAssets
              : target.investedAssets,
          holdings:
            scannedResult.holdings && scannedResult.holdings.length > 0
              ? scannedResult.holdings
              : target.holdings,
          lastUpdated: new Date().toISOString(),
        };
        await onSaveScannedAsset(updatedTarget, false);
      }
    }

    resetScanModal();
  };

  const handleQuickBalanceSubmit = async () => {
    if (!editingBalanceAccount) return;
    const num = parseFloat(newBalanceInput.replace(/,/g, ''));
    if (isNaN(num)) {
      showToast('올바른 금액을 입력해주세요.', 'error');
      return;
    }
    await onSaveQuickBalance(editingBalanceAccount, num);
  };

  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountForm.accountName.trim() || !newAccountForm.institution.trim()) {
      showToast('기관명과 계좌명을 입력해주세요.', 'error');
      return;
    }

    const balanceNum = parseFloat(newAccountForm.balance.replace(/,/g, '')) || 0;
    const rawLimit = newAccountForm.overdraftLimit
      ? parseFloat(newAccountForm.overdraftLimit.replace(/,/g, ''))
      : undefined;
    const overdraftLimitNum = rawLimit !== undefined && !isNaN(rawLimit) ? rawLimit : undefined;
    const isOverdraftAccount =
      newAccountForm.isOverdraft ||
      balanceNum < 0 ||
      /(?:마통|마이너스|한도대출)/i.test(newAccountForm.accountName);

    const newAcc: AssetAccount = {
      id: generateSecureId('acc'),
      institution: newAccountForm.institution.trim(),
      accountName: newAccountForm.accountName.trim(),
      assetType: newAccountForm.assetType,
      currentBalance: balanceNum,
      currency: newAccountForm.currency,
      lastUpdated: new Date().toISOString(),
      note: newAccountForm.note.trim() || undefined,
      isOverdraft: isOverdraftAccount,
      overdraftLimit: overdraftLimitNum,
    };

    await onCreateAccount(newAcc);
    setNewAccountForm(createInitialAccountForm(currentCurrency));
  };

  const handleReconcileSubmit = async () => {
    if (!reconcilingCard) return;
    const targetNum = parseFloat(reconcileTargetInput.replace(/,/g, ''));
    if (isNaN(targetNum) || targetNum < 0) {
      showToast('올바른 조정 금액을 입력해주세요.', 'error');
      return;
    }
    await onApplyReconciliation(reconcilingCard, targetNum);
  };

  if (typeof document === 'undefined') return null;

  return (
    <>
      {/* QUICK BALANCE EDIT MODAL */}
      {editingBalanceAccount &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-0 sm:p-4"
            onClick={onCloseEditBalance}
          >
            <div
              className={`w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-white/[0.08] shadow-2xl overflow-hidden transition-colors antialiased animate-in slide-in-from-bottom-6 duration-200 ${
                isLight
                  ? 'bg-white text-slate-900 border-slate-200 shadow-slate-300/40'
                  : 'bg-[var(--surface-card)] text-neutral-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 bg-white/20" />

              <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
                <div>
                  <h3 className={`text-base font-semibold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {editingBalanceAccount.accountName}
                  </h3>
                  <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-neutral-300'}`}>
                    {editingBalanceAccount.institution} 잔고 수정
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCloseEditBalance}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  aria-label="닫기"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                    새 잔고 금액 ({editingBalanceAccount.currency || currentCurrency})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newBalanceInput}
                    onChange={(e) => setNewBalanceInput(e.target.value)}
                    className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all tabular-nums"
                    placeholder="0"
                    autoFocus
                  />
                </div>

                {/* Quick Add Presets */}
                <div className="flex items-center gap-1.5">
                  {[100000, 500000, 1000000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        const cur = parseFloat(newBalanceInput) || 0;
                        setNewBalanceInput((cur + preset).toString());
                      }}
                      className="px-2.5 py-1 rounded-full text-xs font-normal bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 transition-colors cursor-pointer"
                    >
                      +{preset >= 10000 ? `${preset / 10000}만` : preset}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setNewBalanceInput('0')}
                    className="px-2.5 py-1 rounded-full text-xs font-normal bg-white/[0.04] text-neutral-300 border border-white/[0.08] hover:text-white ml-auto transition-colors cursor-pointer"
                  >
                    초기화
                  </button>
                </div>

                <div className="flex items-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={onCloseEditBalance}
                    className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleQuickBalanceSubmit}
                    className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-sm font-semibold transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                  >
                    잔고 저장
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* GEMINI MULTIMODAL SCREENSHOT SCANNER MODAL */}
      {showScanModal &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-0 sm:p-4"
            onClick={resetScanModal}
          >
            <div
              className={`w-full max-w-md max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-white/[0.08] shadow-2xl overflow-hidden transition-colors antialiased animate-in slide-in-from-bottom-6 duration-200 ${
                isLight
                  ? 'bg-white text-slate-900 border-slate-200 shadow-slate-300/40'
                  : 'bg-[var(--surface-card)] text-neutral-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 bg-white/20" />

              <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] shrink-0">
                <div>
                  <h3 className={`text-base font-semibold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    계좌/증권 잔고 캡처 스캔
                  </h3>
                  <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-neutral-300'}`}>
                    Gemini 멀티모달 AI가 스크린샷에서 잔고를 자동 추출합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetScanModal}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  aria-label="닫기"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto">
                {!scannedResult ? (
                  <div className="space-y-4">
                    <div
                      onDragEnter={handleScreenshotDragEnter}
                      onDragOver={handleScreenshotDragOver}
                      onDragLeave={handleScreenshotDragLeave}
                      onDrop={handleScreenshotDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                        isScreenshotDraggingOver ? 'border-white/40 bg-white/[0.06] scale-[1.01]' : ''
                      }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                        className="hidden"
                      />

                      {isScanning ? (
                        <div className="py-6 flex flex-col items-center gap-3">
                          <Loader2 size={30} className="animate-spin text-white" />
                          <span className="text-sm font-semibold text-white">
                            Gemini 3.8 Flash가 계좌 잔고를 분석하고 있습니다...
                          </span>
                          <span className="text-xs text-neutral-400">
                            (1280px 자동 압축 · 메타데이터 자동 제거 완료)
                          </span>
                        </div>
                      ) : scanPreviewUrl ? (
                        <div className="relative w-full max-h-48 overflow-hidden rounded-xl">
                          <img src={scanPreviewUrl} alt="Preview" className="w-full object-cover" />
                        </div>
                      ) : (
                        <>
                          <div
                            className={`w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] text-neutral-300 flex items-center justify-center mx-auto mb-3 transition-transform ${
                              isScreenshotDraggingOver ? 'scale-110' : ''
                            }`}
                          >
                            <UploadCloud
                              size={20}
                              className={isScreenshotDraggingOver ? 'animate-bounce' : ''}
                            />
                          </div>
                          <p className="text-sm font-semibold text-white">
                            {isScreenshotDraggingOver
                              ? '여기에 스크린샷을 놓으세요'
                              : '토스증권, 카카오페이증권, 은행 앱 캡처 업로드'}
                          </p>
                          <p className="text-xs text-neutral-400 mt-1">
                            드래그 앤 드롭 · 파일 선택 · 클립보드 붙여넣기(Cmd+V) 지원 (최대 15MB)
                          </p>
                        </>
                      )}
                    </div>

                    <p className="text-[11px] text-neutral-400 text-center mt-3">
                      이미지에 보이는 개인정보는 자동 마스킹되지 않습니다. 클라우드 OCR 사용 전 직접 가려주세요.
                    </p>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={resetScanModal}
                        className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                          <Check size={14} /> AI 잔고 감지 완료
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-neutral-300 font-medium">
                          정확도 {Math.round(scannedResult.confidenceScore * 100)}%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <div>
                          <span className="text-[10px] text-neutral-400 block">금융기관</span>
                          <span className="text-xs font-semibold text-white">{scannedResult.institution}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-neutral-400 block">계좌명</span>
                          <span className="text-xs font-semibold text-white">{scannedResult.accountName}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-neutral-400 block">자산 유형</span>
                          <span className="text-xs font-semibold text-white">
                            {getAssetCategoryKo(scannedResult.assetType)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-neutral-400 block">추출된 총 잔고</span>
                          <span className="text-sm font-semibold text-white">
                            {formatCurrency(
                              scannedResult.currentBalance,
                              scannedResult.currency || currentCurrency
                            )}
                          </span>
                        </div>
                      </div>

                      {(scannedResult.cashBalance !== undefined ||
                        scannedResult.investedAssets !== undefined) && (
                        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/[0.06] text-xs">
                          {scannedResult.investedAssets !== undefined && (
                            <div>
                              <span className="text-[10px] text-neutral-400 block">투자 자산 평가액</span>
                              <span className="font-semibold text-emerald-400">
                                {formatCurrency(
                                  scannedResult.investedAssets,
                                  scannedResult.currency || currentCurrency
                                )}
                              </span>
                            </div>
                          )}
                          {scannedResult.cashBalance !== undefined && (
                            <div>
                              <span className="text-[10px] text-neutral-400 block">예수금 / 현금</span>
                              <span className="font-semibold text-sky-400">
                                {formatCurrency(
                                  scannedResult.cashBalance,
                                  scannedResult.currency || currentCurrency
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {scannedResult.holdings && scannedResult.holdings.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-white/[0.06]">
                          <span className="text-[10px] text-neutral-400 block mb-1">
                            인식된 보유 종목 ({scannedResult.holdings.length})
                          </span>
                          <div className="text-[11px] space-y-0.5 text-neutral-300">
                            {scannedResult.holdings.slice(0, 3).map((h: any, i: number) => (
                              <div key={i} className="flex justify-between">
                                <span>{h.name}</span>
                                <span className="font-medium text-white">
                                  {formatCurrency(h.valuation, currentCurrency)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                        반영할 대상 계좌 선택
                      </label>
                      <select
                        value={scanTargetAccountId}
                        onChange={(e) => setScanTargetAccountId(e.target.value)}
                        className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white focus:border-white/25 focus:ring-0 outline-none transition-all cursor-pointer"
                      >
                        <option value="new" className="bg-[var(--surface-card)] text-white">
                          + 신규 계좌로 등록하기
                        </option>
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id} className="bg-[var(--surface-card)] text-white">
                            {acc.institution} - {acc.accountName} (기존 ₩{acc.currentBalance.toLocaleString()})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => setScannedResult(null)}
                        className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
                      >
                        다시 스캔
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmScannedAsset}
                        className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-sm font-semibold transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                      >
                        잔고 반영 확정
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ADD ACCOUNT MODAL */}
      {showAddModal &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-0 sm:p-4"
            onClick={onCloseAddModal}
          >
            <div
              className={`w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-white/[0.08] shadow-2xl flex flex-col max-h-[85dvh] sm:max-h-[88dvh] overflow-hidden transition-colors antialiased animate-in slide-in-from-bottom-6 duration-200 ${
                isLight
                  ? 'bg-white text-slate-900 border-slate-200 shadow-slate-300/40'
                  : 'bg-[var(--surface-card)] text-neutral-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 bg-white/20" />

              <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] shrink-0">
                <div>
                  <h3 className={`text-base font-semibold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    새 자산 계좌 추가
                  </h3>
                  <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-neutral-300'}`}>
                    증권, 은행, 가상자산, 부동산 등
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCloseAddModal}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  aria-label="닫기"
                  title="닫기"
                >
                  <X size={17} />
                </button>
              </div>

              <form onSubmit={handleCreateAccountSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 space-y-4 overscroll-contain">
                  <div>
                    <label className="text-xs font-medium text-neutral-400 mb-1.5 block">자산 유형</label>
                    <select
                      value={newAccountForm.assetType}
                      onChange={(e) =>
                        setNewAccountForm({
                          ...newAccountForm,
                          assetType: e.target.value as AssetCategoryType,
                        })
                      }
                      className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white focus:border-white/25 focus:ring-0 outline-none transition-all cursor-pointer"
                    >
                      {assetCategories.map((c) => (
                        <option key={c.type} value={c.type} className="bg-[var(--surface-card)] text-white">
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-neutral-400 mb-1.5 block">기관명</label>
                    <input
                      type="text"
                      value={newAccountForm.institution}
                      onChange={(e) => setNewAccountForm({ ...newAccountForm, institution: e.target.value })}
                      placeholder="토스증권, 카카오페이증권, 업비트 등"
                      required
                      className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                      계좌명 / 포트폴리오 별칭
                    </label>
                    <input
                      type="text"
                      value={newAccountForm.accountName}
                      onChange={(e) => {
                        const val = e.target.value;
                        const isOver = /(?:마통|마이너스|한도대출)/i.test(val);
                        setNewAccountForm({
                          ...newAccountForm,
                          accountName: val,
                          isOverdraft: isOver || newAccountForm.isOverdraft,
                        });
                      }}
                      placeholder="해외주식 종합계좌, 마이너스 통장 등"
                      required
                      className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all"
                    />
                  </div>

                  <div className="pt-0.5 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newAccountForm.isOverdraft}
                        onChange={(e) =>
                          setNewAccountForm({ ...newAccountForm, isOverdraft: e.target.checked })
                        }
                        className="rounded border-white/20 bg-white/5 text-sky-400 focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs text-neutral-300 font-medium">
                        마이너스 통장 (한도대출 계좌)
                      </span>
                    </label>

                    {newAccountForm.isOverdraft && (
                      <div>
                        <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                          마이너스 대출 한도액 ({currentCurrency}, 선택)
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={newAccountForm.overdraftLimit}
                          onChange={(e) =>
                            setNewAccountForm({ ...newAccountForm, overdraftLimit: e.target.value })
                          }
                          placeholder="예: 30000000"
                          className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all tabular-nums font-mono"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                      현재 잔고 / 평가액 ({currentCurrency})
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={newAccountForm.balance}
                      onChange={(e) => {
                        const val = e.target.value;
                        const num = parseFloat(val);
                        setNewAccountForm({
                          ...newAccountForm,
                          balance: val,
                          isOverdraft: (!isNaN(num) && num < 0) || newAccountForm.isOverdraft,
                        });
                      }}
                      placeholder="10000000 (마통 대출 잔액은 -3500000 처럼 음수 입력 가능)"
                      required
                      className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all tabular-nums font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-neutral-400 mb-1.5 block">메모 (선택)</label>
                    <input
                      type="text"
                      value={newAccountForm.note}
                      onChange={(e) => setNewAccountForm({ ...newAccountForm, note: e.target.value })}
                      placeholder="S&P 500, 배당주 위주"
                      className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2.5 px-6 py-4 border-t border-white/[0.06] shrink-0">
                  <button
                    type="button"
                    onClick={onCloseAddModal}
                    className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-sm font-semibold transition-all shadow-sm active:scale-[0.99] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check size={16} />
                    계좌 추가
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* DELETE ACCOUNT CONFIRMATION MODAL */}
      {deletingAccount &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
            onClick={onCloseDeleteModal}
          >
            <div
              className={`w-full max-w-sm rounded-3xl border border-white/[0.08] p-6 shadow-2xl space-y-4 antialiased animate-in zoom-in-95 duration-150 ${
                isLight ? 'bg-white text-slate-900 border-slate-200' : 'bg-[var(--surface-card)] text-neutral-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <h3 className={`text-base font-semibold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  자산 계좌 삭제
                </h3>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-neutral-300'}`}>
                  계좌 잔고 및 연결 데이터 제거
                </p>
              </div>
              <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-neutral-300'}`}>
                <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  '{deletingAccount.name}'
                </span>{' '}
                계좌를 삭제하시겠습니까? 계좌 잔고 및 연결 데이터가 목록에서 완전히 제외됩니다.
              </p>
              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onCloseDeleteModal}
                  className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={onConfirmDeleteAccount}
                  className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.08] hover:bg-white/[0.12] text-white text-sm font-medium transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                >
                  삭제하기
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* CREDIT CARD RECONCILIATION MODAL */}
      {reconcilingCard &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-0 sm:p-4"
            onClick={onCloseReconcileModal}
          >
            <div
              className={`w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-white/[0.08] shadow-2xl overflow-hidden transition-colors antialiased animate-in slide-in-from-bottom-6 duration-200 ${
                isLight
                  ? 'bg-white text-slate-900 border-slate-200 shadow-slate-300/40'
                  : 'bg-[var(--surface-card)] text-neutral-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 bg-white/20" />

              <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
                <div>
                  <h3 className={`text-base font-semibold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {reconcilingCard.name} 차액 조정 (Reconcile)
                  </h3>
                  <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-neutral-300'}`}>
                    청구할인 · 해외수수료 · 할부 차액 정산
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCloseReconcileModal}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  aria-label="닫기"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2 text-xs">
                  <div className="flex justify-between text-neutral-400">
                    <span>누적 카드 지출 합계</span>
                    <span className="font-mono text-neutral-200">
                      +{formatCurrency(reconcilingCard.totalExpenses, currentCurrency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>카드대금 납부(출금) 합계</span>
                    <span className="font-mono text-neutral-200">
                      -{formatCurrency(reconcilingCard.totalPayments, currentCurrency)}
                    </span>
                  </div>
                  <div className="pt-1.5 border-t border-white/[0.04] flex justify-between font-medium">
                    <span className="text-neutral-300">현재 계산된 장부 잔액</span>
                    <span className="font-mono text-neutral-200">
                      {formatCurrency(reconcilingCard.unpaidLiability, currentCurrency)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-400 mb-1.5 block">
                    조정 후 맞출 미결제 잔액 ({currentCurrency})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={reconcileTargetInput}
                    onChange={(e) => setReconcileTargetInput(e.target.value)}
                    className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all tabular-nums"
                    placeholder="0"
                    autoFocus
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReconcileTargetInput('0')}
                    className="flex-1 py-1.5 px-2 rounded-lg text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 transition-colors text-center cursor-pointer"
                  >
                    0원으로 맞춤 (완납/청구할인)
                  </button>
                  <button
                    type="button"
                    onClick={() => setReconcileTargetInput(reconcilingCard.rawRunningBalance.toString())}
                    className="py-1.5 px-2.5 rounded-lg text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 border border-white/[0.08] transition-colors cursor-pointer"
                  >
                    원래 계산값
                  </button>
                </div>

                <div className="flex items-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={onCloseReconcileModal}
                    className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleReconcileSubmit}
                    className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-sm font-semibold transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                  >
                    조정 반영 확정
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
});

VaultActionModals.displayName = 'VaultActionModals';
