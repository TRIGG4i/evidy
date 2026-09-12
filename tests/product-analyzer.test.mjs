import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePhysicalSpecs } from '../server/lib/product-analyzer.mjs';

test('parses metric net weight with additive component and millimeter dimensions', () => {
  const p = parsePhysicalSpecs('Net Weight 12.1kg+0.3kg Dimensions 398mm×200mm×283mm Rated Capacity 1024Wh');
  assert.ok(Math.abs(p.weightLb - 27.3373) < 0.01);
  assert.equal(p.weightKind, 'item');
  assert.equal(p.dimensionsKind, 'item');
  assert.ok(Math.abs(p.dimensionsIn.length - 15.6693) < 0.01);
  assert.ok(Math.abs(p.dimensionsIn.width - 7.8740) < 0.01);
  assert.ok(Math.abs(p.dimensionsIn.height - 11.1417) < 0.01);
});
