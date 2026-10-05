import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShieldCheck, 
  Landmark, 
  TrendingUp, 
  PieChart as PieChartIcon, 
  Plus, 
  Camera, 
  ArrowLeftRight, 
  Pencil, 
  Trash2, 
  RefreshCw, 
  Wallet, 
  Bitcoin, 
  Building, 
  Banknote, 
  CreditCard, 
  AlertCircle, 
  Check, 
  X, 
  UploadCloud, 
  Sparkles, 
  Loader2,
  Lock,
  ChevronDown,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { 
  AssetAccount, 
  AssetCategoryType, 
  SupportedCurrency, 
  FxRates, 
  HoldingItem,
  Transaction
} from '../types';
import { 
  getAllAssetAccounts, 
  saveAssetAccount, 
  deleteAssetAccount, 
  updateAssetAccountBalance, 
  executeAccountTransfer,
  loadSampleData,
  getAllTransactions
} from '../db';
import { 
  convertCurrency, 
  formatCurrency, 
  getCurrencySymbol,
  getDualCurrencyComparison,
  getAssetCategoryKo, 
  getCategoryKo,
  ASSET_CATEGORY_NAMES_KO, 
  AIEngineConfig, 
  getAIEngineConfig 
} from '../utils';
import {
  sanitizeAndProcessImage,
  extractImageFileFromClipboard,
  extractImageFileFromDataTransfer,
  ImageSanitizationError
} from '../imageSanitizer';


interface VaultOverviewSectionProps {
  currentCurrency: SupportedCurrency;
  fxRates: FxRates;
  stealthMode?: boolean;
  theme?: 'light' | 'dark' | 'system';
  onTransactionAdded?: () => void;
  isMultiCurrencyMode?: boolean;
  transactions?: Transaction[];
  onNavigateToLedger?: () => void;
  onNavigateToInsights?: () => void;
}

const INSTITUTION_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  '토스증권': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', badge: 'bg-blue-500' },
  '카카오페이증권': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', badge: 'bg-amber-400' },
  '카카오뱅크': { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20', badge: 'bg-yellow-400' },
  '업비트': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20', badge: 'bg-cyan-500' },
  '빗썸': { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', badge: 'bg-orange-500' },
  '키움증권': { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', badge: 'bg-rose-500' },
  '미래에셋증권': { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20', badge: 'bg-sky-500' },
  '신한은행': { bg: 'bg-blue-600/10', text: 'text-blue-400', border: 'border-blue-600/20', badge: 'bg-blue-600' },
  'KB국민은행': { bg: 'bg-amber-600/10', text: 'text-amber-400', border: 'border-amber-600/20', badge: 'bg-amber-600' },
};

function getInstitutionStyle(institution: string) {
  for (const [key, val] of Object.entries(INSTITUTION_COLORS)) {
    if (institution.toLowerCase().includes(key.toLowerCase())) {
      return val;
    }
  }
  return { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20', badge: 'bg-slate-400' };
}

function getAssetIcon(type: AssetCategoryType) {
  switch (type) {
    case 'BROKERAGE':
      return <TrendingUp size={16} className="text-blue-400" />;
    case 'BANK':
      return <Landmark size={16} className="text-sky-400" />;
    case 'CRYPTO':
      return <Bitcoin size={16} className="text-amber-400" />;
    case 'REAL_ESTATE':
      return <Building size={16} className="text-purple-400" />;
    case 'CASH':
      return <Banknote size={16} className="text-sky-300" />;
    case 'LIABILITY':
      return <CreditCard size={16} className="text-rose-400" />;
    default:
      return <Wallet size={16} className="text-slate-400" />;
  }
}

export const VaultOverviewSection: React.FC<VaultOverviewSectionProps> = ({
  currentCurrency,
  fxRates,
  stealthMode = false,
  theme = 'dark',
  onTransactionAdded,
  isMultiCurrencyMode = false,
  transactions: propTransactions,
  onNavigateToLedger,
  onNavigateToInsights,
}) => {
  const isLight = theme === 'light';
  const [accounts, setAccounts] = useState<AssetAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | AssetCategoryType>('ALL');

  // Modals & Active Drawer states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [editingBalanceAccount, setEditingBalanceAccount] = useState<AssetAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<{ id: string; name: string } | null>(null);
  const [newBalanceInput, setNewBalanceInput] = useState<string>('');

  // AI Screenshot OCR State
  const [isScanning, setIsScanning] = useState(false);
  const [scannedResult, setScannedResult] = useState<any | null>(null);
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanTargetAccountId, setScanTargetAccountId] = useState<string>('new');
  const [isScreenshotDraggingOver, setIsScreenshotDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenshotDragCounterRef = useRef<number>(0);

  // New Account Form State
  const [newAccountForm, setNewAccountForm] = useState<{
    institution: string;
    accountName: string;
    assetType: AssetCategoryType;
    balance: string;
    currency: SupportedCurrency;
    note: string;
  }>({
    institution: '토스증권',
    accountName: '',
    assetType: 'BROKERAGE',
    balance: '',
    currency: currentCurrency,
    note: '',
  });

  // Transfer Form State
  const [transferForm, setTransferForm] = useState<{
    sourceId: string;
    targetId: string;
    amount: string;
    note: string;
  }>({
    sourceId: '',
    targetId: '',
    amount: '',
    note: '',
  });

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const loadAccounts = async () => {
    setIsLoading(true);
    try {
      const data = await getAllAssetAccounts();
      setAccounts(data);
    } catch (e) {
      console.error('Failed to load asset accounts:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();

    const handleDataChange = () => {
      loadAccounts();
    };

    window.addEventListener('vibe-vault-data-changed', handleDataChange);
    window.addEventListener('vibe-vault-data-reset', handleDataChange);

    return () => {
      window.removeEventListener('vibe-vault-data-changed', handleDataChange);
      window.removeEventListener('vibe-vault-data-reset', handleDataChange);
    };
  }, []);

  const handleLoadSampleDataFromVault = async () => {
    try {
      setIsLoading(true);
      const res = await loadSampleData();
      await loadAccounts();
      if (onTransactionAdded) onTransactionAdded();
      showToast(`샘플 자산(${res.accountsCount}개), 대출(${res.debtsCount}건), 거래(${res.transactionsCount}건)이 로드되었습니다.`, 'success');
    } catch (err: any) {
      showToast(err.message || '샘플 데이터 로드 실패', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Aggregated Net Worth Calculations
  const { totalAssets, totalLiabilities, netWorth, categoryTotals } = useMemo(() => {
    let assetsSum = 0;
    let liabilitiesSum = 0;
    const catMap: Record<AssetCategoryType, number> = {
      BROKERAGE: 0,
      BANK: 0,
      CRYPTO: 0,
      REAL_ESTATE: 0,
      CASH: 0,
      LIABILITY: 0,
    };

    for (const acc of accounts) {
      const converted = convertCurrency(
        acc.currentBalance,
        acc.currency || 'KRW',
        currentCurrency,
        fxRates
      );

      if (acc.assetType === 'LIABILITY') {
        liabilitiesSum += converted;
        catMap.LIABILITY += converted;
      } else {
        assetsSum += converted;
        catMap[acc.assetType] = (catMap[acc.assetType] || 0) + converted;
      }
    }

    const net = assetsSum - liabilitiesSum;

    return {
      totalAssets: assetsSum,
      totalLiabilities: liabilitiesSum,
      netWorth: net,
      categoryTotals: catMap,
    };
  }, [accounts, currentCurrency, fxRates]);

  // Dual Currency Comparison for Net Worth (Primary + Secondary e.g. IDR + KRW)
  const dualCurrency = useMemo(() => {
    return getDualCurrencyComparison(Math.round(netWorth), currentCurrency, fxRates);
  }, [netWorth, currentCurrency, fxRates]);

  // Transactions sync for Right Column (Col 10-12) and Middle Column (Col 5-9)
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>(propTransactions || []);

  useEffect(() => {
    if (propTransactions && propTransactions.length > 0) {
      setLocalTransactions(propTransactions);
    } else {
      getAllTransactions().then(txs => {
        if (txs && txs.length > 0) setLocalTransactions(txs);
      }).catch(() => {});
    }
  }, [propTransactions]);

  // Dynamic Donut Arc Calculation for Left Column (Col 1-4)
  const donutSlices = useMemo(() => {
    if (totalAssets <= 0) return [];
    const radius = 42;
    const circumference = 2 * Math.PI * radius; // ≈ 263.89
    
    const validCategories = [
      { type: 'BROKERAGE' as AssetCategoryType, label: '증권/투자', color: '#60a5fa', amount: categoryTotals.BROKERAGE || 0 },
      { type: 'BANK' as AssetCategoryType, label: '은행/예적금', color: '#38bdf8', amount: categoryTotals.BANK || 0 },
      { type: 'CRYPTO' as AssetCategoryType, label: '가상자산', color: '#fbbf24', amount: categoryTotals.CRYPTO || 0 },
      { type: 'REAL_ESTATE' as AssetCategoryType, label: '부동산/실물', color: '#c084fc', amount: categoryTotals.REAL_ESTATE || 0 },
      { type: 'CASH' as AssetCategoryType, label: '현금/비상금', color: '#2dd4bf', amount: categoryTotals.CASH || 0 },
    ].filter(c => c.amount > 0);

    let cumulativePercentage = 0;
    return validCategories.map((c) => {
      const pct = (c.amount / totalAssets);
      const dashLength = pct * circumference;
      const dashOffset = cumulativePercentage * circumference;
      cumulativePercentage += pct;
      return {
        ...c,
        percentage: pct * 100,
        dashLength,
        dashOffset,
      };
    });
  }, [categoryTotals, totalAssets]);

  // Micro FX Calculator state & computation for Right Column (Col 10-12)
  const [fxCalcAmount, setFxCalcAmount] = useState<string>('100000');
  const [fxCalcBase, setFxCalcBase] = useState<'KRW' | 'IDR' | 'USD'>('KRW');

  const fxOverviewData = useMemo(() => {
    const krwIdr = fxRates.KRW_IDR || (fxRates.IDR ? 1 / fxRates.IDR : 11.8);
    const usdKrw = fxRates.USD_KRW || 1450;
    const usdIdr = Math.round(usdKrw * krwIdr);

    const amt = parseFloat(fxCalcAmount.replace(/,/g, '')) || 0;

    let resKRW = 0;
    let resIDR = 0;
    let resUSD = 0;

    if (fxCalcBase === 'KRW') {
      resKRW = amt;
      resIDR = Math.round(amt * krwIdr);
      resUSD = parseFloat((amt / usdKrw).toFixed(2));
    } else if (fxCalcBase === 'IDR') {
      resIDR = amt;
      resKRW = Math.round(amt / krwIdr);
      resUSD = parseFloat((amt / usdIdr).toFixed(2));
    } else {
      resUSD = amt;
      resKRW = Math.round(amt * usdKrw);
      resIDR = Math.round(amt * usdIdr);
    }

    return {
      krwIdr,
      usdKrw,
      usdIdr,
      resKRW,
      resIDR,
      resUSD
    };
  }, [fxRates, fxCalcAmount, fxCalcBase]);

  // Recent 4 Transactions for Right Column
  const recentTransactions = useMemo(() => {
    return [...localTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 4);
  }, [localTransactions]);

  // Mini Cashflow Pulse
  const miniPulse = useMemo(() => {
    let income = 0;
    let expense = 0;
    localTransactions.forEach(t => {
      const amt = convertCurrency(t.amount, t.currency || currentCurrency, currentCurrency, fxRates);
      if (t.type === 'INCOME') income += amt;
      else if (t.type === 'EXPENSE') expense += amt;
    });
    const total = income + expense;
    const expensePercent = total > 0 ? Math.round((expense / total) * 100) : 0;
    return {
      income,
      expense,
      expensePercent,
      count: localTransactions.length
    };
  }, [localTransactions, currentCurrency, fxRates]);

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    if (selectedFilter === 'ALL') return accounts;
    return accounts.filter((a) => a.assetType === selectedFilter);
  }, [accounts, selectedFilter]);

  // Handle Quick Balance Update
  const handleSaveQuickBalance = async () => {
    if (!editingBalanceAccount) return;
    const num = parseFloat(newBalanceInput.replace(/,/g, ''));
    if (isNaN(num) || num < 0) {
      showToast('올바른 금액을 입력해주세요.', 'error');
      return;
    }

    try {
      await updateAssetAccountBalance(editingBalanceAccount.id, num);
      await loadAccounts();
      showToast(`${editingBalanceAccount.accountName} 잔고가 업데이트되었습니다.`);
      setEditingBalanceAccount(null);
    } catch (err: any) {
      showToast(err.message || '업데이트 실패', 'error');
    }
  };

  // Handle Add New Account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountForm.accountName.trim() || !newAccountForm.institution.trim()) {
      showToast('기관명과 계좌명을 입력해주세요.', 'error');
      return;
    }

    const balanceNum = parseFloat(newAccountForm.balance.replace(/,/g, '')) || 0;
    const newAcc: AssetAccount = {
      id: `acc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      institution: newAccountForm.institution.trim(),
      accountName: newAccountForm.accountName.trim(),
      assetType: newAccountForm.assetType,
      currentBalance: balanceNum,
      currency: newAccountForm.currency,
      lastUpdated: new Date().toISOString(),
      note: newAccountForm.note.trim() || undefined,
    };

    try {
      await saveAssetAccount(newAcc);
      await loadAccounts();
      setShowAddModal(false);
      setNewAccountForm({
        institution: '토스증권',
        accountName: '',
        assetType: 'BROKERAGE',
        balance: '',
        currency: currentCurrency,
        note: '',
      });
      showToast(`${newAcc.accountName} 계좌가 추가되었습니다.`);
    } catch (err: any) {
      showToast('계좌 추가 실패', 'error');
    }
  };

  // Handle Delete Account
  const handleDeleteAccount = (id: string, name: string) => {
    setDeletingAccount({ id, name });
  };

  const handleConfirmDeleteAccount = async () => {
    if (!deletingAccount) return;
    try {
      await deleteAssetAccount(deletingAccount.id);
      await loadAccounts();
      showToast('계좌가 삭제되었습니다.');
    } catch (e) {
      showToast('삭제 실패', 'error');
    } finally {
      setDeletingAccount(null);
    }
  };

  // Handle Account-to-Account Transfer
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const { sourceId, targetId, amount, note } = transferForm;
    if (!sourceId || !targetId) {
      showToast('출금 계좌와 입금 계좌를 선택해주세요.', 'error');
      return;
    }
    const transferAmount = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(transferAmount) || transferAmount <= 0) {
      showToast('유효한 이체 금액을 입력해주세요.', 'error');
      return;
    }

    try {
      await executeAccountTransfer(sourceId, targetId, transferAmount, note.trim() || undefined);
      await loadAccounts();
      if (onTransactionAdded) {
        onTransactionAdded();
      }
      setShowTransferModal(false);
      setTransferForm({ sourceId: '', targetId: '', amount: '', note: '' });
      showToast('계좌 간 이체가 안전하게 완료되었습니다 (소비 지출 제외).');
    } catch (err: any) {
      showToast(err.message || '이체 실패', 'error');
    }
  };

  // Clipboard Paste listener for Screenshot OCR Modal
  useEffect(() => {
    if (!showScanModal) return;

    const handlePaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      const file = extractImageFileFromClipboard(e);
      if (file) {
        e.preventDefault();
        processScreenshotFile(file);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [showScanModal]);

  // Handle Screenshot Upload with Pixel Sanitization & Canvas Downscaling
  const processScreenshotFile = async (file: File) => {
    setIsScanning(true);
    setScannedResult(null);

    try {
      // Security Hardening Item #4: Canvas2D Re-rasterization (strips EXIF, XSS vectors, and polyglots)
      const sanitized = await sanitizeAndProcessImage(file, {
        maxDimension: 1280,
        quality: 0.8,
        preferredMime: 'image/webp'
      });

      setScanPreviewUrl(sanitized.dataUrl);

      const engineConfig = getAIEngineConfig();
      const res = await fetch('/api/parse-asset-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: sanitized.dataUrl,
          mimeType: sanitized.mimeType,
          engineConfig,
        }),
      });

      if (!res.ok) {
        throw new Error('자산 스크린샷 분석에 실패했습니다.');
      }

      const data = await res.json();
      if (data?.asset) {
        setScannedResult(data.asset);
        // Try to automatically find matching account
        const match = accounts.find(
          (a) =>
            a.institution.toLowerCase().includes(data.asset.institution.toLowerCase()) ||
            data.asset.institution.toLowerCase().includes(a.institution.toLowerCase())
        );
        if (match) {
          setScanTargetAccountId(match.id);
        } else {
          setScanTargetAccountId('new');
        }
      }
    } catch (err: unknown) {
      console.error('Scan error:', err);
      if (err instanceof ImageSanitizationError) {
        let msg = err.message;
        if (err.code === 'SVG_XSS_DETECTED') {
          msg = 'SVG 및 스크립트 벡터 형식은 XSS 보안 방지를 위해 차단되었습니다. 안전한 JPG, PNG, WebP 사진을 사용해주세요.';
        } else if (err.code === 'FILE_TOO_LARGE') {
          msg = '파일 용량이 너무 큽니다 (최대 15MB 제한).';
        }
        showToast(msg, 'error');
      } else {
        showToast(err instanceof Error ? err.message : '스크린샷 OCR 분석 중 오류가 발생했습니다.', 'error');
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processScreenshotFile(file);
  };

  const handleScreenshotDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    screenshotDragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsScreenshotDraggingOver(true);
    }
  };

  const handleScreenshotDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isScreenshotDraggingOver) {
      setIsScreenshotDraggingOver(true);
    }
  };

  const handleScreenshotDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    screenshotDragCounterRef.current = Math.max(0, screenshotDragCounterRef.current - 1);
    if (screenshotDragCounterRef.current === 0) {
      setIsScreenshotDraggingOver(false);
    }
  };

  const handleScreenshotDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsScreenshotDraggingOver(false);
    screenshotDragCounterRef.current = 0;

    const file = extractImageFileFromDataTransfer(e.dataTransfer);
    if (file) {
      processScreenshotFile(file);
    } else {
      showToast('유효한 이미지 파일(JPG, PNG, WebP)만 업로드할 수 있습니다.', 'error');
    }
  };


  // Confirm Scanned Balance Update
  const handleConfirmScannedAsset = async () => {
    if (!scannedResult) return;

    try {
      if (scanTargetAccountId === 'new') {
        // Create new account
        const newAcc: AssetAccount = {
          id: `acc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          institution: scannedResult.institution || '기타 금융기관',
          accountName: scannedResult.accountName || '스캔된 자산 계좌',
          assetType: scannedResult.assetType || 'BROKERAGE',
          currentBalance: scannedResult.currentBalance || 0,
          cashBalance: scannedResult.cashBalance,
          investedAssets: scannedResult.investedAssets,
          currency: scannedResult.currency || currentCurrency,
          lastUpdated: new Date().toISOString(),
          holdings: scannedResult.holdings,
          note: scannedResult.notes || 'AI 스크린샷 자동 파싱',
        };
        await saveAssetAccount(newAcc);
        showToast(`'${newAcc.accountName}' 계좌가 신규 등록되었습니다.`);
      } else {
        // Update existing
        const target = accounts.find((a) => a.id === scanTargetAccountId);
        if (target) {
          target.currentBalance = scannedResult.currentBalance;
          if (scannedResult.cashBalance !== undefined) target.cashBalance = scannedResult.cashBalance;
          if (scannedResult.investedAssets !== undefined) target.investedAssets = scannedResult.investedAssets;
          if (scannedResult.holdings && scannedResult.holdings.length > 0) {
            target.holdings = scannedResult.holdings;
          }
          target.lastUpdated = new Date().toISOString();
          await saveAssetAccount(target);
          showToast(`'${target.accountName}' 잔고가 ₩${scannedResult.currentBalance.toLocaleString()}으로 업데이트되었습니다.`);
        }
      }
      await loadAccounts();
      setShowScanModal(false);
      setScannedResult(null);
      setScanPreviewUrl(null);
    } catch (err: any) {
      showToast('잔고 반영 실패', 'error');
    }
  };

  const assetCategories: { type: AssetCategoryType; label: string; icon: React.ReactNode; color: string }[] = [
    { type: 'BROKERAGE', label: '투자', icon: <TrendingUp size={14} />, color: 'from-blue-500 to-indigo-600' },
    { type: 'BANK', label: '예적금', icon: <Landmark size={14} />, color: 'from-sky-500 to-blue-600' },
    { type: 'CRYPTO', label: '가상자산', icon: <Bitcoin size={14} />, color: 'from-amber-500 to-yellow-600' },
    { type: 'REAL_ESTATE', label: '부동산', icon: <Building size={14} />, color: 'from-purple-500 to-pink-600' },
    { type: 'CASH', label: '현금', icon: <Banknote size={14} />, color: 'from-sky-500 to-cyan-600' },
    { type: 'LIABILITY', label: '부채', icon: <CreditCard size={14} />, color: 'from-rose-500 to-red-600' },
  ];

  return (
    <div className="pb-8">
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-semibold backdrop-blur-xl border ${
              notification.type === 'success'
                ? 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
            }`}
          >
            {notification.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2-Column / 3-Column Responsive Financial Command Center Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (Col 1-4 on wide displays, Col 1-5 on standard desktop): Vault Summary, Allocation Donut, Quick Actions */}
        <div className="lg:col-span-5 xl:col-span-4 2xl:col-span-4 space-y-4 lg:sticky lg:top-4">
          {/* TOP HERO CARD: Net Worth & Consolidated Asset Summary */}
      <div className={`relative overflow-hidden rounded-2xl p-5 sm:p-7 border backdrop-blur-xl transition-all ${
        isLight
          ? 'bg-white/85 border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900'
          : 'bg-[#121318]/90 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl text-white'
      }`}>
        <div className="relative z-10 flex flex-col justify-between">
          <div className="space-y-1.5">
            {/* Subtle Quiet Indicator */}
            <div className="flex items-center gap-2">
              <span className={`text-xs font-light tracking-wide ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}>
                총 순자산
              </span>
            </div>

            {/* Net Worth Hero Number: Slim, Confident, Tabular & No-Wrap with Fluid Typography */}
            <div className="flex flex-col justify-start min-w-0">
              <div className={`flex items-baseline pt-0.5 whitespace-nowrap tabular-nums ${
                stealthMode ? 'blur-md select-none' : ''
              }`}>
                <span className="text-fluid-heading font-light text-neutral-400 mr-1.5 whitespace-nowrap">{getCurrencySymbol(currentCurrency)}</span>
                <h1 className="text-fluid-hero font-light tracking-tight text-white tabular-nums whitespace-nowrap">
                  {Math.round(netWorth).toLocaleString()}
                </h1>
              </div>

              {/* Native Dual-Currency Comparison Sub-line (Multi-currency mode only) */}
              {isMultiCurrencyMode && dualCurrency && (
                <div className={`mt-1 ${stealthMode ? 'blur-xs select-none' : ''}`}>
                  <span className="text-fluid-label font-light text-neutral-400 tracking-wide whitespace-nowrap tabular-nums">
                    ≈ {dualCurrency.secondaryFormatted} · 환율 {dualCurrency.rateText}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Action Buttons: Neat 3-column grid with subtle ghost styling */}
          <div className="grid grid-cols-3 gap-2 mt-4 w-full">
            <button
              id="vault-scan-balance-btn"
              type="button"
              onClick={() => setShowScanModal(true)}
              className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs py-2 px-1 rounded-xl text-neutral-300 hover:text-white transition-all active:scale-95 flex items-center justify-center text-center font-normal"
            >
              <span className="truncate">화면 스캔</span>
            </button>

            <button
              id="vault-transfer-btn"
              type="button"
              onClick={() => {
                if (accounts.length < 2) {
                  showToast('이체를 위해 최소 2개 이상의 계좌가 필요합니다.', 'error');
                  return;
                }
                setTransferForm({
                  sourceId: accounts[0]?.id || '',
                  targetId: accounts[1]?.id || '',
                  amount: '',
                  note: '',
                });
                setShowTransferModal(true);
              }}
              className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs py-2 px-1 rounded-xl text-neutral-300 hover:text-white transition-all active:scale-95 flex items-center justify-center text-center font-normal"
            >
              <span className="truncate">계좌 간 이체</span>
            </button>

            <button
              id="vault-add-account-btn"
              type="button"
              onClick={() => setShowAddModal(true)}
              className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs py-2 px-1 rounded-xl text-neutral-300 hover:text-white transition-all active:scale-95 flex items-center justify-center text-center font-normal"
            >
              <span className="truncate">자산 추가</span>
            </button>
          </div>
        </div>

        {/* Sub-Metrics: Clean hairline columns separated by hairline divider */}
        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t ${
          isLight ? 'border-slate-200/60' : 'border-t border-white/[0.04]'
        }`}>
          <div className="flex flex-col justify-between">
            <span className={`text-xs font-light block ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}>
              총 자산
            </span>
            <div className={`text-sm md:text-base tabular-nums whitespace-nowrap mt-1 ${stealthMode ? 'blur-sm' : ''} ${
              totalAssets > 0
                ? 'font-normal text-sky-400'
                : 'font-light text-neutral-500'
            }`}>
              {totalAssets > 0 ? '+' : ''}{formatCurrency(totalAssets, currentCurrency)}
            </div>
          </div>

          <div className="flex flex-col justify-between">
            <span className={`text-xs font-light block ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}>
              총 부채
            </span>
            <div className={`text-sm md:text-base tabular-nums whitespace-nowrap mt-1 ${stealthMode ? 'blur-sm' : ''} ${
              totalLiabilities > 0
                ? 'font-normal text-rose-400/90'
                : 'font-light text-neutral-500'
            }`}>
              {totalLiabilities > 0 ? '-' : ''}{formatCurrency(totalLiabilities, currentCurrency)}
            </div>
          </div>

          <div className="flex flex-col justify-between">
            <span className={`text-xs font-light block ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}>
              투자 자산
            </span>
            <div className={`text-sm md:text-base tabular-nums whitespace-nowrap mt-1 ${stealthMode ? 'blur-sm' : ''} ${
              categoryTotals.BROKERAGE > 0
                ? 'font-normal text-neutral-200'
                : 'font-light text-neutral-500'
            }`}>
              {formatCurrency(categoryTotals.BROKERAGE, currentCurrency)}
            </div>
          </div>

          <div className="flex flex-col justify-between">
            <span className={`text-xs font-light block ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}>
              예적금 잔액
            </span>
            <div className={`text-sm md:text-base tabular-nums whitespace-nowrap mt-1 ${stealthMode ? 'blur-sm' : ''} ${
              categoryTotals.BANK > 0
                ? 'font-normal text-neutral-200'
                : 'font-light text-neutral-500'
            }`}>
              {formatCurrency(categoryTotals.BANK, currentCurrency)}
            </div>
          </div>
        </div>
      </div>

      {/* ASSET ALLOCATION VISUALIZER & CLASS METRICS */}
      <div className={`p-5 sm:p-6 rounded-2xl border backdrop-blur-xl transition-all ${
        isLight
          ? 'bg-white/85 border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900'
          : 'bg-[#121318]/90 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl text-white'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-fluid-heading font-normal tracking-wide text-slate-200">자산 포트폴리오 비중</h2>
          </div>
          <span className={`text-fluid-label font-light ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            총 {accounts.length}개 계좌
          </span>
        </div>

        {/* Dynamic Donut / Asset Pie & Class Breakdown */}
        {totalAssets > 0 ? (
          <div className="space-y-4">
            {/* SVG Donut Ring Chart with centered summary */}
            <div className="flex items-center justify-center pt-1 pb-1">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90 transform">
                  {/* Subtle track */}
                  <circle
                    cx="60"
                    cy="60"
                    r="42"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.05)"
                    strokeWidth="12"
                  />
                  {/* Category Arcs */}
                  {donutSlices.map((slice) => (
                    <circle
                      key={slice.type}
                      cx="60"
                      cy="60"
                      r="42"
                      fill="none"
                      stroke={slice.color}
                      strokeWidth="12"
                      strokeDasharray={`${slice.dashLength} 263.89`}
                      strokeDashoffset={-slice.dashOffset}
                      strokeLinecap="round"
                      className="transition-all duration-300 hover:opacity-100 opacity-90"
                    />
                  ))}
                </svg>
                {/* Center metric */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-[10px] font-light text-neutral-400">총 보유 자산</span>
                  <span className="text-xs font-semibold text-white tabular-nums tracking-tight mt-0.5">
                    {getCurrencySymbol(currentCurrency)}{Math.round(totalAssets).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Dynamic Proportion Bar: Subtle, refined hairline track */}
            <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-white/[0.04] border border-white/[0.04]">
              {assetCategories.map((cat) => {
                const amount = categoryTotals[cat.type] || 0;
                if (amount <= 0 || cat.type === 'LIABILITY') return null;
                const pct = (amount / totalAssets) * 100;
                return (
                  <div
                    key={cat.type}
                    style={{ width: `${pct}%` }}
                    className={`h-full bg-gradient-to-r ${cat.color} transition-all relative group cursor-pointer opacity-85 hover:opacity-100`}
                    title={`${cat.label}: ${pct.toFixed(1)}%`}
                  />
                );
              })}
            </div>

            {/* Single flat parent card separated by subtle hairline dividers (No Box-in-Box) */}
            <div className={`rounded-xl border grid grid-cols-2 sm:grid-cols-3 divide-y sm:divide-y-0 divide-x overflow-hidden ${
              isLight 
                ? 'bg-slate-50/70 border-slate-200/80 divide-slate-200/60' 
                : 'bg-transparent border-white/[0.05] divide-white/[0.04]'
            }`}>
              {assetCategories.map((cat) => {
                const amount = categoryTotals[cat.type] || 0;
                const pct = totalAssets > 0 ? (amount / totalAssets) * 100 : 0;
                const isZero = amount <= 0;

                return (
                  <div
                    key={cat.type}
                    className={`p-2.5 transition-colors ${
                      isZero ? (isLight ? 'opacity-40' : 'opacity-30') : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        cat.type === 'BROKERAGE' ? 'bg-blue-400' :
                        cat.type === 'BANK' ? 'bg-sky-400' :
                        cat.type === 'CRYPTO' ? 'bg-amber-400' :
                        cat.type === 'REAL_ESTATE' ? 'bg-purple-400' :
                        cat.type === 'CASH' ? 'bg-sky-300' : 'bg-rose-400'
                      }`} />
                      <span className={`text-[11px] font-light truncate ${isZero ? 'text-slate-500' : 'text-slate-400'}`}>
                        {cat.label}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-1 mt-1">
                      <span className={`text-xs font-normal tabular-nums ${isZero ? 'text-slate-500' : (isLight ? 'text-slate-900' : 'text-slate-200')} ${stealthMode && !isZero ? 'blur-xs' : ''}`}>
                        {formatCurrency(amount, currentCurrency)}
                      </span>
                      <span className={`text-[10px] font-light ${
                        isZero
                          ? 'text-slate-500/50'
                          : isLight ? 'text-slate-500' : 'text-slate-400'
                      }`}>
                        {pct > 0 ? `${pct.toFixed(0)}%` : '0%'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="py-4 text-center text-xs font-light text-slate-400">
            등록된 자산이 없습니다. 상단의 '화면 스캔' 또는 '자산 추가'로 시작해보세요.
          </div>
        )}
      </div>
        </div>

        {/* Middle Column (Col 5-9 on wide displays, Col 6-12 on standard desktop): Account Feed & Ledger Entries */}
        <div className="lg:col-span-7 xl:col-span-5 2xl:col-span-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Pill-shaped filter buttons with gentle active outlines */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
            <button
              onClick={() => setSelectedFilter('ALL')}
              className={`px-3.5 py-1 rounded-full text-xs font-normal whitespace-nowrap transition-all border ${
                selectedFilter === 'ALL'
                  ? isLight
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white/[0.1] text-white border-white/20'
                  : isLight
                  ? 'bg-transparent text-slate-600 hover:text-slate-950 border-slate-200/60'
                  : 'bg-transparent text-slate-400 hover:text-slate-200 border-white/[0.06]'
              }`}
            >
              전체 ({accounts.length})
            </button>

            {assetCategories.map((cat) => {
              const count = accounts.filter((a) => a.assetType === cat.type).length;
              return (
                <button
                  key={cat.type}
                  onClick={() => setSelectedFilter(cat.type)}
                  className={`px-3.5 py-1 rounded-full text-xs font-normal whitespace-nowrap transition-all flex items-center gap-1 border ${
                    selectedFilter === cat.type
                      ? isLight
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white/[0.1] text-white border-white/20'
                      : isLight
                      ? 'bg-transparent text-slate-600 hover:text-slate-950 border-slate-200/60'
                      : 'bg-transparent text-slate-400 hover:text-slate-200 border-white/[0.06]'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span className="text-[11px] opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cards Grid / Empty State: Smoky Glass Surfaces & Polished Typography */}
        {accounts.length === 0 ? (
          <div className={`p-8 sm:p-10 rounded-2xl border text-center space-y-4 transition-all ${
            isLight 
              ? 'bg-white/80 backdrop-blur-2xl border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900' 
              : 'bg-[#121318]/90 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl text-white'
          }`}>
            <h3 className={`text-base font-medium tracking-tight ${isLight ? 'text-slate-900' : 'text-neutral-200'}`}>
              등록된 계좌가 없습니다
            </h3>

            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                id="vault-empty-add-btn"
                onClick={() => setShowAddModal(true)}
                className="bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.08] rounded-xl px-4 py-2 font-normal text-xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              >
                <span>직접 등록</span>
              </button>

              <button
                type="button"
                id="vault-empty-scan-btn"
                onClick={() => setShowScanModal(true)}
                className="bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.08] rounded-xl px-4 py-2 font-normal text-xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              >
                <span>캡처 스캔</span>
              </button>
            </div>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className={`p-8 rounded-2xl border text-center space-y-2.5 ${
            isLight ? 'bg-slate-50/70 border-slate-200 text-slate-500' : 'bg-[#121318]/90 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] text-neutral-400'
          }`}>
            <p className="text-fluid-body font-light">선택한 분류에 해당하는 자산 계좌가 없습니다.</p>
            <button
              type="button"
              onClick={() => setSelectedFilter('ALL')}
              className="text-xs text-neutral-300 hover:text-white underline font-normal"
            >
              전체 계좌 보기
            </button>
          </div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredAccounts.map((acc) => {
            const converted = convertCurrency(
              acc.currentBalance,
              acc.currency || 'KRW',
              currentCurrency,
              fxRates
            );

            return (
              <div
                key={acc.id}
                className={`group relative rounded-2xl p-5 border transition-all duration-150 backdrop-blur-xl ${
                  isLight
                    ? 'bg-white/85 border-slate-200/80 hover:border-slate-300 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)]'
                    : 'bg-[#121318]/90 backdrop-blur-xl border border-white/[0.06] hover:border-white/[0.12] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl'
                }`}
              >
                {/* Header: Full width institution and account title */}
                <div className="flex items-start justify-between gap-2.5 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-normal truncate ${isLight ? 'text-slate-900' : 'text-neutral-200'}`}
                        title={acc.institution}
                      >
                        {acc.institution}
                      </span>
                      <span className="text-white/20 font-light text-xs">·</span>
                      <span className={`text-xs font-light shrink-0 ${
                        acc.assetType === 'LIABILITY'
                          ? 'text-rose-400/90'
                          : isLight ? 'text-slate-500' : 'text-neutral-400'
                      }`}>
                        {getAssetCategoryKo(acc.assetType)}
                      </span>
                    </div>
                    <p
                      className={`text-xs font-light truncate mt-0.5 ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}
                      title={acc.accountName}
                    >
                      {acc.accountName}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-none opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBalanceAccount(acc);
                        setNewBalanceInput(acc.currentBalance.toString());
                      }}
                      title="잔고 수정"
                      className={`p-1.5 rounded-lg transition-colors ${
                        isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-neutral-400'
                      }`}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAccount(acc.id, acc.accountName)}
                      title="계좌 삭제"
                      className={`p-1.5 rounded-lg transition-colors text-rose-400/80 hover:text-rose-400 ${
                        isLight ? 'hover:bg-rose-50' : 'hover:bg-rose-500/10'
                      }`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Account Number / Note without nested dark boxes */}
                {(acc.accountNumberMasked || acc.note) && (
                  <div className={`text-xs font-light mb-3 truncate pl-2 border-l ${
                    isLight ? 'border-slate-300 text-slate-600' : 'border-white/10 text-neutral-400'
                  }`}>
                    {acc.accountNumberMasked || acc.note}
                  </div>
                )}

                {/* Balance & Quick Update Prompt */}
                <div className={`pt-3 border-t flex items-end justify-between ${
                  isLight ? 'border-slate-200/60' : 'border-t border-white/[0.04]'
                }`}>
                  <div>
                    <span className={`text-xs font-light block ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}>
                      현재 잔고
                    </span>
                    <div className={`text-sm font-medium tracking-tight tabular-nums mt-0.5 ${
                      acc.assetType === 'LIABILITY' ? 'text-rose-400/90' : isLight ? 'text-slate-900' : 'text-neutral-100'
                    } ${stealthMode ? 'blur-sm select-none' : ''}`}>
                      {formatCurrency(converted, currentCurrency)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingBalanceAccount(acc);
                      setNewBalanceInput(acc.currentBalance.toString());
                    }}
                    className="bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.08] rounded-full px-3 py-1 text-xs transition-all active:scale-95 text-center"
                  >
                    <span>수정</span>
                  </button>
                </div>

                {/* Holdings Sub-List if available with hairline dividers */}
                {acc.holdings && acc.holdings.length > 0 && (
                  <div className={`mt-3 pt-2.5 border-t space-y-1.5 ${
                    isLight ? 'border-slate-200/60' : 'border-white/[0.04]'
                  }`}>
                    <span className="text-[11px] font-light text-neutral-400 block">
                      보유 종목 ({acc.holdings.length})
                    </span>
                    <div className="space-y-1 max-h-24 overflow-y-auto scrollbar-none divide-y divide-white/[0.03]">
                      {acc.holdings.map((h, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs font-light gap-2 pt-1">
                          <span className="truncate min-w-0 flex-1 text-neutral-300" title={h.name}>{h.name}</span>
                          <div className="flex items-center gap-1.5 flex-none">
                            <span className="font-normal text-neutral-200 tabular-nums">
                              {formatCurrency(h.valuation, currentCurrency)}
                            </span>
                            {h.profitRate !== undefined && (
                              <span className={`text-[11px] font-light tabular-nums ${
                                h.profitRate >= 0 ? 'text-rose-400' : 'text-sky-400'
                              }`}>
                                {h.profitRate >= 0 ? `+${h.profitRate}%` : `${h.profitRate}%`}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}

        {/* Ledger Entries Feed with ample reading room */}
        <div className={`p-5 rounded-2xl border backdrop-blur-xl transition-all ${
          isLight 
            ? 'bg-white/85 border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900' 
            : 'bg-[#121318]/90 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl text-white'
        }`}>
          <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.04]">
            <h3 className="text-sm font-medium tracking-wide text-slate-200">
              최근 거래
            </h3>
            {onNavigateToLedger && (
              <button
                type="button"
                onClick={onNavigateToLedger}
                className="text-xs text-neutral-400 hover:text-white font-light flex items-center gap-1 transition-colors group"
              >
                <span>전체보기</span>
                <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
          </div>

          {localTransactions.length === 0 ? (
            <div className="py-6 text-center text-xs font-light text-slate-400">
              기록된 거래 내역이 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.03]">
              {localTransactions.slice(0, 5).map((t) => {
                const isExpense = t.type === 'EXPENSE';
                const isIncome = t.type === 'INCOME';
                return (
                  <div key={t.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isIncome ? 'bg-sky-400' : isExpense ? 'bg-rose-400' : 'bg-blue-400'
                      }`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-normal text-neutral-200 truncate">{t.description}</span>
                          <span className="text-[10px] text-neutral-500 font-light shrink-0">
                            {t.category ? getCategoryKo(t.category) : ''}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-400 font-light mt-0.5">
                          <span>{format(parseISO(t.date), 'M.d HH:mm')}</span>
                          {t.paymentMethod && <span className="ml-1.5 opacity-70">· {t.paymentMethod}</span>}
                        </div>
                      </div>
                    </div>
                    <div className={`font-medium tabular-nums whitespace-nowrap ${
                      isIncome ? 'text-sky-400' : isExpense ? 'text-slate-200' : 'text-blue-400'
                    } ${stealthMode ? 'blur-xs' : ''}`}>
                      {isExpense ? '-' : isIncome ? '+' : ''}{getCurrencySymbol(t.currency || currentCurrency)}{t.amount.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>

        {/* Right Column (Col 10-12 on wide displays >= 1440px): Multi-Currency FX Overview & Monthly Cashflow */}
        <div className="hidden xl:block xl:col-span-3 2xl:col-span-3 space-y-4 xl:sticky xl:top-4">
          {/* Card 1: Real-time Major FX Rates */}
          <div className={`p-5 rounded-2xl border backdrop-blur-xl transition-all ${
            isLight 
              ? 'bg-white/85 border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900' 
              : 'bg-[#121318]/90 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl text-white'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.04]">
              <h3 className="text-sm font-medium tracking-wide text-slate-200">
                실시간 주요 환율
              </h3>
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" title="실시간 반영 중" />
            </div>

            {/* Clean rate rows */}
            <div className="space-y-2 mt-3.5">
              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between text-xs">
                <span className="text-neutral-400 font-light">미국 달러</span>
                <span className="font-normal text-sky-300 tabular-nums">
                  ≈ ₩{fxOverviewData.usdKrw.toLocaleString()}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between text-xs">
                <span className="text-neutral-400 font-light">유로</span>
                <span className="font-normal text-sky-300 tabular-nums">
                  ≈ ₩{Math.round(fxRates.rates?.EUR ? 1 / fxRates.rates.EUR : 1480).toLocaleString()}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between text-xs">
                <span className="text-neutral-400 font-light">일본 엔 (100엔)</span>
                <span className="font-normal text-amber-300 tabular-nums">
                  ≈ ₩{Math.round((fxRates.rates?.JPY ? 1 / fxRates.rates.JPY : 9.6) * 100).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Clean Quick Converter */}
            <div className="mt-4 pt-3.5 border-t border-white/[0.04]">
              <div className="flex items-center justify-between text-[11px] text-neutral-400 font-light mb-1.5">
                <span>간편 환율 계산</span>
                <div className="flex items-center gap-1">
                  {(['KRW', 'USD'] as const).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFxCalcBase(c)}
                      className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                        fxCalcBase === c 
                          ? 'bg-sky-500/20 text-sky-300 font-medium' 
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {c === 'KRW' ? '원화 기준' : '달러 기준'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={fxCalcAmount}
                  onChange={(e) => setFxCalcAmount(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-white tabular-nums focus:outline-none focus:border-sky-500/50"
                  placeholder="금액 입력"
                />
              </div>

              {/* Converted outputs */}
              <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                {fxCalcBase !== 'KRW' && (
                  <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <span className="text-neutral-500 block">원화 환산</span>
                    <span className="font-medium text-neutral-200 tabular-nums">
                      ₩{fxOverviewData.resKRW.toLocaleString()}
                    </span>
                  </div>
                )}
                {fxCalcBase !== 'USD' && (
                  <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <span className="text-neutral-500 block">달러 환산</span>
                    <span className="font-medium text-neutral-200 tabular-nums">
                      ${fxOverviewData.resUSD.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Recent Activity / Monthly Cashflow */}
          <div className={`p-5 rounded-2xl border backdrop-blur-xl transition-all ${
            isLight 
              ? 'bg-white/85 border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900' 
              : 'bg-[#121318]/90 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl text-white'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.04]">
              <h3 className="text-sm font-medium tracking-wide text-slate-200">
                월간 재정 흐름
              </h3>
              {onNavigateToInsights && (
                <button
                  type="button"
                  onClick={onNavigateToInsights}
                  className="text-xs text-neutral-400 hover:text-white transition-colors"
                  title="인사이트로 이동"
                >
                  <ArrowRight size={13} />
                </button>
              )}
            </div>

            {/* Monthly cashflow pulse bar */}
            <div className="mt-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-400 font-light">수입 및 지출 비중</span>
                <span className="text-[11px] text-neutral-300 tabular-nums">
                  지출 {miniPulse.expensePercent}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/[0.04] overflow-hidden flex">
                <div 
                  style={{ width: `${100 - miniPulse.expensePercent}%` }} 
                  className="h-full bg-sky-400/80" 
                  title="수입 비중"
                />
                <div 
                  style={{ width: `${miniPulse.expensePercent}%` }} 
                  className="h-full bg-rose-400/80" 
                  title="지출 비중"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] tabular-nums pt-1 text-neutral-400">
                <span className="text-sky-400">+{getCurrencySymbol(currentCurrency)}{Math.round(miniPulse.income).toLocaleString()}</span>
                <span className="text-rose-400">-{getCurrencySymbol(currentCurrency)}{Math.round(miniPulse.expense).toLocaleString()}</span>
              </div>
            </div>

            {/* Recent 3-4 Transactions Preview */}
            <div className="mt-4 pt-3.5 border-t border-white/[0.04] space-y-2">
              <span className="text-[11px] font-light text-neutral-400 block">
                최근 변동 내역
              </span>
              {recentTransactions.length === 0 ? (
                <p className="text-xs font-light text-slate-500 py-1">거래 내역이 없습니다.</p>
              ) : (
                <div className="space-y-1.5">
                  {recentTransactions.map(t => {
                    const isExpense = t.type === 'EXPENSE';
                    return (
                      <div key={t.id} className="flex items-center justify-between text-xs py-1">
                        <span className="text-neutral-300 truncate max-w-[120px]" title={t.description}>
                          {t.description}
                        </span>
                        <span className={`tabular-nums ${isExpense ? 'text-neutral-300' : 'text-sky-400'} ${stealthMode ? 'blur-xs' : ''}`}>
                          {isExpense ? '-' : '+'}{getCurrencySymbol(t.currency || currentCurrency)}{t.amount.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* QUICK BALANCE EDIT MODAL */}
      <AnimatePresence>
        {editingBalanceAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className={`relative w-full max-w-sm rounded-2xl p-6 shadow-2xl border ${
                isLight ? 'bg-white text-slate-900 border-slate-200' : 'bg-[#121318]/95 backdrop-blur-xl text-white border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-normal text-slate-100">{editingBalanceAccount.accountName}</h3>
                  <p className={`text-xs font-light ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {editingBalanceAccount.institution} 잔고 수정
                  </p>
                </div>
                <button
                  onClick={() => setEditingBalanceAccount(null)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-light block mb-1.5 text-slate-400">
                    새 잔고 금액 ({editingBalanceAccount.currency || currentCurrency})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newBalanceInput}
                    onChange={(e) => setNewBalanceInput(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-base font-normal tabular-nums outline-none border transition-all ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 focus:border-slate-500 text-slate-900'
                        : 'bg-white/[0.03] border-white/10 focus:border-sky-500/40 text-white'
                    }`}
                    placeholder="0"
                    autoFocus
                  />
                </div>

                {/* Quick Add Presets */}
                <div className="flex items-center gap-1.5">
                  {[100000, 500000, 1000000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        const cur = parseFloat(newBalanceInput) || 0;
                        setNewBalanceInput((cur + preset).toString());
                      }}
                      className="px-2.5 py-1 rounded-full text-xs font-light bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-slate-300"
                    >
                      +{preset >= 10000 ? `${preset / 10000}만` : preset}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setNewBalanceInput('0')}
                    className="px-2.5 py-1 rounded-full text-xs font-light bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 ml-auto"
                  >
                    초기화
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingBalanceAccount(null)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-light bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.06]"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveQuickBalance}
                    className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 transition-all"
                  >
                    잔고 저장
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* GEMINI MULTIMODAL SCREENSHOT SCANNER MODAL */}
      <AnimatePresence>
        {showScanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={`relative w-full max-w-md rounded-2xl p-6 shadow-2xl border ${
                isLight ? 'bg-white text-slate-900 border-slate-200' : 'bg-[#121318]/95 backdrop-blur-xl text-white border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold">계좌/증권 잔고 캡처 스캔</h3>
                    <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      Gemini 멀티모달 AI가 스크린샷에서 잔고를 자동 추출합니다.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowScanModal(false);
                    setScannedResult(null);
                    setScanPreviewUrl(null);
                  }}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {!scannedResult ? (
                <div className="space-y-4">
                  {/* Upload Drop Zone */}
                  <div
                    onDragEnter={handleScreenshotDragEnter}
                    onDragOver={handleScreenshotDragOver}
                    onDragLeave={handleScreenshotDragLeave}
                    onDrop={handleScreenshotDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                      isScreenshotDraggingOver
                        ? isLight
                          ? 'border-blue-600 bg-blue-50/80 ring-4 ring-blue-500/20 scale-[1.01]'
                          : 'border-blue-400 bg-blue-500/10 ring-4 ring-blue-400/20 scale-[1.01]'
                        : isLight
                          ? 'border-slate-300 hover:border-blue-500 bg-slate-50'
                          : 'border-white/15 hover:border-blue-500 bg-white/[0.02]'
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      className="hidden"
                    />

                    {isScanning ? (
                      <div className="py-8 flex flex-col items-center gap-3">
                        <Loader2 size={32} className="animate-spin text-blue-400" />
                        <span className="text-xs font-bold text-blue-400">
                          Gemini 3.8 Flash가 계좌 잔고를 분석하고 있습니다...
                        </span>
                        <span className="text-[11px] text-slate-400">
                          (1280px 자동 압축 · 위치/EXIF 메타데이터 자동 제거 완료)
                        </span>
                      </div>
                    ) : scanPreviewUrl ? (
                      <div className="relative w-full max-h-48 overflow-hidden rounded-xl">
                        <img src={scanPreviewUrl} alt="Preview" className="w-full object-cover" />
                      </div>
                    ) : (
                      <>
                        <div className={`w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center transition-transform ${
                          isScreenshotDraggingOver ? 'scale-110' : ''
                        }`}>
                          <UploadCloud size={24} className={isScreenshotDraggingOver ? 'animate-bounce' : ''} />
                        </div>
                        <div>
                          <p className="text-xs font-bold">
                            {isScreenshotDraggingOver ? '여기에 스크린샷을 놓으세요' : '토스증권, 카카오페이증권, 은행 앱 캡처 업로드'}
                          </p>
                          <p className={`text-[11px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            드래그 앤 드롭 · 파일 선택 · 클립보드 붙여넣기(Cmd+V) 지원 (최대 15MB)
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className={`p-3 rounded-xl text-[11px] flex items-start gap-2 border ${
                    isLight ? 'bg-blue-50 text-blue-800 border-blue-100' : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                  }`}>
                    <Lock size={14} className="shrink-0 mt-0.5" />
                    <span>
                      <strong>프라이버시 보장</strong>: 주민등록번호, 계좌 비밀번호 등 민감 식별자는 자동 정제되며 서버에 원본 파일이 영구 저장되지 않습니다.
                    </span>
                  </div>
                </div>
              ) : (
                /* Scanned Result Confirmation */
                <div className="space-y-4">
                  <div className={`p-4 rounded-2xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.04] border-white/10'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-sky-400 flex items-center gap-1">
                        <Check size={14} /> AI 잔고 감지 완료
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold">
                        정확도 {Math.round(scannedResult.confidenceScore * 100)}%
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div>
                        <span className="text-[10px] text-slate-400 block">금융기관</span>
                        <span className="text-xs font-bold">{scannedResult.institution}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">계좌명</span>
                        <span className="text-xs font-bold">{scannedResult.accountName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">자산 유형</span>
                        <span className="text-xs font-bold">{getAssetCategoryKo(scannedResult.assetType)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">추출된 총 잔고</span>
                        <span className="text-sm font-extrabold text-blue-400">
                          {formatCurrency(scannedResult.currentBalance, scannedResult.currency || currentCurrency)}
                        </span>
                      </div>
                    </div>

                    {(scannedResult.cashBalance !== undefined || scannedResult.investedAssets !== undefined) && (
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/10 text-xs">
                        {scannedResult.investedAssets !== undefined && (
                          <div>
                            <span className="text-[10px] text-slate-400 block">투자 자산 평가액</span>
                            <span className="font-bold text-sky-400">
                              {formatCurrency(scannedResult.investedAssets, scannedResult.currency || currentCurrency)}
                            </span>
                          </div>
                        )}
                        {scannedResult.cashBalance !== undefined && (
                          <div>
                            <span className="text-[10px] text-slate-400 block">예수금 / 현금</span>
                            <span className="font-bold text-amber-400">
                              {formatCurrency(scannedResult.cashBalance, scannedResult.currency || currentCurrency)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {scannedResult.holdings && scannedResult.holdings.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-white/10">
                        <span className="text-[10px] text-slate-400 block mb-1">인식된 보유 종목 ({scannedResult.holdings.length})</span>
                        <div className="text-[11px] space-y-0.5 text-slate-300">
                          {scannedResult.holdings.slice(0, 3).map((h: any, i: number) => (
                            <div key={i} className="flex justify-between">
                              <span>{h.name}</span>
                              <span className="font-semibold">{formatCurrency(h.valuation, currentCurrency)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Target Account Selection */}
                  <div>
                    <label className="text-xs font-semibold block mb-1.5 text-slate-400">
                      반영할 대상 계좌 선택
                    </label>
                    <select
                      value={scanTargetAccountId}
                      onChange={(e) => setScanTargetAccountId(e.target.value)}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold outline-none border ${
                        isLight
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-white/[0.03] border-white/10 text-white'
                      }`}
                    >
                      <option value="new">+ 신규 계좌로 등록하기</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id} className="bg-[#08090D] text-white">
                          {acc.institution} - {acc.accountName} (기존 ₩{acc.currentBalance.toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setScannedResult(null)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.06]"
                    >
                      다시 스캔
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmScannedAsset}
                      className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 transition-all"
                    >
                      잔고 반영 확정
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ACCOUNT-TO-ACCOUNT TRANSFER MODAL */}
      <AnimatePresence>
        {showTransferModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={`relative w-full max-w-sm rounded-2xl p-6 shadow-2xl border ${
                isLight ? 'bg-white text-slate-900 border-slate-200' : 'bg-[#121318]/95 backdrop-blur-xl text-white border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
                    <ArrowLeftRight size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-medium">계좌 간 자산 이체</h3>
                    <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      내 계좌 간 이체는 가계부 소비 지출에서 제외됩니다.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleExecuteTransfer} className="space-y-3.5">
                <div>
                  <label className="text-xs font-semibold block mb-1 text-slate-400">출금 계좌 (보내는 곳)</label>
                  <select
                    value={transferForm.sourceId}
                    onChange={(e) => setTransferForm({ ...transferForm, sourceId: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-semibold outline-none border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-white/[0.03] border-white/10 text-white'
                    }`}
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id} className="bg-[#08090D] text-white">
                        {acc.institution} - {acc.accountName} (잔고 ₩{acc.currentBalance.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1 text-slate-400">입금 계좌 (받는 곳)</label>
                  <select
                    value={transferForm.targetId}
                    onChange={(e) => setTransferForm({ ...transferForm, targetId: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-semibold outline-none border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-white/[0.03] border-white/10 text-white'
                    }`}
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id} className="bg-[#08090D] text-white">
                        {acc.institution} - {acc.accountName} (잔고 ₩{acc.currentBalance.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1 text-slate-400">이체 금액 ({currentCurrency})</label>
                  <input
                    type="number"
                    step="any"
                    value={transferForm.amount}
                    onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                    placeholder="1000000"
                    required
                    className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium outline-none border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-white/[0.03] border-white/10 text-white focus:border-sky-500/40'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1 text-slate-400">이체 메모 (선택)</label>
                  <input
                    type="text"
                    value={transferForm.note}
                    onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })}
                    placeholder="예: 미국주식 매수용 예수금 이체"
                    className={`w-full px-3 py-2 rounded-xl text-xs outline-none border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-white/[0.03] border-white/10 text-white'
                    }`}
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTransferModal(false)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.06]"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 transition-all"
                  >
                    이체 실행
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADD ACCOUNT MODAL */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={`relative w-full max-w-sm rounded-2xl p-6 shadow-2xl border ${
                isLight ? 'bg-white text-slate-900 border-slate-200' : 'bg-[#121318]/95 backdrop-blur-xl text-white border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
                    <Plus size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold">새 자산 계좌 추가</h3>
                    <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      증권, 은행, 가상자산, 부동산 등
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateAccount} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold block mb-1 text-slate-400">자산 유형</label>
                  <select
                    value={newAccountForm.assetType}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, assetType: e.target.value as AssetCategoryType })}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-semibold outline-none border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-white/[0.03] border-white/10 text-white'
                    }`}
                  >
                    {assetCategories.map((c) => (
                      <option key={c.type} value={c.type} className="bg-[#08090D] text-white">
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1 text-slate-400">기관명</label>
                  <input
                    type="text"
                    value={newAccountForm.institution}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, institution: e.target.value })}
                    placeholder="토스증권, 카카오페이증권, 업비트 등"
                    required
                    className={`w-full px-3 py-2 rounded-xl text-xs outline-none border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-white/[0.03] border-white/10 text-white focus:border-sky-500/40'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1 text-slate-400">계좌명 / 포트폴리오 별칭</label>
                  <input
                    type="text"
                    value={newAccountForm.accountName}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, accountName: e.target.value })}
                    placeholder="해외주식 종합계좌, 비트코인 적립 등"
                    required
                    className={`w-full px-3 py-2 rounded-xl text-xs outline-none border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-white/[0.03] border-white/10 text-white focus:border-sky-500/40'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1 text-slate-400">현재 잔고 / 평가액</label>
                  <input
                    type="number"
                    step="any"
                    value={newAccountForm.balance}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, balance: e.target.value })}
                    placeholder="10000000"
                    required
                    className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-white/[0.03] border-white/10 text-white focus:border-sky-500/40'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1 text-slate-400">메모 (선택)</label>
                  <input
                    type="text"
                    value={newAccountForm.note}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, note: e.target.value })}
                    placeholder="S&P 500, 배당주 위주"
                    className={`w-full px-3 py-2 rounded-xl text-xs outline-none border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-white/[0.03] border-white/10 text-white'
                    }`}
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.06]"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 transition-all"
                  >
                    계좌 추가
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Delete Account Confirmation Modal (Iframe & Cross-Origin Safe) */}
        {deletingAccount && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
            onClick={() => setDeletingAccount(null)}
          >
            <div 
              className={`w-full max-w-xs rounded-2xl border p-4 shadow-2xl space-y-3 animate-in zoom-in-95 duration-150 ${
                isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#121318]/95 backdrop-blur-xl border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] text-white'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-xl ${isLight ? 'bg-rose-100 text-rose-600' : 'bg-rose-500/20 text-rose-400'}`}>
                  <Trash2 size={16} />
                </div>
                <h4 className="text-xs font-bold">자산 계좌 삭제</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                <span className="font-semibold text-white">'{deletingAccount.name}'</span> 자산 계좌를 삭제하시겠습니까? 계좌 잔고 및 연결 데이터가 목록에서 제외됩니다.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeletingAccount(null)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-white/10 text-slate-400 hover:bg-white/5'
                  }`}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteAccount}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-all active:scale-95"
                >
                  삭제하기
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
