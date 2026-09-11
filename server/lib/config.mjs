const num = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

export const CONFIG = Object.freeze({
  port: num('PORT', 4280),
  publicOrigin: process.env.PUBLIC_ORIGIN || 'https://trigg4i.github.io',
  visaBankFeePercent: num('VISA_BANK_FEE_PERCENT', 4),
  cardFeePercent: num('CARD_FEE_PERCENT', 3),
  cardFixedMga: num('CARD_FIXED_MGA', 4500),
  customsReserve: {
    small: num('CUSTOMS_RESERVE_SMALL_MGA', 200000),
    medium: num('CUSTOMS_RESERVE_MEDIUM_MGA', 350000),
    bulky: num('CUSTOMS_RESERVE_BULKY_MGA', 1300000)
  },
  localDeliveryMga: num('LOCAL_DELIVERY_MGA', 0),
  visaFallbackUsdMga: num('VISA_FALLBACK_USD_MGA', 0),
  ai: {
    baseUrl: process.env.AI_BASE_URL || '',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || ''
  }
});
