import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { Transaction, Asset } from '../types';
import { getUserAssets, STANDARD_CATEGORIES } from '../utils';
import { useI18n } from '../i18n';

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
  const { t, getLocalizedCategory } = useI18n();
  const [formData, setFormData] = useState<Partial<Transaction>>({});
  const [activeAssets, setActiveAssets] = useState<Asset[]>([]);

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
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden animate-in slide-in-from-bottom-6 duration-200 transition-colors bg-[#111217] border-white/[0.08] text-white backdrop-blur-2xl antialiased"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden bg-white/20" />

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b transition-colors border-white/10 bg-white/[0.02]">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-white">
              {t('edit_transaction_title')}
            </h2>
            <p className="text-xs text-neutral-300 mt-0.5">
              {t('edit_transaction_desc')}
            </p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            title={t('close')}
            aria-label={t('close')}
            className="w-9 h-9 flex items-center justify-center rounded-2xl border transition-colors cursor-pointer text-[#94A3B8] hover:text-white bg-white/[0.04] border-white/10 hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4 overflow-y-auto text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#94A3B8]">
                {t('label_transaction_type')}
              </label>
              <select 
                name="type" 
                value={formData.type || ''} 
                onChange={handleChange} 
                className="w-full border rounded-2xl px-3 py-2.5 text-xs outline-none focus:border-white/30 transition-colors font-medium cursor-pointer bg-black/40 border-white/10 text-white"
              >
                <option value="EXPENSE" className="bg-[#111217]">{t('type_expense')}</option>
                <option value="INCOME" className="bg-[#111217]">{t('type_income')}</option>
                <option value="TRANSFER" className="bg-[#111217]">{t('type_transfer')}</option>
                <option value="SETTLEMENT" className="bg-[#111217]">{t('type_settlement')}</option>
              </select>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#94A3B8]">
                {t('label_amount')}
              </label>
              <input 
                type="number" 
                name="amount" 
                value={formData.amount ?? ''} 
                onChange={handleChange} 
                className="w-full border rounded-2xl px-3 py-2.5 text-xs outline-none focus:border-[#38bdf8] font-bold transition-colors bg-black/40 border-white/10 text-white" 
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#94A3B8]">
              {t('label_description')}
            </label>
            <input 
              type="text" 
              name="description" 
              value={formData.description || ''} 
              onChange={handleChange} 
              className="w-full border rounded-2xl px-3 py-2.5 text-xs outline-none focus:border-[#38bdf8] transition-colors bg-black/40 border-white/10 text-white" 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#94A3B8]">
                {t('label_category')}
              </label>
              <input 
                type="text" 
                name="category" 
                value={formData.category || ''} 
                onChange={handleChange} 
                placeholder={t('placeholder_category')}
                className="w-full border rounded-2xl px-3 py-2.5 text-xs outline-none focus:border-[#38bdf8] transition-colors bg-black/40 border-white/10 text-white" 
              />
              <div className="flex flex-wrap gap-1 mt-0.5">
                {STANDARD_CATEGORIES.map(cat => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, category: cat.key }))}
                    className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                      formData.category === cat.key || formData.category === cat.nameKo
                        ? 'bg-white text-black font-medium border-white'
                        : 'bg-white/[0.04] border-white/[0.08] text-neutral-300 hover:text-white'
                    }`}
                  >
                    {getLocalizedCategory(cat.key)}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#94A3B8]">
                {t('label_payment_method')}
              </label>
              <input 
                type="text" 
                name="paymentMethod" 
                value={formData.paymentMethod || ''} 
                onChange={handleChange} 
                placeholder={t('placeholder_payment_method')} 
                className="w-full border rounded-2xl px-3 py-2.5 text-xs outline-none focus:border-white/30 transition-colors bg-black/40 border-white/10 text-white placeholder:text-[#94A3B8]/50" 
              />
              {activeAssets.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {activeAssets.map(asset => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, paymentMethod: asset.name }))}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                        formData.paymentMethod === asset.name
                          ? 'bg-white text-black font-medium border-white'
                          : 'bg-white/[0.04] border-white/[0.08] text-neutral-300 hover:text-white'
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
            <label className="text-xs font-semibold text-[#94A3B8]">
              {t('label_note')}
            </label>
            <input 
              type="text" 
              name="note" 
              value={formData.note || ''} 
              onChange={handleChange} 
              placeholder={t('placeholder_note')}
              className="w-full border rounded-2xl px-3 py-2.5 text-xs outline-none focus:border-[#38bdf8] transition-colors bg-black/40 border-white/10 text-white placeholder:text-[#94A3B8]/50" 
            />
          </div>
          
          <div className="flex justify-end pt-3">
            <button 
              type="button"
              onClick={handleSave} 
              className="w-full py-3 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Check size={15} /> {t('save_changes')}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
