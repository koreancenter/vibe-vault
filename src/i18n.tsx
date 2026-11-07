import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { SupportedCurrency } from './types';

export type LanguageCode = 'ko' | 'en' | 'ja' | 'eu';

export const LANGUAGE_STORAGE_KEY = 'vibe_user_language';

export const DEFAULT_CURRENCY_BY_LANGUAGE: Record<LanguageCode, SupportedCurrency> = {
  ko: 'KRW',
  en: 'USD',
  ja: 'JPY',
  eu: 'EUR',
};

/**
 * Tier 2 Detection Helper: Matches navigator languages to one of the 4 supported regional codes
 */
export function detectBrowserLanguage(): LanguageCode {
  if (typeof navigator === 'undefined') return 'en';

  const languages = navigator.languages && navigator.languages.length > 0 
    ? navigator.languages 
    : [navigator.language || ''];

  for (const rawLang of languages) {
    if (!rawLang) continue;
    const l = rawLang.toLowerCase();

    // Korean
    if (l.startsWith('ko')) {
      return 'ko';
    }
    // Japanese
    if (l.startsWith('ja')) {
      return 'ja';
    }
    // European languages: German (de), French (fr), Spanish (es), Italian (it), Dutch (nl), Portuguese (pt)
    if (
      l.startsWith('de') || 
      l.startsWith('fr') || 
      l.startsWith('es') || 
      l.startsWith('it') || 
      l.startsWith('nl') || 
      l.startsWith('pt')
    ) {
      return 'eu';
    }
    // English or other
    if (l.startsWith('en')) {
      return 'en';
    }
  }

  // Tier 3 Canonical fallback
  return 'en';
}

/**
 * 3-Tier Language Resolution:
 * 1. Tier 1: localStorage saved preference ('vibe_user_language')
 * 2. Tier 2: navigator.language / languages browser detection
 * 3. Tier 3: Canonical fallback ('en')
 */
export function resolveInitialLanguage(): LanguageCode {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) as LanguageCode | null;
    if (saved && (saved === 'ko' || saved === 'en' || saved === 'ja' || saved === 'eu')) {
      return saved;
    }
  }

  return detectBrowserLanguage();
}

export const translations = {
  en: {
    // Navigation
    vault: 'Vault',
    insights: 'Insights',
    ledger: 'Ledger',

    // Omnibar Placeholders
    placeholder_vault: 'e.g. Chase Checking $4,200, Apple Stock $12k',
    placeholder_insights: 'e.g. FX gains this month, dining expense ratio',
    placeholder_ledger: 'e.g. Lunch $15, MacBook $1,800 10mo split',

    // Ledger Filters
    filter_all: 'All',
    filter_expense: 'Expense',
    filter_income: 'Income',
    filter_transfer: 'Transfer',
    filter_settlement: 'Settlement',

    // KPI Metrics
    net_worth: 'Net Worth',
    total_assets: 'Total Assets',
    total_liabilities: 'Total Liabilities',
    savings_rate: 'Savings Rate',
    burn_rate: 'Burn Rate',
    runway_months: 'Runway',
    emergency_cushion: 'Emergency Cushion',

    // Common Actions
    edit: 'Edit',
    delete: 'Delete',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    print_report: 'Print Report',
    export_csv: 'Export CSV',
    lock_vault: 'Lock Vault',
    reset_all: 'Reset All',

    // Categories
    cat_food: 'Food & Dining',
    cat_cafe: 'Cafe',
    cat_dining: 'Dining',
    cat_living: 'Living & Shopping',
    cat_transport: 'Transport',
    cat_fixed: 'Fixed Expenses',
    cat_health: 'Health & Medical',
    cat_leisure: 'Leisure & Culture',
    cat_uncategorized: 'Uncategorized',

    // Settings Tabs
    tab_smart_assets: 'Smart Assets',
    tab_monthly_budget: 'Monthly Budget',
    tab_subscriptions: 'Subscriptions',
    tab_ai_engine: 'AI Engine',
    tab_preferences: 'Preferences',
    tab_privacy_data: 'Data & Privacy',

    // Language Selector
    language: 'Language',
    language_desc: 'Interface language and default regional formatting',
    lang_ko: '한국어 (KO)',
    lang_en: 'English (EN)',
    lang_ja: '日本語 (JA)',
    lang_eu: 'European (EU)',
    currency_switch_prompt: 'Would you like to switch your base currency to {currency}?',
    switch_currency: 'Switch Currency',
    keep_currency: 'Keep Current',

    // Additional UI Elements
    settings: 'Settings',
    save_settings: 'Save Settings',
    screen_settings: 'Screen Settings',
    default_launch_screen: 'Default Launch Screen',
    display_and_currency: 'Display & Currency',
    base_currency: 'Base Currency',
    base_currency_desc: 'Benchmark for net worth and valuation',
    active_currencies: 'Active Currencies',
    multi_currency_mode: 'Multi-Currency Mode',
    single_currency_mode: 'Single-Currency Mode',
    stealth_mode: 'Stealth Mode (Mask Amounts)',
    stealth_mode_desc_on: 'All balances and numbers are masked for privacy',
    stealth_mode_desc_off: 'All balances and numbers are visible',
    ledger_settings: 'Ledger Settings',
    budget_start_day: 'Budget Start Day',
    multi_ledger_spaces: 'Multi-Ledger Spaces',
    new_space: 'New Ledger',
    offline_banner: 'You are offline. Data is safely stored locally.',
    empty_ledger_title: 'No transactions recorded yet',
    empty_filter_message: 'No transactions match the selected filter.',
    view_all_transactions: 'View all transactions',
    scan_receipt: 'Scan Receipt',
    load_sample_data: 'Load Sample Data',
    recommended_prompts: 'Quick prompt suggestions (tap to run):',
    records_added: '{count} transactions recorded',
    financial_summary: 'Financial Summary',
    monthly_comparison: 'Monthly Spending Comparison',
    vs_previous_month: 'vs Previous Month',
    this_month: 'This Month',
    last_month: 'Last Month',
    status_saving: 'Saved',
    status_over: 'Over',
    status_maintained: 'Maintained',
    project_settlement: 'Project & Event Settlement',
    project_budget: 'Target Budget',
    per_person_share: 'Per-Person Share',
    remaining_budget: 'Remaining Budget',
    burn_percentage: 'Budget Burn',
    print_settlement_report: 'Print Settlement Report',
    screen_scan: 'Screen Scan',
    account_transfer: 'Transfer',
    add_asset: 'Add Asset',
    portfolio_ratio: 'Asset Allocation',
    cat_investment: 'Investments',
    cat_deposit: 'Savings & Deposits',
    cat_crypto: 'Crypto',
    cat_cash: 'Cash',
    cat_real_estate: 'Real Estate',
    cat_debt: 'Liabilities',
    accounts_count: '{count} accounts',
    ai_briefing: 'AI Financial Briefing',
    ai_diagnosis: 'AI Executive Diagnosis',
    action_guide: 'Action Guide',
    category_analysis: 'Category Spending Breakdown',
    daily_trend: 'Daily Spending Trend',
    vault_lock_title: 'Vibe Vault',
    enter_pin: 'Enter Master PIN',
    setup_pin: 'Set up Master PIN (4-6 digits)',
    confirm_pin: 'Re-enter PIN to confirm',
    unlock: 'Unlock',
    biometric_unlock: 'Biometric Unlock (Fingerprint / Face ID)',
    guest_mode: 'Skip for now (Guest Mode)',
    privacy_policy: 'Privacy Policy',
    replay_tour: 'Replay Tour',
    dutch_pay_completed: 'Split Settlement Completed',
    dutch_pay_received: '+{symbol}{amount} Received',
  },

  ko: {
    // Navigation
    vault: '자산',
    insights: '인사이트',
    ledger: '장부',

    // Omnibar Placeholders
    placeholder_vault: '예: 신한 마통 -350만, 토스증권 1,250만',
    placeholder_insights: '예: 9월 환차익 얼마야?, 이번 달 식비 비중',
    placeholder_ledger: '예: 점심 9천원, 갤럭시북 180만 10개월 할부',

    // Ledger Filters
    filter_all: '전체',
    filter_expense: '지출',
    filter_income: '수입',
    filter_transfer: '이체',
    filter_settlement: '정산',

    // KPI Metrics
    net_worth: '총 순자산',
    total_assets: '총 자산',
    total_liabilities: '총 부채',
    savings_rate: '저축률',
    burn_rate: '순자산 대비 소비',
    runway_months: '비상 유동성 완충',
    emergency_cushion: '비상금 완충',

    // Common Actions
    edit: '수정',
    delete: '삭제',
    save: '저장',
    cancel: '취소',
    close: '닫기',
    print_report: '결산서 출력',
    export_csv: '내보내기',
    lock_vault: '금고 잠그기',
    reset_all: '전체 초기화',

    // Categories
    cat_food: '식비',
    cat_cafe: '카페',
    cat_dining: '식사',
    cat_living: '생활·쇼핑',
    cat_transport: '교통',
    cat_fixed: '고정비',
    cat_health: '건강·의료',
    cat_leisure: '문화·여가',
    cat_uncategorized: '미분류',

    // Settings Tabs
    tab_smart_assets: '스마트 자산',
    tab_monthly_budget: '월간 예산',
    tab_subscriptions: '구독 관리',
    tab_ai_engine: 'AI 엔진',
    tab_preferences: '일반 설정',
    tab_privacy_data: '데이터 관리',

    // Language Selector
    language: '언어 설정',
    language_desc: '인터페이스 언어 및 기본 지역 서식 선택',
    lang_ko: '한국어 (KO)',
    lang_en: 'English (EN)',
    lang_ja: '日本語 (JA)',
    lang_eu: 'European (EU)',
    currency_switch_prompt: '기본 기준 통화를 {currency}(으)로 전환하시겠습니까?',
    switch_currency: '통화 전환',
    keep_currency: '현재 유지',

    // Additional UI Elements
    settings: '설정',
    save_settings: '설정 저장',
    screen_settings: '화면 설정',
    default_launch_screen: '기본 시작 화면',
    display_and_currency: '표시 및 통화',
    base_currency: '기본 기준 통화',
    base_currency_desc: '대시보드 및 모든 자산 평가의 기준',
    active_currencies: '활성 통화 관리',
    multi_currency_mode: '다중 통화 모드',
    single_currency_mode: '단일 통화 모드',
    stealth_mode: '스텔스 모드 (금액 숨김)',
    stealth_mode_desc_on: '모든 잔고 및 금액이 마스킹되어 보호 중입니다',
    stealth_mode_desc_off: '화면에 모든 금액이 표시됩니다',
    ledger_settings: '장부 설정',
    budget_start_day: '예산 시작일',
    multi_ledger_spaces: '다중 장부 관리',
    new_space: '새 장부',
    offline_banner: '오프라인 상태입니다. 기록된 데이터는 기기에 안전하게 보관됩니다.',
    empty_ledger_title: '기록된 거래 내역이 없습니다',
    empty_filter_message: '선택한 조건의 거래 내역이 없습니다.',
    view_all_transactions: '전체 내역 보기',
    scan_receipt: '영수증 촬영 스캔',
    load_sample_data: '샘플 데이터 로드',
    recommended_prompts: '자연어 입력 추천 예시 (터치하여 실행):',
    records_added: '{count}건의 거래가 기록되었습니다',
    financial_summary: '재무 요약',
    monthly_comparison: '월별 지출 비교',
    vs_previous_month: '전월 대비 변동',
    this_month: '이번 달',
    last_month: '지난달',
    status_saving: '절약',
    status_over: '초과',
    status_maintained: '유지',
    project_settlement: '프로젝트·행사 정산',
    project_budget: '목표 예산',
    per_person_share: '1인당 분담금',
    remaining_budget: '잔여 예산',
    burn_percentage: '예산 소진율',
    print_settlement_report: '결산서 출력',
    screen_scan: '화면 스캔',
    account_transfer: '계좌 간 이체',
    add_asset: '자산 추가',
    portfolio_ratio: '자산 포트폴리오 비중',
    cat_investment: '투자',
    cat_deposit: '예적금',
    cat_crypto: '가상자산',
    cat_cash: '현금',
    cat_real_estate: '부동산',
    cat_debt: '부채',
    accounts_count: '{count}개 계좌',
    ai_briefing: 'AI 재정 브리핑',
    ai_diagnosis: 'AI 총괄 재정 진단',
    action_guide: '실행 가이드',
    category_analysis: '카테고리별 지출 분석',
    daily_trend: '일별 지출 추이',
    vault_lock_title: 'Vibe Vault',
    enter_pin: '마스터 PIN을 입력해주세요',
    setup_pin: '마스터 PIN을 설정해주세요 (4~6자리)',
    confirm_pin: '확인을 위해 동일한 PIN 번호를 다시 입력해주세요',
    unlock: '잠금 해제',
    biometric_unlock: '생체 인증(지문/Face ID)으로 해제',
    guest_mode: '나중에 설정하기 (게스트 모드)',
    privacy_policy: '개인정보취급방침',
    replay_tour: '기능 다시보기',
    dutch_pay_completed: '더치페이 정산 완료',
    dutch_pay_received: '+{symbol}{amount} 입금',
  },

  ja: {
    // Navigation
    vault: '資産',
    insights: 'インサイト',
    ledger: '家計簿',

    // Omnibar Placeholders
    placeholder_vault: '例: 三井住友 口座 35万円, SBI証券 125万円',
    placeholder_insights: '例: 今月の為替差益, 食費の支出割合',
    placeholder_ledger: '例: ランチ 1,200円, iPad 18万円 10回分割',

    // Ledger Filters
    filter_all: 'すべて',
    filter_expense: '支出',
    filter_income: '収入',
    filter_transfer: '振替',
    filter_settlement: '精算',

    // KPI Metrics
    net_worth: '純資産総額',
    total_assets: '総資産',
    total_liabilities: '負債総額',
    savings_rate: '貯蓄率',
    burn_rate: '資産対消費比',
    runway_months: '非常時ランウェイ',
    emergency_cushion: '緊急資金バッファ',

    // Common Actions
    edit: '編集',
    delete: '削除',
    save: '保存',
    cancel: 'キャンセル',
    close: '閉じる',
    print_report: '決算書出力',
    export_csv: 'CSV出力',
    lock_vault: '保管庫を施錠',
    reset_all: '全初期化',

    // Categories
    cat_food: '食費',
    cat_cafe: 'カフェ',
    cat_dining: '外食',
    cat_living: '日用品・買い物',
    cat_transport: '交通費',
    cat_fixed: '固定費',
    cat_health: '医療・健康',
    cat_leisure: '趣味・娯楽',
    cat_uncategorized: '未分類',

    // Settings Tabs
    tab_smart_assets: 'スマート資産',
    tab_monthly_budget: '月間予算',
    tab_subscriptions: '定額サブスク',
    tab_ai_engine: 'AIエンジン',
    tab_preferences: '一般設定',
    tab_privacy_data: 'データ管理',

    // Language Selector
    language: '言語設定',
    language_desc: '表示言語とデフォルト通貨・書式の設定',
    lang_ko: '한국어 (KO)',
    lang_en: 'English (EN)',
    lang_ja: '日本語 (JA)',
    lang_eu: 'European (EU)',
    currency_switch_prompt: '基本通貨を{currency}に変更しますか？',
    switch_currency: '通貨を変更',
    keep_currency: '現在を維持',

    // Additional UI Elements
    settings: '設定',
    save_settings: '設定を保存',
    screen_settings: '画面設定',
    default_launch_screen: '初期画面',
    display_and_currency: '表示と通貨',
    base_currency: '基本基準通貨',
    base_currency_desc: '全資産評価および分析の基準通貨',
    active_currencies: '有効通貨管理',
    multi_currency_mode: '複数通貨モード',
    single_currency_mode: '単一通貨モード',
    stealth_mode: 'ステルスモード（金額非表示）',
    stealth_mode_desc_on: 'すべての金額がプライバシー保護のためマスクされています',
    stealth_mode_desc_off: '画面にすべての金額が表示されます',
    ledger_settings: '家計簿設定',
    budget_start_day: '予算開始日',
    multi_ledger_spaces: '複数帳簿管理',
    new_space: '新規帳簿',
    offline_banner: 'オフライン状態です。データは安全に端末に保存されます。',
    empty_ledger_title: '取引履歴がまだありません',
    empty_filter_message: '選択した条件の履歴はありません。',
    view_all_transactions: 'すべての履歴を表示',
    scan_receipt: 'レシートスキャン',
    load_sample_data: 'サンプルデータ読込',
    recommended_prompts: '自然言語入力の例（タップして実行）:',
    records_added: '{count}件の取引が記録されました',
    financial_summary: '財務サマリー',
    monthly_comparison: '月間支出比較',
    vs_previous_month: '前月比変動',
    this_month: '今月',
    last_month: '先月',
    status_saving: '節約',
    status_over: '超過',
    status_maintained: '維持',
    project_settlement: 'プロジェクト精算',
    project_budget: '目標予算',
    per_person_share: '1人あたり分担金',
    remaining_budget: '残り予算',
    burn_percentage: '予算消化率',
    print_settlement_report: '決算書出力',
    screen_scan: '画面スキャン',
    account_transfer: '口座間振替',
    add_asset: '資産追加',
    portfolio_ratio: '資産ポートフォリオ比率',
    cat_investment: '投資',
    cat_deposit: '預貯金',
    cat_crypto: '暗号資産',
    cat_cash: '現金',
    cat_real_estate: '不動産',
    cat_debt: '負債',
    accounts_count: '{count}口座',
    ai_briefing: 'AI財務ブリーフィング',
    ai_diagnosis: 'AI総合財務診断',
    action_guide: 'アクションガイド',
    category_analysis: 'カテゴリ別支出分析',
    daily_trend: '日別支出推移',
    vault_lock_title: 'Vibe Vault',
    enter_pin: 'マスターPINを入力してください',
    setup_pin: 'マスターPINを設定してください（4〜6桁）',
    confirm_pin: '確認のため同じPINを再入力してください',
    unlock: 'ロック解除',
    biometric_unlock: '生体認証で解除（指紋 / Face ID）',
    guest_mode: '後で設定（ゲストモード）',
    privacy_policy: 'プライバシーポリシー',
    replay_tour: 'ガイド再表示',
    dutch_pay_completed: '割り勘精算完了',
    dutch_pay_received: '+{symbol}{amount} 入金',
  },

  eu: {
    // Navigation
    vault: 'Vault',
    insights: 'Insights',
    ledger: 'Ledger',

    // Omnibar Placeholders
    placeholder_vault: 'e.g. BNP Checking €3,500, Trade Republic €12k',
    placeholder_insights: 'e.g. FX return this month, grocery spending ratio',
    placeholder_ledger: 'e.g. Lunch €15, Laptop €1,800 10mo installment',

    // Ledger Filters
    filter_all: 'All',
    filter_expense: 'Expense',
    filter_income: 'Income',
    filter_transfer: 'Transfer',
    filter_settlement: 'Settlement',

    // KPI Metrics
    net_worth: 'Net Worth',
    total_assets: 'Total Assets',
    total_liabilities: 'Total Liabilities',
    savings_rate: 'Savings Rate',
    burn_rate: 'Burn Rate',
    runway_months: 'Runway',
    emergency_cushion: 'Emergency Cushion',

    // Common Actions
    edit: 'Edit',
    delete: 'Delete',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    print_report: 'Print Report',
    export_csv: 'Export CSV',
    lock_vault: 'Lock Vault',
    reset_all: 'Reset All',

    // Categories
    cat_food: 'Food & Groceries',
    cat_cafe: 'Cafe & Drinks',
    cat_dining: 'Restaurants',
    cat_living: 'Living & Shopping',
    cat_transport: 'Transport',
    cat_fixed: 'Fixed Costs',
    cat_health: 'Health & Pharmacy',
    cat_leisure: 'Leisure & Culture',
    cat_uncategorized: 'Uncategorized',

    // Settings Tabs
    tab_smart_assets: 'Smart Assets',
    tab_monthly_budget: 'Monthly Budget',
    tab_subscriptions: 'Subscriptions',
    tab_ai_engine: 'AI Engine',
    tab_preferences: 'Preferences',
    tab_privacy_data: 'Data & Privacy',

    // Language Selector
    language: 'Language (EU)',
    language_desc: 'European region interface language with EUR defaults',
    lang_ko: '한국어 (KO)',
    lang_en: 'English (EN)',
    lang_ja: '日本語 (JA)',
    lang_eu: 'European (EU)',
    currency_switch_prompt: 'Would you like to switch your base currency to {currency}?',
    switch_currency: 'Switch Currency',
    keep_currency: 'Keep Current',

    // Additional UI Elements
    settings: 'Settings',
    save_settings: 'Save Settings',
    screen_settings: 'Screen Settings',
    default_launch_screen: 'Default Launch Screen',
    display_and_currency: 'Display & Currency',
    base_currency: 'Base Currency',
    base_currency_desc: 'Benchmark for net worth and asset valuations',
    active_currencies: 'Active Currencies',
    multi_currency_mode: 'Multi-Currency Mode',
    single_currency_mode: 'Single-Currency Mode',
    stealth_mode: 'Stealth Mode (Mask Amounts)',
    stealth_mode_desc_on: 'All balances and figures are masked for privacy',
    stealth_mode_desc_off: 'All balances and figures are displayed normally',
    ledger_settings: 'Ledger Settings',
    budget_start_day: 'Budget Start Day',
    multi_ledger_spaces: 'Multi-Ledger Spaces',
    new_space: 'New Ledger',
    offline_banner: 'Offline mode. Data is stored safely on device.',
    empty_ledger_title: 'No transactions recorded yet',
    empty_filter_message: 'No transactions match the selected filter.',
    view_all_transactions: 'View all transactions',
    scan_receipt: 'Scan Receipt',
    load_sample_data: 'Load Sample Data',
    recommended_prompts: 'Quick prompt suggestions (tap to run):',
    records_added: '{count} transactions recorded',
    financial_summary: 'Financial Summary',
    monthly_comparison: 'Monthly Spending Comparison',
    vs_previous_month: 'vs Previous Month',
    this_month: 'This Month',
    last_month: 'Last Month',
    status_saving: 'Saved',
    status_over: 'Over',
    status_maintained: 'Maintained',
    project_settlement: 'Project & Trip Settlement',
    project_budget: 'Target Budget',
    per_person_share: 'Per-Person Share',
    remaining_budget: 'Remaining Budget',
    burn_percentage: 'Budget Burn',
    print_settlement_report: 'Print Report',
    screen_scan: 'Screen Scan',
    account_transfer: 'Transfer',
    add_asset: 'Add Asset',
    portfolio_ratio: 'Asset Allocation',
    cat_investment: 'Investments',
    cat_deposit: 'Savings & Deposits',
    cat_crypto: 'Crypto',
    cat_cash: 'Cash',
    cat_real_estate: 'Real Estate',
    cat_debt: 'Liabilities',
    accounts_count: '{count} accounts',
    ai_briefing: 'AI Financial Briefing',
    ai_diagnosis: 'AI Executive Diagnosis',
    action_guide: 'Action Guide',
    category_analysis: 'Category Spending Breakdown',
    daily_trend: 'Daily Spending Trend',
    vault_lock_title: 'Vibe Vault',
    enter_pin: 'Enter Master PIN',
    setup_pin: 'Set up Master PIN (4-6 digits)',
    confirm_pin: 'Re-enter PIN to confirm',
    unlock: 'Unlock',
    biometric_unlock: 'Biometric Unlock (Fingerprint / Face ID)',
    guest_mode: 'Skip for now (Guest Mode)',
    privacy_policy: 'Privacy Policy',
    replay_tour: 'Replay Tour',
    dutch_pay_completed: 'Split Settlement Completed',
    dutch_pay_received: '+{symbol}{amount} Received',
  },
} as const;

export type TranslationKey = keyof typeof translations['en'];

export interface I18nContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>(() => resolveInitialLanguage());

  // Listen for storage events across tabs or external changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === LANGUAGE_STORAGE_KEY && e.newValue) {
        const nextLang = e.newValue as LanguageCode;
        if (nextLang === 'ko' || nextLang === 'en' || nextLang === 'ja' || nextLang === 'eu') {
          setLanguageState(nextLang);
        }
      }
    };

    const handleCustomChange = (e: Event) => {
      const custom = e as CustomEvent<LanguageCode>;
      if (custom.detail) {
        setLanguageState(custom.detail);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('vibe-language-changed', handleCustomChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('vibe-language-changed', handleCustomChange);
    };
  }, []);

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      } catch (err) {
        console.warn('Failed to save language to localStorage:', err);
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vibe-language-changed', { detail: lang }));
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const activeDict = translations[language] || translations.en;
      let template: string = (activeDict as any)[key] ?? (translations.en as any)[key] ?? String(key);

      if (params) {
        for (const [k, v] of Object.entries(params)) {
          template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }

      return template;
    },
    [language]
  );

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    // Graceful fallback if invoked outside provider
    const fallbackLang = resolveInitialLanguage();
    return {
      language: fallbackLang,
      setLanguage: () => {},
      t: (key: TranslationKey, params?: Record<string, string | number>) => {
        let template = (translations[fallbackLang] as any)[key] || (translations.en as any)[key] || String(key);
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
          }
        }
        return template;
      },
    };
  }
  return context;
}
