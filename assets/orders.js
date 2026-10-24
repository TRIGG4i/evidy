// Commandes : du devis accepté à la livraison — étapes, paiements, suivi des colis, factures liées.
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  if (!el('ordersView')) return;
  const { esc, uid, now } = EvidyUI;
  const KEY = 'evidyOrdersV1', SEQ_KEY = 'evidyOrderSeqV1';
  const STEPS = [
    { id: 'attente', label: 'Attente d’acompte', tone: 'warn', client: 'nous attendons votre acompte pour lancer l’achat' },
    { id: 'acompte', label: 'Acompte reçu', tone: 'gold', client: 'acompte bien reçu, l’achat est lancé' },
    { id: 'achetee', label: 'Achetée', tone: 'gold', client: 'commande passée auprès du vendeur' },
    { id: 'entrepot', label: 'Entrepôt US', tone: 'gold', client: 'colis reçu à notre entrepôt aux États-Unis' },
    { id: 'expediee', label: 'Expédiée', tone: 'gold', client: 'colis expédié vers Madagascar' },
    { id: 'arrivee', label: 'Arrivée', tone: 'gold', client: 'colis arrivé à Madagascar, dédouanement en cours' },
    { id: 'livree', label: 'Livrée', tone: 'ok', client: 'colis livré' },
    { id: 'soldee', label: 'Soldée', tone: 'ok', client: 'commande réglée et terminée, merci pour votre confiance' }
  ];
  const CANCELLED = { id: 'annulee', label: 'Annulée', tone: 'muted', client: 'commande annulée' };
  const step = id => STEPS.find(s => s.id === id) || (id === 'annulee' ? CANCELLED : STEPS[0]);
  const stepIndex = id => STEPS.findIndex(s => s.id === id);
  const isOpen = o => o.status !== 'soldee' && o.status !== 'annulee';
  const METHODS = { mvola: 'MVola', orange: 'Orange Money', virement: 'Virement', especes: 'Espèces', autre: 'Autre' };
  const CARRIERS = ['DHL', 'FedEx', 'UPS', 'USPS', 'Aramex', 'Colissimo', 'Autre'];
  const trackUrl = code => `https://t.17track.net/fr#nums=${encodeURIComponent(code)}`;
  const safe = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? f; } catch { return f; } };
  const load = () => (Array.isArray(safe(KEY, [])) ? safe(KEY, []) : []).filter(o => o && o.id);
  const byNumber = (a, b) => String(b.number || '').localeCompare(String(a.number || ''));
  const amount = v => { const n = Math.round(Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'))); return Number.isFinite(n) && n > 0 ? n : 0; };
  const chip = s => '<em class="status-chip tone-' + s.tone + '">' + esc(s.label) + '</em>';

  let orders = load(), editing = null, draft = null;
  const listeners = new Set();
  function saveAll() {
    orders.sort(byNumber);
    try { localStorage.setItem(KEY, JSON.stringify(orders)); } catch { showToast('Mémoire du navigateur pleine : exporte une sauvegarde (Suivi › Réglages).', 'error'); }
    window.EvidySync?.changed('orders');
    for (const fn of listeners) try { fn(); } catch (e) { console.error('eVidy commandes :', e); }
  }
  const touch = o => { o.updatedAt = now(); };
  const get = id => orders.find(o => o.id === id) || null;

  // Numéro : attribué par le serveur une fois connecté (aucun doublon entre appareils), sinon compteur local.
  const dayKey = () => isoDate().replaceAll('-', '');
  function localNext(day, consume) {
    const seq = safe(SEQ_KEY, {});
    const used = orders.filter(o => String(o.number || '').includes(`-${day}-`)).map(o => Number(String(o.number).split('-').pop()) || 0);
    const n = Math.max(Number(seq[day]) || 0, ...used, 0) + 1;
    if (consume) { seq[day] = n; localStorage.setItem(SEQ_KEY, JSON.stringify(seq)); }
    return n;
  }
  async function allocate() {
    const day = dayKey();
    if (window.EvidySync?.enabled()) try { return docNumber('order', day, await EvidySync.number('order', day, localNext(day, false))); } catch { /* hors ligne : compteur local */ }
    return docNumber('order', day, localNext(day, true));
  }

  const invoicesFor = o => (window.EvidyInvoices?.list() || []).filter(i => i.orderId === o.id || (!i.orderId && o.quoteRef && i.quoteRef === o.quoteRef));
  // Total : celui de la dernière facture émise (le solde ajuste la douane réelle), sinon celui du devis.
  function figures(o) {
    const all = invoicesFor(o), issued = all.filter(i => i.number);
    const latest = issued.filter(i => (i.billing || 'MGA') === 'MGA').sort((a, b) => String(b.issuedAt || b.date).localeCompare(String(a.issuedAt || a.date)))[0];
    const total = latest ? EvidyInvoices.totals(latest).total : Number(o.totalMGA) || 0;
    const paid = (o.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return { total, paid, remaining: Math.max(0, total - paid), invoices: issued, drafts: all.filter(i => !i.number) };
  }

  const fromQuoteFields = q => {
    const items = quoteItems(q);
    return {
      quoteId: q.id, quoteRef: q.number, clientId: q.clientId || '', client: q.client || '', phone: q.phone || '', address: q.address || '',
      title: items.map(i => i.title).filter(Boolean).join(' + ') || q.productTitle || 'Commande',
      items: items.map(i => ({ title: i.title || 'Article', url: i.url || '' })), totalMGA: Number(q.totalMGA) || 0, depositPercent: Number(q.depositPercent) || DEPOSIT_PERCENT
    };
  };
  // Devis accepté → commande (une seule par devis). Tant que rien n'est payé, elle suit le devis.
  async function ensureForQuote(q) {
    let o = get(q.orderId) || orders.find(x => x.quoteId === q.id);
    if (o) {
      if (!(o.payments || []).length) Object.assign(o, fromQuoteFields(q));
      touch(o); q.orderId = o.id; saveAll(); return o;
    }
    o = { id: uid(), number: await allocate(), createdAt: now(), updatedAt: now(), status: 'attente', ...fromQuoteFields(q), payments: [], tracking: [], events: [{ at: now(), status: 'attente' }], note: '' };
    orders.unshift(o); q.orderId = o.id; saveAll();
    return o;
  }

  function vars(o) {
    const f = figures(o), t = (o.tracking || []).at(-1);
    return {
      client: o.client || '', commande: o.number, statut: step(o.status).client, total: fmtMGA(f.total, 0), reste: fmtMGA(f.remaining, 0),
      suivi: t ? ` Suivi ${t.carrier} : ${t.code} (${trackUrl(t.code)})` : '', entreprise: `${PREST_OFFICE.brand} · ${PREST_OFFICE.phone}`
    };
  }
  const message = kind => window.EvidySettings?.messages()[kind] || '';
  const notify = o => EvidyUI.openWhatsApp(o.phone, EvidyUI.fill(message('status'), vars(o)));
  const remind = o => EvidyUI.openWhatsApp(o.phone, EvidyUI.fill(message('reminder'), vars(o)));

  function setStatus(o, status) {
    if (!o || o.status === status) return;
    o.status = status; (o.events ||= []).push({ at: now(), status }); touch(o); saveAll();
    showToast(`${o.number} : ${step(status).label}.`, 'info', o.phone && status !== 'annulee' ? { label: 'Prévenir le client', run: () => notify(o) } : null);
  }
  // Après un paiement : acompte reçu, ou commande livrée entièrement réglée → soldée.
  function afterPayment(o) {
    const f = figures(o);
    const advance = s => { o.status = s; (o.events ||= []).push({ at: now(), status: s }); };
    if (o.status === 'attente' && f.paid > 0) advance('acompte');
    if (o.status === 'livree' && f.total > 0 && f.paid >= f.total) advance('soldee');
    touch(o); saveAll();
  }
  function addPayment(o, p) {
    (o.payments ||= []).push({ id: uid(), date: p.date || isoDate(), amount: p.amount, method: p.method || '', ref: p.ref || '', invoiceId: p.invoiceId || '' });
    afterPayment(o);
  }
  // Facture liée payée (ou repassée à régler) : l'encaissement de la commande suit.
  function syncInvoice(inv) {
    const o = inv?.orderId && get(inv.orderId); if (!o) return;
    o.payments ||= [];
    const i = o.payments.findIndex(p => p.invoiceId === inv.id);
    if (inv.number && inv.payment === 'Payée') {
      const entry = { id: o.payments[i]?.id || uid(), date: inv.paidAt || inv.date, amount: EvidyInvoices.totals(inv).due, method: (inv.methods || [])[0] || '', ref: inv.number, invoiceId: inv.id };
      if (i >= 0 && JSON.stringify(o.payments[i]) === JSON.stringify(entry)) return;
      if (i >= 0) o.payments[i] = entry; else o.payments.push(entry);
      afterPayment(o);
    } else if (i >= 0) { o.payments.splice(i, 1); touch(o); saveAll(); }
    if (editing === o.id) renderSheet();
  }
  const invoiceRemoved = inv => syncInvoice({ ...inv, number: null });

  // ---------- Liste ----------
  function renderList() {
    const term = el('orderSearch').value.trim().toLowerCase(), filter = el('orderFilter').value;
    const open = orders.filter(isOpen), toCollect = open.reduce((s, o) => s + figures(o).remaining, 0);
    el('orderSummary').textContent = orders.length ? `${open.length} en cours · ${fmtMGA(toCollect, 0)} restant à encaisser` : '';
    const shown = orders.filter(o => (filter === 'all' || (filter === 'active' ? isOpen(o) : o.status === filter))
      && (!term || [o.number, o.client, o.phone, o.title, o.quoteRef, ...(o.tracking || []).map(t => t.code)].join(' ').toLowerCase().includes(term)));
    el('ordersList').innerHTML = shown.length ? '<div class="quote-list">' + shown.map(o => {
      const f = figures(o);
      return '<div class="quote-item" data-open-order="' + esc(o.id) + '"><div class="quote-icon"><svg class="icon"><use href="#i-box"/></svg></div>'
        + '<div class="quote-main"><strong>' + esc(o.client || o.number) + '</strong><span>' + esc(o.number) + ' · ' + esc(o.title || '') + '</span>' + chip(step(o.status)) + '</div>'
        + '<div class="quote-amount">' + esc(fmtMGA(f.total, 0)) + (f.remaining && o.status !== 'annulee' ? '<small>reste ' + esc(fmtMGA(f.remaining, 0)) + '</small>' : '') + '</div></div>';
    }).join('') + '</div>'
      : '<p class="invoice-empty">' + (orders.length ? 'Aucune commande ne correspond.' : 'Une commande est créée quand un devis est facturé (ou avec « Créer la commande » sur le devis).') + '</p>';
  }
  function openList(filter = 'active') {
    el('orderFilter').value = filter; el('orderSearch').value = '';
    setView('orders');
  }

  // ---------- Fiche commande ----------
  const field = (label, name, value, kind = 'text', wide = false) => '<label' + (wide ? ' class="invoice-wide"' : '') + '>' + esc(label)
    + (kind === 'textarea' ? '<textarea data-field="' + name + '" rows="2">' + esc(value) + '</textarea>'
      : '<input data-field="' + name + '" type="' + (kind === 'number' ? 'number" inputmode="numeric" min="0" step="1' : kind) + '" value="' + esc(value) + '"' + (name === 'client' ? ' list="clientNames" autocomplete="off"' : '') + '>') + '</label>';
  function infoCard(o) {
    return '<div class="form-card"><h3 class="invoice-h3">Client et commande</h3><div class="invoice-grid">'
      + field('Client', 'client', o.client || '', 'text', true) + field('Téléphone', 'phone', o.phone || '', 'tel') + field('Total (MGA)', 'totalMGA', o.totalMGA || '', 'number')
      + field('Adresse de livraison', 'address', o.address || '', 'textarea', true) + field('Articles', 'title', o.title || '', 'text', true) + field('Note interne', 'note', o.note || '', 'textarea', true)
      + '</div>' + (o.items?.some(i => i.url) ? '<div class="order-links">' + o.items.filter(i => i.url).map(i => '<a href="' + esc(i.url) + '" target="_blank" rel="noopener noreferrer">' + esc(i.title) + '</a>').join('') + '</div>' : '')
      + '<div class="backup-actions order-gap">' + (o.quoteId ? '<button type="button" class="secondary" data-act="quote">Devis ' + esc(o.quoteRef || '') + '</button>' : '')
      + (o.clientId ? '<button type="button" class="secondary" data-act="client">Fiche client</button>' : '') + '</div></div>';
  }
  function renderSheet() {
    const o = editing ? get(editing) : draft;
    if (!o) { EvidyUI.closeSheet('orderSheet'); return; }
    if (!editing) {
      el('orderSheetTitle').textContent = 'Nouvelle commande';
      el('orderSheetSub').textContent = 'Sans devis : indique le client, les articles et le total.';
      el('orderBody').innerHTML = infoCard(o) + '<button type="button" class="btn-ink order-wide" data-act="create">Créer la commande</button>';
      return;
    }
    const f = figures(o), s = step(o.status), idx = stepIndex(o.status), next = idx >= 0 && idx < STEPS.length - 1 ? STEPS[idx + 1] : null;
    const since = [...(o.events || [])].reverse().find(e => e.status === o.status)?.at || o.createdAt;
    el('orderSheetTitle').textContent = `Commande ${o.number}`;
    el('orderSheetSub').textContent = `${o.client || 'Client à renseigner'} · créée le ${displayDate(String(o.createdAt).slice(0, 10))}`;
    const progress = '<div class="order-progress" aria-hidden="true">' + STEPS.map((x, i) => '<span class="' + (o.status === 'annulee' ? '' : i <= idx ? 'done' : '') + '"></span>').join('') + '</div>';
    const statusCard = '<div class="form-card">' + progress
      + '<div class="order-step">' + chip(s) + '<span>' + esc(EvidyUI.ago(since)) + ' · étape ' + (idx >= 0 ? `${idx + 1}/${STEPS.length}` : '—') + '</span></div>'
      + '<div class="backup-actions">' + (next ? '<button type="button" class="btn-ink" data-act="next">' + esc(next.label) + ' →</button>' : '<span></span>')
      + '<button type="button" class="secondary" data-act="notify"' + (o.phone ? '' : ' disabled') + '>Prévenir (WhatsApp)</button></div>'
      + '<label class="order-select">Changer d’étape<select data-field="status">' + [...STEPS, CANCELLED].map(x => '<option value="' + x.id + '"' + (x.id === o.status ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('') + '</select></label></div>';
    const pays = (o.payments || []).map(p => '<div class="pay-row"><div><strong>' + esc(fmtMGA(p.amount, 0)) + '</strong><span>' + esc([displayDate(p.date), METHODS[p.method] || p.method, p.ref].filter(Boolean).join(' · ')) + '</span></div>'
      + (p.invoiceId ? '<em class="quote-tag">facture</em>' : '<button type="button" data-del-pay="' + esc(p.id) + '" aria-label="Supprimer ce paiement">×</button>') + '</div>').join('');
    const suggested = f.paid ? f.remaining : Math.round(f.total * (Number(o.depositPercent) || DEPOSIT_PERCENT) / 100);
    const moneyCard = '<div class="form-card"><h3 class="invoice-h3">Paiements</h3>'
      + '<div class="order-figures"><div><span>Total (MGA)</span><strong>' + esc(fmtNumber(f.total, 0)) + '</strong></div><div><span>Encaissé</span><strong>' + esc(fmtNumber(f.paid, 0)) + '</strong></div><div><span>Reste</span><strong class="' + (f.remaining ? 'due' : 'ok') + '">' + esc(fmtNumber(f.remaining, 0)) + '</strong></div></div>'
      + (pays ? '<div class="pay-list">' + pays + '</div>' : '')
      + '<div class="invoice-grid order-gap"><label>Montant (MGA)<input id="orderPayAmount" type="number" inputmode="numeric" min="0" step="1" value="' + (suggested > 0 ? suggested : '') + '"></label>'
      + '<label>Moyen<select id="orderPayMethod">' + Object.entries(METHODS).map(([k, v]) => '<option value="' + k + '">' + esc(v) + '</option>').join('') + '</select></label>'
      + '<label>Date<input id="orderPayDate" type="date" value="' + isoDate() + '"></label><label>Référence<input id="orderPayRef" type="text" placeholder="N° de transaction"></label></div>'
      + '<div class="backup-actions order-gap"><button type="button" class="secondary" data-act="pay">Ajouter le paiement</button>'
      + '<button type="button" class="secondary" data-act="remind"' + (o.phone && f.remaining ? '' : ' disabled') + '>Relancer (WhatsApp)</button></div></div>';
    const typeLabel = { deposit: 'Acompte', balance: 'Solde', standard: 'Facture' };
    const invRows = [...f.invoices, ...f.drafts].map(i => {
      const t = EvidyInvoices.totals(i), paid = i.payment === 'Payée';
      return '<div class="pay-row"><div><strong>' + esc(i.number || 'Brouillon') + ' · ' + esc(typeLabel[i.type] || 'Facture') + '</strong><span>' + esc(fmtMoney(t.due, i.billing || 'MGA')) + ' · ' + (i.number ? (paid ? 'payée' : 'à régler') : 'non émise') + '</span></div>'
        + '<div class="invoice-history-actions">' + (i.number && !paid ? '<button type="button" data-inv-paid="' + esc(i.id) + '">Encaisser</button>' : '') + '<button type="button" data-inv-open="' + esc(i.id) + '">Ouvrir</button></div></div>';
    }).join('');
    const dep = f.invoices.find(i => i.type === 'deposit'), hasBalance = f.invoices.some(i => i.type === 'balance' || i.type === 'standard');
    const invCard = '<div class="form-card"><h3 class="invoice-h3">Factures</h3>' + (invRows || '<p class="field-hint">Aucune facture liée.</p>')
      + '<div class="backup-actions order-gap">' + (!f.invoices.length && o.quoteId ? '<button type="button" class="secondary" data-act="deposit">Facture d’acompte</button>' : '')
      + (dep && !hasBalance ? '<button type="button" class="secondary" data-act="balance">Facture de solde</button>' : '') + '</div></div>';
    const tracks = (o.tracking || []).map((t, i) => '<div class="pay-row"><div><strong>' + esc(t.carrier) + ' · ' + esc(t.code) + '</strong><span>ajouté ' + esc(EvidyUI.ago(t.at)) + '</span></div>'
      + '<div class="invoice-history-actions"><a class="track-link" href="' + esc(trackUrl(t.code)) + '" target="_blank" rel="noopener noreferrer">Suivre</a><button type="button" data-del-track="' + i + '" aria-label="Retirer ce suivi">×</button></div></div>').join('');
    const trackCard = '<div class="form-card"><h3 class="invoice-h3">Suivi des colis</h3>' + tracks
      + '<div class="invoice-grid order-gap"><label>Transporteur<select id="orderTrackCarrier">' + CARRIERS.map(c => '<option>' + esc(c) + '</option>').join('') + '</select></label>'
      + '<label>N° de suivi<input id="orderTrackCode" type="text" autocapitalize="characters" autocomplete="off"></label></div>'
      + '<button type="button" class="secondary order-wide order-gap" data-act="track">Ajouter le suivi</button></div>';
    const events = '<div class="form-card"><h3 class="invoice-h3">Historique</h3><div class="event-list">' + [...(o.events || [])].reverse().map(e => '<div><span>' + esc(displayDate(String(e.at).slice(0, 10))) + '</span>' + esc(step(e.status).label) + '</div>').join('') + '</div></div>';
    el('orderBody').innerHTML = statusCard + moneyCard + invCard + trackCard + infoCard(o) + events
      + '<button class="text-btn danger" type="button" data-act="delete"><svg class="icon sm"><use href="#i-trash"/></svg>Supprimer cette commande</button>';
  }
  function open(id) {
    if (!get(id)) return;
    editing = id; draft = null; renderSheet(); EvidyUI.openSheet('orderSheet');
  }
  function openNew() {
    editing = null; draft = { client: '', phone: '', address: '', title: '', totalMGA: 0, note: '', items: [] };
    renderSheet(); EvidyUI.openSheet('orderSheet');
  }
  function readInfo(o) {
    for (const input of el('orderBody').querySelectorAll('[data-field]')) {
      const k = input.dataset.field; if (k === 'status') continue;
      o[k] = k === 'totalMGA' ? amount(input.value) : input.value.trim();
    }
  }
  function linkClient(o) {
    const c = window.EvidyClients?.upsert({ id: o.clientId, name: o.client, phone: o.phone, address: o.address });
    if (c) o.clientId = c.id;
  }
  async function create() {
    const o = draft; if (!o) return;
    readInfo(o);
    if (!o.client) { showToast('Indique le nom du client.', 'warn'); return; }
    Object.assign(o, { id: uid(), number: await allocate(), createdAt: now(), updatedAt: now(), status: 'attente', payments: [], tracking: [], events: [{ at: now(), status: 'attente' }], depositPercent: DEPOSIT_PERCENT });
    linkClient(o);
    orders.unshift(o); draft = null; editing = o.id; saveAll(); renderSheet(); renderList();
    showToast(`Commande ${o.number} créée.`, 'info');
  }
  function removeOrder(o) {
    if (!confirm(`Supprimer la commande ${o.number} ? Ses factures sont conservées.`)) return;
    const i = orders.indexOf(o); orders.splice(i, 1); saveAll();
    EvidyUI.closeSheet('orderSheet'); editing = null; renderList();
    showToast(`Commande ${o.number} supprimée.`, 'info', { label: 'Annuler', run: () => { orders.splice(Math.min(i, orders.length), 0, o); saveAll(); renderList(); } });
  }

  el('orderBody').addEventListener('change', e => {
    const input = e.target.closest('[data-field]'); if (!input) return;
    const o = editing ? get(editing) : null; if (!o) return; // brouillon : lu à la création
    if (input.dataset.field === 'status') { setStatus(o, input.value); renderSheet(); renderList(); return; }
    readInfo(o);
    if (['client', 'phone', 'address'].includes(input.dataset.field)) linkClient(o);
    touch(o); saveAll(); renderList();
    el('orderSheetSub').textContent = `${o.client || 'Client à renseigner'} · créée le ${displayDate(String(o.createdAt).slice(0, 10))}`;
  });
  el('orderBody').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'create') { create().catch(err => showToast(`Création impossible : ${err.message || 'erreur'}`, 'error')); return; }
    const o = get(editing); if (!o) return;
    if (act === 'next') { const idx = stepIndex(o.status); if (idx >= 0 && STEPS[idx + 1]) setStatus(o, STEPS[idx + 1].id); }
    else if (act === 'notify') notify(o);
    else if (act === 'remind') remind(o);
    else if (act === 'pay') {
      const a = amount(el('orderPayAmount').value);
      if (!a) { showToast('Indique le montant reçu.', 'warn'); return; }
      addPayment(o, { amount: a, method: el('orderPayMethod').value, date: el('orderPayDate').value || isoDate(), ref: el('orderPayRef').value.trim() });
      showToast(`${fmtMGA(a, 0)} encaissés sur ${o.number}.`, 'info');
    } else if (b.dataset.delPay) {
      if (!confirm('Supprimer ce paiement ?')) return;
      o.payments = (o.payments || []).filter(p => p.id !== b.dataset.delPay); touch(o); saveAll();
    } else if (act === 'track') {
      const code = el('orderTrackCode').value.trim().replace(/\s+/g, '');
      if (!code) { showToast('Indique le numéro de suivi.', 'warn'); return; }
      (o.tracking ||= []).push({ carrier: el('orderTrackCarrier').value, code, at: now() }); touch(o); saveAll();
    } else if (b.dataset.delTrack !== undefined) {
      o.tracking.splice(Number(b.dataset.delTrack), 1); touch(o); saveAll();
    } else if (b.dataset.invPaid) {
      EvidyInvoices.markPaid(b.dataset.invPaid, { method: el('orderPayMethod').value, date: el('orderPayDate').value || isoDate() });
    } else if (b.dataset.invOpen) { EvidyUI.closeSheet('orderSheet'); EvidyInvoices.open(b.dataset.invOpen); return; }
    else if (act === 'deposit') {
      const q = state.quotes.find(x => x.id === o.quoteId);
      if (!q) { showToast('Le devis de cette commande n’est plus sur cet appareil.', 'warn'); return; }
      EvidyUI.closeSheet('orderSheet'); setView('invoices'); EvidyInvoices.fromQuote(q, { orderId: o.id, clientId: o.clientId }); return;
    } else if (act === 'balance') {
      const dep = figures(o).invoices.find(i => i.type === 'deposit'); if (!dep) return;
      EvidyUI.closeSheet('orderSheet'); EvidyInvoices.balanceFor(dep.id); return;
    } else if (act === 'quote') {
      const q = state.quotes.find(x => x.id === o.quoteId);
      if (!q) { showToast('Le devis de cette commande n’est plus sur cet appareil.', 'warn'); return; }
      EvidyUI.closeSheet('orderSheet'); setView('quotes'); openQuote(q); return;
    } else if (act === 'client') { window.EvidyClients?.open(o.clientId); return; }
    else if (act === 'delete') { removeOrder(o); return; }
    else return;
    renderSheet(); renderList();
  });

  // Bouton de la fiche devis : commande liée, ou création sans passer par la facture.
  function renderQuoteButtons(q) {
    const b = el('quoteOrderBtn'); if (!b) return;
    const saved = q && state.quotes.some(x => x.id === q.id);
    b.hidden = !saved; if (!saved) return;
    const o = get(q.orderId) || orders.find(x => x.quoteId === q.id);
    el('quoteOrderLabel').textContent = o ? `Commande ${o.number} · ${step(o.status).label}` : 'Créer la commande';
  }
  el('quoteOrderBtn').addEventListener('click', async () => {
    const q = state.quotes.find(x => x.id === state.editingQuoteId); if (!q) return;
    try {
      const o = get(q.orderId) || orders.find(x => x.quoteId === q.id) || await ensureForQuote(q);
      if (q.orderId !== o.id) q.orderId = o.id;
      persistQuotes(); closeQuote(); setView('orders'); open(o.id);
    } catch (err) { showToast(`Commande impossible : ${err.message || 'erreur'}`, 'error'); }
  });

  el('orderSearch').addEventListener('input', renderList);
  el('orderFilter').addEventListener('input', renderList);
  el('ordersList').addEventListener('click', e => { const r = e.target.closest('[data-open-order]'); if (r) open(r.dataset.openOrder); });
  el('orderNew').addEventListener('click', openNew);
  el('orderFilter').innerHTML = '<option value="active">En cours</option><option value="all">Toutes</option>' + [...STEPS, CANCELLED].map(s => '<option value="' + s.id + '">' + esc(s.label) + '</option>').join('');
  function reload() {
    orders = load();
    if (state.view === 'orders') renderList();
    if (editing && el('orderSheet').classList.contains('open')) renderSheet();
    for (const fn of listeners) try { fn(); } catch (e) { console.error('eVidy commandes :', e); }
  }
  window.EvidySync?.onApply('orders', reload);
  window.EvidyInvoices?.onChange(() => { if (state.view === 'orders') renderList(); if (editing && el('orderSheet').classList.contains('open')) renderSheet(); });
  viewHooks.orders = renderList;
  window.EvidyOrders = {
    list: () => orders.slice(), get, open, openNew, openList, ensureForQuote, renderQuoteButtons, syncInvoice, invoiceRemoved, figures, step, steps: STEPS, isOpen,
    onChange: fn => listeners.add(fn), reload
  };
})();
