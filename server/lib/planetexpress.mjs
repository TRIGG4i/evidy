const ENDPOINT = 'https://planetexpress.com/wp-admin/admin-ajax.php';
const COUNTRY_MADAGASCAR = '134';
const WAREHOUSES = new Set(['4', '6']);

const positive = (value, label, allowZero = false) => {
  const number = Number(value);
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) throw new Error(`${label} invalide`);
  return number;
};

export const volumetricWeightLb = ({ length, width, height, divisor = 166 }) => {
  return (positive(length, 'Longueur') * positive(width, 'Largeur') * positive(height, 'Hauteur')) / divisor;
};

export const billableWeightLb = (pkg) => {
  const actual = positive(pkg.weight, 'Poids');
  const volumetric = volumetricWeightLb(pkg);
  return Math.ceil(Math.max(actual, volumetric));
};

export const getPlanetExpressRates = async ({
  warehouseId = '4',
  city = 'Antananarivo',
  postalcode = '101',
  weight,
  length,
  width,
  height,
  value,
  signal
}) => {
  const wid = String(warehouseId);
  if (!WAREHOUSES.has(wid)) throw new Error('Entrepôt Planet Express invalide');
  const pkg = {
    weight: positive(weight, 'Poids'),
    length: positive(length, 'Longueur'),
    width: positive(width, 'Largeur'),
    height: positive(height, 'Hauteur'),
    value: positive(value, 'Valeur', true)
  };
  const packages = new URLSearchParams();
  Object.entries(pkg).forEach(([key, val]) => packages.set(`packages[0][${key}]`, String(val)));

  const body = new URLSearchParams();
  body.set('action', 'get_ww_rates_mps');
  body.set('values[country]', COUNTRY_MADAGASCAR);
  body.set('values[state]', '');
  body.set('values[city]', city);
  body.set('values[postalcode]', postalcode);
  body.set('values[packages]', packages.toString());
  body.set('values[warehouseId]', wid);
  body.set('values[units]', '0');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 eVidy/0.1 (+https://github.com/TRIGG4i/evidy)'
    },
    body,
    signal
  });
  if (!response.ok) throw new Error(`Planet Express HTTP ${response.status}`);
  const json = await response.json();
  if (!json?.success || !Array.isArray(json?.data?.carriers)) throw new Error('Réponse Planet Express invalide');

  const carriers = json.data.carriers
    .filter((c) => Number(c.rate) > 0)
    .map((c) => ({
      id: Number(c.id),
      carrier: c.name,
      service: c.service || '',
      rateUsd: Math.round(Number(c.rate) * 100) / 100,
      insuranceIncluded: Boolean(c.insuranceIncluded),
      insuranceUsd: Number(c.insurance || 0),
      deliverySpeed: c.deliverySpeed || '',
      currency: c.currency || 'USD'
    }))
    .sort((a, b) => a.rateUsd - b.rateUsd);

  return {
    source: 'planetexpress-public-calculator',
    observedAt: new Date().toISOString(),
    warehouseId: wid,
    package: pkg,
    billableWeightLb: billableWeightLb(pkg),
    carriers
  };
};
