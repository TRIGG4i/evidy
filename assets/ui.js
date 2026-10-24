// Outils d'interface partagés par les modules de gestion : feuilles, liens WhatsApp, dates, modèles de texte.
(() => {
  'use strict';
  let layer = 110;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = () => new Date().toISOString();

  // Feuilles de gestion : la dernière ouverte passe devant, le fond ou × la ferme.
  function openSheet(id) {
    const s = document.getElementById(id); if (!s) return;
    s.style.zIndex = String(++layer);
    s.classList.add('open');
    document.body.style.overflow = 'hidden';
    const inner = s.querySelector('.sheet'); if (inner) inner.scrollTop = 0;
  }
  function closeSheet(id) {
    const s = document.getElementById(id); if (!s) return;
    s.classList.remove('open');
    if (!document.querySelector('.sheet-backdrop.open')) document.body.style.overflow = '';
  }
  document.addEventListener('click', e => {
    const close = e.target.closest?.('[data-close-sheet]');
    if (close) { closeSheet(close.dataset.closeSheet); return; }
    if (e.target.matches?.('.sheet-backdrop[data-gestion]')) closeSheet(e.target.id);
  });

  // Numéros malgaches : 034 11 222 33 → 261341122233 (format attendu par WhatsApp).
  function phoneDigits(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 10 && d.startsWith('0')) d = `261${d.slice(1)}`;
    if (d.length === 9 && /^3/.test(d)) d = `261${d}`;
    return d;
  }
  const waLink = (phone, text) => `https://wa.me/${phoneDigits(phone)}?text=${encodeURIComponent(text)}`;
  const openWhatsApp = (phone, text) => window.open(waLink(phone, text), '_blank', 'noopener');
  const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m)).replace(/[ \t]+\n/g, '\n').trim();

  const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const daysSince = iso => { const t = Date.parse(String(iso || '').length === 10 ? `${iso}T12:00:00` : iso); return Number.isFinite(t) ? Math.round((dayStart(Date.now()) - dayStart(t)) / 86400000) : 0; };
  const ago = iso => { const n = daysSince(iso); return n <= 0 ? 'aujourd’hui' : n === 1 ? 'hier' : `il y a ${n} j`; };
  const shortDate = iso => { const d = new Date(String(iso || '').length === 10 ? `${iso}T12:00:00` : iso); return Number.isNaN(d.valueOf()) ? '' : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d); };

  window.EvidyUI = { esc, uid, now, openSheet, closeSheet, phoneDigits, waLink, openWhatsApp, fill, daysSince, ago, shortDate };
})();
