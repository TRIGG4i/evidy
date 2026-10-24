// Suivi : chiffres du mois, choses à faire, commandes par étape et encaissements des six derniers mois.
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  if (!el('suiviView')) return;
  const { esc } = EvidyUI;
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const compact = v => v >= 1e6 ? `${fmtNumber(v / 1e6, v >= 1e7 ? 0 : 1)} M` : v >= 1e3 ? `${fmtNumber(v / 1e3, 0)} k` : fmtNumber(v, 0);
  const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  let showTable = false;

  function data() {
    const T = EvidyInvoices.totals, invoices = EvidyInvoices.list(), orders = EvidyOrders.list();
    const issued = invoices.filter(i => i.number && (i.billing || 'MGA') === 'MGA');
    const known = new Set(orders.map(o => o.id));
    const linked = i => i.orderId && known.has(i.orderId);
    // Encaissements : paiements enregistrés sur les commandes, plus factures payées hors commande.
    const cash = [
      ...orders.flatMap(o => (o.payments || []).map(p => ({ date: String(p.date || ''), amount: Number(p.amount) || 0 }))),
      ...issued.filter(i => i.payment === 'Payée' && !linked(i)).map(i => ({ date: String(i.paidAt || i.date || ''), amount: T(i).due }))
    ];
    const open = orders.filter(EvidyOrders.isOpen);
    const looseDue = issued.filter(i => i.payment !== 'Payée' && !linked(i));
    const openQuotes = state.quotes.filter(q => !q.invoiced && !q.orderId);
    const now = new Date(), months = [];
    for (let k = 5; k >= 0; k--) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); months.push({ key: monthKey(d), label: MONTHS[d.getMonth()], long: `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}` }); }
    for (const m of months) {
      m.cash = sum(cash.filter(c => c.date.startsWith(m.key)), c => c.amount);
      m.billed = sum(issued.filter(i => String(i.date).startsWith(m.key)), i => T(i).due);
    }
    return { T, invoices, issued, orders, open, looseDue, openQuotes, months, linked };
  }

  function kpis(d) {
    const cur = d.months.at(-1), prev = d.months.at(-2);
    const toCollect = sum(d.open, o => EvidyOrders.figures(o).remaining) + sum(d.looseDue, i => d.T(i).due);
    const dueCount = d.issued.filter(i => i.payment !== 'Payée').length;
    const waiting = d.open.filter(o => o.status === 'attente').length;
    const tile = (label, value, sub, act = '') => '<button type="button" class="kpi"' + (act ? ' data-go="' + act + '"' : '') + '><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(sub) + '</small></button>';
    el('suiviKpis').innerHTML = tile(`Encaissé · ${cur.label}`, fmtMGA(cur.cash, 0), `${prev.label} : ${fmtMGA(prev.cash, 0)}`)
      + tile('À encaisser', fmtMGA(toCollect, 0), `${dueCount} facture(s) à régler`, 'invoices')
      + tile('Commandes en cours', String(d.open.length), waiting ? `${waiting} en attente d’acompte` : 'aucune en attente d’acompte', 'orders')
      + tile('Devis en attente', String(d.openQuotes.length), fmtMGA(sum(d.openQuotes, q => q.totalMGA), 0), 'quotes');
  }

  // À faire : ce qui attend une action, le plus urgent d'abord.
  function todos(d) {
    const items = [], since = o => [...(o.events || [])].reverse().find(e => e.status === o.status)?.at || o.createdAt;
    for (const o of d.open) {
      const f = EvidyOrders.figures(o), age = EvidyUI.daysSince(since(o)), who = o.client || o.number;
      if (o.status === 'attente') items.push({ rank: 1, age, kind: 'order', id: o.id, title: `Acompte attendu · ${who}`, sub: `${o.number} · ${fmtMGA(Math.round(f.total * (Number(o.depositPercent) || DEPOSIT_PERCENT) / 100), 0)} · ${EvidyUI.ago(since(o))}` });
      else if (o.status === 'livree' && f.remaining > 0) items.push({ rank: 1, age, kind: 'order', id: o.id, title: `Solde à encaisser · ${who}`, sub: `${o.number} · reste ${fmtMGA(f.remaining, 0)}` });
      else if (o.status === 'arrivee') items.push({ rank: 2, age, kind: 'order', id: o.id, title: `À livrer · ${who}`, sub: `${o.number} · facture de solde à préparer` });
      else if (['acompte', 'achetee', 'entrepot', 'expediee'].includes(o.status) && age >= 10) items.push({ rank: 3, age, kind: 'order', id: o.id, title: `Sans nouvelles depuis ${age} j · ${who}`, sub: `${o.number} · ${EvidyOrders.step(o.status).label} : vérifier le suivi` });
    }
    for (const i of d.issued.filter(x => x.payment !== 'Payée' && !d.linked(x))) {
      const age = EvidyUI.daysSince(i.date);
      if (age >= 7) items.push({ rank: 2, age, kind: 'invoice', id: i.id, title: `Facture à régler · ${i.customer || i.number}`, sub: `${i.number} · ${fmtMGA(d.T(i).due, 0)} · depuis ${age} j` });
    }
    for (const q of d.openQuotes) {
      const age = EvidyUI.daysSince(q.createdAt);
      if (age >= 2 && age <= 30) items.push({ rank: 4, age, kind: 'quote', id: q.id, title: `Devis à relancer · ${q.client || q.number}`, sub: `${q.number} · ${fmtMGA(q.totalMGA, 0)} · ${EvidyUI.ago(q.createdAt)}` });
    }
    items.sort((a, b) => a.rank - b.rank || b.age - a.age);
    el('suiviTodo').innerHTML = items.length ? items.slice(0, 8).map(t => '<button type="button" class="history-row todo-row rank-' + t.rank + '" data-kind="' + t.kind + '" data-id="' + esc(t.id) + '"><span><strong>' + esc(t.title) + '</strong><small>' + esc(t.sub) + '</small></span><svg class="icon sm"><use href="#i-chevron"/></svg></button>').join('')
      + (items.length > 8 ? '<p class="field-hint">Et ' + (items.length - 8) + ' autre(s).</p>' : '')
      : '<p class="invoice-empty">Rien en attente. Les relances d’acompte, soldes et devis à relancer apparaîtront ici.</p>';
  }

  function pipeline(d) {
    el('suiviPipeline').innerHTML = EvidyOrders.steps.filter(s => s.id !== 'soldee').map(s => {
      const n = d.open.filter(o => o.status === s.id).length;
      return '<button type="button" class="pipe-step' + (n ? ' has' : '') + '" data-step="' + s.id + '"><strong>' + n + '</strong><span>' + esc(s.label) + '</span></button>';
    }).join('');
  }

  // Barres fines (24 px au plus), extrémité arrondie de 4 px, base droite ; grille en filets discrets.
  function chart(d) {
    const box = el('suiviChart'), W = Math.max(260, Math.round(box.clientWidth || 320)), H = 188;
    const pad = { top: 22, right: 4, bottom: 26, left: 40 }, pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;
    const max = Math.max(...d.months.map(m => m.cash), 0);
    const step = (() => { if (!max) return 1; const raw = max / 3, mag = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= raw); })();
    const top = max ? step * Math.ceil(max / step) : 1, y = v => pad.top + ph - (v / top) * ph;
    const col = pw / d.months.length, bw = Math.min(24, col * 0.5);
    let svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Encaissements des six derniers mois">';
    for (let v = 0; v <= top + 1e-9; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      svg += '<line class="chart-grid" x1="' + pad.left + '" x2="' + (W - pad.right) + '" y1="' + yy + '" y2="' + yy + '"/>'
        + '<text class="chart-axis" x="' + (pad.left - 6) + '" y="' + (yy + 3.5) + '" text-anchor="end">' + esc(max ? compact(v) : '0') + '</text>';
      if (!max) break;
    }
    d.months.forEach((m, i) => {
      const cx = pad.left + col * i + col / 2, x = cx - bw / 2, h = max ? (m.cash / top) * ph : 0, base = pad.top + ph;
      if (h > 0) {
        const r = Math.min(4, h, bw / 2), t = base - h;
        svg += '<path class="chart-bar" d="M' + x + ',' + base + 'V' + (t + r) + 'A' + r + ',' + r + ' 0 0 1 ' + (x + r) + ',' + t + 'H' + (x + bw - r) + 'A' + r + ',' + r + ' 0 0 1 ' + (x + bw) + ',' + (t + r) + 'V' + base + 'Z" data-i="' + i + '"/>';
      }
      svg += '<text class="chart-axis" x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(m.label) + '</text>';
      // Valeur écrite seulement pour le mois en cours ; les autres sont au survol et dans le tableau.
      if (i === d.months.length - 1 && m.cash > 0) svg += '<text class="chart-value" x="' + cx + '" y="' + (base - h - 6) + '" text-anchor="middle">' + esc(compact(m.cash)) + '</text>';
      svg += '<rect class="chart-hit" x="' + (pad.left + col * i) + '" y="' + pad.top + '" width="' + col + '" height="' + (ph + 4) + '" data-i="' + i + '" tabindex="0" aria-label="' + esc(`${m.long} : ${fmtMGA(m.cash, 0)}`) + '"/>';
    });
    box.innerHTML = svg + '</svg><div class="chart-tip" id="suiviTip" hidden></div>';
    box.dataset.months = JSON.stringify(d.months.map(m => [m.long, m.cash, pad.left + col * d.months.indexOf(m) + col / 2, y(m.cash)]));
    el('suiviTable').innerHTML = '<table class="chart-table"><thead><tr><th>Mois</th><th>Encaissé</th><th>Facturé</th></tr></thead><tbody>'
      + d.months.map(m => '<tr><td>' + esc(m.long) + '</td><td>' + esc(fmtMGA(m.cash, 0)) + '</td><td>' + esc(fmtMGA(m.billed, 0)) + '</td></tr>').join('') + '</tbody></table>';
    box.hidden = showTable; el('suiviTable').hidden = !showTable;
    el('suiviTableToggle').textContent = showTable ? 'Graphique' : 'Tableau';
  }
  function tip(i) {
    const box = el('suiviChart'), t = el('suiviTip'), rows = JSON.parse(box.dataset.months || '[]');
    box.querySelectorAll('.chart-bar').forEach(b => b.classList.toggle('active', b.dataset.i === String(i)));
    if (i == null || !rows[i]) { if (t) t.hidden = true; return; }
    const [label, value, x, yTop] = rows[i];
    t.replaceChildren(Object.assign(document.createElement('strong'), { textContent: fmtMGA(value, 0) }), Object.assign(document.createElement('span'), { textContent: label }));
    t.hidden = false;
    const w = t.offsetWidth, h = t.offsetHeight;
    let left = Math.min(Math.max(4, x - w / 2), box.clientWidth - w - 4), top = yTop - h - 10;
    // Pas la place au-dessus de la barre : l'infobulle passe à côté, sans la cacher.
    if (top < 0) { top = Math.max(0, yTop); left = x - w - 18 >= 4 ? x - w - 18 : Math.min(x + 18, box.clientWidth - w - 4); }
    t.style.left = `${left}px`; t.style.top = `${top}px`;
  }

  function sync(st = window.EvidySync?.status()) {
    const s = el('suiviSync'); if (!s || !st) return;
    s.textContent = !st.enabled ? 'Données sur cet appareil seulement · activer la synchronisation' : st.state === 'offline' ? 'Hors ligne : envoi dès le retour du réseau' : st.state === 'error' ? `Synchronisation en erreur : ${st.error}` : st.state === 'syncing' ? 'Synchronisation…' : `Synchronisé ${st.lastSync ? EvidyUI.ago(st.lastSync) : ''}`;
    s.dataset.state = st.enabled ? st.state : 'off';
  }
  function render() {
    if (state.view !== 'suivi') return;
    const d = data();
    kpis(d); todos(d); pipeline(d); chart(d); sync();
    el('suiviClients').textContent = `${window.EvidyClients?.list().length || 0} client(s)`;
  }

  el('suiviKpis').addEventListener('click', e => {
    const b = e.target.closest('[data-go]'); if (!b) return;
    if (b.dataset.go === 'orders') EvidyOrders.openList('active');
    else if (b.dataset.go === 'invoices') { setView('invoices'); el('invoiceFilter').value = 'due'; el('invoiceFilter').dispatchEvent(new Event('input')); }
    else setView(b.dataset.go);
  });
  el('suiviTodo').addEventListener('click', e => {
    const r = e.target.closest('[data-kind]'); if (!r) return;
    if (r.dataset.kind === 'order') EvidyOrders.open(r.dataset.id);
    else if (r.dataset.kind === 'invoice') EvidyInvoices.open(r.dataset.id);
    else { const q = state.quotes.find(x => x.id === r.dataset.id); if (q) { setView('quotes'); openQuote(q); } }
  });
  el('suiviPipeline').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) EvidyOrders.openList(b.dataset.step); });
  const hit = e => e.target.closest?.('.chart-hit');
  el('suiviChart').addEventListener('pointermove', e => { const h = hit(e); tip(h ? Number(h.dataset.i) : null); });
  el('suiviChart').addEventListener('pointerleave', () => tip(null));
  el('suiviChart').addEventListener('click', e => { const h = hit(e); tip(h ? Number(h.dataset.i) : null); });
  el('suiviChart').addEventListener('focusin', e => { const h = hit(e); if (h) tip(Number(h.dataset.i)); });
  el('suiviChart').addEventListener('focusout', () => tip(null));
  el('suiviTableToggle').addEventListener('click', () => { showTable = !showTable; render(); });
  el('suiviSync').addEventListener('click', () => setView('settings'));
  if ('ResizeObserver' in window) { let w = 0; new ResizeObserver(([entry]) => { const nw = Math.round(entry.contentRect.width); if (nw && Math.abs(nw - w) > 8) { w = nw; render(); } }).observe(el('suiviView')); }
  window.EvidySync?.onStatus(sync);
  for (const coll of ['quotes', 'invoices', 'orders', 'clients']) window.EvidySync?.onApply(coll, render);
  EvidyOrders.onChange(render);
  EvidyInvoices.onChange(render);
  viewHooks.suivi = render;
  window.EvidyDashboard = { render };
})();
