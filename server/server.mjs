import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './lib/config.mjs';
import { getPlanetExpressRates } from './lib/planetexpress.mjs';
import { getVisaRate } from './lib/visa.mjs';
import { analyzeProductUrl } from './lib/product-analyzer.mjs';
import { quote } from './lib/quote-engine.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../web');
const buckets = new Map();

const json = (res, status, body, headers = {}) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(payload);
};

const cors = (req) => {
  const origin = req.headers.origin || '';
  const allowed = new Set([
    CONFIG.publicOrigin,
    `${CONFIG.publicOrigin}/`,
    'https://trigg4i.github.io',
    'http://localhost:4280',
    'http://127.0.0.1:4280'
  ]);
  return allowed.has(origin) ? origin : '';
};

const readBody = async (req, max = 65536) => {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw Object.assign(new Error('Requête trop volumineuse'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('JSON invalide'), { status: 400 }); }
};

const limited = (req) => {
  const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const current = buckets.get(ip) || { start: now, count: 0 };
  if (now - current.start > 60000) { current.start = now; current.count = 0; }
  current.count += 1; buckets.set(ip, current);
  return current.count > 90;
};

const apiHeaders = (req) => {
  const origin = cors(req);
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  } : {};
};

const serveStatic = async (req, res, pathname) => {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const target = path.resolve(webRoot, rel);
  if (!target.startsWith(webRoot + path.sep) && target !== path.join(webRoot, 'index.html')) return false;
  try {
    const s = await stat(target); if (!s.isFile()) return false;
    const ext = path.extname(target);
    const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8' };
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
    res.end(data); return true;
  } catch { return false; }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const headers = apiHeaders(req);

  if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
    res.writeHead(cors(req) ? 204 : 403, headers); res.end(); return;
  }
  if (url.pathname.startsWith('/api/') && req.headers.origin && !cors(req)) {
    json(res, 403, { error: 'Origin refusée' }); return;
  }
  if (url.pathname.startsWith('/api/') && limited(req)) {
    json(res, 429, { error: 'Trop de requêtes' }, headers); return;
  }

  try {
    if (req.method === 'GET' && url.pathname === '/healthz') {
      json(res, 200, { ok: true, service: 'evidy-api', version: '0.1.0', time: new Date().toISOString() }, headers); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/public-config') {
      json(res, 200, {
        cardFeePercent: CONFIG.cardFeePercent,
        cardFixedMga: CONFIG.cardFixedMga,
        visaBankFeePercent: CONFIG.visaBankFeePercent,
        customsReserve: CONFIG.customsReserve,
        localDeliveryMga: CONFIG.localDeliveryMga,
        marginTiers: [{ maxUsd:350, percent:30 }, { maxUsd:900, percent:25 }, { maxUsd:null, percent:15 }],
        minimumServiceFeeMga: 75000,
        warehouses: [{ id:'4', name:'Tualatin, OR' }, { id:'6', name:'Torrance, CA' }]
      }, headers); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/visa-rate') {
      const result = await getVisaRate({ from: url.searchParams.get('from') || 'USD', bankFee: Number(url.searchParams.get('bankFee') || CONFIG.visaBankFeePercent) });
      json(res, 200, result, headers); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/analyze') {
      const body = await readBody(req);
      if (!body.url) throw Object.assign(new Error('Lien produit requis'), { status: 400 });
      const result = await analyzeProductUrl(body.url);
      json(res, 200, result, headers); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/planetexpress') {
      const body = await readBody(req);
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 16000);
      try {
        const result = await getPlanetExpressRates({ ...body, signal: controller.signal });
        json(res, 200, result, headers);
      } finally { clearTimeout(timer); }
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/quote') {
      const body = await readBody(req);
      let shippingUsd = Number(body.internationalShippingUsd);
      let shipping = null;
      if (!Number.isFinite(shippingUsd) || shippingUsd <= 0) {
        const rates = await getPlanetExpressRates({ ...(body.package || {}), warehouseId: body.warehouseId || '4' });
        const wanted = Number(body.carrierId || 5);
        shipping = rates.carriers.find((c) => c.id === wanted) || rates.carriers[0];
        if (!shipping) throw new Error('Aucun transporteur disponible');
        shippingUsd = shipping.rateUsd;
      }
      const result = quote({ ...body, internationalShippingUsd: shippingUsd, cardFeePercent: CONFIG.cardFeePercent, cardFixedMga: CONFIG.cardFixedMga });
      json(res, 200, { ...result, shipping }, headers); return;
    }

    if (req.method === 'GET' && await serveStatic(req, res, url.pathname)) return;
    json(res, 404, { error: 'Introuvable' }, headers);
  } catch (error) {
    const status = Number(error.status) || (/AbortError/.test(error.name) ? 504 : 502);
    json(res, status, { error: error.message || 'Erreur', details: process.env.EVIDY_DEV ? error.details || null : undefined }, headers);
  }
});

server.listen(CONFIG.port, '127.0.0.1', () => {
  console.log(`eVidy API listening on http://127.0.0.1:${CONFIG.port}`);
});
