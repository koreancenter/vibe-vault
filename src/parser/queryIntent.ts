import type {
  FinancialQueryMetric,
  FinancialQueryParameters,
  SupportedCurrency,
} from '../types';
import { isAnalyticalQueryInput } from '../finance/lightweightDetectors';
import { EN_MONTH_NAMES, EN_MONTH_SHORT } from './constants';

export { isAnalyticalQueryInput };

/**
 * Shared deterministic rule-based financial query intent parser with multilingual support (KO, EN, JA, EU).
 */
export function parseQueryIntentLocally(query: string, now: Date = new Date()): FinancialQueryParameters {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  let metric: FinancialQueryMetric = 'general_financial';
  let category: string | undefined = undefined;
  let targetCurrency: SupportedCurrency = 'KRW';
  let month = currentMonth;
  let year = currentYear;
  const merchantKeyword: string | undefined = undefined;

  // Month matching: Korean ("9월", "2026년 9월"), Japanese ("9月", "2026年9月"), English month names
  const koJaMonthMatch = query.match(/(?:(\d{4})[년年]\s*)?(\d{1,2})[월月]/);

  if (koJaMonthMatch) {
    if (koJaMonthMatch[1]) year = parseInt(koJaMonthMatch[1], 10);
    month = parseInt(koJaMonthMatch[2], 10);
  } else if (/지난달|지난\s*달|last\s*month|先月|le\s*mois\s*dernier|letzter\s*monat|el\s*mes\s*pasado/i.test(query)) {
    month = currentMonth === 1 ? 12 : currentMonth - 1;
    if (currentMonth === 1) year = currentYear - 1;
  } else {
    for (let i = 0; i < 12; i++) {
      const regex = new RegExp(`\\b(?:${EN_MONTH_NAMES[i]}|${EN_MONTH_SHORT[i]})\\b`, 'i');
      if (regex.test(query)) {
        month = i + 1;
        break;
      }
    }
  }

  // Target currency detection
  if (/usd|dollar|달러|\$|환차|환율|외환|fx|forex|為替/i.test(query)) {
    targetCurrency = 'USD';
  } else if (/eur|euro|유로|€/i.test(query)) {
    targetCurrency = 'EUR';
  } else if (/jpy|yen|엔화|円|¥/i.test(query)) {
    targetCurrency = 'JPY';
  } else if (/gbp|pound|파운드|£/i.test(query)) {
    targetCurrency = 'GBP';
  }

  // Metric & category classification
  if (/환차|환율|달러|usd|외환|환전|환손익|환차익|환차손|fx|forex|exchange\s*rate|foreign\s*exchange|currency\s*gain|為替|為替差益|為替差損|為替レート|taux\s*de\s*change|wechselkurs|tipo\s*de\s*cambio/i.test(query)) {
    metric = 'fx_gain_loss';
    targetCurrency = targetCurrency || 'USD';
  } else if (/주말|토요일|일요일|weekend|samedi|dimanche|wochenende|fin\s*de\s*semana|週末|土曜日|日曜日/i.test(query)) {
    metric = 'weekend_expense';
  } else if (/식비|카페|커피|외식|음식|배달|점심|저녁|마트|장보기|food|dining|restaurant|coffee|cafe|groceries|lunch|dinner|meal|essen|lebensmittel|nourriture|repas|comida|cibo|食費|カフェ|外食|ランチ|ディナー/i.test(query)) {
    metric = 'category_sum';
    category = 'Food';
  } else if (/교통|지하철|버스|택시|주유|주차|transport|transit|subway|metro|bus|taxi|flight|fuel|gas|essence|verkehr|transporte|trasporti|交通|電車|バス|タクシー|ガソリン/i.test(query)) {
    metric = 'category_sum';
    category = 'Transport';
  } else if (/생활|쇼핑|다이소|쿠팡|올리브영|편의점|shopping|living|store|market|courses|einkaufen|compras|spesa|日用品|買い物|ショッピング/i.test(query)) {
    metric = 'category_sum';
    category = 'Living';
  } else if (/고정비|월세|관리비|통신비|보험|공과금|fixed|rent|utility|utilities|bill|insurance|subscription|miete|loyer|alquiler|bollette|固定費|家賃|光熱費|保険|サブスク/i.test(query)) {
    metric = 'category_sum';
    category = 'Fixed';
  } else if (/의료|병원|약국|헬스|운동|health|medical|doctor|hospital|pharmacy|fitness|gym|santé|gesundheit|salud|salute|医療|健康|病院|薬局|フィットネス/i.test(query)) {
    metric = 'category_sum';
    category = 'Health';
  } else if (/여가|문화|영화|여행|숙박|leisure|culture|movie|cinema|trip|travel|hotel|hobby|vacation|loisirs|freizeit|ocio|tempo\s*libero|娯楽|趣味|旅行|映画/i.test(query)) {
    metric = 'category_sum';
    category = 'Leisure';
  } else if (/총\s*지출|얼마\s*썼|지출\s*총액|total\s*expense|how\s*much\s*did\s*i\s*spend|total\s*spending|dépenses\s*totales|gesamtausgaben|gastos\s*totales|総支出|支出合計/i.test(query)) {
    metric = 'total_expense';
  } else if (/수입|월급|급여|들어온\s*돈|income|salary|earnings|revenue|revenu|einkommen|ingresos|entrata|収入|給料/i.test(query)) {
    metric = 'total_income';
  } else if (/저축|순수익|흑자|잉여|savings|net\s*savings|surplus|épargne|ersparnis|ahorro|risparmio|貯蓄|余剰/i.test(query)) {
    metric = 'net_savings';
  }

  const dateRange = `${year}-${String(month).padStart(2, '0')}`;
  return {
    metric,
    dateRange,
    year,
    month,
    targetCurrency,
    category,
    merchantKeyword,
    querySummary: `${month} / ${year} (${metric === 'fx_gain_loss' ? 'FX' : metric === 'weekend_expense' ? 'Weekend' : category || 'Finance'})`,
  };
}
