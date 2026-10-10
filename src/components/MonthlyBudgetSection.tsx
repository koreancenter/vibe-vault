import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Check, 
  X, 
  RotateCcw, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { Transaction } from '../types';
import { 
  STANDARD_CATEGORIES, 
  getCategoryKo, 
  getCategoryBudgets, 
  saveCategoryBudgets,
  DEFAULT_CATEGORY_BUDGETS,
  RECOMMENDED_CATEGORY_BUDGETS,
  getUserPreferences
} from '../utils';
import { getAllTransactions } from '../db';
import { isSameMonth, isSameYear, parseISO, format } from 'date-fns';

interface MonthlyBudgetSectionProps {
  theme?: 'dark' | 'light';
  currencySymbol?: string;
  onBudgetChanged?: () => void;
}

export const MonthlyBudgetSection: React.FC<MonthlyBudgetSectionProps> = ({
  theme = 'dark',
  currencySymbol,
  onBudgetChanged,
}) => {
  const isLight = theme === 'light';
  const effectiveCurrency = currencySymbol || getUserPreferences().currencySymbol || 'KRW';
  const currSymbol = effectiveCurrency === 'KRW' ? '₩' : effectiveCurrency === 'USD' ? '$' : `${effectiveCurrency} `;

  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editLimitValue, setEditLimitValue] = useState<string>('');
  
  // Add new budget category state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCategoryKey, setNewCategoryKey] = useState<string>('Food');
  const [newLimitValue, setNewLimitValue] = useState<string>('300000');
  const [banner, setBanner] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);

  const now = new Date();
  const currentMonthName = format(now, 'M월');

  // Load budgets & transactions
  const loadData = () => {
    const loadedBudgets = getCategoryBudgets();
    setBudgets(loadedBudgets);

    getAllTransactions()
      .then((txs) => {
        setTransactions(txs);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute current month expenses per category
  const spendingPerCategory = useMemo(() => {
    const currentMonthExpenses = transactions.filter((t) => {
      try {
        const d = parseISO(t.date);
        return t.type === 'EXPENSE' && isSameMonth(d, now) && isSameYear(d, now);
      } catch {
        return false;
      }
    });

    const mapping: Record<string, number> = {};
    currentMonthExpenses.forEach((t) => {
      mapping[t.category] = (mapping[t.category] || 0) + t.amount;
    });

    return mapping;
  }, [transactions, now]);

  // Overall totals across all budgeted categories
  const overallStats = useMemo(() => {
    const categoriesWithBudget = Object.keys(budgets);
    const totalBudget = categoriesWithBudget.reduce((sum, cat) => sum + (budgets[cat] || 0), 0);
    
    // Spent in budgeted categories
    const totalSpent = categoriesWithBudget.reduce((sum, cat) => sum + (spendingPerCategory[cat] || 0), 0);
    const remaining = totalBudget - totalSpent;
    const spentPercent = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;
    const remainingPercent = totalBudget > 0 ? Math.max(0, 100 - Math.round((totalSpent / totalBudget) * 100)) : 0;

    return {
      totalBudget,
      totalSpent,
      remaining,
      spentPercent,
      remainingPercent,
      isOver: remaining < 0,
    };
  }, [budgets, spendingPerCategory]);

  const updateBudgetsState = (newBudgets: Record<string, number>) => {
    setBudgets(newBudgets);
    saveCategoryBudgets(newBudgets);
    if (onBudgetChanged) {
      onBudgetChanged();
    }
  };

  // Start inline editing
  const handleStartEdit = (category: string, currentLimit: number) => {
    setEditingCategory(category);
    setEditLimitValue(String(currentLimit));
  };

  // Save inline edit
  const handleSaveEdit = (category: string) => {
    const numeric = parseInt(editLimitValue.replace(/[^0-9]/g, ''), 10);
    if (isNaN(numeric) || numeric < 0) {
      setBanner({ type: 'error', message: '올바른 예산 금액을 입력해주세요.' });
      return;
    }

    const updated = { ...budgets, [category]: numeric };
    updateBudgetsState(updated);
    setEditingCategory(null);
    setBanner({
      type: 'success',
      message: `'${getCategoryKo(category)}' 월간 예산이 ${currSymbol}${numeric.toLocaleString()}으로 변경되었습니다.`
    });
  };

  // Quick adjust during edit
  const handleQuickAdjust = (delta: number) => {
    const current = parseInt(editLimitValue.replace(/[^0-9]/g, ''), 10) || 0;
    const nextVal = Math.max(0, current + delta);
    setEditLimitValue(String(nextVal));
  };

  // Delete category budget
  const handleDeleteBudget = (category: string) => {
    const updated = { ...budgets };
    delete updated[category];
    updateBudgetsState(updated);
    setBanner({
      type: 'info',
      message: `'${getCategoryKo(category)}' 예산 설정이 삭제되었습니다.`
    });
  };

  // Reset to defaults
  const handleResetDefaults = () => {
    updateBudgetsState(RECOMMENDED_CATEGORY_BUDGETS);
    setBanner({
      type: 'success',
      message: '카테고리 예산이 기본 권장값으로 초기화되었습니다.'
    });
  };

  // Add new budget
  const handleAddBudget = () => {
    const numeric = parseInt(newLimitValue.replace(/[^0-9]/g, ''), 10);
    if (isNaN(numeric) || numeric <= 0) {
      setBanner({ type: 'error', message: '0원 이상의 예산 한도를 입력해주세요.' });
      return;
    }

    const updated = { ...budgets, [newCategoryKey]: numeric };
    updateBudgetsState(updated);
    setShowAddModal(false);
    setBanner({
      type: 'success',
      message: `'${getCategoryKo(newCategoryKey)}' 카테고리에 월 ${currSymbol}${numeric.toLocaleString()} 예산이 설정되었습니다.`
    });
  };

  // Find categories not yet budgeted
  const unbudgetedCategories = STANDARD_CATEGORIES.filter(
    (cat) => budgets[cat.key] === undefined
  );

  // Helper for emoji
  const getCategoryEmoji = (key: string) => {
    const found = STANDARD_CATEGORIES.find((c) => c.key === key);
    if (found) return found.emoji;
    return '📁';
  };

  return (
    <div id="monthly-budget-section" className="space-y-3">
      {/* Header Bar - Flattened without nested card wrapping or divider lines */}
      <div className="flex items-center justify-between gap-2 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-xs font-semibold tracking-tight text-white">
                월간 예산
              </h2>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                isLight ? 'bg-neutral-200 text-neutral-800' : 'bg-white/[0.08] text-neutral-300 border border-white/10'
              }`}>
                {currentMonthName} 현황
              </span>
            </div>
            <p className={`text-[11px] truncate ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}>
              카테고리별 지출 한도 및 잔여 예산 관리
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all active:scale-95 ${
              isLight 
                ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-900' 
                : 'hover:bg-white/10 text-neutral-400 hover:text-white'
            }`}
            title="권장 기본 예산으로 초기화"
          >
            <RotateCcw size={12} />
            <span className="hidden sm:inline text-[11px]">기본값</span>
          </button>

          <button
            type="button"
            id="btn-add-budget-category"
            onClick={() => {
              if (unbudgetedCategories.length > 0) {
                setNewCategoryKey(unbudgetedCategories[0].key);
              }
              setShowAddModal(true);
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1 bg-white text-black hover:bg-neutral-200 active:scale-95 transition-all shadow-xs"
          >
            <Plus size={13} />
            <span>예산 추가</span>
          </button>
        </div>
      </div>

      {/* Action feedback banner */}
      {banner && (
        <div className={`p-2.5 rounded-xl text-xs flex items-center justify-between animate-in fade-in duration-150 ${
          banner.type === 'success' 
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
            : banner.type === 'error'
            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            : 'bg-white/10 text-white border border-white/10'
        }`}>
          <span className="truncate">{banner.message}</span>
          <button 
            onClick={() => setBanner(null)} 
            className="ml-2 font-bold hover:opacity-75"
          >
            ×
          </button>
        </div>
      )}

      {/* Overall Budget Remaining Summary - Flat borderless block with slim 3px progress line */}
      <div className="py-2 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className={`font-medium ${isLight ? 'text-slate-700' : 'text-neutral-300'}`}>
            총 예산 잔여액
          </span>
          <span className={`font-semibold tabular-nums ${
            overallStats.isOver 
              ? 'text-rose-400' 
              : 'text-white'
          }`}>
            {overallStats.isOver 
              ? `${currSymbol}${Math.abs(overallStats.remaining).toLocaleString()} 초과!` 
              : `${currSymbol}${overallStats.remaining.toLocaleString()} 남음 (${overallStats.remainingPercent}%)`}
          </span>
        </div>

        {/* Slim 3px Accent Gauge Line */}
        <div className={`w-full h-[3px] rounded-full overflow-hidden ${
          isLight ? 'bg-slate-200' : 'bg-white/10'
        }`}>
          <div 
            className={`h-full transition-all duration-500 rounded-full ${
              overallStats.isOver 
                ? 'bg-rose-500' 
                : overallStats.spentPercent > 80 
                ? 'bg-amber-400' 
                : isLight ? 'bg-slate-900' : 'bg-white'
            }`}
            style={{ width: `${Math.min(100, overallStats.spentPercent)}%` }}
          />
        </div>

        <div className={`flex items-center justify-between text-[10px] ${
          isLight ? 'text-slate-500' : 'text-neutral-400'
        }`}>
          <span>총 지출: <strong className={isLight ? 'text-slate-800' : 'text-white'}>{currSymbol}{overallStats.totalSpent.toLocaleString()}</strong></span>
          <span>총 한도: <strong className={isLight ? 'text-slate-800' : 'text-white'}>{currSymbol}{overallStats.totalBudget.toLocaleString()}</strong></span>
          <span>소진율: <strong className={overallStats.isOver ? 'text-rose-400' : 'text-neutral-200'}>{overallStats.spentPercent}%</strong></span>
        </div>
      </div>

      {/* Category Budget Items List - Flat Borderless Rows */}
      <div className="space-y-1">
        {Object.keys(budgets).length === 0 ? (
          <div className={`py-6 px-3 text-center ${
            isLight ? 'text-slate-500' : 'text-neutral-400'
          }`}>
            <p className="text-xs font-medium text-neutral-300">설정된 카테고리 예산이 없습니다.</p>
            <p className="text-[11px] mt-0.5 text-neutral-400">우측 상단 '예산 추가' 또는 '기본값'을 눌러 시작해보세요.</p>
          </div>
        ) : (
          Object.entries(budgets).map(([category, rawLimit]) => {
            const limit = Number(rawLimit) || 0;
            const spent = spendingPerCategory[category] || 0;
            const remaining = limit - spent;
            const isOver = remaining < 0;
            const spentPercent = limit > 0 ? Math.round((spent / limit) * 100) : 0;
            const isEditing = editingCategory === category;

            if (isEditing) {
              return (
                <div 
                  key={category}
                  className={`py-2 px-1 space-y-2 animate-in fade-in duration-100 ${
                    isLight ? 'bg-slate-50/80' : 'bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <span>{getCategoryEmoji(category)}</span>
                      <span>{getCategoryKo(category)} 한도 수정</span>
                    </div>
                    <span className="text-[10px] text-slate-400">ESC로 취소</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1.5 text-xs text-slate-400">{currSymbol}</span>
                      <input
                        type="number"
                        value={editLimitValue}
                        onChange={(e) => setEditLimitValue(e.target.value)}
                        className={`w-full pl-6 pr-2 py-1 rounded-md text-xs font-bold outline-none border ${
                          isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-white/20 text-white'
                        }`}
                        placeholder="예: 500000"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(category);
                          if (e.key === 'Escape') setEditingCategory(null);
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(category)}
                      className="px-2.5 py-1 bg-white text-black hover:bg-neutral-200 font-medium text-xs rounded-lg flex items-center gap-1 active:scale-95 transition-all shadow-xs"
                    >
                      <Check size={12} />
                      <span>확인</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCategory(null)}
                      className={`p-1 rounded-md text-xs ${
                        isLight ? 'text-slate-500 hover:bg-slate-200' : 'text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      <X size={12} />
                    </button>
                  </div>

                  {/* Quick Adjust Buttons */}
                  <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                    <span className="text-[10px] text-slate-400 mr-0.5">빠른 증감:</span>
                    {[+50000, +100000, +500000, -50000].map((adj) => (
                      <button
                        key={adj}
                        type="button"
                        onClick={() => handleQuickAdjust(adj)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                          isLight 
                            ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700' 
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                        }`}
                      >
                        {adj > 0 ? `+${adj / 10000}만` : `${adj / 10000}만`}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            {/* Flat 1-Row Table Item: [Icon] [Category Name] [Thin Progress Bar & %] [Spent / Limit Amount] [Edit/Delete Icons] */}
            return (
              <div 
                key={category}
                id={`budget-row-${category}`}
                className={`group py-2 px-1 flex items-center justify-between gap-3 transition-colors ${
                  isLight ? 'hover:bg-slate-50/70' : 'hover:bg-white/[0.02]'
                }`}
              >
                {/* 1. [Icon] + [Category Name] */}
                <div className="flex items-center gap-2 w-28 sm:w-32 shrink-0 min-w-0">
                  <span className="text-sm select-none shrink-0">{getCategoryEmoji(category)}</span>
                  <span className={`text-xs font-semibold truncate ${isLight ? 'text-slate-900' : 'text-white'}`} title={getCategoryKo(category)}>
                    {getCategoryKo(category)}
                  </span>
                </div>

                {/* 2. [Thin Progress Bar & %] (3px slim gauge line) */}
                <div className="flex-1 min-w-[80px] sm:min-w-[120px] flex items-center gap-2">
                  <div className={`flex-1 h-[3px] rounded-full overflow-hidden ${
                    isLight ? 'bg-slate-200' : 'bg-white/10'
                  }`}>
                    <div 
                      className={`h-full transition-all duration-300 rounded-full ${
                        isOver 
                          ? 'bg-rose-500' 
                          : spentPercent >= 80 
                          ? 'bg-amber-400' 
                          : isLight ? 'bg-slate-900' : 'bg-white'
                      }`}
                      style={{ width: `${Math.min(100, spentPercent)}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-bold shrink-0 w-8 text-right tabular-nums ${
                    isOver ? 'text-rose-400' : spentPercent >= 80 ? 'text-amber-400' : 'text-neutral-300'
                  }`}>
                    {spentPercent}%
                  </span>
                </div>

                {/* 3. [Spent / Limit Amount] */}
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold tabular-nums whitespace-nowrap">
                    <span className={isLight ? 'text-slate-900' : 'text-slate-100'}>
                      {currSymbol}{spent.toLocaleString()}
                    </span>
                    <span className={`text-[11px] font-normal mx-1 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>/</span>
                    <span className={`text-[11px] font-normal ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {currSymbol}{limit.toLocaleString()}
                    </span>
                  </div>
                  <div className={`text-[10px] font-medium tabular-nums ${
                    isOver ? 'text-rose-500' : isLight ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    {isOver 
                      ? `${currSymbol}${Math.abs(remaining).toLocaleString()} 초과` 
                      : `잔여 ${currSymbol}${remaining.toLocaleString()}`}
                  </div>
                </div>

                {/* 4. [Edit/Delete Icons] */}
                <div className="flex items-center gap-0.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(category, limit)}
                    className={`p-1 rounded text-xs transition-colors ${
                      isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-slate-400'
                    }`}
                    title="한도 수정"
                    aria-label={`${getCategoryKo(category)} 한도 수정`}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBudget(category)}
                    className={`p-1 rounded text-xs transition-colors ${
                      isLight ? 'hover:bg-rose-50 text-slate-400 hover:text-rose-600' : 'hover:bg-rose-500/10 text-slate-500 hover:text-rose-400'
                    }`}
                    title="예산 삭제"
                    aria-label={`${getCategoryKo(category)} 예산 삭제`}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Category Budget Modal / Inline Drawer */}
      {showAddModal && (
        <div className={`p-4 rounded-2xl border animate-in zoom-in-95 duration-150 ${
          isLight ? 'bg-slate-50 border-slate-200 shadow-sm' : 'bg-[#111217] border-white/10 shadow-xl'
        }`}>
          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
            <h3 className="text-xs font-semibold text-white">
              새 카테고리 예산 설정
            </h3>
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="text-neutral-400 hover:text-white p-1"
            >
              <X size={14} />
            </button>
          </div>

          <div className="pt-3 space-y-3">
            <div>
              <label className={`text-[11px] font-medium block mb-1 ${isLight ? 'text-slate-700' : 'text-neutral-300'}`}>
                카테고리 선택
              </label>
              <select
                value={newCategoryKey}
                onChange={(e) => setNewCategoryKey(e.target.value)}
                className={`w-full p-2.5 rounded-xl text-xs font-medium outline-none border transition-colors ${
                  isLight 
                    ? 'bg-slate-50 border-slate-300 text-slate-900' 
                    : 'bg-white/[0.03] border-white/10 text-white focus:border-white/30'
                }`}
              >
                {STANDARD_CATEGORIES.map((cat) => (
                  <option key={cat.key} value={cat.key} className="bg-[#111217] text-white">
                    {cat.emoji} {cat.nameKo} {budgets[cat.key] !== undefined ? ' - 기존 설정 덮어쓰기' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`text-[11px] font-medium block mb-1 ${isLight ? 'text-slate-700' : 'text-neutral-300'}`}>
                월간 지출 한도 ({currSymbol})
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-neutral-400">{currSymbol}</span>
                <input
                  type="number"
                  value={newLimitValue}
                  onChange={(e) => setNewLimitValue(e.target.value)}
                  placeholder="예: 300000"
                  className={`w-full pl-8 pr-3 py-2 rounded-xl text-xs font-semibold outline-none border transition-colors ${
                    isLight 
                      ? 'bg-slate-50 border-slate-300 text-slate-900' 
                      : 'bg-white/[0.03] border-white/10 text-white focus:border-white/30'
                  }`}
                />
              </div>

              {/* Quick Limit Presets */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {[100000, 200000, 300000, 500000, 1000000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setNewLimitValue(String(amt))}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                      newLimitValue === String(amt)
                        ? 'bg-white text-black border-white font-semibold shadow-xs'
                        : isLight 
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700' 
                        : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-neutral-300'
                    }`}
                  >
                    {amt / 10000}만원
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className={`px-3 py-1.5 rounded-xl text-xs font-normal border transition-colors ${
                  isLight ? 'border-slate-300 text-slate-600' : 'border-white/10 text-neutral-300 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleAddBudget}
                className="px-4 py-1.5 rounded-xl text-xs font-medium bg-white text-black hover:bg-neutral-200 active:scale-95 transition-all shadow-xs"
              >
                예산 등록 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
