const CONFIG={
  visaApiUrls:["https://usa.visa.com/cmsapi/fx/rates","https://www.visa.com/cmsapi/fx/rates"],
  destinationCurrency:"MGA",
  visaBankFeePercent:4,
  cardFeePercent:3,
  fixedVisaFeeMGA:4500,
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
const LB_PER_KG=2.2046226218,CM_PER_IN=2.54;
const lbToKg=lb=>Number(lb)/LB_PER_KG,kgToLb=kg=>Number(kg)*LB_PER_KG,inToCm=inch=>Number(inch)*CM_PER_IN,cmToIn=cm=>Number(cm)/CM_PER_IN;
const isoDate=()=>new Date().toISOString().slice(0,10);
const displayDate=s=>{if(!s)return"—";const d=new Date(`${s}T12:00:00`);return Number.isNaN(d.valueOf())?s:new Intl.DateTimeFormat("fr-FR").format(d)};
const defaultValidity=()=>isoDate();
const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const saved=(()=>{try{return JSON.parse(localStorage.getItem("evidyStateV1")||"{}")}catch{return {}}})();
const state={
  view:"client",
  visaRate:Number(saved.visaRate)||CONFIG.fallbackVisaRate,
  ratesDate:saved.ratesDate||null,
  product:{url:saved.product?.url||"",title:saved.product?.title||"",itemUsd:Number(saved.product?.itemUsd)||551.99,domesticUsd:Number(saved.product?.domesticUsd)||0,hsCode:saved.product?.hsCode||"",hsConfidence:Number(saved.product?.hsConfidence)||0,hsLabel:saved.product?.hsLabel||"",hsSource:saved.product?.hsSource||""},
  package:{weight:Number(saved.package?.weight)||2.5,length:Number(saved.package?.length)||11,width:Number(saved.package?.width)||9,height:Number(saved.package?.height)||4,source:saved.package?.source||"manuel",confidence:Number(saved.package?.confidence)||0,battery:Boolean(saved.package?.battery),batteryWh:Number(saved.package?.batteryWh)||null,largeBattery:Boolean(saved.package?.largeBattery)},
  unitSystem:saved.unitSystem==="metric"?"metric":"us",
  shippingMode:saved.shippingMode==="consolidation"?"consolidation":"single",
  consolidationPackages:Array.isArray(saved.consolidationPackages)?saved.consolidationPackages.map(p=>({weight:Number(p.weight)||0,length:Number(p.length)||0,width:Number(p.width)||0,height:Number(p.height)||0,battery:Boolean(p.battery)})):[],
  consolidatedEstimate:saved.consolidatedEstimate&&typeof saved.consolidatedEstimate==="object"?saved.consolidatedEstimate:null,
  warehouse:String(saved.warehouse||"4"),
  customsReserve:Number(saved.customsReserve)||200000,
  peFeesUsd:Number(saved.peFeesUsd)||CONFIG.peDefaultFeeUSD,
  consolidationFeeUsd:Number.isFinite(Number(saved.consolidationFeeUsd))?Number(saved.consolidationFeeUsd):8,
  localDelivery:Number(saved.localDelivery)||0,
  shippingRates:Array.isArray(saved.shippingRates)?saved.shippingRates.filter(r=>r&&Number(r.rateUsd)>0):[],selectedRate:saved.selectedRate&&Number(saved.selectedRate.rateUsd)>0?saved.selectedRate:null,selectedCarrier:saved.selectedCarrier||"DHL",
  quotes:(()=>{try{return JSON.parse(localStorage.getItem("evidyQuotesV1")||"[]")}catch{return []}})(),
  editingQuoteId:null,editingQuoteBase:null,draftNumber:null,lastCalc:null
};

function persistState(){
  try{localStorage.setItem("evidyStateV1",JSON.stringify({visaRate:state.visaRate,ratesDate:state.ratesDate,product:state.product,package:state.package,unitSystem:state.unitSystem,shippingMode:state.shippingMode,consolidationPackages:state.consolidationPackages,consolidatedEstimate:state.consolidatedEstimate,warehouse:state.warehouse,customsReserve:state.customsReserve,peFeesUsd:state.peFeesUsd,consolidationFeeUsd:state.consolidationFeeUsd,localDelivery:state.localDelivery,shippingRates:state.shippingRates,selectedRate:state.selectedRate,selectedCarrier:state.selectedCarrier}))}catch{}
}
function serviceRate(itemUsd){return itemUsd<=350?.30:itemUsd<=900?.25:.15}
function serviceFeeMGA(itemUsd,domesticUsd,rate){
  const base=(itemUsd+domesticUsd)*rate,tier=serviceRate(itemUsd);
  const floor350=350*rate*.30,floor900=900*rate*.25;
  const continuity=itemUsd>900?floor900:itemUsd>350?floor350:0;
  return Math.round(Math.max(base*tier,CONFIG.minimumServiceFeeMGA,continuity));
}
function cardFeeMGA(base){return Math.round(base*CONFIG.cardFeePercent/100+CONFIG.fixedVisaFeeMGA)}
function packageComplete(p){return p&&[p.weight,p.length,p.width,p.height].every(v=>Number(v)>0)}
function ensureConsolidationPackages(){
  if(!Array.isArray(state.consolidationPackages))state.consolidationPackages=[];
  if(!state.consolidationPackages.length)state.consolidationPackages=[{...state.package},{weight:0,length:0,width:0,height:0,battery:false}];
  else state.consolidationPackages[0]={...state.package};
  while(state.consolidationPackages.length<2)state.consolidationPackages.push({weight:0,length:0,width:0,height:0,battery:false});
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
function billableWeight(){const p=activeShippingPackage();return p?Math.ceil(Math.max(p.weight,p.length*p.width*p.height/166)):0}
function bestRateForCarrier(carrier){return state.shippingRates.filter(r=>r.carrier===carrier).sort((a,b)=>a.rateUsd-b.rateUsd)[0]||null}
function selectedShipping(){return state.selectedRate||bestRateForCarrier(state.selectedCarrier)}
function calculate(){
  const item=state.product.itemUsd,domestic=state.product.domesticUsd,rate=state.visaRate,ship=selectedShipping();
  if(!(item>0&&rate>0&&ship?.rateUsd>0))return null;
  const consolidationFee=state.shippingMode==="consolidation"?state.consolidationFeeUsd:0;
  const purchaseMga=(item+domestic)*rate,freightMga=(ship.rateUsd+state.peFeesUsd+consolidationFee)*rate;
  const cardPurchase=cardFeeMGA(purchaseMga),cardFreight=cardFeeMGA(freightMga),service=serviceFeeMGA(item,domestic,rate);
  const cost=purchaseMga+freightMga+cardPurchase+cardFreight+state.customsReserve+state.localDelivery;
  const total=roundUpTo(cost+service,1000),profit=total-cost;
  return{itemUsd:item,domesticUsd:domestic,visaRate:rate,shipping:ship,peFeesUsd:state.peFeesUsd,consolidationFeeUsd:consolidationFee,purchaseMga,freightMga,cardPurchase,cardFreight,cardFees:cardPurchase+cardFreight,reserve:state.customsReserve,localDelivery:state.localDelivery,serviceFee:service,cost,total,profit,rateTier:serviceRate(item),billable:billableWeight(),feesClient:Math.max(0,total-(item+domestic+ship.rateUsd)*rate)};
}
function paymentPlan(total,cost=0){
  const safeTotal=Math.max(0,Math.round(Number(total)||0));
  const deposit=Math.round(safeTotal*.75),balance=safeTotal-deposit,safeCost=Math.max(0,Math.round(Number(cost)||0));
  return{depositPercent:75,balancePercent:25,deposit,balance,gap:Math.max(0,safeCost-deposit),coverage:deposit-safeCost};
}

function syncInputs(){
  $("productUrl").value=state.product.url; $("clientAmount").value=fmtNumber(state.product.itemUsd,2); $("internalAmount").value=fmtNumber(state.product.itemUsd,2);
  $("productTitleManual").value=state.product.title||""; $("manualBattery").checked=Boolean(state.package.battery);
  syncManualUnitInputs();
  $("weightLb").value=Number(state.package.weight).toFixed(2); $("lengthIn").value=Number(state.package.length).toFixed(2); $("widthIn").value=Number(state.package.width).toFixed(2); $("heightIn").value=Number(state.package.height).toFixed(2);
  $("warehouse").value=state.warehouse; $("domesticUsd").value=state.product.domesticUsd; $("customsReserve").value=state.customsReserve; $("peFeesUsd").value=state.peFeesUsd; $("consolidationFeeUsd").value=state.consolidationFeeUsd; $("localDelivery").value=state.localDelivery; $("visaRateManual").value=state.visaRate.toFixed(2); $("hsCodeManual").value=state.product.hsCode||"";
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
  updateManualUnitHints();renderShippingControls(false);const hsMeta=$("hsCodeMeta");if(hsMeta)hsMeta.textContent=state.product.hsCode?`${state.product.hsCode}${state.product.hsConfidence?` · ${fmtNumber(state.product.hsConfidence*100,0)} %`:''}${state.product.hsLabel?` · ${state.product.hsLabel}`:''}`:"—";
  $$("[data-carrier]").forEach(b=>b.classList.toggle("active",b.dataset.carrier===state.selectedCarrier));
  if(!t){
    $("clientTotal").textContent=$("internalCost").textContent=$("netProfit").textContent=$("internalClientTotal").textContent="—";
    $("internalDeposit").textContent=$("internalBalance").textContent="—";$("paymentCoverage").classList.remove("warn","ok");$("paymentCoverage").querySelector("strong").textContent="—";
    $("clientRateMeta").textContent=`1 USD = ${fmtNumber(state.visaRate,2)} MGA`;$("clientTransportMeta").textContent="À calculer";$("internalShipping").textContent="—";$("billableWeight").textContent=billableWeight()?`${billableWeight()} lb (${fmtNumber(lbToKg(billableWeight()),2)} kg)`:"—";return;
  }
  $("clientTotal").textContent=fmtNumber(t.total,0);$("clientRateMeta").textContent=`1 USD = ${fmtNumber(t.visaRate,2)} MGA`;$("clientTransportMeta").textContent=`${t.shipping.carrier} · ${fmtUSD(t.shipping.rateUsd)}`;
  $("internalCost").textContent=fmtNumber(t.cost,0);$("internalShipping").textContent=`${t.shipping.carrier} · ${fmtUSD(t.shipping.rateUsd)}`;$("billableWeight").textContent=`${t.billable} lb (${fmtNumber(lbToKg(t.billable),2)} kg)`;
  $("netProfit").textContent=fmtMGA(t.profit,0);$("internalClientTotal").textContent=fmtMGA(t.total,0);$("marginTier").textContent=`${fmtNumber(t.rateTier*100,0)} % · min. 75 000 Ar`;$("cardFees").textContent=fmtMGA(t.cardFees,0);$("reserveMeta").textContent=fmtMGA(t.reserve,0);
  const pay=paymentPlan(t.total,t.cost);$("internalDeposit").textContent=fmtMGA(pay.deposit,0);$("internalBalance").textContent=fmtMGA(pay.balance,0);const coverage=$("paymentCoverage"),coverageText=coverage.querySelector("strong");coverage.classList.toggle("warn",pay.gap>0);coverage.classList.toggle("ok",pay.gap===0);coverageText.textContent=pay.gap>0?`eVidy avance ${fmtMGA(pay.gap,0)}`:`Coûts couverts + ${fmtMGA(Math.max(0,pay.coverage),0)}`;
  if($("quoteSheet").classList.contains("open")&&!state.editingQuoteId)renderDraftPreview();
}
function setView(view){state.view=view;$$('.view').forEach(v=>v.classList.toggle('active',v.id===view+'View'));$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));if(view==="internal")syncInputs();refreshAll();updateRateStrip()}

function todayVisaDate(){const d=new Date();return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`}
function normaliseVisaRate(n){if(!Number.isFinite(n)||n<=0)return NaN;if(n>=100&&n<=30000)return n;if(n>0&&n<.01){const inv=1/n;if(inv>=100&&inv<=30000)return inv}return NaN}
function toNumbers(v){if(typeof v==="number")return[v];if(v==null)return[];return((String(v).replace(/\s/g,"").replace(/,/g,"").match(/-?\d+(?:\.\d+)?/g)||[]).map(Number).filter(Number.isFinite))}
function findByKeyRecursive(o,key,res=[]){if(!o||typeof o!=="object")return res;for(const[k,v]of Object.entries(o)){if(k===key)res.push(v);if(v&&typeof v==="object")findByKeyRecursive(v,key,res)}return res}
function extractVisaRate(data){const keys=["fxRateWithAdditionalFee","rateWithAdditionalFee","conversionRateWithAdditionalFee","cardholderBillingAmount","destinationAmountWithAdditionalFee","convertedAmountWithAdditionalFee","toAmountWithAdditionalFee","amountWithAdditionalFee","fxRate","conversionRate","rate","destinationAmount","convertedAmount","toAmount","result"];for(const key of keys)for(const value of findByKeyRecursive(data,key)){const c=toNumbers(value).map(normaliseVisaRate).find(Number.isFinite);if(c)return c}throw new Error("Taux VISA introuvable")}
function buildVisaUrl(baseUrl){const p=new URLSearchParams({amount:"1",fee:String(CONFIG.visaBankFeePercent),utcConvertedDate:todayVisaDate(),exchangedate:todayVisaDate(),fromCurr:CONFIG.destinationCurrency,toCurr:"USD"});return `${baseUrl}?${p}`}
async function fetchVisaRate(){let last;for(const url of CONFIG.visaApiUrls){try{const r=await fetch(buildVisaUrl(url),{method:"GET",mode:"cors",cache:"no-store",headers:{Accept:"application/json, text/plain, */*"}});if(!r.ok)throw new Error("Réponse VISA invalide");const rate=extractVisaRate(await r.json());if(!Number.isFinite(rate)||rate<100)throw new Error("Taux incohérent");return rate}catch(e){last=e}}throw last||new Error("VISA indisponible")}
async function refreshVisa(){
  $("rateDot").className="rate-dot loading";$("statusDot").className="status-dot";$("rateStatus").textContent="Actualisation VISA…";$("refreshRates").disabled=true;
  try{state.visaRate=await fetchVisaRate();state.ratesDate=new Date().toISOString();$("rateDot").className="rate-dot";$("statusDot").className="status-dot";$("rateStatus").textContent="Taux VISA actualisé à l'instant"}
  catch(e){$("rateDot").className="rate-dot error";$("statusDot").className="status-dot warn";$("rateStatus").textContent="VISA indisponible, dernier taux conservé"}
  finally{$("refreshRates").disabled=false;$("visaRateManual").value=state.visaRate.toFixed(2);persistState();refreshAll()}
}
async function fetchJSON(url,options={},timeout=18000){const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{...options,signal:c.signal,headers:{'Content-Type':'application/json',...(options.headers||{})}});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=null}if(!r.ok)throw new Error(data?.error||`HTTP ${r.status}`);return data}finally{clearTimeout(timer)}}
async function refreshShipping(){
  const button=$("refreshShipping");button.disabled=true;button.textContent="Actualisation…";
  try{
    let data;
    if(state.shippingMode==="consolidation"){
      ensureConsolidationPackages();
      const packages=state.consolidationPackages.filter(packageComplete);
      if(packages.length<2)throw new Error("Complète au moins 2 colis pour la consolidation");
      data=await fetchJSON(`${CONFIG.apiBase}/api/consolidation-rates`,{method:"POST",body:JSON.stringify({warehouseId:state.warehouse,value:state.product.itemUsd,packages,hasBattery:packages.some(p=>p.battery),largeBattery:packages.some(p=>p.largeBattery||Number(p.batteryWh)>=100)})},26000);
      state.consolidatedEstimate={...data.estimate.quote,count:data.estimate.packageCount,source:data.estimate.model,confidence:data.estimate.confidence};
      state.shippingRates=(data.carriers||[]).filter(r=>["DHL","FedEx"].includes(r.carrier));
      if(!state.shippingRates.length)throw new Error("Colis consolidé trop volumineux ou non admissible : il faut prévoir plusieurs envois");
      const preferred=data.preferredCarrier?bestRateForCarrier(data.preferredCarrier):null;
      state.selectedRate=preferred||bestRateForCarrier(state.selectedCarrier)||state.shippingRates[0]||null;
      if(state.selectedRate)state.selectedCarrier=state.selectedRate.carrier;
      const warning=data.warnings||[];
      if(warning.includes("LARGE_BATTERY_REVIEW")){$("rateStatus").textContent=`Consolidation estimée · batterie >100 Wh : validation transport obligatoire`;$("statusDot").className="status-dot warn"}
      else if(warning.includes("BATTERY_REVIEW")){$("rateStatus").textContent=`Consolidation optimisée · ${data.estimate.packageCount} colis · restriction batterie détectée`;$("statusDot").className="status-dot warn"}
      else if(warning.includes("LIMITED_CARRIER_OPTIONS")){$("rateStatus").textContent=`Consolidation optimisée · options transport limitées par le gabarit`;$("statusDot").className="status-dot warn"}
      else{$("rateStatus").textContent=`Consolidation optimisée · ${data.estimate.packageCount} colis regroupés`;$("statusDot").className="status-dot"}
    }else{
      const pkg=state.package;
      const payload={warehouseId:state.warehouse,city:"Antananarivo",postalcode:"101",weight:pkg.weight,length:pkg.length,width:pkg.width,height:pkg.height,value:state.product.itemUsd};
      data=await fetchJSON(`${CONFIG.apiBase}/api/shipping-rates`,{method:"POST",body:JSON.stringify(payload)},22000);
      state.shippingRates=(data.carriers||[]).filter(r=>["DHL","FedEx"].includes(r.carrier));
      const batteryFedex=state.package.battery?bestRateForCarrier("FedEx"):null;
      const preferred=batteryFedex||bestRateForCarrier(state.selectedCarrier)||state.shippingRates[0]||null;state.selectedRate=preferred;if(preferred)state.selectedCarrier=preferred.carrier;
      $("rateStatus").textContent=state.shippingRates.length?(state.package.largeBattery?"Tarifs indicatifs · batterie >100 Wh : validation transport obligatoire":state.package.battery?"Tarifs actualisés · restriction batterie à vérifier":"Tarifs transport actualisés"):"Aucun tarif disponible";$("statusDot").className=state.package.battery?"status-dot warn":(state.shippingRates.length?"status-dot":"status-dot warn");
    }
  }catch(e){if(!state.shippingRates.length)state.selectedRate=null;$("rateStatus").textContent=state.shippingRates.length?"Actualisation transport indisponible · dernier tarif conservé":(e.message||"Moteur transport indisponible");$("statusDot").className="status-dot warn"}
  finally{button.disabled=false;button.innerHTML='<svg class="icon sm"><use href="#i-refresh"/></svg>Actualiser le transport';renderRates();persistState();refreshAll()}
}
async function analyzeProduct(){
  state.product.url=$("productUrl").value.trim();persistState();if(!state.product.url){$("rateStatus").textContent="Colle un lien produit ou utilise la saisie manuelle";$("productDisclosure").open=true;return}
  const b=$("analyzeProduct");b.disabled=true;b.textContent="…";$("rateStatus").textContent="Analyse du produit…";
  try{
    const data=await fetchJSON(`${CONFIG.apiBase}/api/analyze`,{method:"POST",body:JSON.stringify({url:state.product.url})},22000);
    if(data.title)state.product.title=data.title.replace(/\s*\|\s*eBay.*$/i,"");
    if(data.hsClassification?.code){state.product.hsCode=String(data.hsClassification.code);state.product.hsConfidence=Number(data.hsClassification.confidence)||0;state.product.hsLabel=data.hsClassification.label||"";state.product.hsSource=data.hsClassification.source||"";}
    const basePrice=Number(data.priceUsd);
    const sellerShipping=(data.shippingUsd===null||data.shippingUsd===undefined)?NaN:Number(data.shippingUsd);
    const autoTotal=Number(data.totalPurchaseUsd);
    if(autoTotal>0) state.product.itemUsd=autoTotal;
    else if(basePrice>0) state.product.itemUsd=basePrice;
    // Le prix client affiché cumule déjà article + livraison vendeur détectée.
    state.product.domesticUsd=0;
    if(data.packageEstimate){const p=data.packageEstimate,f=data.shippingFlags||{};state.package={weight:Number(p.weightLb)||state.package.weight,length:Number(p.dimensionsIn?.length)||state.package.length,width:Number(p.dimensionsIn?.width)||state.package.width,height:Number(p.dimensionsIn?.height)||state.package.height,source:p.source||"estimé",confidence:Number(p.confidence)||0,battery:Boolean(f.battery),batteryWh:Number(f.batteryWh)||null,largeBattery:Boolean(f.largeBattery)};state.consolidatedEstimate=null;if(state.shippingMode==="consolidation"){ensureConsolidationPackages();state.consolidationPackages[0]={...state.package}}}
    syncInputs();
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
  finally{b.disabled=false;b.textContent="Analyser";persistState();refreshAll()}
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
  if(base){const pay=paymentPlan(base.totalMGA);return{...base,depositPercent:75,balancePercent:25,depositMGA:pay.deposit,balanceMGA:pay.balance,client:$("quoteClient").value.trim(),phone:$("quotePhone").value.trim(),validUntil:$("quoteValidity").value||defaultValidity(),note:$("quoteNote").value.trim()}}
  const total=t?.total||0,pay=paymentPlan(total);
  return{id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,number:state.draftNumber||nextQuoteNumber(),createdAt:isoDate(),validUntil:$("quoteValidity").value||defaultValidity(),client:$("quoteClient").value.trim(),phone:$("quotePhone").value.trim(),note:$("quoteNote").value.trim(),productTitle:state.product.title||"Article USA",productUrl:state.product.url,itemUsd:state.product.itemUsd,domesticUsd:state.product.domesticUsd,visaRate:state.visaRate,shippingCarrier:t?.shipping?.carrier||state.selectedCarrier,shippingService:t?.shipping?.service||"",shippingUsd:t?.shipping?.rateUsd||0,totalMGA:total,feesClientMGA:t?.feesClient||0,depositPercent:75,balancePercent:25,depositMGA:pay.deposit,balanceMGA:pay.balance,...quotePackageSnapshot(t)};
}
function renderDraftPreview(){
  const q=currentDraft();
  const l=Number(q.packageLengthCm)||state.package.length*2.54,d=Number(q.packageWidthCm)||state.package.width*2.54,h=Number(q.packageHeightCm)||state.package.height*2.54;
  const bill=Number(q.billableWeightKg)||billableWeight()*0.45359237;
  $("previewNumber").textContent=q.number;$("previewDate").textContent=`Émis le ${displayDate(q.createdAt)}`;$("previewClient").textContent=q.client||"Client non renseigné";
  $("previewTable").innerHTML=`<div class="preview-line"><div><span>Article</span><strong>${escapeHTML(q.productTitle||'Article USA')}</strong></div><strong>${escapeHTML(fmtUSD(q.itemUsd))}</strong></div><div class="preview-line"><div><span>Dimensions du colis</span><strong>Estimation</strong></div><strong>${escapeHTML(`${fmtNumber(l,1)} × ${fmtNumber(d,1)} × ${fmtNumber(h,1)} cm`)}</strong></div><div class="preview-line"><div><span>Poids approximatif</span><strong>Poids retenu pour le transport</strong></div><strong>${escapeHTML(fmtNumber(bill,2))} kg</strong></div><div class="preview-line"><div><span>Transport international</span><strong>${escapeHTML(`${q.shippingCarrier||''} ${q.shippingService||''}`.trim())}</strong></div><strong>${escapeHTML(fmtUSD(q.shippingUsd))}</strong></div><div class="preview-line"><div><span>Taux VISA</span><strong>1 USD</strong></div><strong>${escapeHTML(fmtNumber(q.visaRate,2))} MGA</strong></div><div class="preview-line"><div><span>Frais & traitement</span><strong>Frais applicables inclus</strong></div><strong>${escapeHTML(fmtMGA(q.feesClientMGA,0))}</strong></div>`;
  const pay=paymentPlan(q.totalMGA);$("previewTotal").textContent=fmtMGA(q.totalMGA,0);$("previewDeposit").textContent=fmtMGA(q.depositMGA||pay.deposit,0);$("previewBalance").textContent=fmtMGA(q.balanceMGA||pay.balance,0);$("previewNote").textContent=q.note||"Paiement en 2 tranches : 75 % à la commande et 25 % à l'arrivée du colis. Le prix comprend l'achat, l'acheminement et les frais de service applicables. Dimensions et poids approximatif établis avant réception physique du colis.";
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
  const l=Number(q.packageLengthCm)||state.package.length*2.54,d=Number(q.packageWidthCm)||state.package.width*2.54,h=Number(q.packageHeightCm)||state.package.height*2.54,bill=Number(q.billableWeightKg)||billableWeight()*0.45359237,pay=paymentPlan(q.totalMGA);
  return `DEVIS ${q.number}
Client : ${q.client||"—"}${q.phone?`
Téléphone : ${q.phone}`:""}
Article : ${q.productTitle||"Article USA"}
Prix article : ${fmtUSD(q.itemUsd)}
Dimensions du colis : ${fmtNumber(l,1)} × ${fmtNumber(d,1)} × ${fmtNumber(h,1)} cm
Poids approximatif : ${fmtNumber(bill,2)} kg
Transport : ${q.shippingCarrier||"—"} ${q.shippingService||""} · ${fmtUSD(q.shippingUsd)}
Taux VISA : 1 USD = ${fmtNumber(q.visaRate,2)} MGA
Frais & traitement : ${fmtMGA(q.feesClientMGA,0)}
TOTAL À PAYER : ${fmtMGA(q.totalMGA,0)}
1er paiement (75 %) à la commande : ${fmtMGA(q.depositMGA||pay.deposit,0)}
Solde (25 %) à l'arrivée du colis : ${fmtMGA(q.balanceMGA||pay.balance,0)}${q.note?`
Note : ${q.note}`:""}`}
async function copyCurrentQuote(){const q=currentDraft();try{await navigator.clipboard.writeText(quoteText(q));$("quoteSheetSub").textContent="Devis copié dans le presse-papiers"}catch{$("quoteSheetSub").textContent="Copie indisponible sur ce navigateur"}}
function renderPrint(q){
  const l=Number(q.packageLengthCm)||state.package.length*2.54,d=Number(q.packageWidthCm)||state.package.width*2.54,h=Number(q.packageHeightCm)||state.package.height*2.54,bill=Number(q.billableWeightKg)||billableWeight()*0.45359237,pay=paymentPlan(q.totalMGA),deposit=q.depositMGA||pay.deposit,balance=q.balanceMGA||pay.balance;
  $("printStage").innerHTML=`<article class="print-page"><header class="print-head"><div class="print-brand"><img src="assets/evidy-mark.svg" style="width:42px;height:42px"><div><strong>eVidy US</strong><span>Devis d'achat assisté</span></div></div><div class="print-title"><h1>DEVIS</h1><p>${escapeHTML(q.number)} · ${escapeHTML(displayDate(q.createdAt))}</p></div></header><section class="print-client"><div class="print-block"><span>Client</span><strong>${escapeHTML(q.client||"Client non renseigné")}${q.phone?`<br>${escapeHTML(q.phone)}`:""}</strong></div></section><table class="print-table"><thead><tr><th>Description</th><th>Détail</th><th>Montant / mesure</th></tr></thead><tbody><tr><td>${escapeHTML(q.productTitle||"Article USA")}</td><td>Prix article</td><td>${escapeHTML(fmtUSD(q.itemUsd))}</td></tr><tr><td>Dimensions du colis</td><td>Estimation</td><td>${escapeHTML(`${fmtNumber(l,1)} × ${fmtNumber(d,1)} × ${fmtNumber(h,1)} cm`)}</td></tr><tr><td>Poids approximatif</td><td>Poids retenu pour le transport</td><td>${escapeHTML(fmtNumber(bill,2))} kg</td></tr><tr><td>Transport international</td><td>${escapeHTML(`${q.shippingCarrier||''} ${q.shippingService||''}`.trim())}</td><td>${escapeHTML(fmtUSD(q.shippingUsd))}</td></tr><tr><td>Taux VISA</td><td>1 USD</td><td>${escapeHTML(fmtNumber(q.visaRate,2))} MGA</td></tr><tr><td>Frais & traitement</td><td>Frais applicables inclus</td><td>${escapeHTML(fmtMGA(q.feesClientMGA,0))}</td></tr></tbody></table><div class="print-total"><span>Total à payer</span><strong>${escapeHTML(fmtMGA(q.totalMGA,0))}</strong></div><div class="print-payments"><div><span>À la commande · 75 %</span><strong>${escapeHTML(fmtMGA(deposit,0))}</strong></div><div><span>À l'arrivée du colis · 25 %</span><strong>${escapeHTML(fmtMGA(balance,0))}</strong></div></div>${q.note?`<p class="print-note"><strong>Note :</strong> ${escapeHTML(q.note)}</p>`:`<p class="print-note">Paiement en 2 tranches : 75 % à la commande et 25 % à l'arrivée du colis. Dimensions et poids approximatif établis avant réception physique du colis.</p>`}<footer class="print-footer"><span>eVidy US · Service opéré par PREST OFFICE</span><span>${escapeHTML(q.number)}</span></footer></article>`;
}
function printAnyQuote(q){if(!q?.totalMGA)return;renderPrint(q);setTimeout(()=>window.print(),60)}
function readProductInputs(){
  state.product.url=$("productUrl").value.trim();state.product.itemUsd=num($("clientAmount").value);state.product.domesticUsd=num($("domesticUsd").value);
  state.package.weight=num($("weightLb").value);state.package.length=num($("lengthIn").value);state.package.width=num($("widthIn").value);state.package.height=num($("heightIn").value);
  state.warehouse=$("warehouse").value;state.customsReserve=num($("customsReserve").value);state.peFeesUsd=num($("peFeesUsd").value);state.consolidationFeeUsd=num($("consolidationFeeUsd").value);state.localDelivery=num($("localDelivery").value);
  const manual=num($("visaRateManual").value);if(manual>=100)state.visaRate=manual;
  if(state.shippingMode==="consolidation"){ensureConsolidationPackages();state.consolidationPackages[0]={...state.package}}
  state.consolidatedEstimate=null;state.shippingRates=[];state.selectedRate=null;renderRates();syncManualUnitInputs();persistState();refreshAll()
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
function readManualUnitInputs(){
  state.product.title=$("productTitleManual").value.trim();state.package.battery=Boolean($("manualBattery").checked);const metric=state.unitSystem==="metric";
  const weight=num($("manualWeightLb").value),l=num($("manualLengthIn").value),w=num($("manualWidthIn").value),h=num($("manualHeightIn").value);
  if(weight>0)state.package.weight=metric?kgToLb(weight):weight;if(l>0)state.package.length=metric?cmToIn(l):l;if(w>0)state.package.width=metric?cmToIn(w):w;if(h>0)state.package.height=metric?cmToIn(h):h;
  $("weightLb").value=state.package.weight.toFixed(2);$("lengthIn").value=state.package.length.toFixed(2);$("widthIn").value=state.package.width.toFixed(2);$("heightIn").value=state.package.height.toFixed(2);
  if(state.shippingMode==="consolidation"){ensureConsolidationPackages();state.consolidationPackages[0]={...state.package}}
  state.consolidatedEstimate=null;
  state.shippingRates=[];state.selectedRate=null;renderRates();updateManualUnitHints();persistState();refreshAll()
}
function renderShippingControls(renderPackages=true){
  $$("[data-unit-system]").forEach(b=>b.classList.toggle("active",b.dataset.unitSystem===state.unitSystem));
  $$("[data-shipping-mode]").forEach(b=>b.classList.toggle("active",b.dataset.shippingMode===state.shippingMode));
  $("consolidationPanel").hidden=state.shippingMode!=="consolidation";
  $("itemPriceLabel").textContent=state.shippingMode==="consolidation"?"Prix total des articles":"Prix de l'article";
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
  box.innerHTML=state.consolidationPackages.slice(1).map((p,i)=>{const idx=i+1;return `<div class="consolidation-package" data-package-index="${idx}"><div class="consolidation-package-title"><strong>Colis ${idx+1}</strong><div class="package-title-actions"><label class="battery-check"><input data-pkg-field="battery" type="checkbox" ${p.battery?'checked':''}> Batterie</label>${state.consolidationPackages.length>2?`<button type="button" data-remove-package="${idx}">Retirer</button>`:""}</div></div><div class="mini-grid four"><label>Poids ${packageUnit("weight")}<input data-pkg-field="weight" type="number" min="0" step="0.01" value="${packageDisplayValue(p.weight,"weight")?packageDisplayValue(p.weight,"weight").toFixed(2):''}"></label><label>L ${packageUnit("length")}<input data-pkg-field="length" type="number" min="0" step="0.1" value="${packageDisplayValue(p.length,"length")?packageDisplayValue(p.length,"length").toFixed(1):''}"></label><label>W ${packageUnit("width")}<input data-pkg-field="width" type="number" min="0" step="0.1" value="${packageDisplayValue(p.width,"width")?packageDisplayValue(p.width,"width").toFixed(1):''}"></label><label>H ${packageUnit("height")}<input data-pkg-field="height" type="number" min="0" step="0.1" value="${packageDisplayValue(p.height,"height")?packageDisplayValue(p.height,"height").toFixed(1):''}"></label></div></div>`}).join("");
}
function setUnitSystem(mode){
  if(!["us","metric"].includes(mode)||mode===state.unitSystem)return;state.unitSystem=mode;syncManualUnitInputs();renderConsolidationPackages();renderShippingControls(false);persistState()
}
function setShippingMode(mode){
  if(!["single","consolidation"].includes(mode)||mode===state.shippingMode)return;state.shippingMode=mode;if(mode==="consolidation")ensureConsolidationPackages();state.consolidatedEstimate=null;state.shippingRates=[];state.selectedRate=null;renderRates();renderShippingControls(true);persistState();refreshAll();$("rateStatus").textContent=mode==="consolidation"?"Consolidation activée · complète les colis puis recalcule le transport":"Colis unique activé · recalcule le transport";$("statusDot").className="status-dot warn"
}
function readConsolidationPackageInput(target){
  const row=target.closest("[data-package-index]");if(!row)return;const idx=Number(row.dataset.packageIndex),field=target.dataset.pkgField;if(!field||!state.consolidationPackages[idx])return;
  if(field==="battery")state.consolidationPackages[idx].battery=Boolean(target.checked);
  else {const value=num(target.value);state.consolidationPackages[idx][field]=state.unitSystem==="metric"?(field==="weight"?kgToLb(value):cmToIn(value)):value;}
  state.consolidatedEstimate=null;state.shippingRates=[];state.selectedRate=null;persistState();renderShippingControls(false);refreshAll()
}
function readHsManual(){state.product.hsCode=String($("hsCodeManual")?.value||"").replace(/\D/g,"").slice(0,10);state.product.hsConfidence=0;state.product.hsLabel=state.product.hsCode?"Saisi manuellement":"";state.product.hsSource=state.product.hsCode?"manual":"";persistState();refreshAll()}
function syncAmountFromClient(){state.product.itemUsd=num($("clientAmount").value);$("internalAmount").value=fmtNumber(state.product.itemUsd,2);persistState();refreshAll()}
function syncAmountFromInternal(){state.product.itemUsd=num($("internalAmount").value);$("clientAmount").value=fmtNumber(state.product.itemUsd,2);persistState();refreshAll()}

$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$$('[data-carrier]').forEach(b=>b.addEventListener('click',()=>{state.selectedCarrier=b.dataset.carrier;state.selectedRate=bestRateForCarrier(state.selectedCarrier);persistState();refreshAll()}));
$("topTransport").addEventListener("click",()=>{state.selectedCarrier=state.selectedCarrier==="DHL"?"FedEx":"DHL";state.selectedRate=bestRateForCarrier(state.selectedCarrier);persistState();refreshAll()});
$("clientAmount").addEventListener("input",syncAmountFromClient);$("internalAmount").addEventListener("input",syncAmountFromInternal);
$("hsCodeManual").addEventListener("input",readHsManual);
["productUrl","weightLb","lengthIn","widthIn","heightIn","warehouse","domesticUsd","customsReserve","peFeesUsd","consolidationFeeUsd","localDelivery","visaRateManual"].forEach(id=>$(id).addEventListener("input",readProductInputs));
["productTitleManual","manualWeightLb","manualLengthIn","manualWidthIn","manualHeightIn","manualBattery"].forEach(id=>$(id).addEventListener("input",readManualUnitInputs));
$("manualShipping").addEventListener("click",async()=>{readManualUnitInputs();await refreshShipping()});
$("unitSwitch").addEventListener("click",e=>{const b=e.target.closest("[data-unit-system]");if(b)setUnitSystem(b.dataset.unitSystem)});
$("shippingModeSwitch").addEventListener("click",e=>{const b=e.target.closest("[data-shipping-mode]");if(b)setShippingMode(b.dataset.shippingMode)});
$("addConsolidationPackage").addEventListener("click",()=>{ensureConsolidationPackages();state.consolidationPackages.push({weight:0,length:0,width:0,height:0,battery:false});renderConsolidationPackages();renderShippingControls(false);persistState()});
$("consolidationPackages").addEventListener("input",e=>{if(e.target.matches("[data-pkg-field]"))readConsolidationPackageInput(e.target)});
$("consolidationPackages").addEventListener("click",e=>{const b=e.target.closest("[data-remove-package]");if(!b)return;const idx=Number(b.dataset.removePackage);if(state.consolidationPackages.length>2){state.consolidationPackages.splice(idx,1);state.consolidatedEstimate=null;state.shippingRates=[];state.selectedRate=null;renderRates();renderConsolidationPackages();renderShippingControls(false);persistState();refreshAll()}});
$("analyzeProduct").addEventListener("click",analyzeProduct);$("refreshShipping").addEventListener("click",refreshShipping);$("refreshRates").addEventListener("click",()=>Promise.allSettled([refreshVisa(),refreshShipping()]));
$("internalRates").addEventListener("click",e=>{const row=e.target.closest("[data-rate-id]");if(!row)return;const rate=state.shippingRates.find(r=>String(r.id)===row.dataset.rateId);if(rate){state.selectedRate=rate;state.selectedCarrier=rate.carrier;renderRates();persistState();refreshAll()}});
$("openQuote").addEventListener("click",()=>openQuote());$("newQuoteTop").addEventListener("click",()=>openQuote());$("closeQuote").addEventListener("click",closeQuote);$("quoteSheet").addEventListener("click",e=>{if(e.target===$("quoteSheet"))closeQuote()});
["quoteClient","quotePhone","quoteValidity","quoteNote"].forEach(id=>$(id).addEventListener("input",renderDraftPreview));
$("saveQuote").addEventListener("click",saveQuote);$("copyQuote").addEventListener("click",copyCurrentQuote);$("printQuote").addEventListener("click",()=>printAnyQuote(currentDraft()));
$("deleteCurrentQuote").addEventListener("click",()=>{if(!state.editingQuoteId||!confirm("Supprimer définitivement ce devis ?"))return;state.quotes=state.quotes.filter(q=>q.id!==state.editingQuoteId);persistQuotes();closeQuote();setView("quotes");renderQuotes()});
$("quotesContainer").addEventListener("click",e=>{const n=e.target.closest("[data-new-quote]");if(n){openQuote();return}const row=e.target.closest("[data-open-quote]");if(row){const q=state.quotes.find(x=>x.id===row.dataset.openQuote);if(q)openQuote(q)}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("quoteSheet").classList.contains("open"))closeQuote()});

syncInputs();renderRates();renderQuotes();refreshAll();$("quoteValidity").value=defaultValidity();
if(state.ratesDate){const d=new Date(state.ratesDate);if(!Number.isNaN(d.valueOf()))$("rateStatus").textContent=`Taux VISA sauvegardé · ${new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"2-digit"}).format(d)}`}
else $("rateStatus").textContent="Taux VISA de secours chargé · actualise pour le taux du jour";
requestAnimationFrame(()=>{refreshVisa();refreshShipping()});
