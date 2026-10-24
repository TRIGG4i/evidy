// Réglages : entreprise, paiement, documents, tarifs et messages, modifiables et partagés entre appareils ;
// plus le compte (un mot de passe) qui relie les appareils au serveur eVidy.
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  if (!el('settingsView')) return;
  const { esc } = EvidyUI;
  const KEY = 'evidySettingsV1', O = PREST_OFFICE, S = window.EvidySync;
  const clone = o => JSON.parse(JSON.stringify(o));
  // Valeurs d'origine : celles du code, tant que rien n'a été modifié.
  const DEFAULTS = {
    company: { name: O.name, brand: O.brand, address: O.address, phone: O.phone, email: O.email, nif: O.nif, stat: O.stat, rcs: O.rcs, tax: O.tax },
    payment: { depositPercent: DEPOSIT_PERCENT, mvola: O.mvola, orange: '', bankHolder: O.bank.holder, bankName: O.bank.name, rib: O.bank.rib, iban: O.bank.iban, bic: O.bank.bic },
    docs: { quotePrefix: DOCS.prefixes.quote, invoicePrefix: DOCS.prefixes.invoice, orderPrefix: DOCS.prefixes.order, quoteValidityDays: DOCS.quoteValidityDays, terms: DEFAULT_TERMS },
    pricing: { t1max: PRICING.tiers[0].max, t1: PRICING.tiers[0].percent, t2max: PRICING.tiers[1].max, t2: PRICING.tiers[1].percent, t3: PRICING.tiers[2].percent, minimumServiceFeeMGA: CONFIG.minimumServiceFeeMGA },
    messages: {
      quoteIntro: 'Bonjour {client}, voici votre devis eVidy :',
      status: 'Bonjour {client}, des nouvelles de votre commande {commande} : {statut}.{suivi}\n{entreprise}',
      reminder: 'Bonjour {client}, petit rappel : il reste {reste} à régler pour la commande {commande}. Merci !\n{entreprise}'
    }
  };
  const SECTIONS = [
    { id: 'company', title: 'Entreprise', sub: 'Émetteur imprimé sur les devis et les factures', fields: [
      ['name', 'Raison sociale'], ['brand', 'Marque'], ['address', 'Adresse', 'wide'], ['phone', 'Téléphone'], ['email', 'E-mail'],
      ['nif', 'NIF'], ['stat', 'STAT'], ['rcs', 'RCS', 'wide'], ['tax', 'Mention fiscale', 'wide']] },
    { id: 'payment', title: 'Paiement', sub: 'Acompte et coordonnées de règlement', fields: [
      ['depositPercent', 'Acompte (%)', 'int'], ['mvola', 'MVola'], ['orange', 'Orange Money'], ['bankHolder', 'Titulaire du compte'],
      ['bankName', 'Banque', 'wide'], ['rib', 'RIB', 'wide'], ['iban', 'IBAN', 'wide'], ['bic', 'BIC']] },
    { id: 'docs', title: 'Devis et factures', sub: 'Numérotation, validité et conditions', fields: [
      ['quotePrefix', 'Préfixe des devis', 'code'], ['invoicePrefix', 'Préfixe des factures', 'code'], ['orderPrefix', 'Préfixe des commandes', 'code'],
      ['quoteValidityDays', 'Validité du devis (jours)', 'int'], ['terms', 'Conditions de paiement', 'text', '{acompte} et {solde} deviennent les pourcentages.']] },
    { id: 'pricing', title: 'Tarifs', sub: 'Service eVidy selon le prix de l’article', fields: [
      ['t1max', 'Tranche 1 : jusqu’à ($)', 'num'], ['t1', 'Service tranche 1 (%)', 'num'], ['t2max', 'Tranche 2 : jusqu’à ($)', 'num'],
      ['t2', 'Service tranche 2 (%)', 'num'], ['t3', 'Au-delà (%)', 'num'], ['minimumServiceFeeMGA', 'Service minimum (MGA)', 'num']] },
    { id: 'messages', title: 'Messages', sub: 'Textes WhatsApp envoyés aux clients', fields: [
      ['quoteIntro', 'Avant le devis', 'text'], ['status', 'Avancement de commande', 'text'],
      ['reminder', 'Relance de paiement', 'text', 'Variables : {client}, {commande}, {statut}, {suivi}, {reste}, {total}, {entreprise}.']] }
  ];

  const readStored = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } };
  // Seules les clés connues sont reprises, au bon type ; une clé absente garde sa valeur d'origine.
  function merged(stored) {
    const out = clone(DEFAULTS);
    for (const [sec, fields] of Object.entries(out)) for (const k of Object.keys(fields)) {
      const v = stored?.[sec]?.[k];
      if (v === undefined || v === null) continue;
      out[sec][k] = typeof fields[k] === 'number' ? (Number.isFinite(Number(v)) ? Number(v) : fields[k]) : String(v);
    }
    return out;
  }
  function validate(s) {
    const p = s.payment, d = s.docs, t = s.pricing;
    if (!s.company.name) return 'Indique la raison sociale.';
    if (!(Number.isInteger(p.depositPercent) && p.depositPercent >= 0 && p.depositPercent <= 100)) return 'L’acompte est un pourcentage entier, de 0 à 100.';
    for (const k of ['quotePrefix', 'invoicePrefix', 'orderPrefix']) if (!/^[A-Z0-9]{1,8}$/.test(d[k])) return 'Préfixes : lettres majuscules et chiffres, 8 au maximum.';
    if (new Set([d.quotePrefix, d.invoicePrefix, d.orderPrefix]).size < 3) return 'Les trois préfixes doivent être différents.';
    if (!(Number.isInteger(d.quoteValidityDays) && d.quoteValidityDays >= 0 && d.quoteValidityDays <= 90)) return 'Validité du devis : de 0 à 90 jours.';
    if (!(t.t1max > 0 && t.t2max > t.t1max)) return 'Tarifs : la tranche 2 doit commencer au-dessus de la tranche 1.';
    for (const k of ['t1', 't2', 't3']) if (!(t[k] >= 0 && t[k] <= 100)) return 'Les taux de service vont de 0 à 100 %.';
    if (!(t.minimumServiceFeeMGA >= 0)) return 'Service minimum invalide.';
    return '';
  }
  function apply(s) {
    const c = s.company, p = s.payment, d = s.docs, t = s.pricing;
    Object.assign(O, { name: c.name, brand: c.brand, address: c.address, phone: c.phone, email: c.email, nif: c.nif, stat: c.stat, rcs: c.rcs, tax: c.tax, mvola: p.mvola, orange: p.orange });
    Object.assign(O.bank, { name: p.bankName, holder: p.bankHolder, rib: p.rib, iban: p.iban, bic: p.bic });
    DEPOSIT_PERCENT = p.depositPercent;
    DOCS.prefixes = { quote: d.quotePrefix, invoice: d.invoicePrefix, order: d.orderPrefix };
    DOCS.quoteValidityDays = d.quoteValidityDays;
    DOCS.terms = d.terms || DEFAULT_TERMS;
    PRICING.tiers = [{ max: t.t1max, percent: t.t1 }, { max: t.t2max, percent: t.t2 }, { max: null, percent: t.t3 }];
    CONFIG.minimumServiceFeeMGA = t.minimumServiceFeeMGA;
  }
  // Calcul, devis et facture en cours redessinés avec les nouvelles valeurs.
  function refreshViews() {
    try { refreshAll(); } catch (e) { console.error('eVidy réglages :', e); }
    try { renderQuotes(); } catch (e) { console.error('eVidy réglages :', e); }
    window.EvidyInvoices?.refresh?.();
  }

  let current = merged(readStored());
  if (readStored()) apply(current);

  const setStatus = (msg, error = false) => { const s = el('settingsStatus'); s.textContent = msg; s.style.color = error ? 'var(--danger)' : 'var(--muted)'; };
  function render() {
    const open = new Set([...el('settingsForms').querySelectorAll('details[open]')].map(d => d.dataset.sec));
    el('settingsForms').innerHTML = SECTIONS.map(sec => '<details class="card settings-card" data-sec="' + sec.id + '"' + (open.has(sec.id) ? ' open' : '') + '>'
      + '<summary><div><h2>' + esc(sec.title) + '</h2><p>' + esc(sec.sub) + '</p></div><svg class="icon sm"><use href="#i-chevron"/></svg></summary>'
      + '<div class="invoice-grid settings-grid">' + sec.fields.map(([k, label, kind = '', hint = '']) => {
        const v = current[sec.id][k], name = sec.id + '.' + k;
        const wide = kind === 'wide' || kind === 'text' ? ' class="invoice-wide"' : '';
        const input = kind === 'text' ? '<textarea data-set="' + name + '" rows="4">' + esc(v) + '</textarea>'
          : '<input data-set="' + name + '" value="' + esc(v) + '"' + (kind === 'int' || kind === 'num' ? ' type="number" inputmode="decimal" min="0" step="any"' : ' type="text"')
            + (kind === 'code' ? ' autocapitalize="characters" maxlength="8"' : '') + '>';
        return '<label' + wide + '>' + esc(label) + input + (hint ? '<small class="field-hint">' + esc(hint) + '</small>' : '') + '</label>';
      }).join('') + '</div></details>').join('');
  }
  function readForm() {
    const s = clone(current);
    for (const input of el('settingsForms').querySelectorAll('[data-set]')) {
      const [sec, k] = input.dataset.set.split('.');
      if (typeof DEFAULTS[sec][k] === 'number') s[sec][k] = Number(String(input.value).replace(',', '.'));
      else s[sec][k] = k.endsWith('Prefix') ? input.value.trim().toUpperCase() : input.value.trim();
    }
    return s;
  }
  function store(s) {
    try { localStorage.setItem(KEY, JSON.stringify({ ...s, updatedAt: EvidyUI.now() })); } catch { setStatus('Mémoire du navigateur pleine : réglages non enregistrés.', true); return false; }
    window.EvidySync?.changed('settings');
    return true;
  }
  function save() {
    const next = readForm(), error = validate(next);
    if (error) { setStatus(error, true); showToast(error, 'error'); return; }
    current = next;
    if (!store(current)) return;
    apply(current); refreshViews();
    setStatus(`Réglages enregistrés${S?.enabled() ? ' et envoyés à tes autres appareils' : ' sur cet appareil'}.`);
  }
  function reset() {
    if (!confirm('Rétablir tous les réglages d’origine (entreprise, paiement, documents, tarifs, messages) ?')) return;
    current = clone(DEFAULTS);
    if (!store(current)) return;
    apply(current); render(); refreshViews();
    setStatus('Réglages d’origine rétablis.');
  }
  function reload() { current = merged(readStored()); apply(current); render(); refreshViews(); }

  // ---------- Compte et synchronisation ----------
  let activationToken = '';
  const account = (msg, error = false) => { const s = el('syncStatus'); s.textContent = msg; s.style.color = error ? 'var(--danger)' : 'var(--muted)'; };
  const clock = iso => { const d = new Date(iso); return Number.isNaN(d.valueOf()) ? '' : `${EvidyUI.ago(iso)} à ${new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d)}`; };
  function renderAccount(st = S?.status()) {
    if (!S || !st) { el('syncCard').hidden = true; return; }
    const on = st.enabled;
    el('syncLoggedOut').hidden = on; el('syncLoggedIn').hidden = !on;
    el('syncActivate').hidden = !activationToken; el('syncLogin').hidden = Boolean(activationToken);
    el('syncChip').textContent = !on ? 'Non connecté' : ({ syncing: 'Synchronisation…', offline: 'Hors ligne', error: 'Erreur' }[st.state] || 'Synchronisé');
    el('syncChip').dataset.state = on ? st.state : 'off';
    if (on) el('syncLine').textContent = `${st.device || 'Cet appareil'} · ${st.lastSync ? `dernier échange ${clock(st.lastSync)}` : 'premier échange en cours'}${st.pending ? ` · ${st.pending} modification(s) à envoyer` : ''}`;
    if (st.error) account(st.error, true);
  }
  async function busy(button, fn) {
    button.disabled = true; account('');
    try { await fn(); } catch (e) { account(e.message || 'Erreur', true); } finally { button.disabled = false; }
  }
  function takeActivation() {
    const m = /(?:^#|&)activer=([A-Za-z0-9_-]{20,})/.exec(location.hash);
    if (!m) return;
    activationToken = m[1];
    history.replaceState(null, '', location.pathname + location.search); // le jeton ne reste pas dans l'adresse
    setView('settings');
    account('Lien d’activation reconnu : choisis le mot de passe d’eVidy. Il servira sur tous tes appareils.');
  }
  async function loadDevices() {
    const box = el('syncDevices');
    box.innerHTML = '<p class="field-hint">Chargement…</p>';
    try {
      const list = await S.sessions();
      box.innerHTML = list.map(d => '<div class="device-row"><div><strong>' + esc(d.device) + (d.current ? ' · cet appareil' : '') + '</strong><span>Connecté ' + esc(EvidyUI.ago(d.created)) + ' · vu ' + esc(EvidyUI.ago(d.lastSeen)) + '</span></div>'
        + (d.current ? '' : '<button type="button" class="secondary" data-revoke="' + esc(d.id) + '">Retirer</button>') + '</div>').join('') || '<p class="field-hint">Aucun appareil.</p>';
    } catch (e) { box.innerHTML = '<p class="field-hint">' + esc(e.message || 'Liste indisponible') + '</p>'; }
  }

  if (S) {
    S.onStatus(renderAccount);
    el('syncLoginBtn').addEventListener('click', () => busy(el('syncLoginBtn'), async () => {
      const p = el('syncPass').value;
      if (!p) throw Error('Indique le mot de passe.');
      await S.login(p);
      el('syncPass').value = '';
      showToast('Connecté : devis, factures, commandes et clients se synchronisent.', 'info');
    }));
    el('syncPass').addEventListener('keydown', e => { if (e.key === 'Enter') el('syncLoginBtn').click(); });
    el('syncActivateBtn').addEventListener('click', () => busy(el('syncActivateBtn'), async () => {
      const p1 = el('syncNewPass').value, p2 = el('syncNewPass2').value;
      if (p1.length < 10) throw Error('Mot de passe trop court : 10 caractères au minimum.');
      if (p1 !== p2) throw Error('Les deux mots de passe ne sont pas identiques.');
      await S.activate(activationToken, p1);
      activationToken = ''; el('syncNewPass').value = ''; el('syncNewPass2').value = '';
      renderAccount();
      showToast('Synchronisation activée. Sur tes autres appareils : Suivi › Réglages, puis ce mot de passe.', 'info');
    }));
    el('syncNowBtn').addEventListener('click', () => busy(el('syncNowBtn'), async () => {
      if (await S.syncNow()) account('Tout est à jour.');
    }));
    el('syncLogoutBtn').addEventListener('click', () => busy(el('syncLogoutBtn'), async () => {
      if (!confirm('Se déconnecter sur cet appareil ? Les données restent dans ce navigateur.')) return;
      await S.logout();
      account('Déconnecté. Les données restent sur cet appareil.');
    }));
    el('syncDevicesBox').addEventListener('toggle', () => { if (el('syncDevicesBox').open) loadDevices(); });
    el('syncDevices').addEventListener('click', e => {
      const b = e.target.closest('[data-revoke]'); if (!b) return;
      busy(b, async () => { if (!confirm('Retirer cet appareil ? Il devra retaper le mot de passe.')) return; await S.revoke(b.dataset.revoke); await loadDevices(); });
    });
    el('syncPassChange').addEventListener('click', () => busy(el('syncPassChange'), async () => {
      const cur = el('syncPassCurrent').value, p1 = el('syncPassNext').value, p2 = el('syncPassNext2').value;
      if (!cur) throw Error('Indique le mot de passe actuel.');
      if (p1.length < 10) throw Error('Nouveau mot de passe trop court : 10 caractères au minimum.');
      if (p1 !== p2) throw Error('Les deux nouveaux mots de passe ne sont pas identiques.');
      await S.changePassword(cur, p1);
      for (const id of ['syncPassCurrent', 'syncPassNext', 'syncPassNext2']) el(id).value = '';
      account('Mot de passe changé : les autres appareils doivent se reconnecter.');
    }));
    S.onApply('settings', reload);
  }

  viewHooks.settings = () => {
    renderAccount();
    if (S && !S.enabled() && !activationToken) S.serverStatus().then(r => { if (r && r.activated === false) account('Le serveur attend son activation : ouvre le lien d’activation reçu, sur cet appareil.'); }).catch(() => {});
  };
  el('settingsForms').addEventListener('change', save);
  el('settingsReset').addEventListener('click', reset);
  el('appBuild').textContent = window.EVIDY?.build || '—';
  el('appReload').addEventListener('click', () => location.reload());
  window.EvidySettings = { get: () => clone(current), messages: () => ({ ...current.messages }), reload };
  render(); renderAccount(); takeActivation();
})();
