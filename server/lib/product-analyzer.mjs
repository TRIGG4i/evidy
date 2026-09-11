import dns from 'node:dns/promises';
import net from 'node:net';
import { CONFIG } from './config.mjs';

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

const extractPhysical = (text) => {
  const weightPatterns = [
    /(?:package|shipping|item)\s*weight[^0-9]{0,30}([0-9.]+)\s*(lb|lbs|pounds|oz|ounces|kg|kilograms|g|grams)\b/i,
    /weight[^0-9]{0,20}([0-9.]+)\s*(lb|lbs|pounds|oz|kg|g)\b/i
  ];
  let weightLb = null;
  for (const p of weightPatterns) {
    const m = text.match(p); if (!m) continue;
    const v = Number(m[1]); const u = m[2].toLowerCase();
    weightLb = u.startsWith('kg') ? v * 2.20462 : u === 'g' || u.startsWith('gram') ? v / 453.592 : u.startsWith('oz') ? v / 16 : v;
    break;
  }
  const d = text.match(/(?:package|shipping)?\s*dimensions?[^0-9]{0,40}([0-9.]+)\s*[x×]\s*([0-9.]+)\s*[x×]\s*([0-9.]+)\s*(in|inch|inches|cm|centimeters?)\b/i);
  let dimensionsIn = null;
  if (d) {
    const factor = d[4].toLowerCase().startsWith('cm') ? 1 / 2.54 : 1;
    dimensionsIn = { length: Number(d[1]) * factor, width: Number(d[2]) * factor, height: Number(d[3]) * factor };
  }
  return { weightLb, dimensionsIn };
};

const HEURISTICS = [
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
  let response;
  try {
    response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' } });
  } finally { clearTimeout(timer); }
  if (!response.ok) throw new Error(`Page produit HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) throw new Error('La page produit n’est pas HTML');
  const html = (await response.text()).slice(0, 2_000_000);
  const plain = decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  const title = meta(html, 'og:title') || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ? decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)[1]) : '');
  const description = meta(html, 'og:description') || meta(html, 'description') || plain.slice(0, 5000);
  const priceUsd = parsePrice(html);
  const physical = extractPhysical(plain);

  let estimate;
  if (physical.weightLb && physical.dimensionsIn) {
    estimate = { category: heuristicEstimate(title).category, weightLb: physical.weightLb, dimensionsIn: physical.dimensionsIn, confidence: 0.95, source: 'page' };
  } else {
    const ai = await aiEstimate({ title, description, extracted: physical });
    estimate = ai || heuristicEstimate(title);
    if (physical.weightLb) { estimate.weightLb = physical.weightLb; estimate.confidence = Math.max(estimate.confidence, 0.72); estimate.source = `${estimate.source}+page-weight`; }
    if (physical.dimensionsIn) { estimate.dimensionsIn = physical.dimensionsIn; estimate.confidence = Math.max(estimate.confidence, 0.72); estimate.source = `${estimate.source}+page-dimensions`; }
  }

  return {
    url: response.url,
    hostname: new URL(response.url).hostname,
    title,
    description: description.slice(0, 900),
    priceUsd,
    extracted: physical,
    packageEstimate: estimate,
    analyzedAt: new Date().toISOString()
  };
};
