import test from 'node:test';
import assert from 'node:assert/strict';
import { billableWeightLb, getPlanetExpressRates } from '../server/lib/planetexpress.mjs';

test('Planet Express volumetric divisor reproduces known package', () => {
  assert.equal(billableWeightLb({ weight:79, length:65, width:40, height:7 }), 110);
  assert.equal(billableWeightLb({ weight:2.5, length:11, width:9, height:4 }), 3);
});

test('live Planet Express public calculator matches known small parcel', { skip: process.env.LIVE !== '1' }, async () => {
  const r = await getPlanetExpressRates({ warehouseId:'6', city:'Antananarivo', postalcode:'101', weight:2.5, length:11, width:9, height:4, value:129.99 });
  const dhl = r.carriers.find((c) => c.id === 5);
  assert.ok(dhl);
  assert.equal(dhl.rateUsd, 138.65);
});
