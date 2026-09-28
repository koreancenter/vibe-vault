import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectCurrencyFromInstitution,
  getBalancePrefix,
  getBalancePlaceholder,
  ensureCurrencyRegistered,
  INSTITUTION_CURRENCY_PATTERNS
} from '../src/components/SmartAssetSetup';
import { getUserActiveCurrencies, saveUserActiveCurrencies } from '../src/utils';

// Lightweight localStorage in-memory mock for Node test environment
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
};

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = createLocalStorageMock();
}

describe('SmartAssetSetup - Automatic Currency Detection & Formatting', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. Institution Currency Mapping Rule', () => {
    it('detects IDR institutions correctly across keywords', () => {
      const idrExamples = [
        'BNI 생활비 통장',
        'BCA 급여계좌',
        'Mandiri Payroll Card',
        'BRI Tabungan',
        'CIMB Niaga Xtra',
        'Jenius BTPN',
        'Permata Bank',
        'GoPay e-wallet',
        'OVO Cash',
        'DANA Digital Wallet'
      ];

      for (const name of idrExamples) {
        expect(detectCurrencyFromInstitution(name)).toBe('IDR');
      }
    });

    it('detects USD institutions correctly across keywords', () => {
      const usdExamples = [
        'Charles Schwab Checking',
        'Chase Sapphire Preferred',
        'BOA Travel Rewards',
        'Bank of America Advantage',
        'Robinhood Brokerage',
        'Fidelity Investments',
        'Wise Multi-currency Account',
        'PayPal Balance'
      ];

      for (const name of usdExamples) {
        expect(detectCurrencyFromInstitution(name)).toBe('USD');
      }
    });

    it('detects KRW institutions correctly across keywords', () => {
      const krwExamples = [
        '국민은행 주거래통장',
        '신한 쏠 편한 입출금',
        '우리WON 통장',
        '하나 밀리언달러 통장',
        '농협 올원뱅크',
        '카카오뱅크 세이프박스',
        '토스뱅크 모임통장',
        '케이뱅크 MY입출금',
        '기업은행 I-ONE',
        '우체국 스마트뱅킹',
        '현대카드 M Edition3',
        '삼성카드 iD ON'
      ];

      for (const name of krwExamples) {
        expect(detectCurrencyFromInstitution(name)).toBe('KRW');
      }
    });

    it('returns null for generic or unmatched account names', () => {
      expect(detectCurrencyFromInstitution('비상금 통장')).toBeNull();
      expect(detectCurrencyFromInstitution('용돈 지갑')).toBeNull();
      expect(detectCurrencyFromInstitution('My Secret Cash')).toBeNull();
      expect(detectCurrencyFromInstitution('')).toBeNull();
    });
  });

  describe('2. Visual Balance Display (Prefix & Placeholder)', () => {
    it('adapts prefix and placeholder for IDR', () => {
      expect(getBalancePrefix('IDR')).toBe('Rp');
      expect(getBalancePlaceholder('IDR')).toBe('Rp 0');
    });

    it('adapts prefix and placeholder for KRW', () => {
      expect(getBalancePrefix('KRW')).toBe('₩');
      expect(getBalancePlaceholder('KRW')).toBe('₩0');
    });

    it('adapts prefix and placeholder for USD', () => {
      expect(getBalancePrefix('USD')).toBe('$');
      expect(getBalancePlaceholder('USD')).toBe('$0');
    });

    it('adapts prefix and placeholder for EUR and JPY', () => {
      expect(getBalancePrefix('EUR')).toBe('€');
      expect(getBalancePlaceholder('EUR')).toBe('€0');

      expect(getBalancePrefix('JPY')).toBe('¥');
      expect(getBalancePlaceholder('JPY')).toBe('¥0');
    });
  });

  describe('3. Auto-Selection & Seamless Unlock (Registration into Active Currencies)', () => {
    it('registers new currency into user active currencies without duplicates', () => {
      saveUserActiveCurrencies(['KRW']);
      expect(getUserActiveCurrencies()).toEqual(['KRW']);

      ensureCurrencyRegistered('IDR');
      const updated = getUserActiveCurrencies();
      expect(updated).toContain('KRW');
      expect(updated).toContain('IDR');

      // Re-registering existing currency should be a no-op
      ensureCurrencyRegistered('IDR');
      expect(getUserActiveCurrencies().filter(c => c === 'IDR').length).toBe(1);
    });
  });
});
