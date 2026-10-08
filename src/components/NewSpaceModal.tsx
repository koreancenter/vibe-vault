import React, { useState } from 'react';
import { X } from 'lucide-react';
import { LedgerSpace } from '../types';
import { createSpace } from '../db';

interface NewSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (space: LedgerSpace) => void;
  theme?: 'light' | 'dark';
}

const PRESET_CURRENCIES = [
  { code: 'KRW', label: 'KRW (₩)', symbol: '₩' },
  { code: 'EUR', label: 'EUR (€)', symbol: '€' },
  { code: 'USD', label: 'USD ($)', symbol: '$' },
  { code: 'IDR', label: 'IDR (Rp)', symbol: 'Rp' },
  { code: 'JPY', label: 'JPY (¥)', symbol: '¥' },
];

export const NewSpaceModal: React.FC<NewSpaceModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  theme = 'dark'
}) => {
  const isLight = theme === 'light';

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('KRW');
  const [budget, setBudget] = useState('');
  const [memberCount, setMemberCount] = useState<string>('4');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('장부 이름을 입력해 주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const parsedBudget = budget ? Number(budget.replace(/[^0-9]/g, '')) : undefined;
      const parsedMembers = memberCount ? Math.max(1, parseInt(memberCount, 10)) : undefined;

      const newSpace: LedgerSpace = {
        id: crypto.randomUUID(),
        name: trimmedName,
        currency: currency.trim().toUpperCase() || 'KRW',
        budget: parsedBudget && !isNaN(parsedBudget) ? parsedBudget : undefined,
        memberCount: parsedMembers && !isNaN(parsedMembers) ? parsedMembers : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        createdAt: new Date().toISOString(),
      };

      await createSpace(newSpace);
      onCreated(newSpace);
      onClose();
    } catch (err: any) {
      console.error('[NewSpaceModal] Failed to create space:', err);
      setError('장부 공간을 생성하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className={`w-full max-w-lg rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 transition-colors ${
          isLight 
            ? 'bg-white border-neutral-200 text-neutral-900 shadow-neutral-300/50' 
            : 'bg-[#0B0F17]/95 border-white/10 text-white shadow-2xl backdrop-blur-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex justify-between items-center px-6 py-4.5 border-b transition-colors ${
          isLight ? 'border-neutral-200 bg-neutral-50/80' : 'border-white/10 bg-white/[0.02]'
        }`}>
          <h2 className={`text-base font-semibold tracking-tight ${isLight ? 'text-neutral-900' : 'text-white'}`}>
            새 프로젝트 / 행사 장부 만들기
          </h2>
          <button 
            type="button"
            onClick={onClose} 
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
              isLight 
                ? 'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100' 
                : 'text-neutral-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4.5 max-h-[80dvh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
              {error}
            </div>
          )}

          {/* 1. Project Name (Required) */}
          <div className="space-y-1.5">
            <label className={`text-xs font-medium flex items-center justify-between ${isLight ? 'text-neutral-700' : 'text-neutral-300'}`}>
              <span>장부 이름 <span className="text-neutral-400 font-normal">*</span></span>
              <span className="text-[11px] text-neutral-500 font-normal">필수</span>
            </label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="장부 이름을 입력하세요" 
              className={`w-full border rounded-xl px-3.5 py-2.5 text-xs outline-none transition-colors ${
                isLight 
                  ? 'bg-neutral-50 border-neutral-300 text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900' 
                  : 'bg-black/40 border-white/10 text-white placeholder:text-white/30 focus:border-white/40'
              }`}
              autoFocus
            />
          </div>

          {/* 2. Base Currency (Simplified clean selector) */}
          <div className="space-y-1.5 pt-0.5">
            <label className={`text-xs font-medium flex items-center justify-between ${isLight ? 'text-neutral-700' : 'text-neutral-300'}`}>
              <span>기본 통화</span>
              <span className="text-[11px] text-neutral-500 font-normal">정산서 기준 통화</span>
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {PRESET_CURRENCIES.map((cur) => (
                <button
                  key={cur.code}
                  type="button"
                  onClick={() => setCurrency(cur.code)}
                  className={`py-2 px-1 rounded-xl text-xs transition-all border text-center ${
                    currency === cur.code
                      ? isLight
                        ? 'bg-neutral-900 border-neutral-900 text-white font-semibold shadow-xs'
                        : 'bg-white text-neutral-950 font-semibold border-white shadow-xs'
                      : isLight
                        ? 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                        : 'bg-white/[0.03] border-white/10 text-neutral-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="tracking-tight">{cur.code}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Budget / Total Dues & 4. Member Count */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
            {/* Target Budget / Total Dues */}
            <div className="space-y-1.5">
              <label className={`text-xs font-medium ${isLight ? 'text-neutral-700' : 'text-neutral-300'}`}>
                목표 예산 / 총 회비
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  value={budget}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setBudget(raw ? Number(raw).toLocaleString() : '');
                  }}
                  placeholder="예: 2,000,000" 
                  className={`w-full border rounded-xl pl-3 pr-11 py-2 text-xs outline-none transition-colors tabular-nums font-medium ${
                    isLight 
                      ? 'bg-neutral-50 border-neutral-300 text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900' 
                      : 'bg-black/40 border-white/10 text-white placeholder:text-white/30 focus:border-white/40'
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500 pointer-events-none">
                  {currency}
                </span>
              </div>
            </div>

            {/* Member Count */}
            <div className="space-y-1.5">
              <label className={`text-xs font-medium ${isLight ? 'text-neutral-700' : 'text-neutral-300'}`}>
                참여 인원
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <input 
                    type="number" 
                    min="1"
                    max="100"
                    value={memberCount}
                    onChange={(e) => setMemberCount(e.target.value)}
                    placeholder="인원수" 
                    className={`w-full border rounded-xl pl-3 pr-8 py-2 text-xs outline-none transition-colors tabular-nums font-medium ${
                      isLight 
                        ? 'bg-neutral-50 border-neutral-300 text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900' 
                        : 'bg-black/40 border-white/10 text-white placeholder:text-white/30 focus:border-white/40'
                    }`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500 pointer-events-none">
                    명
                  </span>
                </div>
                {/* Quick Presets */}
                <div className="flex items-center gap-1">
                  {[2, 4, 8].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMemberCount(String(n))}
                      className={`text-xs px-2.5 py-2 rounded-xl border transition-all ${
                        memberCount === String(n)
                          ? isLight
                            ? 'bg-neutral-900 border-neutral-900 text-white font-semibold'
                            : 'bg-white text-neutral-950 font-semibold border-white'
                          : isLight
                            ? 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                            : 'bg-white/[0.04] border-white/10 text-neutral-400 hover:text-white'
                      }`}
                    >
                      {n}명
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className={`text-[11px] font-normal leading-relaxed ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
            참여 인원수는 공식 결산서의 1인당 정산 금액(총지출 ÷ 인원수) 및 환급금 계산에 사용됩니다.
          </p>

          {/* 5. Date Range (Optional) */}
          <div className="space-y-1.5 pt-0.5">
            <label className={`text-xs font-medium ${isLight ? 'text-neutral-700' : 'text-neutral-300'}`}>
              진행 기간 (선택 사항)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-neutral-500 block mb-1">시작일</span>
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={`w-full border rounded-xl px-3 py-2 text-xs outline-none transition-colors font-medium ${
                    isLight 
                      ? 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-neutral-900' 
                      : 'bg-black/40 border-white/10 text-white focus:border-white/40'
                  }`}
                />
              </div>
              <div>
                <span className="text-[10px] text-neutral-500 block mb-1">종료일</span>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`w-full border rounded-xl px-3 py-2 text-xs outline-none transition-colors font-medium ${
                    isLight 
                      ? 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-neutral-900' 
                      : 'bg-black/40 border-white/10 text-white focus:border-white/40'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`h-10 px-4 rounded-xl text-xs font-medium border transition-colors ${
                isLight 
                  ? 'border-neutral-300 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900' 
                  : 'border-white/10 text-neutral-400 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className={`flex-1 h-10 flex items-center justify-center rounded-xl font-semibold text-xs transition-all disabled:opacity-30 disabled:pointer-events-none active:scale-[0.99] ${
                isLight
                  ? 'bg-neutral-900 hover:bg-neutral-800 text-white shadow-sm'
                  : 'bg-white hover:bg-neutral-200 text-neutral-950 shadow-sm'
              }`}
            >
              장부 공간 생성 및 바로 전환
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
