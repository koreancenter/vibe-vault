export function cleanMerchantTitle(rawText: string, fallback?: string): string {
  if (!rawText) return fallback || '지출 내역';
  let s = rawText.trim();

  // Strip payment entity names and payment action terms
  s = s.replace(/(?:국민카드|KB국민카드|신한카드|현대카드|삼성카드|롯데카드|우리카드|하나카드|NH농협카드|농협카드|BC카드|씨티카드|토스카드|토스뱅크|토스페이|토스|카카오페이|네이버페이|쿠팡페이|애플페이|신용카드|체크카드|카드결제|계좌이체|무통장입금|자동이체)/gi, ' ');

  // Strip action words and postpositions at end of phrases
  s = s.replace(/(?:결제함|결제|사먹음|사먹었음|사고|샀음|구입|구매|이체함|송금함|출금함)/gi, ' ');

  // Strip currency amounts like "20만원", "87만 원", "12,000원", "4500 KRW", "$35", etc.
  s = s.replace(/(?:\$|€|¥|₩|KRW|USD)?\s*[\d,]+(?:\.\d+)?\s*(?:억원|억|천만원|천만|백만원|백만|만원|만|천원|천|원|달러|dollar|eur|유로|euro|jpy|엔|yen|gbp|파운드|k|m)?(?:\s*(?:원|KRW|USD|\$|€|¥|₩))?/gi, ' ');

  // Strip Korean postpositions attached to stripped tokens (e.g. "20만원에", "공연을", "호텔에서", "예약을")
  // Strip postpositions at the end: "에", "을", "를", "으로", "로", "에서", "의"
  s = s.replace(/\s+(?:에|을|를|으로|로|에서|의)\s*$/g, '');
  s = s.replace(/(?<=[가-힣])(?:에|을|를)\s*$/g, '');

  // Strip remaining standalone currency words and particles
  s = s.replace(/(?:^|\s+)(?:원|krw|usd|달러|dollar|eur|jpy|엔|₩|\$|€|¥)(?:\s+|$)/gi, ' ');
  s = s.replace(/^[\s,·\.\-원\d]+(?:\s*원)?/i, ' ');
  s = s.replace(/[\s,·\.\-원]+$/i, ' ');

  // Normalize multi spaces
  s = s.replace(/\s+/g, ' ').trim();

  if (!s || s === '원' || s === 'KRW') {
    return fallback || '지출 내역';
  }

  return s;
}
