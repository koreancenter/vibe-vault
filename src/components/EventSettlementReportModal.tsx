import React, { useState, useMemo } from 'react';
import { 
  X, 
  Printer, 
  Download, 
  Users, 
  Calendar, 
  CheckCircle2, 
  ArrowDownRight, 
  ArrowUpRight,
  Calculator,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';
import { LedgerSpace, Transaction } from '../types';
import { format, parseISO } from 'date-fns';
import { getCategoryKo, getCurrencySymbol } from '../utils';

interface EventSettlementReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  space: LedgerSpace;
  transactions: Transaction[];
  onUpdateSpace?: (updatedSpace: LedgerSpace) => void;
  theme?: 'light' | 'dark';
}

export const EventSettlementReportModal: React.FC<EventSettlementReportModalProps> = ({
  isOpen,
  onClose,
  space,
  transactions,
  onUpdateSpace,
  theme = 'dark'
}) => {
  const isLight = theme === 'light';

  // Allow inline editing of member count for settlement recalculation
  const [memberCount, setMemberCount] = useState<number>(() => {
    return space.memberCount && space.memberCount > 0 ? space.memberCount : 4;
  });

  const currencySymbol = getCurrencySymbol(space.currency || 'KRW');
  const printDateStr = format(new Date(), 'yyyy.MM.dd');

  // Chronologically sorted transactions (Oldest -> Newest)
  const chronologicalTxs = useMemo(() => {
    return [...transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [transactions]);

  // Derived date range if not specified on space
  const dateRangeStr = useMemo(() => {
    if (space.startDate && space.endDate) {
      return `${space.startDate} ~ ${space.endDate}`;
    }
    if (chronologicalTxs.length > 0) {
      const firstDate = format(parseISO(chronologicalTxs[0].date), 'yyyy.MM.dd');
      const lastDate = format(parseISO(chronologicalTxs[chronologicalTxs.length - 1].date), 'yyyy.MM.dd');
      return `${firstDate} ~ ${lastDate}`;
    }
    return '진행 기간 미지정';
  }, [space.startDate, space.endDate, chronologicalTxs]);

  // Strict Korean Standard Running Balance Calculation
  const { rows, totalIncome, totalExpense, finalBalance } = useMemo(() => {
    let running = 0;
    let incomeSum = 0;
    let expenseSum = 0;

    const computedRows = chronologicalTxs.map((tx, idx) => {
      const isIncome = tx.type === 'INCOME' || (tx.type === 'SETTLEMENT' && tx.amount > 0);
      const isExpense = tx.type === 'EXPENSE';

      const incomeAmt = isIncome ? tx.amount : 0;
      const expenseAmt = isExpense ? tx.amount : 0;

      incomeSum += incomeAmt;
      expenseSum += expenseAmt;
      running = running + incomeAmt - expenseAmt;

      const categoryName = tx.isInternalTransfer
        ? (tx.subCategory || '내부이체')
        : getCategoryKo(tx.category, tx.subCategory);

      return {
        no: idx + 1,
        id: tx.id,
        date: tx.date,
        category: categoryName,
        description: tx.description,
        income: incomeAmt,
        expense: expenseAmt,
        runningBalance: running,
        note: tx.note || tx.paymentMethod || '-'
      };
    });

    return {
      rows: computedRows,
      totalIncome: incomeSum,
      totalExpense: expenseSum,
      finalBalance: running
    };
  }, [chronologicalTxs]);

  // N-Split Calculations
  const activeMembers = Math.max(1, memberCount);
  const perPersonExpense = Math.round(totalExpense / activeMembers);
  const perPersonNet = Math.round(finalBalance / activeMembers);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleMemberCountChange = (newCount: number) => {
    const val = Math.max(1, newCount);
    setMemberCount(val);
    if (onUpdateSpace) {
      onUpdateSpace({
        ...space,
        memberCount: val
      });
    }
  };

  const handleExportCSV = () => {
    const bom = '\uFEFF';
    let csv = `${space.name} 공식 결산 보고서\r\n`;
    csv += `결산 기간,"${dateRangeStr}"\r\n`;
    csv += `출력 일시,"${printDateStr}"\r\n`;
    csv += `기준 통화,"${space.currency}"\r\n`;
    csv += `총 참여 인원,"${activeMembers}명"\r\n\r\n`;
    csv += `번호,날짜,항목,내역,수입,지출,잔액,비고\r\n`;

    rows.forEach((r) => {
      const incStr = r.income > 0 ? `+${r.income}` : '';
      const expStr = r.expense > 0 ? `-${r.expense}` : '';
      const dateFormatted = format(parseISO(r.date), 'yyyy.MM.dd HH:mm');
      const safeDesc = (r.description || '').replace(/"/g, '""');
      const safeNote = (r.note || '').replace(/"/g, '""');
      csv += `"${r.no}","${dateFormatted}","${r.category}","${safeDesc}","${incStr}","${expStr}","${r.runningBalance}","${safeNote}"\r\n`;
    });

    csv += `\r\n`;
    csv += `총 수입 합계,,,,+${totalIncome},,,\r\n`;
    csv += `총 지출 합계,,,,,-${totalExpense},,\r\n`;
    csv += `최종 잔액,,,,,${finalBalance},,\r\n`;
    csv += `1인당 정산 금액 (총 지출 ÷ ${activeMembers}명),,,,,${perPersonExpense},,\r\n`;
    csv += `1인당 ${finalBalance >= 0 ? '환급금' : '추가납부액'} (최종 잔액 ÷ ${activeMembers}명),,,,,${perPersonNet},,\r\n`;

    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${space.name}_공식결산보고서_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Print Specific CSS Override */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          html, body {
            background: #ffffff !important;
            color: #111827 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            overflow: visible !important;
            height: auto !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-settlement-modal, #printable-settlement-modal * {
            visibility: visible !important;
          }
          #printable-settlement-modal {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #111827 !important;
            border: none !important;
            box-shadow: none !important;
          }
          .screen-only {
            display: none !important;
          }
          .print-border {
            border: 1px solid #1f2937 !important;
          }
          .print-header-bg {
            background-color: #f3f4f6 !important;
          }
          .print-break-inside-avoid {
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div 
          id="printable-settlement-modal"
          className={`w-full max-w-4xl rounded-3xl border shadow-2xl flex flex-col my-auto transition-colors ${
            isLight 
              ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/60' 
              : 'bg-[#0E1524] border-white/10 text-white shadow-2xl'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Interactive Screen Bar (Hidden on print) */}
          <div className="screen-only flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/10 border border-sky-500/20 text-sky-400">
                📄 공식 결산서
              </span>
              <span className="text-xs text-slate-400">
                A4 출력 및 엑셀 다운로드 최적화
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Inline Participant Counter */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-black/20 text-xs">
                <Users size={13} className="text-blue-400" />
                <span className="text-slate-400">참여 인원:</span>
                <button
                  type="button"
                  onClick={() => handleMemberCountChange(activeMembers - 1)}
                  className="w-5 h-5 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 active:scale-95 font-bold"
                  title="1명 감소"
                >
                  -
                </button>
                <span className="font-bold tabular-nums px-1 text-white">{activeMembers}명</span>
                <button
                  type="button"
                  onClick={() => handleMemberCountChange(activeMembers + 1)}
                  className="w-5 h-5 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 active:scale-95 font-bold"
                  title="1명 증가"
                >
                  +
                </button>
              </div>

              {/* CSV Export */}
              <button
                type="button"
                onClick={handleExportCSV}
                className="h-9 px-3.5 rounded-xl text-xs font-medium border border-white/10 bg-white/[0.04] hover:bg-white/10 text-slate-200 flex items-center gap-1.5 active:scale-95 transition-all"
                title="엑셀 CSV 다운로드"
              >
                <FileSpreadsheet size={14} className="text-sky-400" />
                <span>엑셀 CSV</span>
              </button>

              {/* Print / Save PDF */}
              <button
                type="button"
                onClick={handlePrint}
                className="h-9 px-4 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center gap-1.5 active:scale-95 transition-all shadow-md shadow-sky-500/20"
                title="A4 용지 인쇄 및 PDF 저장"
              >
                <Printer size={14} />
                <span>A4 인쇄 / PDF 저장</span>
              </button>

              {/* Close */}
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors ml-1"
                aria-label="닫기"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Printable Document Body Container */}
          <div className="p-6 sm:p-10 max-h-[85dvh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0">
            {/* 1. DOCUMENT HEADER */}
            <div className="border-b-2 border-slate-700 print:border-black pb-4 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white print:text-black">
                    {space.name} 결산 보고서
                  </h1>
                  <p className="text-xs text-slate-400 print:text-gray-600 mt-1">
                    프로젝트 및 행사 지출·수입 정산 내역서 (공식 회계 양식)
                  </p>
                </div>
                <div className="text-left sm:text-right text-xs text-slate-400 print:text-gray-700 space-y-0.5 tabular-nums">
                  <div>출력일시: <strong className="text-white print:text-black font-semibold">{printDateStr}</strong></div>
                  <div>결산 기간: <span className="text-white print:text-black">{dateRangeStr}</span></div>
                  <div>기준 통화: <span className="font-bold text-sky-400 print:text-black">{space.currency}</span></div>
                </div>
              </div>

              {/* Metadata Grid Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5 print:gap-2">
                <div className="p-3 rounded-xl border border-white/10 print:border-gray-400 bg-white/[0.02] print:bg-gray-50">
                  <span className="text-[11px] text-slate-400 print:text-gray-600 block">총 참여 인원</span>
                  <span className="text-base font-extrabold text-white print:text-black tabular-nums">
                    {activeMembers}명
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-white/10 print:border-gray-400 bg-white/[0.02] print:bg-gray-50">
                  <span className="text-[11px] text-slate-400 print:text-gray-600 block">총 거래 건수</span>
                  <span className="text-base font-extrabold text-white print:text-black tabular-nums">
                    {rows.length}건
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-white/10 print:border-gray-400 bg-white/[0.02] print:bg-gray-50">
                  <span className="text-[11px] text-slate-400 print:text-gray-600 block">총 수입 (회비 등)</span>
                  <span className="text-base font-extrabold text-sky-400 print:text-black tabular-nums">
                    +{currencySymbol}{totalIncome.toLocaleString()}
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-white/10 print:border-gray-400 bg-white/[0.02] print:bg-gray-50">
                  <span className="text-[11px] text-slate-400 print:text-gray-600 block">총 지출 금액</span>
                  <span className="text-base font-extrabold text-rose-400 print:text-black tabular-nums">
                    -{currencySymbol}{totalExpense.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. CHRONOLOGICAL LEDGER TABLE (Strict Korean Standard Columns) */}
            <div className="space-y-2 mb-6">
              <div className="flex items-center justify-between text-xs text-slate-400 print:text-gray-700 px-0.5">
                <span className="font-semibold text-slate-300 print:text-black">
                  수입 및 지출 상세 내역 (시간순 정렬)
                </span>
                <span className="text-[11px]">단위: {space.currency}</span>
              </div>

              {rows.length === 0 ? (
                <div className="p-8 text-center border border-white/10 rounded-2xl print:border-gray-400 text-xs text-slate-400 print:text-gray-600">
                  기록된 거래 내역이 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10 print:border-gray-400">
                  <table className="w-full text-left border-collapse text-xs print:text-[11px]">
                    <thead>
                      <tr className="bg-white/[0.04] print:bg-gray-100 text-slate-300 print:text-black font-semibold border-b border-white/10 print:border-gray-400">
                        <th className="py-2.5 px-2.5 text-center w-12 border-r border-white/5 print:border-gray-300">번호</th>
                        <th className="py-2.5 px-3 w-28 border-r border-white/5 print:border-gray-300">날짜</th>
                        <th className="py-2.5 px-3 w-24 border-r border-white/5 print:border-gray-300">항목</th>
                        <th className="py-2.5 px-3 border-r border-white/5 print:border-gray-300">내역</th>
                        <th className="py-2.5 px-3 text-right w-28 border-r border-white/5 print:border-gray-300">수입 (+)</th>
                        <th className="py-2.5 px-3 text-right w-28 border-r border-white/5 print:border-gray-300">지출 (-)</th>
                        <th className="py-2.5 px-3 text-right w-28 border-r border-white/5 print:border-gray-300">잔액</th>
                        <th className="py-2.5 px-3 w-28">비고</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 print:divide-gray-300">
                      {rows.map((row) => (
                        <tr 
                          key={row.id}
                          className="hover:bg-white/[0.02] print:hover:bg-transparent transition-colors"
                        >
                          <td className="py-2 px-2.5 text-center text-slate-400 print:text-gray-600 tabular-nums border-r border-white/5 print:border-gray-300">
                            {row.no}
                          </td>
                          <td className="py-2 px-3 text-slate-300 print:text-black tabular-nums whitespace-nowrap border-r border-white/5 print:border-gray-300">
                            {format(parseISO(row.date), 'yyyy.MM.dd')}
                          </td>
                          <td className="py-2 px-3 text-slate-300 print:text-black border-r border-white/5 print:border-gray-300">
                            {row.category}
                          </td>
                          <td className="py-2 px-3 text-white print:text-black font-medium border-r border-white/5 print:border-gray-300">
                            {row.description}
                          </td>
                          <td className="py-2 px-3 text-right font-medium tabular-nums text-sky-400 print:text-black border-r border-white/5 print:border-gray-300">
                            {row.income > 0 ? `+${currencySymbol}${row.income.toLocaleString()}` : ''}
                          </td>
                          <td className="py-2 px-3 text-right font-medium tabular-nums text-rose-400 print:text-black border-r border-white/5 print:border-gray-300">
                            {row.expense > 0 ? `-${currencySymbol}${row.expense.toLocaleString()}` : ''}
                          </td>
                          <td className="py-2 px-3 text-right font-bold tabular-nums text-slate-200 print:text-black border-r border-white/5 print:border-gray-300">
                            {currencySymbol}{row.runningBalance.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-slate-400 print:text-gray-600 truncate max-w-[120px]">
                            {row.note}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Table Summary Footer Row */}
                    <tfoot>
                      <tr className="bg-white/[0.06] print:bg-gray-100 font-bold border-t-2 border-slate-700 print:border-black text-slate-200 print:text-black">
                        <td colSpan={4} className="py-2.5 px-3 text-center border-r border-white/5 print:border-gray-300">
                          합계
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-sky-400 print:text-black border-r border-white/5 print:border-gray-300">
                          +{currencySymbol}{totalIncome.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-rose-400 print:text-black border-r border-white/5 print:border-gray-300">
                          -{currencySymbol}{totalExpense.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-white print:text-black font-extrabold border-r border-white/5 print:border-gray-300">
                          {currencySymbol}{finalBalance.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-center text-[10px] text-slate-400 print:text-gray-600">
                          차인잔고
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* 3. BOTTOM SETTLEMENT SUMMARY BOX & 4. N-SPLIT BOX */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:gap-3 print-break-inside-avoid">
              {/* Bottom Settlement Summary Box */}
              <div className="p-5 rounded-2xl border border-white/10 print:border-black bg-white/[0.02] print:bg-white space-y-3">
                <h3 className="text-xs font-bold text-slate-300 print:text-black border-b border-white/10 print:border-gray-300 pb-2">
                  <span>공식 결산 총계 요약</span>
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-300 print:text-gray-700">
                    <span>총 수입 합계</span>
                    <span className="font-bold text-sky-400 print:text-black tabular-nums">
                      +{currencySymbol}{totalIncome.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300 print:text-gray-700">
                    <span>총 지출 합계</span>
                    <span className="font-bold text-rose-400 print:text-black tabular-nums">
                      -{currencySymbol}{totalExpense.toLocaleString()}
                    </span>
                  </div>
                  <div className="border-t border-white/10 print:border-gray-300 pt-2 flex justify-between items-center">
                    <span className="font-extrabold text-sm text-white print:text-black">
                      최종 잔액
                    </span>
                    <span className={`text-base font-extrabold tabular-nums ${
                      finalBalance > 0 
                        ? 'text-sky-400 print:text-black' 
                        : finalBalance < 0 
                        ? 'text-rose-400 print:text-black' 
                        : 'text-white print:text-black'
                    }`}>
                      {finalBalance >= 0 ? '+' : ''}{currencySymbol}{finalBalance.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* 1인당 정산 내역 (N-Split Box) */}
              <div className="p-5 rounded-2xl border-2 border-sky-500/30 print:border-black bg-sky-500/[0.03] print:bg-gray-50 space-y-3">
                <h3 className="text-xs font-bold text-sky-400 print:text-black flex items-center justify-between border-b border-sky-500/20 print:border-gray-300 pb-2">
                  <span>1인당 정산 내역 ({activeMembers}인 균등 분할)</span>
                  <span className="text-[10px] font-normal text-slate-400 print:text-gray-600">
                    총 참여 {activeMembers}명
                  </span>
                </h3>

                <div className="space-y-2 text-xs">
                  {/* Per-person expense */}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300 print:text-gray-700">
                      1인당 실제 분담 경비 <span className="text-[10px] opacity-70">(총 지출 ÷ {activeMembers}명)</span>
                    </span>
                    <span className="font-extrabold text-sm text-white print:text-black tabular-nums">
                      {currencySymbol}{perPersonExpense.toLocaleString()}
                    </span>
                  </div>

                  {/* Per-person refund or additional dues */}
                  <div className="p-3 rounded-xl border border-white/10 print:border-gray-400 bg-black/20 print:bg-white space-y-1">
                    <span className="text-[11px] text-slate-400 print:text-gray-600 block">
                      1인당 최종 정산 (잔액 ÷ {activeMembers}명)
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white print:text-black">
                        {finalBalance > 0
                          ? '1인당 환급 예정액'
                          : finalBalance < 0
                          ? '1인당 추가 납부액'
                          : '정산 완료 (수지 일치)'}
                      </span>
                      <span className={`text-base font-extrabold tabular-nums ${
                        finalBalance > 0 
                          ? 'text-sky-400 print:text-black' 
                          : finalBalance < 0 
                          ? 'text-rose-400 print:text-black' 
                          : 'text-white print:text-black'
                      }`}>
                        {finalBalance > 0 ? `+${currencySymbol}${perPersonNet.toLocaleString()} 환급` : finalBalance < 0 ? `${currencySymbol}${Math.abs(perPersonNet).toLocaleString()} 추가 납부` : '0원'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Document Signature & Verification Footer */}
            <div className="mt-8 pt-6 border-t border-white/10 print:border-gray-400 flex flex-col sm:flex-row justify-between items-center text-[11px] text-slate-500 print:text-gray-600 gap-2">
              <div>
                <span>본 보고서는 Vibe Vault 로컬 암호화 장부에서 직접 생성 및 검증된 공식 결산서입니다.</span>
              </div>
              <div className="flex items-center gap-4">
                <span>정산 총괄 확인: ( 서명 / 인 )</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default EventSettlementReportModal;
