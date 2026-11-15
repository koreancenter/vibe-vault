import { generateSecureId } from '../identifiers';
import { anonymizeFinancialInput } from '../piiSanitizer';

// Local rule-based parser for Smart Asset extraction
export function parseAssetsWithLocalRules(rawText: string) {
  const sanitized = anonymizeFinancialInput(rawText);

  const assets: Array<{
    id: string;
    name: string;
    type: 'CARD' | 'BANK' | 'CASH' | 'OTHER';
    billingDay?: number;
    enabled: boolean;
    note?: string;
  }> = [];

  const foundNames = new Set<string>();

  // Helper to detect billing day numbers (1-31)
  const extractBillingDay = (str: string): number | undefined => {
    const patterns = [
      /(?:결제일|청구일|납부일|결제예정일|결제일자|bill(?:ing)?\s*(?:day|date|cycle)?|due\s*(?:day|date)?|payment\s*(?:day|date)?)(?:은|는|이|가)?\s*[:=]?\s*(\d{1,2})\s*(?:일|th|st|nd|rd)?/i,
      /(\d{1,2})\s*(?:일|th|st|nd|rd)\s*(?:결제일|청구일|납부일|결제예정일|결제|bill|due)/i,
      /(?:매월|매달|every\s*month|monthly)\s*(\d{1,2})\s*(?:일|th|st|nd|rd)?/i,
      /\b(\d{1,2})\s*(?:th|st|nd|rd)\s*(?:of\s*(?:the|each|every)?\s*month)?\b/i
    ];

    for (const pat of patterns) {
      const m = str.match(pat);
      if (m) {
        const day = parseInt(m[1], 10);
        if (day >= 1 && day <= 31) return day;
      }
    }
    return undefined;
  };

  const cardPatterns = [
    { regex: /현대카드|\bhyundai\s*(?:card)?\b/i, name: '현대카드' },
    { regex: /신한카드|신한체크|\bshinhan\s*card\b/i, name: '신한카드' },
    { regex: /국민카드|kb국민카드|kb카드|\bkb\s*card\b|\bkookmin\s*card\b/i, name: 'KB국민카드' },
    { regex: /삼성카드|\bsamsung\s*(?:card)?\b/i, name: '삼성카드' },
    { regex: /롯데카드|\blotte\s*(?:card)?\b/i, name: '롯데카드' },
    { regex: /우리카드|우리체크|\bwoori\s*card\b/i, name: '우리카드' },
    { regex: /하나카드|하나체크|\bhana\s*card\b/i, name: '하나카드' },
    { regex: /농협카드|nh카드|nh농협카드|\bnh\s*card\b/i, name: 'NH농협카드' },
    { regex: /비씨카드|bc카드|\bbc\s*card\b/i, name: 'BC카드' },
    { regex: /카카오뱅크\s*(?:체크)?카드|카카오카드|\bkakao\s*card\b/i, name: '카카오뱅크 카드' },
    { regex: /토스\s*(?:체크)?카드|토스뱅크\s*카드|\btoss\s*card\b/i, name: '토스뱅크 카드' },
    { regex: /케이뱅크\s*(?:체크)?카드|\bkbank\s*card\b/i, name: '케이뱅크 카드' },
    { regex: /아멕스|아메리칸\s*익스프레스|\bamex\b|\bamerican\s*express\b/i, name: '아멕스 카드' },
    { regex: /체이스\s*카드|\bchase\s*(?:sapphire|card)\b/i, name: 'Chase Card' },
    { regex: /애플\s*카드|\bapple\s*card\b/i, name: 'Apple Card' },
  ];

  const bankPatterns = [
    { regex: /신한은행|\bshinhan(?:\s*bank)?\b/i, name: '신한은행' },
    { regex: /국민은행|kb국민은행|kb은행|\bkookmin(?:\s*bank)?\b|\bkb(?:\s*bank)?\b/i, name: 'KB국민은행' },
    { regex: /우리은행|\bwoori(?:\s*bank)?\b/i, name: '우리은행' },
    { regex: /하나은행|\bhana(?:\s*bank)?\b/i, name: '하나은행' },
    { regex: /농협은행|nh농협은행|농협|\bnh(?:\s*bank)?\b/i, name: 'NH농협은행' },
    { regex: /카카오뱅크|\bkakao(?:\s*bank)?\b/i, name: '카카오뱅크' },
    { regex: /토스뱅크|\btoss(?:\s*bank)?\b/i, name: '토스뱅크' },
    { regex: /케이뱅크|k뱅크|\bkbank\b/i, name: '케이뱅크' },
    { regex: /기업은행|ibk기업은행|\bibk\b/i, name: 'IBK기업은행' },
    { regex: /sc제일은행|제일은행|\bstandard\s*chartered\b/i, name: 'SC제일은행' },
    { regex: /우체국|우체국예금/i, name: '우체국' },
    { regex: /새마을금고/i, name: '새마을금고' },
    { regex: /신협/i, name: '신협' },
    { regex: /수협은행|수협/i, name: '수협은행' },
    { regex: /대구은행|im뱅크|iM뱅크/i, name: 'iM뱅크(대구은행)' },
    { regex: /부산은행/i, name: '부산은행' },
    { regex: /광주은행/i, name: '광주은행' },
    { regex: /체이스\s*은행|\bchase(?:\s*bank)?\b/i, name: 'Chase Bank' },
    { regex: /뱅크\s*오브\s*아메리카|\bbank\s*of\s*america\b|\bboa\b/i, name: 'Bank of America' },
  ];

  const cashPatterns = [
    { regex: /비상금\s*현금|비상금/i, name: '비상금 현금' },
    { regex: /지갑\s*현금|지갑/i, name: '지갑 현금' },
    { regex: /현금|cash/i, name: '현금' },
  ];

  const segments = sanitized.split(/[,\n;/|]+/).map(s => s.trim()).filter(Boolean);

  for (const seg of segments) {
    const billingDay = extractBillingDay(seg);

    for (const cp of cardPatterns) {
      if (cp.regex.test(seg) && !foundNames.has(cp.name)) {
        foundNames.add(cp.name);
        assets.push({
          id: generateSecureId('asset'),
          name: cp.name,
          type: 'CARD',
          billingDay,
          enabled: true,
          note: billingDay ? `매월 ${billingDay}일 결제` : '신용/체크카드'
        });
      }
    }

    for (const bp of bankPatterns) {
      if (bp.regex.test(seg) && !foundNames.has(bp.name)) {
        if (/체크카드|신용카드|카드/i.test(seg) && !/계좌|통장|주거래|bank/i.test(seg)) {
          continue;
        }
        foundNames.add(bp.name);
        assets.push({
          id: generateSecureId('asset'),
          name: bp.name,
          type: 'BANK',
          enabled: true,
          note: /주거래/i.test(seg) ? '주거래 계좌' : '은행 계좌'
        });
      }
    }

    for (const cash of cashPatterns) {
      if (cash.regex.test(seg) && !foundNames.has(cash.name)) {
        foundNames.add(cash.name);
        assets.push({
          id: generateSecureId('asset'),
          name: cash.name,
          type: 'CASH',
          enabled: true,
          note: '현금 자산'
        });
        break;
      }
    }
  }

  // If no assets matched in segments, test against entire sanitized text
  if (assets.length === 0) {
    const globalBilling = extractBillingDay(sanitized);

    for (const cp of cardPatterns) {
      if (cp.regex.test(sanitized) && !foundNames.has(cp.name)) {
        foundNames.add(cp.name);
        assets.push({
          id: generateSecureId('asset'),
          name: cp.name,
          type: 'CARD',
          billingDay: globalBilling,
          enabled: true,
          note: globalBilling ? `매월 ${globalBilling}일 결제` : undefined
        });
      }
    }

    for (const bp of bankPatterns) {
      if (bp.regex.test(sanitized) && !foundNames.has(bp.name)) {
        foundNames.add(bp.name);
        assets.push({
          id: generateSecureId('asset'),
          name: bp.name,
          type: 'BANK',
          enabled: true,
        });
      }
    }

    for (const cash of cashPatterns) {
      if (cash.regex.test(sanitized) && !foundNames.has(cash.name)) {
        foundNames.add(cash.name);
        assets.push({
          id: generateSecureId('asset'),
          name: cash.name,
          type: 'CASH',
          enabled: true,
        });
        break;
      }
    }
  }

  // Fallback for custom asset mentions like "토스머니", "네이버페이 머니"
  if (assets.length === 0) {
    const customMatch = sanitized.match(/([가-힣a-zA-Z0-9\s]{2,15}(?:카드|은행|통장|페이|현금|계좌|머니))/);
    if (customMatch) {
      const name = customMatch[1].trim();
      const isCard = /카드/i.test(name);
      const isBank = /은행|통장|계좌/i.test(name);
      const isCash = /현금/i.test(name);
      assets.push({
        id: generateSecureId('asset'),
        name,
        type: isCard ? 'CARD' : isBank ? 'BANK' : isCash ? 'CASH' : 'OTHER',
        billingDay: isCard ? extractBillingDay(sanitized) : undefined,
        enabled: true
      });
    }
  }

  return assets;
}
