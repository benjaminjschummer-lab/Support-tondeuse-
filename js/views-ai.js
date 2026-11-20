/* ComptaPro — Assistant IA et paramètres */
(function (App) {
  const { $, $$, esc, eur, fdate, round2, head } = App;
  const V = App.views;

  const SUGGESTIONS = [
    'Combien de TVA vais-je payer pour cette période ?',
    'Quel est mon résultat prévisionnel et l\'impôt associé ?',
    'Quels frais puis-je encore déduire avant la clôture ?',
    'Ai-je intérêt à passer en société ?',
    'Combien dois-je verser en versements anticipés ?',
    'Explique-moi mon bilan simplement',
    'Quelles sont mes prochaines échéances TVA, sociales et fiscales ?',
    'Comment déduire ma voiture de société ?',
  ];

  V.ia = (el, params) => {
    const s = App.state;
    let tab = params[0] || sessionStorage.getItem('ia-tab') || 'chat';
    el.innerHTML = head('Assistant IA', 'Votre expert-comptable disponible 24 h/24 : il connaît toute votre comptabilité, répond à vos questions, scanne vos justificatifs, trie vos opérations et analyse vos chiffres.') +
      (App.ai.isReady() ? (App.ai.builtin ? '<div class="alert success">✦ Claude est intégré : aucune clé API nécessaire.</div>' : '') : `<div class="alert warning">Pour activer l'assistant, ajoutez votre clé API Claude dans <a href="#/parametres">Paramètres</a>. Elle reste stockée uniquement dans ce navigateur.</div>`) +
      `<div class="card"><div class="tabs"><button data-t="chat">💬 Questions</button><button data-t="scan">📷 Scanner & trier</button><button data-t="analyse">📈 Analyse financière</button></div><div id="tc"></div></div>`;
    const draw = () => {
      $$('.tabs button', el).forEach((b) => b.classList.toggle('active', b.dataset.t === tab));
      ({ chat: chatTab, scan: scanTab, analyse: analyseTab })[tab]($('#tc', el));
    };
    $$('.tabs button', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; sessionStorage.setItem('ia-tab', tab); draw(); }));
    draw();
  };

  function chatTab(tc) {
    const s = App.state;
    const render = () => {
      const log = $('#log', tc);
      log.innerHTML = s.aiChat.length ? s.aiChat.map((m) => `<div class="msg ${m.role}">${m.role === 'assistant' ? App.ai.md(m.content) : esc(m.content)}</div>`).join('')
        : `<div class="empty">Posez n'importe quelle question sur votre comptabilité, la TVA, la fiscalité ou la gestion.<br>L'assistant a accès à vos chiffres en temps réel.</div>`;
      log.scrollTop = log.scrollHeight;
    };
    tc.innerHTML = `<div class="chat"><div class="suggestions">${SUGGESTIONS.map((q) => `<button>${esc(q)}</button>`).join('')}</div>
      <div class="chat-log" id="log"></div>
      <div class="chat-input"><textarea id="q" placeholder="Votre question… (Entrée pour envoyer, Maj+Entrée pour un saut de ligne)"></textarea><button class="btn primary" id="send">Envoyer</button><button class="btn" id="clear" title="Effacer la conversation">↺</button></div></div>`;
    render();
    const send = async (text) => {
      text = (text || '').trim(); if (!text) return;
      s.aiChat.push({ role: 'user', content: text });
      const log = $('#log', tc);
      render();
      const bubble = document.createElement('div'); bubble.className = 'msg assistant'; bubble.innerHTML = '<span class="spinner"></span>';
      log.appendChild(bubble); log.scrollTop = log.scrollHeight;
      $('#send', tc).disabled = true;
      try {
        const answer = await App.ai.chat(s.aiChat.slice(-20), (t) => { bubble.innerHTML = App.ai.md(t); log.scrollTop = log.scrollHeight; });
        s.aiChat.push({ role: 'assistant', content: answer });
      } catch (e) {
        s.aiChat.pop();
        bubble.innerHTML = `<div class="neg">${esc(e.message)}</div>`;
        $('#send', tc).disabled = false; return;
      }
      App.save(); render(); $('#send', tc).disabled = false;
    };
    const q = $('#q', tc);
    $('#send', tc).onclick = () => { const v = q.value; q.value = ''; send(v); };
    q.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#send', tc).click(); } };
    $$('.suggestions button', tc).forEach((b) => (b.onclick = () => send(b.textContent)));
    $('#clear', tc).onclick = () => { s.aiChat = []; App.save(); render(); };
  }

  function scanTab(tc) {
    const s = App.state;
    const results = [];
    tc.innerHTML = `<div class="grid grid-2">
      <div><h2>Scanner des justificatifs</h2><p class="muted">Photos de tickets, factures, notes de frais : l'IA lit le document, détermine la catégorie comptable, la TVA récupérable, détecte les immobilisations et prépare la saisie.</p>
        <label class="dropzone" id="dz"><input type="file" id="files" accept="image/*,application/pdf" multiple hidden><div style="font-size:28px">📄</div><strong>Glissez vos justificatifs ici</strong><div class="small">ou cliquez pour choisir / prendre une photo — JPG, PNG${App.ai.builtin ? '' : ', PDF'}</div></label></div>
      <div><h2>Trier la banque</h2><p class="muted">L'IA rapproche les encaissements de vos factures, les débits de vos dépenses et classe le reste dans le bon compte avec le bon taux de TVA.</p>
        <p><strong>${s.bank.filter((b) => !b.matched).length}</strong> opération(s) en attente.</p><a class="btn" href="#/banque">Aller à la banque →</a></div></div>
      <div id="res" style="margin-top:18px"></div>`;
    const dz = $('#dz', tc);
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', (e) => handle([...e.dataTransfer.files]));
    $('#files', tc).onchange = (e) => handle([...e.target.files]);

    const draw = () => {
      $('#res', tc).innerHTML = results.length ? `<h2>Documents analysés</h2><div class="table-wrap"><table><thead><tr><th></th><th>Document</th><th>Date</th><th>Fournisseur</th><th>Catégorie</th><th class="num">HT</th><th class="num">TVA</th><th class="num">TTC</th><th></th></tr></thead><tbody>
        ${results.map((r, k) => `<tr><td>${r.thumb ? `<img class="receipt-thumb" src="${r.thumb}" alt="">` : '📄'}</td><td>${esc(r.file.name)}${r.data ? `<div class="small muted">${esc(r.data.document_type)} · confiance ${Math.round(r.data.confidence * 100)} %${r.data.remarks ? ' · ' + esc(r.data.remarks) : ''}</div>` : ''}</td>
          ${r.status === 'loading' ? '<td colspan="7"><span class="spinner"></span> Analyse…</td>' : r.status === 'error' ? `<td colspan="7" class="neg">${esc(r.error)}</td>` :
          `<td>${fdate(r.data.date)}</td><td>${esc(r.data.supplier)}</td><td>${r.data.is_asset ? '<span class="badge primary">Immobilisation</span>' : esc(App.accountLabel(r.data.account))}</td><td class="num">${eur(r.data.total_ht)}</td><td class="num">${eur(r.data.total_tva)}</td><td class="num">${eur(r.data.total_ttc)}</td>
          <td class="num">${r.saved ? '<span class="badge success">Enregistré</span>' : `<button class="btn sm" data-edit="${k}">Vérifier</button> <button class="btn sm primary" data-save="${k}">Enregistrer</button>`}</td>`}</tr>`).join('')}
        </tbody></table></div>${results.some((r) => r.status === 'ok' && !r.saved) ? '<div class="actions" style="margin-top:10px"><button class="btn primary" id="saveall">Tout enregistrer</button></div>' : ''}` : '';
      $$('[data-save]', tc).forEach((b) => (b.onclick = () => { saveResult(results[b.dataset.save]); draw(); }));
      $$('[data-edit]', tc).forEach((b) => (b.onclick = () => {
        const r = results[b.dataset.edit];
        r.saved = true; draw();
        App.editExpense(null, toExpense(r));
      }));
      const sa = $('#saveall', tc);
      if (sa) sa.onclick = () => { results.filter((r) => r.status === 'ok' && !r.saved).forEach(saveResult); App.toast('Justificatifs enregistrés', 'success'); draw(); };
    };

    const toExpense = (r) => {
      const d = r.data;
      return {
        date: d.date || App.today(), supplier: d.supplier, description: d.description || d.number,
        account: App.EXPENSE_CATEGORIES.some((c) => c.account === d.account) ? d.account : '612300',
        ht: round2(d.total_ht), tva: round2(d.total_tva), ttc: round2(d.total_ttc), tvaRate: App.TVA_RATES.includes(Number(d.tva_rate)) ? Number(d.tva_rate) : 21,
        vatRegime: App.PURCHASE_REGIMES.some(([k]) => k === d.vat_regime) ? d.vat_regime : 'normal',
        deductiblePct: d.vat_deductible_pct ?? (App.VAT_DEDUCTIBILITY[d.account] ?? 100),
        paymentMethod: ['carte', 'virement', 'domiciliation', 'especes'].includes(d.payment_method) ? d.payment_method : 'carte',
        paid: d.payment_method !== 'inconnu', paidDate: d.date, receipt: r.thumb, ref: d.number,
      };
    };
    const saveResult = (r) => {
      const d = r.data;
      if (d.document_type === 'facture_vente') { App.toast(`${r.file.name} est une facture de vente : créez-la dans Factures.`, 'error'); return; }
      if (d.is_asset && App.ASSET_CATEGORIES.some((c) => c.account === d.asset_account)) {
        s.assets.push({ id: App.uid(), label: d.description || d.supplier, account: d.asset_account, date: d.date || App.today(), value: round2(d.total_ht), tvaRate: Number(d.tva_rate) || 0, deductiblePct: d.asset_account === '245000' ? 50 : 100, receipt: r.thumb, duration: Number(d.asset_duration_years) || App.ASSET_CATEGORIES.find((c) => c.account === d.asset_account).duration, supplier: d.supplier, paid: true });
      } else {
        s.expenses.push(Object.assign({ id: App.uid() }, toExpense(r)));
      }
      r.saved = true; App.save();
    };

    async function handle(files) {
      if (!App.ai.isReady()) return App.toast('Activez l\'assistant IA dans les paramètres', 'error');
      for (const file of files) {
        const r = { file, status: 'loading', thumb: await App.compressImage(file, 800) };
        results.push(r); draw();
        App.ai.scanDocument(file).then((data) => { r.data = data; r.status = 'ok'; draw(); }).catch((e) => { r.status = 'error'; r.error = e.message; draw(); });
      }
    }
    draw();
  }

  function analyseTab(tc) {
    const last = App.state.lastAnalysis;
    tc.innerHTML = `<div class="actions" style="margin-bottom:14px"><button class="btn primary" id="go">✦ Lancer une analyse complète</button>${last ? `<span class="muted small">Dernière analyse : ${fdate(last.date)}</span>${App.isArtifact ? '' : '<button class="btn" id="print">Imprimer</button>'}` : ''}</div>
      <div class="report" id="out">${last ? App.ai.md(last.text) : '<div class="empty">L\'IA examine votre rentabilité, vos charges, votre trésorerie, la TVA, les anomalies de saisie et les optimisations possibles.</div>'}</div>`;
    $('#go', tc).onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Analyse en cours…';
      const out = $('#out', tc);
      try {
        const text = await App.ai.analyze((t) => (out.innerHTML = App.ai.md(t)));
        App.state.lastAnalysis = { date: App.today(), text }; App.save();
      } catch (err) { out.innerHTML = `<div class="alert danger">${esc(err.message)}</div>`; }
      btn.disabled = false; btn.textContent = '✦ Relancer l\'analyse';
    };
    const p = $('#print', tc); if (p) p.onclick = () => window.print();
  }

  /* ============ PARAMÈTRES ============ */
  V.parametres = (el) => {
    const s = App.state, c = s.settings.company, ai = s.settings.ai, o = s.settings.opening, f = s.settings.fiscal;
    const num = (k, step) => `<input type="number" step="${step || 'any'}" data-f="${k}" value="${f[k]}">`;
    el.innerHTML = head('Paramètres', 'Entreprise, régime TVA, fiscalité, assistant IA et sauvegardes.') +
      `<form id="pf">
      <div class="card"><h2>Entreprise</h2><div class="form-grid">
        <label class="field">Numéro d'entreprise (BCE) <input name="enterpriseNumber" id="ent" value="${esc(c.enterpriseNumber ? App.bceFormat(c.enterpriseNumber) : '')}" placeholder="0123.456.789"></label>
        <div class="field"><span>Vérification</span><span id="entst" style="padding-top:8px"></span></div>
        <div class="full actions"><a class="btn sm" id="kbo" target="_blank" rel="noopener">Ouvrir ma fiche BCE ↗</a>${App.ai.isReady() ? '<button type="button" class="btn sm" id="bcefill">✦ Remplir depuis la fiche BCE</button>' : ''}</div>
        <label class="field">Dénomination <input name="name" value="${esc(c.name)}"></label>
        <label class="field">Forme juridique <select name="legalForm">${App.options([['PP', 'Personne physique (indépendant)'], 'SRL', 'SA', 'SC', 'SNC', 'SComm', 'ASBL'], c.legalForm)}</select></label>
        <label class="field">Rue et numéro <input name="address" value="${esc(c.address)}"></label>
        <label class="field">Code postal <input name="postcode" value="${esc(c.postcode)}"></label>
        <label class="field">Localité <input name="city" value="${esc(c.city)}"></label>
        <label class="field">RPM (tribunal de l'entreprise) <input name="rpm" value="${esc(c.rpm || '')}" placeholder="ex. Bruxelles, francophone"></label>
        <label class="field">Code NACE principal <input name="nace" value="${esc(c.nace)}"></label>
        <label class="field">E-mail <input name="email" value="${esc(c.email)}"></label>
        <label class="field">Téléphone <input name="phone" value="${esc(c.phone)}"></label>
        <label class="field">IBAN <input name="iban" id="iban" value="${esc(c.iban)}"></label>
        <label class="field">BIC <input name="bic" value="${esc(c.bic)}"></label>
        <div class="field"><span>IBAN</span><span id="ibanst" style="padding-top:8px"></span></div>
      </div></div>
      <div class="card"><h2>TVA et impôts</h2><div class="form-grid">
        <label class="field">Régime de TVA <select name="regimeTva">${App.options([['normal', 'Assujetti normal (déclarations périodiques)'], ['franchise', 'Franchise des petites entreprises (art. 56bis)'], ['exempte', 'Exempté (art. 44)']], c.regimeTva)}</select></label>
        <label class="field">Périodicité des déclarations <select name="tvaPeriod">${App.options([['trimestrielle', 'Trimestrielle'], ['mensuelle', 'Mensuelle']], c.tvaPeriod)}</select></label>
        <label class="field">Imposition des bénéfices <select name="impot">${App.options([['ISOC', 'Impôt des sociétés (ISOC)'], ['IPP', 'Impôt des personnes physiques (indépendant)']], c.impot)}</select></label>
        <label class="check"><input type="checkbox" name="isocReduit" ${c.isocReduit === false ? '' : 'checked'}> Taux réduit PME à l'ISOC (conditions remplies)</label>
        <label class="field">Début d'exercice (MM-JJ) <input name="fiscalYearStart" value="${esc(c.fiscalYearStart)}" pattern="\\d{2}-\\d{2}"></label>
        <label class="check"><input type="checkbox" name="autoAI" ${c.autoAI ? 'checked' : ''}> Trier automatiquement avec l'IA les opérations bancaires non reconnues à l'import</label>
      </div>
      <details style="margin-top:14px"><summary><strong>Paramètres fiscaux indicatifs</strong> <span class="muted small">(à vérifier chaque année)</span></summary><div class="form-grid" style="margin-top:12px">
        <label class="field">ISOC taux réduit (%) ${num('isocReduitTaux')}</label><label class="field">Plafond taux réduit (€) ${num('isocReduitPlafond')}</label><label class="field">ISOC taux normal (%) ${num('isocNormalTaux')}</label>
        <label class="field">Quotité exemptée IPP (€) ${num('ippQuotiteExemptee')}</label><label class="field">Additionnels communaux (%) ${num('ippAdditionnelCommunal')}</label>
        <label class="field full">Barème IPP (plafond:taux ; …) <input id="ippTranches" value="${esc(f.ippTranches.map(([l, r]) => `${l >= 999999999 ? '∞' : l}:${r}`).join(' ; '))}"></label>
        <label class="field">Cotisations sociales taux 1 (%) ${num('socialTaux1')}</label><label class="field">Plafond tranche 1 (€) ${num('socialPlafond1')}</label><label class="field">Taux 2 (%) ${num('socialTaux2')}</label><label class="field">Plafond tranche 2 (€) ${num('socialPlafond2')}</label><label class="field">Cotisation minimale annuelle (€) ${num('socialMinimumAnnuel')}</label>
        <label class="field">Seuil franchise TVA (€) ${num('franchiseSeuil')}</label><label class="field">Seuil listing clients (€) ${num('listingSeuil')}</label>
        <div class="full"><button type="button" class="btn sm" id="fiscreset">Revenir aux valeurs par défaut</button></div>
      </div></details></div>
      <div class="card"><h2>Facturation</h2><div class="form-grid">
        <label class="field">Préfixe factures <input name="invoicePrefix" value="${esc(c.invoicePrefix)}"></label>
        <label class="field">Préfixe devis <input name="quotePrefix" value="${esc(c.quotePrefix)}"></label>
        <label class="field">Préfixe notes de crédit <input name="creditPrefix" value="${esc(c.creditPrefix)}"></label>
        <label class="field">Délai de paiement (jours) <input type="number" name="paymentTerms" value="${c.paymentTerms}"></label>
        <label class="field full">Conditions en pied de facture <textarea name="legalMentions">${esc(c.legalMentions)}</textarea></label>
      </div></div>
      <div class="card"><h2>Bilan d'ouverture</h2><p class="muted small">Soldes au premier jour du premier exercice suivi dans ComptaPro (reprise du dernier bilan).</p><div class="form-grid">
        <label class="field">Capital / apport <input type="number" step="0.01" data-o="capital" value="${o.capital}"></label>
        <label class="field">Réserves <input type="number" step="0.01" data-o="reserves" value="${o.reserves}"></label>
        <label class="field">Bénéfice (perte) reporté(e) <input type="number" step="0.01" data-o="resultatReporte" value="${o.resultatReporte}"></label>
        <label class="field">Emprunts restant dus <input type="number" step="0.01" data-o="emprunts" value="${o.emprunts}"></label>
        <label class="field">Compte courant du dirigeant <input type="number" step="0.01" data-o="compteCourant" value="${o.compteCourant}"></label>
        <label class="field">Solde bancaire d'ouverture <input type="number" step="0.01" data-o="banque" value="${o.banque}"></label>
      </div></div>
      </form>
      ${App.ai.builtin ? '<div class="card"><h2>Assistant IA (Claude)</h2><p>✦ Claude est intégré à cette version : aucune clé API à fournir. La première utilisation vous demande simplement l\'autorisation.</p></div><div hidden>' : ''}<div class="card"><h2>Assistant IA (Claude)</h2><div class="form-grid">
        <label class="field full">Clé API Anthropic <input type="password" id="apikey" value="${esc(ai.apiKey)}" placeholder="sk-ant-…" autocomplete="off"></label>
        <label class="field">Modèle <select id="model">${App.options([['claude-opus-5-5', 'Claude Opus 5.5 (recommandé)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (plus rapide)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (économique)']], ai.model)}</select></label>
        <label class="field">Niveau de réflexion <select id="effort">${App.options([['low', 'Rapide'], ['medium', 'Équilibré'], ['high', 'Approfondi'], ['xhigh', 'Très approfondi']], ai.effort)}</select></label>
      </div><p class="muted small">Clé à créer sur console.anthropic.com, conservée uniquement dans ce navigateur.</p></div>${App.ai.builtin ? '</div>' : ''}
      <div class="card"><h2>Données & sauvegardes</h2><p class="muted small">${App.cloudStatus === 'ok' ? 'Vos données sont enregistrées automatiquement dans votre espace privé, accessible depuis tous vos appareils.' : 'Vos données restent sur cet appareil.'} Exportez aussi régulièrement une sauvegarde.</p><div class="actions">
        <button class="btn" id="backup">Exporter une sauvegarde (.json)</button>
        <label class="btn">Restaurer une sauvegarde<input type="file" id="restore" accept=".json,application/json" hidden></label>
        <button class="btn" id="demo">Charger la démo</button>
        <button class="btn danger" id="wipe">Tout effacer</button>
        <button class="btn" id="theme">Thème : ${document.documentElement.dataset.theme === 'dark' ? 'sombre' : document.documentElement.dataset.theme === 'light' ? 'clair' : 'automatique'}</button>
      </div></div>
      <div class="actions" style="margin-top:16px;justify-content:flex-end"><button class="btn primary" id="save">Enregistrer les paramètres</button></div>`;
    const ent = $('#ent', el), iban = $('#iban', el);
    const check = () => {
      const v = ent.value.trim();
      $('#entst', el).innerHTML = !v ? '<span class="muted">—</span>' : App.bceValid(v) ? `<span class="pos">✓ ${App.bceFormat(v)} — TVA BE${App.digits(v).padStart(10, '0')}</span>` : '<span class="neg">Numéro invalide (contrôle modulo 97)</span>';
      const k = $('#kbo', el); k.hidden = !App.bceValid(v); k.href = App.kboUrl(v);
      $('#ibanst', el).innerHTML = !iban.value.trim() ? '<span class="muted">—</span>' : App.ibanValid(iban.value) ? '<span class="pos">✓ IBAN valide</span>' : '<span class="neg">IBAN invalide</span>';
    };
    ent.oninput = check; iban.oninput = check; check();
    const bf = $('#bcefill', el);
    if (bf) bf.onclick = () => App.companyFromBce((d) => {
      const form = $('#pf', el);
      if (d.name) form.name.value = d.name;
      if (d.enterprise_number) form.enterpriseNumber.value = App.bceFormat(d.enterprise_number);
      if (d.street) form.address.value = d.street;
      if (d.postcode) form.postcode.value = d.postcode;
      if (d.city) form.city.value = d.city;
      if (d.nace) form.nace.value = d.nace;
      const lf = { 'personne physique': 'PP', 'société à responsabilité limitée': 'SRL', 'société anonyme': 'SA', 'société coopérative': 'SC', 'association sans but lucratif': 'ASBL' }[String(d.legal_form || '').toLowerCase()] || (['SRL', 'SA', 'SC', 'SNC', 'SComm', 'ASBL'].includes(String(d.legal_form).toUpperCase()) ? String(d.legal_form).toUpperCase() : '');
      if (lf) { form.legalForm.value = lf; form.impot.value = lf === 'PP' ? 'IPP' : 'ISOC'; }
      if (d.vat_registered === false) form.regimeTva.value = 'franchise';
      check();
    });
    $('#fiscreset', el).onclick = () => { s.settings.fiscal = Object.assign({}, App.DEFAULT_FISCAL); App.save(); V.parametres(el); };
    $('#save', el).onclick = () => {
      const d = App.formData($('#pf', el));
      if (d.enterpriseNumber && !App.bceValid(d.enterpriseNumber)) return App.toast('Numéro d\'entreprise invalide', 'error');
      d.enterpriseNumber = d.enterpriseNumber ? App.digits(d.enterpriseNumber).padStart(10, '0') : '';
      Object.assign(c, d);
      $$('[data-o]', el).forEach((i) => (o[i.dataset.o] = Number(i.value) || 0));
      $$('[data-f]', el).forEach((i) => (f[i.dataset.f] = Number(i.value) || 0));
      const tr = $('#ippTranches', el).value.split(';').map((x) => x.split(':').map((y) => y.trim())).filter((x) => x.length === 2).map(([l, r]) => [l === '∞' ? 999999999 : Number(l), Number(r)]).filter(([l, r]) => l > 0 && r >= 0);
      if (tr.length) f.ippTranches = tr;
      ai.apiKey = $('#apikey', el).value.trim(); ai.model = $('#model', el).value; ai.effort = $('#effort', el).value;
      App.ai.ready = App.ai.isReady();
      App.save(); App.toast('Paramètres enregistrés', 'success'); App.render();
    };
    $('#backup', el).onclick = () => {
      const copy = JSON.parse(JSON.stringify(s)); copy.settings.ai.apiKey = '';
      App.download(`comptapro_sauvegarde_${App.today()}.json`, JSON.stringify(copy, null, 1));
    };
    $('#restore', el).onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const r = new FileReader();
      r.onload = () => { try { const data = JSON.parse(r.result); const key = ai.apiKey; App.replace(data); App.state.settings.ai.apiKey = App.state.settings.ai.apiKey || key; App.save(); App.toast('Sauvegarde restaurée', 'success'); App.render(); } catch (err) { App.toast('Fichier invalide', 'error'); } };
      r.readAsText(file);
    };
    $('#demo', el).onclick = () => App.confirmBox('Remplacer vos données par la démonstration ?', () => { const key = ai.apiKey; App.loadDemo(); App.state.settings.ai.apiKey = key; App.save(); App.render(); });
    $('#wipe', el).onclick = () => App.confirmBox('Effacer définitivement toutes vos données ?', () => { App.reset(); App.render(); }, 'Tout effacer');
    $('#theme', el).onclick = () => {
      const cur = document.documentElement.dataset.theme || 'auto';
      const next = { auto: 'dark', dark: 'light', light: 'auto' }[cur];
      try { localStorage.setItem('comptapro.theme', next); } catch (e) { /* ignore */ }
      App.applyTheme(); V.parametres(el);
    };
  };
})(window.App);
