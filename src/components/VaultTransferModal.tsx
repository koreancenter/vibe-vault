import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, AlertCircle, X } from 'lucide-react';
import { AssetAccount, SupportedCurrency } from '../types';
import { executeAccountTransfer } from '../db';

export interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AssetAccount[];
  currentCurrency: SupportedCurrency;
  onTransferComplete?: () => void;
  onOpenAddAccount?: () => void;
  theme?: 'light' | 'dark' | 'system';
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  accounts,
  currentCurrency,
  onTransferComplete,
  onOpenAddAccount,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      if (accounts.length >= 2) {
        setSourceId(accounts[0].id);
        setTargetId(accounts[1].id);
      } else if (accounts.length === 1) {
        setSourceId(accounts[0].id);
        setTargetId('');
      } else {
        setSourceId('');
        setTargetId('');
      }
      setAmount('');
      setNote('');
      setError(null);
    }
  }, [isOpen, accounts]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceId || !targetId) {
      setError('출금 계좌와 입금 계좌를 선택해주세요.');
      return;
    }
    if (sourceId === targetId) {
      setError('출금 계좌와 입금 계좌는 서로 달라야 합니다.');
      return;
    }
    const transferAmount = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(transferAmount) || transferAmount <= 0) {
      setError('유효한 이체 금액을 입력해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await executeAccountTransfer(sourceId, targetId, transferAmount, note.trim() || undefined);
      if (onTransferComplete) {
        onTransferComplete();
      }
      onClose();
    } catch (err: any) {
      setError(err.message || '이체 처리에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-0 sm:p-4"
      onClick={onClose}
    >
      <div 
        className={`w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-white/[0.08] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.08)] flex flex-col max-h-[85dvh] sm:max-h-[88dvh] overflow-hidden transition-colors antialiased animate-in slide-in-from-bottom-6 duration-200 ${
          isLight ? 'bg-white text-slate-900 border-slate-200' : 'bg-[#111217] text-neutral-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 bg-white/20" />

        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] shrink-0">
          <div>
            <h3 className={`text-base font-semibold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>계좌 간 자산 이체</h3>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-neutral-300'}`}>
              내 계좌 간 이체는 가계부 소비 지출에서 제외됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            aria-label="닫기"
          >
            <X size={17} />
          </button>
        </div>

        {accounts.length < 2 ? (
          <div className="p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] text-neutral-300 flex items-center justify-center mx-auto">
              <ArrowLeftRight size={20} className="text-neutral-400" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-white">2개 이상의 계좌가 필요합니다</p>
              <p className="text-xs text-neutral-400 leading-relaxed">
                계좌 간 이체를 진행하려면 최소 2개 이상의 등록된 자산 계좌가 필요합니다. 상단의 '자산 추가'로 계좌를 등록해 주세요.
              </p>
            </div>
            <div className="pt-2 flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
              >
                닫기
              </button>
              {onOpenAddAccount && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAddAccount();
                  }}
                  className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-sm font-semibold transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                >
                  자산 계좌 추가
                </button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-4 overscroll-contain">
              {error && (
                <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10 text-neutral-300 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-amber-400" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-neutral-400 mb-1.5 block">출금 계좌 (보내는 곳)</label>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white focus:border-white/25 focus:ring-0 outline-none transition-all cursor-pointer"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-[#111217] text-white">
                      {acc.institution} - {acc.accountName} (잔고 ₩{acc.currentBalance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-400 mb-1.5 block">입금 계좌 (받는 곳)</label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white focus:border-white/25 focus:ring-0 outline-none transition-all cursor-pointer"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-[#111217] text-white">
                      {acc.institution} - {acc.accountName} (잔고 ₩{acc.currentBalance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-400 mb-1.5 block">이체 금액 ({currentCurrency})</label>
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1000000"
                  required
                  className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all tabular-nums"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-400 mb-1.5 block">이체 메모 (선택)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 미국주식 매수용 예수금 이체"
                  className="w-full h-11 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 text-sm text-white placeholder:text-neutral-400 focus:border-white/25 focus:ring-0 outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex items-center gap-2.5 px-6 py-4 border-t border-white/[0.06] shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-sm font-medium transition-all cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-sm font-semibold transition-all shadow-sm active:scale-[0.99] flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <ArrowLeftRight size={15} />
                {isSubmitting ? '처리 중...' : '이체 실행'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default TransferModal;
