import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { Transaction, Asset } from '../types';
import { getUserAssets, STANDARD_CATEGORIES, getCategoryKo } from '../utils';

interface EditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  onSave: (tx: Transaction) => void;
  theme?: 'light' | 'dark';
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({ 
  isOpen, 
  onClose, 
  transaction, 
  onSave,
  theme = 'dark'
}) => {
  const [formData, setFormData] = useState<Partial<Transaction>>({});
  const [activeAssets, setActiveAssets] = useState<Asset[]>([]);

  const isLight = theme === 'light';

  useEffect(() => {
    if (isOpen && transaction) {
      setFormData(transaction);
      try {
        const assets = getUserAssets().filter(a => a.enabled);
        setActiveAssets(assets);
      } catch (e) {}
    }
  }, [isOpen, transaction]);

  if (!isOpen || !transaction) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'amount' ? Number(value) : value
    }));
  };

  const handleSave = () => {
    if (formData.id) {
      onSave(formData as Transaction);
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className={`w-full max-w-md rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden animate-in slide-in-from-bottom-6 duration-200 transition-colors ${
          isLight ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/40' : 'bg-[#0E1524]/95 border-white/10 text-white shadow-2xl backdrop-blur-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className={`w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden ${isLight ? 'bg-slate-300' : 'bg-white/20'}`} />

        {/* Header */}
        <div className={`flex justify-between items-center px-6 py-4 border-b transition-colors ${
          isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.02]'
        }`}>
          <div>
            <h2 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              거래 내역 수정
            </h2>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-[#94A3B8]'}`}>금액 및 분류 상세 항목을 수정합니다</p>
          </div>
          <button 
            onClick={onClose} 
            className={`w-9 h-9 flex items-center justify-center rounded-2xl border transition-colors ${
              isLight 
                ? 'text-slate-500 hover:text-slate-900 bg-slate-100 border-slate-200 hover:bg-slate-200' 
                : 'text-[#94A3B8] hover:text-white bg-white/[0.04] border-white/10 hover:bg-white/10'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4 overflow-y-auto text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-[#94A3B8]'}`}>거래 유형</label>
              <select 
                name="type" 
                value={formData.type || ''} 
                onChange={handleChange} 
                className={`w-full border rounded-2xl px-3 py-2.5 text-xs outline-none focus:border-[#00F5A0] transition-colors font-medium ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-black/40 border-white/10 text-white'
                }`}
              >
                <option value="EXPENSE" className={isLight ? 'bg-white' : 'bg-[#0E1524]'}>지출</option>
                <option value="INCOME" className={isLight ? 'bg-white' : 'bg-[#0E1524]'}>수입</option>
                <option value="TRANSFER" className={isLight ? 'bg-white' : 'bg-[#0E1524]'}>이체</option>
                <option value="SETTLEMENT" className={isLight ? 'bg-white' : 'bg-[#0E1524]'}>더치페이 정산</option>
              </select>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-[#94A3B8]'}`}>금액</label>
              <input 
                type="number" 
                name="amount" 
                value={formData.amount ?? ''} 
                onChange={handleChange} 
                className={`w-full border rounded-2xl px-3 py-2.5 text-xs outline-none focus:border-[#00F5A0] font-bold transition-colors ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-black/40 border-white/10 text-white'
                }`} 
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-[#94A3B8]'}`}>내용 (상호명 / 내역)</label>
            <input 
              type="text" 
              name="description" 
              value={formData.description || ''} 
              onChange={handleChange} 
              className={`w-full border rounded-2xl px-3 py-2.5 text-xs outline-none focus:border-[#00F5A0] transition-colors ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-black/40 border-white/10 text-white'
              }`} 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-[#94A3B8]'}`}>카테고리</label>
              <input 
                type="text" 
                name="category" 
                value={formData.category || ''} 
                onChange={handleChange} 
                placeholder="예: 식비, 생활/쇼핑"
                className={`w-full border rounded-2xl px-3 py-2.5 text-xs outline-none focus:border-[#00F5A0] transition-colors ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-black/40 border-white/10 text-white'
                }`} 
              />
              <div className="flex flex-wrap gap-1 mt-0.5">
                {STANDARD_CATEGORIES.map(cat => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, category: cat.key }))}
                    className={`text-[10px] px-1.5 py-0.5 rounded-lg border transition-all ${
                      formData.category === cat.key || formData.category === cat.nameKo
                        ? isLight
                          ? 'bg-emerald-100 border-emerald-500 text-emerald-800 font-bold'
                          : 'bg-[#00F5A0]/20 border-[#00F5A0] text-[#00F5A0] font-bold'
                        : isLight
                          ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                          : 'bg-white/[0.04] border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {cat.emoji} {cat.nameKo}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-[#94A3B8]'}`}>결제 수단</label>
              <input 
                type="text" 
                name="paymentMethod" 
                value={formData.paymentMethod || ''} 
                onChange={handleChange} 
                placeholder="예: 현대카드, 토스머니" 
                className={`w-full border rounded-2xl px-3 py-2.5 text-xs outline-none focus:border-[#00F5A0] transition-colors ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400' : 'bg-black/40 border-white/10 text-white placeholder:text-[#94A3B8]/50'
                }`} 
              />
              {activeAssets.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {activeAssets.map(asset => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, paymentMethod: asset.name }))}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all ${
                        formData.paymentMethod === asset.name
                          ? isLight
                            ? 'bg-emerald-100 border-emerald-500 text-emerald-800 font-bold'
                            : 'bg-[#00F5A0]/20 border-[#00F5A0] text-[#00F5A0] font-bold'
                          : isLight
                            ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                            : 'bg-white/[0.04] border-white/10 text-slate-300 hover:text-white'
                      }`}
                    >
                      {asset.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-[#94A3B8]'}`}>비고 (정산 비고 / 지출 메모)</label>
            <input 
              type="text" 
              name="note" 
              value={formData.note || ''} 
              onChange={handleChange} 
              placeholder="예: 정산 메모, 결제자, 영수증 번호 등"
              className={`w-full border rounded-2xl px-3 py-2.5 text-xs outline-none focus:border-[#00F5A0] transition-colors ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400' : 'bg-black/40 border-white/10 text-white placeholder:text-[#94A3B8]/50'
              }`} 
            />
          </div>
          
          <div className="flex justify-end pt-3">
            <button 
              onClick={handleSave} 
              className="h-12 w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#00F5A0] to-[#00D9A5] hover:opacity-95 active:scale-[0.98] text-[#0B0F17] font-bold text-xs transition-all shadow-lg shadow-[#00F5A0]/20"
            >
              <Check size={16} /> 변경사항 저장하기
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
