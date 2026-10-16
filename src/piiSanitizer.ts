/**
 * Removes common financial PII patterns before text is sent to AI or saved.
 */
export function anonymizeFinancialInput(rawText: string): string {
  return rawText
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD]')
    .replace(/\b\d{3,6}[-\s]?\d{2,6}[-\s]?\d{3,8}\b/g, '[ACCOUNT]')
    .replace(/\b\d{6}[-\s]?[1-4]\d{6}\b/g, '[RRN]')
    .replace(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[PHONE]')
    .replace(/[가-힣]\*[가-힣]/g, '[NAME]');
}
