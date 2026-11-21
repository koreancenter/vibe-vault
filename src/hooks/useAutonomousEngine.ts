import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Transaction, 
  SupportedCurrency, 
  FxRates, 
  SubscriptionItem, 
  CashflowForecastSummary
} from '../types';
import { 
  getUserPreferences, 
  saveUserPreferences, 
  getAIEngineConfig, 
  saveAIEngineConfig,
  AIEngineConfig,
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
  engineConfig: AIEngineConfig;
  updateEngineConfig: (partial: Partial<AIEngineConfig>) => void;
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
  const [engineConfig, setEngineConfig] = useState<AIEngineConfig>(() => getAIEngineConfig());
  const [engineStatus, setEngineStatus] = useState<string>('🔒 온디바이스 AI 작동 중');

  /**
   * Refreshes the AI engine status string according to current engine configuration
   */
  const refreshEngineStatus = useCallback((): void => {
    const config = getAIEngineConfig();
    setEngineConfig(config);
    if (config.engineType === 'local') {
      if (config.localSubMode === 'ollama') {
        setEngineStatus(`🔒 온디바이스 AI 작동 중 (Ollama · ${config.ollamaModel || 'local'})`);
      } else {
        const model = config.localModel === 'llama3-8b' ? 'Llama 3' : 'Gemma 2B';
        setEngineStatus(`🔒 온디바이스 AI 작동 중 (${model})`);
      }
    } else {
      const provider = config.provider === 'gemini' ? 'Gemini' : config.provider === 'openai' ? 'OpenAI' : 'Claude';
      setEngineStatus(`✨ 클라우드 AI 연결됨 (${provider})`);
    }
  }, []);

  /**
   * Updates and persists AI engine configuration immediately
   */
  const updateEngineConfig = useCallback((partial: Partial<AIEngineConfig>): void => {
    const current = getAIEngineConfig();
    const next: AIEngineConfig = {
      ...current,
      ...partial,
    };
    saveAIEngineConfig(next);
    setEngineConfig(next);
    refreshEngineStatus();
  }, [refreshEngineStatus]);

  /**
   * Syncs user preferences across theme, stealth mode, and AI engines
   */
  const syncPreferences = useCallback((): void => {
    refreshEngineStatus();
    const prefs = getUserPreferences();
    setUserPrefs(prefs);
    setIsStealth(prefs.stealthMode);
    applyTheme(prefs.theme || 'dark', prefs.seasonTheme);
  }, [refreshEngineStatus]);

  // Initial synchronization on mount
  useEffect(() => {
    refreshEngineStatus();
    applyTheme(userPrefs.theme || 'dark', userPrefs.seasonTheme);
  }, [refreshEngineStatus, userPrefs.theme, userPrefs.seasonTheme]);

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

  // Forecast & subscription detection are computed lazily inside InsightsSection
  // to avoid pulling autonomousFinance (40KB) into the initial VaultWorkspace bundle.
  const detectedSubscriptions = useMemo((): SubscriptionItem[] => [], []);
  const detectedSubsCount = 0;
  const monthlySubscriptionTotal = 0;
  const cashflowForecast: CashflowForecastSummary | null = null;
  const dailyAverageBurn = 0;
  const projectedMonthEndBalance = 0;
  const hasLiquidityWarning = false;

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
    engineConfig,
    updateEngineConfig,
    engineStatus,
    refreshEngineStatus,
    syncPreferences
  };
}
