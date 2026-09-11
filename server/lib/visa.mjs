import { CONFIG } from './config.mjs';

const VISA_DOMAINS = [
  'https://usa.visa.com',
  'https://www.visa.fr',
  'https://www.visa.ca',
  'https://www.visa.com.au',
  'https://www.visa.com.sg'
];

const visaDate = (date = new Date()) => {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getUTCFullYear()}`;
};

const parseNumber = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  return Number(value.replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
};

const plausibleMgaRate = (value) => Number.isFinite(value) && value >= 1000 && value <= 20000;

export const extractVisaRate = (json) => {
  const candidates = [];
  const push = (path, value, priority) => {
    const number = parseNumber(value);
    if (plausibleMgaRate(number)) candidates.push({ path, value: number, priority });
  };
  const scan = (obj, path = '') => {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (value && typeof value === 'object') { scan(value, currentPath); continue; }
      if (/withadditionalfee|withmarkup|totalconverted|convertedamount|destinationamount|destamount|toamount|amountconverted/.test(k)) push(currentPath, value, 1);
      else if (/totalconversionrate|conversionratewithadditionalfee|exchangeratewithadditionalfee|fxratewithadditionalfee|ratewithadditionalfee/.test(k)) push(currentPath, value, 2);
      else if (k === 'rate' || /conversionrate|exchangerate|fxrate/.test(k)) push(currentPath, value, 3);
      else push(currentPath, value, 4);
    }
  };
  scan(json);
  candidates.sort((a, b) => a.priority - b.priority);
  if (!candidates.length) throw new Error('Taux VISA introuvable');
  return candidates[0];
};

export const getVisaRate = async ({ from = 'USD', to = 'MGA', bankFee = CONFIG.visaBankFeePercent } = {}) => {
  const currency = String(from).toUpperCase();
  if (!['USD', 'EUR'].includes(currency) || String(to).toUpperCase() !== 'MGA') throw new Error('Paire VISA non prise en charge');
  const date = visaDate();
  const errors = [];

  for (const domain of VISA_DOMAINS) {
    const params = new URLSearchParams({
      amount: '1', fee: String(bankFee), utcConvertedDate: date, exchangedate: date,
      fromCurr: 'MGA', toCurr: currency, _: String(Date.now())
    });
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const response = await fetch(`${domain}/cmsapi/fx/rates?${params}`, {
        headers: { 'Accept': 'application/json, text/plain, */*', 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store', signal: controller.signal
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get('content-type') || '';
      if (!type.includes('json')) throw new Error('Réponse non JSON');
      const json = await response.json();
      const extracted = extractVisaRate(json);
      return { rate: extracted.value, source: 'visa', sourceDomain: domain, bankFeePercent: Number(bankFee), observedAt: new Date().toISOString(), field: extracted.path };
    } catch (error) {
      errors.push(`${domain}: ${error.message}`);
    }
  }

  if (currency === 'USD' && CONFIG.visaFallbackUsdMga > 0) {
    return { rate: CONFIG.visaFallbackUsdMga, source: 'fallback', bankFeePercent: Number(bankFee), observedAt: new Date().toISOString(), warning: 'Visa indisponible : taux de secours configuré', errors };
  }
  const error = new Error('VISA indisponible. Saisir le taux manuellement.');
  error.details = errors;
  throw error;
};
