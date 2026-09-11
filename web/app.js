const $ = (id) => document.getElementById(id);
const apiBase = (window.EVIDY?.apiBase || '').replace(/\/$/, '');
const api = (path) => `${apiBase}${path}`;

const state = {
  config: null,
  rates: [],
  selectedRate: null,
  lastQuote: null,
  apiOnline: false
};

const fmtMGA = (n) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} Ar`;
const fmtUSD = (n) => `$${Number(n || 0).toFixed(2)}`;
const number = (id, fallback = 0) => {
  const value = Number($(id).value);
  return Number.isFinite(value) ? value : fallback;
};
const setHint = (id, text, kind = '') => { const el = $(id); el.textContent = text; el.className = `hint ${kind}`.trim(); };

function billableWeight() {
  const actual = Math.max(0, number('weightLb'));
  const volumetric = Math.max(0, number('lengthIn') * number('widthIn') * number('heightIn') / 166);
  return Math.ceil(Math.max(actual, volumetric));
}

function updatePackageSummary() {
  $('weightSummary').textContent = `${number('weightLb').toFixed(2)} lb`;
  $('dimsSummary').textContent = `${number('lengthIn')} × ${number('widthIn')} × ${number('heightIn')} in`;
  $('billableSummary').textContent = `${billableWeight()} lb`;
  if (!$('declaredValue').dataset.touched) $('declaredValue').value = number('itemUsd').toFixed(2);
  saveState();
}

function getPublicConfigFallback() {
  return {
    cardFeePercent: 3,
    cardFixedMga: 4500,
    visaBankFeePercent: 4,
    customsReserve: { small: 200000, medium: 350000, bulky: 1300000 },
    localDeliveryMga: 0,
    marginTiers: [{ maxUsd:350, percent:30 }, { maxUsd:900, percent:25 }, { maxUsd:null, percent:15 }],
    minimumServiceFeeMga: 75000
  };
}

async function fetchJson(url, options = {}, timeout = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, headers: { 'Content-Type':'application/json', ...(options.headers || {}) } });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = null; }
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

async function health() {
  try {
    await fetchJson(api('/healthz'), {}, 6000);
    state.apiOnline = true;
    $('apiDot').parentElement.classList.add('ok');
    $('apiStatus').textContent = 'Moteur connecté';
  } catch {
    state.apiOnline = false;
    $('apiDot').parentElement.classList.add('bad');
    $('apiStatus').textContent = 'Mode manuel disponible';
  }
}

async function loadConfig() {
  state.config = getPublicConfigFallback();
  try {
    const live = await fetchJson(api('/api/public-config'), {}, 6000);
    state.config = { ...state.config, ...live };
  } catch {}
}

const VISA_DOMAINS = ['https://usa.visa.com','https://www.visa.fr','https://www.visa.ca','https://www.visa.com.au','https://www.visa.com.sg'];
const VISA_PROXIES = ['https://api.allorigins.win/raw?url=','https://corsproxy.io/?url='];

function visaDate(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getFullYear()}`;
}

function visaUrl(domain, fromCurrency = 'USD') {
  const params = new URLSearchParams({ amount:'1', fee:'4', utcConvertedDate:visaDate(), exchangedate:visaDate(), fromCurr:fromCurrency, toCurr:'MGA', _:String(Date.now()) });
  return `${domain}/cmsapi/fx/rates?${params}`;
}

function visaNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  return Number(value.replace(/[^0-9,.-]/g, '').replace(/,/g, ''));
}

function extractVisaRate(json) {
  const candidates = [];
  const push = (path, value, priority) => {
    const n = visaNumber(value);
    if (Number.isFinite(n) && n >= 1000 && n <= 20000) candidates.push({ path, value:n, priority });
  };
  const scan = (obj, path = '') => {
    if (!obj || typeof obj !== 'object') return;
    Object.entries(obj).forEach(([key, value]) => {
      const p = path ? `${path}.${key}` : key;
      const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (value && typeof value === 'object') return scan(value, p);
      if (/withadditionalfee|withmarkup|totalconverted|convertedamount|convertedamt|destinationamount|destamount|toamount|amountconverted/.test(k)) push(p,value,1);
      else if (/totalconversionrate|conversionratewithadditionalfee|exchangeratewithadditionalfee|fxratewithadditionalfee|ratewithadditionalfee/.test(k)) push(p,value,2);
      else if (k === 'rate' || /conversionrate|exchangerate|fxrate/.test(k)) push(p,value,3);
      else push(p,value,4);
    });
  };
  scan(json);
  if (!candidates.length) throw new Error('Taux VISA introuvable dans la réponse.');
  const best = Math.min(...candidates.map(c => c.priority));
  return candidates.filter(c => c.priority === best).sort((a,b) => b.value-a.value)[0].value;
}

async function fetchVisaJson(url) {
  const attempts = [url, ...VISA_PROXIES.map(p => p + encodeURIComponent(url))];
  let last;
  for (const target of attempts) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const response = await fetch(target, { cache:'no-store', signal:controller.signal, headers:{ 'Accept':'application/json, text/plain, */*' } });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return JSON.parse(await response.text());
    } catch (e) { last = e; }
  }
  throw last || new Error('VISA indisponible');
}

async function refreshVisa() {
  $('visaBtn').disabled = true;
  setHint('visaStatus', 'Récupération VISA : USD → MGA, Bank fee 4 %…');
  const errors = [];
  try {
    for (const domain of VISA_DOMAINS) {
      try {
        const json = await fetchVisaJson(visaUrl(domain, 'USD'));
        const rate = extractVisaRate(json);
        $('visaRate').value = Number(rate).toFixed(2);
        setHint('visaStatus', `Taux VISA chargé : ${Number(rate).toFixed(2)} MGA/USD • Bank fee 4 %.`, 'success');
        saveState();
        return;
      } catch (e) { errors.push(`${domain}: ${e.message}`); }
    }
    try {
      const data = await fetchJson(api('/api/visa-rate?from=USD&bankFee=4'), {}, 15000);
      $('visaRate').value = Number(data.rate).toFixed(2);
      setHint('visaStatus', `Taux VISA chargé via le backend : ${Number(data.rate).toFixed(2)} MGA/USD.`, 'success');
      saveState();
      return;
    } catch (e) { errors.push(`backend: ${e.message}`); }
    throw new Error(errors.at(-1) || 'VISA indisponible');
  } catch (error) {
    setHint('visaStatus', `Auto VISA indisponible ici : saisissez le taux du jour. (${error.message})`, 'warn');
  } finally { $('visaBtn').disabled = false; }
}

async function analyzeProduct() {
  const url = $('productUrl').value.trim();
  if (!url) return setHint('analysisStatus', 'Collez d’abord un lien produit.', 'warn');
  $('analyzeBtn').disabled = true;
  setHint('analysisStatus', 'Analyse du produit et estimation prudente du colis…');
  try {
    const data = await fetchJson(api('/api/analyze'), { method:'POST', body:JSON.stringify({ url }) }, 22000);
    if (data.title) $('productTitle').value = data.title.replace(/\s*\|\s*eBay.*$/i, '');
    if (Number.isFinite(Number(data.priceUsd))) { $('itemUsd').value = Number(data.priceUsd).toFixed(2); $('declaredValue').value = Number(data.priceUsd).toFixed(2); }
    const p = data.packageEstimate;
    if (p) {
      $('weightLb').value = Number(p.weightLb).toFixed(2);
      $('lengthIn').value = Number(p.dimensionsIn.length).toFixed(1);
      $('widthIn').value = Number(p.dimensionsIn.width).toFixed(1);
      $('heightIn').value = Number(p.dimensionsIn.height).toFixed(1);
      const pct = Math.round(Number(p.confidence || 0) * 100);
      $('confidenceBadge').textContent = `${p.source} • confiance ${pct}%`;
      $('confidenceBadge').className = `pill ${pct >= 75 ? 'good' : pct >= 50 ? 'warn' : 'muted'}`;
    }
    updatePackageSummary();
    setHint('analysisStatus', `Analyse terminée${data.packageEstimate?.category ? ` • ${data.packageEstimate.category}` : ''}. Vérifiez les données avant devis.`, 'success');
  } catch (error) {
    setHint('analysisStatus', `Analyse automatique indisponible : ${error.message}. Utilisez la saisie manuelle.`, 'warn');
  } finally { $('analyzeBtn').disabled = false; }
}

function renderRates() {
  const root = $('rates'); root.innerHTML = '';
  if (!state.rates.length) { root.innerHTML = '<div class="empty">Aucun tarif chargé.</div>'; return; }
  for (const rate of state.rates) {
    const div = document.createElement('div');
    div.className = `rate ${state.selectedRate?.id === rate.id ? 'selected' : ''}`;
    div.tabIndex = 0;
    div.innerHTML = `<div><div class="rate-name">${rate.carrier} ${rate.service || ''}</div><div class="rate-sub">${rate.deliverySpeed || ''}${rate.insuranceIncluded ? ' • assurance incluse' : ''}</div></div><div class="rate-price">${fmtUSD(rate.rateUsd)}</div>`;
    const select = () => { state.selectedRate = rate; renderRates(); $('manualShippingUsd').value = ''; saveState(); };
    div.addEventListener('click', select);
    div.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
    root.appendChild(div);
  }
}

async function loadRates() {
  $('ratesBtn').disabled = true;
  $('rates').innerHTML = '<div class="empty">Recherche des tarifs DHL / FedEx…</div>';
  try {
    const payload = {
      warehouseId: $('warehouse').value,
      city: 'Antananarivo', postalcode: '101',
      weight: number('weightLb'), length: number('lengthIn'), width: number('widthIn'), height: number('heightIn'),
      value: number('declaredValue', number('itemUsd'))
    };
    const data = await fetchJson(api('/api/planetexpress'), { method:'POST', body:JSON.stringify(payload) }, 22000);
    state.rates = (data.carriers || []).filter((c) => ['DHL','FedEx'].includes(c.carrier));
    state.selectedRate = state.rates.find((c) => c.carrier === 'DHL') || state.rates[0] || null;
    renderRates();
    $('billableSummary').textContent = `${data.billableWeightLb} lb`;
  } catch (error) {
    state.rates = []; state.selectedRate = null; renderRates();
    $('rates').innerHTML = `<div class="empty">Tarifs live indisponibles : ${escapeHtml(error.message)}. Vous pouvez saisir le transport manuellement.</div>`;
  } finally { $('ratesBtn').disabled = false; saveState(); }
}

function marginRate(itemUsd) { return itemUsd <= 350 ? .30 : itemUsd <= 900 ? .25 : .15; }
function localQuote() {
  const cfg = state.config || getPublicConfigFallback();
  const item = Math.max(0, number('itemUsd'));
  const domestic = Math.max(0, number('domesticUsd'));
  const shipping = number('manualShippingUsd') > 0 ? number('manualShippingUsd') : Number(state.selectedRate?.rateUsd || 0);
  if (!shipping) throw new Error('Chargez un tarif Planet Express ou saisissez le transport manuel.');
  const rate = number('visaRate'); if (rate < 1000) throw new Error('Saisissez le taux VISA USD → MGA.');
  const peFees = Math.max(0, number('peFeesUsd'));
  const purchaseMga = (item + domestic) * rate;
  const freightMga = (shipping + peFees) * rate;
  const card = (x) => Math.round(x * (cfg.cardFeePercent / 100) + cfg.cardFixedMga);
  const tier = marginRate(item);
  const floor350 = 350 * rate * .30;
  const floor900 = 900 * rate * .25;
  const continuity = item > 900 ? floor900 : item > 350 ? floor350 : 0;
  const service = Math.round(Math.max((item + domestic) * rate * tier, cfg.minimumServiceFeeMga, continuity));
  const customs = Math.max(0, number('customsReserve'));
  const local = Math.max(0, number('localDelivery'));
  const purchaseCard = card(purchaseMga), freightCard = card(freightMga);
  const total = Math.round(purchaseMga + freightMga + purchaseCard + freightCard + customs + local + service);
  return { itemUsd:item, domesticShippingUsd:domestic, purchaseMga:Math.round(purchaseMga), internationalShippingUsd:shipping, planetExpressFeesUsd:peFees, freightMga:Math.round(freightMga), purchaseCardFeeMga:purchaseCard, freightCardFeeMga:freightCard, customsReserveMga:customs, localDeliveryMga:local, serviceFeeMga:service, serviceRate:tier, visaRate:rate, totalMga:total };
}

function renderQuote(q) {
  state.lastQuote = q;
  $('grandTotal').textContent = fmtMGA(q.totalMga);
  $('tierLabel').textContent = `Barème eVidy : ${Math.round(q.serviceRate * 100)} % • minimum 75 000 Ar • taux VISA ${Number(q.visaRate).toFixed(2)}`;
  const rows = $('breakdown').children;
  rows[0].querySelector('strong').textContent = fmtMGA(q.purchaseMga);
  rows[1].querySelector('strong').textContent = `${fmtMGA(q.freightMga)} (${fmtUSD(q.internationalShippingUsd)})`;
  rows[2].querySelector('strong').textContent = fmtMGA(q.purchaseCardFeeMga + q.freightCardFeeMga);
  rows[3].querySelector('strong').textContent = fmtMGA(q.customsReserveMga);
  rows[4].querySelector('strong').textContent = fmtMGA(q.localDeliveryMga);
  rows[5].querySelector('strong').textContent = fmtMGA(q.serviceFeeMga);
  $('copyBtn').disabled = false;
  $('grandTotal').classList.remove('flash'); requestAnimationFrame(() => $('grandTotal').classList.add('flash'));
  saveState();
}

function calculate() {
  try { renderQuote(localQuote()); }
  catch (error) { $('grandTotal').textContent = '—'; $('tierLabel').textContent = error.message; $('copyBtn').disabled = true; }
}

async function copyQuote() {
  if (!state.lastQuote) return;
  const q = state.lastQuote;
  const title = $('productTitle').value.trim() || 'Article';
  const transportName = state.selectedRate ? `${state.selectedRate.carrier} ${state.selectedRate.service}` : 'Transport international';
  const text = [
    `DEVIS eVidy US`, title,
    `Prix article : ${fmtUSD(q.itemUsd)}`,
    `${transportName} : ${fmtUSD(q.internationalShippingUsd)}`,
    `Prix tout compris estimé : ${fmtMGA(q.totalMga)}`,
    `Livraison : Madagascar`,
    `Devis établi sur une estimation du colis avant réception chez Planet Express.`
  ].join('\n');
  try { await navigator.clipboard.writeText(text); $('copyBtn').textContent = 'Devis copié'; setTimeout(() => $('copyBtn').textContent = 'Copier le devis', 1600); }
  catch { $('copyBtn').textContent = 'Copie impossible'; setTimeout(() => $('copyBtn').textContent = 'Copier le devis', 1600); }
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function saveState() {
  const ids = ['productUrl','productTitle','itemUsd','domesticUsd','weightLb','lengthIn','widthIn','heightIn','warehouse','declaredValue','visaRate','customsReserve','localDelivery','peFeesUsd','manualShippingUsd'];
  const data = {}; ids.forEach((id) => data[id] = $(id)?.value ?? '');
  try { localStorage.setItem('evidy-v01', JSON.stringify(data)); } catch {}
}
function restoreState() {
  try { const data = JSON.parse(localStorage.getItem('evidy-v01') || '{}'); Object.entries(data).forEach(([id,v]) => { if ($(id)) $(id).value = v; }); } catch {}
}

$('analyzeBtn').addEventListener('click', analyzeProduct);
$('ratesBtn').addEventListener('click', loadRates);
$('visaBtn').addEventListener('click', refreshVisa);
$('calculateBtn').addEventListener('click', calculate);
$('copyBtn').addEventListener('click', copyQuote);
$('toggleAdvanced').addEventListener('click', () => { const a = $('advanced'); a.hidden = !a.hidden; $('toggleAdvanced').textContent = a.hidden ? 'Détails' : 'Masquer'; });
$('declaredValue').addEventListener('input', () => { $('declaredValue').dataset.touched = '1'; });
['itemUsd','domesticUsd','weightLb','lengthIn','widthIn','heightIn','warehouse','declaredValue','visaRate','customsReserve','localDelivery','peFeesUsd','manualShippingUsd'].forEach((id) => $(id).addEventListener('input', updatePackageSummary));

restoreState();
await loadConfig();
updatePackageSummary();
await health();
if (!$('visaRate').value) refreshVisa();
