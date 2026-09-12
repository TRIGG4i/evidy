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


test('non-tech retail categories are classified internally', async () => {
  const cases = [
    ['100% cotton t-shirt men', '610910'],
    ['women cotton jeans high waist', '620462'],
    ['memory foam mattress queen', '940421'],
    ['stainless steel cookware set', '732393'],
    ['face moisturizer skincare serum', '330499'],
    ['cordless drill 20V', '846721'],
    ['hardcover printed book', '490199'],
    ['baby stroller lightweight', '871500']
  ];
  for (const [title, expected] of cases) {
    const hs = await inferHsCode({ title });
    assert.equal(hs?.code, expected, title);
  }
});
