import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateConsolidation } from '../server/lib/consolidation-model.mjs';

test('calibrated consolidation returns one conservative international parcel', () => {
  const r=estimateConsolidation([
    {weight:1.3,length:8,width:5,height:3},
    {weight:.5,length:17,width:16,height:3},
    {weight:2.9,length:14,width:12,height:4}
  ]);
  assert.equal(r.packageCount,3);
  assert.ok(r.quote.billableWeightLb>=13);
  assert.ok(r.quote.billableWeightLb<20);
  assert.equal(r.calibrationSamples,4);
});

test('airy multi-box history allows repacking volume reduction', () => {
  const r=estimateConsolidation([
    {weight:.5,length:18,width:10,height:5},
    {weight:4.3,length:14,width:12,height:6},
    {weight:.8,length:12,width:9,height:3},
    {weight:.9,length:12,width:9,height:7}
  ]);
  assert.ok(r.quote.volumeRatio<0.6);
  assert.ok(r.quote.billableWeightLb<=10);
});

test('large battery flag survives consolidation modelling', () => {
  const r=estimateConsolidation([
    {weight:27,length:18,width:10,height:13,battery:true,largeBattery:true,batteryWh:1024},
    {weight:2,length:12,width:9,height:5}
  ]);
  assert.equal(r.hasBattery,true);
  assert.equal(r.largeBattery,true);
});
