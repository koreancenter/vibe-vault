# SPEC.md: Vibe Vault Global Technical Specification

## 1. System Architecture Overview

```
[ Client: Web / PWA (React 19 + TypeScript + Tailwind v4) ]
   ├── UI Components (Single-Surface Flat Architecture)
   ├── Local Storage Engine (IndexedDB via idb, LocalStorage for preferences)
   ├── Client-Side Pre-Processor (Korean/Multilingual Currency & Dutch-pay Regex)
   └── Omnibar Controller (Voice STT / Text / Multimodal Image Drop)
          │
          ▼ [HTTP API / Serverless Proxy]
[ Backend: Node.js / Express Proxy (server.ts) ]
   ├── /api/parse (Two-Tier Hybrid Natural Language Parser)
   ├── /api/parse-receipt (Multimodal Vision OCR Parser)
   ├── /api/parse-assets (Financial Instrument & Statement Parser)
   ├── /api/fx-rates (Multi-Currency Real-time FX Provider)
   └── /api/subscriptions/detect (Recurring Expense Pattern Analyzer)
          │
          ▼ [AI Inference Layer]
[ Gemini API (gemini-3.8-flash / gemini-2.5-flash) ]
   └── Structured JSON Outputs (Strict Schema Enforcement)
```

---

## 2. Core Data Models (`src/types.ts`)

```typescript
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'SETTLEMENT';

export type CurrencyCode = 'KRW' | 'USD' | 'EUR' | 'JPY' | 'GBP';

export type AssetType = 'CARD' | 'BANK' | 'CASH' | 'INVESTMENT' | 'OTHER';

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  currency: CurrencyCode;
  balance?: number;
  billingDay?: number; // 1 to 31
  enabled: boolean;
  note?: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: CurrencyCode;
  baseAmount?: number; // Normalized to user's primary base currency
  category: string;
  subCategory?: string;
  description: string;
  merchant?: string;
  date: string; // ISO 8601 string
  paymentMethod?: string;
  assetId?: string;
  groupId?: string; // Links related multi-part expenses or Dutch-pay splits
  originalTotal?: number;
  isRecurring?: boolean;
  recurringFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  confidenceScore?: number; // AI classification confidence (0.00 - 1.00)
  rawInput?: string;
}

export interface Subscription {
  id: string;
  merchant: string;
  amount: number;
  currency: CurrencyCode;
  billingCycle: 'MONTHLY' | 'YEARLY' | 'WEEKLY';
  nextBillingDate: string; // ISO 8601
  category: string;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
  detectedFromTransactionId?: string;
}

export interface CategoryBudget {
  category: string;
  limit: number;
  period: 'MONTHLY' | 'YEARLY';
}

export interface ExchangeRates {
  base: CurrencyCode;
  rates: Record<CurrencyCode, number>;
  timestamp: string;
}
```

---

## 3. Hybrid Two-Tier Parsing Pipeline

### 3.1 Tier 1: Deterministic Client/Edge Engine (Zero Latency & Offline)
- **Korean Financial Number Normalizer**:
  - Handles units: `억` (10^8), `만` / `만원` (10^4), `천` / `천원` (10^3), `k` (10^3), `m` (10^6).
  - Handles composite phrases: `4만 5천원` -> `45000`, `1.5만` -> `15000`.
  - Solves the critical bug where `4만원 더치페이` parses as `-₩4`.
- **Merchant & Category Heuristics**:
  - Direct mapping dictionary for top 500 Korean & Global merchants (스타벅스, 이마트, 배달의민족, 쿠팡, 넷플릭스, AWS, Uber).
  - Categorizes before LLM call to guarantee 0% `Uncategorized` on standard items.

### 3.2 Tier 2: Cloud LLM Structured Parser (Gemini 2.5/3.8 Flash)
- **Model**: `gemini-3.8-flash` with fallback to local rules.
- **Enforcement**: `responseMimeType: "application/json"` with strict `responseSchema`.
- **Anonymization Engine**:
  - Strips card numbers (`\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b`), bank accounts, phone numbers, and resident registration numbers prior to transmitting to LLM.

---

## 4. Multi-Currency Engine
- **Supported Base Currencies**: `KRW`, `USD`, `EUR`, `JPY`.
- **Conversion Policy**:
  - Each transaction retains its original `amount` and `currency`.
  - `baseAmount` is calculated using daily cached rates from European Central Bank or Open Exchange Rates API.
  - Dashboard sums allow seamless toggle between Native currency and Normalized Base currency.

---

## 5. Multimodal Receipt OCR Pipeline
- **Endpoint**: `/api/parse-receipt`
- **Input**: Base64 encoded image or `multipart/form-data` (JPEG/PNG/WEBP up to 10MB).
- **Processing**:
  - Gemini multimodal vision prompt extracts: Merchant Name, Transaction Date, Total Amount, Tax/Tip, Payment Method, and Itemized Line Items.
  - Line items are auto-summed and verified against receipt total to prevent accounting discrepancy.

---

## 6. Subscription & Recurring Leakage Detector
- **Rule Engine**:
  - Frequency matching across transactions with identical merchant and similar amount (+- 5%) on a 28-31 day cycle.
  - Generates actionable prompt: *"Detected monthly subscription: Netflix ₩17,000. Add to recurring tracker?"*

---

## 7. Storage & Security Specification
- **Client Persistence**: IndexedDB via `idb` with store names `transactions`, `assets`, `budgets`, `subscriptions`, `fx_cache`.
- **Export/Import**: Standardized JSON backup schema with version tag `v2.0` and CSV exporter conforming to RFC 4180.
- **Privacy Standard**: 100% Client-side local persistence option. Cloud sync only when explicitly authenticated.
