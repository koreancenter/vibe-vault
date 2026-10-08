import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Transaction } from '../types';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { getCategoryKo } from '../utils';

// Permanent Quiet Luxury Dark Palette Constants
export const LUXURY_CATEGORY_COLORS: Record<string, string> = {
  Food: '#38bdf8',          // Refined Muted Sage Emerald
  Fixed: '#818cf8',         // Muted Indigo
  Living: '#fbbf24',        // Warm Amber
  Transport: '#38bdf8',     // Soft Sky Cyan
  Health: '#f472b6',        // Muted Rose Pink
  Leisure: '#c084fc',       // Soft Lavender
  Uncategorized: '#94a3b8', // Refined Slate
};

const SIGNATURE_ACCENT = '#38bdf8';

interface CategoryDonutChartProps {
  transactions: Transaction[];
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  currencySymbol?: string;
  isStealth?: boolean;
  embedded?: boolean;
}

export const CategoryDonutChart: React.FC<CategoryDonutChartProps> = ({
  transactions,
  selectedCategory,
  onSelectCategory,
  currencySymbol = 'KRW',
  isStealth = false,
  embedded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const currPrefix = currencySymbol === 'KRW' ? '₩' : currencySymbol === 'USD' ? '$' : `${currencySymbol} `;

  // Compute breakdown of expenses by category with consistent luxury palette colors
  const { categoryData, totalExpense } = useMemo(() => {
    const expenses = transactions.filter((t) => t.type === 'EXPENSE');
    const categoryTotals: Record<string, { total: number; count: number }> = {};
    let sum = 0;

    expenses.forEach((t) => {
      const cat = t.category || 'Uncategorized';
      if (!categoryTotals[cat]) {
        categoryTotals[cat] = { total: 0, count: 0 };
      }
      categoryTotals[cat].total += t.amount;
      categoryTotals[cat].count += 1;
      sum += t.amount;
    });

    const data = Object.entries(categoryTotals)
      .map(([category, info]) => ({
        category,
        amount: info.total,
        count: info.count,
        percentage: sum > 0 ? (info.total / sum) * 100 : 0,
        color: LUXURY_CATEGORY_COLORS[category] || LUXURY_CATEGORY_COLORS['Uncategorized'] || '#94a3b8',
      }))
      .sort((a, b) => b.amount - a.amount);

    return { categoryData: data, totalExpense: sum };
  }, [transactions]);

  // Render D3 Donut Chart
  useEffect(() => {
    if (!svgRef.current || categoryData.length === 0 || !isExpanded) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 160;
    const height = 160;
    const margin = 10;
    const radius = Math.min(width, height) / 2 - margin;
    const innerRadius = radius * 0.62; // Donut thickness

    const g = svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .append('g')
      .attr('transform', `translate(${width / 2}, ${height / 2})`);

    const pie = d3
      .pie<any>()
      .value((d) => d.amount)
      .sort(null)
      .padAngle(0.04);

    const arc = d3
      .arc<any>()
      .innerRadius(innerRadius)
      .outerRadius((d) => {
        // Expand arc slightly when selected or hovered
        const isHovered = hoveredCategory === d.data.category;
        const isSelected = selectedCategory === d.data.category;
        return isHovered || isSelected ? radius + 5 : radius;
      })
      .cornerRadius(4);

    const arcs = g
      .selectAll('.arc')
      .data(pie(categoryData))
      .enter()
      .append('g')
      .attr('class', 'arc')
      .style('cursor', 'pointer');

    arcs
      .append('path')
      .attr('d', arc)
      .attr('fill', (d) => d.data.color)
      .attr('stroke', (d) => 
        selectedCategory === d.data.category ? SIGNATURE_ACCENT : '#0B0F17'
      )
      .attr('stroke-width', (d) => selectedCategory === d.data.category ? 3 : 2)
      .style('opacity', (d) => {
        if (!selectedCategory) return 1;
        return selectedCategory === d.data.category ? 1 : 0.35;
      })
      .style('transition', 'all 0.2s ease-in-out')
      .on('mouseenter', (event, d) => {
        setHoveredCategory(d.data.category);
        d3.select(event.currentTarget as SVGPathElement)
          .transition()
          .duration(150)
          .attr('transform', 'scale(1.04)');
      })
      .on('mouseleave', (event) => {
        setHoveredCategory(null);
        d3.select(event.currentTarget as SVGPathElement)
          .transition()
          .duration(150)
          .attr('transform', 'scale(1)');
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        if (selectedCategory === d.data.category) {
          onSelectCategory(null);
        } else {
          onSelectCategory(d.data.category);
        }
      });

  }, [categoryData, selectedCategory, hoveredCategory, isExpanded]);

  if (categoryData.length === 0) return null;

  const activeCategoryInfo = categoryData.find(
    (c) => c.category === (hoveredCategory || selectedCategory)
  );

  return (
    <div className={embedded ? "" : "bg-white/[0.03] border border-white/[0.06] rounded-3xl p-4 shadow-xl backdrop-blur-xl transition-all"}>
      {/* Header (hidden if embedded in segmented controller) */}
      {!embedded && (
        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-white truncate">
              카테고리별 지출
            </span>
            <span className="text-[11px] text-[#94A3B8]">
              항목을 터치하여 필터링
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {selectedCategory && (
              <button
                type="button"
                onClick={() => onSelectCategory(null)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-sky-400/15 border border-sky-400/30 text-sky-300 text-xs font-semibold hover:bg-sky-400/25 active:scale-95 transition-all"
              >
                <span>{getCategoryKo(selectedCategory)}</span>
                <X size={12} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06] text-[#94A3B8] hover:text-white active:scale-95 transition-all"
              aria-label={isExpanded ? '접기' : '펼치기'}
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
      )}

      {(isExpanded || embedded) && (
        <div className="pt-2 flex flex-col sm:flex-row items-center gap-3 animate-in fade-in duration-150">
          {/* D3 Donut Visual with Center Badge */}
          <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
            <svg ref={svgRef} className="w-full h-full overflow-visible" />
            
            {/* Donut Center Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-1">
              <span className="text-[10px] font-medium truncate max-w-[80px] text-[#94A3B8]">
                {activeCategoryInfo ? getCategoryKo(activeCategoryInfo.category) : '총 지출'}
              </span>
              <span className={`text-xs font-black truncate max-w-[90px] text-white ${isStealth ? 'blur-xs select-none' : ''}`}>
                {currPrefix}{activeCategoryInfo
                  ? activeCategoryInfo.amount.toLocaleString()
                  : totalExpense.toLocaleString()}
              </span>
              <span className="text-[10px] font-bold text-sky-400">
                {activeCategoryInfo
                  ? `${activeCategoryInfo.percentage.toFixed(0)}%`
                  : ''}
              </span>
            </div>
          </div>

          {/* Interactive Legend Items Grid: Clean Flat Minimalist Buttons */}
          <div className="flex-1 w-full grid grid-cols-2 gap-1">
            {categoryData.map((item) => {
              const isSelected = selectedCategory === item.category;
              return (
                <button
                  key={item.category}
                  type="button"
                  onClick={() => onSelectCategory(isSelected ? null : item.category)}
                  onMouseEnter={() => setHoveredCategory(item.category)}
                  onMouseLeave={() => setHoveredCategory(null)}
                  className={`px-2.5 py-1.5 rounded-xl text-left transition-all flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-white/15 text-white font-bold'
                      : 'text-slate-300 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs font-medium truncate">{getCategoryKo(item.category)}</span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`text-xs font-bold block leading-tight text-white ${isStealth ? 'blur-xs select-none' : ''}`}>
                      {currPrefix}{item.amount.toLocaleString()}
                    </span>
                    <span className="text-[10px] block leading-tight text-[#94A3B8]">
                      {item.percentage.toFixed(0)}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
