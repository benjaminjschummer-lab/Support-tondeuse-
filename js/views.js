/* ComptaPro — écrans d'activité */
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

  /* ============ TABLEAU DE BORD ============ */
  V.dashboard = (el) => {
    const y = selectedYear;
    const d = App.dashboard(y);
    const is = d.is;
    const marge = is.chiffreAffaires ? (is.resultatExploitation / is.chiffreAffaires) * 100 : 0;
    const cats = Object.entries(d.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const catMax = Math.max(1, ...cats.map((c) => c[1]));
    const empty = !App.state.invoices.length && !App.state.expenses.length;
    el.innerHTML = head('Tableau de bord', `${esc(App.state.settings.company.name)} · exercice ${is.fy.label}`,
      `<select id="year">${App.yearOptions(y)}</select><a class="btn primary" href="#/factures/new">+ Facture</a><a class="btn" href="#/depenses/new">+ Dépense</a>`) +
      (empty ? `<div class="alert">Bienvenue ! Commencez par renseigner votre entreprise dans <a href="#/parametres">Paramètres</a>, ou <a href="#" id="demo">chargez des données de démonstration</a> pour explorer l'application.</div>` : '') +
      `<div class="grid grid-4">
        <div class="card kpi"><div class="label">Chiffre d'affaires HT</div><div class="value">${eur(is.chiffreAffaires)}</div><div class="sub">Exercice ${is.fy.label}</div></div>
        <div class="card kpi"><div class="label">Charges d'exploitation</div><div class="value">${eur(is.chargesExploitation)}</div><div class="sub">dont amortissements ${eur(is.dotations)}</div></div>
        <div class="card kpi"><div class="label">Résultat net</div><div class="value ${is.resultatNet >= 0 ? 'pos' : 'neg'}">${eur(is.resultatNet)}</div><div class="sub">Marge d'exploitation ${App.pct(marge)}</div></div>
        <div class="card kpi"><div class="label">Trésorerie</div><div class="value ${d.treso >= 0 ? '' : 'neg'}">${eur(d.treso)}</div><div class="sub">Banque + caisse à ce jour</div></div>
      </div>
      <div class="grid grid-3" style="margin-top:16px">
        <div class="card kpi"><div class="label">À encaisser</div><div class="value">${eur(d.unpaidTotal)}</div><div class="sub">${d.unpaid.length} facture(s) ouverte(s)${d.overdue.length ? ` · <span class="neg">${d.overdue.length} en retard (${eur(d.overdueTotal)})</span>` : ''}</div></div>
        <div class="card kpi"><div class="label">TVA ${d.currentPeriod ? esc(d.currentPeriod.label) : ''}</div><div class="value">${d.tvaCurrent ? eur(d.tvaCurrent.net) : '—'}</div><div class="sub">${d.tvaCurrent ? (d.tvaCurrent.net >= 0 ? 'à reverser (estimation)' : 'crédit de TVA') : 'Franchise ou non applicable'}</div></div>
        <div class="card kpi"><div class="label">Impôt estimé (${App.state.settings.company.impot})</div><div class="value">${App.state.settings.company.impot === 'IS' ? eur(App.estimateIS(is.resultatAvantImpot)) : '—'}</div><div class="sub">${App.state.settings.company.impot === 'IS' ? 'Taux réduit 15 % jusqu\'à 42 500 €, puis 25 %' : 'Résultat imposable à l\'IR : ' + eur(is.resultatAvantImpot)}</div></div>
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="page-head" style="margin:0 0 8px"><h2 style="margin:0">Produits et charges par mois</h2><div class="legend"><span><i style="background:var(--primary)"></i>Produits</span><span><i style="background:var(--warning)"></i>Charges</span></div></div>${App.barChart(d.monthly)}</div>
        <div class="card"><h2>Principaux postes de charges</h2>${cats.length ? cats.map(([l, v]) => `<div class="bar-row"><span>${esc(l)}</span><div class="track"><div class="fill" style="width:${(v / catMax) * 100}%"></div></div><span class="num">${eur(v)}</span></div>`).join('') : '<div class="empty">Aucune charge enregistrée</div>'}</div>
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h2>Factures à suivre</h2>${d.unpaid.length ? `<div class="table-wrap"><table><tbody>${d.unpaid.slice(0, 6).map((i) => `<tr class="clickable" data-href="#/factures/${i.id}"><td>${esc(i.number)}</td><td>${esc(clientName(i.clientId))}</td><td>${App.statusBadge(invStatus(i))}</td><td class="num">${eur(App.invoiceTotals(i).ttc)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Tout est encaissé 🎉</div>'}</div>
        <div class="card"><h2>À faire</h2><ul class="checklist">
          ${todo(d).map((t) => `<li><span class="st ${t.ok ? 'ok' : 'ko'}">${t.ok ? '✓' : '!'}</span><div>${t.html}</div></li>`).join('')}
        </ul></div>
      </div>`;
    $('#year', el).onchange = (e) => { selectedYear = Number(e.target.value); V.dashboard(el); };
    const demo = $('#demo', el);
    if (demo) demo.onclick = (e) => { e.preventDefault(); App.loadDemo(); App.toast('Données de démonstration chargées', 'success'); App.render(); };
    $$('[data-href]', el).forEach((r) => (r.onclick = () => App.go(r.dataset.href)));
  };

  function todo(d) {
    const s = App.state, items = [];
    items.push({ ok: !d.bankToReconcile, html: d.bankToReconcile ? `<a href="#/banque">${d.bankToReconcile} opération(s) bancaire(s)</a> à rapprocher` : 'Banque rapprochée' });
    items.push({ ok: !d.overdue.length, html: d.overdue.length ? `<a href="#/factures">Relancer ${d.overdue.length} facture(s) en retard</a>` : 'Aucune facture en retard' });
    const missing = s.expenses.filter((e) => !e.receipt).length;
    items.push({ ok: !missing, html: missing ? `<a href="#/depenses">${missing} dépense(s) sans justificatif</a>` : 'Tous les justificatifs sont joints' });
    if (s.settings.company.regimeTva !== 'franchise' && d.currentPeriod) {
      const prev = App.tvaPeriods(Number(App.today().slice(0, 4))).filter((p) => p.end < App.today()).pop();
      const declared = prev && s.tvaDeclarations.some((x) => x.start === prev.start);
      if (prev) items.push({ ok: declared, html: declared ? `TVA ${esc(prev.label)} déclarée` : `<a href="#/tva">Déclarer la TVA ${esc(prev.label)}</a>` });
    }
    items.push({ ok: App.ai.isReady(), html: App.ai.isReady() ? 'Assistant IA activé' : '<a href="#/parametres">Activer l\'assistant IA</a> (clé API Claude)' });
    return items;
  }

  /* ============ FACTURES & DEVIS ============ */
  V.factures = (el, params) => {
    if (params[0] === 'new') return invoiceEditor(el, null, params[1] || 'facture');
    if (params[0]) { const inv = App.state.invoices.find((i) => i.id === params[0]); if (inv) return invoiceEditor(el, inv); }
    let filter = sessionStorage.getItem('inv-filter') || 'facture';
    const draw = () => {
      const q = ($('#q', el) || {}).value || '';
      const list = App.state.invoices.filter((i) => i.type === filter)
        .filter((i) => !q || (i.number + clientName(i.clientId)).toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      const tot = list.reduce((s, i) => { const t = App.invoiceTotals(i); s.ht += t.ht; s.ttc += t.ttc; return s; }, { ht: 0, ttc: 0 });
      $('#list', el).innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th>Numéro</th><th>Client</th><th>Date</th><th>Échéance</th><th>Statut</th><th class="num">HT</th><th class="num">TTC</th></tr></thead><tbody>
        ${list.map((i) => { const t = App.invoiceTotals(i); return `<tr class="clickable" data-id="${i.id}"><td><strong>${esc(i.number)}</strong></td><td>${esc(clientName(i.clientId))}</td><td>${fdate(i.date)}</td><td>${fdate(i.dueDate)}</td><td>${App.statusBadge(invStatus(i))}</td><td class="num">${eur(t.ht)}</td><td class="num">${eur(t.ttc)}</td></tr>`; }).join('')}
        <tr class="total"><td colspan="5">Total (${list.length})</td><td class="num">${eur(tot.ht)}</td><td class="num">${eur(tot.ttc)}</td></tr></tbody></table></div>`
        : `<div class="empty">Aucun document. <a href="#/factures/new/${filter}">Créer ${filter === 'devis' ? 'un devis' : filter === 'avoir' ? 'un avoir' : 'une facture'}</a></div>`;
      $$('[data-id]', el).forEach((r) => (r.onclick = () => App.go('#/factures/' + r.dataset.id)));
      $$('.tabs button', el).forEach((b) => b.classList.toggle('active', b.dataset.t === filter));
    };
    el.innerHTML = head('Factures & devis', 'Numérotation automatique, mentions légales, suivi des paiements et relances.',
      `<a class="btn" href="#/factures/new/devis">+ Devis</a><a class="btn" href="#/factures/new/avoir">+ Avoir</a><a class="btn primary" href="#/factures/new/facture">+ Facture</a>`) +
      `<div class="card"><div class="tabs"><button data-t="facture">Factures</button><button data-t="devis">Devis</button><button data-t="avoir">Avoirs</button></div>
      <div class="toolbar"><input id="q" placeholder="Rechercher un numéro ou un client…" style="max-width:320px"><button class="btn sm" id="export">Exporter CSV</button></div><div id="list"></div></div>`;
    $$('.tabs button', el).forEach((b) => (b.onclick = () => { filter = b.dataset.t; sessionStorage.setItem('inv-filter', filter); draw(); }));
    $('#q', el).oninput = draw;
    $('#export', el).onclick = () => {
      const rows = [['Type', 'Numéro', 'Client', 'Date', 'Échéance', 'Statut', 'HT', 'TVA', 'TTC', 'Payée le']];
      App.state.invoices.forEach((i) => { const t = App.invoiceTotals(i); rows.push([i.type, i.number, clientName(i.clientId), i.date, i.dueDate, i.status, t.ht, t.tva, t.ttc, i.paidDate || '']); });
      App.download('factures.csv', App.toCSV(rows), 'text/csv');
    };
    draw();
  };

  function invoiceEditor(el, existing, type) {
    const s = App.state;
    const isNew = !existing;
    const inv = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: App.uid(), type, number: App.nextNumber(type), clientId: (s.clients[0] || {}).id || '', date: App.today(),
      dueDate: App.addDays(App.today(), s.settings.company.paymentTerms || 30), status: 'brouillon', paidDate: '', notes: '',
      revenueAccount: '706000',
      lines: [{ desc: '', qty: 1, unitPrice: 0, tvaRate: s.settings.company.regimeTva === 'franchise' ? 0 : 20, discount: 0 }],
    };
    const label = { facture: 'Facture', devis: 'Devis', avoir: 'Avoir' }[inv.type];
    const draw = () => {
      const t = App.invoiceTotals(inv);
      el.innerHTML = head(`${label} ${esc(inv.number)}`, isNew ? 'Nouveau document' : App.statusBadge(invStatus(inv)),
        `<a class="btn" href="#/factures">← Retour</a>${!isNew ? `<button class="btn danger" id="del">Supprimer</button>` : ''}
         ${inv.type === 'devis' && !isNew ? '<button class="btn" id="convert">Convertir en facture</button>' : ''}
         ${inv.type === 'facture' && !isNew ? '<button class="btn" id="credit">Créer un avoir</button>' : ''}
         ${!isNew && inv.type === 'facture' && invStatus(inv) === 'retard' ? '<button class="btn" id="remind">Relance</button>' : ''}
         <button class="btn" id="preview">Aperçu / PDF</button><button class="btn primary" id="save">Enregistrer</button>`) +
        `<div class="card"><div class="form-grid">
          <label class="field">Client <select id="client">${App.options([['', '— Choisir —'], ...s.clients.map((c) => [c.id, c.name])], inv.clientId)}<option value="__new">+ Nouveau client…</option></select></label>
          <label class="field">Numéro <input id="number" value="${esc(inv.number)}"></label>
          <label class="field">Date <input type="date" id="date" value="${inv.date}"></label>
          <label class="field">${inv.type === 'devis' ? 'Valide jusqu\'au' : 'Échéance'} <input type="date" id="due" value="${inv.dueDate || ''}"></label>
          <label class="field">Statut <select id="status">${App.options(inv.type === 'devis' ? [['brouillon', 'Brouillon'], ['envoyee', 'Envoyé'], ['accepte', 'Accepté'], ['refuse', 'Refusé']] : [['brouillon', 'Brouillon (non comptabilisé)'], ['envoyee', 'Émise / envoyée'], ['payee', 'Payée'], ['annulee', 'Annulée']], inv.status)}</select></label>
          <label class="field">Payée le <input type="date" id="paid" value="${inv.paidDate || ''}" ${inv.status === 'payee' ? '' : 'disabled'}></label>
          <label class="field">Compte de produit <select id="rev">${App.options([['706000', '706 Prestations de services'], ['707000', '707 Ventes de marchandises'], ['708000', '708 Activités annexes']], inv.revenueAccount || '706000')}</select></label>
        </div></div>
        <div class="card"><h2>Lignes</h2><div class="table-wrap"><table class="lines-table"><thead><tr><th style="min-width:220px">Désignation</th><th style="width:80px">Qté</th><th style="width:120px">Prix unit. HT</th><th style="width:80px">Remise %</th><th style="width:90px">TVA</th><th class="num" style="width:110px">Total HT</th><th></th></tr></thead><tbody>
          ${inv.lines.map((l, k) => `<tr data-k="${k}"><td><input data-f="desc" value="${esc(l.desc)}" placeholder="Description de la prestation"></td><td><input type="number" step="any" data-f="qty" value="${l.qty}"></td><td><input type="number" step="any" data-f="unitPrice" value="${l.unitPrice}"></td><td><input type="number" step="any" data-f="discount" value="${l.discount || 0}"></td><td><select data-f="tvaRate">${App.tvaOptions(l.tvaRate)}</select></td><td class="num">${eur(round2(l.qty * l.unitPrice * (1 - (l.discount || 0) / 100)))}</td><td><button class="btn ghost sm" data-rm="${k}" aria-label="Supprimer la ligne">✕</button></td></tr>`).join('')}
        </tbody></table></div>
        <div class="toolbar" style="margin-top:10px"><button class="btn sm" id="add">+ Ajouter une ligne</button></div>
        <div style="display:flex;justify-content:flex-end"><table style="width:300px"><tbody>
          <tr><td>Total HT</td><td class="num">${eur(t.ht)}</td></tr>
          ${Object.entries(t.byRate).map(([r, v]) => `<tr class="sub"><td>TVA ${r} %</td><td class="num">${eur(v.tva * t.sign)}</td></tr>`).join('')}
          <tr class="total"><td>Total TTC</td><td class="num">${eur(t.ttc)}</td></tr></tbody></table></div></div>
        <div class="card"><label class="field">Notes / conditions <textarea id="notes" placeholder="Conditions particulières, référence de commande…">${esc(inv.notes || '')}</textarea></label></div>`;
      bind();
    };
    const sync = () => {
      inv.clientId = $('#client', el).value; inv.number = $('#number', el).value; inv.date = $('#date', el).value;
      inv.dueDate = $('#due', el).value; inv.status = $('#status', el).value; inv.paidDate = $('#paid', el).value;
      inv.notes = $('#notes', el).value; inv.revenueAccount = $('#rev', el).value;
      $$('tr[data-k]', el).forEach((tr) => {
        const l = inv.lines[tr.dataset.k];
        $$('[data-f]', tr).forEach((i) => (l[i.dataset.f] = i.dataset.f === 'desc' ? i.value : Number(i.value) || 0));
      });
    };
    const bind = () => {
      $$('input, select, textarea', el).forEach((i) => i.addEventListener('change', () => {
        sync();
        if (i.id === 'client' && i.value === '__new') return App.editClient(null, (c) => { inv.clientId = c.id; draw(); });
        if (i.id === 'status' && inv.status === 'payee' && !inv.paidDate) inv.paidDate = App.today();
        if (i.id === 'date' && inv.type !== 'devis') inv.dueDate = App.addDays(inv.date, s.settings.company.paymentTerms || 30);
        draw();
      }));
      $('#add', el).onclick = () => { sync(); inv.lines.push({ desc: '', qty: 1, unitPrice: 0, tvaRate: inv.lines.at(-1)?.tvaRate ?? 20, discount: 0 }); draw(); };
      $$('[data-rm]', el).forEach((b) => (b.onclick = () => { sync(); inv.lines.splice(Number(b.dataset.rm), 1); if (!inv.lines.length) inv.lines.push({ desc: '', qty: 1, unitPrice: 0, tvaRate: 20 }); draw(); }));
      $('#save', el).onclick = () => {
        sync();
        if (!inv.clientId || inv.clientId === '__new') return App.toast('Choisissez un client', 'error');
        if (s.invoices.some((x) => x.number === inv.number && x.id !== inv.id)) return App.toast('Ce numéro existe déjà', 'error');
        const idx = s.invoices.findIndex((x) => x.id === inv.id);
        if (idx >= 0) s.invoices[idx] = inv; else s.invoices.push(inv);
        App.save(); App.toast('Document enregistré', 'success'); App.go('#/factures');
      };
      $('#preview', el).onclick = () => { sync(); previewInvoice(inv); };
      const del = $('#del', el);
      if (del) del.onclick = () => App.confirmBox(inv.status !== 'brouillon' && inv.type === 'facture' ? 'Attention : une facture émise ne devrait pas être supprimée (obligation de numérotation continue). Préférez un avoir. Supprimer quand même ?' : 'Supprimer ce document ?', () => {
        s.invoices = s.invoices.filter((x) => x.id !== inv.id); App.save(); App.go('#/factures');
      }, 'Supprimer');
      const conv = $('#convert', el);
      if (conv) conv.onclick = () => {
        const f = Object.assign(JSON.parse(JSON.stringify(inv)), { id: App.uid(), type: 'facture', number: App.nextNumber('facture'), date: App.today(), dueDate: App.addDays(App.today(), s.settings.company.paymentTerms || 30), status: 'brouillon', quoteRef: inv.number });
        const q = s.invoices.find((x) => x.id === inv.id); if (q) q.status = 'accepte';
        s.invoices.push(f); App.save(); App.toast('Facture créée depuis le devis', 'success'); App.go('#/factures/' + f.id);
      };
      const cr = $('#credit', el);
      if (cr) cr.onclick = () => {
        const a = Object.assign(JSON.parse(JSON.stringify(inv)), { id: App.uid(), type: 'avoir', number: App.nextNumber('avoir'), date: App.today(), status: 'envoyee', paidDate: '', notes: `Avoir sur facture ${inv.number}` });
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
    const title = { facture: 'FACTURE', devis: 'DEVIS', avoir: 'AVOIR' }[inv.type];
    return `<div class="invoice-paper">
      <div class="inv-head"><div><h1>${title}</h1><div>N° <strong>${esc(inv.number)}</strong></div><div>Date : ${fdate(inv.date)}</div>${inv.dueDate ? `<div>${inv.type === 'devis' ? 'Validité' : 'Échéance'} : ${fdate(inv.dueDate)}</div>` : ''}</div>
      <div style="text-align:right"><strong>${esc(c.name)}</strong> ${esc(c.legalForm)}<br>${esc(c.address).replace(/\n/g, '<br>')}<br>${c.siret ? 'SIRET ' + esc(c.siret) + '<br>' : ''}${c.tvaNumber ? 'TVA ' + esc(c.tvaNumber) + '<br>' : ''}${esc(c.email)}</div></div>
      <div style="margin-bottom:24px"><div style="color:#666;font-size:11px">FACTURÉ À</div><strong>${esc(cl.name)}</strong><br>${esc(cl.address || '').replace(/\n/g, '<br>')}${cl.tvaNumber ? '<br>TVA ' + esc(cl.tvaNumber) : ''}${cl.siret ? '<br>SIRET ' + esc(cl.siret) : ''}</div>
      <table><thead><tr><th>Désignation</th><th class="num">Qté</th><th class="num">P.U. HT</th><th class="num">TVA</th><th class="num">Total HT</th></tr></thead><tbody>
      ${inv.lines.map((l) => `<tr><td>${esc(l.desc)}${l.discount ? ` <em>(remise ${l.discount} %)</em>` : ''}</td><td class="num">${l.qty}</td><td class="num">${eur(l.unitPrice)}</td><td class="num">${l.tvaRate} %</td><td class="num">${eur(round2(l.qty * l.unitPrice * (1 - (l.discount || 0) / 100)))}</td></tr>`).join('')}
      </tbody></table>
      <div class="totals"><div><span>Total HT</span><span>${eur(t.ht)}</span></div>
      ${Object.entries(t.byRate).filter(([r]) => Number(r)).map(([r, v]) => `<div><span>TVA ${r} %</span><span>${eur(v.tva * t.sign)}</span></div>`).join('')}
      <div class="grand"><span>Total TTC</span><span>${eur(t.ttc)}</span></div></div>
      ${inv.notes ? `<p style="margin-top:20px">${esc(inv.notes)}</p>` : ''}
      <div class="legal">${App.state.settings.company.regimeTva === 'franchise' ? 'TVA non applicable, art. 293 B du CGI.\n' : ''}${inv.type === 'facture' ? `Conditions de paiement : ${c.paymentTerms} jours. ${c.iban ? 'IBAN : ' + esc(c.iban) + (c.bic ? ' — BIC : ' + esc(c.bic) : '') : ''}\n${esc(c.legalMentions)}` : ''}${inv.type === 'devis' ? 'Bon pour accord — date et signature :' : ''}</div>
    </div>`;
  }

  function previewInvoice(inv) {
    App.modal({
      title: 'Aperçu', wide: true, body: invoiceHTML(inv),
      footer: `<button class="btn" data-close>Fermer</button><button class="btn" id="mail">Envoyer par e-mail</button><button class="btn primary" id="print">${App.isArtifact ? 'Télécharger (à imprimer en PDF)' : 'Imprimer / PDF'}</button>`,
      onMount: (m) => {
        $('#print', m).onclick = () => { if (App.isArtifact) return App.download(`${inv.number}.html`, `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(inv.number)}</title><style>body{font-family:Arial,sans-serif;margin:30px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #eee;text-align:left}.num{text-align:right}.inv-head{display:flex;justify-content:space-between;margin-bottom:30px}h1{color:#2f5bea}.totals{margin-left:auto;width:280px;margin-top:16px}.totals div{display:flex;justify-content:space-between;padding:4px 0}.grand{font-weight:700;border-top:2px solid #111}.legal{margin-top:30px;font-size:11px;color:#666;white-space:pre-line}</style></head><body>${invoiceHTML(inv)}<script>window.print()<\/script></body></html>`); document.body.classList.add('printing-modal'); window.print(); setTimeout(() => document.body.classList.remove('printing-modal'), 500); };
        $('#mail', m).onclick = () => {
          const cl = App.state.clients.find((x) => x.id === inv.clientId) || {};
          const t = App.invoiceTotals(inv);
          location.href = `mailto:${encodeURIComponent(cl.email || '')}?subject=${encodeURIComponent(`${inv.type === 'devis' ? 'Devis' : 'Facture'} ${inv.number} — ${App.state.settings.company.name}`)}&body=${encodeURIComponent(`Bonjour,\n\nVeuillez trouver ci-joint ${inv.type === 'devis' ? 'notre devis' : 'notre facture'} ${inv.number} d'un montant de ${eur(t.ttc)} TTC.\n\nCordialement,\n${App.state.settings.company.name}`)}`;
        };
      },
    });
  }

  function reminder(inv) {
    const cl = App.state.clients.find((x) => x.id === inv.clientId) || {};
    const t = App.invoiceTotals(inv);
    const days = Math.round((new Date(App.today()) - new Date(inv.dueDate)) / 86400000);
    const txt = `Bonjour,\n\nSauf erreur de notre part, la facture ${inv.number} du ${fdate(inv.date)}, d'un montant de ${eur(t.ttc)} TTC, arrivée à échéance le ${fdate(inv.dueDate)} (il y a ${days} jours), reste impayée.\n\nNous vous remercions de bien vouloir procéder à son règlement dans les meilleurs délais${App.state.settings.company.iban ? ' (IBAN : ' + App.state.settings.company.iban + ')' : ''}.\n\nNous vous rappelons que tout retard de paiement entraîne l'application de pénalités ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement.\n\nCordialement,\n${App.state.settings.company.name}`;
    App.modal({
      title: 'Relance de paiement', body: `<textarea id="rt" style="min-height:260px">${esc(txt)}</textarea>`,
      footer: `<button class="btn" data-close>Fermer</button><button class="btn primary" id="send">Ouvrir dans la messagerie</button>`,
      onMount: (m) => ($('#send', m).onclick = () => (location.href = `mailto:${encodeURIComponent(cl.email || '')}?subject=${encodeURIComponent('Relance — facture ' + inv.number)}&body=${encodeURIComponent($('#rt', m).value)}`)),
    });
  }

  /* ============ CLIENTS ============ */
  App.editClient = (client, onSaved) => {
    const c = client || { id: App.uid(), name: '', email: '', address: '', siret: '', tvaNumber: '', phone: '' };
    App.modal({
      title: client ? 'Modifier le client' : 'Nouveau client',
      body: `<form class="form-grid" id="cf">
        <label class="field full">Nom / raison sociale <input name="name" value="${esc(c.name)}" required></label>
        <label class="field">E-mail <input name="email" type="email" value="${esc(c.email)}"></label>
        <label class="field">Téléphone <input name="phone" value="${esc(c.phone || '')}"></label>
        <label class="field">SIRET <input name="siret" value="${esc(c.siret)}"></label>
        <label class="field">N° TVA intracom. <input name="tvaNumber" value="${esc(c.tvaNumber)}"></label>
        <label class="field full">Adresse <textarea name="address">${esc(c.address)}</textarea></label></form>`,
      footer: `<button class="btn" data-close>Annuler</button><button class="btn primary" id="ok">Enregistrer</button>`,
      onMount: (m, close) => ($('#ok', m).onclick = () => {
        const d = App.formData($('#cf', m));
        if (!d.name.trim()) return App.toast('Le nom est obligatoire', 'error');
        Object.assign(c, d);
        if (!App.state.clients.includes(c)) App.state.clients.push(c);
        App.save(); close(); onSaved ? onSaved(c) : App.render();
      }),
    });
  };

  V.clients = (el) => {
    const s = App.state;
    const stats = (id) => {
      const inv = s.invoices.filter((i) => i.clientId === id && i.type !== 'devis' && i.status !== 'brouillon');
      return { ca: round2(inv.reduce((x, i) => x + App.invoiceTotals(i).ht, 0)), du: round2(inv.filter((i) => i.status === 'envoyee').reduce((x, i) => x + App.invoiceTotals(i).ttc, 0)), n: inv.length };
    };
    el.innerHTML = head('Clients', `${s.clients.length} client(s)`, '<button class="btn primary" id="new">+ Client</button>') +
      `<div class="card">${s.clients.length ? `<div class="table-wrap"><table><thead><tr><th>Client</th><th>E-mail</th><th>N° TVA</th><th class="num">Factures</th><th class="num">CA HT</th><th class="num">Reste dû</th><th></th></tr></thead><tbody>
      ${s.clients.map((c) => { const st = stats(c.id); return `<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.email)}</td><td>${esc(c.tvaNumber)}</td><td class="num">${st.n}</td><td class="num">${eur(st.ca)}</td><td class="num ${st.du ? 'neg' : ''}">${eur(st.du)}</td><td class="num"><button class="btn sm" data-edit="${c.id}">Modifier</button> <button class="btn sm danger" data-del="${c.id}">✕</button></td></tr>`; }).join('')}
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
    const e = exp ? JSON.parse(JSON.stringify(exp)) : Object.assign({ id: App.uid(), date: App.today(), supplier: '', account: '606400', description: '', ht: 0, tvaRate: 20, tva: 0, ttc: 0, paid: true, paidDate: '', paymentMethod: 'carte', receipt: '' }, prefill || {});
    App.modal({
      title: exp ? 'Modifier la dépense' : 'Nouvelle dépense',
      body: `<form class="form-grid" id="ef">
        <label class="field">Date <input type="date" name="date" value="${e.date}"></label>
        <label class="field">Fournisseur <input name="supplier" value="${esc(e.supplier)}" list="sup-list"><datalist id="sup-list">${[...new Set(s.expenses.map((x) => x.supplier))].map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label>
        <label class="field full">Catégorie (compte PCG) <select name="account">${App.options(App.EXPENSE_CATEGORIES.map((c) => [c.account, `${c.account} — ${c.label}`]), e.account)}</select></label>
        <label class="field full">Description <input name="description" value="${esc(e.description)}"></label>
        <label class="field">Montant TTC <input type="number" step="0.01" name="ttc" value="${e.ttc}"></label>
        <label class="field">Taux TVA <select name="tvaRate">${App.tvaOptions(e.tvaRate)}</select></label>
        <label class="field">Montant HT <input type="number" step="0.01" name="ht" value="${e.ht}"></label>
        <label class="field">TVA déductible <input type="number" step="0.01" name="tva" value="${e.tva}"></label>
        <label class="field">Moyen de paiement <select name="paymentMethod">${App.options([['carte', 'Carte'], ['virement', 'Virement'], ['prelevement', 'Prélèvement'], ['cheque', 'Chèque'], ['especes', 'Espèces']], e.paymentMethod)}</select></label>
        <label class="field">Payée le <input type="date" name="paidDate" value="${e.paidDate || ''}"></label>
        <label class="check full"><input type="checkbox" name="paid" ${e.paid ? 'checked' : ''}> Dépense déjà payée</label>
        <label class="field full">Justificatif (photo ou PDF) <input type="file" id="rcpt" accept="image/*,application/pdf" capture="environment"></label>
        ${e.receipt ? `<div class="full"><img src="${e.receipt}" style="max-width:180px;border-radius:8px;border:1px solid var(--border)" alt="Justificatif"></div>` : ''}
        <div class="full alert small" id="ai-hint" ${App.ai.isReady() ? '' : 'hidden'}>✦ Ajoutez un justificatif puis cliquez sur « Remplir avec l'IA » pour extraire automatiquement les montants.</div>
      </form>`,
      footer: `${exp ? '<button class="btn danger" id="del">Supprimer</button>' : ''}<button class="btn" id="ai-fill" ${App.ai.isReady() ? '' : 'hidden'}>✦ Remplir avec l'IA</button><button class="btn" data-close>Annuler</button><button class="btn primary" id="ok">Enregistrer</button>`,
      onMount: (m, close) => {
        const f = $('#ef', m);
        const recalc = (src) => {
          const rate = Number(f.tvaRate.value) || 0;
          if (src === 'ht') { f.tva.value = round2(f.ht.value * rate / 100); f.ttc.value = round2(Number(f.ht.value) + Number(f.tva.value)); }
          else if (src !== 'tva') { f.ht.value = round2(f.ttc.value / (1 + rate / 100)); f.tva.value = round2(f.ttc.value - f.ht.value); }
          else f.ht.value = round2(f.ttc.value - f.tva.value);
        };
        f.ttc.oninput = () => recalc('ttc'); f.tvaRate.onchange = () => recalc('ttc'); f.ht.oninput = () => recalc('ht'); f.tva.oninput = () => recalc('tva');
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
            f.tvaRate.value = App.TVA_RATES.includes(Number(r.tva_rate)) ? r.tva_rate : 20;
            f.ttc.value = r.total_ttc; f.ht.value = r.total_ht; f.tva.value = r.total_tva;
            if (['carte', 'virement', 'prelevement', 'cheque', 'especes'].includes(r.payment_method)) f.paymentMethod.value = r.payment_method;
            $('#ai-hint', m).hidden = false;
            $('#ai-hint', m).innerHTML = `✦ Extraction terminée (confiance ${Math.round((r.confidence || 0) * 100)} %). ${esc(r.remarks || '')}${r.is_asset ? '<br><strong>Ce bien semble être une immobilisation</strong> : enregistrez-le plutôt dans Immobilisations pour l\'amortir.' : ''}`;
          } catch (err) { App.toast(err.message, 'error'); }
          btn.disabled = false; btn.textContent = '✦ Remplir avec l\'IA';
        };
        $('#ok', m).onclick = () => {
          const d = App.formData(f);
          Object.assign(e, d);
          e.ht = round2(e.ht); e.tva = round2(e.tva); e.ttc = round2(e.ttc);
          if (!e.ttc) return App.toast('Indiquez un montant', 'error');
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
      $('#list', el).innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th></th><th>Date</th><th>Fournisseur</th><th>Catégorie</th><th>Statut</th><th class="num">HT</th><th class="num">TVA</th><th class="num">TTC</th></tr></thead><tbody>
        ${list.map((e) => `<tr class="clickable" data-id="${e.id}"><td>${e.receipt ? `<img class="receipt-thumb" src="${e.receipt}" alt="">` : '<span class="badge warning" title="Justificatif manquant">!</span>'}</td><td>${fdate(e.date)}</td><td><strong>${esc(e.supplier)}</strong><div class="small muted">${esc(e.description)}</div></td><td>${esc(App.accountLabel(e.account))}</td><td>${e.paid ? '<span class="badge success">Payée</span>' : '<span class="badge warning">À payer</span>'}</td><td class="num">${eur(e.ht)}</td><td class="num">${eur(e.tva)}</td><td class="num">${eur(e.ttc)}</td></tr>`).join('')}
        <tr class="total"><td colspan="5">Total (${list.length})</td><td class="num">${eur(tot.ht)}</td><td class="num">${eur(tot.tva)}</td><td class="num">${eur(tot.ttc)}</td></tr></tbody></table></div>`
        : '<div class="empty">Aucune dépense sur cette période.</div>';
      $$('[data-id]', el).forEach((r) => (r.onclick = () => App.editExpense(s.expenses.find((e) => e.id === r.dataset.id))));
    };
    el.innerHTML = head('Dépenses', 'Achats, frais généraux et notes de frais, avec justificatifs et TVA déductible.',
      `<select id="year">${App.yearOptions(y)}</select><a class="btn" href="#/ia/scan">✦ Scanner des justificatifs</a><button class="btn" id="exp">Exporter CSV</button><button class="btn primary" id="new">+ Dépense</button>`) +
      `<div class="card"><div class="toolbar"><input id="q" placeholder="Rechercher…" style="max-width:260px"><select id="cat"><option value="">Toutes catégories</option>${App.options(App.EXPENSE_CATEGORIES.map((c) => [c.account, c.label]))}</select></div><div id="list"></div></div>`;
    $('#year', el).onchange = (e) => { selectedYear = Number(e.target.value); V.depenses(el, []); };
    $('#q', el).oninput = draw; $('#cat', el).onchange = draw;
    $('#new', el).onclick = () => App.editExpense(null);
    $('#exp', el).onclick = () => App.download('depenses.csv', App.toCSV([['Date', 'Fournisseur', 'Description', 'Compte', 'Catégorie', 'HT', 'Taux TVA', 'TVA', 'TTC', 'Payée'], ...s.expenses.map((e) => [e.date, e.supplier, e.description, e.account, App.accountLabel(e.account), e.ht, e.tvaRate, e.tva, e.ttc, e.paid ? 'oui' : 'non'])]), 'text/csv');
    draw();
  };

  /* ============ BANQUE ============ */
  V.banque = (el) => {
    const s = App.state;
    const matchLabel = (b) => {
      const m = b.matched; if (!m) return '<span class="badge warning">À rapprocher</span>';
      if (m.type === 'invoice') { const i = s.invoices.find((x) => x.id === m.id); return `<span class="badge success">Facture ${esc(i ? i.number : '?')}</span>`; }
      if (m.type === 'expense') { const e = s.expenses.find((x) => x.id === m.id); return `<span class="badge success">Dépense ${esc(e ? e.supplier : '?')}</span>`; }
      return `<span class="badge primary">${esc(App.accountLabel(m.account))}${m.tvaRate ? ' · TVA ' + m.tvaRate + ' %' : ''}</span>`;
    };
    const list = [...s.bank].sort((a, b) => (a.date < b.date ? 1 : -1));
    const solde = App.trialBalance(null, App.today()).filter((a) => a.account === '512000').reduce((x, a) => x + a.solde, 0);
    const relevé = round2((Number(s.settings.opening.banque) || 0) + s.bank.reduce((x, b) => x + Number(b.amount), 0));
    el.innerHTML = head('Banque & rapprochement', 'Importez votre relevé (CSV), puis rapprochez chaque opération d\'une facture, d\'une dépense ou d\'une catégorie.',
      `<label class="btn">Importer un relevé CSV<input type="file" id="csv" accept=".csv,.txt,text/csv" hidden></label><button class="btn" id="add">+ Opération</button><button class="btn primary" id="ai" ${s.bank.some((b) => !b.matched) ? '' : 'disabled'}>✦ Trier avec l'IA</button>`) +
      `<div class="grid grid-3"><div class="card kpi"><div class="label">Solde comptable 512</div><div class="value">${eur(solde)}</div><div class="sub">Calculé à partir des écritures</div></div>
       <div class="card kpi"><div class="label">Opérations à rapprocher</div><div class="value">${s.bank.filter((b) => !b.matched).length}</div><div class="sub">sur ${s.bank.length} importée(s)</div></div>
       <div class="card kpi"><div class="label">Solde d'ouverture + relevés importés</div><div class="value">${eur(relevé)}</div><div class="sub">À comparer avec votre banque</div></div></div>
       <div class="card" style="margin-top:16px">${list.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th class="num">Montant</th><th>Rapprochement</th><th></th></tr></thead><tbody>
       ${list.map((b) => `<tr><td>${fdate(b.date)}</td><td>${esc(b.label)}${b.aiReason ? `<div class="small muted">✦ ${esc(b.aiReason)}</div>` : ''}</td><td class="num ${b.amount < 0 ? 'neg' : 'pos'}">${eur(b.amount)}</td><td>${matchLabel(b)}</td><td class="num"><button class="btn sm" data-m="${b.id}">${b.matched ? 'Modifier' : 'Rapprocher'}</button> <button class="btn sm danger" data-d="${b.id}" aria-label="Supprimer">✕</button></td></tr>`).join('')}
       </tbody></table></div>` : '<div class="empty">Aucune opération. Importez un relevé CSV exporté depuis votre banque (colonnes date, libellé, montant ou débit/crédit).</div>'}</div>`;
    $('#csv', el).onchange = (e) => importCSV(e.target.files[0]);
    $('#add', el).onclick = () => matchModal({ id: App.uid(), date: App.today(), label: '', amount: 0, matched: null }, true);
    $$('[data-m]', el).forEach((b) => (b.onclick = () => matchModal(s.bank.find((x) => x.id === b.dataset.m))));
    $$('[data-d]', el).forEach((b) => (b.onclick = () => App.confirmBox('Supprimer cette opération ?', () => { unmatch(s.bank.find((x) => x.id === b.dataset.d)); s.bank = s.bank.filter((x) => x.id !== b.dataset.d); App.save(); App.render(); }, 'Supprimer')));
    $('#ai', el).onclick = async (ev) => {
      const btn = ev.currentTarget; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Tri en cours…';
      try {
        const todo = s.bank.filter((b) => !b.matched);
        const res = await App.ai.categorizeBank(todo);
        let n = 0;
        (res.results || []).forEach((r) => {
          const b = s.bank.find((x) => x.id === r.id); if (!b || b.matched) return;
          if (r.match_type === 'invoice' && s.invoices.some((i) => i.id === r.match_id)) applyMatch(b, { type: 'invoice', id: r.match_id });
          else if (r.match_type === 'expense' && s.expenses.some((i) => i.id === r.match_id)) applyMatch(b, { type: 'expense', id: r.match_id });
          else if (r.account) applyMatch(b, { type: 'category', account: r.account, tvaRate: Number(r.tva_rate) || 0 });
          b.aiReason = `${r.reason} (confiance ${Math.round((r.confidence || 0) * 100)} %)`; n++;
        });
        App.save(); App.toast(`${n} opération(s) classée(s) par l'IA — vérifiez-les`, 'success'); App.render();
      } catch (err) { App.toast(err.message, 'error'); btn.disabled = false; btn.textContent = '✦ Trier avec l\'IA'; }
    };
  };

  function unmatch(b) {
    if (!b || !b.matched) return;
    const s = App.state, m = b.matched;
    if (m.type === 'invoice') { const i = s.invoices.find((x) => x.id === m.id); if (i && i.status === 'payee') { i.status = 'envoyee'; i.paidDate = ''; } }
    if (m.type === 'expense') { const e = s.expenses.find((x) => x.id === m.id); if (e) { e.paid = false; e.paidDate = ''; } }
    b.matched = null;
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
    const openInv = s.invoices.filter((i) => i.type !== 'devis' && i.status !== 'brouillon' && (i.status !== 'payee' || (b.matched && b.matched.id === i.id)));
    const unpaidExp = s.expenses.filter((e) => !e.paid || (b.matched && b.matched.id === e.id));
    const best = (arr, amt) => arr.slice().sort((a, c) => Math.abs(Math.abs(amt) - Math.abs(a.v)) - Math.abs(Math.abs(amt) - Math.abs(c.v)));
    const invOpts = best(openInv.map((i) => ({ id: i.id, v: App.invoiceTotals(i).ttc, l: `${i.number} — ${clientName(i.clientId)} — ${eur(App.invoiceTotals(i).ttc)}` })), b.amount);
    const expOpts = best(unpaidExp.map((e) => ({ id: e.id, v: e.ttc, l: `${fdate(e.date)} ${e.supplier} — ${eur(e.ttc)}` })), b.amount);
    const cats = [...App.EXPENSE_CATEGORIES.map((c) => [c.account, `${c.account} — ${c.label}`]), ['706000', '706000 — Prestations de services'], ['707000', '707000 — Ventes de marchandises'], ['758000', '758000 — Produits divers'], ['768000', '768000 — Produits financiers'], ['108000', '108000 — Apport / prélèvement exploitant'], ['455000', '455000 — Compte courant d\'associé'], ['164000', '164000 — Remboursement d\'emprunt'], ['445510', '445510 — Paiement de TVA'], ['444000', '444000 — Paiement de l\'IS'], ['431000', '431000 — URSSAF'], ['421000', '421000 — Salaires nets'], ['471000', '471000 — Compte d\'attente']];
    const m = b.matched || {};
    App.modal({
      title: isNew ? 'Nouvelle opération' : 'Rapprocher l\'opération',
      body: `<form class="form-grid" id="bf">
        <label class="field">Date <input type="date" name="date" value="${b.date}"></label>
        <label class="field">Montant (− débit / + crédit) <input type="number" step="0.01" name="amount" value="${b.amount}"></label>
        <label class="field full">Libellé <input name="label" value="${esc(b.label)}"></label>
        <label class="field full">Type de rapprochement <select name="type">${App.options([['', '— Non rapprochée —'], ['invoice', 'Règlement d\'une facture client'], ['expense', 'Paiement d\'une dépense saisie'], ['category', 'Catégoriser directement'], ['newexp', 'Créer une dépense à partir de l\'opération']], m.type || (b.amount > 0 && invOpts.length ? 'invoice' : b.amount < 0 && expOpts.length ? 'expense' : 'category'))}</select></label>
        <label class="field full" data-show="invoice">Facture <select name="invoice">${App.options(invOpts.map((o) => [o.id, o.l]), m.id)}</select></label>
        <label class="field full" data-show="expense">Dépense <select name="expense">${App.options(expOpts.map((o) => [o.id, o.l]), m.id)}</select></label>
        <label class="field" data-show="category">Compte <select name="account">${App.options(cats, m.account || (b.amount > 0 ? '706000' : '471000'))}</select></label>
        <label class="field" data-show="category">TVA incluse <select name="tvaRate">${App.tvaOptions(m.tvaRate ?? 0)}</select></label>
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
            return App.editExpense(null, { date: b.date, supplier: b.label, ttc: Math.abs(b.amount), ht: round2(Math.abs(b.amount) / 1.2), tva: round2(Math.abs(b.amount) - Math.abs(b.amount) / 1.2), paid: true, paidDate: b.date, _bank: b.id });
          }
          if (!d.type) unmatch(b);
          else if (d.type === 'invoice' && d.invoice) applyMatch(b, { type: 'invoice', id: d.invoice });
          else if (d.type === 'expense' && d.expense) applyMatch(b, { type: 'expense', id: d.expense });
          else if (d.type === 'category') applyMatch(b, { type: 'category', account: d.account, tvaRate: Number(d.tvaRate) || 0 });
          App.save(); close(); App.render();
        };
      },
    });
  }

  function importCSV(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const rows = App.parseCSV(String(r.result));
      if (rows.length < 2) return App.toast('Fichier vide ou illisible', 'error');
      const header = rows[0].map((h) => h.toLowerCase());
      const find = (...keys) => header.findIndex((h) => keys.some((k) => h.includes(k)));
      let iDate = find('date'), iLabel = find('libell', 'label', 'description', 'intitul', 'détail', 'detail'), iAmount = find('montant', 'amount', 'valeur');
      const iDebit = find('débit', 'debit'), iCredit = find('crédit', 'credit');
      if (iDate < 0) iDate = 0; if (iLabel < 0) iLabel = 1;
      let n = 0, dup = 0;
      rows.slice(1).forEach((row) => {
        const date = App.parseDate(row[iDate]); if (!date) return;
        let amount = iAmount >= 0 ? App.parseAmount(row[iAmount]) : App.parseAmount(row[iCredit]) - Math.abs(App.parseAmount(row[iDebit]));
        if (iAmount < 0 && iDebit < 0) amount = App.parseAmount(row[2]);
        const label = (row[iLabel] || '').trim();
        if (App.state.bank.some((b) => b.date === date && b.label === label && b.amount === round2(amount))) { dup++; return; }
        App.state.bank.push({ id: App.uid(), date, label, amount: round2(amount), matched: null }); n++;
      });
      App.save(); App.toast(`${n} opération(s) importée(s)${dup ? `, ${dup} doublon(s) ignoré(s)` : ''}`, 'success'); App.render();
    };
    r.readAsText(file, 'utf-8');
  }

  /* ============ IMMOBILISATIONS ============ */
  V.immobilisations = (el) => {
    const s = App.state;
    const y = selectedYear;
    el.innerHTML = head('Immobilisations & amortissements', 'Biens durables de plus de 500 € HT, amortis en linéaire prorata temporis. Les dotations sont passées automatiquement à chaque clôture.',
      '<button class="btn primary" id="new">+ Immobilisation</button>') +
      `<div class="card">${s.assets.length ? `<div class="table-wrap"><table><thead><tr><th>Bien</th><th>Compte</th><th>Mise en service</th><th class="num">Durée</th><th class="num">Valeur HT</th><th class="num">Dotation ${y}</th><th class="num">Amort. cumulés</th><th class="num">VNC fin ${y}</th><th></th></tr></thead><tbody>
      ${s.assets.map((a) => { const sch = App.depreciationSchedule(a); const row = sch.find((r) => r.year === y); const last = sch.filter((r) => r.year <= y).pop(); return `<tr><td><strong>${esc(a.label)}</strong><div class="small muted">${esc(a.supplier || '')}</div></td><td>${a.account}</td><td>${fdate(a.date)}</td><td class="num">${a.duration} ans</td><td class="num">${eur(a.value)}</td><td class="num">${eur(row ? row.dotation : 0)}</td><td class="num">${eur(last ? last.cumul : 0)}</td><td class="num">${eur(last ? last.vnc : a.value)}</td><td class="num"><button class="btn sm" data-plan="${a.id}">Plan</button> <button class="btn sm" data-e="${a.id}">Modifier</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="empty">Aucune immobilisation.</div>'}</div>`;
    $('#new', el).onclick = () => editAsset(null);
    $$('[data-e]', el).forEach((b) => (b.onclick = () => editAsset(s.assets.find((a) => a.id === b.dataset.e))));
    $$('[data-plan]', el).forEach((b) => (b.onclick = () => {
      const a = s.assets.find((x) => x.id === b.dataset.plan);
      App.modal({ title: 'Plan d\'amortissement — ' + esc(a.label), body: `<table><thead><tr><th>Exercice</th><th class="num">Dotation</th><th class="num">Cumul</th><th class="num">VNC</th></tr></thead><tbody>${App.depreciationSchedule(a).map((r) => `<tr><td>${r.year}</td><td class="num">${eur(r.dotation)}</td><td class="num">${eur(r.cumul)}</td><td class="num">${eur(r.vnc)}</td></tr>`).join('')}</tbody></table>`, footer: '<button class="btn" data-close>Fermer</button>' });
    }));
  };

  function editAsset(asset) {
    const s = App.state;
    const a = asset ? JSON.parse(JSON.stringify(asset)) : { id: App.uid(), label: '', account: '218300', date: App.today(), value: 0, tvaRate: 20, duration: 3, supplier: '', paid: true };
    App.modal({
      title: asset ? 'Modifier l\'immobilisation' : 'Nouvelle immobilisation',
      body: `<form class="form-grid" id="af">
        <label class="field full">Désignation <input name="label" value="${esc(a.label)}"></label>
        <label class="field full">Catégorie <select name="account">${App.options(App.ASSET_CATEGORIES.map((c) => [c.account, `${c.account} — ${c.label} (${c.duration} ans usuels)`]), a.account)}</select></label>
        <label class="field">Date de mise en service <input type="date" name="date" value="${a.date}"></label>
        <label class="field">Fournisseur <input name="supplier" value="${esc(a.supplier || '')}"></label>
        <label class="field">Valeur HT <input type="number" step="0.01" name="value" value="${a.value}"></label>
        <label class="field">TVA <select name="tvaRate">${App.tvaOptions(a.tvaRate)}</select></label>
        <label class="field">Durée (années) <input type="number" min="1" name="duration" value="${a.duration}"></label>
        <label class="check"><input type="checkbox" name="paid" ${a.paid !== false ? 'checked' : ''}> Payée</label>
      </form>`,
      footer: `${asset ? '<button class="btn danger" id="del">Supprimer</button>' : ''}<button class="btn" data-close>Annuler</button><button class="btn primary" id="ok">Enregistrer</button>`,
      onMount: (m, close) => {
        const f = $('#af', m);
        f.account.onchange = () => { const c = App.ASSET_CATEGORIES.find((x) => x.account === f.account.value); if (c) f.duration.value = c.duration; };
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
