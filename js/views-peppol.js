/* ComptaPro Belgique — Peppol : envoi (contrôle, export UBL, suivi), réception (import UBL → dépenses), mise en route */
(function (App) {
  const { $, $$, esc, eur, fdate, round2, head } = App;
  const V = App.views;

  const clientOf = (inv) => App.state.clients.find((c) => c.id === inv.clientId) || {};
  const isB2B = (inv) => !!App.vatParse(clientOf(inv).vatNumber).valid;
  /* Factures B2B émises pas encore transmises par Peppol */
  App.peppolToSend = () => App.state.invoices.filter((i) => ['facture', 'avoir'].includes(i.type) && !['brouillon', 'annulee'].includes(i.status) && isB2B(i) && i.peppolStatus !== 'envoyee');

  function markInvoice(inv, status) {
    const stored = App.state.invoices.find((x) => x.id === inv.id);
    [inv, stored].filter(Boolean).forEach((x) => { x.peppolStatus = status; x[status === 'envoyee' ? 'peppolSentAt' : 'peppolExportedAt'] = App.today(); });
    App.save();
  }

  /* Export UBL après contrôle */
  App.peppolExport = (inv, silent) => {
    const chk = App.peppolCheck(inv);
    const go = () => { App.download(`${inv.number}.xml`, App.peppolUbl(inv)); if (inv.peppolStatus !== 'envoyee') markInvoice(inv, 'exportee'); if (!silent) App.render(); };
    if (chk.ok && !chk.warnings.length) return go();
    App.modal({
      title: `Contrôle Peppol — ${esc(inv.number)}`,
      body: `${chk.errors.length ? `<div class="alert danger"><strong>À corriger avant l'envoi :</strong><ul>${chk.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}${chk.warnings.length ? `<div class="alert warning"><ul>${chk.warnings.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}`,
      footer: `<button class="btn" data-close>Fermer</button>${chk.ok ? '<button class="btn primary" id="anyway">Exporter quand même</button>' : ''}`,
      onMount: (m, close) => { const a = $('#anyway', m); if (a) a.onclick = () => { close(); go(); }; },
    });
  };

  V.peppol = (el, params) => {
    const s = App.state, c = s.settings.company;
    let tab = params[0] || 'envoi';
    try { if (!params[0]) tab = sessionStorage.getItem('pp-tab') || (s.invoices.length ? 'envoi' : 'guide'); } catch (e) { /* ignore */ }
    const myId = App.bceValid(c.enterpriseNumber) ? `0208:${App.digits(c.enterpriseNumber).padStart(10, '0')}` : '';
    el.innerHTML = head('Peppol — factures électroniques', 'Obligatoires entre entreprises belges depuis le 1er janvier 2026 : vos factures sortantes partent en UBL via votre point d\'accès, vos factures fournisseurs reçues s\'importent ici et deviennent des dépenses automatiquement.') +
      `<div class="card"><div class="tabs"><button data-t="envoi">Envoi</button><button data-t="reception">Réception</button><button data-t="guide">Mise en route</button></div><div id="tc"></div></div>`;
    const draw = () => {
      $$('.tabs button', el).forEach((b) => b.classList.toggle('active', b.dataset.t === tab));
      ({ envoi: sendTab, reception: receiveTab, guide: guideTab })[tab]($('#tc', el), myId);
    };
    $$('.tabs button', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; try { sessionStorage.setItem('pp-tab', tab); } catch (e) { /* ignore */ } draw(); }));
    draw();
  };

  /* ---------- Envoi ---------- */
  function sendTab(tc) {
    const s = App.state;
    const docs = s.invoices.filter((i) => ['facture', 'avoir'].includes(i.type) && !['brouillon', 'annulee'].includes(i.status)).sort((a, b) => (a.date < b.date ? 1 : -1));
    const b2b = docs.filter(isB2B), b2c = docs.filter((i) => !isB2B(i));
    const pending = b2b.filter((i) => i.peppolStatus !== 'envoyee');
    const status = (i) => i.peppolStatus === 'envoyee' ? `<span class="badge success">Envoyée ${fdate(i.peppolSentAt)}</span>` : i.peppolStatus === 'exportee' ? `<span class="badge primary">XML prêt ${fdate(i.peppolExportedAt)}</span>` : '<span class="badge warning">À envoyer</span>';
    tc.innerHTML = `<div class="actions" style="margin-bottom:14px"><button class="btn primary" id="all" ${pending.length ? '' : 'disabled'}>Télécharger les ${pending.length} XML à envoyer</button><span class="small muted">Puis déposez-les dans votre point d'accès Peppol et marquez-les « envoyées ».</span></div>
      ${b2b.length ? `<div class="table-wrap"><table><thead><tr><th>Document</th><th>Client</th><th>Identifiant Peppol</th><th class="num">TVAC</th><th>Contrôle</th><th>Statut</th><th></th></tr></thead><tbody>
      ${b2b.map((i) => { const cl = clientOf(i); const chk = App.peppolCheck(i); const pid = App.peppolId(cl.vatNumber) || App.vatParse(cl.vatNumber).formatted; return `<tr><td><strong>${esc(i.number)}</strong><div class="small muted">${fdate(i.date)}${i.type === 'avoir' ? ' · note de crédit' : ''}</div></td><td>${esc(cl.name)}</td><td style="font-family:var(--mono);font-size:12px">${esc(pid)} <a class="small" href="${App.peppolDirectoryUrl(cl.vatNumber)}" target="_blank" rel="noopener" title="Vérifier dans l'annuaire Peppol">annuaire ↗</a></td><td class="num">${eur(App.invoiceTotals(i).ttc)}</td><td>${chk.ok ? (chk.warnings.length ? `<span class="badge warning" title="${esc(chk.warnings.join(' '))}">OK, ${chk.warnings.length} remarque(s)</span>` : '<span class="badge success">Conforme</span>') : `<span class="badge danger" title="${esc(chk.errors.join(' '))}">${chk.errors.length} erreur(s)</span>`}</td><td>${status(i)}</td><td class="num" style="white-space:nowrap"><button class="btn sm" data-x="${i.id}">XML</button> ${i.peppolStatus !== 'envoyee' ? `<button class="btn sm" data-sent="${i.id}">Marquer envoyée</button>` : `<button class="btn sm ghost" data-unsent="${i.id}">Annuler</button>`}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="empty">Aucune facture émise à un client assujetti pour l\'instant.</div>'}
      ${b2c.length ? `<p class="small muted" style="margin-top:12px">${b2c.length} facture(s) à des particuliers ou clients sans numéro de TVA : non concernées par Peppol (PDF classique).</p>` : ''}`;
    $$('[data-x]', tc).forEach((b) => (b.onclick = () => App.peppolExport(s.invoices.find((i) => i.id === b.dataset.x))));
    $$('[data-sent]', tc).forEach((b) => (b.onclick = () => { markInvoice(s.invoices.find((i) => i.id === b.dataset.sent), 'envoyee'); App.render(); }));
    $$('[data-unsent]', tc).forEach((b) => (b.onclick = () => { const i = s.invoices.find((x) => x.id === b.dataset.unsent); i.peppolStatus = 'exportee'; App.save(); App.render(); }));
    $('#all', tc).onclick = async () => {
      const bad = pending.filter((i) => !App.peppolCheck(i).ok);
      if (bad.length) App.toast(`${bad.length} facture(s) avec erreurs ignorée(s) : corrigez-les d'abord`, 'error');
      for (const i of pending.filter((x) => App.peppolCheck(x).ok)) { await App.download(`${i.number}.xml`, App.peppolUbl(i)); markInvoice(i, i.peppolStatus === 'envoyee' ? 'envoyee' : 'exportee'); }
      App.render();
    };
  }

  /* ---------- Réception ---------- */
  function receiveTab(tc) {
    const s = App.state;
    const received = s.expenses.filter((e) => e.source === 'peppol').sort((a, b) => (a.date < b.date ? 1 : -1));
    tc.innerHTML = `<label class="dropzone" id="dz"><input type="file" id="ubl" accept=".xml,application/xml,text/xml" multiple hidden><div style="font-size:28px">⇩</div><strong>Déposez ici les factures reçues (XML UBL / Peppol)</strong><div class="small">Téléchargées depuis votre point d'accès Peppol ou reçues par e-mail — plusieurs fichiers à la fois</div></label>
      <p class="small muted">Chaque facture devient une dépense : fournisseur, numéro, montants, TVA par taux, autoliquidation, échéance, IBAN et communication du fournisseur. La catégorie reprend celle déjà utilisée pour ce fournisseur, sinon l'IA la propose. Le paiement sera rapproché tout seul à l'import de vos extraits bancaires.</p>
      <div id="res"></div>
      ${received.length ? `<h2 style="margin-top:18px">Factures reçues (${received.length})</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Fournisseur</th><th>N°</th><th>Catégorie</th><th>Échéance</th><th class="num">Montant</th><th>Paiement</th></tr></thead><tbody>
      ${received.map((e) => `<tr class="clickable" data-id="${e.id}"><td>${fdate(e.date)}</td><td><strong>${esc(e.supplier)}</strong><div class="small muted">${esc(e.supplierVat || '')}</div></td><td>${esc(e.ref)}</td><td>${esc(App.accountLabel(e.account))}${e.accountGuessed ? ' <span class="badge warning">à vérifier</span>' : ''}</td><td>${fdate(e.dueDate)}</td><td class="num">${eur(e.ttc)}</td><td>${e.paid ? '<span class="badge success">Payée</span>' : e.dueDate && e.dueDate < App.today() ? '<span class="badge danger">Échue</span>' : '<span class="badge warning">À payer</span>'}${!e.paid && e.supplierIban ? `<div class="small muted" style="font-family:var(--mono)">${esc(e.supplierIban)}${e.paymentRef ? '<br>' + esc(e.paymentRef) : ''}</div>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : ''}`;
    const dz = $('#dz', tc);
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', (e) => importUbl([...e.dataTransfer.files], tc));
    $('#ubl', tc).onchange = (e) => importUbl([...e.target.files], tc);
    $$('[data-id]', tc).forEach((r) => (r.onclick = () => App.editExpense(s.expenses.find((e) => e.id === r.dataset.id))));
  }

  async function importUbl(files, tc) {
    const s = App.state, c = s.settings.company;
    const report = [], created = [];
    for (const f of files) {
      try {
        const u = App.parseUbl(await f.text());
        const myNum = App.digits(c.enterpriseNumber).padStart(10, '0');
        const custNum = App.digits(u.customer.legal || u.customer.vat || u.customer.endpoint).slice(-10);
        if (myNum !== '0000000000' && App.digits(u.supplier.vat || u.supplier.legal).slice(-10) === myNum) { report.push([f.name, 'warning', 'C\'est une facture émise par vous (vente) : ignorée.']); continue; }
        const e = App.ublToExpense(u);
        if (s.expenses.some((x) => x.ref === e.ref && (x.supplierVat === e.supplierVat || x.supplier === e.supplier))) { report.push([f.name, '', `Déjà importée (${e.supplier} ${e.ref}).`]); continue; }
        e.id = App.uid();
        s.expenses.push(e); created.push(e);
        const notMe = custNum && myNum !== '0000000000' && custNum !== myNum;
        report.push([f.name, notMe ? 'warning' : 'success', `${e.supplier} — ${e.ref} — ${eur(e.ttc)}${u.currency !== 'EUR' ? ` (devise ${u.currency} : vérifiez)` : ''}${notMe ? ' — attention : adressée à un autre numéro d\'entreprise' : ''}${u.attachments.length ? ` — ${u.attachments.length} pièce(s) jointe(s)` : ''}`]);
      } catch (err) { report.push([f.name, 'danger', err.message]); }
    }
    const guessed = created.filter((e) => e.accountGuessed);
    if (guessed.length && App.ai.isReady()) {
      try {
        const res = await App.ai.classifyExpenses(guessed.map((e) => ({ id: e.id, fournisseur: e.supplier, description: e.description, montant_htva: e.ht })));
        (res.results || []).forEach((r) => {
          const e = s.expenses.find((x) => x.id === r.id);
          if (e && App.EXPENSE_CATEGORIES.some((cat) => cat.account === r.account)) { e.account = r.account; e.deductiblePct = App.VAT_DEDUCTIBILITY[r.account] ?? 100; e.accountGuessed = false; e.aiCategorized = true; }
          if (e && r.is_asset) e.description = '⚠ Investissement à amortir ? ' + e.description;
        });
      } catch (err) { App.toast('Catégorisation IA indisponible : ' + err.message, 'error'); }
    }
    const matched = App.autoReconcile();
    App.save();
    App.toast(`${created.length} facture(s) fournisseur importée(s)${matched ? ` · ${matched} paiement(s) rapproché(s)` : ''}`, created.length ? 'success' : '');
    App.render();
    const res = document.getElementById('res');
    if (res) res.innerHTML = report.map(([n, cls, msg]) => `<div class="alert ${cls} small"><strong>${esc(n)}</strong> : ${esc(msg)}</div>`).join('');
  }

  /* ---------- Mise en route ---------- */
  function guideTab(tc, myId) {
    const c = App.state.settings.company;
    tc.innerHTML = `<div class="grid grid-2">
      <div style="min-width:0"><h2>Votre identité Peppol</h2>
        ${myId ? `<p>Identifiant : <strong style="font-family:var(--mono)">${myId}</strong> (schéma 0208 = numéro d'entreprise belge).</p><p><a class="btn sm" href="${App.peppolDirectoryUrl(c.enterpriseNumber)}" target="_blank" rel="noopener">Vérifier mon inscription dans l'annuaire Peppol ↗</a></p>` : '<div class="alert warning">Indiquez d\'abord votre numéro d\'entreprise dans <a href="#/parametres">Paramètres</a>.</div>'}
        <h2 style="margin-top:18px">Comment ça marche</h2>
        <ol><li><strong>Choisissez un point d'accès Peppol certifié</strong> (prestataire agréé). Aucune application ne peut envoyer sur le réseau sans passer par l'un d'eux, et la plateforme gratuite de l'État (Hermes) a été arrêtée fin 2025.</li>
        <li><strong>Inscrivez votre numéro d'entreprise</strong> chez ce prestataire : vous devenez joignable sur Peppol et vos fournisseurs peuvent vous envoyer leurs factures.</li>
        <li><strong>Envoi</strong> : ComptaPro crée vos factures au format Peppol BIS 3.0 (onglet Envoi). Déposez les fichiers XML dans votre point d'accès (import UBL), puis marquez-les « envoyées ».</li>
        <li><strong>Réception</strong> : téléchargez les factures reçues (XML/UBL) depuis votre point d'accès et déposez-les dans l'onglet Réception : elles deviennent des dépenses, et leur paiement est rapproché automatiquement avec vos extraits CODA.</li></ol>
      </div>
      <div style="min-width:0"><h2>Choisir un point d'accès</h2>
        <p class="small">Critères : import et export de fichiers UBL (indispensable pour travailler avec ComptaPro), réception incluse, prix selon votre volume.</p>
        <ul class="small"><li>Plusieurs éditeurs belges annoncent une formule gratuite ou d'entrée de gamme (par exemple Billit, Odoo) ; les conditions changent : vérifiez-les sur leur site.</li>
        <li>Votre banque ou votre fiduciaire propose parfois un service Peppol intégré.</li>
        <li>Abonnements payants courants : de l'ordre de 15 à 50 € par mois selon les volumes.</li>
        <li>Liste officielle des prestataires certifiés : site de l'OpenPeppol et page e-facturation du SPF BOSA / SPF Finances.</li></ul>
        <p><a class="btn sm" href="https://peppol.org/members/peppol-certified-service-providers/" target="_blank" rel="noopener">Prestataires certifiés OpenPeppol ↗</a> <a class="btn sm" href="https://efacture.belgium.be/fr" target="_blank" rel="noopener">efacture.belgium.be ↗</a></p>
        <h2 style="margin-top:18px">Bon à savoir</h2>
        <ul class="small"><li>Obligation B2B entre assujettis belges ; les factures aux particuliers restent en PDF.</li>
        <li>Pour les pouvoirs publics belges, le portail Mercurius s'utilise aussi via Peppol.</li>
        <li>La facture électronique est la facture originale : conservez les XML 10 ans (ComptaPro garde les données, gardez aussi les fichiers).</li></ul>
      </div></div>`;
  }
})(window.App);
