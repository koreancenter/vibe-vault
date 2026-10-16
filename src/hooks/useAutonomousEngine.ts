import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Transaction, 
  SupportedCurrency, 
  FxRates, 
  SubscriptionItem, 
  CashflowForecastSummary
} from '../types';
import { 
  detectSubscriptions, 
  calculateCashflowForecast 
} from '../autonomousFinance';
import { 
  getUserPreferences, 
  saveUserPreferences, 
  getAIEngineConfig, 
  applyTheme,
  UserPreferences
} from '../utils';

export interface UseAutonomousEngineOptions {
  transactions: Transaction[];
  currentCurrency: SupportedCurrency;
  fxRates: FxRates;
}

export interface UseAutonomousEngineReturn {
  // Recurring Subscriptions
  detectedSubscriptions: SubscriptionItem[];
  detectedSubsCount: number;
  monthlySubscriptionTotal: number;

  // Predictive Cashflow & Runway
  cashflowForecast: CashflowForecastSummary | null;
  dailyAverageBurn: number;
  projectedMonthEndBalance: number;
  hasLiquidityWarning: boolean;

  // AI Preferences & Stealth Mode
  userPrefs: UserPreferences;
  setUserPrefs: React.Dispatch<React.SetStateAction<UserPreferences>>;
  isStealth: boolean;
  toggleStealthMode: () => void;
  engineStatus: string;
  refreshEngineStatus: () => void;
  syncPreferences: () => void;
}

/**
 * Custom Hook: useAutonomousEngine
 * Architectural Domain: Autonomous AI CFO, Subscription Intelligence & Runway Forecasting
 * 
 * Orchestrates periodic subscription detection, predictive burn rate calculation,
 * liquidity warnings, and local engine configuration synchronization.
 */
export function useAutonomousEngine({
  transactions,
  currentCurrency,
  fxRates
}: UseAutonomousEngineOptions): UseAutonomousEngineReturn {
  const [userPrefs, setUserPrefs] = useState<UserPreferences>(() => getUserPreferences());
  const [isStealth, setIsStealth] = useState<boolean>(() => userPrefs.stealthMode);
  const [engineStatus, setEngineStatus] = useState<string>('🔒 온디바이스 AI 작동 중');

  /**
   * Refreshes the AI engine status string according to current engine configuration
   */
  const refreshEngineStatus = useCallback((): void => {
    const config = getAIEngineConfig();
    if (config.engineType === 'local') {
      const model = config.localModel === 'llama3-8b' ? 'Llama 3' : 'Gemma 2B';
      setEngineStatus(`🔒 온디바이스 AI 작동 중 (${model})`);
    } else {
      const provider = config.provider === 'gemini' ? 'Gemini' : config.provider === 'openai' ? 'OpenAI' : 'Claude';
      setEngineStatus(`✨ 클라우드 AI 연결됨 (${provider})`);
    }
  }, []);

  /**
   * Syncs user preferences across theme, stealth mode, and AI engines
   */
  const syncPreferences = useCallback((): void => {
    refreshEngineStatus();
    const prefs = getUserPreferences();
    setUserPrefs(prefs);
    setIsStealth(prefs.stealthMode);
    applyTheme(prefs.theme || 'dark');
  }, [refreshEngineStatus]);

  // Initial synchronization on mount
  useEffect(() => {
    refreshEngineStatus();
    applyTheme(userPrefs.theme || 'dark');
  }, [refreshEngineStatus, userPrefs.theme]);

  /**
   * Toggles stealth mode (masking amounts on screen)
   */
  const toggleStealthMode = useCallback((): void => {
    setIsStealth(prev => {
      const next = !prev;
      setUserPrefs(p => {
        const updated = { ...p, stealthMode: next };
        saveUserPreferences(updated);
        return updated;
      });
      return next;
    });
  }, []);

  /**
   * Autonomous Subscription Detector
   * Analyzes transaction histories for periodic cycles (28-32 days)
   */
  const detectedSubscriptions = useMemo((): SubscriptionItem[] => {
    return detectSubscriptions(transactions, currentCurrency, fxRates);
  }, [transactions, currentCurrency, fxRates]);

  const detectedSubsCount = useMemo(() => {
    return detectedSubscriptions.length;
  }, [detectedSubscriptions]);

  const monthlySubscriptionTotal = useMemo(() => {
    return detectedSubscriptions
      .filter(s => s.isActive)
      .reduce((acc, curr) => acc + curr.normalizedMonthlyAmount, 0);
  }, [detectedSubscriptions]);

  /**
   * Predictive Cashflow Runway & Liquidity Engine
   */
  const cashflowForecast = useMemo((): CashflowForecastSummary | null => {
    if (transactions.length === 0) return null;
    try {
      return calculateCashflowForecast(transactions, detectedSubscriptions, currentCurrency, fxRates);
    } catch (e) {
      console.error('[useAutonomousEngine] calculateCashflowForecast failed:', e);
      return null;
    }
  }, [transactions, detectedSubscriptions, currentCurrency, fxRates]);

  const dailyAverageBurn = useMemo(() => {
    return cashflowForecast?.dailyAverageBurn || 0;
  }, [cashflowForecast]);

  const projectedMonthEndBalance = useMemo(() => {
    return cashflowForecast?.projectedMonthEndBalance || 0;
  }, [cashflowForecast]);

  const hasLiquidityWarning = useMemo(() => {
    if (!cashflowForecast) return false;
    return cashflowForecast.deficitDay !== null || cashflowForecast.projectedMonthEndBalance < 0;
  }, [cashflowForecast]);

  return {
    detectedSubscriptions,
    detectedSubsCount,
    monthlySubscriptionTotal,

    cashflowForecast,
    dailyAverageBurn,
    projectedMonthEndBalance,
    hasLiquidityWarning,

    userPrefs,
    setUserPrefs,
    isStealth,
    toggleStealthMode,
    engineStatus,
    refreshEngineStatus,
    syncPreferences
  };
}
