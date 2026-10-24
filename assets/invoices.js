(() => {
  'use strict';
  const el = id => document.getElementById(id);
  if (!el('invoicesView')) return;
  const KEY = 'evidyInvoicesV1', SEQ_KEY = 'evidyInvoiceSeqV1', METHODS_KEY = 'evidyInvoiceMethodsV1', PENDING_KEY = 'evidyInvoicePendingV1';
  const O = PREST_OFFICE;
  const TYPES = {
    standard: { title: 'Facture', short: 'Facture' },
    deposit: { title: 'Facture d’acompte', short: 'Acompte' },
    balance: { title: 'Facture de solde', short: 'Solde' }
  };
  const METHODS = { mvola: 'MVola', orange: 'Orange Money', virement: 'Virement bancaire', especes: 'Espèces' };
  const CURRENCIES = ['USD', 'EUR', 'MGA'];
  const SERVICE_LINE = 'Droits, taxes et service · douane estimée, formalités, prestation eVidy';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = value => { const n = Number(String(value ?? '').trim().replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const safeGet = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const localISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const longDate = iso => { const d = new Date(`${iso}T12:00:00`); return Number.isNaN(d.valueOf()) ? (iso || '') : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d); };
  const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const money = (amount, currency = 'MGA') => fmtMoney(Number(amount) || 0, currency);
  const blankLine = (currency = 'USD') => ({ title: '', quantity: 1, unitPrice: 0, currency });
  const plausibleRate = r => r >= 1000 && r <= 20000;
  const isTransport = l => /^transport international/i.test(l.title || '');
  const isService = l => /^(droits, taxes et service|importation et service)/i.test(l.title || '');
  const isSellerShipping = l => /^livraison vendeur/i.test(l.title || '');
  // Articles au seul prix d'achat : il manque transport, droits, taxes et service.
  const needsCalc = inv => inv.type !== 'balance' && !inv.lines.some(isService)
    && inv.lines.some(l => l.currency !== 'MGA' && number(l.unitPrice) > 0 && !isTransport(l) && !isSellerShipping(l));

  // Anciennes factures (une devise par facture, frais de port et service à part) : converties une fois.
  function normalize(inv) {
    if (!inv || inv.v === 2) return inv;
    const cur = inv.currency || 'MGA', rate = number(inv.invoiceMgaRate);
    const lines = (inv.items || []).map(i => ({ title: i.title || '', quantity: Number(i.quantity) || 1, unitPrice: number(i.unitPrice), currency: cur }));
    if (number(inv.invoiceShipping) > 0) lines.push({ title: 'Transport / livraison', quantity: 1, unitPrice: number(inv.invoiceShipping), currency: cur });
    if (number(inv.invoiceService) > 0) lines.push({ title: 'Service eVidy', quantity: 1, unitPrice: number(inv.invoiceService), currency: cur });
    return {
      v: 2, id: inv.id || uid(), number: inv.number || null, issued: Boolean(inv.number), type: 'standard',
      date: inv.date || inv.invoiceDate || localISO(), customer: inv.customer || inv.invoiceCustomer || '',
      customerAddress: inv.invoiceCustomerAddress || '', quoteRef: '', marketplace: inv.invoiceMarketplace || '', orderRef: inv.invoiceOrderRef || '',
      lines, rates: rate > 0 ? { [cur]: rate } : {}, billing: cur === 'MGA' || rate > 0 ? 'MGA' : cur,
      depositPercent: DEPOSIT_PERCENT, depositPaid: 0, depositRef: '', payment: inv.invoicePayment === 'Payée' ? 'Payée' : 'À payer', methods: [], note: inv.invoiceNote || ''
    };
  }
  const load = () => (Array.isArray(safeGet(KEY, [])) ? safeGet(KEY, []) : []).map(normalize).filter(Boolean);
  let invoices = load();
  // draftMeta : liens de la facture ouverte (commande, fiche client, acompte prévu), absents du formulaire.
  let lines = [blankLine()], draftId = null, draftMeta = {};
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) try { fn(); } catch (e) { console.error('eVidy factures :', e); } };
  // Aucune facture n'est jamais écartée en silence : si la mémoire est pleine, on le dit.
  const saveAll = () => {
    try { localStorage.setItem(KEY, JSON.stringify(invoices)); } catch { showToast('Mémoire du navigateur pleine : exporte une sauvegarde (Suivi › Réglages), puis supprime d’anciens brouillons.', 'error'); }
    window.EvidySync?.changed('invoices');
  };
  const current = () => invoices.find(x => x.id === draftId);
  saveAll();

  function lineAmount(line, inv) {
    const q = number(line.quantity), p = number(line.unitPrice);
    if ((inv.billing || 'MGA') !== 'MGA') return q * p;
    if (line.currency === 'MGA') return Math.round(q * p);
    const rate = number(inv.rates?.[line.currency]);
    return rate > 0 ? Math.round(q * p * rate) : NaN;
  }
  function totals(inv) {
    const amounts = inv.lines.map(l => lineAmount(l, inv));
    const total = amounts.reduce((s, a) => s + (Number.isFinite(a) ? a : 0), 0);
    let due = total;
    if (inv.type === 'deposit') due = Math.round(total * inv.depositPercent / 100);
    if (inv.type === 'balance') due = Math.max(0, total - number(inv.depositPaid));
    return { amounts, total, due, missingRate: amounts.some(a => !Number.isFinite(a)) };
  }

  const status = (msg, error = false) => { el('invoiceStatus').textContent = msg; el('invoiceStatus').style.color = error ? 'var(--danger)' : 'var(--muted)'; };
  const scanStatus = (msg, error = false) => { el('invoiceScanStatus').textContent = msg; el('invoiceScanStatus').style.color = error ? 'var(--danger)' : 'var(--muted)'; };
  // Coordonnées lues à chaque usage : un changement dans Réglages vaut pour les factures suivantes.
  function methodDetails(m) {
    if (m === 'mvola') return O.mvola ? [`${O.mvola} (${O.name})`] : [];
    if (m === 'orange') return O.orange ? [`${O.orange} (${O.name})`] : [];
    if (m === 'virement') return [O.bank.name && `${O.bank.name}${O.bank.holder ? ` · titulaire ${O.bank.holder}` : ''}`, O.bank.rib && `RIB ${O.bank.rib}`, O.bank.iban && `IBAN ${O.bank.iban}`, O.bank.bic && `BIC ${O.bank.bic}`].filter(Boolean);
    return [];
  }
  const checkedMethods = () => [...el('invoiceMethods').querySelectorAll('input:checked')].map(i => i.value).filter(v => v in METHODS);
  const setMethods = list => { for (const input of el('invoiceMethods').querySelectorAll('input')) input.checked = list.includes(input.value); };
  function methodsHint() {
    const shown = checkedMethods().filter(m => methodDetails(m).length).map(m => `${METHODS[m]} ${methodDetails(m).join(' · ')}`);
    el('invoiceMethodsHint').textContent = shown.length ? `Sur la facture : ${shown.join(' ; ')}` : '';
  }

  function read() {
    return {
      v: 2, id: draftId || uid(), number: null, issued: false, type: TYPES[el('invoiceType').value] ? el('invoiceType').value : 'standard',
      date: el('invoiceDate').value, customer: el('invoiceCustomer').value.trim(), customerAddress: el('invoiceCustomerAddress').value.trim(), customerPhone: el('invoiceCustomerPhone').value.trim(),
      quoteRef: el('invoiceQuoteRef').value.trim(), marketplace: el('invoiceMarketplace').value.trim(), orderRef: el('invoiceOrderRef').value.trim(),
      lines: lines.map(l => ({ title: String(l.title || '').trim(), quantity: Math.max(1, Math.floor(number(l.quantity)) || 1), unitPrice: number(l.unitPrice), currency: CURRENCIES.includes(l.currency) ? l.currency : 'USD' })),
      rates: { USD: number(el('invoiceRateUsd').value), EUR: number(el('invoiceRateEur').value) }, billing: 'MGA',
      depositPercent: Number(draftMeta.depositPercent) || DEPOSIT_PERCENT, orderId: draftMeta.orderId || '', clientId: draftMeta.clientId || '',
      depositPaid: Math.round(number(el('invoiceDepositPaid').value)), depositRef: el('invoiceDepositRef').value.trim(),
      payment: el('invoicePayment').value === 'Payée' ? 'Payée' : 'À payer', methods: checkedMethods(), note: el('invoiceNote').value.trim()
    };
  }
  function fill(inv) {
    draftId = inv.id || null;
    draftMeta = { orderId: inv.orderId || '', clientId: inv.clientId || '', depositPercent: inv.depositPercent };
    el('invoiceType').value = inv.type || 'standard';
    el('invoiceDate').value = inv.date || localISO();
    el('invoiceCustomer').value = inv.customer || '';
    el('invoiceCustomerAddress').value = inv.customerAddress || '';
    el('invoiceCustomerPhone').value = inv.customerPhone || '';
    el('invoiceQuoteRef').value = inv.quoteRef || '';
    el('invoiceMarketplace').value = inv.marketplace || '';
    el('invoiceOrderRef').value = inv.orderRef || '';
    el('invoiceRateUsd').value = number(inv.rates?.USD) > 0 ? number(inv.rates.USD).toFixed(2) : '';
    el('invoiceRateEur').value = number(inv.rates?.EUR) > 0 ? number(inv.rates.EUR).toFixed(2) : '';
    el('invoiceDepositPaid').value = inv.depositPaid || '';
    el('invoiceDepositRef').value = inv.depositRef || '';
    el('invoicePayment').value = inv.payment === 'Payée' ? 'Payée' : 'À payer';
    setMethods(Array.isArray(inv.methods) ? inv.methods : []);
    el('invoiceNote').value = inv.note || '';
    lines = Array.isArray(inv.lines) && inv.lines.length ? inv.lines.map(l => ({ ...l })) : [blankLine()];
    el('invoiceScreenshot').value = ''; el('invoiceFileName').textContent = 'Aucune capture choisie';
    rows();
  }
  // Taux client du jour déjà chargés par l'onglet Calcul (frais bancaires inclus) : jamais imprimés.
  function prefillRates() {
    if (!(number(el('invoiceRateUsd').value) > 0) && plausibleRate(state.visaRate)) el('invoiceRateUsd').value = state.visaRate.toFixed(2);
    if (!(number(el('invoiceRateEur').value) > 0) && plausibleRate(state.visaRateEur)) el('invoiceRateEur').value = state.visaRateEur.toFixed(2);
  }

  function refresh() {
    const inv = read(), t = totals(inv), type = inv.type;
    const foreign = inv.lines.some(l => l.currency !== 'MGA');
    if (foreign) prefillRates();
    el('invoiceRatesWrap').hidden = !foreign;
    el('invoiceBalanceWrap').hidden = type !== 'balance';
    el('invoiceCalcWrap').hidden = !needsCalc(inv);
    const issued = current()?.number;
    el('invoicePrintLabel').textContent = issued ? 'Mettre à jour et imprimer' : `Émettre la ${TYPES[type].title.toLowerCase()}`;
    el('invoiceEditing').hidden = !issued;
    if (issued) el('invoiceEditingText').textContent = `Modification de la facture ${issued} : le numéro reste le même.`;
    const label = type === 'deposit' ? `Acompte ${inv.depositPercent}\u00a0%` : type === 'balance' ? 'Solde' : 'Total';
    el('invoiceTotalLabel').textContent = label;
    el('invoiceTotal').textContent = t.missingRate ? 'Taux manquant' : money(t.due);
    el('invoiceTotalDetail').textContent = type === 'standard' || t.missingRate ? '' : `Commande ${money(t.total)}`;
    methodsHint();
    const amounts = el('invoiceLines').querySelectorAll('[data-amount]');
    amounts.forEach((node, i) => { const a = t.amounts[i]; node.textContent = lines[i]?.currency === 'MGA' ? '' : (Number.isFinite(a) && a > 0 ? `≈ ${money(a)}` : ''); });
  }
  function rows() {
    el('invoiceLines').innerHTML = lines.map((line, i) => '<div class="invoice-line" data-i="' + i + '">'
      + '<label class="invoice-line-title">Désignation<input data-k="title" type="text" value="' + escape(line.title) + '" placeholder="Article ou prestation"></label>'
      + '<label>Qté<input data-k="quantity" type="number" inputmode="numeric" min="1" step="1" value="' + escape(line.quantity) + '"></label>'
      + '<label>Prix unitaire<input data-k="unitPrice" type="number" inputmode="decimal" min="0" step="0.01" value="' + escape(line.unitPrice || '') + '" placeholder="0"></label>'
      + '<label>Devise<select data-k="currency">' + CURRENCIES.map(c => '<option value="' + c + '"' + (c === line.currency ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></label>'
      + '<button type="button" data-remove="' + i + '" aria-label="Retirer la ligne">×</button>'
      + '<small class="invoice-line-mga" data-amount></small></div>').join('');
    refresh();
  }
  function history() {
    const term = el('invoiceSearch').value.trim().toLowerCase(), filter = el('invoiceFilter').value;
    const due = invoices.filter(i => i.number && i.payment !== 'Payée');
    const dueSum = due.reduce((sum, i) => { const t = totals(i); return sum + (t.missingRate || (i.billing || 'MGA') !== 'MGA' ? 0 : t.due); }, 0);
    el('invoiceSummary').textContent = invoices.length ? `${invoices.filter(i => i.number).length} émises · ${due.length} à régler (${money(dueSum)})` : '';
    const shown = invoices.filter(inv => (filter === 'all' || (filter === 'draft' ? !inv.number : Boolean(inv.number) && (filter === 'paid') === (inv.payment === 'Payée')))
      && (!term || [inv.number, inv.customer, inv.customerPhone, inv.quoteRef, inv.orderRef, inv.depositRef].join(' ').toLowerCase().includes(term)));
    const btn = (act, id, label, extra = '') => '<button type="button" data-act="' + act + '" data-id="' + escape(id) + '"' + extra + '>' + label + '</button>';
    el('invoiceHistory').innerHTML = shown.length ? shown.slice(0, 200).map(inv => {
      const t = totals(inv), type = TYPES[inv.type] || TYPES.standard;
      const actions = (inv.number ? btn('print', inv.id, 'PDF') : '') + btn('edit', inv.id, 'Modifier')
        + (inv.number && inv.type === 'deposit' ? btn('balance', inv.id, 'Solde') : '') + btn('delete', inv.id, 'Supprimer', ' class="danger"');
      return '<div class="invoice-history-row"><div><strong>' + escape(inv.number || 'Brouillon') + ' · ' + escape(inv.customer || 'Client') + '</strong>'
        + '<span>' + escape(type.short) + ' · ' + escape(longDate(inv.date)) + ' · ' + escape(t.missingRate ? '—' : money(t.due, inv.billing || 'MGA')) + (inv.payment === 'Payée' ? ' · payée' : '') + (inv.updatedAt ? ' · modifiée' : '') + '</span></div>'
        + '<div class="invoice-history-actions">' + actions + '</div></div>';
    }).join('') : '<p class="invoice-empty">' + (invoices.length ? 'Aucune facture ne correspond.' : 'Aucune facture pour l’instant.') + '</p>';
  }
  function newInvoice() {
    fill({ type: 'standard', date: localISO(), lines: [blankLine()], methods: safeGet(METHODS_KEY, ['mvola', 'orange']) });
    draftId = null; draftMeta = {};
    status('');
  }
  // Enregistre sans toucher au formulaire ; la fiche client et la commande liée suivent.
  function store(inv) {
    const i = invoices.findIndex(x => x.id === inv.id), before = i >= 0 ? invoices[i] : null;
    if (inv.payment === 'Payée') inv.paidAt = before?.payment === 'Payée' && before.paidAt ? (inv.paidAt || before.paidAt) : (inv.paidAt || localISO());
    else delete inv.paidAt;
    const c = window.EvidyClients?.upsert({ id: inv.clientId, name: inv.customer, phone: inv.customerPhone, address: inv.customerAddress });
    if (c) inv.clientId = c.id;
    if (i >= 0) invoices[i] = inv; else invoices.unshift(inv);
    saveAll(); history();
    window.EvidyOrders?.syncInvoice(inv);
    notify();
    return inv;
  }
  function persistInvoice(inv) {
    store(inv);
    draftId = inv.id; draftMeta = { orderId: inv.orderId || '', clientId: inv.clientId || '', depositPercent: inv.depositPercent };
  }
  function saveDraft() {
    const inv = read(), issued = current();
    if (issued?.number) { updateIssued(inv, issued, false); return; }
    persistInvoice(inv);
    status('Brouillon enregistré.');
  }
  // Facture émise modifiée : même numéro, PDF régénéré ; à renvoyer au client.
  function updateIssued(inv, issued, print) {
    const error = invalid(inv);
    if (error) { status(error, true); return null; }
    if (!confirm(`Enregistrer les modifications de la facture ${issued.number} ? Le numéro reste le même : renvoie le nouveau PDF au client.`)) return null;
    const updated = { ...inv, number: issued.number, issued: true, issuedAt: issued.issuedAt, updatedAt: new Date().toISOString() };
    updated.html = invoiceHTML(updated);
    persistInvoice(updated); refresh();
    status(`Facture ${issued.number} mise à jour.${print ? ' Dans la fenêtre d’impression, choisis « Enregistrer au format PDF ».' : ''}`);
    if (print) printInvoice(updated);
    return updated;
  }
  function removeInvoice(id) {
    const i = invoices.findIndex(x => x.id === id); if (i < 0) return;
    const inv = invoices[i], label = inv.number ? `la facture ${inv.number}` : 'ce brouillon';
    if (!confirm(`Supprimer ${label}${inv.customer ? ` (${inv.customer})` : ''} ?${inv.number ? ' Son numéro ne sera pas réattribué.' : ''}`)) return;
    invoices.splice(i, 1); saveAll(); history();
    window.EvidyOrders?.invoiceRemoved(inv); notify();
    if (draftId === id) newInvoice();
    showToast(inv.number ? `Facture ${inv.number} supprimée.` : 'Brouillon supprimé.', 'info', { label: 'Annuler', run: () => { invoices.splice(Math.min(i, invoices.length), 0, inv); saveAll(); history(); window.EvidyOrders?.syncInvoice(inv); notify(); } });
  }
  // Un numéro émis n'est jamais réutilisé, même si le compteur local a été effacé ou le préfixe changé.
  function localNext(day, consume) {
    const seq = safeGet(SEQ_KEY, {});
    const used = invoices.filter(i => String(i.number || '').includes(`-${day}-`)).map(i => Number(String(i.number).split('-').pop()) || 0);
    const n = Math.max(Number(seq[day]) || 0, ...used, 0) + 1;
    if (consume) { seq[day] = n; localStorage.setItem(SEQ_KEY, JSON.stringify(seq)); }
    return n;
  }
  // Connecté : le serveur attribue le numéro (jamais deux fois le même entre appareils). Hors ligne : compteur local.
  async function nextNumber(iso) {
    const day = String(iso || localISO()).replaceAll('-', '');
    if (window.EvidySync?.enabled()) try { return docNumber('invoice', day, await EvidySync.number('invoice', day, localNext(day, false))); } catch { /* hors ligne */ }
    return docNumber('invoice', day, localNext(day, true));
  }
  function invalid(inv) {
    if (!inv.customer) return 'Indique le nom du client.';
    if (!inv.date) return 'Indique la date de la facture.';
    if (!inv.lines.length || inv.lines.some(l => !l.title || !(l.unitPrice > 0))) return 'Chaque ligne doit avoir une désignation et un prix.';
    for (const c of ['USD', 'EUR']) if (inv.lines.some(l => l.currency === c) && !plausibleRate(number(inv.rates[c]))) return `Indique le taux ${c} → ariary (ou touche « Taux Visa du jour »).`;
    const t = totals(inv);
    if (inv.type === 'balance' && !(inv.depositPaid > 0)) return 'Indique l’acompte déjà réglé.';
    if (inv.type === 'balance' && inv.depositPaid >= t.total) return 'L’acompte réglé dépasse le total de la commande.';
    return '';
  }

  function invoiceHTML(inv) {
    const t = totals(inv), billing = inv.billing || 'MGA', type = TYPES[inv.type] || TYPES.standard, paid = inv.payment === 'Payée';
    const origin = billing === 'MGA' && inv.lines.some(l => l.currency !== 'MGA');
    const body = inv.lines.map((l, i) => '<tr><td>' + escape(l.title) + '</td><td>' + escape(l.quantity) + '</td>'
      + '<td>' + (origin ? (l.currency === 'MGA' ? '—' : escape(money(l.unitPrice, l.currency))) : escape(money(l.unitPrice, billing))) + '</td>'
      + '<td>' + escape(money(t.amounts[i], billing)) + '</td></tr>').join('');
    const meta = [['Date', longDate(inv.date)]];
    if (inv.quoteRef) meta.push(['Devis', inv.quoteRef]);
    if (inv.marketplace) meta.push(['Achat sur', inv.marketplace]);
    if (inv.orderRef) meta.push(['Réf. commande', inv.orderRef]);
    const row = (label, value, sub = '') => '<div><span>' + escape(label) + (sub ? '<small>' + escape(sub) + '</small>' : '') + '</span><strong>' + escape(value) + '</strong></div>';
    let sums = '', grandLabel = 'Total';
    if (inv.type === 'deposit') {
      sums = row('Total de la commande', money(t.total, billing)) + row(`Solde prévu à la livraison`, money(t.total - t.due, billing));
      grandLabel = `Acompte ${inv.depositPercent}\u00a0%`;
    } else if (inv.type === 'balance') {
      sums = row('Total de la commande', money(t.total, billing)) + row('Acompte déjà réglé', '− ' + money(inv.depositPaid, billing), inv.depositRef ? `Facture ${inv.depositRef}` : '');
      grandLabel = 'Solde';
    }
    const methods = (inv.methods || []).filter(m => METHODS[m]);
    const payBlock = !methods.length ? ''
      : paid ? '<span class="iv-label">Réglé par</span><p>' + methods.map(m => escape(METHODS[m])).join(' · ') + '</p>'
      : '<span class="iv-label">Modes de règlement</span><ul class="iv-methods">' + methods.map(m => '<li><strong>' + escape(METHODS[m]) + '</strong>'
        + methodDetails(m).map(d => '<span>' + escape(d) + '</span>').join('') + '</li>').join('') + '</ul>';
    const terms = inv.type === 'deposit' ? paymentTermsText(inv.depositPercent)
      : inv.type === 'balance' ? 'Montant définitif : les droits et taxes de douane sont facturés à leur montant réellement acquitté, l’acompte déjà réglé est déduit.' : '';
    return '<article class="iv">'
      + '<header class="iv-head"><img class="iv-logo" src="assets/evidy-logo.svg" alt="eVidy US">'
      + '<div class="iv-title"><span>' + escape(type.title) + '</span><strong>N° ' + escape(inv.number) + '</strong></div></header>'
      + '<div class="iv-rule"></div>'
      + '<section class="iv-parties"><div><span class="iv-label">Émetteur</span><strong>' + escape(O.name) + '</strong><p>' + escape(O.brand) + ' · achats assistés</p><p>' + escape(O.address) + '</p><p>' + escape(O.phone) + '</p><p>' + escape(O.email) + '</p>'
      + '<p class="iv-legal"><span>NIF ' + escape(O.nif) + '</span><span>STAT ' + escape(O.stat) + '</span><span>RCS ' + escape(O.rcs) + '</span></p></div>'
      + '<div><span class="iv-label">Client</span><strong>' + escape(inv.customer) + '</strong>' + (inv.customerAddress ? '<p class="iv-pre">' + escape(inv.customerAddress) + '</p>' : '') + (inv.customerPhone ? '<p>' + escape(inv.customerPhone) + '</p>' : '') + '</div></section>'
      + '<section class="iv-meta">' + meta.map(([k, v]) => '<div><span>' + escape(k) + '</span><strong>' + escape(v) + '</strong></div>').join('') + '</section>'
      + '<table class="iv-table"><thead><tr><th>Désignation</th><th>Qté</th><th>' + (origin ? 'Prix d’origine' : 'Prix unitaire') + '</th><th>Montant</th></tr></thead><tbody>' + body + '</tbody></table>'
      + '<section class="iv-sum"><div class="iv-pay"><div class="iv-status' + (paid ? ' paid' : '') + '">' + (paid ? 'Payée' : 'À régler') + '</div>'
      + payBlock + '</div>'
      + '<div class="iv-totals">' + sums + '<div class="iv-grand"><span>' + escape(grandLabel) + '</span><strong>' + escape(money(t.due, billing)) + '</strong></div></div></section>'
      + (terms ? '<p class="iv-note">' + escape(terms) + '</p>' : '')
      + (inv.note ? '<p class="iv-note">' + escape(inv.note) + '</p>' : '')
      + '<footer class="iv-foot"><span>' + escape(O.name) + ' · NIF ' + escape(O.nif) + ' · STAT ' + escape(O.stat) + ' · ' + escape(O.tax) + '</span><span>' + escape(inv.number) + '</span></footer>'
      + '</article>';
  }
  function printInvoice(inv) {
    el('printStage').innerHTML = inv.html || invoiceHTML(inv);
    printStageNow(`${(TYPES[inv.type] || TYPES.standard).title} ${inv.number}`);
  }
  let issuing = false;
  async function issue() {
    if (issuing) return;
    let inv = read();
    const previous = invoices.find(x => x.id === inv.id);
    if (previous?.number) { updateIssued(inv, previous, true); return; }
    const error = invalid(inv);
    if (error) { status(error, true); return; }
    const t = totals(inv), type = TYPES[inv.type];
    if (!confirm(`Émettre la ${type.title.toLowerCase()} de ${money(t.due)} pour ${inv.customer} ? Elle reçoit son numéro définitif.`)) return;
    issuing = true; el('invoicePrint').disabled = true; status('Attribution du numéro…');
    try { inv = { ...inv, number: await nextNumber(inv.date), issued: true, issuedAt: new Date().toISOString() }; }
    finally { issuing = false; el('invoicePrint').disabled = false; }
    inv.html = invoiceHTML(inv);
    persistInvoice(inv);
    localStorage.setItem(METHODS_KEY, JSON.stringify(inv.methods));
    status(`${type.title} ${inv.number} émise. Dans la fenêtre d’impression, choisis « Enregistrer au format PDF ».`);
    printInvoice(inv);
  }

  // Lignes d'un devis ou du calcul en cours : mêmes taux, total identique à l'ariary près.
  function quoteLines(q) {
    // Taux arrondis comme dans le formulaire : le total retombe exactement sur celui du devis.
    const round2 = v => Math.round(Number(v) * 100) / 100;
    const rates = { USD: round2(Number(q.visaRate) || state.visaRate), EUR: round2(Number(q.visaRateEur) || state.visaRateEur) };
    const items = quoteItems(q), out = [];
    for (const i of items) {
      const p = itemPrice(i);
      out.push({ title: i.title || 'Article', quantity: 1, unitPrice: p.amount, currency: p.currency });
      if (Number(i.domesticPrice) > 0) out.push({ title: items.length > 1 ? `Livraison vendeur · ${i.title}` : 'Livraison vendeur', quantity: 1, unitPrice: Number(i.domesticPrice), currency: p.currency });
    }
    if (!items.some(i => Number(i.domesticPrice) > 0) && Number(q.domesticUsd) > 0) out.push({ title: 'Livraison vendeur', quantity: 1, unitPrice: Number(q.domesticUsd), currency: 'USD' });
    const carrier = `${q.shippingCarrier || ''} ${q.shippingService || ''}`.trim();
    if (Number(q.shippingUsd) > 0) out.push({ title: `Transport international${carrier ? ` · ${carrier}` : ''}`, quantity: 1, unitPrice: Number(q.shippingUsd), currency: 'USD' });
    const partial = out.reduce((s, l) => s + Math.round(l.unitPrice * l.quantity * rates[l.currency]), 0);
    out.push({ title: SERVICE_LINE, quantity: 1, unitPrice: Math.max(0, Math.round(Number(q.totalMGA) || 0) - partial), currency: 'MGA' });
    return { lines: out, rates };
  }
  // Devis → facture d'acompte, rattachée à la commande et à la fiche client.
  function fromQuote(q, opts = {}) {
    const { lines: out, rates } = quoteLines(q);
    fill({
      type: 'deposit', date: localISO(), customer: q.client || '', customerAddress: q.address || '', customerPhone: q.phone || '', quoteRef: q.number || '',
      marketplace: '', orderRef: '', lines: out, rates, depositPercent: Number(q.depositPercent) || DEPOSIT_PERCENT,
      orderId: opts.orderId || q.orderId || '', clientId: opts.clientId || q.clientId || '',
      payment: 'À payer', methods: safeGet(METHODS_KEY, ['mvola', 'orange']), note: ''
    });
    draftId = null;
    status(`Facture d’acompte préparée depuis le devis ${q.number}. Vérifie, puis émets-la.`);
    el('invoicesView').scrollIntoView({ behavior: 'smooth' });
  }
  // Facture saisie à la main → onglet Calcul, pour la chiffrer exactement comme un devis.
  const invoiceTask = ctx => ({ kind: 'invoice', title: 'Facture en préparation', label: 'Facturer', ctx,
    text: `${(TYPES[ctx.type] || TYPES.standard).title} · ${ctx.customer || 'client à renseigner'}. Vérifie le colis et le transport, puis touche « Facturer ».` });
  function toCalc() {
    const inv = read();
    const foreign = inv.lines.filter(l => l.currency !== 'MGA' && l.unitPrice > 0 && !isTransport(l));
    const articles = foreign.filter(l => !isSellerShipping(l));
    if (!articles.length) { status('Ajoute d’abord les articles, avec leur prix en USD ou EUR.', true); return; }
    const items = articles.map(l => ({ title: l.quantity > 1 ? `${l.quantity} × ${l.title}` : l.title, price: l.unitPrice * l.quantity, currency: l.currency, domesticPrice: 0 }));
    // Livraison vendeur : rattachée au premier article de la même devise (convertie sinon).
    for (const fee of foreign.filter(isSellerShipping)) {
      const target = items.find(i => i.currency === fee.currency) || items[0];
      const amount = fee.unitPrice * fee.quantity;
      target.domesticPrice += fee.currency === target.currency ? amount : amount * number(inv.rates[fee.currency]) / (number(inv.rates[target.currency]) || 1);
    }
    // Lignes en ariary ajoutées à la main (hors service recalculé) : conservées telles quelles.
    const extras = inv.lines.filter(l => l.currency === 'MGA' && l.unitPrice > 0 && !isService(l));
    setCalcTask(invoiceTask({ ...inv, id: draftId, lines: extras }));
    status('Articles envoyés au Calcul : vérifie le colis et le transport, puis touche « Facturer ».');
    const loading = loadItemsIntoCalculator(items);
    el('calcTask').scrollIntoView({ behavior: 'smooth', block: 'center' });
    loading.then(ok => {
      if (ok) showToast(calculate() ? 'Calcul fait. Vérifie poids et dimensions, puis touche « Facturer ».' : 'Vérifie poids et dimensions, calcule le transport, puis touche « Facturer ».', 'info');
    }).catch(err => showToast(`Calcul impossible : ${err.message || 'erreur'}`, 'error'));
  }
  async function fromCalc(task) {
    if (state.editingQuoteBase) closeQuote();
    const t = await ensureTotal(); if (!t) return;
    const ctx = task?.ctx || null;
    const { lines: out, rates } = quoteLines(currentDraft()); // devis non enregistré : aucun numéro consommé
    const base = ctx || { type: 'deposit', date: localISO(), payment: 'À payer', methods: safeGet(METHODS_KEY, ['mvola', 'orange']) };
    fill({ ...base, lines: [...out, ...(ctx?.lines || [])], rates, depositPercent: DEPOSIT_PERCENT });
    setCalcTask(null);
    setView('invoices');
    status('Facture calculée comme un devis : vérifie les lignes, puis émets-la.');
    el('invoicesView').scrollIntoView({ behavior: 'smooth' });
  }
  // Facture d'acompte émise → facture de solde (à ajuster selon le dédouanement réel).
  function balanceFrom(dep) {
    const t = totals(dep);
    fill({ ...dep, id: null, number: null, issued: false, html: undefined, type: 'balance', date: localISO(), depositPaid: t.due, depositRef: dep.number, payment: 'À payer', note: '' });
    draftId = null;
    status('Facture de solde préparée. Ajuste « Droits, taxes et service » aux droits et taxes réellement payés, puis émets-la.');
    el('invoicesView').scrollIntoView({ behavior: 'smooth' });
  }

  async function imageDataUrl(file) {
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('Choisis une image PNG, JPG ou WebP.');
    const direct = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('Impossible de lire la capture')); reader.readAsDataURL(file); });
    if (file.size <= 3_700_000) return direct;
    const img = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(Error('Capture illisible')); image.src = direct; });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  }
  async function analyze() {
    const file = el('invoiceScreenshot').files?.[0];
    if (!file) { scanStatus('Choisis d’abord une capture.', true); return; }
    const button = el('invoiceAnalyze'); button.disabled = true;
    scanStatus('Lecture de la capture…');
    try {
      const image = await imageDataUrl(file);
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 45000);
      let response;
      try {
        response = await fetch(CONFIG.apiBase + '/api/invoice-screenshot-analyze', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ imageDataUrl: image })
        });
      } finally { clearTimeout(timeout); }
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Analyse indisponible');
      if (!Array.isArray(result.items) || !result.items.length) throw Error('aucun article lisible');
      const currency = CURRENCIES.includes(result.currency) ? result.currency : 'USD';
      lines = result.items.map(i => ({ title: i.title || '', quantity: i.quantity || 1, unitPrice: i.unitPrice ?? 0, currency }));
      if (Number(result.delivery) > 0) lines.push({ title: 'Livraison vendeur', quantity: 1, unitPrice: Number(result.delivery), currency });
      if (result.marketplace) el('invoiceMarketplace').value = result.marketplace;
      if (result.orderReference) el('invoiceOrderRef').value = result.orderReference;
      rows();
      const other = result.currency && !CURRENCIES.includes(result.currency) ? ` Devise ${result.currency} non gérée : prix à convertir en USD, EUR ou ariary.` : '';
      scanStatus(`${result.items.length} article(s) ajouté(s).${result.needsReview ? ' Certaines valeurs sont incertaines.' : ''} Vérifie les prix avant d’émettre.${other}`, Boolean(other));
    } catch (err) { scanStatus('Analyse impossible : ' + (err.name === 'AbortError' ? 'délai dépassé.' : (err.message || 'erreur.')) + ' Saisie manuelle possible.', true); }
    finally { button.disabled = false; }
  }
  async function todayRates() {
    const button = el('invoiceRatesToday'); button.disabled = true;
    try {
      const get = c => fetch(`${CONFIG.apiBase}/api/visa-rate?from=${c}&bankFee=${CONFIG.visaBankFeePercent}`).then(r => r.json().then(j => r.ok ? j : Promise.reject(Error(j.error))));
      const [usd, eur] = await Promise.all([get('USD'), get('EUR').catch(() => null)]);
      if (plausibleRate(Number(usd.rate))) el('invoiceRateUsd').value = Number(usd.rate).toFixed(2);
      if (plausibleRate(Number(eur?.rate))) el('invoiceRateEur').value = Number(eur.rate).toFixed(2);
      status(usd.source === 'visa' ? 'Taux Visa du jour appliqués.' : 'Visa indisponible : taux de marché appliqués, à vérifier.', usd.source !== 'visa');
      refresh();
    } catch { status('Taux du jour indisponibles : saisis-les à la main.', true); }
    finally { button.disabled = false; }
  }

  el('invoiceLines').addEventListener('input', e => {
    const input = e.target.closest('[data-k]'), row = e.target.closest('[data-i]'); if (!input || !row) return;
    const line = lines[Number(row.dataset.i)]; if (!line) return;
    line[input.dataset.k] = input.dataset.k === 'title' || input.dataset.k === 'currency' ? input.value : number(input.value);
    refresh();
  });
  el('invoiceLines').addEventListener('click', e => { const btn = e.target.closest('[data-remove]'); if (!btn) return; lines.splice(Number(btn.dataset.remove), 1); if (!lines.length) lines = [blankLine()]; rows(); });
  el('invoiceAddLine').addEventListener('click', () => { lines.push(blankLine(lines.at(-1)?.currency || 'USD')); rows(); el('invoiceLines').querySelector('.invoice-line:last-child input')?.focus(); });
  el('invoiceAnalyze').addEventListener('click', analyze);
  el('invoiceScreenshot').addEventListener('change', () => { el('invoiceFileName').textContent = el('invoiceScreenshot').files?.[0]?.name || 'Aucune capture choisie'; });
  el('invoiceRatesToday').addEventListener('click', todayRates);
  el('invoiceCalc').addEventListener('click', toCalc);
  calcTaskHandlers.invoice = { go: fromCalc, cancel: () => setView('invoices') };
  // Facture en préparation laissée par la version précédente : reprise dans le nouveau bandeau.
  const legacyPending = safeGet(PENDING_KEY, null);
  if (legacyPending) { localStorage.removeItem(PENDING_KEY); if (!calcTask()) setCalcTask(invoiceTask(legacyPending)); }
  el('invoiceNew').addEventListener('click', newInvoice);
  el('invoiceSave').addEventListener('click', saveDraft);
  el('invoicePrint').addEventListener('click', issue);
  for (const id of ['invoiceType', 'invoiceRateUsd', 'invoiceRateEur', 'invoiceDepositPaid', 'invoiceMethods']) el(id).addEventListener('input', refresh);
  el('invoiceHistory').addEventListener('click', e => {
    const button = e.target.closest('button[data-act]'); if (!button) return;
    const inv = invoices.find(x => x.id === button.dataset.id); if (!inv) return;
    const act = button.dataset.act;
    if (act === 'print') printInvoice(inv);
    else if (act === 'balance') balanceFrom(inv);
    else if (act === 'delete') removeInvoice(inv.id);
    else { fill(inv); status(inv.number ? `Facture ${inv.number} ouverte : modifie-la, puis touche « Enregistrer ».` : 'Brouillon rouvert.'); el('invoicesView').scrollIntoView({ behavior: 'smooth' }); }
  });
  el('invoiceSearch').addEventListener('input', history);
  el('invoiceFilter').addEventListener('input', history);
  el('invoiceEditCancel').addEventListener('click', () => { newInvoice(); status('Modification annulée.'); });
  const find = id => invoices.find(x => x.id === id) || null;
  function open(id) {
    const inv = find(id); if (!inv) return;
    setView('invoices'); fill(inv);
    status(inv.number ? `Facture ${inv.number} ouverte : modifie-la, puis touche « Enregistrer ».` : 'Brouillon rouvert.');
    el('invoicesView').scrollIntoView({ behavior: 'smooth' });
  }
  // Encaissement depuis une commande : la facture passe « Payée », son PDF est régénéré.
  function markPaid(id, { method = '', date = '' } = {}) {
    const inv = find(id); if (!inv?.number || inv.payment === 'Payée') return null;
    const updated = { ...inv, payment: 'Payée', paidAt: date || localISO(), methods: METHODS[method] ? [method] : (inv.methods || []), updatedAt: new Date().toISOString() };
    updated.html = invoiceHTML(updated);
    store(updated);
    if (draftId === id) fill(updated);
    showToast(`Facture ${inv.number} payée.`, 'info');
    return updated;
  }
  function balanceFor(id) { const dep = find(id); if (!dep) return; setView('invoices'); balanceFrom(dep); }
  function reload() { invoices = load(); if (draftId && !current()) newInvoice(); history(); notify(); }
  window.EvidySync?.onApply('invoices', reload);
  window.EvidyInvoices = {
    fromQuote, reload, refresh, open, markPaid, balanceFor, totals,
    list: () => invoices.slice(), get: find, onChange: fn => { listeners.add(fn); }
  };
  newInvoice(); history();
})();
