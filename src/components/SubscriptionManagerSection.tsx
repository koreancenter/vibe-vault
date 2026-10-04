import React, { useState, useMemo } from 'react';
import { 
  SubscriptionItem, 
  Transaction, 
  SupportedCurrency, 
  FxRates 
} from '../types';
import { 
  detectSubscriptions, 
  saveSubscriptions,
  loadSavedSubscriptions
} from '../autonomousFinance';
import { getCurrencySymbol, getCategoryKo } from '../utils';
import { 
  Plus, 
  CheckCircle2, 
  PauseCircle, 
  AlertCircle, 
  Sparkles, 
  Trash2, 
  ArrowRight,
  TrendingDown,
  Info,
  Clock,
  CreditCard
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
  onTransactionChange
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

  // Recalculate whenever transactions or currency changes
  const activeSubscriptions = useMemo(() => {
    return subscriptions.filter(s => s.isActive);
  }, [subscriptions]);

  const totalMonthlyCommitment = useMemo(() => {
    return activeSubscriptions.reduce((acc, curr) => acc + curr.amount, 0);
  }, [activeSubscriptions]);

  const annualizedTotal = totalMonthlyCommitment * 12;

  const handleToggleActive = (id: string) => {
    const updated = subscriptions.map(s => {
      if (s.id === id) {
        return { ...s, isActive: !s.isActive };
      }
      return s;
    });
    setSubscriptions(updated);
    saveSubscriptions(updated);
  };

  const handleDelete = (id: string) => {
    const updated = subscriptions.filter(s => s.id !== id);
    setSubscriptions(updated);
    saveSubscriptions(updated);
  };

  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMerchant.trim() || !newAmount || isNaN(Number(newAmount))) return;

    const parsedAmount = Math.abs(Number(newAmount));
    const newSub: SubscriptionItem = {
      id: `manual_sub_${Date.now()}`,
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

  const getDDayBadge = (dDay: number) => {
    if (dDay === 0) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
          D-Day (오늘 결제)
        </span>
      );
    }
    if (dDay > 0 && dDay <= 3) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          D-{dDay} 결제 임박
        </span>
      );
    }
    if (dDay > 3) {
      return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
          isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-white/5 text-slate-400 border-white/10'
        }`}>
          D-{dDay}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        결제 완료
      </span>
    );
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      {/* Top Banner & KPI Summary: Clean Flat Surface (No box-in-box or dividing lines) */}
      <div className={`p-4 sm:p-5 rounded-3xl transition-all ${
        isLight 
          ? 'bg-slate-50/70 text-slate-900' 
          : 'bg-white/[0.02] text-white'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
          <div>
            <h3 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              정기 구독 & 고정 지출 레이더
            </h3>
          </div>

          <button
            type="button"
            id="add-subscription-btn"
            onClick={() => setIsAddModalOpen(true)}
            className={`h-8 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shrink-0 ${
              isLight
                ? 'bg-slate-900 text-white hover:bg-slate-800'
                : 'bg-white/10 hover:bg-white/15 text-white'
            }`}
          >
            <Plus size={13} />
            <span>구독 직접 추가</span>
          </button>
        </div>

        {/* 2-Metric Summary: Clean Flat Grid (No divide-x lines) */}
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
            <span className={`text-[10px] mt-0.5 block font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              활성 구독 {activeSubscriptions.length}개
            </span>
          </div>

          <div>
            <span className={`text-[11px] font-medium block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              연간 환산 고정비
            </span>
            <span className={`text-lg font-black tracking-tight mt-0.5 block ${
              isLight ? 'text-emerald-700' : 'text-[#00F5A0]'
            } ${isStealth ? 'blur-sm select-none' : ''}`}>
              {currSymbol}{annualizedTotal.toLocaleString()}
            </span>
            <span className={`text-[10px] mt-0.5 block font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              불필요한 구독 해지 시 절약 가능
            </span>
          </div>
        </div>
      </div>

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
          <div className={`p-6 text-center ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          }`}>
            <Clock size={24} className="mx-auto mb-2 opacity-40" />
            <p className="text-xs font-semibold">
              감지된 정기 구독이 아직 없습니다
            </p>
            <p className="text-[11px] mt-0.5 opacity-80">
              가계부에 2회 이상 정기 결제 내역이 등록되거나, 우측 상단 '구독 직접 추가'를 통해 등록하세요.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {subscriptions.map(sub => {
              const formattedNextDate = (() => {
                try {
                  return format(parseISO(sub.nextBillingDate), 'M월 d일');
                } catch {
                  return '일정 확인';
                }
              })();

              return (
                <div
                  key={sub.id}
                  className={`py-2.5 px-2 rounded-2xl transition-colors flex items-center justify-between gap-3 ${
                    !sub.isActive 
                      ? 'opacity-50' 
                      : isLight 
                        ? 'hover:bg-slate-100/70' 
                        : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-white'
                    }`}>
                      <CreditCard size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <strong className={`text-xs font-bold truncate ${
                          isLight ? 'text-slate-900' : 'text-white'
                        }`}>
                          {sub.merchant}
                        </strong>
                        {sub.isManual && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                            직접 등록
                          </span>
                        )}
                        {getDDayBadge(sub.dDay)}
                      </div>
                      <div className={`flex items-center gap-2 text-[11px] mt-0.5 ${
                        isLight ? 'text-slate-500' : 'text-slate-400'
                      }`}>
                        <span>{getCategoryKo(sub.category)}</span>
                        <span>·</span>
                        <span>{sub.cycleDays}일 주기</span>
                        <span>·</span>
                        <span>다음 {formattedNextDate}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <strong className={`text-sm font-bold tracking-tight block ${
                        isLight ? 'text-slate-950' : 'text-white'
                      } ${isStealth ? 'blur-sm select-none' : ''}`}>
                        {currSymbol}{sub.amount.toLocaleString()}
                      </strong>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(sub.id)}
                        title={sub.isActive ? '구독 일시중지' : '구독 다시 활성화'}
                        className={`p-1.5 rounded-lg transition-colors ${
                          sub.isActive
                            ? isLight ? 'hover:bg-slate-100 text-emerald-600' : 'hover:bg-white/10 text-[#00F5A0]'
                            : isLight ? 'hover:bg-slate-100 text-slate-400' : 'hover:bg-white/10 text-slate-500'
                        }`}
                      >
                        {sub.isActive ? <CheckCircle2 size={16} /> : <PauseCircle size={16} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(sub.id)}
                        title="목록에서 삭제"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Add Subscription Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`w-full max-w-sm rounded-3xl p-5 border shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0E1526] border-white/10 text-white'
          }`}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold flex items-center gap-1.5">
                <Sparkles size={16} className={isLight ? 'text-emerald-600' : 'text-[#00F5A0]'} />
                <span>정기 구독 직접 추가</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleAddManual} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold mb-1 text-slate-400">서비스 / 가맹점명</label>
                <input
                  type="text"
                  required
                  placeholder="예: 넷플릭스, 유튜브 프리미엄, 통신비"
                  value={newMerchant}
                  onChange={(e) => setNewMerchant(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-white/10 text-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1 text-slate-400">정기 결제 금액 ({currSymbol})</label>
                <input
                  type="number"
                  required
                  placeholder="예: 14900"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border outline-none font-bold ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-white/10 text-white'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold mb-1 text-slate-400">결제 주기(일)</label>
                  <input
                    type="number"
                    value={newCycleDays}
                    onChange={(e) => setNewCycleDays(Number(e.target.value))}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-white/10 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold mb-1 text-slate-400">다음 결제일</label>
                  <input
                    type="date"
                    value={newBillingDate}
                    onChange={(e) => setNewBillingDate(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-white/10 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-400 font-semibold"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#00D9F5] text-slate-950 font-bold"
                >
                  추가하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
