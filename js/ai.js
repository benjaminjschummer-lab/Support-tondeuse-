/* ComptaPro — Assistant IA (Claude) : questions, scan de justificatifs, tri bancaire, analyse */
(function (App) {
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.4.0/+esm';
  let sdkPromise = null;
  let sampleFn = null; // Claude intégré (quand l'app tourne sur claude.ai)

  async function init() {
    if (window.claude && window.claude.use) {
      sampleFn = await window.claude.use('sample').catch(() => null);
    }
    api.builtin = !!sampleFn;
    api.ready = !!sampleFn || !!App.state.settings.ai.apiKey;
  }
  const isReady = () => !!sampleFn || !!App.state.settings.ai.apiKey;
  const sampleErr = (e) => new Error(e && e.code === 'not_granted' ? 'Accès à Claude refusé pour cette page.' : e && e.code === 'rate_limited' ? 'Trop de demandes : réessayez dans un moment.' : (e && e.message) || 'Erreur de l\'assistant IA');

  async function client() {
    const key = App.state.settings.ai.apiKey;
    if (!key) throw new Error('Ajoutez votre clé API Claude dans Paramètres → Assistant IA.');
    sdkPromise = sdkPromise || import(SDK_URL);
    const { default: Anthropic } = await sdkPromise;
    // Clé stockée uniquement dans ce navigateur ; appel direct à l'API depuis le poste de l'utilisateur.
    return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  }

  const SYSTEM = `Tu es l'expert-comptable et conseiller fiscal intégré à ComptaPro, une application de comptabilité pour indépendants et sociétés établis en BELGIQUE.
Tu appliques exclusivement le droit belge : plan comptable minimum normalisé (PCMN), Code de la TVA (taux 21/12/6/0 %, grilles de la déclaration périodique, Intervat, listing clients, relevé intracommunautaire, régime de franchise art. 56bis, autoliquidation, cocontractant), facturation électronique Peppol obligatoire en B2B depuis 2026, impôt des sociétés (taux réduit PME, versements anticipés, dépenses non admises), impôt des personnes physiques et cotisations sociales des indépendants, comptes annuels BNB, communication structurée.
Réponds en français, de façon claire, concrète et chiffrée à partir des données de l'entreprise fournies. Cite les comptes PCMN et les grilles TVA utiles, ainsi que les échéances.
Les taux et seuils fiscaux changent chaque année : donne les montants que tu connais en précisant l'année et invite à vérifier sur finances.belgium.be quand l'enjeu est important.
Quand une donnée manque, dis-le et explique comment la saisir dans l'application. Signale quand une situation mérite la validation d'un comptable ou d'un conseiller fiscal agréé (ITAA).
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
    if (sampleFn) {
      const msgs = history.map((m) => ({ role: m.role, content: m.content }));
      msgs[msgs.length - 1] = { role: 'user', content: `${SYSTEM}\n\n${contextBlock()}\n\nQuestion : ${msgs[msgs.length - 1].content}` };
      try { const r = await sampleFn(msgs, { cache: false, modelTier: 'complex', onText: ({ text }) => onText && onText(text) }); return r.text; }
      catch (e) { throw sampleErr(e); }
    }
    const c = await client();
    const messages = history.map((m) => ({ role: m.role, content: m.content }));
    messages[messages.length - 1] = { role: 'user', content: `${contextBlock()}\n\nQuestion : ${messages[messages.length - 1].content}` };
    const stream = c.beta.messages.stream(base({ system: SYSTEM, messages, max_tokens: 32000 }));
    let acc = '';
    stream.on('text', (t) => { acc += t; onText && onText(acc); });
    const final = await stream.finalMessage();
    return textOf(final) || acc;
  }

  async function structured(content, schema, system, images) {
    if (sampleFn) {
      const text = (Array.isArray(content) ? content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : content);
      const prompt = `${system || SYSTEM}\n\n${text}\n\nRéponds uniquement avec un objet JSON valide conforme à ce schéma JSON (tous les champs requis) :\n${JSON.stringify(schema)}`;
      try { return await sampleFn.json(prompt, Object.assign({ modelTier: 'default' }, images ? { images } : {})); }
      catch (e) { throw sampleErr(e); }
    }
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
    required: ['vat_regime', 'vat_deductible_pct', 'document_type', 'supplier', 'customer', 'date', 'number', 'description', 'total_ht', 'total_tva', 'total_ttc', 'tva_rate', 'account', 'is_asset', 'asset_account', 'asset_duration_years', 'payment_method', 'confidence', 'remarks'],
    properties: {
      document_type: { type: 'string', enum: ['facture_achat', 'ticket_caisse', 'facture_vente', 'note_de_frais', 'releve_bancaire', 'autre'] },
      supplier: { type: 'string' }, customer: { type: 'string' },
      date: { type: 'string', description: 'AAAA-MM-JJ' }, number: { type: 'string' },
      description: { type: 'string' },
      total_ht: { type: 'number' }, total_tva: { type: 'number' }, total_ttc: { type: 'number' },
      tva_rate: { type: 'number', description: 'Taux belge principal : 21, 12, 6 ou 0' },
      account: { type: 'string', description: 'Compte de charge PCMN à 6 chiffres, choisi dans la liste' },
      vat_regime: { type: 'string', enum: ['normal', 'intracom_biens', 'intracom_services', 'cocontractant'], description: 'autoliquidation si la facture ne contient pas de TVA belge et mentionne l\'autoliquidation' },
      vat_deductible_pct: { type: 'number', description: 'Pourcentage de TVA déductible selon le CTVA : restaurant 0, cadeaux 0, voiture 50, sinon 100' },
      is_asset: { type: 'boolean', description: 'Vrai si investissement durable à amortir (matériel, véhicule, mobilier, logiciel d\'une valeur significative)' },
      asset_account: { type: 'string' }, asset_duration_years: { type: 'number' },
      payment_method: { type: 'string', enum: ['carte', 'virement', 'domiciliation', 'especes', 'inconnu'] },
      confidence: { type: 'number', description: '0 à 1' },
      remarks: { type: 'string', description: 'Points d\'attention : TVA non récupérable, mentions manquantes, etc.' },
    },
  };

  /* Scan d'un justificatif (image ou PDF) */
  async function scanDocument(file) {
    if (sampleFn && file.type === 'application/pdf') throw new Error('Ici, l\'IA lit les photos et images (JPG, PNG) : prenez une capture ou une photo du PDF.');
    const data = sampleFn ? '' : await fileToBase64(file);
    const isPdf = file.type === 'application/pdf';
    const media = isPdf ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data } };
    const cats = App.EXPENSE_CATEGORIES.map((c) => `${c.account} ${c.label}`).join('\n');
    const assets = App.ASSET_CATEGORIES.map((c) => `${c.account} ${c.label} (${c.duration} ans)`).join('\n');
    return structured([media, { type: 'text', text: `Analyse ce justificatif et extrais les données comptables. Entreprise : ${App.state.settings.company.name}.
Entreprise belge.
Comptes de charges PCMN disponibles :\n${cats}\nComptes d'immobilisations :\n${assets}
Si un montant est absent, calcule-le à partir des autres. total_tva = TVA figurant sur le document (même si elle n'est pas déductible) ; vat_deductible_pct selon le CTVA (restaurant et réception 0, cadeaux 0, frais de voiture 50, sinon 100). Pour une facture étrangère sans TVA avec autoliquidation, total_tva = 0, total_ttc = total_ht et vat_regime adapté. Signale dans remarks les mentions obligatoires manquantes. Laisse asset_account vide et asset_duration_years à 0 si ce n'est pas un investissement.` }], DOC_SCHEMA, null, sampleFn ? [file] : null);
  }

  /* Tri automatique des opérations bancaires */
  async function categorizeBank(lines) {
    const s = App.state;
    const openInvoices = s.invoices.filter((i) => i.type === 'facture' && i.status === 'envoyee').map((i) => ({ id: i.id, numero: i.number, client: (s.clients.find((c) => c.id === i.clientId) || {}).name, ttc: App.invoiceTotals(i).ttc }));
    const unpaidExpenses = s.expenses.filter((e) => !e.paid).map((e) => ({ id: e.id, fournisseur: e.supplier, ttc: e.ttc, date: e.date }));
    const accounts = [...App.EXPENSE_CATEGORIES, ...App.REVENUE_ACCOUNTS.map(([a, l]) => ({ account: a, label: l })), { account: '750000', label: 'Intérêts reçus' }, { account: '100000', label: 'Apport de l\'exploitant / capital' }, { account: '489100', label: 'Compte courant dirigeant (prélèvement ou apport privé)' }, { account: '173000', label: 'Remboursement d\'emprunt (capital)' }, { account: '451800', label: 'Paiement de TVA au SPF Finances' }, { account: '411800', label: 'Remboursement de TVA reçu' }, { account: '412000', label: 'Versement anticipé d\'impôt' }, { account: '450000', label: 'Paiement d\'impôt (avertissement-extrait de rôle)' }, { account: '453000', label: 'Précompte professionnel' }, { account: '454000', label: 'ONSS' }, { account: '455000', label: 'Salaires nets' }, { account: '456000', label: 'Caisse d\'assurances sociales (cotisations sociales indépendant à payer)' }, { account: '499000', label: 'Compte d\'attente' }];
    const schema = {
      type: 'object', additionalProperties: false, required: ['results'],
      properties: { results: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'match_type', 'match_id', 'account', 'tva_rate', 'confidence', 'reason'], properties: {
        id: { type: 'string' }, match_type: { type: 'string', enum: ['invoice', 'expense', 'category'] }, match_id: { type: 'string' },
        account: { type: 'string' }, tva_rate: { type: 'number' }, confidence: { type: 'number' }, reason: { type: 'string' },
      } } } },
    };
    return structured(`Classe chaque opération bancaire. Si un encaissement correspond à une facture client ouverte (montant et nom), utilise match_type "invoice" avec son id. Si un débit correspond à une dépense non payée, "expense". Sinon "category" avec le compte PCMN le plus adapté et le taux de TVA belge probable inclus dans le montant (0 pour caisse d'assurances sociales, ONSS, SPF Finances, banque, assurances, salaires, emprunts, loyers non soumis ; 21 par défaut pour les achats courants ; 6 pour transports en commun ; 12 pour restaurant). Pour les cotisations sociales d'un indépendant personne physique, utilise 623000. Confiance basse si tu hésites.
Opérations : ${JSON.stringify(lines.map((b) => ({ id: b.id, date: b.date, libelle: b.label, montant: b.amount })))}
Factures clients ouvertes : ${JSON.stringify(openInvoices)}
Dépenses non payées : ${JSON.stringify(unpaidExpenses)}
Comptes disponibles : ${accounts.map((a) => a.account + ' ' + a.label).join(' | ')}`, schema);
  }

  /* Lecture d'une fiche BCE (texte copié depuis kbopub ou capture d'écran) */
  const COMPANY_SCHEMA = {
    type: 'object', additionalProperties: false,
    required: ['name', 'enterprise_number', 'legal_form', 'street', 'postcode', 'city', 'nace', 'start_date', 'vat_registered', 'status'],
    properties: {
      name: { type: 'string' }, enterprise_number: { type: 'string', description: '10 chiffres' }, legal_form: { type: 'string' },
      street: { type: 'string', description: 'Rue et numéro' }, postcode: { type: 'string' }, city: { type: 'string' },
      nace: { type: 'string', description: 'Code NACE principal (activité TVA si présente)' }, start_date: { type: 'string' },
      vat_registered: { type: 'boolean', description: 'Assujetti à la TVA selon la fiche' }, status: { type: 'string', description: 'Actif, radié…' },
    },
  };
  async function extractCompany(text, image) {
    const prompt = `Voici une fiche d'entreprise de la Banque-Carrefour des Entreprises (BCE, Belgique)${image ? ' (capture d\'écran jointe)' : ''}. Extrais les données d'identification de l'entreprise. N'invente rien : laisse vide ce qui n'apparaît pas.\n\n${text || ''}`;
    if (image && !sampleFn) {
      const data = await fileToBase64(image);
      return structured([{ type: 'image', source: { type: 'base64', media_type: image.type || 'image/png', data } }, { type: 'text', text: prompt }], COMPANY_SCHEMA);
    }
    return structured(prompt, COMPANY_SCHEMA, null, image ? [image] : null);
  }

  /* Analyse financière complète */
  const ANALYSIS = `Rédige une analyse financière complète de l'entreprise belge : 1) synthèse en 3 phrases, 2) rentabilité et marges, 3) structure des charges et pistes d'économies, 4) trésorerie et BFR (délais clients), 5) TVA (grilles), versements anticipés et échéances fiscales et sociales à venir, 6) anomalies ou incohérences détectées dans la saisie, 7) optimisations fiscales légales à étudier, 8) prévisions pour la fin d'exercice. Sois concret et chiffré.`;
  async function analyze(onText) {
    if (sampleFn) {
      try { const r = await sampleFn(`${SYSTEM}\n\n${contextBlock()}\n\n${ANALYSIS}`, { cache: false, modelTier: 'complex', onText: ({ text }) => onText && onText(text) }); return r.text; }
      catch (e) { throw sampleErr(e); }
    }
    const c = await client();
    const stream = c.beta.messages.stream(base({
      system: SYSTEM, max_tokens: 32000,
      messages: [{ role: 'user', content: `${contextBlock()}\n\nRédige une analyse financière complète de l'entreprise belge : 1) synthèse en 3 phrases, 2) rentabilité et marges, 3) structure des charges et pistes d'économies, 4) trésorerie et BFR (délais clients), 5) TVA (grilles), versements anticipés et échéances fiscales et sociales à venir, 6) anomalies ou incohérences détectées dans la saisie, 7) optimisations fiscales légales à étudier, 8) prévisions pour la fin d'exercice. Sois concret et chiffré.` }],
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

  const api = { extractCompany, init, isReady, builtin: false, ready: false, chat, scanDocument, categorizeBank, analyze, md, fileToBase64 };
  App.ai = api;
})(window.App);
