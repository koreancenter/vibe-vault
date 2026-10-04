import React, { useState, useEffect } from 'react';
import { 
  X, 
  Check, 
  Layers, 
  ChevronRight, 
  ChevronLeft, 
  Sparkles,
  Tag,
  AlertCircle
} from 'lucide-react';
import { Transaction } from '../types';
import { STANDARD_CATEGORIES, getCategoryKo, getPaymentMethodKo } from '../utils';

interface ManualCategoryModalProps {
  isOpen: boolean;
  pendingTransactions: Transaction[];
  onConfirm: (finalTransactions: Transaction[]) => void;
  onCancel: () => void;
  theme?: 'light' | 'dark';
  currencySymbol?: string;
}

export const ManualCategoryModal: React.FC<ManualCategoryModalProps> = ({
  isOpen,
  pendingTransactions,
  onConfirm,
  onCancel,
  theme = 'dark',
  currencySymbol = '₩'
}) => {
  const [items, setItems] = useState<Transaction[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [customCategoryInput, setCustomCategoryInput] = useState('');

  const isLight = theme === 'light';

  useEffect(() => {
    if (isOpen && pendingTransactions.length > 0) {
      // Initialize with pending transactions. Note: if auto-categorization is disabled,
      // category can be empty or set to 'Uncategorized' until user chooses.
      // We also preserve AI's initial guess in a temporary field if available for reference
      setItems(pendingTransactions.map(tx => ({
        ...tx,
        category: tx.category === 'Uncategorized' ? '' : tx.category
      })));
      setCurrentIndex(0);
      setCustomCategoryInput('');
    }
  }, [isOpen, pendingTransactions]);

  if (!isOpen || items.length === 0) return null;

  const currentTx = items[currentIndex];
  const totalCount = items.length;
  const isLast = currentIndex === totalCount - 1;

  const handleSelectCategory = (catKey: string) => {
    setItems(prev => {
      const updated = [...prev];
      updated[currentIndex] = {
        ...updated[currentIndex],
        category: catKey
      };
      return updated;
    });
    setCustomCategoryInput('');
  };

  const handleCustomCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCategoryInput.trim()) return;
    const cat = customCategoryInput.trim();
    setItems(prev => {
      const updated = [...prev];
      updated[currentIndex] = {
        ...updated[currentIndex],
        category: cat
      };
      return updated;
    });
  };

  const handleNextOrSave = () => {
    // If current item has no category selected, default to 'Uncategorized'
    const finalItems = items.map(t => ({
      ...t,
      category: t.category.trim() ? t.category : 'Uncategorized'
    }));

    if (isLast) {
      onConfirm(finalItems);
    } else {
      setCurrentIndex(prev => prev + 1);
      setCustomCategoryInput('');
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setCustomCategoryInput('');
    }
  };

  const selectedCategory = currentTx?.category || '';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div 
        className={`w-full max-w-md rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden animate-in slide-in-from-bottom-6 duration-200 transition-colors ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/40'
            : 'bg-[#0E1524]/95 border-white/10 text-slate-100 shadow-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className={`w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 ${
          isLight ? 'bg-slate-300' : 'bg-white/20'
        }`} />

        {/* Top Header */}
        <div className={`flex justify-between items-center px-6 py-4 border-b shrink-0 transition-colors ${
          isLight ? 'border-slate-200 bg-slate-50/80' : 'border-white/10 bg-white/[0.02]'
        }`}>
          <div>
            <div className="flex items-center gap-2">
              <span className={`p-1.5 rounded-lg text-xs ${
                isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-400'
              }`}>
                <Tag size={14} />
              </span>
              <h2 className={`text-base font-bold ${isLight ? 'text-slate-950' : 'text-white'}`}>
                카테고리 수동 선택
              </h2>
            </div>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-[#94A3B8]'}`}>
              스마트 자동 분류가 꺼져 있어 직접 카테고리를 지정합니다
            </p>
          </div>

          <button 
            id="manual-category-cancel-btn"
            onClick={onCancel} 
            className={`w-9 h-9 flex items-center justify-center rounded-2xl border transition-colors ${
              isLight
                ? 'text-slate-600 hover:text-slate-900 bg-slate-100 border-slate-200 hover:bg-slate-200'
                : 'text-[#94A3B8] hover:text-white bg-white/[0.04] border-white/10 hover:bg-white/10'
            }`}
            aria-label="취소"
          >
            <X size={18} />
          </button>
        </div>

        {/* Multi-item Progress Indicator */}
        {totalCount > 1 && (
          <div className={`px-6 py-2 border-b flex items-center justify-between text-xs font-semibold ${
            isLight ? 'bg-slate-100/70 border-slate-200 text-slate-700' : 'bg-black/30 border-white/5 text-slate-300'
          }`}>
            <span className="flex items-center gap-1.5">
              <Layers size={13} className="text-emerald-500" />
              <span>항목 {currentIndex + 1} / {totalCount}</span>
            </span>
            <div className="flex gap-1">
              {items.map((_, idx) => (
                <span 
                  key={idx}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx === currentIndex 
                      ? isLight ? 'bg-emerald-600 w-4' : 'bg-[#00F5A0] w-4' 
                      : idx < currentIndex
                        ? isLight ? 'bg-emerald-300' : 'bg-[#00F5A0]/40'
                        : isLight ? 'bg-slate-300' : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Transaction Summary Card */}
        <div className="px-6 pt-4 pb-2">
          <div className={`p-4 rounded-2xl border transition-colors ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.03] border-white/10'
          }`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block mb-1.5 ${
                  currentTx.type === 'INCOME'
                    ? isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400'
                    : currentTx.type === 'TRANSFER'
                    ? isLight ? 'bg-purple-100 text-purple-700' : 'bg-purple-500/20 text-purple-400'
                    : currentTx.type === 'SETTLEMENT'
                    ? isLight ? 'bg-teal-100 text-teal-700' : 'bg-teal-500/20 text-teal-400'
                    : isLight ? 'bg-rose-100 text-rose-700' : 'bg-rose-500/20 text-rose-400'
                }`}>
                  {currentTx.type === 'INCOME' ? '수입' : currentTx.type === 'TRANSFER' ? '이체' : currentTx.type === 'SETTLEMENT' ? '정산' : '지출'}
                </span>
                <h3 className={`text-base font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {currentTx.description || '내역 내용 없음'}
                </h3>
                {(currentTx.paymentMethod || currentTx.type === 'INCOME') && (
                  <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {currentTx.type === 'INCOME' ? '입금 수단' : '결제'}: {getPaymentMethodKo(currentTx.paymentMethod, currentTx.type)}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className={`text-lg font-extrabold tracking-tight ${
                  currentTx.type === 'INCOME' 
                    ? isLight ? 'text-blue-600' : 'text-blue-400'
                    : isLight ? 'text-slate-900' : 'text-white'
                }`}>
                  {currentTx.type === 'EXPENSE' ? '-' : '+'}{currencySymbol}{currentTx.amount?.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Currently Selected Category Status */}
            <div className={`mt-3 pt-3 border-t flex items-center justify-between text-xs ${
              isLight ? 'border-slate-200' : 'border-white/10'
            }`}>
              <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>선택된 카테고리:</span>
              <span className={`font-bold px-2.5 py-0.5 rounded-lg border ${
                selectedCategory 
                  ? isLight 
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
                    : 'bg-[#00F5A0]/15 border-[#00F5A0]/30 text-[#00F5A0]'
                  : isLight
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              }`}>
                {selectedCategory ? getCategoryKo(selectedCategory) : '카테고리를 선택해주세요'}
              </span>
            </div>
          </div>
        </div>

        {/* Category Picker Grid */}
        <div className="flex-1 px-6 py-3 overflow-y-auto space-y-4 scrollbar-none">
          <div>
            <label className={`text-xs font-bold block mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              표준 카테고리 선택
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STANDARD_CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.key || selectedCategory === cat.nameKo;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => handleSelectCategory(cat.key)}
                    className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all active:scale-95 ${
                      isSelected
                        ? isLight
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/30 font-bold shadow-sm'
                          : 'bg-[#00F5A0]/15 border-[#00F5A0] text-white ring-2 ring-[#00F5A0]/40 font-bold shadow-md shadow-[#00F5A0]/10'
                        : isLight
                          ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          : 'bg-white/[0.04] border-white/10 text-slate-300 hover:border-white/20 hover:bg-white/[0.08]'
                    }`}
                  >
                    <span className="text-xl shrink-0">{cat.emoji}</span>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold block truncate">{cat.nameKo}</span>
                      <span className={`text-[10px] block truncate ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                        {cat.key}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Category Input */}
          <div className={`p-3 rounded-2xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/10'
          }`}>
            <span className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              직접 입력 (커스텀 카테고리)
            </span>
            <form onSubmit={handleCustomCategorySubmit} className="flex gap-2">
              <input
                type="text"
                value={customCategoryInput}
                onChange={(e) => setCustomCategoryInput(e.target.value)}
                placeholder="예: 반려동물, 자기계발, 구독료"
                className={`flex-1 border rounded-xl px-3 py-2 text-xs outline-none focus:border-emerald-500 transition-colors ${
                  isLight ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400' : 'bg-slate-900 border-white/10 text-white placeholder:text-slate-500'
                }`}
              />
              <button
                type="submit"
                disabled={!customCategoryInput.trim()}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 disabled:opacity-40 ${
                  isLight
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                적용
              </button>
            </form>
          </div>
        </div>

        {/* Footer Actions */}
        <div className={`p-4 border-t shrink-0 flex items-center justify-between gap-3 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/30 border-white/10'
        }`}>
          {totalCount > 1 && currentIndex > 0 ? (
            <button
              type="button"
              onClick={handlePrev}
              className={`h-11 px-4 rounded-2xl border text-xs font-semibold flex items-center gap-1 transition-all ${
                isLight 
                  ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100' 
                  : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10'
              }`}
            >
              <ChevronLeft size={16} />
              <span>이전</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancel}
              className={`h-11 px-4 rounded-2xl border text-xs font-semibold transition-all ${
                isLight 
                  ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100' 
                  : 'border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/10'
              }`}
            >
              취소
            </button>
          )}

          <button
            id="manual-category-confirm-btn"
            type="button"
            onClick={handleNextOrSave}
            className="flex-1 h-11 px-5 rounded-2xl bg-gradient-to-r from-[#00F5A0] to-[#00D9A5] hover:opacity-95 active:scale-95 text-[#0B0F17] font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-[#00F5A0]/20"
          >
            {isLast ? (
              <>
                <Check size={16} />
                <span>{totalCount > 1 ? `모든 내역 저장하기 (${totalCount}건)` : '선택한 카테고리로 저장'}</span>
              </>
            ) : (
              <>
                <span>다음 항목 ({currentIndex + 2}/{totalCount})</span>
                <ChevronRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
