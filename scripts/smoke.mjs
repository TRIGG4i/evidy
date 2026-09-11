const base = process.env.EVIDY_BASE || 'http://127.0.0.1:4280';
const health = await fetch(`${base}/healthz`).then((r) => r.json());
if (!health.ok) throw new Error('healthz failed');
const rates = await fetch(`${base}/api/planetexpress`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ warehouseId:'6', weight:2.5, length:11, width:9, height:4, value:129.99, city:'Antananarivo', postalcode:'101' }) }).then(async (r) => { if (!r.ok) throw new Error(await r.text()); return r.json(); });
const dhl = rates.carriers.find((c) => c.id === 5);
if (!dhl || Math.abs(dhl.rateUsd - 138.65) > .01) throw new Error(`Unexpected DHL rate ${dhl?.rateUsd}`);
console.log(JSON.stringify({ ok:true, api:health.version, dhl:dhl.rateUsd, billableWeightLb:rates.billableWeightLb }, null, 2));
