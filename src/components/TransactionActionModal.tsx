import React from 'react';
import { 
  X, 
  Edit3, 
  Trash2, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ArrowLeftRight, 
  CreditCard, 
  Calendar, 
  Tag
} from 'lucide-react';
import { Transaction } from '../types';
import { format, parseISO } from 'date-fns';
import { getCategoryKo, getCurrencySymbol, formatCurrency, getPaymentMethodKo } from '../utils';

interface TransactionActionModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  isLight?: boolean;
  isStealth?: boolean;
  currentCurrency?: string;
  convertedAmount?: number;
}

export const TransactionActionModal: React.FC<TransactionActionModalProps> = ({
  transaction,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  isLight = false,
  isStealth = false,
  currentCurrency = 'KRW',
  convertedAmount
}) => {
  if (!isOpen || !transaction) return null;

  const isExpense = transaction.type === 'EXPENSE';
  const isIncome = transaction.type === 'INCOME';
  const isInternalTransfer = !!transaction.isInternalTransfer;
  const isSettlement = transaction.type === 'SETTLEMENT';

  const categoryLabel = isInternalTransfer
    ? (transaction.subCategory || '내부이체/원금상환')
    : getCategoryKo(transaction.category, transaction.subCategory);

  const txCurrency = transaction.currency || 'KRW';
  const currSymbol = getCurrencySymbol(txCurrency);

  const formattedDate = (() => {
    try {
      return format(parseISO(transaction.date), 'yyyy년 M월 d일 HH:mm');
    } catch {
      return transaction.date;
    }
  })();

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className={`w-full max-w-sm rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 duration-200 transition-colors ${
          isLight 
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/40' 
            : 'bg-[#0E1524] border-white/10 text-white'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Indicator */}
        <div className={`w-10 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden ${isLight ? 'bg-slate-300' : 'bg-white/20'}`} />

        {/* Modal Top Header */}
        <div className={`flex items-center justify-between px-5 pt-3.5 pb-2.5 border-b ${
          isLight ? 'border-slate-100' : 'border-white/5'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs ${
              isInternalTransfer
                ? 'bg-blue-500/10 text-blue-400'
                : isExpense
                  ? 'bg-rose-500/10 text-rose-400'
                  : 'bg-emerald-500/10 text-emerald-400'
            }`}>
              {isInternalTransfer ? (
                <ArrowLeftRight size={13} />
              ) : isExpense ? (
                <ArrowUpRight size={13} />
              ) : (
                <ArrowDownLeft size={13} />
              )}
            </span>
            <span className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
              거래 상세 정보
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`w-7 h-7 flex items-center justify-center rounded-xl transition-colors ${
              isLight ? 'text-slate-400 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        {/* Transaction Content Details */}
        <div className="px-5 py-4 space-y-3.5">
          {/* Main Title & Amount Display */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <span className={`text-base font-semibold truncate flex-1 min-w-0 ${
                isLight ? 'text-slate-900' : 'text-slate-100'
              }`}>
                {transaction.description || '거래 내역'}
              </span>
              <span className={`text-lg font-bold tracking-tight shrink-0 transition-all ${
                isStealth ? 'blur-sm select-none' : ''
              } ${
                isInternalTransfer
                  ? isLight ? 'text-blue-600' : 'text-blue-400'
                  : isExpense
                    ? isLight ? 'text-slate-900' : 'text-rose-400'
                    : isLight ? 'text-emerald-600' : 'text-emerald-400'
              }`}>
                {isInternalTransfer ? '⇄ ' : (isExpense ? '-' : '+')}
                {currSymbol}{transaction.amount.toLocaleString()}
              </span>
            </div>

            {/* Currency conversion if different */}
            {txCurrency !== currentCurrency && convertedAmount !== undefined && (
              <div className="flex justify-end">
                <span className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'} ${isStealth ? 'blur-xs select-none' : ''}`}>
                  ≈ {isExpense ? '-' : '+'}{getCurrencySymbol(currentCurrency)}{Math.round(convertedAmount).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Metadata Badges & Rows */}
          <div className={`rounded-xl p-3 space-y-2 text-xs ${
            isLight ? 'bg-slate-50 border border-slate-100' : 'bg-white/[0.03] border border-white/5'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`flex items-center gap-1.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                <Tag size={12} />
                <span>카테고리</span>
              </span>
              <span className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                {categoryLabel}
              </span>
            </div>

            {(transaction.paymentMethod || transaction.type === 'INCOME') && (
              <div className="flex items-center justify-between">
                <span className={`flex items-center gap-1.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  <CreditCard size={12} />
                  <span>{transaction.type === 'INCOME' ? '입금 계좌/수단' : '결제 수단'}</span>
                </span>
                <span className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  {getPaymentMethodKo(transaction.paymentMethod, transaction.type)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className={`flex items-center gap-1.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                <Calendar size={12} />
                <span>일시</span>
              </span>
              <span className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                {formattedDate}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Actions (Edit & Delete) */}
        <div className={`px-5 py-3 border-t grid grid-cols-2 gap-2.5 ${
          isLight ? 'border-slate-100 bg-slate-50/60' : 'border-white/5 bg-white/[0.01]'
        }`}>
          <button
            type="button"
            onClick={() => {
              onEdit(transaction);
              onClose();
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                : 'bg-white/[0.06] hover:bg-white/10 text-slate-200'
            }`}
          >
            <Edit3 size={14} />
            <span>수정하기</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onDelete(transaction.id);
              onClose();
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
              isLight
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-600'
                : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20'
            }`}
          >
            <Trash2 size={14} />
            <span>삭제하기</span>
          </button>
        </div>
      </div>
    </div>
  );
};
