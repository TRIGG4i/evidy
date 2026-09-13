const CONFIG={
  visaApiUrls:["https://usa.visa.com/cmsapi/fx/rates","https://www.visa.com/cmsapi/fx/rates"],
  destinationCurrency:"MGA",
  visaBankFeePercent:4,
  actualVisaBankFeePercent:3.5,
  fixedVisaFeeMGA:1000,
  cardDailyLimitMGA:5000000,
  walletTopupPercent:1,
  peDefaultFeeUSD:5,
  fallbackVisaRate:4495.6912,
  minimumServiceFeeMGA:75000,
  apiBase:(window.EVIDY?.apiBase||"").replace(/\/$/,"")
};
const $=id=>document.getElementById(id),$$=s=>[...document.querySelectorAll(s)];
const roundUpTo=(n,step)=>Math.ceil(n/step)*step;
const num=v=>{const n=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
const fmtNumber=(v,d=0)=>Number.isFinite(v)?new Intl.NumberFormat("fr-FR",{minimumFractionDigits:d,maximumFractionDigits:d}).format(v):"—";
const fmtMGA=(v,d=0)=>Number.isFinite(v)?`${fmtNumber(v,d)} MGA`:"—";
const fmtUSD=(v,d=2)=>Number.isFinite(v)?`$${fmtNumber(v,d)}`:"—";
const ANALYZE_BUTTON_HTML='<img class="gemini-mark" src="assets/gemini-sparkle.svg" alt="" /><span>Analyser</span><span class="gemini-badge">Gemini</span>';
const LB_PER_KG=2.2046226218,CM_PER_IN=2.54;
const lbToKg=lb=>Number(lb)/LB_PER_KG,kgToLb=kg=>Number(kg)*LB_PER_KG,inToCm=inch=>Number(inch)*CM_PER_IN,cmToIn=cm=>Number(cm)/CM_PER_IN;
const isoDate=()=>new Date().toISOString().slice(0,10);
const displayDate=s=>{if(!s)return"—";const d=new Date(`${s}T12:00:00`);return Number.isNaN(d.valueOf())?s:new Intl.DateTimeFormat("fr-FR").format(d)};
const defaultValidity=()=>isoDate();
const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const formatHsCode=value=>{const d=String(value||"").replace(/\D/g,"");if(d.length<=4)return d;if(d.length<=6)return `${d.slice(0,4)}.${d.slice(4)}`;if(d.length<=8)return `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6)}`;return `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}.${d.slice(8)}`};
const cleanHsDescription=value=>String(value||"").replace(/^[-–—\s]+/,"").replace(/\s+/g," ").trim();
const clientHsDescription=(preferred,fallback)=>{
  const bad=/estimation prudente|en attente de validation|validation etariff|barème de secours|fallback/i;
  const primary=cleanHsDescription(preferred),secondary=cleanHsDescription(fallback);
  const value=(primary&&!bad.test(primary)?primary:(secondary&&!bad.test(secondary)?secondary:""));
  return value.length>72?`${value.slice(0,69).trim()}…`:value;
};

const saved=(()=>{try{return JSON.parse(localStorage.getItem("evidyStateV1")||"{}")}catch{return {}}})();
const state={
  view:"client",
  visaRate:Number(saved.visaRate)||CONFIG.fallbackVisaRate,
  internalVisaRate:Number(saved.internalVisaRate)||((Number(saved.visaRate)||CONFIG.fallbackVisaRate)*(1+CONFIG.actualVisaBankFeePercent/100)/(1+CONFIG.visaBankFeePercent/100)),
  ratesDate:saved.ratesDate||null,
  product:{url:saved.product?.url||"",title:saved.product?.title||"",itemUsd:Number(saved.product?.itemUsd)||551.99,domesticUsd:Number(saved.product?.domesticUsd)||0,hsCode:saved.product?.hsCode||"",hsConfidence:Number(saved.product?.hsConfidence)||0,hsLabel:saved.product?.hsLabel||"",hsSource:saved.product?.hsSource||"",hsReasoning:saved.product?.hsReasoning||"",hsNeedsReview:Boolean(saved.product?.hsNeedsReview),hsFingerprint:saved.product?.hsFingerprint||""},
  package:{weight:Number(saved.package?.weight)||2.5,length:Number(saved.package?.length)||11,width:Number(saved.package?.width)||9,height:Number(saved.package?.height)||4,source:saved.package?.source||"manuel",confidence:Number(saved.package?.confidence)||0,battery:Boolean(saved.package?.battery),batteryWh:Number(saved.package?.batteryWh)||null,largeBattery:Boolean(saved.package?.largeBattery),batterySource:saved.package?.batterySource||"",batteryConfidence:Number(saved.package?.batteryConfidence)||0,batteryChemistry:saved.package?.batteryChemistry||"",batteryContainedInEquipment:saved.package?.batteryContainedInEquipment??null,batteryRemovable:saved.package?.batteryRemovable??null,batteryReasoning:saved.package?.batteryReasoning||""},
  unitSystem:saved.unitSystem==="metric"?"metric":"us",
  shippingMode:saved.shippingMode==="consolidation"?"consolidation":"single",
  consolidationItems:Array.isArray(saved.consolidationItems)?saved.consolidationItems.map((i,idx)=>({id:i.id||`saved-${idx}`,title:i.title||"Article",url:i.url||"",itemUsd:Number(i.itemUsd)||0,domesticUsd:Number(i.domesticUsd)||0,hsCode:i.hsCode||"",hsConfidence:Number(i.hsConfidence)||0,hsLabel:i.hsLabel||"",hsSource:i.hsSource||"",hsReasoning:i.hsReasoning||"",hsNeedsReview:Boolean(i.hsNeedsReview),package:{weight:Number(i.package?.weight)||0,length:Number(i.package?.length)||0,width:Number(i.package?.width)||0,height:Number(i.package?.height)||0,source:i.package?.source||"",confidence:Number(i.package?.confidence)||0,battery:Boolean(i.package?.battery),batteryWh:Number(i.package?.batteryWh)||null,largeBattery:Boolean(i.package?.largeBattery),batterySource:i.package?.batterySource||"",batteryConfidence:Number(i.package?.batteryConfidence)||0,batteryChemistry:i.package?.batteryChemistry||"",batteryContainedInEquipment:i.package?.batteryContainedInEquipment??null,batteryRemovable:i.package?.batteryRemovable??null,batteryReasoning:i.package?.batteryReasoning||""},customsEstimate:i.customsEstimate&&typeof i.customsEstimate==="object"?i.customsEstimate:null})).filter(i=>i.itemUsd>0):[],
  consolidationPackages:Array.isArray(saved.consolidationPackages)?saved.consolidationPackages.map(p=>({weight:Number(p.weight)||0,length:Number(p.length)||0,width:Number(p.width)||0,height:Number(p.height)||0,battery:Boolean(p.battery),batteryWh:Number(p.batteryWh)||null,largeBattery:Boolean(p.largeBattery)})):[],
  consolidatedEstimate:saved.consolidatedEstimate&&typeof saved.consolidatedEstimate==="object"?saved.consolidatedEstimate:null,
  warehouse:String(saved.warehouse||"4"),
  customsReserve:Number(saved.customsReserve)||200000,
  customsActualMga:Number(saved.customsActualMga)||0,
  customsEstimate:saved.customsEstimate&&typeof saved.customsEstimate==="object"?saved.customsEstimate:null,
  customsContextKey:saved.customsContextKey||"",
  lastCustomsUsd:Number(saved.lastCustomsUsd)||Number(saved.customsEstimate?.exchangeRates?.USD)||4314.85,
  lastCustomsEur:Number(saved.lastCustomsEur)||Number(saved.customsEstimate?.exchangeRates?.EUR)||4951.08,
  customsLoading:false,
  paymentMethod:saved.paymentMethod==="wallet"?"wallet":"direct",
  peFeesUsd:Number(saved.peFeesUsd)||CONFIG.peDefaultFeeUSD,
  consolidationFeeUsd:Number.isFinite(Number(saved.consolidationFeeUsd))?Number(saved.consolidationFeeUsd):8,
  localDelivery:Number(saved.localDelivery)||0,
  shippingRates:Array.isArray(saved.shippingRates)?saved.shippingRates.filter(r=>r&&Number(r.rateUsd)>0):[],selectedRate:saved.selectedRate&&Number(saved.selectedRate.rateUsd)>0?saved.selectedRate:null,selectedCarrier:saved.selectedCarrier||"DHL",
  quotes:(()=>{try{return JSON.parse(localStorage.getItem("evidyQuotesV1")||"[]")}catch{return []}})(),
  editingQuoteId:null,editingQuoteBase:null,draftNumber:null,lastCalc:null
};

function persistState(){
  try{localStorage.setItem("evidyStateV1",JSON.stringify({visaRate:state.visaRate,internalVisaRate:state.internalVisaRate,ratesDate:state.ratesDate,product:state.product,package:state.package,unitSystem:state.unitSystem,shippingMode:state.shippingMode,consolidationItems:state.consolidationItems,consolidationPackages:state.consolidationPackages,consolidatedEstimate:state.consolidatedEstimate,warehouse:state.warehouse,customsReserve:state.customsReserve,customsActualMga:state.customsActualMga,customsEstimate:state.customsEstimate,customsContextKey:state.customsContextKey,lastCustomsUsd:state.lastCustomsUsd,lastCustomsEur:state.lastCustomsEur,paymentMethod:state.paymentMethod,peFeesUsd:state.peFeesUsd,consolidationFeeUsd:state.consolidationFeeUsd,localDelivery:state.localDelivery,shippingRates:state.shippingRates,selectedRate:state.selectedRate,selectedCarrier:state.selectedCarrier}))}catch{}
}
function serviceRate(itemUsd){return itemUsd<=500?.35:itemUsd<=1000?.30:.28}
function serviceFeeMGA(itemUsd,domesticUsd,rate){
  const base=(itemUsd+domesticUsd)*rate,tier=serviceRate(itemUsd);
  const floor500=500*rate*.35,floor1000=1000*rate*.30;
  const continuity=itemUsd>1000?floor1000:itemUsd>500?floor500:0;
  return Math.round(Math.max(base*tier,CONFIG.minimumServiceFeeMGA,continuity));
}
function paymentCostMGA(amount,method=state.paymentMethod){
  const safe=Math.max(0,Number(amount)||0),debits=safe>0?Math.ceil(safe/CONFIG.cardDailyLimitMGA):0;
  const fixedFees=debits*CONFIG.fixedVisaFeeMGA,topupFee=method==="wallet"?Math.round(safe*CONFIG.walletTopupPercent/100):0;
  return{debits,fixedFees,topupFee,total:fixedFees+topupFee};
}
function productFingerprint(i){return `${String(i?.url||'').trim().toLowerCase().replace(/[?#].*$/,'')}|${String(i?.title||'').trim().toLowerCase()}`}
function currentItemSnapshot(){
  if(!(Number(state.product.itemUsd)>0) || !(String(state.product.title||'').trim()||String(state.product.url||'').trim()))return null;
  return{id:`item-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title:state.product.title||"Article",url:state.product.url||"",itemUsd:Number(state.product.itemUsd)||0,domesticUsd:Number(state.product.domesticUsd)||0,hsCode:state.product.hsCode||"",hsConfidence:Number(state.product.hsConfidence)||0,hsLabel:state.product.hsLabel||"",hsSource:state.product.hsSource||"",hsReasoning:state.product.hsReasoning||"",hsNeedsReview:Boolean(state.product.hsNeedsReview),package:{...state.package},customsEstimate:null};
}
function activeOrderItems({includeCurrent=true}={}){
  if(state.shippingMode!=="consolidation"){const one=currentItemSnapshot();return one?[one]:[]}
  const items=[...(state.consolidationItems||[])];
  if(includeCurrent){const cur=currentItemSnapshot();if(cur)items.push(cur)}
  return items;
}
function resetCurrentProductForConsolidation(){
  state.product={url:"",title:"",itemUsd:0,domesticUsd:0,hsCode:"",hsConfidence:0,hsLabel:"",hsSource:"",hsReasoning:"",hsNeedsReview:false,hsFingerprint:""};
  state.package={weight:0,length:0,width:0,height:0,source:"",confidence:0,battery:false,batteryWh:null,largeBattery:false,batterySource:"",batteryReasoning:""};
}
function syncConsolidationPackagesFromItems({includeCurrent=true}={}){
  if(state.shippingMode!=="consolidation")return;
  state.consolidationPackages=activeOrderItems({includeCurrent}).map(i=>({...i.package})).filter(packageComplete);
}
function archiveCurrentForConsolidation({clear=true}={}){
  const snap=currentItemSnapshot();if(!snap)return false;
  state.consolidationItems.push(snap);
  if(clear)resetCurrentProductForConsolidation();
  syncConsolidationPackagesFromItems({includeCurrent:true});state.consolidatedEstimate=null;state.shippingRates=[];state.selectedRate=null;invalidateCustoms();persistState();
  return true;
}
function aggregatePaymentCosts(items,internalRate){
  return items.reduce((acc,i)=>{const p=paymentCostMGA((Number(i.itemUsd||0)+Number(i.domesticUsd||0))*internalRate);acc.debits+=p.debits;acc.fixedFees+=p.fixedFees;acc.topupFee+=p.topupFee;acc.total+=p.total;return acc},{debits:0,fixedFees:0,topupFee:0,total:0});
}
function serviceFeeForItemsMGA(items,rate){return items.reduce((sum,i)=>sum+serviceFeeMGA(Number(i.itemUsd)||0,Number(i.domesticUsd)||0,rate),0)}
function packageComplete(p){return p&&[p.weight,p.length,p.width,p.height].every(v=>Number(v)>0)}
function ensureConsolidationPackages(){
  if(state.shippingMode!=="consolidation")return;
  syncConsolidationPackagesFromItems({includeCurrent:true});
}
function estimateConsolidatedPackage(){
  if(state.shippingMode!=="consolidation")return state.package;
  ensureConsolidationPackages();
  const packages=state.consolidationPackages.filter(packageComplete);
  if(packages.length<2)return null;
  const boxes=packages.map(p=>[p.length,p.width,p.height].map(Number).sort((a,b)=>b-a));
  const innerL=Math.max(...boxes.map(d=>d[0])),innerW=Math.max(...boxes.map(d=>d[1])),maxH=Math.max(...boxes.map(d=>d[2]));
  const volume=packages.reduce((sum,p)=>sum+p.length*p.width*p.height,0)*1.15;
  const innerH=Math.max(maxH,volume/Math.max(innerL*innerW,1));
  const rawWeight=packages.reduce((sum,p)=>sum+Number(p.weight),0);
  return{weight:rawWeight*1.06+0.5,length:innerL+1,width:innerW+1,height:innerH+1,source:"consolidation-estimate",confidence:.62,count:packages.length};
}
function activeShippingPackage(){return state.shippingMode==="consolidation"?(state.consolidatedEstimate||estimateConsolidatedPackage()||null):state.package}
function orderHasBattery(){return state.shippingMode==="consolidation"?activeOrderItems({includeCurrent:true}).some(i=>Boolean(i.package?.battery)):Boolean(state.package.battery)}
function billableWeight(){const p=activeShippingPackage();return p?Math.ceil(Math.max(p.weight,p.length*p.width*p.height/166)):0}
function bestRateForCarrier(carrier){return state.shippingRates.filter(r=>r.carrier===carrier).sort((a,b)=>a.rateUsd-b.rateUsd)[0]||null}
function selectedShipping(){return state.selectedRate||bestRateForCarrier(state.selectedCarrier)}
function negotiatedCustomsMGA(){return Math.round(Number(state.customsEstimate?.negotiatedMga)||Number(state.customsReserve)||200000)}
function quotedCustomsMGA(){return Math.round(Number(state.customsEstimate?.officialTotalMga)||Number(state.customsReserve)||200000)}
function actualCustomsMGA(){return Math.max(0,Math.round(Number(state.customsActualMga)||0))}
function customsSettlement(totalEstimate,depositEstimate){
  const actual=actualCustomsMGA();
  if(!(actual>0))return null;
  const estimated=quotedCustomsMGA(),finalTotal=Math.max(0,Math.round(totalEstimate-estimated+actual));
  return{actual,estimated,adjustment:actual-estimated,finalTotal,finalBalance:Math.max(0,finalTotal-depositEstimate),refund:Math.max(0,depositEstimate-finalTotal)};
}
function calculate(){
  const items=activeOrderItems({includeCurrent:true}),clientRate=state.visaRate,internalRate=state.internalVisaRate||clientRate,ship=selectedShipping();
  if(!(items.length>0&&clientRate>0&&internalRate>0&&ship?.rateUsd>0))return null;
  const item=items.reduce((s,i)=>s+Number(i.itemUsd||0),0),domestic=items.reduce((s,i)=>s+Number(i.domesticUsd||0),0);
  const consolidationFee=state.shippingMode==="consolidation"?state.consolidationFeeUsd:0;
  const purchaseUsd=item+domestic,freightUsd=ship.rateUsd+state.peFeesUsd+consolidationFee;
  const clientPurchase=purchaseUsd*clientRate,clientFreight=freightUsd*clientRate;
  const internalPurchase=purchaseUsd*internalRate,internalFreight=freightUsd*internalRate;
  const purchasePayment=state.shippingMode==="consolidation"?aggregatePaymentCosts(items,internalRate):paymentCostMGA(internalPurchase),freightPayment=paymentCostMGA(internalFreight);
  const customsApplied=quotedCustomsMGA(),service=state.shippingMode==="consolidation"?serviceFeeForItemsMGA(items,clientRate):serviceFeeMGA(item,domestic,clientRate);
  const trueCost=Math.round(internalPurchase+internalFreight+purchasePayment.total+freightPayment.total+customsApplied+state.localDelivery);
  const total=roundUpTo(clientPurchase+clientFreight+customsApplied+state.localDelivery+service,1000),profit=total-trueCost;
  const coverageTarget=Math.round(internalPurchase+internalFreight+purchasePayment.total+freightPayment.total);
  return{items,itemUsd:item,domesticUsd:domestic,visaRate:clientRate,internalVisaRate:internalRate,shipping:ship,peFeesUsd:state.peFeesUsd,consolidationFeeUsd:consolidationFee,purchaseUsd,freightUsd,clientPurchaseMga:clientPurchase,clientFreightMga:clientFreight,internalPurchaseMga:internalPurchase,internalFreightMga:internalFreight,purchasePayment,freightPayment,paymentFees:purchasePayment.total+freightPayment.total,reserve:customsApplied,customsOfficial:Number(state.customsEstimate?.officialTotalMga)||0,localDelivery:state.localDelivery,serviceFee:service,cost:trueCost,total,profit,rateTier:state.shippingMode==="consolidation"?null:serviceRate(item),billable:billableWeight(),feesClient:Math.max(0,total-(item+domestic+ship.rateUsd)*clientRate-customsApplied),coverageTarget,paymentMethod:state.paymentMethod};
}
function paymentPlan(total,target=0){
  const safeTotal=Math.max(0,Math.round(Number(total)||0)),safeTarget=Math.max(0,Math.round(Number(target)||0));
  const depositPercent=safeTotal*.75>=safeTarget?75:80,balancePercent=100-depositPercent;
  const deposit=Math.round(safeTotal*depositPercent/100),balance=safeTotal-deposit;
  return{depositPercent,balancePercent,deposit,balance,gap:Math.max(0,safeTarget-deposit),coverage:deposit-safeTarget,target:safeTarget};
}
function syncInputs(){
  $("productUrl").value=state.product.url; $("clientAmount").value=state.product.itemUsd>0?fmtNumber(state.product.itemUsd,2):""; $("internalAmount").value=state.product.itemUsd>0?fmtNumber(state.product.itemUsd,2):"";
  $("productTitleManual").value=state.product.title||""; $("manualBattery").checked=Boolean(state.package.battery);
  syncManualUnitInputs();
  $("weightLb").value=Number(state.package.weight).toFixed(2); $("lengthIn").value=Number(state.package.length).toFixed(2); $("widthIn").value=Number(state.package.width).toFixed(2); $("heightIn").value=Number(state.package.height).toFixed(2);
  $("warehouse").value=state.warehouse; $("domesticUsd").value=state.product.domesticUsd; $("customsReserve").value=negotiatedCustomsMGA(); if($("customsActual"))$("customsActual").value=state.customsActualMga>0?Math.round(state.customsActualMga):""; $("peFeesUsd").value=state.peFeesUsd; $("consolidationFeeUsd").value=state.consolidationFeeUsd; $("localDelivery").value=state.localDelivery; $("visaRateManual").value=state.visaRate.toFixed(2); $("internalVisaRateManual").value=state.internalVisaRate.toFixed(2); $("paymentMethod").value=state.paymentMethod; $("hsCodeManual").value=state.product.hsCode||"";
  renderShippingControls();
}
function updateRateStrip(){
  $("rateUSD").textContent=fmtNumber(state.visaRate,2);const ship=selectedShipping();$("transportTop").textContent=ship?fmtUSD(ship.rateUsd):"—";
}
function renderRates(){
  const box=$("internalRates");
  if(!state.shippingRates.length){box.innerHTML='<div class="inline-status"><span class="status-dot warn"></span><span>Aucun tarif transport chargé</span></div>';return}
  box.innerHTML=state.shippingRates.map(r=>`<div class="rate-row ${state.selectedRate?.id===r.id?'active':''}" data-rate-id="${r.id}"><div><strong>${escapeHTML(r.carrier)} ${escapeHTML(r.service||'')}</strong><span>${escapeHTML(r.deliverySpeed||'')}</span></div><b>${escapeHTML(fmtUSD(r.rateUsd))}</b></div>`).join("");
}
function customsContextKey(){
  const ship=selectedShipping();
  if(state.shippingMode==="consolidation"){
    const items=activeOrderItems({includeCurrent:true}).map(i=>`${productFingerprint(i)}:${String(i.hsCode||'').replace(/\D/g,'')}:${Number(i.itemUsd||0).toFixed(2)}`).sort();
    return `multi|${items.join('||')}|${ship?Number(ship.rateUsd||0).toFixed(2):"0.00"}`;
  }
  const hs=String(state.product.hsCode||"").replace(/\D/g,"");
  return `${productHsFingerprint()}|${hs}|${Number(state.product.itemUsd||0).toFixed(2)}|${ship?Number(ship.rateUsd||0).toFixed(2):"0.00"}`;
}
function usableCustomsEstimate(){
  return state.customsEstimate&&state.customsContextKey===customsContextKey()?state.customsEstimate:null;
}
function invalidateCustoms(){state.customsEstimate=null;state.customsContextKey="";state.customsReserve=200000;state.customsActualMga=0;}
function provisionalCustomsEstimate(){
  const ship=selectedShipping();if(!(ship?.rateUsd>0))return null;
  const usd=Number(state.lastCustomsUsd)||4314.85,eur=Number(state.lastCustomsEur)||4951.08;
  if(state.shippingMode==="consolidation"){
    const items=activeOrderItems({includeCurrent:true}).filter(i=>Number(i.itemUsd)>0&&String(i.hsCode||'').replace(/\D/g,'').length>=6);
    if(items.length<2)return null;
    const totalValue=items.reduce((sum,i)=>sum+Number(i.itemUsd||0)+Number(i.domesticUsd||0),0);
    const cif=(totalValue+Number(ship.rateUsd||0))*usd,dutyPercent=20,duty=cif*.20,vat=(cif+duty)*.20,income=cif*.05,gasynet=10*eur,gasynetVat=gasynet*.20,roc=cif*.00132;
    const official=Math.round(duty+vat+income+gasynet+gasynetVat+roc),applied=Math.ceil(Math.min(1000000,Math.max(200000,official*.30))/1000)*1000;
    return{multi:true,itemCount:items.length,items:items.map(i=>({title:i.title,hs:{resolvedCode:i.hsCode,description:i.hsLabel,dutyPercent:null},itemUsd:i.itemUsd})),hs:{multi:true,description:`${items.length} articles classifiés séparément`,dutyPercent:null,vatPercent:20,source:"Estimation locale multi-articles",official:false},exchangeRates:{USD:usd,EUR:eur,source:"dernier cours douane connu"},officialTotalMga:official,negotiatedMga:applied,calculatedAt:new Date().toISOString(),provisional:true};
  }
  const hs=String(state.product.hsCode||"").replace(/\D/g,"");
  if(!(state.product.itemUsd>0&&hs.length>=6))return null;
  const cif=(Number(state.product.itemUsd||0)+Number(state.product.domesticUsd||0)+Number(ship.rateUsd||0))*usd;
  const dutyPercent=20,duty=cif*dutyPercent/100,vat=(cif+duty)*.20,income=cif*.05,gasynet=10*eur,gasynetVat=gasynet*.20,roc=cif*.00132;
  const official=Math.round(duty+vat+income+gasynet+gasynetVat+roc),applied=Math.ceil(Math.min(1000000,Math.max(200000,official*.30))/1000)*1000;
  return{hs:{requestedCode:hs,resolvedCode:hs,formattedCode:formatHsCode(hs),description:state.product.hsLabel||"Classification automatique",dutyPercent,vatPercent:20,source:"Estimation locale instantanée",official:false},exchangeRates:{USD:usd,EUR:eur,source:"dernier cours douane connu"},officialTotalMga:official,negotiatedMga:applied,calculatedAt:new Date().toISOString(),provisional:true};
}
function hydrateProvisionalCustoms(){
  if(usableCustomsEstimate())return;
  const provisional=provisionalCustomsEstimate();
  if(!provisional)return;
  state.customsEstimate=provisional;state.customsContextKey=customsContextKey();state.customsReserve=provisional.negotiatedMga;persistState();refreshAll();
}

function refreshAll(){
  const t=calculate();state.lastCalc=t;
  updateRateStrip();
  const pkg=activeShippingPackage();
  if(pkg){
    const prefix=state.shippingMode==="consolidation"?`Consolidation ${pkg.count||2} colis · `:"";
    $("clientPackageMeta").textContent=`${prefix}${fmtNumber(pkg.weight,2)} lb (${fmtNumber(lbToKg(pkg.weight),2)} kg) · ${fmtNumber(pkg.length,1)} × ${fmtNumber(pkg.width,1)} × ${fmtNumber(pkg.height,1)} in (${fmtNumber(inToCm(pkg.length),1)} × ${fmtNumber(inToCm(pkg.width),1)} × ${fmtNumber(inToCm(pkg.height),1)} cm)`;
    $("clientBillableMetric").textContent=`${billableWeight()} lb (${fmtNumber(lbToKg(billableWeight()),2)} kg)`;
  }else{
    $("clientPackageMeta").textContent="Complète au moins 2 colis";$("clientBillableMetric").textContent="—";
  }
  updateManualUnitHints();renderShippingControls(false);
  const ce=usableCustomsEstimate(),hsMeta=$("hsCodeMeta");
  if(hsMeta)hsMeta.textContent=state.product.hsCode?`${formatHsCode(state.product.hsCode)}${state.product.hsConfidence?` · ${fmtNumber(state.product.hsConfidence*100,0)} %`:''}`:"—";
  if($("hsCategoryMeta"))$("hsCategoryMeta").textContent=clientHsDescription(state.product.hsLabel,ce?.hs?.official===false?"":ce?.hs?.description)||"—";
  if($("hsAiMeta")){const gemini=String(state.product.hsSource||"").includes("gemini");$("hsAiMeta").textContent=gemini?(state.product.hsNeedsReview?"Gemini · à vérifier":"Gemini · cohérent"):(state.product.hsSource==="manual"?"Saisie manuelle":"Secours local");}
  if($("hsReasoningMeta"))$("hsReasoningMeta").textContent=state.product.hsReasoning||"—";
  if($("customsDutyLabel"))$("customsDutyLabel").textContent=ce?.hs?.official===false?"DD estimé":"DD officiel";
  $("customsDutyRate").textContent=Number.isFinite(Number(ce?.hs?.dutyPercent))?`${fmtNumber(Number(ce.hs.dutyPercent),2)} %`:(state.customsLoading?"Calcul…":"—");
  $("customsFxRate").textContent=Number(ce?.exchangeRates?.USD)>0?`${fmtNumber(Number(ce.exchangeRates.USD),2)} Ar / USD`:(state.customsLoading?"Calcul…":"—");
  $("customsOfficial").textContent=Number(ce?.officialTotalMga)>0?fmtMGA(Number(ce.officialTotalMga),0):(state.customsLoading?"Calcul…":"—");
  $("reserveMeta").textContent=fmtMGA(negotiatedCustomsMGA(),0);
  $("customsReserve").value=negotiatedCustomsMGA();
  if($("customsBilled"))$("customsBilled").textContent=fmtMGA(quotedCustomsMGA(),0);
  const orderBattery=state.shippingMode==="consolidation"?activeOrderItems({includeCurrent:true}).some(i=>Boolean(i.package?.battery)):Boolean(state.package.battery);
  $$("[data-carrier]").forEach(b=>{const noRate=state.shippingRates.length>0&&!bestRateForCarrier(b.dataset.carrier);const blocked=(orderBattery&&b.dataset.carrier==="DHL")||noRate;b.disabled=blocked;b.classList.toggle("active",!blocked&&b.dataset.carrier===state.selectedCarrier);b.title=orderBattery&&b.dataset.carrier==="DHL"?"Batterie détectée : FedEx requis pour l’acheminement vers Madagascar":(noRate?"Transporteur indisponible pour ce colis":"");});
  if(!t){
    $("clientTotal").textContent=$("internalCost").textContent=$("netProfit").textContent=$("internalClientTotal").textContent="—";
    $("internalDeposit").textContent=$("internalBalance").textContent="—";$("paymentCoverage").classList.remove("warn","ok");$("paymentCoverage").querySelector("strong").textContent="—";
    $("clientRateMeta").textContent=`1 USD = ${fmtNumber(state.visaRate,2)} MGA`;$("clientTransportMeta").textContent="À calculer";$("internalShipping").textContent="—";$("billableWeight").textContent=billableWeight()?`${billableWeight()} lb (${fmtNumber(lbToKg(billableWeight()),2)} kg)`:"—";
    $("marginTier").textContent="—";$("cardFees").textContent="—";$("realMargin").textContent="—";if($("customsAdjustment"))$("customsAdjustment").textContent="À l'arrivée";if($("finalBalanceDue"))$("finalBalanceDue").textContent="—";return;
  }
  $("clientTotal").textContent=fmtNumber(t.total,0);$("clientRateMeta").textContent=`1 USD = ${fmtNumber(t.visaRate,2)} MGA`;$("clientTransportMeta").textContent=`${t.shipping.carrier} · ${fmtUSD(t.shipping.rateUsd)}`;
  $("internalCost").textContent=fmtNumber(t.cost,0);$("internalShipping").textContent=`${t.shipping.carrier} · ${fmtUSD(t.shipping.rateUsd)}`;$("billableWeight").textContent=`${t.billable} lb (${fmtNumber(lbToKg(t.billable),2)} kg)`;
  const realMarginPct=t.total>0?t.profit/t.total*100:0;
  $("netProfit").textContent=fmtMGA(t.profit,0);$("internalClientTotal").textContent=fmtMGA(t.total,0);$("marginTier").textContent=state.shippingMode==="consolidation"?`Par article · barème 35 / 30 / 28 %`: `${fmtNumber(t.rateTier*100,0)} % · min. 75 000 Ar`;$("cardFees").textContent=`${fmtMGA(t.paymentFees,0)} · ${state.paymentMethod==="wallet"?"recharge 1 %":"Visa directe"}`;$("realMargin").textContent=`${fmtMGA(t.profit,0)} · ${fmtNumber(realMarginPct,1)} %`;
  const pay=paymentPlan(t.total,t.coverageTarget);$("internalDeposit").textContent=fmtMGA(pay.deposit,0);$("internalBalance").textContent=fmtMGA(pay.balance,0);$("internalDepositLabel").textContent=`Avance client ${pay.depositPercent} %`;$("internalBalanceLabel").textContent=`Solde estimatif à l'arrivée ${pay.balancePercent} %`;
  const settlement=customsSettlement(t.total,pay.deposit);
  if($("customsAdjustment"))$("customsAdjustment").textContent=settlement?(settlement.adjustment===0?"Aucune":`${settlement.adjustment>0?"+":"−"} ${fmtMGA(Math.abs(settlement.adjustment),0)}`):"À l'arrivée";
  if($("finalBalanceDue"))$("finalBalanceDue").textContent=settlement?(settlement.refund>0?`Remboursement ${fmtMGA(settlement.refund,0)}`:fmtMGA(settlement.finalBalance,0)):fmtMGA(pay.balance,0);
  const coverage=$("paymentCoverage"),coverageText=coverage.querySelector("strong");coverage.classList.toggle("warn",pay.gap>0);coverage.classList.toggle("ok",pay.gap===0);coverageText.textContent=pay.gap>0?`Après ${pay.depositPercent} %, eVidy avance ${fmtMGA(pay.gap,0)}`:`Article + transport couverts · + ${fmtMGA(Math.max(0,pay.coverage),0)}`;
  if($("quoteSheet").classList.contains("open")&&!state.editingQuoteId)renderDraftPreview();
}
function setView(view){
  state.view=view;
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===view+'View'));
  $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  if(view==="internal")syncInputs();
  refreshAll();updateRateStrip();
}
function repairPersistedContext(){
  const fp=productHsFingerprint();
  if(state.product.hsSource!=="manual"&&state.product.hsCode&&state.product.hsFingerprint!==fp){
    state.product.hsCode="";state.product.hsConfidence=0;state.product.hsLabel="";state.product.hsSource="";state.product.hsReasoning="";state.product.hsNeedsReview=false;state.product.hsFingerprint="";invalidateCustoms();
  }
  if(state.customsEstimate&&state.customsContextKey!==customsContextKey()){state.customsEstimate=null;state.customsContextKey="";}
  persistState();
}
function canRefreshCustoms(){
  if(!selectedShipping())return false;
  if(state.shippingMode==="consolidation"){
    const items=activeOrderItems({includeCurrent:true});
    return items.length>=2&&items.every(i=>String(i.hsCode||"").replace(/\D/g,"").length>=6);
  }
  return String(state.product.hsCode||"").replace(/\D/g,"").length>=6&&Number(state.product.itemUsd)>0;
}
async function refreshEverything(){
  const visaPromise=refreshVisa().catch(()=>null);
  if(currentItemSnapshot())await ensureHsClassification({force:state.product.hsSource!=="manual",silent:true});
  const customsPromise=canRefreshCustoms()?refreshCustomsEstimate({silent:true,retries:1}):Promise.resolve(null);
  const shippingPromise=refreshShipping({withCustoms:false});
  await Promise.allSettled([customsPromise,shippingPromise,visaPromise]);
  if(canRefreshCustoms()&&!usableCustomsEstimate())await refreshCustomsEstimate({silent:true,retries:1});
}

function todayVisaDate(){const d=new Date();return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`}
function normaliseVisaRate(n){if(!Number.isFinite(n)||n<=0)return NaN;if(n>=100&&n<=30000)return n;if(n>0&&n<.01){const inv=1/n;if(inv>=100&&inv<=30000)return inv}return NaN}
function toNumbers(v){if(typeof v==="number")return[v];if(v==null)return[];return((String(v).replace(/\s/g,"").replace(/,/g,"").match(/-?\d+(?:\.\d+)?/g)||[]).map(Number).filter(Number.isFinite))}
function findByKeyRecursive(o,key,res=[]){if(!o||typeof o!=="object")return res;for(const[k,v]of Object.entries(o)){if(k===key)res.push(v);if(v&&typeof v==="object")findByKeyRecursive(v,key,res)}return res}
function extractVisaRate(data){const keys=["fxRateWithAdditionalFee","rateWithAdditionalFee","conversionRateWithAdditionalFee","cardholderBillingAmount","destinationAmountWithAdditionalFee","convertedAmountWithAdditionalFee","toAmountWithAdditionalFee","amountWithAdditionalFee","fxRate","conversionRate","rate","destinationAmount","convertedAmount","toAmount","result"];for(const key of keys)for(const value of findByKeyRecursive(data,key)){const c=toNumbers(value).map(normaliseVisaRate).find(Number.isFinite);if(c)return c}throw new Error("Taux VISA introuvable")}
function buildVisaUrl(baseUrl,bankFee=CONFIG.visaBankFeePercent){const p=new URLSearchParams({amount:"1",fee:String(bankFee),utcConvertedDate:todayVisaDate(),exchangedate:todayVisaDate(),fromCurr:CONFIG.destinationCurrency,toCurr:"USD"});return `${baseUrl}?${p}`}
async function fetchVisaRate(bankFee=CONFIG.visaBankFeePercent){let last;for(const url of CONFIG.visaApiUrls){try{const r=await fetch(buildVisaUrl(url,bankFee),{method:"GET",mode:"cors",cache:"no-store",headers:{Accept:"application/json, text/plain, */*"}});if(!r.ok)throw new Error("Réponse VISA invalide");const rate=extractVisaRate(await r.json());if(!Number.isFinite(rate)||rate<100)throw new Error("Taux incohérent");return rate}catch(e){last=e}}throw last||new Error("VISA indisponible")}
async function refreshVisa(){
  $("rateDot").className="rate-dot loading";$("statusDot").className="status-dot";$("rateStatus").textContent="Actualisation VISA…";$("refreshRates").disabled=true;
  try{
    const [clientResult,internalResult]=await Promise.allSettled([fetchVisaRate(CONFIG.visaBankFeePercent),fetchVisaRate(CONFIG.actualVisaBankFeePercent)]);
    if(clientResult.status!=="fulfilled")throw clientResult.reason;
    state.visaRate=clientResult.value;
    state.internalVisaRate=internalResult.status==="fulfilled"?internalResult.value:state.visaRate*(1+CONFIG.actualVisaBankFeePercent/100)/(1+CONFIG.visaBankFeePercent/100);
    state.ratesDate=new Date().toISOString();$("rateDot").className="rate-dot";$("statusDot").className="status-dot";$("rateStatus").textContent="Taux VISA actualisé";
  }catch(e){
    state.internalVisaRate=state.internalVisaRate||state.visaRate*(1+CONFIG.actualVisaBankFeePercent/100)/(1+CONFIG.visaBankFeePercent/100);
    $("rateDot").className="rate-dot error";$("statusDot").className="status-dot warn";$("rateStatus").textContent="VISA indisponible, derniers taux conservés";
  }finally{$("refreshRates").disabled=false;$("visaRateManual").value=state.visaRate.toFixed(2);$("internalVisaRateManual").value=state.internalVisaRate.toFixed(2);persistState();refreshAll()}
}
async function fetchJSON(url,options={},timeout=18000){const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{...options,signal:c.signal,headers:{'Content-Type':'application/json',...(options.headers||{})}});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=null}if(!r.ok)throw new Error(data?.error||`HTTP ${r.status}`);return data}finally{clearTimeout(timer)}}
let customsRefreshTimer=null;
function productHsFingerprint(){
  const title=String(state.product.title||'').trim().toLowerCase().replace(/\s+/g,' ');
  const url=String(state.product.url||'').trim().toLowerCase().replace(/[?#].*$/,'');
  return `${title}|${url}`;
}
function classificationSeedText(){
  const title=String(state.product.title||'').trim();
  if(title)return title;
  try{
    const u=new URL(state.product.url||'');
    return decodeURIComponent(u.pathname).replace(/[-_/]+/g,' ').replace(/\b(dp|gp|product|itm)\b/gi,' ').replace(/\s+/g,' ').trim();
  }catch{return String(state.product.url||'').replace(/[-_/]+/g,' ').trim()}
}
async function ensureHsClassification({force=false,silent=true}={}){
  const fingerprint=productHsFingerprint();
  if(state.product.hsCode&&!force&&state.product.hsFingerprint===fingerprint)return state.product.hsCode;
  if(state.product.hsCode&&!force&&state.product.hsSource==="manual"&&!state.product.hsFingerprint){state.product.hsFingerprint=fingerprint;persistState();return state.product.hsCode;}
  const seed=classificationSeedText();
  if(!seed)return null;
  try{
    const data=await fetchJSON(`${CONFIG.apiBase}/api/hs-classify`,{method:"POST",body:JSON.stringify({title:seed})},18000);
    const c=data?.classification;
    if(!c?.code)return null;
    state.product.hsCode=String(c.code);state.product.hsConfidence=Number(c.confidence)||0;state.product.hsLabel=c.label||"";state.product.hsSource=c.source||"hs-backfill";state.product.hsReasoning=c.reasoningSummary||"";state.product.hsNeedsReview=Boolean(c.needsManualReview);state.product.hsFingerprint=fingerprint;
    invalidateCustoms();persistState();syncInputs();refreshAll();hydrateProvisionalCustoms();
    return state.product.hsCode;
  }catch(e){
    if(!silent){$("rateStatus").textContent=`HS : ${e.message||"classification indisponible"}`;$("statusDot").className="status-dot warn";}
    return null;
  }
}
async function refreshCustomsEstimate({silent=false,retries=2}={}){
  const ship=selectedShipping();if(!(ship?.rateUsd>0))return null;
  let payload,url;
  if(state.shippingMode==="consolidation"){
    const items=activeOrderItems({includeCurrent:true});
    if(items.length<2||items.some(i=>String(i.hsCode||'').replace(/\D/g,'').length<6))return null;
    url=`${CONFIG.apiBase}/api/customs-estimate-multi`;
    payload={items:items.map(i=>({title:i.title,hsCode:i.hsCode,itemUsd:Number(i.itemUsd||0)+Number(i.domesticUsd||0)})),freightUsd:ship.rateUsd,fallbackUsdRate:state.internalVisaRate,fallbackEurRate:state.internalVisaRate*1.1,incomeTaxPercent:5};
  }else{
    const hs=String(state.product.hsCode||"").replace(/\D/g,"");if(!(state.product.itemUsd>0&&hs.length>=6))return null;
    url=`${CONFIG.apiBase}/api/customs-estimate`;payload={hsCode:hs,itemUsd:state.product.itemUsd+state.product.domesticUsd,freightUsd:ship.rateUsd,fallbackUsdRate:state.internalVisaRate,fallbackEurRate:state.internalVisaRate*1.1,incomeTaxPercent:5};
  }
  hydrateProvisionalCustoms();state.customsLoading=true;refreshAll();let lastError=null;
  try{
    for(let attempt=0;attempt<=retries;attempt++){
      try{
        const data=await fetchJSON(url,{method:"POST",body:JSON.stringify(payload)},28000);state.customsEstimate=data;
        if(Number(data.exchangeRates?.USD)>1000)state.lastCustomsUsd=Number(data.exchangeRates.USD);if(Number(data.exchangeRates?.EUR)>1000)state.lastCustomsEur=Number(data.exchangeRates.EUR);
        if(state.shippingMode!=="consolidation"&&data.hs?.resolvedCode){state.product.hsCode=String(data.hs.resolvedCode);state.product.hsLabel=cleanHsDescription(data.hs.description)||state.product.hsLabel;}
        if(state.shippingMode==="consolidation"&&Array.isArray(data.items)){
          for(const line of data.items){const item=state.consolidationItems.find(i=>i.title===line.title);if(item)item.customsEstimate=line;}
        }
        state.customsContextKey=customsContextKey();state.customsReserve=Number(data.negotiatedMga)||state.customsReserve;persistState();return data;
      }catch(e){lastError=e;if(attempt<retries)await new Promise(r=>setTimeout(r,[300,900,1800][attempt]||1800));}
    }
    if(!silent){$("rateStatus").textContent=`Douane : ${lastError?.message||"estimation indisponible"}`;$("statusDot").className="status-dot warn";}return null;
  }finally{state.customsLoading=false;refreshAll()}
}
function scheduleCustomsRefresh(delay=180){clearTimeout(customsRefreshTimer);customsRefreshTimer=setTimeout(()=>refreshCustomsEstimate({silent:true,retries:2}),delay)}
async function refreshShipping({withCustoms=true}={}){
  const button=$("refreshShipping");button.disabled=true;button.textContent="Actualisation…";
  try{
    let data;
    if(state.shippingMode==="consolidation"){
      ensureConsolidationPackages();
      const packages=state.consolidationPackages.filter(packageComplete);
      if(packages.length<2)throw new Error("Complète au moins 2 colis pour la consolidation");
      data=await fetchJSON(`${CONFIG.apiBase}/api/consolidation-rates`,{method:"POST",body:JSON.stringify({warehouseId:state.warehouse,value:activeOrderItems({includeCurrent:true}).reduce((sum,i)=>sum+Number(i.itemUsd||0),0),packages,hasBattery:packages.some(p=>p.battery),largeBattery:packages.some(p=>p.largeBattery||Number(p.batteryWh)>=100)})},26000);
      state.consolidatedEstimate={...data.estimate.quote,count:data.estimate.packageCount,source:data.estimate.model,confidence:data.estimate.confidence};
      state.shippingRates=(data.carriers||[]).filter(r=>["DHL","FedEx"].includes(r.carrier));
      if(!state.shippingRates.length)throw new Error("Colis consolidé trop volumineux ou non admissible : il faut prévoir plusieurs envois");
      const preferred=data.preferredCarrier?bestRateForCarrier(data.preferredCarrier):null;
      state.selectedRate=preferred||bestRateForCarrier(state.selectedCarrier)||state.shippingRates[0]||null;
      if(state.selectedRate)state.selectedCarrier=state.selectedRate.carrier;
      const warning=data.warnings||[];
      if(warning.includes("LARGE_BATTERY_REVIEW")){$("rateStatus").textContent=`Consolidation estimée · batterie >100 Wh · FedEx uniquement · validation requise`;$("statusDot").className="status-dot warn"}
      else if(warning.includes("BATTERY_FEDEX_ONLY_PE_MG")){$("rateStatus").textContent=`Consolidation · batterie détectée · FedEx uniquement pour cet envoi`;$("statusDot").className="status-dot warn"}
      else if(warning.includes("LIMITED_CARRIER_OPTIONS")){$("rateStatus").textContent=`Consolidation optimisée · options transport limitées par le gabarit`;$("statusDot").className="status-dot warn"}
      else{$("rateStatus").textContent=`Consolidation optimisée · ${data.estimate.packageCount} colis regroupés`;$("statusDot").className="status-dot"}
    }else{
      const pkg=state.package;
      const payload={warehouseId:state.warehouse,city:"Antananarivo",postalcode:"101",weight:pkg.weight,length:pkg.length,width:pkg.width,height:pkg.height,value:state.product.itemUsd,hasBattery:Boolean(pkg.battery),largeBattery:Boolean(pkg.largeBattery||Number(pkg.batteryWh)>=100)};
      data=await fetchJSON(`${CONFIG.apiBase}/api/shipping-rates`,{method:"POST",body:JSON.stringify(payload)},22000);
      state.shippingRates=(data.carriers||[]).filter(r=>["DHL","FedEx"].includes(r.carrier));
      const batteryFedex=state.package.battery?bestRateForCarrier("FedEx"):null;
      const preferred=batteryFedex||bestRateForCarrier(state.selectedCarrier)||state.shippingRates[0]||null;state.selectedRate=preferred;if(preferred)state.selectedCarrier=preferred.carrier;
      const warnings=data.warnings||[];
      $("rateStatus").textContent=state.shippingRates.length?(state.package.largeBattery?"Batterie >100 Wh · FedEx uniquement · validation transport requise":warnings.includes("BATTERY_FEDEX_ONLY_PE_MG")?"Batterie détectée automatiquement · FedEx uniquement pour cet envoi":"Tarifs transport actualisés"):"Aucun tarif disponible";$("statusDot").className=state.package.battery?"status-dot warn":(state.shippingRates.length?"status-dot":"status-dot warn");
    }
  }catch(e){if(!state.shippingRates.length)state.selectedRate=null;$("rateStatus").textContent=state.shippingRates.length?"Actualisation transport indisponible · dernier tarif conservé":(e.message||"Moteur transport indisponible");$("statusDot").className="status-dot warn"}
  finally{button.disabled=false;button.innerHTML='<svg class="icon sm"><use href="#i-refresh"/></svg>Actualiser le transport';renderRates();persistState();refreshAll();if(withCustoms&&canRefreshCustoms())await refreshCustomsEstimate({silent:true,retries:2})}
}
async function analyzeProduct(){
  const nextUrl=$("productUrl").value.trim(),previousUrl=String(state.product.url||"").trim();
  const changed=Boolean(nextUrl&&previousUrl&&nextUrl!==previousUrl);
  state.product.url=nextUrl;
  if(changed){state.product.itemUsd=0;state.product.domesticUsd=0;state.product.title="";state.product.hsCode="";state.product.hsConfidence=0;state.product.hsLabel="";state.product.hsSource="";state.product.hsReasoning="";state.product.hsNeedsReview=false;state.product.hsFingerprint="";invalidateCustoms();state.shippingRates=[];state.selectedRate=null;renderRates();}
  persistState();if(!state.product.url){$("rateStatus").textContent="Colle un lien produit ou utilise la saisie manuelle";$("productDisclosure").open=true;return}
  const b=$("analyzeProduct");b.disabled=true;b.innerHTML='<img class="gemini-mark" src="assets/gemini-sparkle.svg" alt="" /><span>Analyse…</span><span class="gemini-badge">Gemini</span>';$("rateStatus").textContent="Analyse du produit avec Gemini…";
  try{
    const data=await fetchJSON(`${CONFIG.apiBase}/api/analyze`,{method:"POST",body:JSON.stringify({url:state.product.url})},22000);
    if(data.title)state.product.title=data.title.replace(/\s*\|\s*eBay.*$/i,"");
    if(data.hsClassification?.code){state.product.hsCode=String(data.hsClassification.code);state.product.hsConfidence=Number(data.hsClassification.confidence)||0;state.product.hsLabel=data.hsClassification.label||"";state.product.hsSource=data.hsClassification.source||"";state.product.hsReasoning=data.hsClassification.reasoningSummary||"";state.product.hsNeedsReview=Boolean(data.hsClassification.needsManualReview);state.product.hsFingerprint=productHsFingerprint();}
    else { state.product.hsCode=""; state.product.hsConfidence=0; state.product.hsLabel=""; state.product.hsSource=""; state.product.hsFingerprint=""; }
    invalidateCustoms();
    const basePrice=Number(data.priceUsd);
    const sellerShipping=(data.shippingUsd===null||data.shippingUsd===undefined)?NaN:Number(data.shippingUsd);
    const autoTotal=Number(data.totalPurchaseUsd);
    if(autoTotal>0) state.product.itemUsd=autoTotal;
    else if(basePrice>0) state.product.itemUsd=basePrice;
    else if(changed) state.product.itemUsd=0;
    // Le prix client affiché cumule déjà article + livraison vendeur détectée.
    state.product.domesticUsd=0;
    if(data.packageEstimate){const p=data.packageEstimate,f=data.shippingFlags||{};state.package={weight:Number(p.weightLb)||state.package.weight,length:Number(p.dimensionsIn?.length)||state.package.length,width:Number(p.dimensionsIn?.width)||state.package.width,height:Number(p.dimensionsIn?.height)||state.package.height,source:p.source||"estimé",confidence:Number(p.confidence)||0,battery:Boolean(f.battery),batteryWh:Number(f.batteryWh)||null,largeBattery:Boolean(f.largeBattery),batterySource:f.batterySource||"",batteryConfidence:Number(f.batteryConfidence)||0,batteryChemistry:f.batteryChemistry||"",batteryContainedInEquipment:f.batteryContainedInEquipment??null,batteryRemovable:f.batteryRemovable??null,batteryReasoning:f.batteryReasoning||""};state.consolidatedEstimate=null;if(state.shippingMode==="consolidation")syncConsolidationPackagesFromItems({includeCurrent:true})}
    syncInputs();
    if(!state.product.hsCode)await ensureHsClassification({silent:true});
    const platform=data.platform==="amazon"?"Amazon":"eBay";
    const shippingText=Number.isFinite(sellerShipping)?(sellerShipping>0?` · livraison vendeur ${fmtUSD(sellerShipping)} incluse`:` · livraison vendeur gratuite incluse`):` · livraison vendeur non détectée, à vérifier`;
    if(data.priceReliability==="indexed-verify" || data.shippingReliability==="unknown"){
      $("rateStatus").textContent=(autoTotal>0||basePrice>0)?`${platform} reconnu · prix auto ${fmtUSD(state.product.itemUsd)}${shippingText} · modifiable`:`${platform} reconnu · prix non détecté, saisis-le manuellement`;
      $("statusDot").className="status-dot warn";
      $("productDisclosure").open=true;
    }else{
      $("rateStatus").textContent=`${platform} analysé · prix ${fmtUSD(state.product.itemUsd)}${shippingText} · modifiable`;
      $("statusDot").className="status-dot";
    }
    await refreshShipping();
  }catch(e){$("rateStatus").textContent="Analyse auto indisponible · saisis le produit, le poids et les dimensions manuellement";$("statusDot").className="status-dot warn";$("productDisclosure").open=true}
  finally{b.disabled=false;b.innerHTML=ANALYZE_BUTTON_HTML;persistState();refreshAll()}
}

function nextQuoteNumber(){const d=new Date(),key=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;const store="evidyQuoteSequenceV1";let data={};try{data=JSON.parse(localStorage.getItem(store)||"{}")}catch{}data[key]=(data[key]||0)+1;localStorage.setItem(store,JSON.stringify(data));return `EV-${key}-${String(data[key]).padStart(3,"0")}`}
function quotePackageSnapshot(t=calculate()){
  const pkg=activeShippingPackage()||state.package;
  return{
    packageWeightKg:lbToKg(pkg.weight),
    packageLengthCm:inToCm(pkg.length),
    packageWidthCm:inToCm(pkg.width),
    packageHeightCm:inToCm(pkg.height),
    billableWeightKg:lbToKg(t?.billable||billableWeight()),
    packageSource:pkg.source||"estimé",
    consolidated:state.shippingMode==="consolidation",
    packageCount:state.shippingMode==="consolidation"?(pkg.count||state.consolidationPackages.filter(packageComplete).length):1
  }
}
function currentDraft(){
  const t=calculate(),base=state.editingQuoteBase;
  if(base){
    const dep=Number(base.depositPercent)||75,bal=100-dep,total=Number(base.totalMGA)||0;
    return{...base,depositPercent:dep,balancePercent:bal,depositMGA:Math.round(total*dep/100),balanceMGA:total-Math.round(total*dep/100),client:$("quoteClient").value.trim(),phone:$("quotePhone").value.trim(),validUntil:$("quoteValidity").value||defaultValidity(),note:$("quoteNote").value.trim()}
  }
  const total=t?.total||0,pay=paymentPlan(total,t?.coverageTarget||0),ce=state.customsEstimate;
  const rawItems=t?.items?.length?t.items:activeOrderItems({includeCurrent:true});
  const customsLines=Array.isArray(ce?.items)?ce.items:[];
  const items=rawItems.map((i,idx)=>({title:i.title||`Article ${idx+1}`,url:i.url||"",itemUsd:Number(i.itemUsd)||0,hsCode:i.hsCode||"",hsDescription:clientHsDescription(i.hsLabel,customsLines[idx]?.hs?.description)||""}));
  const consolidated=state.shippingMode==="consolidation"&&items.length>1;
  const productTitle=consolidated?`Consolidation de ${items.length} articles`:(items[0]?.title||state.product.title||"Article USA");
  const itemUsd=items.reduce((sum,i)=>sum+Number(i.itemUsd||0),0);
  const feesClientMGA=t?.feesClient||0,customsEstimatedMGA=t?.reserve||0;
  return{id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,number:state.draftNumber||nextQuoteNumber(),createdAt:isoDate(),validUntil:$("quoteValidity").value||defaultValidity(),client:$("quoteClient").value.trim(),phone:$("quotePhone").value.trim(),note:$("quoteNote").value.trim(),productTitle,productUrl:items[0]?.url||state.product.url,itemUsd,items,domesticUsd:t?.domesticUsd||0,visaRate:state.visaRate,shippingCarrier:t?.shipping?.carrier||state.selectedCarrier,shippingService:t?.shipping?.service||"",shippingUsd:t?.shipping?.rateUsd||0,totalMGA:total,feesClientMGA,importServiceMGA:customsEstimatedMGA+feesClientMGA,depositPercent:pay.depositPercent,balancePercent:pay.balancePercent,depositMGA:pay.deposit,balanceMGA:pay.balance,coverageTargetMGA:t?.coverageTarget||0,hsCode:consolidated?"":(items[0]?.hsCode||state.product.hsCode||""),hsDescription:consolidated?"":(items[0]?.hsDescription||clientHsDescription(state.product.hsLabel,ce?.hs?.description)||""),customsEstimatedMGA,customsNegotiatedMGA:negotiatedCustomsMGA(),customsAppliedMGA:customsEstimatedMGA,customsRegularization:true,...quotePackageSnapshot(t)};
}
function clientItemLines(q){
  const items=Array.isArray(q.items)&&q.items.length?q.items:[{title:q.productTitle||"Article USA",itemUsd:q.itemUsd||0,hsCode:q.hsCode||"",hsDescription:q.hsDescription||""}];
  return items.map((i,idx)=>`<div class="preview-line"><div><span>${items.length>1?`Article ${idx+1}`:"Article"}</span><strong>${escapeHTML(i.title||"Article USA")}</strong></div><strong>${escapeHTML(fmtUSD(Number(i.itemUsd)||0))}</strong></div>${i.hsCode?`<div class="preview-line hs-line"><div><span>Classification douanière</span><strong>Code HS indicatif</strong></div><strong>${escapeHTML(`HS ${formatHsCode(i.hsCode)}${clientHsDescription(i.hsDescription,"")?` · ${clientHsDescription(i.hsDescription,"")}`:""}`)}</strong></div>`:""}`).join("");
}
function renderDraftPreview(){
  const q=currentDraft();
  const l=Number(q.packageLengthCm)||state.package.length*2.54,d=Number(q.packageWidthCm)||state.package.width*2.54,h=Number(q.packageHeightCm)||state.package.height*2.54;
  const bill=Number(q.billableWeightKg)||billableWeight()*0.45359237;
  $("previewNumber").textContent=q.number;$("previewDate").textContent=`Émis le ${displayDate(q.createdAt)}`;$("previewClient").textContent=q.client||"Client non renseigné";
  $("previewTable").innerHTML=`${clientItemLines(q)}<div class="preview-line"><div><span>Dimensions du colis${q.consolidated?" consolidé":""}</span><strong>Estimation</strong></div><strong>${escapeHTML(`${fmtNumber(l,1)} × ${fmtNumber(d,1)} × ${fmtNumber(h,1)} cm`)}</strong></div><div class="preview-line"><div><span>Poids approximatif</span><strong>Poids retenu pour le transport</strong></div><strong>${escapeHTML(fmtNumber(bill,2))} kg</strong></div><div class="preview-line"><div><span>Transport international${q.consolidated?" consolidé":""}</span><strong>${escapeHTML(`${q.shippingCarrier||''} ${q.shippingService||''}`.trim())}</strong></div><strong>${escapeHTML(fmtUSD(q.shippingUsd))}</strong></div><div class="preview-line"><div><span>Taux VISA</span><strong>1 USD</strong></div><strong>${escapeHTML(fmtNumber(q.visaRate,2))} MGA</strong></div><div class="preview-line"><div><span>Importation & service</span><strong>Formalités, dédouanement estimatif et service eVidy inclus</strong></div><strong>${escapeHTML(fmtMGA(Number(q.importServiceMGA)||0,0))}</strong></div>`;
  $("previewTotal").textContent=fmtMGA(q.totalMGA,0);$("previewDeposit").textContent=fmtMGA(q.depositMGA,0);$("previewBalance").textContent=fmtMGA(q.balanceMGA,0);$("previewDepositLabel").textContent=`À la commande · ${q.depositPercent} %`;$("previewBalanceLabel").textContent=`Solde estimatif à l'arrivée · ${q.balancePercent} %`;
  const mandatoryNote=`Paiement en 2 étapes : ${q.depositPercent} % à la validation pour lancer l'achat et l'acheminement. « Importation & service » inclut les formalités, le dédouanement estimatif et le service eVidy. À l'arrivée, le solde est ajusté selon le dédouanement réellement facturé ; toute différence favorable est déduite.`;
  $("previewNote").textContent=q.note?`${mandatoryNote} Note : ${q.note}`:mandatoryNote;
}
function openQuote(q=null){
  if(q){state.editingQuoteId=q.id;state.editingQuoteBase={...q};state.draftNumber=q.number;$("quoteClient").value=q.client||"";$("quotePhone").value=q.phone||"";$("quoteValidity").value=q.validUntil||defaultValidity();$("quoteNote").value=q.note||"";$("quoteSheetTitle").textContent=`Devis ${q.number}`;$("deleteCurrentQuote").style.display="flex"}
  else{const t=calculate();if(!t){$("rateStatus").textContent="Charge d'abord un tarif transport";return}state.editingQuoteId=null;state.editingQuoteBase=null;state.draftNumber=nextQuoteNumber();$("quoteClient").value="";$("quotePhone").value="";$("quoteValidity").value=defaultValidity();$("quoteNote").value="";$("quoteSheetTitle").textContent="Nouveau devis";$("deleteCurrentQuote").style.display="none"}
  $("quoteSheetSub").textContent="Compléter le client puis enregistrer ou imprimer";$("quoteSheet").classList.add("open");document.body.style.overflow="hidden";renderDraftPreview();
}
function closeQuote(){$("quoteSheet").classList.remove("open");document.body.style.overflow="";state.editingQuoteId=null;state.editingQuoteBase=null;state.draftNumber=null}
function persistQuotes(){localStorage.setItem("evidyQuotesV1",JSON.stringify(state.quotes))}
function saveQuote(){const q=currentDraft();if(!(q.totalMGA>0)){ $("quoteSheetSub").textContent="Calcule d'abord un devis valide.";return }const i=state.quotes.findIndex(x=>x.id===q.id);if(i>=0)state.quotes[i]=q;else state.quotes.unshift(q);state.quotes=state.quotes.slice(0,100);persistQuotes();state.editingQuoteId=q.id;state.editingQuoteBase={...q};$("quoteSheetTitle").textContent=`Devis ${q.number}`;$("quoteSheetSub").textContent="Enregistré sur cet appareil";$("deleteCurrentQuote").style.display="flex";renderQuotes()}
function renderQuotes(){const box=$("quotesContainer");if(!state.quotes.length){box.innerHTML='<div class="quotes-empty"><div class="empty-orb"><svg class="icon lg"><use href="#i-file"/></svg></div><h3>Aucun devis</h3><p>Crée un devis depuis le calcul client. Il apparaîtra ici pour être réouvert ou imprimé.</p><button class="secondary" data-new-quote><svg class="icon sm"><use href="#i-plus"/></svg>Nouveau devis</button></div>';return}box.innerHTML=`<div class="quote-list">${state.quotes.map(q=>`<div class="quote-item" data-open-quote="${escapeHTML(q.id)}"><div class="quote-icon"><svg class="icon"><use href="#i-file"/></svg></div><div class="quote-main"><strong>${escapeHTML(q.client||q.number)}</strong><span>${escapeHTML(q.number)} · ${escapeHTML(displayDate(q.createdAt))}</span></div><div class="quote-amount">${escapeHTML(fmtMGA(q.totalMGA,0))}</div></div>`).join("")}</div>`}
function quoteText(q){
  const l=Number(q.packageLengthCm)||state.package.length*2.54,d=Number(q.packageWidthCm)||state.package.width*2.54,h=Number(q.packageHeightCm)||state.package.height*2.54,bill=Number(q.billableWeightKg)||billableWeight()*0.45359237;
  const items=Array.isArray(q.items)&&q.items.length?q.items:[{title:q.productTitle||"Article USA",itemUsd:q.itemUsd||0,hsCode:q.hsCode||"",hsDescription:q.hsDescription||""}];
  const itemLines=items.map((i,idx)=>`${items.length>1?`Article ${idx+1}`:"Article"} : ${i.title||"Article USA"}\nPrix : ${fmtUSD(Number(i.itemUsd)||0)}${i.hsCode?`\nCode HS indicatif : HS ${formatHsCode(i.hsCode)}${clientHsDescription(i.hsDescription,"")?` · ${clientHsDescription(i.hsDescription,"")}`:""}`:""}`).join("\n\n");
  return `DEVIS ${q.number}\nClient : ${q.client||"—"}${q.phone?`\nTéléphone : ${q.phone}`:""}\n${itemLines}\n\nDimensions du colis${q.consolidated?" consolidé":""} : ${fmtNumber(l,1)} × ${fmtNumber(d,1)} × ${fmtNumber(h,1)} cm\nPoids approximatif : ${fmtNumber(bill,2)} kg\nTransport : ${q.shippingCarrier||"—"} ${q.shippingService||""} · ${fmtUSD(q.shippingUsd)}\nTaux VISA : 1 USD = ${fmtNumber(q.visaRate,2)} MGA\nImportation & service : ${fmtMGA(Number(q.importServiceMGA)||0,0)}\nTOTAL ESTIMATIF : ${fmtMGA(q.totalMGA,0)}\n1er paiement (${q.depositPercent} %) à la commande : ${fmtMGA(q.depositMGA,0)}\nSolde estimatif (${q.balancePercent} %) à l'arrivée : ${fmtMGA(q.balanceMGA,0)}\n« Importation & service » inclut les formalités, le dédouanement estimatif et le service eVidy. À l'arrivée, le solde est ajusté selon le dédouanement réellement facturé ; toute différence favorable est déduite.${q.note?`\nNote : ${q.note}`:""}`
}
async function copyCurrentQuote(){const q=currentDraft();try{await navigator.clipboard.writeText(quoteText(q));$("quoteSheetSub").textContent="Devis copié dans le presse-papiers"}catch{$("quoteSheetSub").textContent="Copie indisponible sur ce navigateur"}}
function renderPrint(q){
  const l=Number(q.packageLengthCm)||state.package.length*2.54,d=Number(q.packageWidthCm)||state.package.width*2.54,h=Number(q.packageHeightCm)||state.package.height*2.54,bill=Number(q.billableWeightKg)||billableWeight()*0.45359237;
  const items=Array.isArray(q.items)&&q.items.length?q.items:[{title:q.productTitle||"Article USA",itemUsd:q.itemUsd||0,hsCode:q.hsCode||"",hsDescription:q.hsDescription||""}];
  const itemRows=items.map((i,idx)=>`<tr><td>${escapeHTML(i.title||`Article ${idx+1}`)}</td><td>Prix article</td><td>${escapeHTML(fmtUSD(Number(i.itemUsd)||0))}</td></tr>${i.hsCode?`<tr><td>Classification douanière</td><td>Code HS indicatif</td><td>${escapeHTML(`HS ${formatHsCode(i.hsCode)}${clientHsDescription(i.hsDescription,"")?` · ${clientHsDescription(i.hsDescription,"")}`:""}`)}</td></tr>`:""}`).join("");
  $("printStage").innerHTML=`<article class="print-page"><header class="print-head"><div class="print-brand"><img src="assets/evidy-mark.svg" style="width:42px;height:42px"><div><strong>eVidy US</strong><span>Devis d'achat assisté</span></div></div><div class="print-title"><h1>DEVIS</h1><p>${escapeHTML(q.number)} · ${escapeHTML(displayDate(q.createdAt))}</p></div></header><section class="print-client"><div class="print-block"><span>Client</span><strong>${escapeHTML(q.client||"Client non renseigné")}${q.phone?`<br>${escapeHTML(q.phone)}`:""}</strong></div></section><table class="print-table"><thead><tr><th>Description</th><th>Détail</th><th>Montant / mesure</th></tr></thead><tbody>${itemRows}<tr><td>Dimensions du colis${q.consolidated?" consolidé":""}</td><td>Estimation</td><td>${escapeHTML(`${fmtNumber(l,1)} × ${fmtNumber(d,1)} × ${fmtNumber(h,1)} cm`)}</td></tr><tr><td>Poids approximatif</td><td>Poids retenu pour le transport</td><td>${escapeHTML(fmtNumber(bill,2))} kg</td></tr><tr><td>Transport international${q.consolidated?" consolidé":""}</td><td>${escapeHTML(`${q.shippingCarrier||''} ${q.shippingService||''}`.trim())}</td><td>${escapeHTML(fmtUSD(q.shippingUsd))}</td></tr><tr><td>Taux VISA</td><td>1 USD</td><td>${escapeHTML(fmtNumber(q.visaRate,2))} MGA</td></tr><tr><td>Importation & service</td><td>Formalités, dédouanement estimatif et service eVidy</td><td>${escapeHTML(fmtMGA(Number(q.importServiceMGA)||0,0))}</td></tr></tbody></table><div class="print-total"><span>Total estimatif</span><strong>${escapeHTML(fmtMGA(q.totalMGA,0))}</strong></div><div class="print-payments"><div><span>À la commande · ${q.depositPercent} %</span><strong>${escapeHTML(fmtMGA(q.depositMGA,0))}</strong></div><div><span>Solde estimatif à l'arrivée · ${q.balancePercent} %</span><strong>${escapeHTML(fmtMGA(q.balanceMGA,0))}</strong></div></div><p class="print-note">« Importation & service » inclut les formalités, le dédouanement estimatif et le service eVidy. À l'arrivée, le solde est ajusté selon le dédouanement réellement facturé ; toute différence favorable est déduite.</p>${q.note?`<p class="print-note"><strong>Note :</strong> ${escapeHTML(q.note)}</p>`:""}<footer class="print-footer"><span>eVidy US · Service opéré par PREST OFFICE</span><span>${escapeHTML(q.number)}</span></footer></article>`;
}
function printAnyQuote(q){if(!q?.totalMGA)return;renderPrint(q);setTimeout(()=>window.print(),60)}
function readProductInputs(){
  const nextUrl=$("productUrl").value.trim();
  if(nextUrl!==state.product.url){state.product.url=nextUrl;state.product.hsCode="";state.product.hsConfidence=0;state.product.hsLabel="";state.product.hsSource="";state.product.hsReasoning="";state.product.hsNeedsReview=false;state.product.hsFingerprint="";state.customsEstimate=null;state.customsReserve=200000;state.customsActualMga=0;}
  state.product.itemUsd=num($("clientAmount").value);state.product.domesticUsd=num($("domesticUsd").value);
  state.package.weight=num($("weightLb").value);state.package.length=num($("lengthIn").value);state.package.width=num($("widthIn").value);state.package.height=num($("heightIn").value);
  state.warehouse=$("warehouse").value;
  if(state.shippingMode==="consolidation")syncConsolidationPackagesFromItems({includeCurrent:true})
  state.consolidatedEstimate=null;state.shippingRates=[];state.selectedRate=null;renderRates();syncManualUnitInputs();persistState();refreshAll()
}
function readFinancialInputs(){
  state.peFeesUsd=num($("peFeesUsd").value);state.consolidationFeeUsd=num($("consolidationFeeUsd").value);state.localDelivery=num($("localDelivery").value);
  const clientRate=num($("visaRateManual").value),internalRate=num($("internalVisaRateManual").value);
  if(clientRate>=100)state.visaRate=clientRate;if(internalRate>=100)state.internalVisaRate=internalRate;
  state.paymentMethod=$("paymentMethod").value==="wallet"?"wallet":"direct";persistState();refreshAll();
}
function updateManualUnitHints(){
  if(!$("manualWeightMetric"))return;
  const metric=state.unitSystem==="metric";
  $("manualWeightLabel").textContent=metric?"Poids kg":"Poids lb";
  $("manualLengthLabel").textContent=metric?"L cm":"L in";$("manualWidthLabel").textContent=metric?"W cm":"W in";$("manualHeightLabel").textContent=metric?"H cm":"H in";
  $("manualWeightMetric").textContent=metric?`(${fmtNumber(state.package.weight,2)} lb)`:`(${fmtNumber(lbToKg(state.package.weight),2)} kg)`;
  $("manualLengthMetric").textContent=metric?`(${fmtNumber(state.package.length,1)} in)`:`(${fmtNumber(inToCm(state.package.length),1)} cm)`;
  $("manualWidthMetric").textContent=metric?`(${fmtNumber(state.package.width,1)} in)`:`(${fmtNumber(inToCm(state.package.width),1)} cm)`;
  $("manualHeightMetric").textContent=metric?`(${fmtNumber(state.package.height,1)} in)`:`(${fmtNumber(inToCm(state.package.height),1)} cm)`;
}
function syncManualUnitInputs(){
  const metric=state.unitSystem==="metric";
  $("manualWeightLb").value=(metric?lbToKg(state.package.weight):state.package.weight).toFixed(2);
  $("manualLengthIn").value=(metric?inToCm(state.package.length):state.package.length).toFixed(1);
  $("manualWidthIn").value=(metric?inToCm(state.package.width):state.package.width).toFixed(1);
  $("manualHeightIn").value=(metric?inToCm(state.package.height):state.package.height).toFixed(1);
  updateManualUnitHints();
}
function readManualUnitInputs(event=null){
  state.product.title=$("productTitleManual").value.trim();state.package.battery=Boolean($("manualBattery").checked);if(event?.target?.id==="manualBattery"){state.package.batterySource="manual";state.package.batteryConfidence=1;state.package.batteryReasoning="Correction manuelle eVidy";}const metric=state.unitSystem==="metric";
  const weight=num($("manualWeightLb").value),l=num($("manualLengthIn").value),w=num($("manualWidthIn").value),h=num($("manualHeightIn").value);
  if(weight>0)state.package.weight=metric?kgToLb(weight):weight;if(l>0)state.package.length=metric?cmToIn(l):l;if(w>0)state.package.width=metric?cmToIn(w):w;if(h>0)state.package.height=metric?cmToIn(h):h;
  $("weightLb").value=state.package.weight.toFixed(2);$("lengthIn").value=state.package.length.toFixed(2);$("widthIn").value=state.package.width.toFixed(2);$("heightIn").value=state.package.height.toFixed(2);
  if(state.shippingMode==="consolidation")syncConsolidationPackagesFromItems({includeCurrent:true})
  state.consolidatedEstimate=null;
  state.shippingRates=[];state.selectedRate=null;renderRates();updateManualUnitHints();persistState();refreshAll()
}
function renderShippingControls(renderPackages=true){
  $$("[data-unit-system]").forEach(b=>b.classList.toggle("active",b.dataset.unitSystem===state.unitSystem));
  $$("[data-shipping-mode]").forEach(b=>b.classList.toggle("active",b.dataset.shippingMode===state.shippingMode));
  $("consolidationPanel").hidden=state.shippingMode!=="consolidation";
  $("itemPriceLabel").textContent=state.shippingMode==="consolidation"?"Prix de l’article en cours":"Prix de l'article";
  if(state.shippingMode==="consolidation"){
    ensureConsolidationPackages();if(renderPackages)renderConsolidationPackages();
    const pkg=state.consolidatedEstimate||estimateConsolidatedPackage();
    $("consolidationEstimate").textContent=pkg?`${state.consolidatedEstimate?"Estimation intelligente":"Pré-estimation"} : ${pkg.count||state.consolidationPackages.filter(packageComplete).length} colis · ${fmtNumber(pkg.weight,2)} lb (${fmtNumber(lbToKg(pkg.weight),2)} kg) · ${fmtNumber(pkg.length,1)} × ${fmtNumber(pkg.width,1)} × ${fmtNumber(pkg.height,1)} in`:`Complète au moins 2 colis pour calculer l'envoi groupé.`;
  }
}
function packageDisplayValue(value,type){
  if(state.unitSystem==="us")return Number(value||0);
  return type==="weight"?lbToKg(value||0):inToCm(value||0);
}
function packageUnit(type){return state.unitSystem==="us"?(type==="weight"?"lb":"in"):(type==="weight"?"kg":"cm")}
function renderConsolidationPackages(){
  ensureConsolidationPackages();const box=$("consolidationPackages");
  const archived=(state.consolidationItems||[]).map((i,idx)=>{const p=i.package||{};const hs=i.hsCode?`HS ${formatHsCode(i.hsCode)}`:"HS à vérifier";const batt=p.battery?`Batterie${p.batteryWh?` · ${fmtNumber(p.batteryWh,0)} Wh`:""}`:"Sans batterie détectée";return `<div class="consolidation-item-card" data-item-id="${escapeHTML(i.id)}"><div class="consolidation-item-top"><strong>${idx+1}. ${escapeHTML(i.title||"Article")}</strong><button type="button" data-remove-consolidation-item="${escapeHTML(i.id)}">Retirer</button></div><div class="consolidation-item-meta"><span>${escapeHTML(fmtUSD(Number(i.itemUsd)||0))}</span><span>${escapeHTML(hs)}</span><span>${escapeHTML(batt)}</span><span>${fmtNumber(p.weight||0,2)} lb · ${fmtNumber(p.length||0,1)} × ${fmtNumber(p.width||0,1)} × ${fmtNumber(p.height||0,1)} in</span></div></div>`}).join("");
  const cur=currentItemSnapshot();
  const current=cur?`<div class="consolidation-item-card consolidation-current"><div class="consolidation-item-top"><strong>En cours · ${escapeHTML(cur.title||"Article")}</strong><span style="font-size:8.5px;color:var(--muted)">sera inclus au calcul</span></div><div class="consolidation-item-meta"><span>${escapeHTML(fmtUSD(Number(cur.itemUsd)||0))}</span><span>${cur.hsCode?`HS ${escapeHTML(formatHsCode(cur.hsCode))}`:"HS à vérifier"}</span><span>${cur.package?.battery?"Batterie détectée":"Sans batterie détectée"}</span></div></div>`:"";
  box.innerHTML=archived+current || '<div class="consolidation-note">Analyse un article, puis ajoute-le à la consolidation.</div>';
}
function setUnitSystem(mode){
  if(!["us","metric"].includes(mode)||mode===state.unitSystem)return;state.unitSystem=mode;syncManualUnitInputs();renderConsolidationPackages();renderShippingControls(false);persistState()
}
function setShippingMode(mode){
  if(!["single","consolidation"].includes(mode)||mode===state.shippingMode)return;
  if(mode==="consolidation"){
    const hadCurrent=Boolean(currentItemSnapshot());
    state.shippingMode="consolidation";
    if(hadCurrent)archiveCurrentForConsolidation({clear:true});
    else syncConsolidationPackagesFromItems({includeCurrent:true});
    syncInputs();
    $("productDisclosure").open=true;
    $("rateStatus").textContent=hadCurrent?"Premier article enregistré · analyse maintenant le suivant":"Consolidation activée · analyse le premier article";
  }else{
    state.shippingMode="single";
    state.consolidatedEstimate=null;state.shippingRates=[];state.selectedRate=null;invalidateCustoms();
    $("rateStatus").textContent="Colis unique activé · recalcule le transport";
  }
  renderRates();renderShippingControls(true);persistState();refreshAll();$("statusDot").className="status-dot warn";
}
function readConsolidationPackageInput(target){
  const row=target.closest("[data-package-index]");if(!row)return;const idx=Number(row.dataset.packageIndex),field=target.dataset.pkgField;if(!field||!state.consolidationPackages[idx])return;
  if(field==="battery")state.consolidationPackages[idx].battery=Boolean(target.checked);
  else {const value=num(target.value);state.consolidationPackages[idx][field]=state.unitSystem==="metric"?(field==="weight"?kgToLb(value):cmToIn(value)):value;}
  state.consolidatedEstimate=null;state.shippingRates=[];state.selectedRate=null;persistState();renderShippingControls(false);refreshAll()
}
function readHsManual(){state.product.hsCode=String($("hsCodeManual")?.value||"").replace(/\D/g,"").slice(0,10);state.product.hsConfidence=0;state.product.hsLabel=state.product.hsCode?"Saisi manuellement":"";state.product.hsSource=state.product.hsCode?"manual":"";state.product.hsReasoning="";state.product.hsNeedsReview=false;state.product.hsFingerprint=state.product.hsCode?productHsFingerprint():"";invalidateCustoms();persistState();refreshAll();if(state.product.hsCode.length>=6)scheduleCustomsRefresh()}
function readCustomsActual(){state.customsActualMga=Math.max(0,Math.round(num($("customsActual")?.value)));persistState();refreshAll()}
function syncAmountFromClient(){state.product.itemUsd=num($("clientAmount").value);$("internalAmount").value=fmtNumber(state.product.itemUsd,2);invalidateCustoms();persistState();refreshAll();scheduleCustomsRefresh(250)}
function syncAmountFromInternal(){state.product.itemUsd=num($("internalAmount").value);$("clientAmount").value=fmtNumber(state.product.itemUsd,2);invalidateCustoms();persistState();refreshAll();scheduleCustomsRefresh(250)}

$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$$('[data-carrier]').forEach(b=>b.addEventListener('click',()=>{if(b.disabled)return;state.selectedCarrier=b.dataset.carrier;state.selectedRate=bestRateForCarrier(state.selectedCarrier);persistState();refreshAll();scheduleCustomsRefresh(50)}));
$("topTransport").addEventListener("click",()=>{state.selectedCarrier=orderHasBattery()?"FedEx":(state.selectedCarrier==="DHL"?"FedEx":"DHL");state.selectedRate=bestRateForCarrier(state.selectedCarrier);persistState();refreshAll();scheduleCustomsRefresh(50)});
$("clientAmount").addEventListener("input",syncAmountFromClient);$("internalAmount").addEventListener("input",syncAmountFromInternal);
$("hsCodeManual").addEventListener("input",readHsManual);
["productUrl","weightLb","lengthIn","widthIn","heightIn","warehouse","domesticUsd"].forEach(id=>$(id).addEventListener("input",readProductInputs));
["peFeesUsd","consolidationFeeUsd","localDelivery","visaRateManual","internalVisaRateManual"].forEach(id=>$(id).addEventListener("input",readFinancialInputs));
$("paymentMethod").addEventListener("change",readFinancialInputs);
$("customsActual").addEventListener("input",readCustomsActual);
["productTitleManual","manualWeightLb","manualLengthIn","manualWidthIn","manualHeightIn","manualBattery"].forEach(id=>$(id).addEventListener("input",e=>readManualUnitInputs(e)));
$("manualShipping").addEventListener("click",async()=>{readManualUnitInputs();await refreshShipping()});
$("unitSwitch").addEventListener("click",e=>{const b=e.target.closest("[data-unit-system]");if(b)setUnitSystem(b.dataset.unitSystem)});
$("shippingModeSwitch").addEventListener("click",e=>{const b=e.target.closest("[data-shipping-mode]");if(b)setShippingMode(b.dataset.shippingMode)});
$("addConsolidationPackage").addEventListener("click",()=>{
  if(state.shippingMode!=="consolidation")return;
  if(!archiveCurrentForConsolidation({clear:true})){$("rateStatus").textContent="Analyse d’abord l’article à ajouter";$("statusDot").className="status-dot warn";return}
  syncInputs();renderConsolidationPackages();renderShippingControls(false);refreshAll();$("productDisclosure").open=true;$("productUrl").focus();$("rateStatus").textContent="Article enregistré · analyse le suivant";$("statusDot").className="status-dot";
});
$("consolidationPackages").addEventListener("click",e=>{
  const b=e.target.closest("[data-remove-consolidation-item]");if(!b)return;
  const id=b.dataset.removeConsolidationItem;state.consolidationItems=state.consolidationItems.filter(i=>String(i.id)!==String(id));syncConsolidationPackagesFromItems({includeCurrent:true});state.consolidatedEstimate=null;state.shippingRates=[];state.selectedRate=null;invalidateCustoms();renderRates();renderConsolidationPackages();renderShippingControls(false);persistState();refreshAll();
});
$("analyzeProduct").addEventListener("click",analyzeProduct);$("refreshShipping").addEventListener("click",()=>refreshShipping({withCustoms:true}));$("refreshRates").addEventListener("click",refreshEverything);
$("internalRates").addEventListener("click",e=>{const row=e.target.closest("[data-rate-id]");if(!row)return;const rate=state.shippingRates.find(r=>String(r.id)===row.dataset.rateId);if(rate){state.selectedRate=rate;state.selectedCarrier=rate.carrier;renderRates();persistState();refreshAll();scheduleCustomsRefresh(50)}});
$("openQuote").addEventListener("click",()=>openQuote());$("newQuoteTop").addEventListener("click",()=>openQuote());$("closeQuote").addEventListener("click",closeQuote);$("quoteSheet").addEventListener("click",e=>{if(e.target===$("quoteSheet"))closeQuote()});
["quoteClient","quotePhone","quoteValidity","quoteNote"].forEach(id=>$(id).addEventListener("input",renderDraftPreview));
$("saveQuote").addEventListener("click",saveQuote);$("copyQuote").addEventListener("click",copyCurrentQuote);$("printQuote").addEventListener("click",()=>printAnyQuote(currentDraft()));
$("deleteCurrentQuote").addEventListener("click",()=>{if(!state.editingQuoteId||!confirm("Supprimer définitivement ce devis ?"))return;state.quotes=state.quotes.filter(q=>q.id!==state.editingQuoteId);persistQuotes();closeQuote();setView("quotes");renderQuotes()});
$("quotesContainer").addEventListener("click",e=>{const n=e.target.closest("[data-new-quote]");if(n){openQuote();return}const row=e.target.closest("[data-open-quote]");if(row){const q=state.quotes.find(x=>x.id===row.dataset.openQuote);if(q)openQuote(q)}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("quoteSheet").classList.contains("open"))closeQuote()});

repairPersistedContext();
syncInputs();renderRates();renderQuotes();refreshAll();$("quoteValidity").value=defaultValidity();
if(state.ratesDate){const d=new Date(state.ratesDate);if(!Number.isNaN(d.valueOf()))$("rateStatus").textContent=`Données locales chargées · mise à jour automatique`}
else $("rateStatus").textContent="Initialisation automatique…";
requestAnimationFrame(()=>{refreshEverything().catch(()=>{})});
