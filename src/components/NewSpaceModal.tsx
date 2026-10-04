import React, { useState } from 'react';
import { X, Sparkles, Users, Calendar, DollarSign, Wallet, Check } from 'lucide-react';
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

const PRESET_IDEAS = [
  '동창회 유럽 여행',
  '여름 발리 휴가',
  '대학 동기 정기모임',
  '사내 워크샵 회비'
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
        className={`w-full max-w-lg rounded-3xl border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 transition-colors ${
          isLight 
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/50' 
            : 'bg-[#0E1524]/95 border-white/10 text-white shadow-2xl backdrop-blur-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex justify-between items-center px-6 py-5 border-b transition-colors ${
          isLight ? 'border-slate-200 bg-slate-50/80' : 'border-white/10 bg-white/[0.02]'
        }`}>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00F5A0] animate-pulse" />
              <h2 className={`text-base font-bold tracking-tight ${isLight ? 'text-slate-950' : 'text-white'}`}>
                새 프로젝트 / 행사 장부 만들기
              </h2>
            </div>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-[#94A3B8]'}`}>
              여행, 모임, 행사 등 일상 가계부와 완벽히 격리된 독립 장부를 생성합니다.
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className={`w-9 h-9 flex items-center justify-center rounded-2xl border transition-colors ${
              isLight 
                ? 'text-slate-500 hover:text-slate-900 bg-slate-100 border-slate-200 hover:bg-slate-200' 
                : 'text-[#94A3B8] hover:text-white bg-white/[0.04] border-white/10 hover:bg-white/10'
            }`}
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80dvh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              {error}
            </div>
          )}

          {/* 1. Project Name (Required) */}
          <div className="space-y-1.5">
            <label className={`text-xs font-semibold flex items-center justify-between ${isLight ? 'text-slate-700' : 'text-[#94A3B8]'}`}>
              <span>장부 이름 <strong className="text-[#00F5A0] font-normal">*</strong></span>
              <span className="text-[11px] opacity-70 font-normal">필수</span>
            </label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="예: 동창회 유럽 여행, 여름 발리 휴가, 2026 워크샵" 
              className={`w-full border rounded-2xl px-4 py-3 text-sm outline-none focus:border-[#00F5A0] transition-colors ${
                isLight 
                  ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400' 
                  : 'bg-black/40 border-white/10 text-white placeholder:text-white/30'
              }`}
              autoFocus
            />

            {/* Quick Suggestion Chips */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[10px] text-slate-400 shrink-0">추천:</span>
              {PRESET_IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setName(idea)}
                  className={`text-[11px] px-2.5 py-1 rounded-xl border transition-all ${
                    name === idea
                      ? isLight
                        ? 'bg-emerald-100 border-emerald-500 text-emerald-800 font-semibold'
                        : 'bg-[#00F5A0]/20 border-[#00F5A0] text-[#00F5A0] font-semibold'
                      : isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                        : 'bg-white/[0.04] border-white/10 text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Base Currency (Quick chips) */}
          <div className="space-y-1.5 pt-1">
            <label className={`text-xs font-semibold flex items-center justify-between ${isLight ? 'text-slate-700' : 'text-[#94A3B8]'}`}>
              <span>기본 통화</span>
              <span className="text-[11px] opacity-70 font-normal">정산서 기준 통화</span>
            </label>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_CURRENCIES.map((cur) => (
                <button
                  key={cur.code}
                  type="button"
                  onClick={() => setCurrency(cur.code)}
                  className={`py-2 px-2 rounded-2xl text-xs font-medium border text-center transition-all ${
                    currency === cur.code
                      ? isLight
                        ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                        : 'bg-[#00F5A0]/20 border-[#00F5A0] text-[#00F5A0] font-bold shadow-sm shadow-[#00F5A0]/10'
                      : isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-white/[0.03] border-white/10 text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="font-bold">{cur.code}</div>
                  <div className="text-[10px] opacity-70">{cur.symbol}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Budget / Total Dues & 4. Member Count */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Target Budget / Total Dues */}
            <div className="space-y-1.5">
              <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLight ? 'text-slate-700' : 'text-[#94A3B8]'}`}>
                <Wallet size={13} className="text-emerald-400" />
                <span>목표 예산 / 총 회비</span>
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
                  className={`w-full border rounded-2xl pl-3 pr-9 py-2.5 text-xs outline-none focus:border-[#00F5A0] transition-colors tabular-nums font-semibold ${
                    isLight 
                      ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400' 
                      : 'bg-black/40 border-white/10 text-white placeholder:text-white/30'
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                  {currency}
                </span>
              </div>
            </div>

            {/* Member Count */}
            <div className="space-y-1.5">
              <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLight ? 'text-slate-700' : 'text-[#94A3B8]'}`}>
                <Users size={13} className="text-blue-400" />
                <span>참여 인원</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input 
                    type="number" 
                    min="1"
                    max="100"
                    value={memberCount}
                    onChange={(e) => setMemberCount(e.target.value)}
                    placeholder="인원수" 
                    className={`w-full border rounded-2xl pl-3 pr-8 py-2.5 text-xs outline-none focus:border-[#00F5A0] transition-colors tabular-nums font-bold ${
                      isLight 
                        ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400' 
                        : 'bg-black/40 border-white/10 text-white placeholder:text-white/30'
                    }`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
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
                      className={`text-[11px] px-2 py-1.5 rounded-xl border transition-all ${
                        memberCount === String(n)
                          ? isLight
                            ? 'bg-blue-100 border-blue-500 text-blue-800 font-bold'
                            : 'bg-blue-500/20 border-blue-400 text-blue-300 font-bold'
                          : isLight
                            ? 'bg-slate-100 border-slate-200 text-slate-600'
                            : 'bg-white/[0.04] border-white/10 text-slate-400'
                      }`}
                    >
                      {n}명
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 font-light pl-0.5">
            💡 참여 인원수는 공식 결산서의 1인당 정산 금액(총지출 ÷ 인원수) 및 환급금 계산에 사용됩니다.
          </p>

          {/* 5. Date Range (Optional) */}
          <div className="space-y-1.5 pt-1">
            <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLight ? 'text-slate-700' : 'text-[#94A3B8]'}`}>
              <Calendar size={13} className="text-amber-400" />
              <span>진행 기간 (선택 사항)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">시작일</span>
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={`w-full border rounded-2xl px-3 py-2 text-xs outline-none focus:border-[#00F5A0] transition-colors font-medium ${
                    isLight 
                      ? 'bg-slate-50 border-slate-300 text-slate-900' 
                      : 'bg-black/40 border-white/10 text-white'
                  }`}
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">종료일</span>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`w-full border rounded-2xl px-3 py-2 text-xs outline-none focus:border-[#00F5A0] transition-colors font-medium ${
                    isLight 
                      ? 'bg-slate-50 border-slate-300 text-slate-900' 
                      : 'bg-black/40 border-white/10 text-white'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`h-11 px-4 rounded-2xl text-xs font-medium border transition-colors ${
                isLight 
                  ? 'border-slate-300 text-slate-600 hover:bg-slate-100' 
                  : 'border-white/10 text-slate-400 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex-1 h-11 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#00F5A0] to-[#00D9A5] hover:opacity-95 active:scale-[0.98] text-[#0B0F17] font-bold text-xs transition-all shadow-lg shadow-[#00F5A0]/20 disabled:opacity-40 disabled:pointer-events-none"
            >
              <Sparkles size={15} />
              <span>장부 공간 생성 및 바로 전환</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
