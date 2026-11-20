/* ComptaPro — Assistant IA et paramètres */
(function (App) {
  const { $, $$, esc, eur, fdate, round2, head } = App;
  const V = App.views;

  const SUGGESTIONS = [
    'Combien de TVA vais-je devoir payer ce mois-ci ?',
    'Quel est mon résultat prévisionnel et l\'impôt associé ?',
    'Quelles dépenses puis-je encore déduire avant la clôture ?',
    'Ai-je intérêt à passer de l\'IR à l\'IS ?',
    'Quels clients me paient le plus en retard ?',
    'Explique-moi mon bilan simplement',
    'Quelles sont mes prochaines échéances fiscales et sociales ?',
    'Comment comptabiliser un leasing de véhicule ?',
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
      <div><h2>Scanner des justificatifs</h2><p class="muted">Photos de tickets, factures PDF, notes de frais : l'IA lit le document, détermine la catégorie comptable, la TVA récupérable, détecte les immobilisations et prépare la saisie.</p>
        <label class="dropzone" id="dz"><input type="file" id="files" accept="image/*,application/pdf" multiple hidden><div style="font-size:28px">📄</div><strong>Glissez vos justificatifs ici</strong><div class="small">ou cliquez pour choisir / prendre une photo — JPG, PNG, PDF</div></label></div>
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
        account: App.EXPENSE_CATEGORIES.some((c) => c.account === d.account) ? d.account : '471000',
        ht: round2(d.total_ht), tva: round2(d.total_tva), ttc: round2(d.total_ttc), tvaRate: App.TVA_RATES.includes(Number(d.tva_rate)) ? Number(d.tva_rate) : 20,
        paymentMethod: ['carte', 'virement', 'prelevement', 'cheque', 'especes'].includes(d.payment_method) ? d.payment_method : 'carte',
        paid: d.payment_method !== 'inconnu', paidDate: d.date, receipt: r.thumb, ref: d.number,
      };
    };
    const saveResult = (r) => {
      const d = r.data;
      if (d.document_type === 'facture_vente') { App.toast(`${r.file.name} est une facture de vente : créez-la dans Factures.`, 'error'); return; }
      if (d.is_asset && App.ASSET_CATEGORIES.some((c) => c.account === d.asset_account)) {
        s.assets.push({ id: App.uid(), label: d.description || d.supplier, account: d.asset_account, date: d.date || App.today(), value: round2(d.total_ht), tvaRate: Number(d.tva_rate) || 0, duration: Number(d.asset_duration_years) || App.ASSET_CATEGORIES.find((c) => c.account === d.asset_account).duration, supplier: d.supplier, paid: true });
      } else {
        s.expenses.push(Object.assign({ id: App.uid() }, toExpense(r)));
      }
      r.saved = true; App.save();
    };

    async function handle(files) {
      if (!App.ai.isReady()) return App.toast('Ajoutez votre clé API dans les paramètres', 'error');
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
    const s = App.state, c = s.settings.company, ai = s.settings.ai, o = s.settings.opening;
    el.innerHTML = head('Paramètres', 'Entreprise, fiscalité, assistant IA et sauvegardes.') +
      `<form id="pf">
      <div class="card"><h2>Entreprise</h2><div class="form-grid">
        <label class="field">Raison sociale <input name="name" value="${esc(c.name)}"></label>
        <label class="field">Forme juridique <select name="legalForm">${App.options(['EI', 'Micro', 'EURL', 'SARL', 'SASU', 'SAS', 'SA', 'SCI', 'Association'], c.legalForm)}</select></label>
        <label class="field">SIRET <input name="siret" value="${esc(c.siret)}"></label>
        <label class="field">N° TVA intracommunautaire <input name="tvaNumber" value="${esc(c.tvaNumber)}"></label>
        <label class="field">E-mail <input name="email" value="${esc(c.email)}"></label>
        <label class="field">Téléphone <input name="phone" value="${esc(c.phone)}"></label>
        <label class="field full">Adresse <textarea name="address">${esc(c.address)}</textarea></label>
        <label class="field">IBAN <input name="iban" value="${esc(c.iban)}"></label>
        <label class="field">BIC <input name="bic" value="${esc(c.bic)}"></label>
      </div></div>
      <div class="card"><h2>Fiscalité</h2><div class="form-grid">
        <label class="field">Régime de TVA <select name="regimeTva">${App.options([['franchise', 'Franchise en base (293 B)'], ['reel_simplifie', 'Réel simplifié'], ['reel_normal', 'Réel normal']], c.regimeTva)}</select></label>
        <label class="field">Périodicité <select name="tvaPeriod">${App.options([['mensuelle', 'Mensuelle (CA3)'], ['trimestrielle', 'Trimestrielle (CA3)'], ['annuelle', 'Annuelle (CA12)']], c.tvaPeriod)}</select></label>
        <label class="field">Exigibilité de la TVA collectée <select name="exigibilite">${App.options([['debits', 'Sur les débits (ventes de biens)'], ['encaissements', 'Sur les encaissements (services)']], c.exigibilite)}</select></label>
        <label class="field">Imposition des bénéfices <select name="impot">${App.options([['IS', 'Impôt sur les sociétés'], ['IR', 'Impôt sur le revenu']], c.impot)}</select></label>
        <label class="field">Début d'exercice (MM-JJ) <input name="fiscalYearStart" value="${esc(c.fiscalYearStart)}" pattern="\\d{2}-\\d{2}"></label>
      </div></div>
      <div class="card"><h2>Facturation</h2><div class="form-grid">
        <label class="field">Préfixe factures <input name="invoicePrefix" value="${esc(c.invoicePrefix)}"></label>
        <label class="field">Préfixe devis <input name="quotePrefix" value="${esc(c.quotePrefix)}"></label>
        <label class="field">Préfixe avoirs <input name="creditPrefix" value="${esc(c.creditPrefix)}"></label>
        <label class="field">Délai de paiement (jours) <input type="number" name="paymentTerms" value="${c.paymentTerms}"></label>
        <label class="field full">Mentions légales en pied de facture <textarea name="legalMentions">${esc(c.legalMentions)}</textarea></label>
      </div></div>
      <div class="card"><h2>Bilan d'ouverture</h2><p class="muted small">Soldes au premier jour de votre premier exercice suivi dans ComptaPro (reprise de l'ancien bilan).</p><div class="form-grid">
        <label class="field">Capital social <input type="number" step="0.01" data-o="capital" value="${o.capital}"></label>
        <label class="field">Report à nouveau <input type="number" step="0.01" data-o="reportANouveau" value="${o.reportANouveau}"></label>
        <label class="field">Emprunts restant dus <input type="number" step="0.01" data-o="emprunts" value="${o.emprunts}"></label>
        <label class="field">Comptes courants d'associés <input type="number" step="0.01" data-o="comptesCourants" value="${o.comptesCourants}"></label>
        <label class="field">Solde bancaire d'ouverture <input type="number" step="0.01" data-o="banque" value="${o.banque}"></label>
      </div></div>
      </form>
      ${App.ai.builtin ? '<div class="card"><h2>Assistant IA (Claude)</h2><p>✦ Claude est intégré à cette version : aucune clé API à fournir. La première utilisation vous demande simplement l\'autorisation.</p></div><div hidden>' : ''}<div class="card"><h2>Assistant IA (Claude)</h2><div class="form-grid">
        <label class="field full">Clé API Anthropic <input type="password" id="apikey" value="${esc(ai.apiKey)}" placeholder="sk-ant-…" autocomplete="off"></label>
        <label class="field">Modèle <select id="model">${App.options([['claude-opus-5-5', 'Claude Opus 5.5 (recommandé)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (plus rapide)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (économique)']], ai.model)}</select></label>
        <label class="field">Niveau de réflexion <select id="effort">${App.options([['low', 'Rapide'], ['medium', 'Équilibré'], ['high', 'Approfondi'], ['xhigh', 'Très approfondi']], ai.effort)}</select></label>
      </div><p class="muted small">Obtenez une clé sur console.anthropic.com. Elle est conservée uniquement dans ce navigateur et les requêtes partent directement de votre appareil vers l'API Anthropic, avec un résumé de vos données comptables pour contextualiser les réponses.</p></div>${App.ai.builtin ? '</div>' : ''}
      <div class="card"><h2>Données & sauvegardes</h2><p class="muted small">Toutes vos données restent sur cet appareil (stockage local du navigateur). Exportez régulièrement une sauvegarde.</p><div class="actions">
        <button class="btn" id="backup">Exporter une sauvegarde (.json)</button>
        <label class="btn">Restaurer une sauvegarde<input type="file" id="restore" accept=".json,application/json" hidden></label>
        <button class="btn" id="demo">Charger la démo</button>
        <button class="btn danger" id="wipe">Tout effacer</button>
        <button class="btn" id="theme">Thème : ${document.documentElement.dataset.theme === 'dark' ? 'sombre' : document.documentElement.dataset.theme === 'light' ? 'clair' : 'automatique'}</button>
      </div></div>
      <div class="actions" style="margin-top:16px;justify-content:flex-end"><button class="btn primary" id="save">Enregistrer les paramètres</button></div>`;
    $('#save', el).onclick = () => {
      const d = App.formData($('#pf', el));
      Object.keys(c).forEach((k) => { if (k in d) c[k] = d[k]; });
      if (c.regimeTva === 'reel_simplifie' && c.tvaPeriod === 'mensuelle') c.tvaPeriod = 'annuelle';
      $$('[data-o]', el).forEach((i) => (o[i.dataset.o] = Number(i.value) || 0));
      ai.apiKey = $('#apikey', el).value.trim(); ai.model = $('#model', el).value; ai.effort = $('#effort', el).value;
      App.save(); App.toast('Paramètres enregistrés', 'success'); App.render();
    };
    $('#backup', el).onclick = () => {
      const copy = JSON.parse(JSON.stringify(s)); copy.settings.ai.apiKey = '';
      App.download(`comptapro_sauvegarde_${App.today()}.json`, JSON.stringify(copy, null, 1), 'application/json');
    };
    $('#restore', el).onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { const data = JSON.parse(r.result); const key = ai.apiKey; App.replace(data); App.state.settings.ai.apiKey = App.state.settings.ai.apiKey || key; App.save(); App.toast('Sauvegarde restaurée', 'success'); App.render(); } catch (err) { App.toast('Fichier invalide', 'error'); } };
      r.readAsText(f);
    };
    $('#demo', el).onclick = () => App.confirmBox('Remplacer vos données par la démonstration ?', () => { const key = ai.apiKey; App.loadDemo(); App.state.settings.ai.apiKey = key; App.save(); App.render(); });
    $('#wipe', el).onclick = () => App.confirmBox('Effacer définitivement toutes les données de cet appareil ?', () => { App.reset(); App.render(); }, 'Tout effacer');
    $('#theme', el).onclick = () => {
      const cur = document.documentElement.dataset.theme || 'auto';
      const next = { auto: 'dark', dark: 'light', light: 'auto' }[cur];
      try { localStorage.setItem('comptapro.theme', next); } catch (e) { /* ignore */ }
      App.applyTheme(); V.parametres(el);
    };
  };
})(window.App);
