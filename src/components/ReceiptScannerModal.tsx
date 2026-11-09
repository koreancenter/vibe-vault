import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  Upload, 
  Loader2, 
  X, 
  Check, 
  WifiOff, 
  RefreshCw, 
  Image as ImageIcon,
  AlertCircle,
  ShieldAlert
} from 'lucide-react';
import { ParsedReceiptData, SupportedCurrency } from '../types';
import { getAIEngineConfig, getCurrencySymbol } from '../utils';
import { parseReceiptWithResilience } from '../autonomousFinance';
import { parseReceiptTextLocally } from '../financialParser';
import { hasSecureGeminiApiKey } from '../geminiKeyManager';
import {
  sanitizeAndProcessImage,
  extractImageFileFromClipboard,
  extractImageFileFromDataTransfer,
  ImageSanitizationError,
  SanitizedImageMetadata
} from '../imageSanitizer';
import { useI18n } from '../i18n';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (receipt: ParsedReceiptData) => void;
  onOpenSettings?: (tab?: 'assets' | 'engine' | 'preferences' | 'privacy') => void;
  theme?: 'dark' | 'light';
  currentCurrency?: SupportedCurrency;
}

export const ReceiptScannerModal: React.FC<ReceiptScannerModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onOpenSettings,
  theme = 'dark',
  currentCurrency = 'KRW'
}) => {
  const { t, getLocalizedCategory, getLocalizedPaymentMethod } = useI18n();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [compressionMeta, setCompressionMeta] = useState<SanitizedImageMetadata | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryInfo, setRetryInfo] = useState<{ attempt: number; reason: string } | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedReceiptData | null>(null);
  const [sourceType, setSourceType] = useState<'gemini' | 'local_fallback' | 'local_deterministic' | null>(null);

  // Mode switcher: 'scan' (photo dropzone) or 'text' (unboxed textarea parser)
  const [inputMode, setInputMode] = useState<'scan' | 'text'>('scan');
  const [fallbackRawText, setFallbackRawText] = useState('');

  // Network Connectivity
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef<number>(0);
  const objectUrlRef = useRef<string | null>(null);
  const imagePreviewRef = useRef<string | null>(null);
  const isLight = theme === 'light';

  // Keep imagePreviewRef in sync with state for safe cleanup
  useEffect(() => {
    imagePreviewRef.current = imagePreview;
  }, [imagePreview]);

  // Revoke active Object URL safely to prevent browser memory leaks
  const revokeActiveObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch {
        // Safe fallback
      }
      objectUrlRef.current = null;
    }
    if (imagePreviewRef.current && imagePreviewRef.current.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(imagePreviewRef.current);
      } catch {
        // Safe fallback
      }
      imagePreviewRef.current = null;
    }
  }, []);

  // Monitor network connectivity
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Analysis executor with resilient retry & local fallback
  const runAnalysis = useCallback(async (base64Image: string, mimeType: string) => {
    setIsScanning(true);
    setError(null);
    setRetryInfo(null);

    try {
      const engineConfig = getAIEngineConfig();
      const result = await parseReceiptWithResilience({
        imageBase64: base64Image,
        mimeType,
        engineConfig,
        defaultCurrency: currentCurrency,
        rawFallbackText: fallbackRawText,
        maxRetries: 3,
        onRetry: (attempt, delayMs, reason) => {
          revokeActiveObjectUrl();
          setRetryInfo({
            attempt,
            reason: `${reason} (${attempt + 1}/3)`
          });
        }
      });

      setParsedResult(result.receipt);
      setSourceType(result.source);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Receipt analysis error';
      setError(message);
      setInputMode('text');
    } finally {
      setIsScanning(false);
      setRetryInfo(null);
    }
  }, [currentCurrency, fallbackRawText, revokeActiveObjectUrl]);

  // Secure Image Processing & Pixel Re-rasterization Pipeline
  const processFile = useCallback(async (file: File) => {
    setError(null);
    setParsedResult(null);
    setRetryInfo(null);
    setIsScanning(true);

    revokeActiveObjectUrl();

    try {
      const sanitized = await sanitizeAndProcessImage(file, {
        maxDimension: 1280,
        quality: 0.8,
        preferredMime: 'image/webp'
      });

      setImagePreview(sanitized.dataUrl);
      setCompressionMeta(sanitized.metadata);

      if (isOffline) {
        setIsScanning(false);
        setInputMode('text');
        setError(t('offline_banner'));
        return;
      }

      await runAnalysis(sanitized.base64, sanitized.mimeType);
    } catch (err: unknown) {
      setIsScanning(false);
      revokeActiveObjectUrl();
      if (err instanceof ImageSanitizationError) {
        let msg = err.message;
        if (err.code === 'SVG_XSS_DETECTED') {
          msg = 'SVG / Script vector images are blocked for security. Please upload a standard JPG, PNG, or WebP photo.';
        } else if (err.code === 'FILE_TOO_LARGE') {
          msg = 'File size exceeds limit (max 15MB).';
        } else if (err.code === 'DISALLOWED_EXTENSION' || err.code === 'DISALLOWED_MIME_TYPE') {
          msg = 'Unsupported file format. Please upload JPG, PNG, or WebP image files.';
        } else if (err.code === 'CORRUPTED_MAGIC_HEADER') {
          msg = 'Image header validation failed. Please check your image file.';
        }
        setError(msg);
      } else {
        const message = err instanceof Error ? err.message : 'Image processing failed';
        setError(message);
      }
    }
  }, [isOffline, revokeActiveObjectUrl, runAnalysis, t]);

  // Support clipboard paste (Cmd+V / Ctrl+V) for screenshot uploads
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      const file = extractImageFileFromClipboard(e);
      if (file) {
        e.preventDefault();
        processFile(file);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [isOpen, processFile]);

  // Prevent memory leaks on unmount: revoke any active Object URLs
  useEffect(() => {
    return () => {
      revokeActiveObjectUrl();
      setImagePreview(null);
      setCompressionMeta(null);
    };
  }, [revokeActiveObjectUrl]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    dragCounterRef.current = 0;

    const file = extractImageFileFromDataTransfer(e.dataTransfer);
    if (file) {
      processFile(file);
    } else {
      setError(t('receipt_dropzone_hint'));
    }
  };

  const handleRunLocalFallback = useCallback(() => {
    const trimmed = fallbackRawText.trim();
    if (!trimmed) {
      return;
    }

    setError(null);
    try {
      const localParsed = parseReceiptTextLocally(trimmed, currentCurrency);
      setParsedResult(localParsed);
      setSourceType('local_fallback');
    } catch {
      setError('Local parser analysis failed');
    }
  }, [fallbackRawText, currentCurrency]);

  const handleReset = useCallback(() => {
    revokeActiveObjectUrl();
    if (imagePreview && imagePreview.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(imagePreview);
      } catch {
        // No-op
      }
    }
    setImagePreview(null);
    setCompressionMeta(null);
    setParsedResult(null);
    setError(null);
    setRetryInfo(null);
    setInputMode('scan');
    setFallbackRawText('');
    setIsDraggingOver(false);
    dragCounterRef.current = 0;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [imagePreview, revokeActiveObjectUrl]);

  const handleApply = () => {
    if (parsedResult) {
      onConfirm(parsedResult);
      onClose();
      handleReset();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className={`w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden transition-all flex flex-col max-h-[90dvh] ${
          isLight 
            ? 'bg-white border-slate-200 text-slate-900' 
            : 'bg-[#0E1015] border-white/[0.08] text-neutral-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile top drag handle */}
        <div className="w-12 h-1 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0 bg-white/20" />

        {/* Typographic Header */}
        <div className={`px-5 sm:px-6 py-4 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'border-slate-100 bg-slate-50/50' : 'border-white/[0.06] bg-transparent'
        }`}>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">{t('receipt_scanner_title')}</h2>
            <p className="text-xs text-neutral-400 font-light mt-0.5">
              {t('receipt_scanner_desc')}
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/[0.06] text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Network & Offline Status Banner */}
        {isOffline && (
          <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs flex items-center gap-2">
            <WifiOff size={14} className="shrink-0" />
            <span className="font-medium text-[11px]">{t('offline_banner')}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Actionable Guidance for Missing or Invalid Keys */}
          {error && (error.includes('API_KEY_REQUIRED') || error.includes('INVALID_API_KEY')) ? (
            <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] flex flex-col gap-3 animate-in fade-in duration-200">
              <div className="text-xs space-y-1">
                <p className="font-semibold text-white text-sm">
                  {error.includes('INVALID_API_KEY') ? 'Gemini API Key Authentication Failed' : 'Gemini API Key Required'}
                </p>
                <p className="leading-relaxed text-neutral-300 text-[11px]">
                  Cloud AI receipt parsing uses your personal Gemini API key. Add it in settings or enter text manually below.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSettings('engine');
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
                  >
                    <span>{t('tab_ai_engine')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setInputMode('text');
                  }}
                  className="py-2 px-3 rounded-xl text-xs font-medium border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 transition-all active:scale-95 cursor-pointer"
                >
                  {t('switch_to_text_input')}
                </button>
              </div>
            </div>
          ) : error ? (
            <div className={`p-3.5 rounded-2xl border text-xs flex items-start justify-between gap-2.5 transition-all ${
              error.includes('보안') || error.includes('SVG') || error.includes('XSS')
                ? 'bg-amber-500/[0.06] border-amber-500/20 text-amber-300'
                : 'bg-white/[0.05] border-white/10 text-neutral-300'
            }`}>
              <div className="flex items-start gap-2.5">
                {error.includes('보안') || error.includes('SVG') || error.includes('XSS') ? (
                  <ShieldAlert size={16} className="shrink-0 mt-0.5 text-amber-400" />
                ) : (
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-neutral-400" />
                )}
                <div className="space-y-0.5">
                  <p className="leading-relaxed text-[11px] opacity-90">{error}</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setError(null)} 
                className="text-sm font-bold opacity-60 hover:opacity-100 shrink-0 p-1 text-neutral-400 hover:text-white cursor-pointer"
                aria-label={t('close')}
              >
                ×
              </button>
            </div>
          ) : null}

          {/* Retry notification */}
          {retryInfo && (
            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-neutral-300 text-xs flex items-center gap-2.5 animate-pulse">
              <RefreshCw size={14} className="animate-spin text-white shrink-0" />
              <div>
                <span className="font-semibold text-white">Retrying ({retryInfo.attempt}/3)...</span>
                <p className="text-[11px] text-neutral-400 mt-0.5">{retryInfo.reason}</p>
              </div>
            </div>
          )}

          {!imagePreview ? (
            inputMode === 'scan' ? (
              /* Scan Mode: Sleek hairline photo dropzone */
              <div className="space-y-3">
                <div
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.035] rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                    isDraggingOver ? 'border-white/40 bg-white/[0.06] scale-[1.01]' : ''
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                    aria-label={t('receipt_dropzone_prompt')}
                  />
                  <div className={`w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto text-neutral-300 mb-3 transition-transform ${
                    isDraggingOver ? 'scale-110' : ''
                  }`}>
                    <Upload size={20} className={isDraggingOver ? 'animate-bounce' : ''} />
                  </div>
                  <p className="text-sm font-medium text-white">
                    {isDraggingOver ? t('receipt_dropzone_dragging') : t('receipt_dropzone_prompt')}
                  </p>
                  <p className="text-xs text-neutral-400 font-light mt-1">
                    {t('receipt_dropzone_hint')}
                  </p>
                  <p className="text-[11px] text-neutral-400 font-light mt-3">
                    {t('receipt_privacy_warning')}
                  </p>
                </div>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setInputMode('text')}
                    className="text-xs text-neutral-400 hover:text-white underline underline-offset-4 transition-colors cursor-pointer"
                  >
                    {t('switch_to_text_input')}
                  </button>
                </div>
              </div>
            ) : (
              /* Text Mode: Clean unboxed textarea parser */
              <div className="space-y-3">
                <div>
                  <h3 className="text-xs font-semibold text-white mb-1">
                    {t('manual_text_parser_title')}
                  </h3>
                  <p className="text-xs text-neutral-400 font-light">
                    {t('manual_text_parser_desc')}
                  </p>
                </div>

                <textarea
                  value={fallbackRawText}
                  onChange={(e) => setFallbackRawText(e.target.value)}
                  placeholder="Starbucks Coffee&#10;2026-09-19&#10;Americano $4.50&#10;Total: $4.50"
                  rows={5}
                  aria-label={t('manual_text_parser_title')}
                  className="w-full p-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.02] text-neutral-200 text-xs font-mono resize-none focus:outline-hidden focus:border-white/25 transition-colors"
                />

                <button
                  type="button"
                  onClick={handleRunLocalFallback}
                  className="w-full py-3 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-all cursor-pointer shadow-xs active:scale-[0.99]"
                >
                  {t('run_local_parser')}
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setInputMode('scan')}
                    className="text-xs text-neutral-400 hover:text-white underline underline-offset-4 transition-colors cursor-pointer"
                  >
                    {t('switch_to_photo_mode')}
                  </button>
                </div>
              </div>
            )
          ) : (
            /* Image Preview & Scan Result */
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] max-h-44 bg-black/60 flex items-center justify-center">
                <img 
                  src={imagePreview} 
                  alt="Receipt Preview" 
                  className="w-full h-44 object-cover opacity-90"
                />
                
                {/* Compression Specs Badge */}
                {compressionMeta && (
                  <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-mono text-neutral-300 flex items-center gap-2">
                    <span className="flex items-center gap-1 text-neutral-200">
                      <ImageIcon size={10} />
                      {compressionMeta.width}×{compressionMeta.height}
                    </span>
                    <span className="opacity-40">|</span>
                    <span>{compressionMeta.mimeType.replace('image/', '').toUpperCase()}</span>
                    <span className="opacity-40">|</span>
                    <span>{compressionMeta.originalKB}KB → <strong className="text-white">{compressionMeta.compressedKB}KB</strong></span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleReset}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 border border-white/10 text-neutral-300 hover:text-white hover:bg-black transition-colors cursor-pointer"
                  title={t('rescan')}
                  aria-label={t('rescan')}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Scanning indicator */}
              {isScanning && (
                <div className="py-5 px-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] text-center space-y-2 flex flex-col items-center">
                  <Loader2 size={26} className="animate-spin text-white" />
                  <p className="text-sm font-semibold text-white">{t('analyzing_receipt_status')}</p>
                  <p className="text-xs text-neutral-400 font-light">
                    {t('analyzing_receipt_substatus')}
                  </p>
                </div>
              )}

              {/* Parsed Result Card */}
              {parsedResult && !isScanning && (
                <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                        <Check size={14} /> {t('ai_analysis_complete')}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-neutral-300 font-medium">
                        {sourceType === 'local_fallback' ? 'Local Parser' : 'Gemini 3.8 Flash'}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-neutral-400">
                      {t('confidence_percent', { percent: Math.round(parsedResult.confidenceScore * 100) })}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <label htmlFor="receipt-merchant-input" className="text-[10px] block font-medium text-neutral-400 mb-0.5">
                          {t('merchant')}
                        </label>
                        <input
                          id="receipt-merchant-input"
                          type="text"
                          value={parsedResult.merchantName || parsedResult.merchant || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setParsedResult(prev => prev ? { ...prev, merchantName: val, merchant: val } : null);
                          }}
                          className="w-full text-sm font-bold text-white bg-transparent border-b border-white/[0.08] focus:border-white/40 pb-0.5 focus:outline-hidden transition-colors"
                          placeholder={t('merchant')}
                        />
                      </div>

                      <div className="w-28 shrink-0">
                        <label htmlFor="receipt-date-input" className="text-[10px] block font-medium text-neutral-400 mb-0.5">
                          {t('payment_date')}
                        </label>
                        <input
                          id="receipt-date-input"
                          type="date"
                          value={parsedResult.date || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setParsedResult(prev => prev ? { ...prev, date: val } : null);
                          }}
                          className="w-full text-xs font-mono text-neutral-200 bg-transparent border-b border-white/[0.08] focus:border-white/40 pb-0.5 focus:outline-hidden transition-colors"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="flex items-center gap-1.5">
                        <label htmlFor="receipt-currency-select" className="text-[10px] font-medium text-neutral-400">
                          {t('currency')}
                        </label>
                        <select
                          id="receipt-currency-select"
                          value={parsedResult.currency || currentCurrency}
                          onChange={(e) => {
                            const val = e.target.value as SupportedCurrency;
                            setParsedResult(prev => prev ? { ...prev, currency: val } : null);
                          }}
                          className="text-xs font-mono font-semibold rounded-lg px-2 py-0.5 border border-white/[0.08] bg-[#15171E] text-white focus:outline-hidden transition-colors cursor-pointer"
                        >
                          <option value="KRW">KRW (₩)</option>
                          <option value="USD">USD ($)</option>
                          <option value="EUR">EUR (€)</option>
                          <option value="JPY">JPY (¥)</option>
                          <option value="GBP">GBP (£)</option>
                          <option value="IDR">IDR (Rp)</option>
                        </select>
                      </div>

                      <div className="flex items-center justify-end gap-1.5 flex-1">
                        <label htmlFor="receipt-total-input" className="text-[10px] font-medium text-neutral-400">
                          {t('total_payment_amount')}
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-bold text-white font-mono">
                            {getCurrencySymbol(parsedResult.currency as SupportedCurrency)}
                          </span>
                          <input
                            id="receipt-total-input"
                            type="number"
                            step={parsedResult.currency === 'USD' || parsedResult.currency === 'EUR' || parsedResult.currency === 'GBP' ? '0.01' : '1'}
                            value={isNaN(parsedResult.totalAmount) ? '' : parsedResult.totalAmount}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setParsedResult(prev => prev ? { ...prev, totalAmount: isNaN(val) ? 0 : val } : null);
                            }}
                            className="w-28 text-right text-base font-black font-mono text-white bg-transparent border-b border-white/[0.08] focus:border-white/40 pb-0.5 focus:outline-hidden transition-colors"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Items List */}
                  {parsedResult.items && parsedResult.items.length > 0 && (
                    <div className="pt-2 border-t border-white/[0.06]">
                      <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block mb-1.5">
                        {t('extracted_line_items', { count: parsedResult.items.length })}
                      </span>
                      <div className="space-y-1 max-h-24 overflow-y-auto scrollbar-none pr-1">
                        {parsedResult.items.map((it, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                            <span className="truncate pr-2 text-neutral-300">
                              {it.name} {it.quantity && it.quantity > 1 ? `× ${it.quantity}` : ''}
                            </span>
                            <span className="font-mono text-neutral-200 shrink-0">
                              {getCurrencySymbol(parsedResult.currency as SupportedCurrency)}{(it.price || it.amount || 0).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                    <span className="px-2.5 py-1 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[11px] font-medium text-neutral-300">
                      {t('label_category')}: {getLocalizedCategory(parsedResult.category || parsedResult.suggestedCategory || '')}
                    </span>
                    {parsedResult.paymentMethod && (
                      <span className="px-2.5 py-1 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[11px] font-medium text-neutral-300">
                        {t('label_payment_method')}: {getLocalizedPaymentMethod(parsedResult.paymentMethod)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Unified Footer Actions */}
        <div className={`px-5 sm:px-6 py-4 border-t flex items-center gap-2.5 shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-100' : 'bg-transparent border-white/[0.06]'
        }`}>
          {parsedResult ? (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="w-full py-3 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white text-xs font-medium transition-all cursor-pointer"
              >
                {t('rescan')}
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="w-full bg-white hover:bg-neutral-200 text-black font-semibold text-xs py-3 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.99] cursor-pointer"
              >
                <Check size={14} />
                <span>{t('record_to_ledger')}</span>
              </button>
            </>
          ) : imagePreview && !isScanning ? (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="w-full py-3 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white text-xs font-medium transition-all cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (imagePreview && compressionMeta) {
                    runAnalysis(imagePreview, compressionMeta.mimeType);
                  }
                }}
                className="w-full bg-white hover:bg-neutral-200 text-black font-semibold text-xs py-3 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.99] cursor-pointer"
              >
                <RefreshCw size={13} />
                <span>{t('reanalyze')}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white text-xs font-medium border border-white/[0.08] transition-all cursor-pointer"
            >
              {t('close')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReceiptScannerModal;
