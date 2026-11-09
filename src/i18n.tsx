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
    add: 'Add',
    apply: 'Apply',
    previous: 'Previous',
    create: 'Create',
    switch: 'Switch',
    default: 'Default',
    active: 'Active',
    print_report: 'Print Report',
    export_csv: 'Export CSV',
    lock_vault: 'Lock Vault',
    reset_all: 'Reset All',

    // Core Domain Categories
    cat_food: 'Food & Dining',
    cat_cafe: 'Cafe & Drinks',
    cat_dining: 'Restaurants',
    cat_living: 'Living & Shopping',
    cat_transport: 'Transport',
    cat_fixed: 'Fixed Expenses',
    cat_health: 'Health & Medical',
    cat_leisure: 'Leisure & Culture',
    cat_salary: 'Salary & Income',
    cat_savings: 'Savings & Deposits',
    cat_refund: 'Refund',
    cat_uncategorized: 'Uncategorized',

    // Asset Categories
    cat_investment: 'Investments',
    cat_deposit: 'Savings & Deposits',
    cat_crypto: 'Crypto',
    cat_cash: 'Cash',
    cat_real_estate: 'Real Estate',
    cat_debt: 'Liabilities',
    accounts_count: '{count} accounts',

    // Payment Methods
    pay_cash: 'Cash',
    pay_bank_transfer: 'Bank Transfer',
    pay_credit_card: 'Credit Card',
    pay_debit_card: 'Debit Card',
    pay_fintech_pay: 'Fintech Pay',

    // Status Tags & Currency Tags
    status_saving: 'Saved',
    status_over: 'Over',
    status_maintained: 'Maintained',
    unpaid_card_balance: 'Unpaid Card Balance',
    recent_transactions: 'Recent Transactions',

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

    // General Preferences & Settings
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
    delete_space: 'Delete Ledger',
    create_with_details: 'Create with advanced options →',
    offline_banner: 'You are offline. Data is safely stored locally.',
    pwa_install_banner: 'Add to home screen to launch as native app',
    install: 'Install',
    empty_ledger_title: 'No transactions recorded yet',
    empty_filter_message: 'No transactions match the selected filter.',
    view_all_transactions: 'View all transactions',
    scan_receipt: 'Scan Receipt',
    load_sample_data: 'Load Sample Data',
    recommended: 'Recommended:',
    recommended_prompts: 'Quick prompt suggestions (tap to run):',
    records_added: '{count} transactions recorded',
    financial_summary: 'Financial Summary',
    monthly_comparison: 'Monthly Spending Comparison',
    vs_previous_month: 'vs Previous Month',
    this_month: 'This Month',
    last_month: 'Last Month',
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

    // Edit Transaction Modal
    edit_transaction_title: 'Edit Transaction',
    edit_transaction_desc: 'Modify amount, category, and transaction details',
    label_transaction_type: 'Transaction Type',
    label_amount: 'Amount',
    label_description: 'Description (Merchant / Item)',
    label_category: 'Category',
    placeholder_category: 'e.g. Food, Shopping',
    label_payment_method: 'Payment Method',
    placeholder_payment_method: 'e.g. Credit Card, Bank Transfer',
    label_note: 'Notes (Settlement / Memo)',
    placeholder_note: 'e.g. Split note, payer, receipt #',
    type_expense: 'Expense',
    type_income: 'Income',
    type_transfer: 'Transfer',
    type_settlement: 'Settlement',
    save_changes: 'Save Changes',

    // Manual Category Modal
    manual_category_title: 'Manual Category Selection',
    manual_category_desc: 'Auto-categorization is off. Please choose a category manually.',
    item_progress: 'Item {current} of {total}',
    selected_category_label: 'Selected Category:',
    please_select_category: 'Please select a category',
    standard_categories_select: 'Select Standard Category',
    custom_category_input: 'Custom Category',
    placeholder_custom_category: 'e.g. Pets, Education, Subscriptions',
    save_all_transactions: 'Save All Transactions ({total})',
    save_with_selected_category: 'Save with Selected Category',
    next_item: 'Next Item ({current}/{total})',

    // New Space Modal
    new_space_title: 'Create New Project / Event Ledger',
    space_name: 'Ledger Name',
    space_name_placeholder: 'Enter ledger name',
    required: 'Required',
    settlement_base_currency_desc: 'Settlement base currency',
    target_budget_total_dues: 'Target Budget / Total Pool',
    member_count: 'Participants',
    member_count_unit: 'people',
    member_count_explanation: 'Participant count is used to calculate per-person cost (total expense ÷ participants) and settlement shares on the official report.',
    event_duration_optional: 'Duration (Optional)',
    start_date: 'Start Date',
    end_date: 'End Date',
    create_and_switch_space: 'Create & Switch Ledger',

    // Event Settlement Report Modal
    settlement_report_title: 'Settlement Report',
    settlement_report_subtitle: 'Project & event financial statement (Official ledger format)',
    official_settlement_report: 'Official Settlement Report',
    print_pdf_export_desc: 'Optimized for A4 printing and Excel CSV export',
    print_pdf_button: 'Print A4 / Save PDF',
    excel_csv: 'Excel CSV',
    total_participants: 'Total Participants',
    total_transactions_count: 'Total Transactions',
    total_income_pool: 'Total Income (Pool / Dues)',
    total_expense_amount: 'Total Expenses',
    total_income: 'Total Income',
    total_expense: 'Total Expense',
    final_balance: 'Final Balance',
    per_person_settlement_title: 'Per-Person Settlement',
    per_person_share_n_split: 'Per-Person Settlement ({count}-way Split)',
    per_person_actual_cost: 'Per-Person Actual Cost',
    per_person_final_settlement: 'Net Settlement (Balance ÷ {count})',
    per_person_refund_due: 'Refund Due Per Person',
    per_person_additional_due: 'Additional Due Per Person',
    settlement_balanced: 'Settlement Balanced (Zero Net)',
    settlement_summary_box: 'Official Settlement Summary',
    total_income_sum: 'Total Income Sum',
    total_expense_sum: 'Total Expense Sum',
    th_no: 'No.',
    th_date: 'Date',
    th_category: 'Category',
    th_description: 'Description',
    th_income: 'Income (+)',
    th_expense: 'Expense (-)',
    th_balance: 'Balance',
    th_note: 'Notes',
    th_total: 'Total',
    th_running_balance: 'Net Balance',
    print_date: 'Printed At',
    settlement_period: 'Period',
    chronological_transactions: 'Chronological Ledger Transactions',
    unit_currency: 'Unit: {currency}',
    official_report_notice: 'This report is verified and generated locally from the encrypted Vibe Vault ledger.',
    official_signature_line: 'Auditor / Lead Signature: ( Sign / Seal )',

    // Receipt Scanner Modal
    receipt_scanner_title: 'AI Receipt Scanner',
    receipt_scanner_desc: 'Gemini Vision AI extracts merchant, line items, and totals automatically.',
    receipt_dropzone_prompt: 'Upload receipt photo or tap to capture',
    receipt_dropzone_dragging: 'Drop your image here',
    receipt_dropzone_hint: 'Drag & drop, file browse, or clipboard paste (Cmd+V) supported (max 15MB)',
    receipt_privacy_warning: 'Personal identifiable information is not automatically masked in photos. Please mask sensitive details before cloud OCR.',
    switch_to_text_input: 'Enter text manually instead of photo',
    switch_to_photo_mode: 'Back to photo upload mode',
    manual_text_parser_title: 'Receipt Text Input / On-Device Parser',
    manual_text_parser_desc: 'Paste SMS transaction alerts or receipt text to analyze instantly with our on-device parser.',
    run_local_parser: 'Run Local Parser Analysis',
    analyzing_receipt_status: 'Gemini Vision AI is analyzing your receipt...',
    analyzing_receipt_substatus: 'Extracting merchant, totals, and line items into structured ledger data',
    ai_analysis_complete: 'AI Analysis Complete',
    confidence_percent: 'Confidence {percent}%',
    merchant: 'Merchant',
    payment_date: 'Date',
    currency: 'Currency',
    total_payment_amount: 'Total Amount:',
    extracted_line_items: 'Extracted Line Items ({count})',
    rescan: 'Scan Again',
    record_to_ledger: 'Record to Ledger',
    reanalyze: 'Reanalyze',

    // Quick Start Guide Modal
    quick_start_title: 'Vibe Vault Quick Start Guide',
    guide_step1_title: 'Record in 3 seconds with the AI Omnibar',
    guide_step1_desc: 'Type naturally like a chat message. Split bills, installments, multi-currency, and balances are recognized automatically.',
    guide_step1_btn: 'Try Sample Prompt',
    guide_step1_example: 'Starbucks Iced Americano $4.50 Credit Card',
    guide_step2_title: 'AI Screenshot & Receipt Scanner',
    guide_step2_desc: 'Upload banking screenshots or receipt photos to automatically extract balances, items, and transactions.',
    guide_step2_btn: 'Open Receipt / Screen Scanner',
    guide_step3_title: 'Separate Personal & Event Ledgers',
    guide_step3_desc: 'Create dedicated ledger spaces for group trips, reunions, or projects, and export official A4 reports.',
    guide_step3_btn: 'Load Sample Data & Explore All Views',
    local_safe_vault_badge: 'Stored safely on device (Zero-Knowledge Encrypted Vault)',
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
    add: '추가',
    apply: '적용',
    previous: '이전',
    create: '생성',
    switch: '전환',
    default: '기본',
    active: '활성',
    print_report: '결산서 출력',
    export_csv: '내보내기',
    lock_vault: '금고 잠그기',
    reset_all: '전체 초기화',

    // Core Domain Categories
    cat_food: '식비',
    cat_cafe: '카페',
    cat_dining: '외식',
    cat_living: '생활·쇼핑',
    cat_transport: '교통',
    cat_fixed: '고정비',
    cat_health: '건강·의료',
    cat_leisure: '문화·여가',
    cat_salary: '급여',
    cat_savings: '저축·적금',
    cat_refund: '환불',
    cat_uncategorized: '미분류',

    // Asset Categories
    cat_investment: '투자',
    cat_deposit: '예적금',
    cat_crypto: '가상자산',
    cat_cash: '현금',
    cat_real_estate: '부동산',
    cat_debt: '부채',
    accounts_count: '{count}개 계좌',

    // Payment Methods
    pay_cash: '현금',
    pay_bank_transfer: '계좌이체',
    pay_credit_card: '신용카드',
    pay_debit_card: '체크카드',
    pay_fintech_pay: '간편결제',

    // Status Tags & Currency Tags
    status_saving: '절약',
    status_over: '초과',
    status_maintained: '유지',
    unpaid_card_balance: '신용카드 결제 예정 잔여액',
    recent_transactions: '최근 거래 내역',

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

    // General Preferences & Settings
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
    delete_space: '장부 삭제',
    create_with_details: '상세 옵션으로 생성 →',
    offline_banner: '오프라인 상태입니다. 기록된 데이터는 기기에 안전하게 보관됩니다.',
    pwa_install_banner: '홈 화면에 앱으로 추가하여 브라우저 없이 실행하세요',
    install: '설치',
    empty_ledger_title: '기록된 거래 내역이 없습니다',
    empty_filter_message: '선택한 조건의 거래 내역이 없습니다.',
    view_all_transactions: '전체 내역 보기',
    scan_receipt: '영수증 촬영 스캔',
    load_sample_data: '샘플 데이터 로드',
    recommended: '추천:',
    recommended_prompts: '자연어 입력 추천 예시 (터치하여 실행):',
    records_added: '{count}건의 거래가 기록되었습니다',
    financial_summary: '재무 요약',
    monthly_comparison: '월별 지출 비교',
    vs_previous_month: '전월 대비 변동',
    this_month: '이번 달',
    last_month: '지난달',
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

    // Edit Transaction Modal
    edit_transaction_title: '거래 내역 수정',
    edit_transaction_desc: '금액 및 분류 상세 항목을 수정합니다',
    label_transaction_type: '거래 유형',
    label_amount: '금액',
    label_description: '내용 (상호명 / 내역)',
    label_category: '카테고리',
    placeholder_category: '예: 식비, 생활/쇼핑',
    label_payment_method: '결제 수단',
    placeholder_payment_method: '예: 현대카드, 토스머니',
    label_note: '비고 (정산 비고 / 지출 메모)',
    placeholder_note: '예: 정산 메모, 결제자, 영수증 번호 등',
    type_expense: '지출',
    type_income: '수입',
    type_transfer: '이체',
    type_settlement: '정산',
    save_changes: '변경사항 저장하기',

    // Manual Category Modal
    manual_category_title: '카테고리 수동 선택',
    manual_category_desc: '스마트 자동 분류가 꺼져 있어 직접 카테고리를 지정합니다',
    item_progress: '항목 {current} / {total}',
    selected_category_label: '선택된 카테고리:',
    please_select_category: '카테고리를 선택해주세요',
    standard_categories_select: '표준 카테고리 선택',
    custom_category_input: '직접 입력 (커스텀 카테고리)',
    placeholder_custom_category: '예: 반려동물, 자기계발, 구독료',
    save_all_transactions: '모든 내역 저장하기 ({total}건)',
    save_with_selected_category: '선택한 카테고리로 저장',
    next_item: '다음 항목 ({current}/{total})',

    // New Space Modal
    new_space_title: '새 프로젝트 / 행사 장부 만들기',
    space_name: '장부 이름',
    space_name_placeholder: '장부 이름을 입력하세요',
    required: '필수',
    settlement_base_currency_desc: '정산서 기준 통화',
    target_budget_total_dues: '목표 예산 / 총 회비',
    member_count: '참여 인원',
    member_count_unit: '명',
    member_count_explanation: '참여 인원수는 공식 결산서의 1인당 정산 금액(총지출 ÷ 인원수) 및 환급금 계산에 사용됩니다.',
    event_duration_optional: '진행 기간 (선택 사항)',
    start_date: '시작일',
    end_date: '종료일',
    create_and_switch_space: '장부 공간 생성 및 바로 전환',

    // Event Settlement Report Modal
    settlement_report_title: '결산 보고서',
    settlement_report_subtitle: '프로젝트 및 행사 지출·수입 정산 내역서 (공식 회계 양식)',
    official_settlement_report: '공식 결산서',
    print_pdf_export_desc: 'A4 출력 및 엑셀 다운로드 최적화',
    print_pdf_button: 'A4 인쇄 / PDF 저장',
    excel_csv: '엑셀 CSV',
    total_participants: '총 참여 인원',
    total_transactions_count: '총 거래 건수',
    total_income_pool: '총 수입 (회비 등)',
    total_expense_amount: '총 지출 금액',
    total_income: '총 수입',
    total_expense: '총 지출',
    final_balance: '최종 잔액',
    per_person_settlement_title: '1인당 정산 내역',
    per_person_share_n_split: '1인당 정산 내역 ({count}인 균등 분할)',
    per_person_actual_cost: '1인당 실제 분담 경비',
    per_person_final_settlement: '1인당 최종 정산 (잔액 ÷ {count}명)',
    per_person_refund_due: '1인당 환급 예정액',
    per_person_additional_due: '1인당 추가 납부액',
    settlement_balanced: '정산 완료 (수지 일치)',
    settlement_summary_box: '공식 결산 총계 요약',
    total_income_sum: '총 수입 합계',
    total_expense_sum: '총 지출 합계',
    th_no: '번호',
    th_date: '날짜',
    th_category: '항목',
    th_description: '내역',
    th_income: '수입 (+)',
    th_expense: '지출 (-)',
    th_balance: '잔액',
    th_note: '비고',
    th_total: '합계',
    th_running_balance: '차인잔고',
    print_date: '출력일시',
    settlement_period: '결산 기간',
    chronological_transactions: '수입 및 지출 상세 내역 (시간순 정렬)',
    unit_currency: '단위: {currency}',
    official_report_notice: '본 보고서는 Vibe Vault 로컬 암호화 장부에서 직접 생성 및 검증된 공식 결산서입니다.',
    official_signature_line: '정산 총괄 확인: ( 서명 / 인 )',

    // Receipt Scanner Modal
    receipt_scanner_title: 'AI 영수증 스캔',
    receipt_scanner_desc: 'Gemini Vision AI가 영수증 항목과 금액을 자동 추출합니다.',
    receipt_dropzone_prompt: '영수증 사진 업로드 또는 터치하여 촬영',
    receipt_dropzone_dragging: '여기에 이미지를 놓으세요',
    receipt_dropzone_hint: '드래그 앤 드롭 · 파일 선택 · 클립보드 붙여넣기(Cmd+V) 지원 (최대 15MB)',
    receipt_privacy_warning: '이미지에 보이는 개인정보는 자동 마스킹되지 않습니다. 클라우드 OCR 사용 전 직접 가려주세요.',
    switch_to_text_input: '사진 대신 텍스트로 직접 입력',
    switch_to_photo_mode: '사진 업로드 모드로 돌아가기',
    manual_text_parser_title: '영수증 텍스트 직접 입력 / 로컬 파서',
    manual_text_parser_desc: '영수증에 적힌 내용이나 카드 결제 문자를 붙여넣으면 온디바이스 로컬 파서로 즉시 분석합니다.',
    run_local_parser: '로컬 파서 분석 실행',
    analyzing_receipt_status: 'Gemini Vision AI가 영수증을 분석하고 있습니다...',
    analyzing_receipt_substatus: '가맹점명, 총액, 상세 품목을 정밀 JSON 스키마로 추출하고 있습니다',
    ai_analysis_complete: 'AI 분석 완료',
    confidence_percent: '신뢰도 {percent}%',
    merchant: '가맹점',
    payment_date: '결제 일자',
    currency: '통화',
    total_payment_amount: '총 결제금액:',
    extracted_line_items: '추출된 상세 품목 ({count}개)',
    rescan: '다시 스캔',
    record_to_ledger: '가계부에 기록',
    reanalyze: '재분석',

    // Quick Start Guide Modal
    quick_start_title: 'Vibe Vault 시작 가이드',
    guide_step1_title: '하단 AI 입력창(Omnibar)으로 3초 기록',
    guide_step1_desc: '복잡한 입력 폼 없이 하단 채팅창에 카톡처럼 입력해 보세요. 더치페이, 무이자 할부, 계좌 잔고까지 자동 인식합니다.',
    guide_step1_btn: '예시 문구 자동 입력해보기',
    guide_step1_example: '스타벅스 아메리카노 4,500원 현대카드 결제',
    guide_step2_title: '스크린샷 & 영수증 AI 스캔',
    guide_step2_desc: '은행·증권 앱 화면을 캡처하거나 종이 영수증을 찍어 올리면 계좌 잔고와 지출 내역이 자동 등록됩니다.',
    guide_step2_btn: '영수증/화면 스캔 열기',
    guide_step3_title: '일상 가계부와 모임/행사 장부 분리',
    guide_step3_desc: '동창회, 여행, 프로젝트 경비는 별도 장부 공간을 만들어 관리하고 A4 표준 결산서를 인쇄하세요.',
    guide_step3_btn: '샘플 데이터 채워서 전체 화면 체험하기',
    local_safe_vault_badge: '기기 로컬 안전 저장 (영지식 암호화 금고)',
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
    add: '追加',
    apply: '適用',
    previous: '前へ',
    create: '作成',
    switch: '切替',
    default: 'デフォルト',
    active: '有効',
    print_report: '決算書出力',
    export_csv: 'CSV出力',
    lock_vault: '保管庫を施錠',
    reset_all: '全初期化',

    // Core Domain Categories
    cat_food: '食費',
    cat_cafe: 'カフェ',
    cat_dining: '外食',
    cat_living: '日用品・買い物',
    cat_transport: '交通費',
    cat_fixed: '固定費',
    cat_health: '医療・健康',
    cat_leisure: '趣味・娯楽',
    cat_salary: '給与・収入',
    cat_savings: '貯蓄・預金',
    cat_refund: '返金',
    cat_uncategorized: '未分類',

    // Asset Categories
    cat_investment: '投資',
    cat_deposit: '預貯金',
    cat_crypto: '暗号資産',
    cat_cash: '現金',
    cat_real_estate: '不動産',
    cat_debt: '負債',
    accounts_count: '{count}口座',

    // Payment Methods
    pay_cash: '現金',
    pay_bank_transfer: '銀行振込',
    pay_credit_card: 'クレジットカード',
    pay_debit_card: 'デビットカード',
    pay_fintech_pay: '電子マネー・決済アプリ',

    // Status Tags & Currency Tags
    status_saving: '節約',
    status_over: '超過',
    status_maintained: '維持',
    unpaid_card_balance: '未払カード請求残高',
    recent_transactions: '最近の取引履歴',

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

    // General Preferences & Settings
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
    delete_space: '帳簿を削除',
    create_with_details: '詳細オプションで作成 →',
    offline_banner: 'オフライン状態です。データは安全に端末に保存されます。',
    pwa_install_banner: 'ホーム画面に追加してアプリとして起動できます',
    install: 'インストール',
    empty_ledger_title: '取引履歴がまだありません',
    empty_filter_message: '選択した条件の履歴はありません。',
    view_all_transactions: 'すべての履歴を表示',
    scan_receipt: 'レシートスキャン',
    load_sample_data: 'サンプルデータ読込',
    recommended: 'おすすめ:',
    recommended_prompts: '自然言語入力の例（タップして実行）:',
    records_added: '{count}件の取引が記録されました',
    financial_summary: '財務サマリー',
    monthly_comparison: '月間支出比較',
    vs_previous_month: '前月比変動',
    this_month: '今月',
    last_month: '先月',
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

    // Edit Transaction Modal
    edit_transaction_title: '取引履歴の編集',
    edit_transaction_desc: '金額やカテゴリ、詳細情報を変更します',
    label_transaction_type: '取引タイプ',
    label_amount: '金額',
    label_description: '内容（店舗名 / 項目）',
    label_category: 'カテゴリ',
    placeholder_category: '例: 食費、日用品',
    label_payment_method: '決済手段',
    placeholder_payment_method: '例: 三井住友カード、銀行振込',
    label_note: '備考（精算メモ / 支出メモ）',
    placeholder_note: '例: 割り勘メモ、支払者、レシート番号など',
    type_expense: '支出',
    type_income: '収入',
    type_transfer: '振替',
    type_settlement: '精算',
    save_changes: '変更を保存',

    // Manual Category Modal
    manual_category_title: 'カテゴリの手動選択',
    manual_category_desc: '自動分類がオフになっているため、手動でカテゴリを指定してください',
    item_progress: '項目 {current} / {total}',
    selected_category_label: '選択中のカテゴリ:',
    please_select_category: 'カテゴリを選択してください',
    standard_categories_select: '標準カテゴリから選択',
    custom_category_input: 'カスタムカテゴリを直接入力',
    placeholder_custom_category: '例: ペット、自己啓発、サブスク',
    save_all_transactions: 'すべての履歴を保存（{total}件）',
    save_with_selected_category: '選択したカテゴリで保存',
    next_item: '次の項目 ({current}/{total})',

    // New Space Modal
    new_space_title: '新規プロジェクト・イベント帳簿の作成',
    space_name: '帳簿名',
    space_name_placeholder: '帳簿名を入力してください',
    required: '必須',
    settlement_base_currency_desc: '精算書の基準通貨',
    target_budget_total_dues: '目標予算 / 会費総額',
    member_count: '参加人数',
    member_count_unit: '人',
    member_count_explanation: '参加人数は公式決算書の1人あたり精算額（総支出÷人数）および返還金の計算に使用されます。',
    event_duration_optional: '実施期間（任意）',
    start_date: '開始日',
    end_date: '終了日',
    create_and_switch_space: '帳簿を作成して切り替え',

    // Event Settlement Report Modal
    settlement_report_title: '決算報告書',
    settlement_report_subtitle: 'プロジェクト・イベントの収支精算明細書（公式会計様式）',
    official_settlement_report: '公式決算書',
    print_pdf_export_desc: 'A4印刷およびExcel CSV出力に最適化',
    print_pdf_button: 'A4印刷 / PDF保存',
    excel_csv: 'Excel CSV',
    total_participants: '参加人数合計',
    total_transactions_count: '総取引件数',
    total_income_pool: '総収入（会費など）',
    total_expense_amount: '総支出額',
    total_income: '総収入',
    total_expense: '総支出',
    final_balance: '最終残高',
    per_person_settlement_title: '1人あたりの精算内訳',
    per_person_share_n_split: '1人あたりの精算内訳（{count}等分）',
    per_person_actual_cost: '1人あたりの実質負担額',
    per_person_final_settlement: '1人あたり最終精算（残高 ÷ {count}人）',
    per_person_refund_due: '1人あたり返還予定額',
    per_person_additional_due: '1人あたり追加徴収額',
    settlement_balanced: '精算完了（収支一致）',
    settlement_summary_box: '公式決算総計サマリー',
    total_income_sum: '総収入合計',
    total_expense_sum: '総支出合計',
    th_no: '番号',
    th_date: '日付',
    th_category: '項目',
    th_description: '内容',
    th_income: '収入 (+)',
    th_expense: '支出 (-)',
    th_balance: '残高',
    th_note: '備考',
    th_total: '合計',
    th_running_balance: '差引残高',
    print_date: '出力日時',
    settlement_period: '決算期間',
    chronological_transactions: '収支明細（時系列順）',
    unit_currency: '単位: {currency}',
    official_report_notice: '本報告書はVibe Vaultローカル暗号化帳簿より直接出力された公式決算書です。',
    official_signature_line: '精算総括確認: ( 署名 / 捺印 )',

    // Receipt Scanner Modal
    receipt_scanner_title: 'AIレシートスキャン',
    receipt_scanner_desc: 'Gemini Vision AIがレシートの店舗名、品目、金額を自動抽出します。',
    receipt_dropzone_prompt: 'レシート写真をアップロードまたは撮影',
    receipt_dropzone_dragging: 'ここに画像をドロップ',
    receipt_dropzone_hint: 'ドラッグ＆ドロップ・ファイル選択・クリップボード貼付(Cmd+V)対応（最大15MB）',
    receipt_privacy_warning: '画像内の個人情報は自動マスクされません。クラウドOCR使用前にセンシティブな情報を覆い隠してください。',
    switch_to_text_input: '写真の代わりにテキストで直接入力',
    switch_to_photo_mode: '写真アップロードモードに戻る',
    manual_text_parser_title: 'レシートテキスト入力 / ローカルパーサー',
    manual_text_parser_desc: 'レシートの記載内容やカード決済通知SMSを貼り付けると、オンデバイスローカルパーサーで即座に解析します。',
    run_local_parser: 'ローカルパーサー解析を実行',
    analyzing_receipt_status: 'Gemini Vision AIがレシートを解析中...',
    analyzing_receipt_substatus: '店舗名、総額、品目内訳を構造化データとして抽出しています',
    ai_analysis_complete: 'AI解析完了',
    confidence_percent: '信頼度 {percent}%',
    merchant: '加盟店',
    payment_date: '決済日',
    currency: '通貨',
    total_payment_amount: '支払総額:',
    extracted_line_items: '抽出された品目内訳（{count}点）',
    rescan: '再スキャン',
    record_to_ledger: '家計簿に記録',
    reanalyze: '再解析',

    // Quick Start Guide Modal
    quick_start_title: 'Vibe Vault スタートガイド',
    guide_step1_title: '下部AI入力バー（Omnibar）で3秒スピード記録',
    guide_step1_desc: 'チャットのように自然に入力するだけ。割り勘、無利息分割払い、口座残高まで自動認識します。',
    guide_step1_btn: '例文を自動入力してみる',
    guide_step1_example: 'スターバックス アイスアメリカーノ 450円 クレジットカード',
    guide_step2_title: 'スクリーンショット & レシートAIスキャン',
    guide_step2_desc: '銀行や証券アプリの画面キャプチャや紙のレシートを撮って送るだけで、残高や支出明細が自動登録されます。',
    guide_step2_btn: 'レシート / 画面スキャンを開く',
    guide_step3_title: '日常の家計簿とイベント・旅行帳簿の分離',
    guide_step3_desc: '同窓会、旅行、プロジェクト経費は専用の帳簿スペースを作成して管理し、公式A4決算書を出力できます。',
    guide_step3_btn: 'サンプルデータを読み込んで全機能を体験',
    local_safe_vault_badge: '端末ローカルに安全保存（ゼロ知識暗号化保管庫）',
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
    add: 'Add',
    apply: 'Apply',
    previous: 'Previous',
    create: 'Create',
    switch: 'Switch',
    default: 'Default',
    active: 'Active',
    print_report: 'Print Report',
    export_csv: 'Export CSV',
    lock_vault: 'Lock Vault',
    reset_all: 'Reset All',

    // Core Domain Categories
    cat_food: 'Food & Groceries',
    cat_cafe: 'Cafe & Drinks',
    cat_dining: 'Restaurants',
    cat_living: 'Living & Shopping',
    cat_transport: 'Transport',
    cat_fixed: 'Fixed Costs',
    cat_health: 'Health & Pharmacy',
    cat_leisure: 'Leisure & Culture',
    cat_salary: 'Salary & Income',
    cat_savings: 'Savings & Deposits',
    cat_refund: 'Refund',
    cat_uncategorized: 'Uncategorized',

    // Asset Categories
    cat_investment: 'Investments',
    cat_deposit: 'Savings & Deposits',
    cat_crypto: 'Crypto',
    cat_cash: 'Cash',
    cat_real_estate: 'Real Estate',
    cat_debt: 'Liabilities',
    accounts_count: '{count} accounts',

    // Payment Methods
    pay_cash: 'Cash',
    pay_bank_transfer: 'SEPA / Bank Transfer',
    pay_credit_card: 'Credit Card',
    pay_debit_card: 'Debit Card',
    pay_fintech_pay: 'Digital Wallet (Apple Pay / Revolut)',

    // Status Tags & Currency Tags
    status_saving: 'Saved',
    status_over: 'Over',
    status_maintained: 'Maintained',
    unpaid_card_balance: 'Unpaid Card Balance',
    recent_transactions: 'Recent Transactions',

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

    // General Preferences & Settings
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
    delete_space: 'Delete Ledger',
    create_with_details: 'Create with advanced options →',
    offline_banner: 'Offline mode. Data is stored safely on device.',
    pwa_install_banner: 'Add to home screen to launch as native app',
    install: 'Install',
    empty_ledger_title: 'No transactions recorded yet',
    empty_filter_message: 'No transactions match the selected filter.',
    view_all_transactions: 'View all transactions',
    scan_receipt: 'Scan Receipt',
    load_sample_data: 'Load Sample Data',
    recommended: 'Recommended:',
    recommended_prompts: 'Quick prompt suggestions (tap to run):',
    records_added: '{count} transactions recorded',
    financial_summary: 'Financial Summary',
    monthly_comparison: 'Monthly Spending Comparison',
    vs_previous_month: 'vs Previous Month',
    this_month: 'This Month',
    last_month: 'Last Month',
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

    // Edit Transaction Modal
    edit_transaction_title: 'Edit Transaction',
    edit_transaction_desc: 'Modify amount, category, and transaction details',
    label_transaction_type: 'Transaction Type',
    label_amount: 'Amount',
    label_description: 'Description (Merchant / Item)',
    label_category: 'Category',
    placeholder_category: 'e.g. Food, Shopping',
    label_payment_method: 'Payment Method',
    placeholder_payment_method: 'e.g. Visa, SEPA Transfer',
    label_note: 'Notes (Settlement / Memo)',
    placeholder_note: 'e.g. Split note, payer, receipt #',
    type_expense: 'Expense',
    type_income: 'Income',
    type_transfer: 'Transfer',
    type_settlement: 'Settlement',
    save_changes: 'Save Changes',

    // Manual Category Modal
    manual_category_title: 'Manual Category Selection',
    manual_category_desc: 'Auto-categorization is off. Please choose a category manually.',
    item_progress: 'Item {current} of {total}',
    selected_category_label: 'Selected Category:',
    please_select_category: 'Please select a category',
    standard_categories_select: 'Select Standard Category',
    custom_category_input: 'Custom Category',
    placeholder_custom_category: 'e.g. Pets, Education, Subscriptions',
    save_all_transactions: 'Save All Transactions ({total})',
    save_with_selected_category: 'Save with Selected Category',
    next_item: 'Next Item ({current}/{total})',

    // New Space Modal
    new_space_title: 'Create New Project / Event Ledger',
    space_name: 'Ledger Name',
    space_name_placeholder: 'Enter ledger name',
    required: 'Required',
    settlement_base_currency_desc: 'Settlement base currency',
    target_budget_total_dues: 'Target Budget / Total Pool',
    member_count: 'Participants',
    member_count_unit: 'people',
    member_count_explanation: 'Participant count is used to calculate per-person cost (total expense ÷ participants) and settlement shares on the official report.',
    event_duration_optional: 'Duration (Optional)',
    start_date: 'Start Date',
    end_date: 'End Date',
    create_and_switch_space: 'Create & Switch Ledger',

    // Event Settlement Report Modal
    settlement_report_title: 'Settlement Report',
    settlement_report_subtitle: 'Project & event financial statement (Official ledger format)',
    official_settlement_report: 'Official Settlement Report',
    print_pdf_export_desc: 'Optimized for A4 printing and Excel CSV export',
    print_pdf_button: 'Print A4 / Save PDF',
    excel_csv: 'Excel CSV',
    total_participants: 'Total Participants',
    total_transactions_count: 'Total Transactions',
    total_income_pool: 'Total Income (Pool / Dues)',
    total_expense_amount: 'Total Expenses',
    total_income: 'Total Income',
    total_expense: 'Total Expense',
    final_balance: 'Final Balance',
    per_person_settlement_title: 'Per-Person Settlement',
    per_person_share_n_split: 'Per-Person Settlement ({count}-way Split)',
    per_person_actual_cost: 'Per-Person Actual Cost',
    per_person_final_settlement: 'Net Settlement (Balance ÷ {count})',
    per_person_refund_due: 'Refund Due Per Person',
    per_person_additional_due: 'Additional Due Per Person',
    settlement_balanced: 'Settlement Balanced (Zero Net)',
    settlement_summary_box: 'Official Settlement Summary',
    total_income_sum: 'Total Income Sum',
    total_expense_sum: 'Total Expense Sum',
    th_no: 'No.',
    th_date: 'Date',
    th_category: 'Category',
    th_description: 'Description',
    th_income: 'Income (+)',
    th_expense: 'Expense (-)',
    th_balance: 'Balance',
    th_note: 'Notes',
    th_total: 'Total',
    th_running_balance: 'Net Balance',
    print_date: 'Printed At',
    settlement_period: 'Period',
    chronological_transactions: 'Chronological Ledger Transactions',
    unit_currency: 'Unit: {currency}',
    official_report_notice: 'This report is verified and generated locally from the encrypted Vibe Vault ledger.',
    official_signature_line: 'Auditor / Lead Signature: ( Sign / Seal )',

    // Receipt Scanner Modal
    receipt_scanner_title: 'AI Receipt Scanner',
    receipt_scanner_desc: 'Gemini Vision AI extracts merchant, line items, and totals automatically.',
    receipt_dropzone_prompt: 'Upload receipt photo or tap to capture',
    receipt_dropzone_dragging: 'Drop your image here',
    receipt_dropzone_hint: 'Drag & drop, file browse, or clipboard paste (Cmd+V) supported (max 15MB)',
    receipt_privacy_warning: 'Personal identifiable information is not automatically masked in photos. Please mask sensitive details before cloud OCR.',
    switch_to_text_input: 'Enter text manually instead of photo',
    switch_to_photo_mode: 'Back to photo upload mode',
    manual_text_parser_title: 'Receipt Text Input / On-Device Parser',
    manual_text_parser_desc: 'Paste SMS transaction alerts or receipt text to analyze instantly with our on-device parser.',
    run_local_parser: 'Run Local Parser Analysis',
    analyzing_receipt_status: 'Gemini Vision AI is analyzing your receipt...',
    analyzing_receipt_substatus: 'Extracting merchant, totals, and line items into structured ledger data',
    ai_analysis_complete: 'AI Analysis Complete',
    confidence_percent: 'Confidence {percent}%',
    merchant: 'Merchant',
    payment_date: 'Date',
    currency: 'Currency',
    total_payment_amount: 'Total Amount:',
    extracted_line_items: 'Extracted Line Items ({count})',
    rescan: 'Scan Again',
    record_to_ledger: 'Record to Ledger',
    reanalyze: 'Reanalyze',

    // Quick Start Guide Modal
    quick_start_title: 'Vibe Vault Quick Start Guide',
    guide_step1_title: 'Record in 3 seconds with the AI Omnibar',
    guide_step1_desc: 'Type naturally like a chat message. Split bills, installments, multi-currency, and balances are recognized automatically.',
    guide_step1_btn: 'Try Sample Prompt',
    guide_step1_example: 'Starbucks Americano 4.50€ Credit Card',
    guide_step2_title: 'AI Screenshot & Receipt Scanner',
    guide_step2_desc: 'Upload banking screenshots or receipt photos to automatically extract balances, items, and transactions.',
    guide_step2_btn: 'Open Receipt / Screen Scanner',
    guide_step3_title: 'Separate Personal & Event Ledgers',
    guide_step3_desc: 'Create dedicated ledger spaces for group trips, reunions, or projects, and export official A4 reports.',
    guide_step3_btn: 'Load Sample Data & Explore All Views',
    local_safe_vault_badge: 'Stored safely on device (Zero-Knowledge Encrypted Vault)',
  },
} as const;

export type TranslationKey = keyof typeof translations['en'];

export interface I18nContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  getLocalizedCategory: (catKeyOrName: string) => string;
  getLocalizedPaymentMethod: (method?: string, transactionType?: string) => string;
  getLocalizedTransactionType: (type: string) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

/**
 * Mapping of generic category keys / English names to translation keys
 */
const CATEGORY_TRANSLATION_MAP: Record<string, TranslationKey> = {
  Food: 'cat_food',
  food: 'cat_food',
  'Food & Dining': 'cat_food',
  식비: 'cat_food',
  Dining: 'cat_dining',
  dining: 'cat_dining',
  외식: 'cat_dining',
  Cafe: 'cat_cafe',
  cafe: 'cat_cafe',
  카페: 'cat_cafe',
  Living: 'cat_living',
  living: 'cat_living',
  'Living & Shopping': 'cat_living',
  '생활/쇼핑': 'cat_living',
  '생활·쇼핑': 'cat_living',
  Shopping: 'cat_living',
  Transport: 'cat_transport',
  transport: 'cat_transport',
  교통: 'cat_transport',
  Fixed: 'cat_fixed',
  fixed: 'cat_fixed',
  고정비: 'cat_fixed',
  고정지출: 'cat_fixed',
  Health: 'cat_health',
  health: 'cat_health',
  '건강·의료': 'cat_health',
  '의료/건강': 'cat_health',
  Leisure: 'cat_leisure',
  leisure: 'cat_leisure',
  '문화·여가': 'cat_leisure',
  '문화/여가': 'cat_leisure',
  Salary: 'cat_salary',
  salary: 'cat_salary',
  Income: 'cat_salary',
  급여: 'cat_salary',
  '급여/수입': 'cat_salary',
  Savings: 'cat_savings',
  savings: 'cat_savings',
  '저축·적금': 'cat_savings',
  Refund: 'cat_refund',
  refund: 'cat_refund',
  환불: 'cat_refund',
  Uncategorized: 'cat_uncategorized',
  uncategorized: 'cat_uncategorized',
  미분류: 'cat_uncategorized',
};

export function resolveLocalizedCategory(catKeyOrName: string, lang: LanguageCode): string {
  if (!catKeyOrName) {
    const dict = translations[lang] || translations.en;
    return dict.cat_uncategorized;
  }
  const clean = catKeyOrName.trim();
  const transKey = CATEGORY_TRANSLATION_MAP[clean];
  if (transKey) {
    const dict = translations[lang] || translations.en;
    return (dict as any)[transKey] || clean;
  }
  return clean;
}

export function resolveLocalizedPaymentMethod(method?: string, transactionType?: string, lang: LanguageCode = 'en'): string {
  const dict = translations[lang] || translations.en;
  if (!method) {
    return transactionType === 'INCOME' ? dict.pay_bank_transfer : '';
  }
  const trimmed = method.trim();
  if (transactionType === 'INCOME') {
    return dict.pay_bank_transfer;
  }
  if (/^(?:credit\s*card|신용카드|card|카드|카드결제)$/i.test(trimmed)) {
    return dict.pay_credit_card;
  }
  if (/^(?:check\s*card|debit\s*card|체크카드)$/i.test(trimmed)) {
    return dict.pay_debit_card;
  }
  if (/^(?:bank\s*transfer|계좌이체|무통장|통장|계좌)$/i.test(trimmed)) {
    return dict.pay_bank_transfer;
  }
  if (/^(?:cash|현금)$/i.test(trimmed)) {
    return dict.pay_cash;
  }
  if (/^(?:fintech|간편결제|toss|pay|페이)$/i.test(trimmed)) {
    return dict.pay_fintech_pay;
  }
  return trimmed;
}

export function resolveLocalizedTransactionType(type: string, lang: LanguageCode): string {
  const dict = translations[lang] || translations.en;
  const upper = (type || '').toUpperCase();
  if (upper === 'EXPENSE') return dict.type_expense;
  if (upper === 'INCOME') return dict.type_income;
  if (upper === 'TRANSFER') return dict.type_transfer;
  if (upper === 'SETTLEMENT') return dict.type_settlement;
  if (upper === 'ALL') return dict.filter_all;
  return type;
}

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

  const getLocalizedCategory = useCallback(
    (catKeyOrName: string) => resolveLocalizedCategory(catKeyOrName, language),
    [language]
  );

  const getLocalizedPaymentMethod = useCallback(
    (method?: string, transactionType?: string) => resolveLocalizedPaymentMethod(method, transactionType, language),
    [language]
  );

  const getLocalizedTransactionType = useCallback(
    (type: string) => resolveLocalizedTransactionType(type, language),
    [language]
  );

  return (
    <I18nContext.Provider
      value={{
        language,
        setLanguage,
        t,
        getLocalizedCategory,
        getLocalizedPaymentMethod,
        getLocalizedTransactionType,
      }}
    >
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
      getLocalizedCategory: (catKeyOrName: string) => resolveLocalizedCategory(catKeyOrName, fallbackLang),
      getLocalizedPaymentMethod: (method?: string, transactionType?: string) =>
        resolveLocalizedPaymentMethod(method, transactionType, fallbackLang),
      getLocalizedTransactionType: (type: string) => resolveLocalizedTransactionType(type, fallbackLang),
    };
  }
  return context;
}
