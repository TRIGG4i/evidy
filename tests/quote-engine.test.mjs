import test from 'node:test';
import assert from 'node:assert/strict';
import { computeServiceFeeMga, marginRateForItemUsd, quote } from '../server/lib/quote-engine.mjs';

const rate = 4300;

test('margin tiers are correct', () => {
  assert.equal(marginRateForItemUsd(350), .30);
  assert.equal(marginRateForItemUsd(351), .25);
  assert.equal(marginRateForItemUsd(900), .25);
  assert.equal(marginRateForItemUsd(901), .15);
});

test('service fee never drops at tier boundaries', () => {
  const a = computeServiceFeeMga({ itemUsd:350, visaRate:rate }).feeMga;
  const b = computeServiceFeeMga({ itemUsd:351, visaRate:rate }).feeMga;
  const c = computeServiceFeeMga({ itemUsd:900, visaRate:rate }).feeMga;
  const d = computeServiceFeeMga({ itemUsd:901, visaRate:rate }).feeMga;
  assert.ok(b >= a, `${b} should be >= ${a}`);
  assert.ok(d >= c, `${d} should be >= ${c}`);
});

test('75k MGA minimum applies to very small purchases', () => {
  assert.equal(computeServiceFeeMga({ itemUsd:10, visaRate:rate }).feeMga, 75000);
});

test('quote is deterministic and includes two card transactions', () => {
  const q = quote({ itemUsd:551.99, domesticShippingUsd:0, internationalShippingUsd:138.65, planetExpressFeesUsd:5, visaRate:4300, customsReserveMga:200000, localDeliveryMga:0, cardFeePercent:3, cardFixedMga:4500 });
  assert.equal(q.serviceRate, .25);
  assert.ok(q.purchaseCardFeeMga > 4500);
  assert.ok(q.freightCardFeeMga > 4500);
  assert.equal(q.totalMga, q.costBeforeServiceMga + q.serviceFeeMga);
});
