/* ComptaPro Belgique — écrans d'activité : tableau de bord, factures, clients, dépenses, banque, immobilisations */
(function (App) {
  const { $, $$, esc, eur, fdate, round2 } = App;
  const V = (App.views = App.views || {});
  let selectedYear = new Date().getFullYear();
  App.getYear = () => selectedYear;
  App.setYear = (y) => (selectedYear = Number(y));

  const head = (title, sub, actions) => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="actions">${actions || ''}</div></div>`;
  App.head = head;
  const clientName = (id) => (App.state.clients.find((c) => c.id === id) || {}).name || '—';
  const invStatus = (i) => (i.type === 'facture' && i.status === 'envoyee' && i.dueDate && i.dueDate < App.today() ? 'retard' : i.status);
  const daysUntil = (d) => Math.round((new Date(d + 'T00:00:00') - new Date(App.today() + 'T00:00:00')) / 86400000);

  /* ============ TABLEAU DE BORD ============ */
  V.dashboard = (el) => {
    const y = selectedYear, s = App.state, c = s.settings.company;
    const d = App.dashboard(y), is = d.is;
    const marge = is.chiffreAffaires ? (is.resultatExploitation / is.chiffreAffaires) * 100 : 0;
    const cats = Object.entries(d.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const catMax = Math.max(1, ...cats.map((x) => x[1]));
    const empty = !s.invoices.length && !s.expenses.length;
    const tvaTile = c.regimeTva === 'franchise'
      ? `<div class="card kpi"><div class="label">Seuil de franchise</div><div class="value">${eur(d.franchiseCA)}</div><div class="sub">sur ${eur(s.settings.fiscal.franchiseSeuil)} autorisés (${App.pct((d.franchiseCA / s.settings.fiscal.franchiseSeuil) * 100)})</div></div>`
      : `<div class="card kpi"><div class="label">TVA ${d.currentPeriod ? esc(d.currentPeriod.label) : ''}</div><div class="value">${d.tvaCurrent ? eur(Math.abs(d.tvaCurrent.net)) : '—'}</div><div class="sub">${d.tvaCurrent ? (d.tvaCurrent.net >= 0 ? 'à payer (grille 71, estimation)' : 'à récupérer (grille 72)') : 'Non assujetti'}</div></div>`;
    el.innerHTML = head('Tableau de bord', `${esc(c.name)} · exercice ${is.fy.label}`,
      `<select id="year">${App.yearOptions(y)}</select><a class="btn primary" href="#/factures/new">+ Facture</a><a class="btn" href="#/depenses/new">+ Dépense</a>`) +
      (empty ? `<div class="alert">Bienvenue ! Commencez par <a href="#/parametres">renseigner votre entreprise</a> (numéro d'entreprise, régime TVA), ou <a href="#" id="demo">chargez des données de démonstration</a> pour explorer l'application.</div>` : '') +
      `<div class="grid grid-4">
        <div class="card kpi"><div class="label">Chiffre d'affaires HTVA</div><div class="value">${eur(is.chiffreAffaires)}</div><div class="sub">Exercice ${is.fy.label}</div></div>
        <div class="card kpi"><div class="label">Charges</div><div class="value">${eur(is.coutVentes + is.chargesFinancieres)}</div><div class="sub">dont amortissements ${eur(is.amortissements)}</div></div>
        <div class="card kpi"><div class="label">Résultat avant impôt</div><div class="value ${is.resultatAvantImpot >= 0 ? 'pos' : 'neg'}">${eur(is.resultatAvantImpot)}</div><div class="sub">Marge d'exploitation ${App.pct(marge)}</div></div>
        <div class="card kpi"><div class="label">Trésorerie</div><div class="value ${d.treso >= 0 ? '' : 'neg'}">${eur(d.treso)}</div><div class="sub">Banque + caisse à ce jour</div></div>
      </div>
      <div class="grid grid-3" style="margin-top:16px">
        <div class="card kpi"><div class="label">À encaisser</div><div class="value">${eur(d.unpaidTotal)}</div><div class="sub">${d.unpaid.length} facture(s) ouverte(s)${d.overdue.length ? ` · <span class="neg">${d.overdue.length} en retard (${eur(d.overdueTotal)})</span>` : ''}</div></div>
        ${tvaTile}
        <div class="card kpi"><div class="label">${esc(d.tax.label)}</div><div class="value">${eur(d.tax.tax)}</div><div class="sub">${esc(d.tax.detail)}${d.tax.social ? ` · cotisations sociales ${eur(d.tax.social)}` : ''}</div></div>
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="page-head" style="margin:0 0 8px"><h2 style="margin:0">Produits et charges par mois</h2><div class="legend"><span><i style="background:var(--primary)"></i>Produits</span><span><i style="background:var(--warning)"></i>Charges</span></div></div>${App.barChart(d.monthly)}</div>
        <div class="card"><h2>Échéances à venir</h2>${d.deadlines.length ? `<ul class="checklist">${d.deadlines.slice(0, 7).map((x) => { const n = daysUntil(x.date); return `<li><span class="st ${n < 0 ? 'ko' : n <= 14 ? 'ko' : 'ok'}">${n < 0 ? '!' : n <= 14 ? n : '·'}</span><div><a href="${x.href}">${esc(x.label)}</a><div class="small muted">${fdate(x.date)} · ${n < 0 ? `<span class="neg">dépassée de ${-n} j</span>` : n === 0 ? 'aujourd\'hui' : `dans ${n} jour(s)`}</div></div></li>`; }).join('')}</ul><p class="small muted">Dates usuelles, à confirmer chaque année auprès du SPF Finances et de votre caisse sociale.</p>` : '<div class="empty">Rien d\'urgent.</div>'}</div>
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h2>Principaux postes de charges</h2>${cats.length ? cats.map(([l, v]) => `<div class="bar-row"><span>${esc(l)}</span><div class="track"><div class="fill" style="width:${(v / catMax) * 100}%"></div></div><span class="num">${eur(v)}</span></div>`).join('') : '<div class="empty">Aucune charge enregistrée</div>'}</div>
        <div class="card"><h2>À faire</h2><ul class="checklist">${todo(d).map((t) => `<li><span class="st ${t.ok ? 'ok' : 'ko'}">${t.ok ? '✓' : '!'}</span><div>${t.html}</div></li>`).join('')}</ul></div>
      </div>`;
    $('#year', el).onchange = (e) => { selectedYear = Number(e.target.value); V.dashboard(el); };
    const demo = $('#demo', el);
    if (demo) demo.onclick = (e) => { e.preventDefault(); App.loadDemo(); App.toast('Données de démonstration chargées', 'success'); App.render(); };
  };

  function todo(d) {
    const s = App.state, c = s.settings.company, items = [];
    items.push({ ok: App.bceValid(c.enterpriseNumber), html: App.bceValid(c.enterpriseNumber) ? `Numéro d'entreprise ${App.bceFormat(c.enterpriseNumber)} valide` : '<a href="#/parametres">Indiquer un numéro d\'entreprise BCE valide</a>' });
    items.push({ ok: App.ibanValid(c.iban), html: App.ibanValid(c.iban) ? 'IBAN valide : QR de paiement sur vos factures' : '<a href="#/parametres">Ajouter votre IBAN</a> (QR de paiement et communication structurée)' });
    items.push({ ok: !d.bankToReconcile, html: d.bankToReconcile ? `<a href="#/banque">${d.bankToReconcile} opération(s) bancaire(s)</a> à rapprocher` : 'Banque rapprochée' });
    items.push({ ok: !d.overdue.length, html: d.overdue.length ? `<a href="#/factures">Relancer ${d.overdue.length} facture(s) en retard</a>` : 'Aucune facture en retard' });
    const missing = s.expenses.filter((e) => !e.receipt).length;
    items.push({ ok: !missing, html: missing ? `<a href="#/depenses">${missing} dépense(s) sans justificatif</a> (à conserver 10 ans)` : 'Tous les justificatifs sont joints' });
    if (c.regimeTva === 'franchise' && d.franchiseCA > s.settings.fiscal.franchiseSeuil * 0.8) items.push({ ok: false, html: `Chiffre d'affaires proche du seuil de franchise TVA (${eur(s.settings.fiscal.franchiseSeuil)})` });
    items.push({ ok: App.ai.isReady(), html: App.ai.isReady() ? 'Assistant IA activé' : '<a href="#/parametres">Activer l\'assistant IA</a>' });
    return items;
  }

  /* ============ FACTURES, DEVIS, NOTES DE CRÉDIT ============ */
  V.factures = (el, params) => {
    if (params[0] === 'new') return invoiceEditor(el, null, params[1] || 'facture');
    if (params[0]) { const inv = App.state.invoices.find((i) => i.id === params[0]); if (inv) return invoiceEditor(el, inv); }
    let filter = 'facture';
    try { filter = sessionStorage.getItem('inv-filter') || 'facture'; } catch (e) { /* ignore */ }
    const draw = () => {
      const q = ($('#q', el) || {}).value || '';
      const list = App.state.invoices.filter((i) => i.type === filter)
        .filter((i) => !q || (i.number + clientName(i.clientId)).toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      const tot = list.reduce((s, i) => { const t = App.invoiceTotals(i); s.ht += t.ht; s.ttc += t.ttc; return s; }, { ht: 0, ttc: 0 });
      $('#list', el).innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th>Numéro</th><th>Client</th><th>Date</th><th>Échéance</th><th>Statut</th><th class="num">HTVA</th><th class="num">TVAC</th></tr></thead><tbody>
        ${list.map((i) => { const t = App.invoiceTotals(i); return `<tr class="clickable" data-id="${i.id}"><td><strong>${esc(i.number)}</strong>${i.vatRegime && i.vatRegime !== 'normal' ? ` <span class="badge">${esc(i.vatRegime.replace('_', ' '))}</span>` : ''}</td><td>${esc(clientName(i.clientId))}</td><td>${fdate(i.date)}</td><td>${fdate(i.dueDate)}</td><td>${App.statusBadge(invStatus(i))}</td><td class="num">${eur(t.ht)}</td><td class="num">${eur(t.ttc)}</td></tr>`; }).join('')}
        <tr class="total"><td colspan="5">Total (${list.length})</td><td class="num">${eur(tot.ht)}</td><td class="num">${eur(tot.ttc)}</td></tr></tbody></table></div>`
        : `<div class="empty">Aucun document. <a href="#/factures/new/${filter}">Créer ${filter === 'devis' ? 'une offre / un devis' : filter === 'avoir' ? 'une note de crédit' : 'une facture'}</a></div>`;
      $$('[data-id]', el).forEach((r) => (r.onclick = () => App.go('#/factures/' + r.dataset.id)));
      $$('.tabs button', el).forEach((b) => b.classList.toggle('active', b.dataset.t === filter));
    };
    el.innerHTML = head('Factures', 'Numérotation continue, mentions légales belges, communication structurée, QR de paiement et facture électronique Peppol.',
      `<a class="btn" href="#/factures/new/devis">+ Devis</a><a class="btn" href="#/factures/new/avoir">+ Note de crédit</a><a class="btn primary" href="#/factures/new/facture">+ Facture</a>`) +
      `<div class="card"><div class="tabs"><button data-t="facture">Factures</button><button data-t="devis">Devis / offres</button><button data-t="avoir">Notes de crédit</button></div>
      <div class="toolbar"><input id="q" placeholder="Rechercher un numéro ou un client…" style="max-width:320px"><button class="btn sm" id="export">Exporter CSV</button></div><div id="list"></div></div>`;
    $$('.tabs button', el).forEach((b) => (b.onclick = () => { filter = b.dataset.t; try { sessionStorage.setItem('inv-filter', filter); } catch (e) { /* ignore */ } draw(); }));
    $('#q', el).oninput = draw;
    $('#export', el).onclick = () => {
      const rows = [['Type', 'Numéro', 'Client', 'N° TVA client', 'Date', 'Échéance', 'Statut', 'Régime TVA', 'HTVA', 'TVA', 'TVAC', 'Communication', 'Payée le']];
      App.state.invoices.forEach((i) => { const t = App.invoiceTotals(i); const cl = App.state.clients.find((c) => c.id === i.clientId) || {}; rows.push([i.type, i.number, cl.name || '', cl.vatNumber || '', i.date, i.dueDate, i.status, i.vatRegime || 'normal', t.ht, t.tva, t.ttc, App.invoiceComm(i), i.paidDate || '']); });
      App.download('factures.csv', App.toCSV(rows), 'text/csv');
    };
    draw();
  };

  /* Régime de TVA proposé automatiquement selon le client */
  function suggestRegime(client) {
    const c = App.state.settings.company;
    if (c.regimeTva === 'franchise') return 'franchise';
    if (c.regimeTva === 'exempte') return 'exempte';
    if (!client) return 'normal';
    const v = App.vatParse(client.vatNumber);
    const country = client.country || v.country || 'BE';
    const EU = ['AT', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'GR', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];
    if (country !== 'BE' && EU.includes(country) && v.valid) return 'intracom_services';
    if (country !== 'BE' && !EU.includes(country)) return 'export';
    return 'normal';
  }

  function invoiceEditor(el, existing, type) {
    const s = App.state, c = s.settings.company;
    const isNew = !existing;
    const firstClient = s.clients[0];
    const inv = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: App.uid(), type, number: App.nextNumber(type), clientId: firstClient ? firstClient.id : '', date: App.today(),
      dueDate: App.addDays(App.today(), c.paymentTerms || 30), status: 'brouillon', paidDate: '', notes: '', revenueAccount: '701000',
      vatRegime: suggestRegime(firstClient), buyerReference: '',
      lines: [{ desc: '', qty: 1, unitPrice: 0, tvaRate: 21, discount: 0 }],
    };
    const label = { facture: 'Facture', devis: 'Devis', avoir: 'Note de crédit' }[inv.type];
    const draw = () => {
      const t = App.invoiceTotals(inv);
      const noVat = inv.vatRegime !== 'normal';
      const cl = s.clients.find((x) => x.id === inv.clientId);
      const warn = [];
      if (cl && inv.vatRegime === 'intracom_services' && !App.vatParse(cl.vatNumber).valid) warn.push('Le client doit avoir un numéro de TVA européen valide pour l\'autoliquidation.');
      if (cl && inv.vatRegime === 'cocontractant' && App.vatParse(cl.vatNumber).country !== 'BE') warn.push('L\'autoliquidation « cocontractant » s\'applique à un client assujetti belge (travaux immobiliers).');
      if (cl && App.vatParse(cl.vatNumber).valid && inv.type !== 'devis') warn.push('Client assujetti : depuis 2026, la facture doit être transmise en format électronique structuré (Peppol). Utilisez « Export Peppol ».');
      el.innerHTML = head(`${label} ${esc(inv.number)}`, isNew ? 'Nouveau document' : App.statusBadge(invStatus(inv)),
        `<a class="btn" href="#/factures">← Retour</a>${!isNew ? `<button class="btn danger" id="del">Supprimer</button>` : ''}
         ${inv.type === 'devis' && !isNew ? '<button class="btn" id="convert">Convertir en facture</button>' : ''}
         ${inv.type === 'facture' && !isNew ? '<button class="btn" id="credit">Créer une note de crédit</button>' : ''}
         ${!isNew && inv.type === 'facture' && invStatus(inv) === 'retard' ? '<button class="btn" id="remind">Rappel de paiement</button>' : ''}
         ${inv.type !== 'devis' ? '<button class="btn" id="peppol">Export Peppol (UBL)</button>' : ''}
         <button class="btn" id="preview">Aperçu</button><button class="btn primary" id="save">Enregistrer</button>`) +
        warn.map((w) => `<div class="alert warning small">${esc(w)}</div>`).join('') +
        `<div class="card"><div class="form-grid">
          <label class="field">Client <select id="client">${App.options([['', '— Choisir —'], ...s.clients.map((x) => [x.id, x.name])], inv.clientId)}<option value="__new">+ Nouveau client…</option></select></label>
          <label class="field">Numéro <input id="number" value="${esc(inv.number)}"></label>
          <label class="field">Date <input type="date" id="date" value="${inv.date}"></label>
          <label class="field">${inv.type === 'devis' ? 'Valable jusqu\'au' : 'Échéance'} <input type="date" id="due" value="${inv.dueDate || ''}"></label>
          <label class="field">Statut <select id="status">${App.options(inv.type === 'devis' ? [['brouillon', 'Brouillon'], ['envoyee', 'Envoyé'], ['accepte', 'Accepté'], ['refuse', 'Refusé']] : [['brouillon', 'Brouillon (non comptabilisé)'], ['envoyee', 'Émise / envoyée'], ['payee', 'Payée'], ['annulee', 'Annulée']], inv.status)}</select></label>
          <label class="field">Payée le <input type="date" id="paid" value="${inv.paidDate || ''}" ${inv.status === 'payee' ? '' : 'disabled'}></label>
          <label class="field full">Régime de TVA <select id="regime">${App.options(App.SALES_REGIMES, inv.vatRegime || 'normal')}</select></label>
          <label class="field">Compte de produit <select id="rev">${App.options(App.REVENUE_ACCOUNTS, inv.revenueAccount || '701000')}</select></label>
          <label class="field">Référence client / bon de commande <input id="bref" value="${esc(inv.buyerReference || '')}"></label>
          ${inv.type === 'facture' ? `<div class="field"><span>Communication structurée</span><strong style="font-family:var(--mono);color:var(--text);padding-top:8px">${App.invoiceComm(inv)}</strong></div>` : ''}
        </div></div>
        <div class="card"><h2>Lignes</h2><div class="table-wrap"><table class="lines-table"><thead><tr><th style="min-width:220px">Description</th><th style="width:80px">Qté</th><th style="width:120px">Prix unit. HTVA</th><th style="width:80px">Remise %</th><th style="width:90px">TVA</th><th class="num" style="width:110px">Total HTVA</th><th></th></tr></thead><tbody>
          ${inv.lines.map((l, k) => `<tr data-k="${k}"><td><input data-f="desc" value="${esc(l.desc)}" placeholder="Description de la prestation"></td><td><input type="number" step="any" data-f="qty" value="${l.qty}"></td><td><input type="number" step="any" data-f="unitPrice" value="${l.unitPrice}"></td><td><input type="number" step="any" data-f="discount" value="${l.discount || 0}"></td><td><select data-f="tvaRate" ${noVat ? 'disabled' : ''}>${App.tvaOptions(noVat ? 0 : l.tvaRate)}</select></td><td class="num">${eur(round2(l.qty * l.unitPrice * (1 - (l.discount || 0) / 100)))}</td><td><button class="btn ghost sm" data-rm="${k}" aria-label="Supprimer la ligne">✕</button></td></tr>`).join('')}
        </tbody></table></div>
        <div class="toolbar" style="margin-top:10px"><button class="btn sm" id="add">+ Ajouter une ligne</button></div>
        <div style="display:flex;justify-content:flex-end"><table style="width:300px"><tbody>
          <tr><td>Total HTVA</td><td class="num">${eur(t.ht)}</td></tr>
          ${Object.entries(t.byRate).filter(([r]) => Number(r)).map(([r, v]) => `<tr class="sub"><td>TVA ${r} %</td><td class="num">${eur(v.tva * t.sign)}</td></tr>`).join('')}
          <tr class="total"><td>Total TVAC</td><td class="num">${eur(t.ttc)}</td></tr></tbody></table></div>
          ${noVat ? `<p class="small muted">Mention ajoutée automatiquement : ${esc(App.LEGAL_MENTIONS[inv.vatRegime] || '')}</p>` : ''}</div>
        <div class="card"><label class="field">Notes / conditions <textarea id="notes" placeholder="Conditions particulières, référence de commande…">${esc(inv.notes || '')}</textarea></label></div>`;
      bind();
    };
    const sync = () => {
      inv.clientId = $('#client', el).value; inv.number = $('#number', el).value; inv.date = $('#date', el).value;
      inv.dueDate = $('#due', el).value; inv.status = $('#status', el).value; inv.paidDate = $('#paid', el).value;
      inv.notes = $('#notes', el).value; inv.revenueAccount = $('#rev', el).value; inv.vatRegime = $('#regime', el).value; inv.buyerReference = $('#bref', el).value;
      $$('tr[data-k]', el).forEach((tr) => {
        const l = inv.lines[tr.dataset.k];
        $$('[data-f]', tr).forEach((i) => { if (!i.disabled) l[i.dataset.f] = i.dataset.f === 'desc' ? i.value : Number(i.value) || 0; });
      });
    };
    const bind = () => {
      $$('input, select, textarea', el).forEach((i) => i.addEventListener('change', () => {
        sync();
        if (i.id === 'client' && i.value === '__new') return App.editClient(null, (cl) => { inv.clientId = cl.id; inv.vatRegime = suggestRegime(cl); draw(); });
        if (i.id === 'client') inv.vatRegime = suggestRegime(s.clients.find((x) => x.id === inv.clientId));
        if (i.id === 'status' && inv.status === 'payee' && !inv.paidDate) inv.paidDate = App.today();
        if (i.id === 'date' && inv.type !== 'devis') inv.dueDate = App.addDays(inv.date, c.paymentTerms || 30);
        draw();
      }));
      $('#add', el).onclick = () => { sync(); inv.lines.push({ desc: '', qty: 1, unitPrice: 0, tvaRate: inv.lines.at(-1)?.tvaRate ?? 21, discount: 0 }); draw(); };
      $$('[data-rm]', el).forEach((b) => (b.onclick = () => { sync(); inv.lines.splice(Number(b.dataset.rm), 1); if (!inv.lines.length) inv.lines.push({ desc: '', qty: 1, unitPrice: 0, tvaRate: 21 }); draw(); }));
      $('#save', el).onclick = () => {
        sync();
        if (!inv.clientId || inv.clientId === '__new') return App.toast('Choisissez un client', 'error');
        if (s.invoices.some((x) => x.number === inv.number && x.id !== inv.id)) return App.toast('Ce numéro existe déjà : la numérotation doit être continue et unique', 'error');
        if (!inv.structuredComm && inv.type === 'facture') inv.structuredComm = App.invoiceComm(inv);
        const idx = s.invoices.findIndex((x) => x.id === inv.id);
        if (idx >= 0) s.invoices[idx] = inv; else s.invoices.push(inv);
        App.save(); App.toast('Document enregistré', 'success'); App.go('#/factures');
      };
      $('#preview', el).onclick = () => { sync(); previewInvoice(inv); };
      const pp = $('#peppol', el);
      if (pp) pp.onclick = () => { sync(); App.peppolExport(inv); };
      const del = $('#del', el);
      if (del) del.onclick = () => App.confirmBox(inv.status !== 'brouillon' && inv.type === 'facture' ? 'Une facture émise ne doit pas être supprimée (numérotation continue obligatoire). Établissez plutôt une note de crédit. Supprimer quand même ?' : 'Supprimer ce document ?', () => {
        s.invoices = s.invoices.filter((x) => x.id !== inv.id); App.save(); App.go('#/factures');
      }, 'Supprimer');
      const conv = $('#convert', el);
      if (conv) conv.onclick = () => {
        const f = Object.assign(JSON.parse(JSON.stringify(inv)), { id: App.uid(), type: 'facture', number: App.nextNumber('facture'), date: App.today(), dueDate: App.addDays(App.today(), c.paymentTerms || 30), status: 'brouillon', quoteRef: inv.number, structuredComm: '' });
        const q = s.invoices.find((x) => x.id === inv.id); if (q) q.status = 'accepte';
        s.invoices.push(f); App.save(); App.toast('Facture créée depuis le devis', 'success'); App.go('#/factures/' + f.id);
      };
      const cr = $('#credit', el);
      if (cr) cr.onclick = () => {
        const a = Object.assign(JSON.parse(JSON.stringify(inv)), { id: App.uid(), type: 'avoir', number: App.nextNumber('avoir'), date: App.today(), status: 'envoyee', paidDate: '', notes: `Note de crédit relative à la facture ${inv.number}`, structuredComm: '' });
        s.invoices.push(a); App.save(); App.go('#/factures/' + a.id);
      };
      const rem = $('#remind', el);
      if (rem) rem.onclick = () => reminder(inv);
    };
    draw();
  }

  function invoiceHTML(inv) {
    const c = App.state.settings.company, cl = App.state.clients.find((x) => x.id === inv.clientId) || {};
    const t = App.invoiceTotals(inv);
    const title = { facture: 'FACTURE', devis: 'DEVIS', avoir: 'NOTE DE CRÉDIT' }[inv.type];
    const qr = App.epcQr(inv);
    const mention = inv.vatRegime && inv.vatRegime !== 'normal' ? App.LEGAL_MENTIONS[inv.vatRegime] : '';
    return `<div class="invoice-paper">
      <div class="inv-head"><div><h1>${title}</h1><div>N° <strong>${esc(inv.number)}</strong></div><div>Date : ${fdate(inv.date)}</div>${inv.dueDate ? `<div>${inv.type === 'devis' ? 'Valable jusqu\'au' : 'Échéance'} : ${fdate(inv.dueDate)}</div>` : ''}${inv.buyerReference ? `<div>Votre référence : ${esc(inv.buyerReference)}</div>` : ''}</div>
      <div style="text-align:right"><strong>${esc(c.name)}</strong><br>${esc(c.address)}<br>${esc(c.postcode)} ${esc(c.city)}<br>${c.enterpriseNumber ? `${c.regimeTva === 'franchise' ? 'N° d\'entreprise' : 'TVA'} BE ${App.bceFormat(c.enterpriseNumber)}<br>${c.rpm ? 'RPM ' + esc(c.rpm) + '<br>' : ''}` : ''}${esc(c.email)}${c.phone ? ' · ' + esc(c.phone) : ''}</div></div>
      <div style="margin-bottom:24px"><div style="color:#666;font-size:11px">CLIENT</div><strong>${esc(cl.name)}</strong><br>${esc(cl.address || '').replace(/\n/g, '<br>')}${cl.vatNumber ? '<br>TVA ' + esc(App.vatParse(cl.vatNumber).formatted) : ''}</div>
      <table><thead><tr><th>Description</th><th class="num">Qté</th><th class="num">P.U. HTVA</th><th class="num">TVA</th><th class="num">Total HTVA</th></tr></thead><tbody>
      ${inv.lines.map((l) => `<tr><td>${esc(l.desc)}${l.discount ? ` <em>(remise ${l.discount} %)</em>` : ''}</td><td class="num">${l.qty}</td><td class="num">${eur(l.unitPrice)}</td><td class="num">${inv.vatRegime && inv.vatRegime !== 'normal' ? '—' : l.tvaRate + ' %'}</td><td class="num">${eur(round2(l.qty * l.unitPrice * (1 - (l.discount || 0) / 100)))}</td></tr>`).join('')}
      </tbody></table>
      <div style="display:flex;justify-content:space-between;gap:20px;align-items:flex-end;flex-wrap:wrap">
        <div>${inv.type === 'facture' && c.iban ? `<div style="font-size:12px;margin-top:16px">Paiement sur <strong>${esc(c.iban)}</strong>${c.bic ? ' (BIC ' + esc(c.bic) + ')' : ''}<br>Communication : <strong style="font-family:monospace">${App.invoiceComm(inv)}</strong></div>${qr ? `<div style="width:120px;margin-top:8px">${qr}<div style="font-size:10px;color:#666">Scannez avec votre app bancaire</div></div>` : ''}` : ''}</div>
        <div class="totals"><div><span>Total HTVA</span><span>${eur(t.ht)}</span></div>
        ${Object.entries(t.byRate).filter(([r]) => Number(r)).map(([r, v]) => `<div><span>TVA ${r} % sur ${eur(v.base * t.sign)}</span><span>${eur(v.tva * t.sign)}</span></div>`).join('')}
        <div class="grand"><span>Total TVAC</span><span>${eur(t.ttc)}</span></div></div></div>
      ${inv.notes ? `<p style="margin-top:20px">${esc(inv.notes)}</p>` : ''}
      <div class="legal">${mention ? esc(mention) + '\n' : ''}${inv.type === 'facture' ? `Conditions de paiement : ${c.paymentTerms} jours.\n${esc(c.legalMentions)}` : ''}${inv.type === 'devis' ? 'Pour accord — date et signature :' : ''}</div>
    </div>`;
  }
  App.invoiceHTML = invoiceHTML;

  function previewInvoice(inv) {
    App.modal({
      title: 'Aperçu', wide: true, body: invoiceHTML(inv),
      footer: `<button class="btn" data-close>Fermer</button><button class="btn" id="mail">Copier l'e-mail d'envoi</button><button class="btn primary" id="print">${App.isArtifact ? 'Télécharger (à imprimer en PDF)' : 'Imprimer / PDF'}</button>`,
      onMount: (m) => {
        $('#print', m).onclick = () => {
          if (App.isArtifact) return App.download(`${inv.number}.html`, `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(inv.number)}</title><style>body{font-family:Arial,sans-serif;margin:30px;color:#111}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #eee;text-align:left}.num{text-align:right}.inv-head{display:flex;justify-content:space-between;margin-bottom:30px}h1{color:#2f5bea}.totals{margin-left:auto;width:300px;margin-top:16px}.totals div{display:flex;justify-content:space-between;padding:4px 0}.grand{font-weight:700;border-top:2px solid #111}.legal{margin-top:30px;font-size:11px;color:#666;white-space:pre-line}svg{width:120px;height:120px}</style></head><body>${invoiceHTML(inv)}<script>window.print()<\/script></body></html>`);
          document.body.classList.add('printing-modal'); window.print(); setTimeout(() => document.body.classList.remove('printing-modal'), 500);
        };
        $('#mail', m).onclick = () => {
          const t = App.invoiceTotals(inv);
          const txt = `Bonjour,\n\nVeuillez trouver ci-joint ${inv.type === 'devis' ? 'notre offre' : 'notre facture'} ${inv.number} d'un montant de ${eur(t.ttc)} TVAC.\n${inv.type === 'facture' ? `Merci d'effectuer le paiement sur le compte ${App.state.settings.company.iban} avec la communication ${App.invoiceComm(inv)}.\n` : ''}\nCordialement,\n${App.state.settings.company.name}`;
          copyText(txt);
        };
      },
    });
  }
  function copyText(txt) {
    const done = () => App.toast('Texte copié', 'success');
    try { navigator.clipboard.writeText(txt).then(done, () => fallbackCopy(txt)); } catch (e) { fallbackCopy(txt); }
  }
  function fallbackCopy(txt) {
    App.modal({ title: 'Texte à copier', body: `<textarea id="ct" style="min-height:220px">${esc(txt)}</textarea>`, footer: '<button class="btn" data-close>Fermer</button>', onMount: (m) => $('#ct', m).select() });
  }
  App.copyText = copyText;

  function reminder(inv) {
    const t = App.invoiceTotals(inv), c = App.state.settings.company;
    const days = Math.round((new Date(App.today()) - new Date(inv.dueDate)) / 86400000);
    const txt = `Bonjour,\n\nSauf erreur de notre part, la facture ${inv.number} du ${fdate(inv.date)}, d'un montant de ${eur(t.ttc)} TVAC, échue le ${fdate(inv.dueDate)} (il y a ${days} jours), reste impayée.\n\nNous vous remercions de bien vouloir procéder à son règlement sur le compte ${c.iban} avec la communication ${App.invoiceComm(inv)}.\n\nConformément à la loi du 2 août 2002, des intérêts de retard et une indemnité forfaitaire peuvent être réclamés.\n\nCordialement,\n${c.name}`;
    App.modal({
      title: 'Rappel de paiement', body: `<textarea id="rt" style="min-height:260px">${esc(txt)}</textarea>`,
      footer: `<button class="btn" data-close>Fermer</button><button class="btn primary" id="copy">Copier le texte</button>`,
      onMount: (m) => ($('#copy', m).onclick = () => copyText($('#rt', m).value)),
    });
  }

  /* ============ CLIENTS ============ */
  App.editClient = (client, onSaved) => {
    const c = client || { id: App.uid(), name: '', email: '', address: '', vatNumber: '', country: 'BE', phone: '' };
    App.modal({
      title: client ? 'Modifier le client' : 'Nouveau client',
      body: `<form class="form-grid" id="cf">
        <label class="field">N° de TVA / d'entreprise <input name="vatNumber" id="cvat" value="${esc(c.vatNumber)}" placeholder="BE0123456789 (vide pour un particulier)"></label>
        <div class="field"><span>Vérification</span><span id="vatst" style="padding-top:8px"></span></div>
        <div class="full actions"><a class="btn sm" id="kbo" target="_blank" rel="noopener">Ouvrir la fiche BCE ↗</a><a class="btn sm" href="${App.viesUrl()}" target="_blank" rel="noopener">Vérifier sur VIES ↗</a>${App.ai.isReady() ? '<button type="button" class="btn sm" id="aifill">✦ Remplir depuis la fiche BCE</button>' : ''}</div>
        <label class="field full">Nom / dénomination <input name="name" value="${esc(c.name)}" required></label>
        <label class="field full">Adresse <textarea name="address">${esc(c.address)}</textarea></label>
        <label class="field">Pays <input name="country" id="ccountry" value="${esc(c.country || 'BE')}" maxlength="2"></label>
        <label class="field">E-mail <input name="email" type="email" value="${esc(c.email)}"></label>
        <label class="field">Téléphone <input name="phone" value="${esc(c.phone || '')}"></label>
      </form>`,
      footer: `<button class="btn" data-close>Annuler</button><button class="btn primary" id="ok">Enregistrer</button>`,
      onMount: (m, close) => {
        const f = $('#cf', m);
        const check = () => {
          const v = App.vatParse(f.vatNumber.value);
          $('#vatst', m).innerHTML = !f.vatNumber.value.trim() ? '<span class="muted">Particulier / non assujetti</span>' : v.valid ? `<span class="pos">✓ ${esc(v.formatted)}</span>` : '<span class="neg">Numéro invalide (contrôle modulo 97)</span>';
          if (v.country) $('#ccountry', m).value = v.country === 'EL' ? 'GR' : v.country;
          const k = $('#kbo', m); k.hidden = v.country !== 'BE' || !v.valid; k.href = App.kboUrl(v.number);
        };
        f.vatNumber.oninput = check; check();
        const ai = $('#aifill', m);
        if (ai) ai.onclick = () => App.companyFromBce((d) => {
          if (d.name) f.name.value = d.name;
          if (d.street) f.address.value = `${d.street}, ${d.postcode} ${d.city}`.trim();
          if (d.enterprise_number) { f.vatNumber.value = 'BE' + App.digits(d.enterprise_number).padStart(10, '0'); check(); }
        });
        $('#ok', m).onclick = () => {
          const d = App.formData(f);
          if (!d.name.trim()) return App.toast('Le nom est obligatoire', 'error');
          const v = App.vatParse(d.vatNumber);
          if (d.vatNumber.trim() && !v.valid) return App.toast('Numéro de TVA invalide', 'error');
          d.vatNumber = d.vatNumber.trim() ? v.formatted : '';
          d.country = (d.country || 'BE').toUpperCase();
          Object.assign(c, d);
          if (!App.state.clients.includes(c)) App.state.clients.push(c);
          App.save(); close(); onSaved ? onSaved(c) : App.render();
        };
      },
    });
  };

  /* Remplissage d'une fiche entreprise depuis la BCE (texte copié ou capture d'écran) */
  App.companyFromBce = (apply) => {
    App.modal({
      title: 'Remplir depuis la fiche BCE',
      body: `<p class="muted">Ouvrez la fiche sur <a href="https://kbopub.economie.fgov.be/kbopub/zoeknummerform.html?lang=fr" target="_blank" rel="noopener">kbopub.economie.fgov.be</a>, puis collez ici son texte (Ctrl+A, Ctrl+C) ou ajoutez une capture d'écran. L'IA en extrait les données.</p>
        <label class="field">Texte de la fiche <textarea id="bt" style="min-height:160px" placeholder="Collez ici le contenu de la fiche BCE…"></textarea></label>
        <label class="field" style="margin-top:10px">ou capture d'écran <input type="file" id="bi" accept="image/*"></label>
        <div id="bres" style="margin-top:12px"></div>`,
      footer: '<button class="btn" data-close>Annuler</button><button class="btn primary" id="go">✦ Extraire</button>',
      onMount: (m, close) => {
        $('#go', m).onclick = async (ev) => {
          const btn = ev.currentTarget, text = $('#bt', m).value.trim(), file = $('#bi', m).files[0];
          if (!text && !file) return App.toast('Collez le texte ou ajoutez une capture', 'error');
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Lecture…';
          try {
            const d = await App.ai.extractCompany(text, file);
            if (d.enterprise_number && !App.bceValid(d.enterprise_number)) App.toast('Attention : le numéro lu ne passe pas le contrôle modulo 97', 'error');
            apply(d); close(); App.toast('Fiche remplie — vérifiez les données', 'success');
          } catch (e) { $('#bres', m).innerHTML = `<div class="alert danger">${esc(e.message)}</div>`; btn.disabled = false; btn.textContent = '✦ Extraire'; }
        };
      },
    });
  };

  V.clients = (el) => {
    const s = App.state;
    const stats = (id) => {
      const inv = s.invoices.filter((i) => i.clientId === id && i.type !== 'devis' && !['brouillon', 'annulee'].includes(i.status));
      return { ca: round2(inv.reduce((x, i) => x + App.invoiceTotals(i).ht, 0)), du: round2(inv.filter((i) => i.status === 'envoyee').reduce((x, i) => x + App.invoiceTotals(i).ttc, 0)), n: inv.length };
    };
    el.innerHTML = head('Clients', `${s.clients.length} client(s)`, '<button class="btn primary" id="new">+ Client</button>') +
      `<div class="card">${s.clients.length ? `<div class="table-wrap"><table><thead><tr><th>Client</th><th>N° TVA</th><th>Pays</th><th class="num">Factures</th><th class="num">CA HTVA</th><th class="num">Reste dû</th><th></th></tr></thead><tbody>
      ${s.clients.map((c) => { const st = stats(c.id); const v = App.vatParse(c.vatNumber); return `<tr><td><strong>${esc(c.name)}</strong><div class="small muted">${esc(c.email)}</div></td><td>${c.vatNumber ? `${esc(v.formatted)} ${v.valid ? '<span class="badge success">valide</span>' : '<span class="badge danger">invalide</span>'}` : '<span class="muted">particulier</span>'}</td><td>${esc(c.country || 'BE')}</td><td class="num">${st.n}</td><td class="num">${eur(st.ca)}</td><td class="num ${st.du ? 'neg' : ''}">${eur(st.du)}</td><td class="num"><button class="btn sm" data-edit="${c.id}">Modifier</button> <button class="btn sm danger" data-del="${c.id}" aria-label="Supprimer">✕</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="empty">Aucun client pour l\'instant.</div>'}</div>`;
    $('#new', el).onclick = () => App.editClient(null);
    $$('[data-edit]', el).forEach((b) => (b.onclick = () => App.editClient(s.clients.find((c) => c.id === b.dataset.edit))));
    $$('[data-del]', el).forEach((b) => (b.onclick = () => {
      if (s.invoices.some((i) => i.clientId === b.dataset.del)) return App.toast('Ce client a des factures : impossible de le supprimer.', 'error');
      App.confirmBox('Supprimer ce client ?', () => { s.clients = s.clients.filter((c) => c.id !== b.dataset.del); App.save(); App.render(); }, 'Supprimer');
    }));
  };

  /* ============ DÉPENSES ============ */
  App.editExpense = (exp, prefill) => {
    const s = App.state;
    const e = exp ? JSON.parse(JSON.stringify(exp)) : Object.assign({ id: App.uid(), date: App.today(), supplier: '', account: '612300', description: '', ht: 0, tvaRate: 21, tva: 0, ttc: 0, deductiblePct: 100, vatRegime: 'normal', paid: true, paidDate: '', paymentMethod: 'carte', receipt: '' }, prefill || {});
    App.modal({
      title: exp ? 'Modifier la dépense' : 'Nouvelle dépense',
      body: `<form class="form-grid" id="ef">
        <label class="field">Date <input type="date" name="date" value="${e.date}"></label>
        <label class="field">Fournisseur <input name="supplier" value="${esc(e.supplier)}" list="sup-list"><datalist id="sup-list">${[...new Set(s.expenses.map((x) => x.supplier))].map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label>
        <label class="field full">Catégorie (compte PCMN) <select name="account">${App.options(App.EXPENSE_CATEGORIES.map((c) => [c.account, `${c.account} — ${c.label}`]), e.account)}</select></label>
        <label class="field full">Description <input name="description" value="${esc(e.description)}"></label>
        <label class="field full">Régime de TVA <select name="vatRegime">${App.options(App.PURCHASE_REGIMES, e.vatRegime || 'normal')}</select></label>
        <label class="field" id="lttc">Montant TVAC payé <input type="number" step="0.01" name="ttc" value="${e.ttc}"></label>
        <label class="field">Taux TVA <select name="tvaRate">${App.tvaOptions(e.tvaRate)}</select></label>
        <label class="field">Montant HTVA <input type="number" step="0.01" name="ht" value="${e.ht}"></label>
        <label class="field" id="ltva">TVA <input type="number" step="0.01" name="tva" value="${e.tva}"></label>
        <label class="field">TVA déductible (%) <input type="number" min="0" max="100" name="deductiblePct" value="${e.deductiblePct ?? 100}"></label>
        <label class="field">Payé par <select name="paymentMethod">${App.options([['carte', 'Carte / Bancontact'], ['virement', 'Virement'], ['domiciliation', 'Domiciliation'], ['especes', 'Espèces (caisse)'], ['prive', 'Fonds privés (compte courant)']], e.paymentMethod)}</select></label>
        <label class="field">Payée le <input type="date" name="paidDate" value="${e.paidDate || ''}"></label>
        <label class="check full"><input type="checkbox" name="paid" ${e.paid ? 'checked' : ''}> Dépense déjà payée</label>
        <div class="full small muted" id="dedhint"></div>
        <label class="field full">Justificatif (photo ou PDF) <input type="file" id="rcpt" accept="image/*,application/pdf"></label>
        ${e.receipt ? `<div class="full"><img src="${e.receipt}" style="max-width:180px;border-radius:8px;border:1px solid var(--border)" alt="Justificatif"></div>` : ''}
        <div class="full alert small" id="ai-hint" ${App.ai.isReady() ? '' : 'hidden'}>✦ Ajoutez une photo du justificatif puis cliquez sur « Remplir avec l'IA » : montants, TVA, catégorie et déductibilité sont extraits automatiquement.</div>
      </form>`,
      footer: `${exp ? '<button class="btn danger" id="del">Supprimer</button>' : ''}<button class="btn" id="ai-fill" ${App.ai.isReady() ? '' : 'hidden'}>✦ Remplir avec l'IA</button><button class="btn" data-close>Annuler</button><button class="btn primary" id="ok">Enregistrer</button>`,
      onMount: (m, close) => {
        const f = $('#ef', m);
        const autoliq = () => f.vatRegime.value !== 'normal';
        const recalc = (src) => {
          const rate = Number(f.tvaRate.value) || 0;
          if (autoliq()) { if (src === 'ttc') f.ht.value = f.ttc.value; f.tva.value = round2(f.ht.value * rate / 100); f.ttc.value = f.ht.value; }
          else if (src === 'ht') { f.tva.value = round2(f.ht.value * rate / 100); f.ttc.value = round2(Number(f.ht.value) + Number(f.tva.value)); }
          else if (src !== 'tva') { f.ht.value = round2(f.ttc.value / (1 + rate / 100)); f.tva.value = round2(f.ttc.value - f.ht.value); }
          else f.ht.value = round2(f.ttc.value - f.tva.value);
          $('#lttc', m).firstChild.textContent = autoliq() ? 'Montant payé (HTVA) ' : 'Montant TVAC payé ';
          $('#ltva', m).firstChild.textContent = autoliq() ? 'TVA autoliquidée ' : 'TVA ';
          const pctv = Number(f.deductiblePct.value);
          $('#dedhint', m).textContent = pctv < 100 ? `TVA déductible à ${pctv} % : ${eur(f.tva.value * pctv / 100)} récupérés, le reste est ajouté à la charge.` : '';
        };
        f.ttc.oninput = () => recalc('ttc'); f.tvaRate.onchange = () => recalc('ttc'); f.ht.oninput = () => recalc('ht'); f.tva.oninput = () => recalc('tva');
        f.vatRegime.onchange = () => recalc('ht'); f.deductiblePct.oninput = () => recalc('none');
        f.account.onchange = () => { const d = App.VAT_DEDUCTIBILITY[f.account.value]; f.deductiblePct.value = d ?? 100; recalc('none'); };
        recalc('none');
        let file = null;
        $('#rcpt', m).onchange = async (ev) => { file = ev.target.files[0]; if (file) e.receipt = await App.compressImage(file, 800); };
        $('#ai-fill', m).onclick = async (ev) => {
          if (!file) return App.toast('Ajoutez d\'abord un justificatif', 'error');
          const btn = ev.currentTarget; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Analyse…';
          try {
            const r = await App.ai.scanDocument(file);
            if (r.date) f.date.value = r.date;
            f.supplier.value = r.supplier || f.supplier.value; f.description.value = r.description || '';
            if (App.EXPENSE_CATEGORIES.some((c) => c.account === r.account)) f.account.value = r.account;
            f.tvaRate.value = App.TVA_RATES.includes(Number(r.tva_rate)) ? r.tva_rate : 21;
            if (App.PURCHASE_REGIMES.some(([k]) => k === r.vat_regime)) f.vatRegime.value = r.vat_regime;
            f.deductiblePct.value = r.vat_deductible_pct ?? (App.VAT_DEDUCTIBILITY[f.account.value] ?? 100);
            f.ttc.value = r.total_ttc; f.ht.value = r.total_ht; f.tva.value = r.total_tva;
            if (['carte', 'virement', 'domiciliation', 'especes'].includes(r.payment_method)) f.paymentMethod.value = r.payment_method;
            recalc('none');
            $('#ai-hint', m).hidden = false;
            $('#ai-hint', m).innerHTML = `✦ Extraction terminée (confiance ${Math.round((r.confidence || 0) * 100)} %). ${esc(r.remarks || '')}${r.is_asset ? '<br><strong>Ce bien semble être un investissement</strong> : enregistrez-le plutôt dans Immobilisations pour l\'amortir.' : ''}`;
          } catch (err) { App.toast(err.message, 'error'); }
          btn.disabled = false; btn.textContent = '✦ Remplir avec l\'IA';
        };
        $('#ok', m).onclick = () => {
          Object.assign(e, App.formData(f));
          e.accountGuessed = false;
          e.ht = round2(e.ht); e.tva = round2(e.tva); e.ttc = round2(e.ttc);
          if (!e.ht && !e.ttc) return App.toast('Indiquez un montant', 'error');
          if (e.paid && !e.paidDate) e.paidDate = e.date;
          const i = s.expenses.findIndex((x) => x.id === e.id);
          const bankId = e._bank; delete e._bank;
          if (i >= 0) s.expenses[i] = e; else s.expenses.push(e);
          const bl = bankId && s.bank.find((x) => x.id === bankId);
          if (bl) applyMatch(bl, { type: 'expense', id: e.id });
          if (e.supplier && !s.suppliers.some((x) => x.name === e.supplier)) s.suppliers.push({ id: App.uid(), name: e.supplier });
          App.save(); close(); App.toast('Dépense enregistrée', 'success'); App.render();
        };
        const del = $('#del', m);
        if (del) del.onclick = () => { s.expenses = s.expenses.filter((x) => x.id !== e.id); s.bank.forEach((b) => { if (b.matched && b.matched.id === e.id) b.matched = null; }); App.save(); close(); App.render(); };
      },
    });
  };

  V.depenses = (el, params) => {
    const s = App.state;
    if (params[0] === 'new') setTimeout(() => App.editExpense(null), 0);
    const y = selectedYear, fy = App.fiscalYear(y);
    const draw = () => {
      const q = ($('#q', el).value || '').toLowerCase(), cat = $('#cat', el).value;
      const list = s.expenses.filter((e) => e.date >= fy.start && e.date <= fy.end)
        .filter((e) => !cat || e.account === cat)
        .filter((e) => !q || `${e.supplier} ${e.description}`.toLowerCase().includes(q))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      const tot = list.reduce((x, e) => ({ ht: x.ht + e.ht, tva: x.tva + e.tva, ttc: x.ttc + e.ttc }), { ht: 0, tva: 0, ttc: 0 });
      $('#list', el).innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th></th><th>Date</th><th>Fournisseur</th><th>Catégorie</th><th>Statut</th><th class="num">HTVA</th><th class="num">TVA</th><th class="num">Payé</th></tr></thead><tbody>
        ${list.map((e) => `<tr class="clickable" data-id="${e.id}"><td>${e.receipt ? `<img class="receipt-thumb" src="${e.receipt}" alt="">` : '<span class="badge warning" title="Justificatif manquant">!</span>'}</td><td>${fdate(e.date)}</td><td><strong>${esc(e.supplier)}</strong><div class="small muted">${esc(e.description)}</div></td><td>${esc(App.accountLabel(e.account))}${e.vatRegime && e.vatRegime !== 'normal' ? ' <span class="badge">autoliquidation</span>' : ''}${(e.deductiblePct ?? 100) < 100 ? ` <span class="badge">TVA ${e.deductiblePct} %</span>` : ''}${e.source === 'peppol' ? ' <span class="badge primary">Peppol</span>' : ''}${e.accountGuessed ? ' <span class="badge warning">catégorie à vérifier</span>' : ''}</td><td>${e.paid ? '<span class="badge success">Payée</span>' : '<span class="badge warning">À payer</span>'}</td><td class="num">${eur(e.ht)}</td><td class="num">${eur(e.tva)}</td><td class="num">${eur(e.ttc)}</td></tr>`).join('')}
        <tr class="total"><td colspan="5">Total (${list.length})</td><td class="num">${eur(tot.ht)}</td><td class="num">${eur(tot.tva)}</td><td class="num">${eur(tot.ttc)}</td></tr></tbody></table></div>`
        : '<div class="empty">Aucune dépense sur cette période.</div>';
      $$('[data-id]', el).forEach((r) => (r.onclick = () => App.editExpense(s.expenses.find((e) => e.id === r.dataset.id))));
    };
    el.innerHTML = head('Dépenses', 'Achats et frais, avec TVA déductible (règles belges de déductibilité) et justificatifs.',
      `<select id="year">${App.yearOptions(y)}</select><a class="btn" href="#/ia/scan">✦ Scanner des justificatifs</a><button class="btn" id="exp">Exporter CSV</button><button class="btn primary" id="new">+ Dépense</button>`) +
      `<div class="card"><div class="toolbar"><input id="q" placeholder="Rechercher…" style="max-width:260px"><select id="cat"><option value="">Toutes catégories</option>${App.options(App.EXPENSE_CATEGORIES.map((c) => [c.account, c.label]))}</select></div><div id="list"></div></div>`;
    $('#year', el).onchange = (e) => { selectedYear = Number(e.target.value); V.depenses(el, []); };
    $('#q', el).oninput = draw; $('#cat', el).onchange = draw;
    $('#new', el).onclick = () => App.editExpense(null);
    $('#exp', el).onclick = () => App.download('depenses.csv', App.toCSV([['Date', 'Fournisseur', 'Description', 'Compte', 'Catégorie', 'Régime', 'HTVA', 'Taux TVA', 'TVA', '% déductible', 'Payé', 'Payée'], ...s.expenses.map((e) => [e.date, e.supplier, e.description, e.account, App.accountLabel(e.account), e.vatRegime || 'normal', e.ht, e.tvaRate, e.tva, e.deductiblePct ?? 100, e.ttc, e.paid ? 'oui' : 'non'])]), 'text/csv');
    draw();
  };

  /* ============ BANQUE ============ */
  const BANK_CATEGORIES = () => [...App.EXPENSE_CATEGORIES.map((c) => [c.account, `${c.account} — ${c.label}`]), ...App.REVENUE_ACCOUNTS, ['750000', '750000 — Produits financiers (intérêts)'], ['100000', '100000 — Apport de l\'exploitant / capital'], ['489100', '489100 — Compte courant dirigeant (prélèvement / apport privé)'], ['173000', '173000 — Remboursement d\'emprunt (capital)'], ['451800', '451800 — Paiement TVA au SPF Finances'], ['411800', '411800 — Remboursement de TVA reçu'], ['412000', '412000 — Versement anticipé d\'impôt'], ['450000', '450000 — Paiement d\'impôt (avertissement-extrait de rôle)'], ['453000', '453000 — Précompte professionnel versé'], ['454000', '454000 — ONSS'], ['455000', '455000 — Salaires nets'], ['456000', '456000 — Caisse d\'assurances sociales (provisions)'], ['499000', '499000 — Compte d\'attente']];

  V.banque = (el) => {
    const s = App.state;
    const matchLabel = (b) => {
      const m = b.matched; if (!m) return '<span class="badge warning">À rapprocher</span>';
      const how = b.auto ? ` <span class="badge" title="Rapproché automatiquement">${esc(b.auto)}</span>` : '';
      if (m.type === 'invoice') { const i = s.invoices.find((x) => x.id === m.id); return `<span class="badge success">Facture ${esc(i ? i.number : '?')}</span>${how}`; }
      if (m.type === 'expense') { const e = s.expenses.find((x) => x.id === m.id); return `<span class="badge success">Dépense ${esc(e ? e.supplier : '?')}</span>${how}`; }
      return `<span class="badge primary">${esc(App.accountLabel(m.account))}${m.tvaRate ? ' · TVA ' + m.tvaRate + ' %' : ''}</span>${how}`;
    };
    const list = [...s.bank].sort((a, b) => (a.date < b.date ? 1 : -1));
    const solde = App.trialBalance(null, App.today()).filter((a) => a.account === '550000').reduce((x, a) => x + a.solde, 0);
    const releve = round2((Number(s.settings.opening.banque) || 0) + s.bank.reduce((x, b) => x + Number(b.amount), 0));
    el.innerHTML = head('Banque', 'Importez vos extraits (CODA ou CSV de votre banque) : les paiements sont rapprochés automatiquement par communication structurée, montant et règles apprises.',
      `<label class="btn primary">Importer CODA / CSV<input type="file" id="csv" accept=".cod,.coda,.txt,.csv,text/csv" multiple hidden></label><button class="btn" id="add">+ Opération</button><button class="btn" id="auto">Rapprocher automatiquement</button><button class="btn" id="ai" ${s.bank.some((b) => !b.matched) && App.ai.isReady() ? '' : 'disabled'}>✦ Trier le reste avec l'IA</button>`) +
      `<div class="grid grid-3"><div class="card kpi"><div class="label">Solde comptable (550)</div><div class="value">${eur(solde)}</div><div class="sub">Calculé à partir des écritures</div></div>
       <div class="card kpi"><div class="label">Opérations à rapprocher</div><div class="value">${s.bank.filter((b) => !b.matched).length}</div><div class="sub">sur ${s.bank.length} importée(s) · ${s.bankRules.length} règle(s) apprise(s)</div></div>
       <div class="card kpi"><div class="label">Ouverture + extraits importés</div><div class="value">${eur(releve)}</div><div class="sub">À comparer avec le solde de votre banque</div></div></div>
       <div class="card" style="margin-top:16px">${list.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th class="num">Montant</th><th>Rapprochement</th><th></th></tr></thead><tbody>
       ${list.map((b) => `<tr><td>${fdate(b.date)}</td><td>${esc(b.label)}${b.comm ? `<div class="small muted" style="font-family:var(--mono)">${esc(b.comm)}</div>` : ''}${b.aiReason ? `<div class="small muted">✦ ${esc(b.aiReason)}</div>` : ''}</td><td class="num ${b.amount < 0 ? 'neg' : 'pos'}">${eur(b.amount)}</td><td>${matchLabel(b)}</td><td class="num"><button class="btn sm" data-m="${b.id}">${b.matched ? 'Modifier' : 'Rapprocher'}</button> <button class="btn sm danger" data-d="${b.id}" aria-label="Supprimer">✕</button></td></tr>`).join('')}
       </tbody></table></div>` : '<div class="empty">Aucune opération. Téléchargez vos extraits CODA (format standard des banques belges : BNP Paribas Fortis, KBC, Belfius, ING…) ou un export CSV depuis votre banque en ligne.</div>'}</div>
       ${codaGuide(!s.bank.length)}
       ${s.bankRules.length ? `<div class="card"><h2>Règles apprises</h2><p class="small muted">Créées automatiquement quand vous catégorisez une opération ; appliquées aux prochains imports.</p><div class="table-wrap"><table><tbody>${s.bankRules.map((r, k) => `<tr><td>Libellé contient « ${esc(r.pattern)} »</td><td>${esc(App.accountLabel(r.account))}</td><td>TVA ${r.tvaRate} %</td><td class="num"><button class="btn sm danger" data-rr="${k}">Supprimer</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    $('#csv', el).onchange = (e) => importFiles([...e.target.files]);
    $('#add', el).onclick = () => matchModal({ id: App.uid(), date: App.today(), label: '', amount: 0, matched: null }, true);
    $('#auto', el).onclick = () => { const n = autoReconcile(); App.save(); App.toast(n ? `${n} opération(s) rapprochée(s) automatiquement` : 'Aucune correspondance certaine trouvée', n ? 'success' : ''); App.render(); };
    $$('[data-m]', el).forEach((b) => (b.onclick = () => matchModal(s.bank.find((x) => x.id === b.dataset.m))));
    $$('[data-d]', el).forEach((b) => (b.onclick = () => App.confirmBox('Supprimer cette opération ?', () => { unmatch(s.bank.find((x) => x.id === b.dataset.d)); s.bank = s.bank.filter((x) => x.id !== b.dataset.d); App.save(); App.render(); }, 'Supprimer')));
    $$('[data-rr]', el).forEach((b) => (b.onclick = () => { s.bankRules.splice(Number(b.dataset.rr), 1); App.save(); App.render(); }));
    $('#ai', el).onclick = (ev) => aiSort(ev.currentTarget);
  };

  /* Guide : obtenir ses extraits CODA auprès de sa banque */
  function codaGuide(open) {
    const banks = [
      ['KBC / CBC', 'KBC-Online for Business (ou KBC@Isabel) → « Rapports et fichiers » → « Fichiers CODA » → choisir la période → télécharger. Activez d\'abord le service CODA (gratuit ou payant selon votre formule) auprès de votre agence ou dans l\'app.'],
      ['BNP Paribas Fortis / Fintro / Hello bank!', 'Easy Banking Business (web) → Comptes → Extraits de compte → choisir le format CODA et la période. Le service CODA doit être activé sur le compte professionnel.'],
      ['Belfius', 'Belfius Direct Net pour les professionnels → Comptes → Extraits / fichiers CODA. Également disponible via Isabel ou Belfius Secure EDI.'],
      ['ING', 'ING Business\'Bank → fichiers de reporting CODA (ou via ING Accounting Connector, payant depuis août 2025). À défaut, export CSV depuis Business\'Bank ou l\'app ING Banking.'],
      ['Argenta, Crelan, Beobank, Keytrade, autres', 'Cherchez « CODA » ou « extraits électroniques » dans la banque en ligne professionnelle, ou demandez l\'activation à votre agence. Sinon, exportez l\'historique en CSV : ComptaPro le lit aussi.'],
      ['Isabel 6', 'Si vous utilisez Isabel, vous récupérez les CODA de toutes vos banques au même endroit (menu des rapports / extraits).'],
    ];
    return `<div class="card"><details ${open ? 'open' : ''}><summary><strong>Comment obtenir vos fichiers CODA ?</strong> <span class="muted small">— le format bancaire belge le plus complet (communication structurée, contrepartie, IBAN)</span></summary>
      <ol style="margin-top:12px"><li>Activez le service <strong>CODA</strong> sur votre compte professionnel (dans la banque en ligne business ou auprès de votre agence). Certaines banques le facturent.</li>
      <li>Téléchargez les fichiers (extension .cod, .coda ou .txt) pour la période voulue, idéalement chaque semaine ou chaque mois.</li>
      <li>Ici, cliquez sur <strong>Importer CODA / CSV</strong> et sélectionnez un ou plusieurs fichiers à la fois. Les doublons sont ignorés : vous pouvez réimporter sans risque.</li></ol>
      <div class="table-wrap"><table><tbody>${banks.map(([n, d]) => `<tr><td style="white-space:nowrap"><strong>${n}</strong></td><td>${d}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">Les noms de menus changent parfois : en cas de doute, cherchez « CODA » dans l'aide de votre banque. Pas de CODA disponible ? L'export CSV de la banque en ligne fonctionne aussi (un peu moins précis).</p></details></div>`;
  }

  async function aiSort(btn) {
    const s = App.state;
    const todoList = s.bank.filter((b) => !b.matched);
    if (!todoList.length || !App.ai.isReady()) return 0;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Tri en cours…'; }
    try {
      const res = await App.ai.categorizeBank(todoList);
      let n = 0;
      (res.results || []).forEach((r) => {
        const b = s.bank.find((x) => x.id === r.id); if (!b || b.matched) return;
        if ((r.confidence || 0) < 0.5) { b.aiReason = `Suggestion : ${App.accountLabel(r.account)} — ${r.reason}`; return; }
        if (r.match_type === 'invoice' && s.invoices.some((i) => i.id === r.match_id)) applyMatch(b, { type: 'invoice', id: r.match_id });
        else if (r.match_type === 'expense' && s.expenses.some((i) => i.id === r.match_id)) applyMatch(b, { type: 'expense', id: r.match_id });
        else if (r.account) applyMatch(b, { type: 'category', account: r.account, tvaRate: Number(r.tva_rate) || 0 });
        b.auto = 'IA'; b.aiReason = `${r.reason} (confiance ${Math.round((r.confidence || 0) * 100)} %)`; n++;
      });
      App.save(); App.toast(`${n} opération(s) classée(s) par l'IA — vérifiez-les`, 'success'); App.render();
      return n;
    } catch (err) { App.toast(err.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = '✦ Trier le reste avec l\'IA'; } return 0; }
  }

  /* Rapprochement automatique sans IA : communication structurée, montant + nom, règles apprises */
  const norm = (str) => String(str || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const NOISE = new Set(['PAIEMENT', 'VIREMENT', 'DOMICILIATION', 'BANCONTACT', 'CARTE', 'SEPA', 'VERS', 'DE', 'DU', 'LA', 'LE', 'EN', 'FAVEUR', 'AVEC', 'MAESTRO', 'VISA', 'DEBIT', 'CREDIT', 'ACHAT', 'PAR', 'EUROPEEN', 'INSTANTANE', 'BE', 'NR', 'REF', 'COMMUNICATION', 'DATE', 'VALEUR']);
  const keyOf = (label) => norm(label).split(' ').filter((w) => w.length > 2 && !NOISE.has(w) && !/^\d+$/.test(w)).slice(0, 2).join(' ');

  function autoReconcile() {
    const s = App.state;
    let n = 0;
    s.bank.filter((b) => !b.matched).forEach((b) => {
      const openInv = s.invoices.filter((i) => i.type === 'facture' && i.status === 'envoyee');
      const lbl = norm(b.label);
      // 1. Communication structurée
      const commDigits = App.digits(b.comm || (String(b.label).match(/\+{3}[\d/ ]+\+{3}/) || [''])[0]);
      if (commDigits.length === 12) {
        const inv = openInv.find((i) => App.digits(App.invoiceComm(i)) === commDigits);
        if (inv) { applyMatch(b, { type: 'invoice', id: inv.id }); b.auto = 'communication'; n++; return; }
      }
      if (b.amount > 0) {
        const same = openInv.filter((i) => Math.abs(App.invoiceTotals(i).ttc - b.amount) < 0.01);
        const named = same.filter((i) => norm(clientName(i.clientId)).split(' ').some((w) => w.length > 3 && lbl.includes(w)));
        const pick = named.length === 1 ? named[0] : same.length === 1 ? same[0] : null;
        if (pick) { applyMatch(b, { type: 'invoice', id: pick.id }); b.auto = 'montant'; n++; return; }
      } else {
        const unpaid = s.expenses.filter((e) => !e.paid);
        // Facture fournisseur reçue par Peppol : même communication structurée, ou même IBAN et même montant
        const byRef = commDigits.length === 12 && unpaid.find((e) => App.digits(e.paymentRef) === commDigits);
        const byIban = !byRef && b.counterparty && unpaid.filter((e) => e.supplierIban && App.ibanClean(e.supplierIban) === App.ibanClean(b.counterparty) && Math.abs((e.vatRegime && e.vatRegime !== 'normal' ? e.ht : e.ttc) + b.amount) < 0.01);
        const hit = byRef || (byIban && byIban.length === 1 ? byIban[0] : null);
        if (hit) { applyMatch(b, { type: 'expense', id: hit.id }); b.auto = byRef ? 'communication' : 'IBAN'; n++; return; }
        const same = unpaid.filter((e) => Math.abs((e.vatRegime && e.vatRegime !== 'normal' ? e.ht : e.ttc) + b.amount) < 0.01);
        const named = same.filter((e) => norm(e.supplier).split(' ').some((w) => w.length > 3 && lbl.includes(w)));
        const pick = named.length === 1 ? named[0] : same.length === 1 ? same[0] : null;
        if (pick) { applyMatch(b, { type: 'expense', id: pick.id }); b.auto = 'montant'; n++; return; }
      }
      const rule = s.bankRules.find((r) => r.pattern && lbl.includes(r.pattern) && (r.sign || 0) === Math.sign(b.amount));
      if (rule) { applyMatch(b, { type: 'category', account: rule.account, tvaRate: rule.tvaRate }); b.auto = 'règle'; n++; }
    });
    return n;
  }
  App.autoReconcile = autoReconcile;

  function learnRule(b, account, tvaRate) {
    const pattern = keyOf(b.label);
    if (!pattern) return;
    const s = App.state, sign = Math.sign(b.amount);
    s.bankRules = s.bankRules.filter((r) => !(r.pattern === pattern && (r.sign || 0) === sign));
    s.bankRules.push({ pattern, account, tvaRate, sign });
  }

  function unmatch(b) {
    if (!b || !b.matched) return;
    const s = App.state, m = b.matched;
    if (m.type === 'invoice') { const i = s.invoices.find((x) => x.id === m.id); if (i && i.status === 'payee') { i.status = 'envoyee'; i.paidDate = ''; } }
    if (m.type === 'expense') { const e = s.expenses.find((x) => x.id === m.id); if (e) { e.paid = false; e.paidDate = ''; } }
    b.matched = null; b.auto = '';
  }
  function applyMatch(b, m) {
    const s = App.state;
    unmatch(b);
    b.matched = m;
    if (m.type === 'invoice') { const i = s.invoices.find((x) => x.id === m.id); if (i) { i.status = 'payee'; i.paidDate = b.date; } }
    if (m.type === 'expense') { const e = s.expenses.find((x) => x.id === m.id); if (e) { e.paid = true; e.paidDate = b.date; } }
  }

  function matchModal(b, isNew) {
    const s = App.state;
    const openInv = s.invoices.filter((i) => i.type !== 'devis' && !['brouillon', 'annulee'].includes(i.status) && (i.status !== 'payee' || (b.matched && b.matched.id === i.id)));
    const unpaidExp = s.expenses.filter((e) => !e.paid || (b.matched && b.matched.id === e.id));
    const best = (arr, amt) => arr.slice().sort((a, c) => Math.abs(Math.abs(amt) - Math.abs(a.v)) - Math.abs(Math.abs(amt) - Math.abs(c.v)));
    const invOpts = best(openInv.map((i) => ({ id: i.id, v: App.invoiceTotals(i).ttc, l: `${i.number} — ${clientName(i.clientId)} — ${eur(App.invoiceTotals(i).ttc)}` })), b.amount);
    const expOpts = best(unpaidExp.map((e) => ({ id: e.id, v: e.ttc, l: `${fdate(e.date)} ${e.supplier} — ${eur(e.ttc)}` })), b.amount);
    const m = b.matched || {};
    App.modal({
      title: isNew ? 'Nouvelle opération' : 'Rapprocher l\'opération',
      body: `<form class="form-grid" id="bf">
        <label class="field">Date <input type="date" name="date" value="${b.date}"></label>
        <label class="field">Montant (− sortie / + entrée) <input type="number" step="0.01" name="amount" value="${b.amount}"></label>
        <label class="field full">Libellé <input name="label" value="${esc(b.label)}"></label>
        <label class="field full">Type de rapprochement <select name="type">${App.options([['', '— Non rapprochée —'], ['invoice', 'Paiement d\'une facture client'], ['expense', 'Paiement d\'une dépense encodée'], ['category', 'Catégoriser directement'], ['newexp', 'Créer une dépense à partir de l\'opération']], m.type || (b.amount > 0 && invOpts.length ? 'invoice' : b.amount < 0 && expOpts.length ? 'expense' : 'category'))}</select></label>
        <label class="field full" data-show="invoice">Facture <select name="invoice">${App.options(invOpts.map((o) => [o.id, o.l]), m.id)}</select></label>
        <label class="field full" data-show="expense">Dépense <select name="expense">${App.options(expOpts.map((o) => [o.id, o.l]), m.id)}</select></label>
        <label class="field" data-show="category">Compte <select name="account">${App.options(BANK_CATEGORIES(), m.account || (b.amount > 0 ? '701000' : '499000'))}</select></label>
        <label class="field" data-show="category">TVA incluse <select name="tvaRate">${App.tvaOptions(m.tvaRate ?? 0)}</select></label>
        <label class="check full" data-show="category"><input type="checkbox" name="learn" checked> Retenir pour les prochaines opérations similaires (« ${esc(keyOf(b.label) || '…')} »)</label>
      </form>`,
      footer: `<button class="btn" data-close>Annuler</button><button class="btn primary" id="ok">Valider</button>`,
      onMount: (md, close) => {
        const f = $('#bf', md);
        const vis = () => $$('[data-show]', md).forEach((x) => (x.hidden = x.dataset.show !== f.type.value));
        f.type.onchange = vis; vis();
        $('#ok', md).onclick = () => {
          const d = App.formData(f);
          b.date = d.date; b.amount = round2(d.amount); b.label = d.label;
          if (isNew) s.bank.push(b);
          if (d.type === 'newexp') {
            App.save(); close();
            const amt = Math.abs(b.amount);
            return App.editExpense(null, { date: b.date, supplier: b.label, ttc: amt, ht: round2(amt / 1.21), tva: round2(amt - amt / 1.21), paid: true, paidDate: b.date, _bank: b.id });
          }
          if (!d.type) unmatch(b);
          else if (d.type === 'invoice' && d.invoice) applyMatch(b, { type: 'invoice', id: d.invoice });
          else if (d.type === 'expense' && d.expense) applyMatch(b, { type: 'expense', id: d.expense });
          else if (d.type === 'category') {
            applyMatch(b, { type: 'category', account: d.account, tvaRate: Number(d.tvaRate) || 0 });
            if (d.learn) { learnRule(b, d.account, Number(d.tvaRate) || 0); const k = autoReconcile(); if (k) App.toast(`Règle apprise : ${k} autre(s) opération(s) classée(s)`, 'success'); }
          }
          App.save(); close(); App.render();
        };
      },
    });
  }

  async function importFiles(files) {
    const s = App.state;
    let n = 0, dup = 0;
    for (const file of files) {
      const text = await file.text();
      const first = text.split(/\r?\n/)[0] || '';
      const isCoda = /^[0-9]/.test(first) && first.replace(/\s+$/, "").length >= 100 && !/[;,\t]/.test(first.slice(0, 20));
      const rows = isCoda ? App.parseCoda(text) : parseBankCsv(text);
      rows.forEach((r) => {
        if (s.bank.some((b) => b.date === r.date && b.amount === r.amount && (b.label === r.label || (r.comm && b.comm === r.comm)))) { dup++; return; }
        s.bank.push(Object.assign({ id: App.uid(), matched: null }, r)); n++;
      });
    }
    const auto = autoReconcile();
    App.save();
    App.toast(`${n} opération(s) importée(s)${dup ? `, ${dup} doublon(s) ignoré(s)` : ''} · ${auto} rapprochée(s) automatiquement`, 'success');
    App.render();
    if (s.settings.company.autoAI && App.ai.isReady() && s.bank.some((b) => !b.matched)) aiSort(null);
  }

  /* CSV des banques belges (séparateur ; , montants 1.234,56, colonnes variables) */
  function parseBankCsv(text) {
    const rows = App.parseCSV(text);
    if (rows.length < 2) return [];
    let h = 0;
    while (h < Math.min(rows.length, 15) && !rows[h].some((c) => /date/i.test(c))) h++;
    if (h >= rows.length) h = 0;
    const header = rows[h].map((x) => x.toLowerCase());
    const find = (...keys) => header.findIndex((x) => keys.some((k) => x.includes(k)));
    let iDate = find('date d\'exécution', 'date de comptabilisation', 'date comptable', 'date valeur', 'date');
    const iAmount = find('montant', 'amount', 'bedrag');
    const iDebit = find('débit', 'debit'), iCredit = find('crédit', 'credit');
    const iName = find('nom de la contrepartie', 'contrepartie', 'nom', 'tegenpartij');
    const iComm = find('communication', 'mededeling', 'message');
    const iLabel = find('détails', 'details', 'libellé', 'description', 'transaction', 'omschrijving');
    if (iDate < 0) iDate = 0;
    return rows.slice(h + 1).map((r) => {
      const date = App.parseDate(r[iDate]); if (!date) return null;
      let amount = iAmount >= 0 ? App.parseAmount(r[iAmount]) : App.parseAmount(r[iCredit]) - Math.abs(App.parseAmount(r[iDebit]));
      const commRaw = iComm >= 0 ? r[iComm] : '';
      const comm = App.structuredValid(commRaw) ? App.structuredComm(App.digits(commRaw).slice(0, 10)) : '';
      const label = [iName >= 0 ? r[iName] : '', comm ? '' : commRaw, iLabel >= 0 && iLabel !== iName && iLabel !== iComm ? r[iLabel] : ''].map((x) => String(x || '').trim()).filter(Boolean).join(' — ').slice(0, 200) || 'Opération';
      return amount ? { date, amount: round2(amount), comm, label } : null;
    }).filter(Boolean);
  }

  /* ============ IMMOBILISATIONS ============ */
  V.immobilisations = (el) => {
    const s = App.state, y = selectedYear;
    el.innerHTML = head('Immobilisations & amortissements', 'Investissements amortis en linéaire (prorata temporis la première année). Les amortissements sont comptabilisés automatiquement à chaque clôture.',
      '<button class="btn primary" id="new">+ Immobilisation</button>') +
      `<div class="card">${s.assets.length ? `<div class="table-wrap"><table><thead><tr><th>Bien</th><th>Compte</th><th>Mise en service</th><th class="num">Durée</th><th class="num">Valeur d'acquisition</th><th class="num">Amortissement ${y}</th><th class="num">Amort. cumulés</th><th class="num">Valeur nette fin ${y}</th><th></th></tr></thead><tbody>
      ${s.assets.map((a) => { const sch = App.depreciationSchedule(a); const row = sch.find((r) => r.year === y); const last = sch.filter((r) => r.year <= y).pop(); return `<tr><td><strong>${esc(a.label)}</strong><div class="small muted">${esc(a.supplier || '')}</div></td><td>${a.account}</td><td>${fdate(a.date)}</td><td class="num">${a.duration} ans</td><td class="num">${eur(Number(a.value) + App.assetVat(a).nonDed)}</td><td class="num">${eur(row ? row.dotation : 0)}</td><td class="num">${eur(last ? last.cumul : 0)}</td><td class="num">${eur(last ? last.vnc : a.value)}</td><td class="num"><button class="btn sm" data-plan="${a.id}">Plan</button> <button class="btn sm" data-e="${a.id}">Modifier</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="empty">Aucune immobilisation.</div>'}</div>`;
    $('#new', el).onclick = () => editAsset(null);
    $$('[data-e]', el).forEach((b) => (b.onclick = () => editAsset(s.assets.find((a) => a.id === b.dataset.e))));
    $$('[data-plan]', el).forEach((b) => (b.onclick = () => {
      const a = s.assets.find((x) => x.id === b.dataset.plan);
      App.modal({ title: 'Tableau d\'amortissement — ' + esc(a.label), body: `<table><thead><tr><th>Exercice</th><th class="num">Amortissement</th><th class="num">Cumul</th><th class="num">Valeur nette</th></tr></thead><tbody>${App.depreciationSchedule(a).map((r) => `<tr><td>${r.year}</td><td class="num">${eur(r.dotation)}</td><td class="num">${eur(r.cumul)}</td><td class="num">${eur(r.vnc)}</td></tr>`).join('')}</tbody></table>`, footer: '<button class="btn" data-close>Fermer</button>' });
    }));
  };

  function editAsset(asset) {
    const s = App.state;
    const a = asset ? JSON.parse(JSON.stringify(asset)) : { id: App.uid(), label: '', account: '241000', date: App.today(), value: 0, tvaRate: 21, deductiblePct: 100, duration: 3, supplier: '', paid: true };
    App.modal({
      title: asset ? 'Modifier l\'immobilisation' : 'Nouvelle immobilisation',
      body: `<form class="form-grid" id="af">
        <label class="field full">Désignation <input name="label" value="${esc(a.label)}"></label>
        <label class="field full">Catégorie <select name="account">${App.options(App.ASSET_CATEGORIES.map((c) => [c.account, `${c.account} — ${c.label} (${c.duration} ans usuels)`]), a.account)}</select></label>
        <label class="field">Date d'acquisition <input type="date" name="date" value="${a.date}"></label>
        <label class="field">Fournisseur <input name="supplier" value="${esc(a.supplier || '')}"></label>
        <label class="field">Valeur HTVA <input type="number" step="0.01" name="value" value="${a.value}"></label>
        <label class="field">TVA <select name="tvaRate">${App.tvaOptions(a.tvaRate)}</select></label>
        <label class="field">TVA déductible (%) <input type="number" name="deductiblePct" min="0" max="100" value="${a.deductiblePct ?? 100}"></label>
        <label class="field">Durée (années) <input type="number" min="1" name="duration" value="${a.duration}"></label>
        <label class="check"><input type="checkbox" name="paid" ${a.paid !== false ? 'checked' : ''}> Payée</label>
        <p class="full small muted">Véhicule : TVA déductible au maximum à 50 %. La TVA non déductible est intégrée à la valeur amortissable.</p>
      </form>`,
      footer: `${asset ? '<button class="btn danger" id="del">Supprimer</button>' : ''}<button class="btn" data-close>Annuler</button><button class="btn primary" id="ok">Enregistrer</button>`,
      onMount: (m, close) => {
        const f = $('#af', m);
        f.account.onchange = () => { const c = App.ASSET_CATEGORIES.find((x) => x.account === f.account.value); if (c) f.duration.value = c.duration; f.deductiblePct.value = f.account.value === '245000' ? 50 : 100; };
        $('#ok', m).onclick = () => {
          Object.assign(a, App.formData(f));
          if (!a.label || !a.value) return App.toast('Désignation et valeur obligatoires', 'error');
          const i = s.assets.findIndex((x) => x.id === a.id); if (i >= 0) s.assets[i] = a; else s.assets.push(a);
          App.save(); close(); App.render();
        };
        const del = $('#del', m);
        if (del) del.onclick = () => { s.assets = s.assets.filter((x) => x.id !== a.id); App.save(); close(); App.render(); };
      },
    });
  }
})(window.App);
