import test from 'node:test';
import assert from 'node:assert/strict';
import { inferHsCode } from '../server/lib/product-analyzer.mjs';

test('DHL historical categories map to the observed HS codes', async () => {
  const tv=await inferHsCode({title:'65 inch Smart OLED TV'});
  const camera=await inferHsCode({title:'4K dash camera'});
  assert.equal(tv.code,'85287200');
  assert.equal(camera.code,'85258000');
  assert.ok(tv.confidence>=0.95 && camera.confidence>=0.95);
});

test('common electronics receive a probable HS code', async () => {
  assert.equal((await inferHsCode({title:'Apple iPhone 14 Pro Max'})).code,'85171300');
  assert.equal((await inferHsCode({title:'Sony PlayStation 5 gaming console'})).code,'95045000');
});
