/* ComptaPro — Assistant IA (Claude) : questions, scan de justificatifs, tri bancaire, analyse */
(function (App) {
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.4.0/+esm';
  let sdkPromise = null;

  async function client() {
    const key = App.state.settings.ai.apiKey;
    if (!key) throw new Error('Ajoutez votre clé API Claude dans Paramètres → Assistant IA.');
    sdkPromise = sdkPromise || import(SDK_URL);
    const { default: Anthropic } = await sdkPromise;
    // Clé stockée uniquement dans ce navigateur ; appel direct à l'API depuis le poste de l'utilisateur.
    return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  }

  const SYSTEM = `Tu es l'expert-comptable intégré à ComptaPro, une application de comptabilité française.
Tu maîtrises le Plan comptable général (PCG), la TVA française (CA3, CA12, exigibilité, autoliquidation, franchise en base), les régimes fiscaux (micro, réel simplifié, réel normal, IS, IR), les amortissements, la clôture annuelle, la liasse fiscale (2033 / 2050), le FEC, les cotisations sociales des dirigeants et les obligations déclaratives.
Réponds en français, de façon claire, concrète et chiffrée à partir des données de l'entreprise fournies. Cite les comptes PCG utiles et les échéances.
Quand une donnée manque, dis-le et explique comment la saisir dans l'application. Signale quand une situation mérite la validation d'un expert-comptable.
Utilise du Markdown simple (titres ####, listes, tableaux, gras).`;

  function base(extra) {
    const ai = App.state.settings.ai;
    return Object.assign({
      model: ai.model || 'claude-opus-5-5',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: ai.effort || 'medium' },
      // Repli automatique sur un autre modèle si une demande est refusée par les filtres de sécurité
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    }, extra);
  }

  function textOf(msg) {
    if (msg.stop_reason === 'refusal') throw new Error('La demande a été refusée par le modèle.');
    return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  }

  function contextBlock() {
    return `Données comptables actuelles de l'entreprise (JSON) :\n${JSON.stringify(App.aiContext())}`;
  }

  /* Conversation en streaming */
  async function chat(history, onText) {
    const c = await client();
    const messages = history.map((m) => ({ role: m.role, content: m.content }));
    messages[messages.length - 1] = { role: 'user', content: `${contextBlock()}\n\nQuestion : ${messages[messages.length - 1].content}` };
    const stream = c.beta.messages.stream(base({ system: SYSTEM, messages, max_tokens: 32000 }));
    let acc = '';
    stream.on('text', (t) => { acc += t; onText && onText(acc); });
    const final = await stream.finalMessage();
    return textOf(final) || acc;
  }

  async function structured(content, schema, system) {
    const c = await client();
    const stream = c.beta.messages.stream(base({
      system: system || SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { effort: App.state.settings.ai.effort || 'medium', format: { type: 'json_schema', schema } },
    }));
    const msg = await stream.finalMessage();
    const txt = textOf(msg);
    try { return JSON.parse(txt); }
    catch (e) { const m = txt.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error('Réponse IA illisible.'); }
  }

  const fileToBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const DOC_SCHEMA = {
    type: 'object', additionalProperties: false,
    required: ['document_type', 'supplier', 'customer', 'date', 'number', 'description', 'total_ht', 'total_tva', 'total_ttc', 'tva_rate', 'account', 'is_asset', 'asset_account', 'asset_duration_years', 'payment_method', 'confidence', 'remarks'],
    properties: {
      document_type: { type: 'string', enum: ['facture_achat', 'ticket_caisse', 'facture_vente', 'note_de_frais', 'releve_bancaire', 'autre'] },
      supplier: { type: 'string' }, customer: { type: 'string' },
      date: { type: 'string', description: 'AAAA-MM-JJ' }, number: { type: 'string' },
      description: { type: 'string' },
      total_ht: { type: 'number' }, total_tva: { type: 'number' }, total_ttc: { type: 'number' },
      tva_rate: { type: 'number', description: 'Taux principal : 20, 10, 5.5, 2.1 ou 0' },
      account: { type: 'string', description: 'Compte de charge PCG à 6 chiffres' },
      is_asset: { type: 'boolean', description: 'Vrai si immobilisation (bien durable > 500 € HT)' },
      asset_account: { type: 'string' }, asset_duration_years: { type: 'number' },
      payment_method: { type: 'string', enum: ['carte', 'virement', 'especes', 'prelevement', 'cheque', 'inconnu'] },
      confidence: { type: 'number', description: '0 à 1' },
      remarks: { type: 'string', description: 'Points d\'attention : TVA non récupérable, mentions manquantes, etc.' },
    },
  };

  /* Scan d'un justificatif (image ou PDF) */
  async function scanDocument(file) {
    const data = await fileToBase64(file);
    const isPdf = file.type === 'application/pdf';
    const media = isPdf ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data } };
    const cats = App.EXPENSE_CATEGORIES.map((c) => `${c.account} ${c.label}`).join('\n');
    const assets = App.ASSET_CATEGORIES.map((c) => `${c.account} ${c.label} (${c.duration} ans)`).join('\n');
    return structured([media, { type: 'text', text: `Analyse ce justificatif et extrais les données comptables. Entreprise : ${App.state.settings.company.name}.
Comptes de charges disponibles :\n${cats}\nComptes d'immobilisations :\n${assets}
Si un montant est absent, calcule-le à partir des autres. Si la TVA n'est pas récupérable (ex. carburant essence, cadeaux > 73 €), mets total_tva à 0 et explique dans remarks. Laisse asset_account vide et asset_duration_years à 0 si ce n'est pas une immobilisation.` }], DOC_SCHEMA);
  }

  /* Tri automatique des opérations bancaires */
  async function categorizeBank(lines) {
    const s = App.state;
    const openInvoices = s.invoices.filter((i) => i.type === 'facture' && i.status === 'envoyee').map((i) => ({ id: i.id, numero: i.number, client: (s.clients.find((c) => c.id === i.clientId) || {}).name, ttc: App.invoiceTotals(i).ttc }));
    const unpaidExpenses = s.expenses.filter((e) => !e.paid).map((e) => ({ id: e.id, fournisseur: e.supplier, ttc: e.ttc, date: e.date }));
    const accounts = [...App.EXPENSE_CATEGORIES, { account: '706000', label: 'Prestations de services' }, { account: '707000', label: 'Ventes de marchandises' }, { account: '758000', label: 'Produits divers' }, { account: '108000', label: 'Apport / prélèvement de l\'exploitant' }, { account: '455000', label: 'Compte courant d\'associé' }, { account: '164000', label: 'Emprunt (capital remboursé)' }, { account: '445510', label: 'Paiement de TVA' }, { account: '444000', label: 'Paiement impôt sur les sociétés' }, { account: '471000', label: 'Compte d\'attente' }];
    const schema = {
      type: 'object', additionalProperties: false, required: ['results'],
      properties: { results: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'match_type', 'match_id', 'account', 'tva_rate', 'confidence', 'reason'], properties: {
        id: { type: 'string' }, match_type: { type: 'string', enum: ['invoice', 'expense', 'category'] }, match_id: { type: 'string' },
        account: { type: 'string' }, tva_rate: { type: 'number' }, confidence: { type: 'number' }, reason: { type: 'string' },
      } } } },
    };
    return structured(`Classe chaque opération bancaire. Si un encaissement correspond à une facture client ouverte (montant et nom), utilise match_type "invoice" avec son id. Si un débit correspond à une dépense non payée, "expense". Sinon "category" avec le compte PCG le plus adapté et le taux de TVA probable (0 pour URSSAF, impôts, banque, assurance, salaires, emprunts).
Opérations : ${JSON.stringify(lines.map((b) => ({ id: b.id, date: b.date, libelle: b.label, montant: b.amount })))}
Factures clients ouvertes : ${JSON.stringify(openInvoices)}
Dépenses non payées : ${JSON.stringify(unpaidExpenses)}
Comptes disponibles : ${accounts.map((a) => a.account + ' ' + a.label).join(' | ')}`, schema);
  }

  /* Analyse financière complète */
  async function analyze(onText) {
    const c = await client();
    const stream = c.beta.messages.stream(base({
      system: SYSTEM, max_tokens: 32000,
      messages: [{ role: 'user', content: `${contextBlock()}\n\nRédige une analyse financière complète de l'entreprise : 1) synthèse en 3 phrases, 2) rentabilité et marges, 3) structure des charges et pistes d'économies, 4) trésorerie et BFR (délais clients), 5) TVA et échéances fiscales à venir, 6) anomalies ou incohérences détectées dans la saisie, 7) optimisations fiscales légales à étudier, 8) prévisions pour la fin d'exercice. Sois concret et chiffré.` }],
    }));
    let acc = '';
    stream.on('text', (t) => { acc += t; onText && onText(acc); });
    return textOf(await stream.finalMessage()) || acc;
  }

  /* Rendu Markdown minimal et sûr */
  function md(src) {
    const esc = App.esc;
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    const lines = String(src || '').split('\n');
    let html = '', list = null, i = 0;
    const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
    while (i < lines.length) {
      const l = lines[i];
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[i + 1])) {
        closeList();
        const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        html += '<div class="table-wrap"><table><thead><tr>' + cells(l).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
        i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { html += '<tr>' + cells(lines[i]).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>'; i++; }
        html += '</tbody></table></div>';
        continue;
      }
      let m;
      if ((m = l.match(/^#{1,6}\s+(.*)/))) { closeList(); html += `<h4>${inline(m[1])}</h4>`; }
      else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
      else if (!l.trim()) { closeList(); }
      else { closeList(); html += `<p>${inline(l)}</p>`; }
      i++;
    }
    closeList();
    return html;
  }

  App.ai = { chat, scanDocument, categorizeBank, analyze, md, fileToBase64 };
})(window.App);
