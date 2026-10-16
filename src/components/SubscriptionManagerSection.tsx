import React, { useState, useMemo, useRef, useEffect } from 'react';
import { generateSecureId } from '../identifiers';
import { 
  SubscriptionItem, 
  Transaction, 
  SupportedCurrency, 
  FxRates 
} from '../types';
import { 
  detectSubscriptions, 
  saveSubscriptions
} from '../autonomousFinance';
import { getCurrencySymbol, getCategoryKo } from '../utils';
import { 
  Plus, 
  Trash2, 
  X 
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface SubscriptionManagerSectionProps {
  transactions: Transaction[];
  currentCurrency: SupportedCurrency;
  fxRates: FxRates;
  isStealth?: boolean;
  theme?: 'dark' | 'light';
  onTransactionChange?: () => void;
}

export const SubscriptionManagerSection: React.FC<SubscriptionManagerSectionProps> = ({
  transactions,
  currentCurrency,
  fxRates,
  isStealth = false,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const currSymbol = getCurrencySymbol(currentCurrency);

  // Auto-detect and sync subscriptions
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>(() => {
    return detectSubscriptions(transactions, currentCurrency, fxRates);
  });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMerchant, setNewMerchant] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState('Living');
  const [newBillingDate, setNewBillingDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newCycleDays, setNewCycleDays] = useState(30);

  const addSubFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAddModalOpen && addSubFormRef.current) {
      addSubFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isAddModalOpen]);

  // Recalculate whenever transactions or currency changes
  const activeSubscriptions = useMemo(() => {
    return subscriptions.filter(s => s.isActive);
  }, [subscriptions]);

  const totalMonthlyCommitment = useMemo(() => {
    return activeSubscriptions.reduce((acc, curr) => acc + curr.amount, 0);
  }, [activeSubscriptions]);

  const annualizedTotal = totalMonthlyCommitment * 12;

  const handleDelete = (id: string) => {
    const updated = subscriptions.filter(s => s.id !== id);
    setSubscriptions(updated);
    saveSubscriptions(updated);
  };

  const handleDeleteSubscription = (id: string) => {
    handleDelete(id);
  };

  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMerchant.trim() || !newAmount || isNaN(Number(newAmount))) return;

    const parsedAmount = Math.abs(Number(newAmount));
    const newSub: SubscriptionItem = {
      id: generateSecureId('manual_sub'),
      merchant: newMerchant.trim(),
      amount: parsedAmount,
      currency: currentCurrency,
      category: newCategory,
      cycleDays: Number(newCycleDays) || 30,
      lastBillingDate: new Date(newBillingDate).toISOString(),
      nextBillingDate: new Date(newBillingDate).toISOString(),
      dDay: 0,
      confidence: 1.0,
      occurrencesCount: 1,
      isActive: true,
      isManual: true
    };

    const updated = [newSub, ...subscriptions];
    setSubscriptions(updated);
    saveSubscriptions(updated);

    // Reset
    setNewMerchant('');
    setNewAmount('');
    setIsAddModalOpen(false);
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      {/* Top Banner & KPI Summary: Clean Flat Surface */}
      <div className={`p-4 sm:p-5 rounded-3xl transition-all ${
        isLight 
          ? 'bg-slate-50/70 text-slate-900' 
          : 'bg-white/[0.02] text-white'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
          <div>
            <h2 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              정기 구독 & 고정 지출 레이더
            </h2>
          </div>

          <button
            type="button"
            id="add-subscription-btn"
            onClick={() => setIsAddModalOpen(!isAddModalOpen)}
            className="h-8 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-white transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={13} />
            <span>직접 추가</span>
          </button>
        </div>

        {/* 2-Metric Summary: Clean Flat Grid (No redundant subtitles) */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <span className={`text-[11px] font-medium block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              월간 고정 지출
            </span>
            <span className={`text-lg font-black tracking-tight mt-0.5 block ${
              isLight ? 'text-slate-900' : 'text-white'
            } ${isStealth ? 'blur-sm select-none' : ''}`}>
              {currSymbol}{totalMonthlyCommitment.toLocaleString()}
            </span>
          </div>

          <div>
            <span className={`text-[11px] font-medium block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              연간 환산 고정비
            </span>
            <span className={`text-lg font-bold tracking-tight mt-0.5 block ${
              isLight ? 'text-slate-900' : 'text-white'
            } ${isStealth ? 'blur-sm select-none' : ''}`}>
              {currSymbol}{annualizedTotal.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Inline Expandable Add Subscription Card */}
      {isAddModalOpen && (
        <div ref={addSubFormRef} className="p-4 rounded-2xl bg-white/[0.025] border border-white/[0.08] space-y-2.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <h3 className="text-xs font-semibold text-white">
              정기 구독 직접 추가
            </h3>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="text-neutral-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              title="닫기"
              aria-label="닫기"
            >
              <X size={14} />
            </button>
          </div>

          <form onSubmit={handleAddManual} className="space-y-2.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium mb-1 text-neutral-400">서비스 / 가맹점명</label>
                <input
                  type="text"
                  required
                  placeholder="예: 넷플릭스, 유튜브 프리미엄, 통신비"
                  value={newMerchant}
                  onChange={(e) => setNewMerchant(e.target.value)}
                  className="h-10 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 text-xs text-white placeholder:text-neutral-500 w-full outline-none focus:border-white/20 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium mb-1 text-neutral-400">정기 결제 금액 ({currSymbol})</label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-xs font-semibold select-none pointer-events-none text-neutral-400">{currSymbol}</span>
                  <input
                    type="number"
                    required
                    placeholder="예: 14900"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="h-10 bg-white/[0.03] border border-white/[0.08] rounded-xl pl-8 pr-3 text-xs text-white placeholder:text-neutral-500 w-full font-semibold outline-none focus:border-white/20 transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium mb-1 text-neutral-400">카테고리</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="h-10 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 text-xs text-white placeholder:text-neutral-500 w-full outline-none focus:border-white/20 transition-colors"
                >
                  <option value="Living" className="bg-[#111217] text-white">주거/통신</option>
                  <option value="Subscriptions" className="bg-[#111217] text-white">구독/스트리밍</option>
                  <option value="Education" className="bg-[#111217] text-white">교육/자기계발</option>
                  <option value="Finance" className="bg-[#111217] text-white">금융/보험</option>
                  <option value="Other" className="bg-[#111217] text-white">기타</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium mb-1 text-neutral-400">결제 주기(일)</label>
                <input
                  type="number"
                  value={newCycleDays}
                  onChange={(e) => setNewCycleDays(Number(e.target.value))}
                  className="h-10 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 text-xs text-white placeholder:text-neutral-500 w-full outline-none focus:border-white/20 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium mb-1 text-neutral-400">다음 결제일</label>
                <input
                  type="date"
                  value={newBillingDate}
                  onChange={(e) => setNewBillingDate(e.target.value)}
                  className="h-10 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 text-xs text-white placeholder:text-neutral-500 w-full outline-none focus:border-white/20 transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="py-2 px-3 rounded-xl border border-white/[0.08] bg-white/[0.04] text-neutral-400 hover:text-white text-xs cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                className="py-2 px-4 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-all shadow-sm cursor-pointer"
              >
                등록 완료
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Subscription List */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between px-1 text-xs">
          <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
            감지된 정기 결제 ({subscriptions.length})
          </span>
          <span className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            D-Day 순 정렬
          </span>
        </div>

        {subscriptions.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm py-7 px-4 flex flex-col items-center justify-center text-center gap-2.5">
            <p className="text-xs text-neutral-400 font-light">
              감지된 정기 결제가 없습니다. 우측 상단 '직접 추가'를 통해 등록하세요.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {subscriptions.map(s => {
              const formattedBillingDate = (() => {
                try {
                  return s.nextBillingDate ? format(parseISO(s.nextBillingDate), 'MM.dd') : '-';
                } catch {
                  return s.nextBillingDate ? s.nextBillingDate.slice(5, 10).replace('-', '.') : '-';
                }
              })();

              return (
                <div 
                  key={s.id} 
                  className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-1.5"
                >
                  {/* Row 1 (Top) */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs sm:text-sm font-medium text-white truncate min-w-0">
                      {s.merchant}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`font-mono text-xs sm:text-sm font-semibold text-white tabular-nums ${isStealth ? 'blur-sm select-none' : ''}`}>
                        {currSymbol}{s.amount.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubscription(s.id)}
                        className="p-1 -mr-1 rounded-lg text-neutral-500 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                        title="삭제"
                        aria-label={`${s.merchant} 구독 삭제`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Row 2 (Bottom) */}
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 font-light">
                    <span>{getCategoryKo(s.category)} · {s.cycleDays}일 주기 · 다음 결제 {formattedBillingDate}</span>
                    <span className="px-2 py-0.5 rounded-md bg-white/[0.05] text-neutral-300 font-mono text-[10px]">D-{s.dDay}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionManagerSection;
