const DIVISOR = 166;

// Anonymous calibration set built from completed real-world consolidations.
// Only physical measurements are retained; no customer/package identifiers.
const HISTORY = [
  { input:[{l:8,w:5,h:3,weight:1.3},{l:17,w:16,h:3,weight:.5},{l:14,w:12,h:4,weight:2.9}], output:{l:18,w:14,h:8,weight:5.6} },
  { input:[{l:13,w:11,h:9,weight:8},{l:9,w:7,h:6,weight:1.8}], output:{l:13,w:13,h:11,weight:10.9} },
  { input:[{l:19,w:14,h:7,weight:5.1},{l:17,w:15,h:9,weight:9.3}], output:{l:19,w:16,h:14,weight:16.4} },
  { input:[{l:18,w:10,h:5,weight:.5},{l:14,w:12,h:6,weight:4.3},{l:12,w:9,h:3,weight:.8},{l:12,w:9,h:7,weight:.9}], output:{l:13,w:13,h:7,weight:6.3} }
];

const finitePositive = (v) => Number.isFinite(Number(v)) && Number(v) > 0;
const volume = (p) => Number(p.length ?? p.l) * Number(p.width ?? p.w) * Number(p.height ?? p.h);
const weight = (p) => Number(p.weight);
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
const round = (v,d=1) => Number(v.toFixed(d));

const features = (packages) => {
  const sumVolume = packages.reduce((s,p)=>s+volume(p),0);
  const sumWeight = packages.reduce((s,p)=>s+weight(p),0);
  const axes = packages.map(p=>[Number(p.length ?? p.l),Number(p.width ?? p.w),Number(p.height ?? p.h)].sort((a,b)=>b-a));
  return {
    sumVolume,
    sumWeight,
    density: sumWeight / Math.max(sumVolume,1),
    maxAxes:[0,1,2].map(i=>Math.max(...axes.map(a=>a[i])))
  };
};

const calibrated = HISTORY.map(sample => {
  const f = features(sample.input);
  return {
    density:f.density,
    volumeRatio:(sample.output.l*sample.output.w*sample.output.h)/f.sumVolume,
    weightRatio:sample.output.weight/f.sumWeight
  };
}).sort((a,b)=>a.density-b.density);

const interpolate = (density,key) => {
  if (density <= calibrated[0].density) return calibrated[0][key];
  if (density >= calibrated.at(-1).density) return calibrated.at(-1)[key];
  for(let i=1;i<calibrated.length;i++){
    const hi=calibrated[i],lo=calibrated[i-1];
    if(density<=hi.density){
      const t=(density-lo.density)/(hi.density-lo.density);
      return lo[key]+(hi[key]-lo[key])*t;
    }
  }
  return calibrated.at(-1)[key];
};

const scenario = (packages,safety=1) => {
  const f=features(packages);
  const baseRatio=interpolate(f.density,'volumeRatio');
  const volumeRatio=clamp(baseRatio*safety,.42,1.42);
  const targetVolume=f.sumVolume*volumeRatio;
  const airy=f.density<.0025 && packages.length>=3;
  const length=Math.max(4,airy?f.maxAxes[0]*.80:f.maxAxes[0]+1);
  const width=Math.max(4,f.maxAxes[1]*1.06);
  const height=Math.max(3,targetVolume/(length*width));
  const learnedWeight=interpolate(f.density,'weightRatio');
  const finalWeight=Math.max(f.sumWeight+.5,f.sumWeight*learnedWeight*1.03);
  const finalVolume=length*width*height;
  const billable=Math.ceil(Math.max(finalWeight,finalVolume/DIVISOR));
  return {
    weight:round(finalWeight,2), length:round(length,1), width:round(width,1), height:round(height,1),
    volumeIn3:round(finalVolume,0), billableWeightLb:billable, volumeRatio:round(volumeRatio,3), density:round(f.density,5)
  };
};

export const estimateConsolidation = (rawPackages=[]) => {
  const packages=rawPackages.map(p=>({
    weight:Number(p.weight),length:Number(p.length),width:Number(p.width),height:Number(p.height),battery:Boolean(p.battery),largeBattery:Boolean(p.largeBattery),batteryWh:Number(p.batteryWh)||null
  })).filter(p=>[p.weight,p.length,p.width,p.height].every(finitePositive));
  if(packages.length<2) throw new Error('Au moins 2 colis complets sont nécessaires pour une consolidation.');
  const f=features(packages);
  const withinCalibration=f.density>=calibrated[0].density*.8 && f.density<=calibrated.at(-1).density*1.3;
  return {
    packageCount:packages.length,
    expected:scenario(packages,1),
    quote:scenario(packages,1.08),
    high:scenario(packages,1.18),
    confidence:withinCalibration?0.72:0.54,
    model:'history-calibrated-repack-v1',
    calibrationSamples:HISTORY.length,
    hasBattery:packages.some(p=>p.battery),
    largeBattery:packages.some(p=>p.largeBattery || Number(p.batteryWh)>=100)
  };
};

export const consolidationCalibration = () => calibrated.map(x=>({...x}));
