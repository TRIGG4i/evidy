import dns from 'node:dns/promises';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CONFIG } from './config.mjs';

const execFileAsync = promisify(execFile);
const CACHE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const CACHE_FILE = path.join(CACHE_DIR, 'product-cache.json');

const privateIp = (ip) => {
  if (net.isIP(ip) === 4) {
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || p[0] === 0;
  }
  if (net.isIP(ip) === 6) return ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:');
  return true;
};

const assertPublicUrl = async (raw) => {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('URL non HTTP(S)');
  if (!url.hostname || url.username || url.password) throw new Error('URL invalide');
  const records = await dns.lookup(url.hostname, { all: true });
  if (!records.length || records.some((r) => privateIp(r.address))) throw new Error('Adresse réseau privée refusée');
  return url;
};

const decode = (s = '') => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const meta = (html, key) => {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i')
  ];
  for (const pattern of patterns) { const m = html.match(pattern); if (m) return decode(m[1]); }
  return '';
};


const stripTags = (html = '') => decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));

const ebayItemId = (raw = '') => {
  try {
    const u = new URL(raw);
    const pathMatch = u.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})/i);
    if (pathMatch) return pathMatch[1];
    const q = u.searchParams.get('item') || u.searchParams.get('itemid');
    if (/^\d{9,15}$/.test(q || '')) return q;
  } catch {}
  return String(raw).match(/(?:\/itm\/(?:[^/]+\/)?|item(?:id)?[=%])(\d{9,15})/i)?.[1] || null;
};

const amazonAsin = (raw = '') => {
  try {
    const u = new URL(raw);
    const m = u.pathname.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
    if (m) return m[1].toUpperCase();
  } catch {}
  return String(raw).match(/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase() || null;
};

const AMAZON_US_FETCH_SCRIPT = String.raw`
import sys,re,json,html,requests
url=sys.argv[1]; zipcode=sys.argv[2] if len(sys.argv)>2 else "97062"
ua="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
h={"User-Agent":ua,"Accept-Language":"en-US,en;q=0.9"}
s=requests.Session()
r=s.get(url,headers=h,timeout=15)
text=r.text
m=re.search(r'id="nav-global-location-data-modal-action"[^>]*data-a-modal=([\'\"])(.*?)\1',text,re.I|re.S)
if m:
    try:
        data=json.loads(html.unescape(m.group(2)))
        token=data.get("ajaxHeaders",{}).get("anti-csrftoken-a2z")
        if token:
            hh=dict(h);hh.update({"anti-csrftoken-a2z":token,"X-Requested-With":"XMLHttpRequest","Origin":"https://www.amazon.com","Referer":url})
            payload={"locationType":"LOCATION_INPUT","zipCode":zipcode,"storeContext":"generic","deviceType":"web","pageType":"Detail","actionSource":"glow","almBrandId":"undefined"}
            s.post("https://www.amazon.com/gp/delivery/ajax/address-change.html",headers=hh,data=payload,timeout=15)
    except Exception:
        pass
r=s.get(url,headers=h,timeout=15)
sys.stdout.write(r.text)
`;

const fetchAmazonUsHtml = async (rawUrl, zipCode = '97062') => {
  try {
    const { stdout } = await execFileAsync('/usr/bin/python3', ['-c', AMAZON_US_FETCH_SCRIPT, rawUrl, zipCode], { maxBuffer: 4_000_000, timeout: 42000 });
    const html = String(stdout || '');
    return html.includes('productTitle') ? html.slice(0, 3_500_000) : null;
  } catch {
    return null;
  }
};

const parseShippingUsd = (text = '') => {
  const plain = stripTags(String(text));
  if (/\b(?:free shipping|free delivery|shipping\s*[:\-]?\s*free)\b/i.test(plain)) return 0;
  const patterns = [
    /(?:shipping|delivery)[^$0-9]{0,35}\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /\$\s*([0-9,]+(?:\.[0-9]{1,2})?)[^A-Za-z0-9]{0,12}(?:shipping|delivery)/i,
    /\+\s*\$\s*([0-9,]+(?:\.[0-9]{1,2})?)[^A-Za-z0-9]{0,12}(?:shipping|delivery)/i
  ];
  for (const pattern of patterns) {
    const m = plain.match(pattern);
    if (m) return Number(m[1].replace(/,/g, ''));
  }
  return null;
};

const parseAmazonTitle = (html = '') => decode(
  html.match(/<span[^>]+id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ||
  meta(html, 'og:title') ||
  html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''
).replace(/\s*:\s*Amazon\.com.*$/i, '').trim();

const parseAmazonShippingUsd = (html = '') => {
  for (const marker of ['id="deliveryBlock_feature_div"', 'id="deliveryBlockMessage"', 'id="mir-layout-DELIVERY_BLOCK"']) {
    const at = html.indexOf(marker);
    if (at >= 0) {
      const block = html.slice(at, at + 26000);
      const attr = block.match(/data-csa-c-delivery-price=["']([^"']+)["']/i)?.[1] || '';
      if (/free/i.test(attr)) return 0;
      const attrPrice = attr.match(/\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/);
      if (attrPrice) return Number(attrPrice[1].replace(/,/g, ''));
      const parsed = parseShippingUsd(block);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const parseAmazonPrice = (html = '') => {
  for (const marker of ['id="corePrice_feature_div"', 'id="corePrice_desktop"', 'id="priceInsideBuyBox_feature_div"', 'id="apex_desktop"']) {
    const at = html.indexOf(marker);
    if (at >= 0) {
      const block = html.slice(at, at + 30000);
      const m = block.match(/class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/i)
        || block.match(/\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
      if (m) {
        const value = Number(m[1].replace(/,/g, ''));
        if (Number.isFinite(value) && value > 0) return value;
      }
    }
  }
  const patterns = [
    /id=["']priceblock_[^"']+["'][^>]*>[^$]{0,30}\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /["']priceAmount["']\s*:\s*["']?([0-9]+(?:\.[0-9]+)?)/i,
    /["']price["']\s*:\s*["']\$?([0-9]+(?:\.[0-9]+)?)/i
  ];
  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m) {
      const value = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  const fallback = parsePrice(html);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
};


const readProductCache = async () => {
  try { return JSON.parse(await readFile(CACHE_FILE, 'utf8')); } catch { return {}; }
};
const cachedEbayItem = async (itemId) => {
  const cache = await readProductCache();
  const entry = cache[itemId];
  if (!entry?.title) return null;
  const age = Date.now() - Number(entry.cachedAt || 0);
  if (age > 7 * 24 * 3600 * 1000) return null;
  return { ...entry, source: 'search-index-cache', warning: 'eBay bloque la lecture directe. Le produit a été reconnu via notre cache/index web ; vérifie le prix affiché sur eBay.' };
};
const cacheEbayItem = async (itemId, entry) => {
  if (!itemId || !entry?.title) return;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const cache = await readProductCache();
    const previous = cache[itemId] || {};
    const nextPrice = entry.priceUsd != null && Number(entry.priceUsd) > 0 ? Number(entry.priceUsd) : (previous.priceUsd ?? null);
    const nextShipping = entry.shippingUsd != null && Number.isFinite(Number(entry.shippingUsd)) ? Number(entry.shippingUsd) : (previous.shippingUsd ?? null);
    cache[itemId] = { title: entry.title || previous.title, priceUsd: nextPrice, shippingUsd: nextShipping, platform: entry.platform || previous.platform || 'ebay', description: entry.description || previous.description || '', url: entry.url || previous.url, cachedAt: Date.now() };
    await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {}
};

const fetchEbaySearchIndex = async (itemId) => {
  if (!itemId) return null;
  const hrefNeedle = `https://www.ebay.com/itm/${itemId}`;
  const queries = [
    `"${itemId}" ebay`,
    `${itemId} site:ebay.com`,
    itemId,
    `"${hrefNeedle}"`
  ];

  for (const query of queries) {
    try {
      const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
      const { stdout } = await execFileAsync('/usr/bin/curl', [
        '-fsSL', '--max-time', '22',
        '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        '-H', 'Accept-Language: en-US,en;q=0.9',
        searchUrl
      ], { maxBuffer: 2_000_000 });
      const html = String(stdout).slice(0, 1_500_000);
      let cursor = 0;
      while (cursor < html.length) {
        const hit = html.indexOf(hrefNeedle, cursor);
        if (hit < 0) break;
        cursor = hit + hrefNeedle.length;
        const start = Math.max(0, html.lastIndexOf('<div class="snippet', hit));
        const next = html.indexOf('<div class="snippet', hit + hrefNeedle.length);
        const block = html.slice(start, next > hit ? next : Math.min(html.length, hit + 14000));
        const title = decode(
          block.match(/class="title search-snippet-title[^>]*"[^>]*title="([^"]+)"/i)?.[1] ||
          stripTags(block.match(/class="title search-snippet-title[\s\S]*?<\/div>/i)?.[0] || '')
        ).replace(/\s*\|\s*eBay\s*$/i, '');
        if (!title || /Brave Search|Error Page/i.test(title)) continue;
        const priceMatch = block.match(/<strong>Price:<\/strong>[\s\S]{0,300}?\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/i)
          || block.match(/US\s*\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/i)
          || block.match(/\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
        const priceUsd = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : null;
        const shippingUsd = parseShippingUsd(block);
        const review = block.match(/class="product-review[^>]*>([\s\S]*?)<div class="item-attributes/i)?.[1] || '';
        return {
          title,
          priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
          shippingUsd: Number.isFinite(shippingUsd) ? shippingUsd : null,
          platform: 'ebay',
          description: stripTags(review).slice(0, 1400),
          url: hrefNeedle,
          source: 'search-index',
          warning: 'eBay bloque la lecture directe. Le produit a été reconnu via un index web ; le prix détecté doit être vérifié sur la fiche eBay.'
        };
      }
    } catch {}
  }
  return null;
};

export const fetchProductSpecIndex = async (title) => {
  const clean = String(title || '').replace(/\s+/g, ' ').replace(/\([^)]*\)/g, ' ').trim().slice(0, 120);
  if (clean.length < 8) return null;
  const queries = [`"${clean}" weight dimensions`, `${clean} specs weight dimensions`];
  const searchOne = async (query) => {
    try {
      const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
      const { stdout } = await execFileAsync('/usr/bin/curl', [
        '-fsSL','--max-time','8','-A','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36','-H','Accept-Language: en-US,en;q=0.9',searchUrl
      ], { maxBuffer: 2_000_000 });
      const plain = stripTags(String(stdout).slice(0,1_500_000));
      const physical = extractPhysical(plain);
      if (physical.weightLb || physical.dimensionsIn) return { physical, text: plain.slice(0,12000), source:'spec-index' };
    } catch {}
    return null;
  };
  const candidates = await Promise.all(queries.map(searchOne));
  return candidates.find(Boolean) || null;
};

const firstNumber = (text) => {
  const m = String(text || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

const parsePrice = (html) => {
  const og = meta(html, 'product:price:amount');
  if (og && Number.isFinite(Number(og))) return Number(og);
  const patterns = [
    /"price"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)/i,
    /US\s*\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/
  ];
  for (const p of patterns) { const m = html.match(p); if (m) return Number(m[1].replace(/,/g, '')); }
  return null;
};

const weightToLb = (value, unit) => {
  const v = Number(value), u = String(unit || '').toLowerCase();
  if (!Number.isFinite(v)) return null;
  if (u.startsWith('kg')) return v * 2.2046226218;
  if (u === 'g' || u.startsWith('gram')) return v / 453.59237;
  if (u.startsWith('oz')) return v / 16;
  return v;
};

const lengthToIn = (value, unit) => {
  const v = Number(value), u = String(unit || '').toLowerCase();
  if (!Number.isFinite(v)) return null;
  if (u === 'mm' || u.startsWith('millimeter')) return v / 25.4;
  if (u === 'cm' || u.startsWith('centimeter')) return v / 2.54;
  return v;
};

const extractPhysical = (text) => {
  const plain = String(text || '').replace(/\s+/g, ' ');
  let weightLb = null, weightKind = null;

  const weightPatterns = [
    { kind: 'package', re: /(?:package|shipping)\s*weight[^0-9]{0,30}([0-9.]+)\s*(lb|lbs|pounds|oz|ounces|kg|kilograms|g|grams)\b(?:\s*\+\s*([0-9.]+)\s*(lb|lbs|pounds|oz|ounces|kg|kilograms|g|grams)\b)?/i },
    { kind: 'item', re: /(?:net|item|product)?\s*weight[^0-9]{0,30}([0-9.]+)\s*(lb|lbs|pounds|oz|ounces|kg|kilograms|g|grams)\b(?:\s*\+\s*([0-9.]+)\s*(lb|lbs|pounds|oz|ounces|kg|kilograms|g|grams)\b)?/i },
    { kind: 'item', re: /([0-9.]+)\s*(lb|lbs|pounds|oz|ounces|kg|kilograms|g|grams)\b(?:\s*[+±]\s*([0-9.]+)\s*(lb|lbs|pounds|oz|ounces|kg|kilograms|g|grams)\b)?[^0-9]{0,35}(?:net\s*)?weight\b/i }
  ];
  for (const { kind, re } of weightPatterns) {
    const m = plain.match(re); if (!m) continue;
    const first = weightToLb(m[1], m[2]);
    const second = m[3] ? weightToLb(m[3], m[4]) : 0;
    if (Number.isFinite(first)) {
      weightLb = first + (Number.isFinite(second) ? second : 0);
      weightKind = kind;
      break;
    }
  }

  let dimensionsIn = null, dimensionsKind = null;
  const dimPatterns = [
    { kind: 'package', re: /(?:package|shipping)\s*dimensions?[^0-9]{0,45}([0-9.]+)\s*(mm|cm|in|inch|inches)?\s*[x×]\s*([0-9.]+)\s*(mm|cm|in|inch|inches)?\s*[x×]\s*([0-9.]+)\s*(mm|cm|in|inch|inches)?\b/i },
    { kind: 'item', re: /(?:product|item|overall)?\s*dimensions?[^0-9]{0,45}([0-9.]+)\s*(mm|cm|in|inch|inches)?\s*[x×*]\s*([0-9.]+)\s*(mm|cm|in|inch|inches)?\s*[x×*]\s*([0-9.]+)\s*(mm|cm|in|inch|inches)?\b/i },
    { kind: 'item', re: /([0-9.]+)\s*(mm|cm|in|inch|inches)?\s*[x×*]\s*([0-9.]+)\s*(mm|cm|in|inch|inches)?\s*[x×*]\s*([0-9.]+)\s*(mm|cm|in|inch|inches)?[^0-9]{0,35}dimensions?\b/i }
  ];
  for (const { kind, re } of dimPatterns) {
    const m = plain.match(re); if (!m) continue;
    const fallbackUnit = m[6] || m[4] || m[2] || 'in';
    const l = lengthToIn(m[1], m[2] || fallbackUnit);
    const w = lengthToIn(m[3], m[4] || fallbackUnit);
    const h = lengthToIn(m[5], m[6] || fallbackUnit);
    if ([l,w,h].every(Number.isFinite)) {
      dimensionsIn = { length:l, width:w, height:h };
      dimensionsKind = kind;
      break;
    }
  }
  return { weightLb, dimensionsIn, weightKind, dimensionsKind };
};

export const parsePhysicalSpecs = extractPhysical;

export const detectShippingFlags = (title, description='') => {
  const text = `${title || ''} ${description || ''}`;
  const battery = /\b(battery|batteries|lithium|li-ion|lifepo4|power\s*station|power\s*bank|portable\s*power)\b/i.test(text);
  const whMatches = [...text.matchAll(/\b([0-9]{2,5}(?:\.[0-9]+)?)\s*W\s*h\b/ig)].map(m=>Number(m[1])).filter(Number.isFinite);
  const batteryWh = whMatches.length ? Math.max(...whMatches) : null;
  const largeBattery = battery && Number.isFinite(batteryWh) && batteryWh >= 100;
  return { battery, batteryWh, largeBattery };
};

const HS_RULES = [
  { code:'85287200', confidence:.97, label:'Téléviseur couleur', re:/\b(tv|television|oled tv|qled tv|smart tv)\b/i },
  { code:'85258000', confidence:.96, label:'Caméra / appareil photo numérique', re:/\b(camera|camcorder|dashcam|dash cam|dslr|mirrorless)\b/i },
  { code:'85171300', confidence:.91, label:'Smartphone', re:/\b(iphone|smartphone|mobile phone|galaxy s\d|pixel \d)\b/i },
  { code:'84713000', confidence:.88, label:'Ordinateur portable / tablette', re:/\b(macbook|laptop|notebook computer|ipad|tablet)\b/i },
  { code:'85183000', confidence:.90, label:'Écouteurs / casque audio', re:/\b(airpods|earbuds|earphones|headphones|headset)\b/i },
  { code:'95045000', confidence:.90, label:'Console de jeux vidéo', re:/\b(playstation|xbox|nintendo switch|gaming console)\b/i },
  { code:'85285200', confidence:.82, label:'Moniteur informatique', re:/\b(computer monitor|gaming monitor|pc monitor)\b/i },
  { code:'85076000', confidence:.68, label:'Batterie lithium-ion / station d’énergie portable', re:/\b(portable power station|solar generator|lifepo4 power station|ecoflow delta|jackery explorer|bluetti)\b/i },
  { code:'95045000', confidence:.74, label:'Contrôleur de jeu / volant de simulation', re:/\b(racing wheel|steering wheel controller|trueforce racing|sim racing wheel)\b/i },
  { code:'64039900', confidence:.72, label:'Chaussures', re:/\b(shoes|sneakers|trainers)\b/i }
];

const normalizeHsCode = (raw='') => {
  const digits=String(raw).replace(/\D/g,'');
  if(digits.length<6||digits.length>10)return null;
  const chapter=Number(digits.slice(0,2));
  if(chapter<1||chapter>97)return null;
  return digits.length>=8?digits.slice(0,8):digits.slice(0,6);
};

const fetchHsIndexCandidate = async (title) => {
  if(!title) return null;
  const queries=[`"${title}" "HS code"`,`"${title}" harmonized tariff code`];
  for(const query of queries){
    try{
      const searchUrl=`https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
      const {stdout}=await execFileAsync('/usr/bin/curl',['-fsSL','--max-time','16','-A','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36','-H','Accept-Language: en-US,en;q=0.9',searchUrl],{maxBuffer:1_500_000});
      const plain=stripTags(String(stdout).slice(0,1_200_000));
      const patterns=[
        /(?:HS|H\.S\.|HTS|Harmonized(?:\s+System)?)(?:\s+code|\s+number|\s+classification)?[^0-9]{0,45}([0-9]{4}[.\s-]?[0-9]{2}(?:[.\s-]?[0-9]{2,4})?)/ig,
        /(?:tariff code|commodity code)[^0-9]{0,45}([0-9]{4}[.\s-]?[0-9]{2}(?:[.\s-]?[0-9]{2,4})?)/ig
      ];
      const counts=new Map();
      for(const re of patterns){for(const m of plain.matchAll(re)){const code=normalizeHsCode(m[1]);if(code)counts.set(code,(counts.get(code)||0)+1)}}
      const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
      if(ranked.length){const [code,hits]=ranked[0];return{code,confidence:Math.min(.78,.56+hits*.06),label:'Classification web probable',source:'hs-search-index',evidenceCount:hits}}
    }catch{}
  }
  return null;
};

export const inferHsCode = async ({title='',description=''}) => {
  const text=`${title} ${description}`.trim();
  const rule=HS_RULES.find(r=>r.re.test(text));
  if(rule)return{code:rule.code,confidence:rule.confidence,label:rule.label,source:'rule'};
  return await fetchHsIndexCandidate(title);
};

const HEURISTICS = [
  { category: 'earbuds', re: /airpods|earbuds|earphones|wireless buds/i, weight: 1.5, dims: [8, 6, 4] },
  { category: 'smartphone', re: /iphone|smartphone|galaxy s\d|pixel \d|mobile phone/i, weight: 2.5, dims: [11, 9, 4] },
  { category: 'tablet', re: /ipad|tablet/i, weight: 4, dims: [14, 11, 4] },
  { category: 'laptop', re: /macbook|laptop|notebook computer/i, weight: 9, dims: [19, 14, 6] },
  { category: 'camera', re: /camera|dslr|mirrorless/i, weight: 6, dims: [15, 12, 8] },
  { category: 'console', re: /playstation|xbox|nintendo switch|gaming console/i, weight: 14, dims: [21, 16, 9] },
  { category: 'shoes', re: /shoes|sneakers|boots|trainers/i, weight: 5, dims: [16, 11, 7] },
  { category: 'clothing', re: /shirt|jacket|dress|jeans|hoodie|clothing/i, weight: 3, dims: [14, 11, 5] },
  { category: 'monitor', re: /monitor|display/i, weight: 25, dims: [31, 21, 9] },
  { category: 'television', re: /\btv\b|television|oled|qled/i, weight: 45, dims: [50, 32, 8] }
];

const heuristicEstimate = (title) => {
  const h = HEURISTICS.find((x) => x.re.test(title || '')) || { category: 'generic', weight: 5, dims: [15, 12, 7] };
  return { category: h.category, weightLb: h.weight, dimensionsIn: { length: h.dims[0], width: h.dims[1], height: h.dims[2] }, confidence: h.category === 'generic' ? 0.35 : 0.58, source: 'heuristic' };
};

const aiEstimate = async ({ title, description, extracted }) => {
  if (!CONFIG.ai.baseUrl || !CONFIG.ai.apiKey || !CONFIG.ai.model) return null;
  const url = `${CONFIG.ai.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const prompt = `Estimate a prudent retail shipping package for a USA parcel forwarder. Return ONLY JSON with category, weightLb, lengthIn, widthIn, heightIn, confidence (0..1), rationale. Prefer known packaged-product specs; never reduce values merely to lower shipping. Product title: ${title}\nExtracted data: ${JSON.stringify(extracted)}\nDescription excerpt: ${description.slice(0, 3000)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.ai.apiKey}` },
    body: JSON.stringify({ model: CONFIG.ai.model, temperature: 0.1, messages: [{ role: 'user', content: prompt }] })
  });
  if (!response.ok) return null;
  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content || '';
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const out = JSON.parse(match[0]);
    const w = Number(out.weightLb), l = Number(out.lengthIn), d = Number(out.widthIn), h = Number(out.heightIn), c = Number(out.confidence);
    if (![w,l,d,h,c].every(Number.isFinite) || w <= 0 || l <= 0 || d <= 0 || h <= 0 || c < 0 || c > 1) return null;
    return { category: String(out.category || 'unknown'), weightLb: w, dimensionsIn: { length:l, width:d, height:h }, confidence: Math.min(c, 0.85), source: 'ai', rationale: String(out.rationale || '') };
  } catch { return null; }
};

export const analyzeProductUrl = async (rawUrl) => {
  const url = await assertPublicUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response = null;
  let directError = null;
  try {
    response = await fetch(url, {
      redirect: 'follow', signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
  } catch (error) {
    directError = error;
  } finally { clearTimeout(timer); }

  const finalUrl = response?.url || url.toString();
  const finalHost = (() => { try { return new URL(finalUrl).hostname; } catch { return url.hostname; } })();
  const itemId = ebayItemId(finalUrl) || ebayItemId(url.toString());
  const asin = amazonAsin(finalUrl) || amazonAsin(url.toString());
  const isAmazon = /(^|\.)amazon\.com$/i.test(finalHost) || Boolean(asin);

  let title = '', description = '', priceUsd = null, shippingUsd = null, physical = { weightLb: null, dimensionsIn: null };
  let source = 'page', warning = null, platform = isAmazon ? 'amazon' : (itemId ? 'ebay' : 'web');

  if (response?.ok && (response.headers.get('content-type') || '').includes('text/html')) {
    let html = (await response.text()).slice(0, 2_000_000);
    if (isAmazon) {
      const localized = await fetchAmazonUsHtml(url.toString(), '97062');
      if (localized) html = localized;
    }
    const plain = stripTags(html);
    title = isAmazon ? parseAmazonTitle(html) : (meta(html, 'og:title') || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ? decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)[1]) : ''));
    description = meta(html, 'og:description') || meta(html, 'description') || plain.slice(0, 5000);
    priceUsd = isAmazon ? parseAmazonPrice(html) : parsePrice(html);
    shippingUsd = isAmazon ? parseAmazonShippingUsd(html) : parseShippingUsd(plain);
    physical = extractPhysical(plain);
  } else if (/ebay\./i.test(finalHost) || itemId) {
    const cached = await cachedEbayItem(itemId);
    const fresh = (!cached || cached.shippingUsd == null) ? await fetchEbaySearchIndex(itemId) : null;
    const indexed = cached && fresh ? {
      ...cached,
      ...fresh,
      title: fresh.title || cached.title,
      description: fresh.description || cached.description,
      priceUsd: fresh.priceUsd != null && Number(fresh.priceUsd) > 0 ? Number(fresh.priceUsd) : cached.priceUsd,
      shippingUsd: fresh.shippingUsd != null && Number.isFinite(Number(fresh.shippingUsd)) ? Number(fresh.shippingUsd) : cached.shippingUsd,
      source: 'search-index'
    } : (fresh || cached);
    if (!indexed) throw new Error(`eBay bloque l’analyse directe${response ? ` (HTTP ${response.status})` : ''} et aucun index exploitable n’a été trouvé.`);
    if (indexed.source === 'search-index') await cacheEbayItem(itemId, indexed);
    title = indexed.title;
    description = indexed.description;
    priceUsd = indexed.priceUsd;
    shippingUsd = Number.isFinite(Number(indexed.shippingUsd)) ? Number(indexed.shippingUsd) : null;
    platform = 'ebay';
    source = indexed.source;
    warning = indexed.warning;
  } else if (isAmazon) {
    throw new Error(`Amazon bloque l’analyse directe${response ? ` (HTTP ${response.status})` : ''}. Le prix et la livraison peuvent être saisis manuellement.`);
  } else {
    if (response && !response.ok) throw new Error(`Page produit HTTP ${response.status}`);
    throw directError || new Error('Page produit inaccessible');
  }

  if (isAmazon && source === 'page' && !(Number.isFinite(priceUsd) && priceUsd > 0)) {
    warning = 'Amazon a été reconnu, mais le prix ou la livraison n’est pas visible depuis le serveur. Vérifie ou complète le prix manuellement.';
  }

  let specIndex = null;
  if (title && (!physical.weightLb || !physical.dimensionsIn)) {
    specIndex = await fetchProductSpecIndex(title);
    if (specIndex?.physical?.weightLb && !physical.weightLb) { physical.weightLb = specIndex.physical.weightLb; physical.weightKind = specIndex.physical.weightKind || 'item'; }
    if (specIndex?.physical?.dimensionsIn && !physical.dimensionsIn) { physical.dimensionsIn = specIndex.physical.dimensionsIn; physical.dimensionsKind = specIndex.physical.dimensionsKind || 'item'; }
  }

  let estimate;
  const physicalVolume = physical.dimensionsIn ? physical.dimensionsIn.length * physical.dimensionsIn.width * physical.dimensionsIn.height : 0;
  const implausiblyTinyPackage = physicalVolume > 0 && physicalVolume < 20;
  const packedWeight = physical.weightLb ? (physical.weightKind === 'package' ? physical.weightLb : physical.weightLb * 1.08 + 0.5) : null;
  const packedDimensions = physical.dimensionsIn && !implausiblyTinyPackage ? (
    physical.dimensionsKind === 'package' ? physical.dimensionsIn : {
      length: physical.dimensionsIn.length + 2,
      width: physical.dimensionsIn.width + 2,
      height: physical.dimensionsIn.height + 2
    }
  ) : null;
  if (packedWeight && packedDimensions) {
    const exactPackage = physical.weightKind === 'package' && physical.dimensionsKind === 'package';
    estimate = { category: heuristicEstimate(title).category, weightLb: packedWeight, dimensionsIn: packedDimensions, confidence: exactPackage ? 0.95 : 0.80, source: exactPackage ? 'page-package-specs' : 'page-item-specs+packing-reserve' };
  } else {
    const ai = await aiEstimate({ title, description, extracted: physical });
    estimate = ai || heuristicEstimate(title);
    if (packedWeight) { estimate.weightLb = packedWeight; estimate.confidence = Math.max(estimate.confidence, physical.weightKind === 'package' ? 0.86 : 0.74); estimate.source = `${estimate.source}+${physical.weightKind === 'package' ? 'package-weight' : 'item-weight-reserve'}`; }
    if (packedDimensions) { estimate.dimensionsIn = packedDimensions; estimate.confidence = Math.max(estimate.confidence, physical.dimensionsKind === 'package' ? 0.86 : 0.74); estimate.source = `${estimate.source}+${physical.dimensionsKind === 'package' ? 'package-dimensions' : 'item-dimensions-reserve'}`; }
    if (source === 'search-index' && estimate.source === 'heuristic') estimate.source = 'search-index+heuristic';
  }

  const hsClassification = await inferHsCode({ title, description: `${description} ${specIndex?.text || ''}` });

  return {
    url: finalUrl,
    hostname: finalHost,
    source,
    warning,
    platform,
    title,
    description: description.slice(0, 900),
    priceUsd,
    shippingUsd,
    totalPurchaseUsd: Number.isFinite(priceUsd) && priceUsd > 0 ? Number((priceUsd + (Number.isFinite(shippingUsd) ? shippingUsd : 0)).toFixed(2)) : null,
    shippingReliability: Number.isFinite(shippingUsd) ? (source === 'page' ? 'direct' : 'indexed-verify') : 'unknown',
    priceReliability: Number.isFinite(priceUsd) && priceUsd > 0 ? (source === 'page' ? 'direct' : 'indexed-verify') : 'unknown',
    extracted: physical,
    packageEstimate: estimate,
    specSource: specIndex?.source || null,
    shippingFlags: detectShippingFlags(title, `${description} ${specIndex?.text || ''}`),
    hsClassification,
    analyzedAt: new Date().toISOString()
  };
};
