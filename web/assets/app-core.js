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
  product:{url:saved.product?.url||"",title:saved.product?.title||"",itemUsd:Number(saved.product?.itemUsd)||551.99,domesticUsd:Number(saved.product?.domesticUsd)||0},
  package:{weight:Number(saved.package?.weight)||2.5,length:Number(saved.package?.length)||11,width:Number(saved.package?.width)||9,height:Number(saved.package?.height)||4,source:saved.package?.source||"manuel",confidence:Number(saved.package?.confidence)||0},
  warehouse:String(saved.warehouse||"4"),
  customsReserve:Number(saved.customsReserve)||200000,
  peFeesUsd:Number(saved.peFeesUsd)||CONFIG.peDefaultFeeUSD,
  localDelivery:Number(saved.localDelivery)||0,
  shippingRates:[],selectedRate:null,selectedCarrier:saved.selectedCarrier||"DHL",
  quotes:(()=>{try{return JSON.parse(localStorage.getItem("evidyQuotesV1")||"[]")}catch{return []}})(),
  editingQuoteId:null,editingQuoteBase:null,draftNumber:null,lastCalc:null
};

function persistState(){
  try{localStorage.setItem("evidyStateV1",JSON.stringify({visaRate:state.visaRate,ratesDate:state.ratesDate,product:state.product,package:state.package,warehouse:state.warehouse,customsReserve:state.customsReserve,peFeesUsd:state.peFeesUsd,localDelivery:state.localDelivery,selectedCarrier:state.selectedCarrier}))}catch{}
}
function serviceRate(itemUsd){return itemUsd<=350?.30:itemUsd<=900?.25:.15}
function serviceFeeMGA(itemUsd,domesticUsd,rate){
  const base=(itemUsd+domesticUsd)*rate,tier=serviceRate(itemUsd);
  const floor350=350*rate*.30,floor900=900*rate*.25;
  const continuity=itemUsd>900?floor900:itemUsd>350?floor350:0;
  return Math.round(Math.max(base*tier,CONFIG.minimumServiceFeeMGA,continuity));
}
function cardFeeMGA(base){return Math.round(base*CONFIG.cardFeePercent/100+CONFIG.fixedVisaFeeMGA)}
function billableWeight(){return Math.ceil(Math.max(state.package.weight,state.package.length*state.package.width*state.package.height/166))}
function bestRateForCarrier(carrier){return state.shippingRates.filter(r=>r.carrier===carrier).sort((a,b)=>a.rateUsd-b.rateUsd)[0]||null}
function selectedShipping(){return state.selectedRate||bestRateForCarrier(state.selectedCarrier)}
function calculate(){
  const item=state.product.itemUsd,domestic=state.product.domesticUsd,rate=state.visaRate,ship=selectedShipping();
  if(!(item>0&&rate>0&&ship?.rateUsd>0))return null;
  const purchaseMga=(item+domestic)*rate,freightMga=(ship.rateUsd+state.peFeesUsd)*rate;
  const cardPurchase=cardFeeMGA(purchaseMga),cardFreight=cardFeeMGA(freightMga),service=serviceFeeMGA(item,domestic,rate);
  const cost=purchaseMga+freightMga+cardPurchase+cardFreight+state.customsReserve+state.localDelivery;
  const total=roundUpTo(cost+service,1000),profit=total-cost;
  return{itemUsd:item,domesticUsd:domestic,visaRate:rate,shipping:ship,peFeesUsd:state.peFeesUsd,purchaseMga,freightMga,cardPurchase,cardFreight,cardFees:cardPurchase+cardFreight,reserve:state.customsReserve,localDelivery:state.localDelivery,serviceFee:service,cost,total,profit,rateTier:serviceRate(item),billable:billableWeight(),feesClient:Math.max(0,total-(item+domestic+ship.rateUsd)*rate)};
}

function syncInputs(){
  $("productUrl").value=state.product.url; $("clientAmount").value=fmtNumber(state.product.itemUsd,2); $("internalAmount").value=fmtNumber(state.product.itemUsd,2);
  $("productTitleManual").value=state.product.title||"";
  $("weightKg").value=lbToKg(state.package.weight).toFixed(2); $("lengthCm").value=inToCm(state.package.length).toFixed(1); $("widthCm").value=inToCm(state.package.width).toFixed(1); $("heightCm").value=inToCm(state.package.height).toFixed(1);
  $("weightLb").value=state.package.weight; $("lengthIn").value=state.package.length; $("widthIn").value=state.package.width; $("heightIn").value=state.package.height;
  $("warehouse").value=state.warehouse; $("domesticUsd").value=state.product.domesticUsd; $("customsReserve").value=state.customsReserve; $("peFeesUsd").value=state.peFeesUsd; $("localDelivery").value=state.localDelivery; $("visaRateManual").value=state.visaRate.toFixed(2);
}
function updateRateStrip(){
  $("rateUSD").textContent=fmtNumber(state.visaRate,2);const ship=selectedShipping();$("transportTop").textContent=ship?fmtUSD(ship.rateUsd):"—";
}
function renderRates(){
  const box=$("internalRates");
  if(!state.shippingRates.length){box.innerHTML='<div class="inline-status"><span class="status-dot warn"></span><span>Aucun tarif Planet Express chargé</span></div>';return}
  box.innerHTML=state.shippingRates.map(r=>`<div class="rate-row ${state.selectedRate?.id===r.id?'active':''}" data-rate-id="${r.id}"><div><strong>${escapeHTML(r.carrier)} ${escapeHTML(r.service||'')}</strong><span>${escapeHTML(r.deliverySpeed||'')}</span></div><b>${escapeHTML(fmtUSD(r.rateUsd))}</b></div>`).join("");
}
function refreshAll(){
  const t=calculate();state.lastCalc=t;
  updateRateStrip();
  $("clientPackageMeta").textContent=`${fmtNumber(lbToKg(state.package.weight),2)} kg · ${fmtNumber(inToCm(state.package.length),1)} × ${fmtNumber(inToCm(state.package.width),1)} × ${fmtNumber(inToCm(state.package.height),1)} cm`;
  $("clientBillableMetric").textContent=`${fmtNumber(lbToKg(billableWeight()),2)} kg (${billableWeight()} lb)`;
  $$("[data-carrier]").forEach(b=>b.classList.toggle("active",b.dataset.carrier===state.selectedCarrier));
  if(!t){
    $("clientTotal").textContent=$("internalCost").textContent=$("netProfit").textContent=$("internalClientTotal").textContent="—";
    $("clientRateMeta").textContent=`1 USD = ${fmtNumber(state.visaRate,2)} MGA`;$("clientTransportMeta").textContent="À calculer";$("internalShipping").textContent="—";$("billableWeight").textContent=`${fmtNumber(lbToKg(billableWeight()),2)} kg (${billableWeight()} lb)`;return;
  }
  $("clientTotal").textContent=fmtNumber(t.total,0);$("clientRateMeta").textContent=`1 USD = ${fmtNumber(t.visaRate,2)} MGA`;$("clientTransportMeta").textContent=`${t.shipping.carrier} · ${fmtUSD(t.shipping.rateUsd)}`;
  $("internalCost").textContent=fmtNumber(t.cost,0);$("internalShipping").textContent=`${t.shipping.carrier} · ${fmtUSD(t.shipping.rateUsd)}`;$("billableWeight").textContent=`${fmtNumber(lbToKg(t.billable),2)} kg (${t.billable} lb)`;
  $("netProfit").textContent=fmtMGA(t.profit,0);$("internalClientTotal").textContent=fmtMGA(t.total,0);$("marginTier").textContent=`${fmtNumber(t.rateTier*100,0)} % · min. 75 000 Ar`;$("cardFees").textContent=fmtMGA(t.cardFees,0);$("reserveMeta").textContent=fmtMGA(t.reserve,0);
  if($("quoteSheet").classList.contains("open")&&!state.editingQuoteId)renderDraftPreview();
}
function setView(view){state.view=view;$$('.view').forEach(v=>v.classList.toggle('active',v.id===view+'View'));$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));updateRateStrip()}

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
    const payload={warehouseId:state.warehouse,city:"Antananarivo",postalcode:"101",weight:state.package.weight,length:state.package.length,width:state.package.width,height:state.package.height,value:state.product.itemUsd};
    const data=await fetchJSON(`${CONFIG.apiBase}/api/planetexpress`,{method:"POST",body:JSON.stringify(payload)},22000);
    state.shippingRates=(data.carriers||[]).filter(r=>["DHL","FedEx"].includes(r.carrier));
    const preferred=bestRateForCarrier(state.selectedCarrier)||state.shippingRates[0]||null;state.selectedRate=preferred;if(preferred)state.selectedCarrier=preferred.carrier;
    $("rateStatus").textContent=state.shippingRates.length?"Tarifs Planet Express actualisés":"Aucun tarif disponible";$("statusDot").className=state.shippingRates.length?"status-dot":"status-dot warn";
  }catch(e){$("rateStatus").textContent="Planet Express indisponible, complète le colis puis réessaie";$("statusDot").className="status-dot warn"}
  finally{button.disabled=false;button.innerHTML='<svg class="icon sm"><use href="#i-refresh"/></svg>Actualiser Planet Express';renderRates();persistState();refreshAll()}
}
async function analyzeProduct(){
  state.product.url=$("productUrl").value.trim();persistState();if(!state.product.url){$("rateStatus").textContent="Colle un lien produit ou utilise la saisie manuelle";$("productDisclosure").open=true;return}
  const b=$("analyzeProduct");b.disabled=true;b.textContent="…";$("rateStatus").textContent="Analyse du produit…";
  try{
    const data=await fetchJSON(`${CONFIG.apiBase}/api/analyze`,{method:"POST",body:JSON.stringify({url:state.product.url})},22000);
    if(data.title)state.product.title=data.title.replace(/\s*\|\s*eBay.*$/i,"");
    if(Number(data.priceUsd)>0)state.product.itemUsd=Number(data.priceUsd);
    if(data.packageEstimate){const p=data.packageEstimate;state.package={weight:Number(p.weightLb)||state.package.weight,length:Number(p.dimensionsIn?.length)||state.package.length,width:Number(p.dimensionsIn?.width)||state.package.width,height:Number(p.dimensionsIn?.height)||state.package.height,source:p.source||"estimé",confidence:Number(p.confidence)||0}}
    syncInputs();$("rateStatus").textContent="Produit analysé · vérifie l'estimation du colis";await refreshShipping();
  }catch(e){$("rateStatus").textContent="Analyse auto indisponible · saisis le produit, le poids et les dimensions manuellement";$("statusDot").className="status-dot warn";$("productDisclosure").open=true}
  finally{b.disabled=false;b.textContent="Analyser";persistState();refreshAll()}
}

function nextQuoteNumber(){const d=new Date(),key=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;const store="evidyQuoteSequenceV1";let data={};try{data=JSON.parse(localStorage.getItem(store)||"{}")}catch{}data[key]=(data[key]||0)+1;localStorage.setItem(store,JSON.stringify(data));return `EV-${key}-${String(data[key]).padStart(3,"0")}`}
function currentDraft(){
  const t=calculate(),base=state.editingQuoteBase;if(base)return{...base,client:$("quoteClient").value.trim(),phone:$("quotePhone").value.trim(),validUntil:$("quoteValidity").value||defaultValidity(),note:$("quoteNote").value.trim()};
  return{id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,number:state.draftNumber||nextQuoteNumber(),createdAt:isoDate(),validUntil:$("quoteValidity").value||defaultValidity(),client:$("quoteClient").value.trim(),phone:$("quotePhone").value.trim(),note:$("quoteNote").value.trim(),productTitle:state.product.title||"Article USA",productUrl:state.product.url,itemUsd:state.product.itemUsd,domesticUsd:state.product.domesticUsd,visaRate:state.visaRate,shippingCarrier:t?.shipping?.carrier||state.selectedCarrier,shippingService:t?.shipping?.service||"",shippingUsd:t?.shipping?.rateUsd||0,totalMGA:t?.total||0,feesClientMGA:t?.feesClient||0};
}
function renderDraftPreview(){const q=currentDraft();$("previewNumber").textContent=q.number;$("previewDate").textContent=`Émis le ${displayDate(q.createdAt)}`;$("previewClient").textContent=q.client||"Client non renseigné";$("previewTable").innerHTML=`<div class="preview-line"><div><span>Article</span><strong>${escapeHTML(q.productTitle||'Article USA')}</strong></div><strong>${escapeHTML(fmtUSD(q.itemUsd))}</strong></div><div class="preview-line"><div><span>Transport</span><strong>${escapeHTML(`${q.shippingCarrier||''} ${q.shippingService||''}`.trim())}</strong></div><strong>${escapeHTML(fmtUSD(q.shippingUsd))}</strong></div><div class="preview-line"><div><span>Taux VISA</span><strong>1 USD</strong></div><strong>${escapeHTML(fmtNumber(q.visaRate,2))} MGA</strong></div><div class="preview-line"><div><span>Frais & traitement</span><strong>Frais applicables inclus</strong></div><strong>${escapeHTML(fmtMGA(q.feesClientMGA,0))}</strong></div>`;$("previewTotal").textContent=fmtMGA(q.totalMGA,0);$("previewNote").textContent=q.note||"Le prix comprend l'achat, l'acheminement et les frais de service applicables selon l'estimation actuelle du colis."}
function openQuote(q=null){
  if(q){state.editingQuoteId=q.id;state.editingQuoteBase={...q};state.draftNumber=q.number;$("quoteClient").value=q.client||"";$("quotePhone").value=q.phone||"";$("quoteValidity").value=q.validUntil||defaultValidity();$("quoteNote").value=q.note||"";$("quoteSheetTitle").textContent=`Devis ${q.number}`;$("deleteCurrentQuote").style.display="flex"}
  else{const t=calculate();if(!t){$("rateStatus").textContent="Charge d'abord un tarif Planet Express";return}state.editingQuoteId=null;state.editingQuoteBase=null;state.draftNumber=nextQuoteNumber();$("quoteClient").value="";$("quotePhone").value="";$("quoteValidity").value=defaultValidity();$("quoteNote").value="";$("quoteSheetTitle").textContent="Nouveau devis";$("deleteCurrentQuote").style.display="none"}
  $("quoteSheetSub").textContent="Compléter le client puis enregistrer ou imprimer";$("quoteSheet").classList.add("open");document.body.style.overflow="hidden";renderDraftPreview();
}
function closeQuote(){$("quoteSheet").classList.remove("open");document.body.style.overflow="";state.editingQuoteId=null;state.editingQuoteBase=null;state.draftNumber=null}
function persistQuotes(){localStorage.setItem("evidyQuotesV1",JSON.stringify(state.quotes))}
function saveQuote(){const q=currentDraft();if(!(q.totalMGA>0)){ $("quoteSheetSub").textContent="Calcule d'abord un devis valide.";return }const i=state.quotes.findIndex(x=>x.id===q.id);if(i>=0)state.quotes[i]=q;else state.quotes.unshift(q);state.quotes=state.quotes.slice(0,100);persistQuotes();state.editingQuoteId=q.id;state.editingQuoteBase={...q};$("quoteSheetTitle").textContent=`Devis ${q.number}`;$("quoteSheetSub").textContent="Enregistré sur cet appareil";$("deleteCurrentQuote").style.display="flex";renderQuotes()}
function renderQuotes(){const box=$("quotesContainer");if(!state.quotes.length){box.innerHTML='<div class="quotes-empty"><div class="empty-orb"><svg class="icon lg"><use href="#i-file"/></svg></div><h3>Aucun devis</h3><p>Crée un devis depuis le calcul client. Il apparaîtra ici pour être réouvert ou imprimé.</p><button class="secondary" data-new-quote><svg class="icon sm"><use href="#i-plus"/></svg>Nouveau devis</button></div>';return}box.innerHTML=`<div class="quote-list">${state.quotes.map(q=>`<div class="quote-item" data-open-quote="${escapeHTML(q.id)}"><div class="quote-icon"><svg class="icon"><use href="#i-file"/></svg></div><div class="quote-main"><strong>${escapeHTML(q.client||q.number)}</strong><span>${escapeHTML(q.number)} · ${escapeHTML(displayDate(q.createdAt))}</span></div><div class="quote-amount">${escapeHTML(fmtMGA(q.totalMGA,0))}</div></div>`).join("")}</div>`}
function quoteText(q){return `DEVIS ${q.number}\nClient : ${q.client||"—"}${q.phone?`\nTéléphone : ${q.phone}`:""}\nArticle : ${q.productTitle||"Article USA"}\nPrix article : ${fmtUSD(q.itemUsd)}\nTransport : ${q.shippingCarrier||"—"} ${q.shippingService||""} · ${fmtUSD(q.shippingUsd)}\nTaux VISA : 1 USD = ${fmtNumber(q.visaRate,2)} MGA\nFrais & traitement : ${fmtMGA(q.feesClientMGA,0)}\nTOTAL À PAYER : ${fmtMGA(q.totalMGA,0)}${q.note?`\nNote : ${q.note}`:""}`}
async function copyCurrentQuote(){const q=currentDraft();try{await navigator.clipboard.writeText(quoteText(q));$("quoteSheetSub").textContent="Devis copié dans le presse-papiers"}catch{$("quoteSheetSub").textContent="Copie indisponible sur ce navigateur"}}
function renderPrint(q){$("printStage").innerHTML=`<article class="print-page"><header class="print-head"><div class="print-brand"><img src="assets/evidy-mark.svg" style="width:42px;height:42px"><div><strong>eVidy US</strong><span>Devis d'achat assisté</span></div></div><div class="print-title"><h1>DEVIS</h1><p>${escapeHTML(q.number)} · ${escapeHTML(displayDate(q.createdAt))}</p></div></header><section class="print-client"><div class="print-block"><span>Client</span><strong>${escapeHTML(q.client||"Client non renseigné")}${q.phone?`<br>${escapeHTML(q.phone)}`:""}</strong></div></section><table class="print-table"><thead><tr><th>Description</th><th>Détail</th><th>Montant</th></tr></thead><tbody><tr><td>${escapeHTML(q.productTitle||"Article USA")}</td><td>Prix article</td><td>${escapeHTML(fmtUSD(q.itemUsd))}</td></tr><tr><td>Transport international</td><td>${escapeHTML(`${q.shippingCarrier||''} ${q.shippingService||''}`.trim())}</td><td>${escapeHTML(fmtUSD(q.shippingUsd))}</td></tr><tr><td>Taux VISA</td><td>1 USD</td><td>${escapeHTML(fmtNumber(q.visaRate,2))} MGA</td></tr><tr><td>Frais & traitement</td><td>Frais applicables inclus</td><td>${escapeHTML(fmtMGA(q.feesClientMGA,0))}</td></tr></tbody></table><div class="print-total"><span>Total à payer</span><strong>${escapeHTML(fmtMGA(q.totalMGA,0))}</strong></div>${q.note?`<p class="print-note"><strong>Note :</strong> ${escapeHTML(q.note)}</p>`:""}<footer class="print-footer"><span>eVidy US · Service opéré par PREST OFFICE</span><span>${escapeHTML(q.number)}</span></footer></article>`}
function printAnyQuote(q){if(!q?.totalMGA)return;renderPrint(q);setTimeout(()=>window.print(),60)}
function readProductInputs(){state.product.url=$("productUrl").value.trim();state.product.itemUsd=num($("clientAmount").value);state.product.domesticUsd=num($("domesticUsd").value);state.package.weight=num($("weightLb").value);state.package.length=num($("lengthIn").value);state.package.width=num($("widthIn").value);state.package.height=num($("heightIn").value);state.warehouse=$("warehouse").value;state.customsReserve=num($("customsReserve").value);state.peFeesUsd=num($("peFeesUsd").value);state.localDelivery=num($("localDelivery").value);const manual=num($("visaRateManual").value);if(manual>=100)state.visaRate=manual;syncMetricFromImperial();persistState();refreshAll()}
function syncMetricFromImperial(){$("weightKg").value=lbToKg(state.package.weight).toFixed(2);$("lengthCm").value=inToCm(state.package.length).toFixed(1);$("widthCm").value=inToCm(state.package.width).toFixed(1);$("heightCm").value=inToCm(state.package.height).toFixed(1)}
function readMetricInputs(){state.product.title=$("productTitleManual").value.trim();const kg=num($("weightKg").value),l=num($("lengthCm").value),w=num($("widthCm").value),h=num($("heightCm").value);if(kg>0)state.package.weight=kgToLb(kg);if(l>0)state.package.length=cmToIn(l);if(w>0)state.package.width=cmToIn(w);if(h>0)state.package.height=cmToIn(h);$("weightLb").value=state.package.weight.toFixed(3);$("lengthIn").value=state.package.length.toFixed(3);$("widthIn").value=state.package.width.toFixed(3);$("heightIn").value=state.package.height.toFixed(3);persistState();refreshAll()}
function syncAmountFromClient(){state.product.itemUsd=num($("clientAmount").value);$("internalAmount").value=fmtNumber(state.product.itemUsd,2);persistState();refreshAll()}
function syncAmountFromInternal(){state.product.itemUsd=num($("internalAmount").value);$("clientAmount").value=fmtNumber(state.product.itemUsd,2);persistState();refreshAll()}

$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$$('[data-carrier]').forEach(b=>b.addEventListener('click',()=>{state.selectedCarrier=b.dataset.carrier;state.selectedRate=bestRateForCarrier(state.selectedCarrier);persistState();refreshAll()}));
$("topTransport").addEventListener("click",()=>{state.selectedCarrier=state.selectedCarrier==="DHL"?"FedEx":"DHL";state.selectedRate=bestRateForCarrier(state.selectedCarrier);persistState();refreshAll()});
$("clientAmount").addEventListener("input",syncAmountFromClient);$("internalAmount").addEventListener("input",syncAmountFromInternal);
["productUrl","weightLb","lengthIn","widthIn","heightIn","warehouse","domesticUsd","customsReserve","peFeesUsd","localDelivery","visaRateManual"].forEach(id=>$(id).addEventListener("input",readProductInputs));
["productTitleManual","weightKg","lengthCm","widthCm","heightCm"].forEach(id=>$(id).addEventListener("input",readMetricInputs));
$("manualShipping").addEventListener("click",async()=>{readMetricInputs();await refreshShipping()});
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
