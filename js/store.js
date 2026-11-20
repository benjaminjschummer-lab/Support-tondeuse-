/* ComptaPro Belgique — stockage, modèle de données, plan comptable PCMN, utilitaires belges */
window.App = window.App || {};

(function (App) {
  const KEY = 'comptapro.be.v1';

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const today = () => new Date().toISOString().slice(0, 10);
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const eur = (n) => (Number(n) || 0).toLocaleString('fr-BE', { style: 'currency', currency: 'EUR' });
  const pct = (n) => (Number(n) || 0).toLocaleString('fr-BE', { maximumFractionDigits: 1 }) + ' %';
  const fdate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-BE') : '—');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Identifiants belges ---------- */
  const digits = (s) => String(s || '').replace(/\D/g, '');
  /* Numéro d'entreprise BCE : 10 chiffres, commence par 0 ou 1, contrôle modulo 97 */
  function bceValid(num) {
    const d = digits(num).padStart(10, '0');
    if (d.length !== 10 || !/^[01]/.test(d)) return false;
    return 97 - (Number(d.slice(0, 8)) % 97) === Number(d.slice(8));
  }
  function bceFormat(num) {
    const d = digits(num).padStart(10, '0');
    return d.length === 10 ? `${d.slice(0, 4)}.${d.slice(4, 7)}.${d.slice(7)}` : String(num || '');
  }
  const bceMake = (base8) => base8 + String(97 - (Number(base8) % 97)).padStart(2, '0');
  /* Numéro de TVA : BE + numéro d'entreprise ; autres pays UE : contrôle de format seulement */
  function vatParse(v) {
    const s = String(v || '').toUpperCase().replace(/[\s.\-]/g, '');
    const m = s.match(/^([A-Z]{2})?([0-9A-Z]+)$/);
    if (!m) return { country: '', number: '', valid: false, formatted: v };
    const country = m[1] || (digits(s).length === 10 ? 'BE' : '');
    const number = m[2];
    const valid = country === 'BE' ? bceValid(number) : number.length >= 8;
    return { country, number, valid, formatted: country === 'BE' ? 'BE' + digits(number).padStart(10, '0') : country + number };
  }
  /* Communication structurée belge (OGM-VCS) : 10 chiffres + 2 de contrôle modulo 97 */
  function structuredComm(seed) {
    let base = digits(seed).slice(-10).padStart(10, '0');
    let check = Number(base) % 97; if (check === 0) check = 97;
    const d = base + String(check).padStart(2, '0');
    return `+++${d.slice(0, 3)}/${d.slice(3, 7)}/${d.slice(7)}+++`;
  }
  function structuredValid(s) {
    const d = digits(s);
    if (d.length !== 12) return false;
    let check = Number(d.slice(0, 10)) % 97; if (check === 0) check = 97;
    return check === Number(d.slice(10));
  }
  const ibanClean = (s) => String(s || '').replace(/\s/g, '').toUpperCase();
  function ibanValid(s) {
    const i = ibanClean(s);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(i)) return false;
    const r = (i.slice(4) + i.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
    let mod = 0; for (const ch of r) mod = (mod * 10 + Number(ch)) % 97;
    return mod === 1;
  }
  const kboUrl = (num) => `https://kbopub.economie.fgov.be/kbopub/toonondernemingps.html?ondernemingsnummer=${digits(num).padStart(10, '0')}&lang=fr`;
  const viesUrl = () => 'https://ec.europa.eu/taxation_customs/vies/#/vat-validation';

  /* ---------- Plan comptable minimum normalisé (PCMN) — comptes utilisés ---------- */
  const EXPENSE_CATEGORIES = [
    { account: '600000', label: 'Achats de matières premières', grid: '81' },
    { account: '601000', label: 'Achats de fournitures', grid: '81' },
    { account: '604000', label: 'Achats de marchandises', grid: '81' },
    { account: '610000', label: 'Loyers et charges locatives', grid: '82' },
    { account: '611000', label: 'Entretien et réparations', grid: '82' },
    { account: '612000', label: 'Eau, gaz, électricité, chauffage', grid: '82' },
    { account: '612300', label: 'Fournitures de bureau', grid: '82' },
    { account: '612400', label: 'Petit matériel et outillage', grid: '82' },
    { account: '613100', label: 'Honoraires (comptable, avocat…)', grid: '82' },
    { account: '613200', label: 'Assurances', grid: '82' },
    { account: '613300', label: 'Téléphone, internet, poste', grid: '82' },
    { account: '613400', label: 'Logiciels et abonnements', grid: '82' },
    { account: '613500', label: 'Documentation, formations', grid: '82' },
    { account: '613600', label: 'Cotisations professionnelles', grid: '82' },
    { account: '614000', label: 'Publicité, annonces, marketing', grid: '82' },
    { account: '614500', label: 'Cadeaux d\'affaires', grid: '82' },
    { account: '615000', label: 'Sous-traitance', grid: '82' },
    { account: '616000', label: 'Frais de voiture (carburant, entretien)', grid: '82' },
    { account: '616500', label: 'Déplacements, transports, parking', grid: '82' },
    { account: '617000', label: 'Restaurant et réception', grid: '82' },
    { account: '617500', label: 'Hôtel, missions', grid: '82' },
    { account: '618000', label: 'Rémunération du gérant / administrateur', grid: '' },
    { account: '620000', label: 'Rémunérations du personnel', grid: '' },
    { account: '621000', label: 'Cotisations patronales ONSS', grid: '' },
    { account: '623000', label: 'Cotisations sociales de l\'indépendant', grid: '' },
    { account: '640000', label: 'Taxes et impôts (précompte immobilier, taxes communales…)', grid: '' },
    { account: '650000', label: 'Intérêts d\'emprunts', grid: '' },
    { account: '657000', label: 'Frais bancaires', grid: '' },
    { account: '660000', label: 'Charges exceptionnelles', grid: '' },
  ];
  /* Déductibilité de la TVA usuelle en Belgique (art. 45 CTVA) */
  const VAT_DEDUCTIBILITY = { '614500': 0, '616000': 50, '617000': 0, '617500': 100 };

  const ASSET_CATEGORIES = [
    { account: '211000', label: 'Logiciels, licences, brevets', duration: 3 },
    { account: '221000', label: 'Constructions, aménagements', duration: 20 },
    { account: '230000', label: 'Installations, machines, outillage', duration: 5 },
    { account: '240000', label: 'Mobilier', duration: 10 },
    { account: '241000', label: 'Matériel de bureau et informatique', duration: 3 },
    { account: '245000', label: 'Matériel roulant (véhicule)', duration: 5 },
  ];

  const REVENUE_ACCOUNTS = [['700000', '700000 — Ventes de marchandises'], ['701000', '701000 — Prestations de services'], ['704000', '704000 — Ventes de produits finis'], ['740000', '740000 — Subsides et autres produits d\'exploitation']];

  const ACCOUNT_LABELS = {
    '100000': 'Capital / fonds propres de l\'exploitant', '130000': 'Réserve légale', '133000': 'Réserves disponibles', '140000': 'Bénéfice reporté', '141000': 'Perte reportée',
    '173000': 'Emprunts auprès d\'établissements de crédit (> 1 an)', '400000': 'Clients', '411000': 'TVA à récupérer', '411800': 'Compte courant TVA — créance',
    '412000': 'Impôts à récupérer (versements anticipés)', '416000': 'Créances diverses', '440000': 'Fournisseurs', '450000': 'Dettes fiscales estimées (ISOC / IPP)',
    '451000': 'TVA à payer', '451800': 'Compte courant TVA — dette', '453000': 'Précomptes retenus', '454000': 'Office national de sécurité sociale',
    '455000': 'Rémunérations', '456000': 'Caisse d\'assurances sociales', '489000': 'Autres dettes diverses', '489100': 'Compte courant du dirigeant / associé',
    '499000': 'Compte d\'attente', '550000': 'Banque', '570000': 'Caisse', '630000': 'Dotations aux amortissements', '670000': 'Impôts sur le résultat',
    '700000': 'Ventes de marchandises', '701000': 'Prestations de services', '704000': 'Ventes de produits finis', '740000': 'Subsides et autres produits d\'exploitation',
    '750000': 'Produits financiers', '760000': 'Produits exceptionnels',
  };
  EXPENSE_CATEGORIES.forEach((c) => (ACCOUNT_LABELS[c.account] = c.label));
  ASSET_CATEGORIES.forEach((c) => { ACCOUNT_LABELS[c.account] = c.label; ACCOUNT_LABELS[c.account.slice(0, 3) + '900'] = 'Amort. actés — ' + c.label.toLowerCase(); });
  const accountLabel = (a) => ACCOUNT_LABELS[a] || ('Compte ' + a);

  const TVA_RATES = [21, 12, 6, 0];

  /* Régimes de TVA d'une facture de vente → grilles de la déclaration */
  const SALES_REGIMES = [
    ['normal', 'Normal (TVA belge)'],
    ['cocontractant', 'Autoliquidation — cocontractant belge (grille 45)'],
    ['intracom_services', 'Services intracommunautaires B2B (grille 44)'],
    ['intracom_biens', 'Livraison intracommunautaire de biens (grille 46)'],
    ['export', 'Exportation hors UE / exemption (grille 47)'],
    ['franchise', 'Franchise des petites entreprises (art. 56bis)'],
    ['exempte', 'Exemptée (art. 44 CTVA)'],
  ];
  const PURCHASE_REGIMES = [
    ['normal', 'Normal (TVA belge payée au fournisseur)'],
    ['intracom_biens', 'Achat intracommunautaire de biens (grille 86)'],
    ['intracom_services', 'Services reçus d\'un prestataire étranger (grille 88)'],
    ['cocontractant', 'Autoliquidation — cocontractant (grille 87)'],
  ];
  const LEGAL_MENTIONS = {
    cocontractant: 'Autoliquidation — TVA due par le cocontractant, art. 51, § 2, 1er al., 5° du CTVA.',
    intracom_services: 'Autoliquidation — art. 196 de la directive 2006/112/CE.',
    intracom_biens: 'Livraison intracommunautaire exemptée — art. 39bis du CTVA.',
    export: 'Exportation exemptée — art. 39 du CTVA.',
    franchise: 'Régime particulier de franchise des petites entreprises — TVA non applicable (art. 56bis du CTVA).',
    exempte: 'Opération exemptée de TVA — art. 44 du CTVA.',
  };

  /* Paramètres fiscaux indicatifs, modifiables dans Paramètres (à vérifier chaque année) */
  const DEFAULT_FISCAL = {
    isocReduitTaux: 20, isocReduitPlafond: 100000, isocNormalTaux: 25,
    ippTranches: [[16320, 25], [28800, 40], [49840, 45], [999999999, 50]],
    ippQuotiteExemptee: 10910, ippAdditionnelCommunal: 7,
    socialTaux1: 20.5, socialPlafond1: 72810.95, socialTaux2: 14.16, socialPlafond2: 107300.2, socialMinimumAnnuel: 3500,
    franchiseSeuil: 25000, listingSeuil: 250,
  };

  const defaultState = () => ({
    version: 2,
    settings: {
      company: {
        name: 'Mon entreprise', legalForm: 'SRL', enterpriseNumber: '', address: '', postcode: '', city: '', country: 'BE', email: '', phone: '', iban: '', bic: '', website: '', nace: '',
        regimeTva: 'normal', // normal | franchise | exempte
        tvaPeriod: 'trimestrielle', // mensuelle | trimestrielle
        impot: 'ISOC', // ISOC (société) | IPP (personne physique)
        fiscalYearStart: '01-01',
        invoicePrefix: 'F', quotePrefix: 'D', creditPrefix: 'NC',
        paymentTerms: 30,
        legalMentions: 'En cas de retard de paiement, des intérêts de retard au taux légal (loi du 2 août 2002) et une indemnité forfaitaire de 40 € sont dus de plein droit, sans mise en demeure.',
        autoAI: true,
      },
      fiscal: Object.assign({}, DEFAULT_FISCAL),
      ai: { apiKey: '', model: 'claude-opus-5-5', effort: 'medium' },
      opening: { capital: 0, reserves: 0, resultatReporte: 0, emprunts: 0, banque: 0, compteCourant: 0 },
    },
    clients: [],
    suppliers: [],
    invoices: [],
    expenses: [],
    bank: [],
    bankRules: [],
    assets: [],
    entries: [],
    tvaDeclarations: [],
    closings: [],
    aiChat: [],
  });

  let state = load();

  function migrate(s) {
    const d = defaultState();
    const out = Object.assign(d, s);
    out.settings = Object.assign(d.settings, s.settings || {});
    out.settings.company = Object.assign(defaultState().settings.company, (s.settings || {}).company || {});
    out.settings.fiscal = Object.assign({}, DEFAULT_FISCAL, (s.settings || {}).fiscal || {});
    out.settings.opening = Object.assign(defaultState().settings.opening, (s.settings || {}).opening || {});
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { console.warn('Lecture impossible', e); }
    return defaultState();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { /* stockage local indisponible : la synchronisation prend le relais */ }
    scheduleCloud();
  }

  /* ---- Synchronisation dans l'espace privé de l'utilisateur (quand l'app tourne sur claude.ai) ---- */
  let cloud = null, cloudTimer = null, savedReceipts = {};
  const clean = (o) => JSON.parse(JSON.stringify(o));
  function scheduleCloud() {
    if (!cloud) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(pushCloud, 800);
  }
  async function pushCloud() {
    if (!cloud) return;
    try {
      const copy = clean(state);
      copy.settings.ai.apiKey = '';
      const receipts = {};
      copy.expenses.forEach((e) => { if (e.receipt) { receipts[e.id] = e.receipt; e.receipt = 'cloud'; } });
      await cloud.col.doc('state_be').set({ json: JSON.stringify(copy), savedAt: new Date().toISOString() });
      for (const [id, data] of Object.entries(receipts)) {
        if (savedReceipts[id] === data.length) continue;
        await cloud.col.doc('r_' + id).set({ data });
        savedReceipts[id] = data.length;
      }
      for (const id of Object.keys(savedReceipts)) {
        if (!receipts[id]) { await cloud.col.doc('r_' + id).delete().catch(() => {}); delete savedReceipts[id]; }
      }
      App.cloudStatus = 'ok';
    } catch (e) { App.cloudStatus = 'error'; console.warn('Synchronisation impossible', e); }
  }
  async function initCloud(onLoaded) {
    if (!window.claude || !window.claude.use) return;
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return;
      const id = await user.id();
      if (!id) return;
      const col = db.collection('data/users/' + id);
      const snap = await Promise.race([col.get(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
      const docs = {};
      snap.docs.forEach((d) => (docs[d.id] = d.data()));
      cloud = { col };
      if (docs.state_be && docs.state_be.json) {
        const key = state.settings.ai.apiKey;
        const loaded = JSON.parse(docs.state_be.json);
        loaded.expenses.forEach((e) => {
          if (e.receipt === 'cloud') {
            const r = docs['r_' + e.id];
            e.receipt = r ? r.data : '';
            if (r) savedReceipts[e.id] = r.data.length;
          }
        });
        state = migrate(loaded);
        state.settings.ai.apiKey = key;
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
      } else if (state.invoices.length || state.expenses.length) {
        pushCloud();
      }
      App.cloudStatus = 'ok';
      onLoaded && onLoaded();
    } catch (e) { App.cloudStatus = 'error'; console.warn('Espace de stockage indisponible', e); }
  }

  function replace(newState) { state = migrate(newState); save(); }
  function reset() { state = defaultState(); save(); }

  /* Montants d'une facture (vente) */
  function invoiceTotals(inv) {
    const byRate = {};
    const noVat = inv.vatRegime && inv.vatRegime !== 'normal';
    let ht = 0, tva = 0;
    (inv.lines || []).forEach((l) => {
      const lht = round2((Number(l.qty) || 0) * (Number(l.unitPrice) || 0) * (1 - (Number(l.discount) || 0) / 100));
      const rate = noVat ? 0 : Number(l.tvaRate) || 0;
      ht += lht;
      byRate[rate] = byRate[rate] || { base: 0, tva: 0 };
      byRate[rate].base = round2(byRate[rate].base + lht);
    });
    // TVA calculée par taux sur le total HT (cohérent avec la facture électronique Peppol)
    Object.entries(byRate).forEach(([rate, v]) => { v.tva = round2(v.base * Number(rate) / 100); tva += v.tva; });
    const sign = inv.type === 'avoir' ? -1 : 1;
    return { ht: round2(ht) * sign, tva: round2(tva) * sign, ttc: round2(ht + tva) * sign, byRate, sign };
  }

  function nextNumber(type) {
    const c = state.settings.company;
    const prefix = type === 'devis' ? c.quotePrefix : type === 'avoir' ? c.creditPrefix : c.invoicePrefix;
    const year = new Date().getFullYear();
    const nums = state.invoices.filter((i) => i.type === type && (i.number || '').startsWith(`${prefix}${year}-`))
      .map((i) => parseInt(i.number.split('-').pop(), 10) || 0);
    return `${prefix}${year}-${String((Math.max(0, ...nums) + 1)).padStart(4, '0')}`;
  }
  const invoiceComm = (inv) => inv.structuredComm || structuredComm(digits(inv.number).padStart(10, '0'));

  function fiscalYear(year) {
    const [mm, dd] = (state.settings.company.fiscalYearStart || '01-01').split('-');
    const start = `${year}-${mm}-${dd}`;
    const endDate = new Date(Number(year) + 1, Number(mm) - 1, Number(dd));
    endDate.setDate(endDate.getDate() - 1);
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    return { start, end, label: mm === '01' && dd === '01' ? String(year) : `${start} → ${end}` };
  }

  function addDays(date, n) {
    const dt = new Date(date + 'T00:00:00');
    dt.setDate(dt.getDate() + Number(n || 0));
    return dt.toISOString().slice(0, 10);
  }

  /* Données de démonstration (entreprise belge fictive) */
  function loadDemo() {
    const y = new Date().getFullYear();
    const d = (m, day) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const s = defaultState();
    s.settings.company = Object.assign(s.settings.company, {
      name: 'Atelier Lumière SRL (démo)', legalForm: 'SRL', enterpriseNumber: bceMake('07123456'),
      address: 'Rue de la Loi 12', postcode: '1000', city: 'Bruxelles', email: 'contact@exemple.be', iban: 'BE71 0961 2345 6769', bic: 'GKCCBEBB',
    });
    s.settings.opening = { capital: 18600, reserves: 0, resultatReporte: 0, emprunts: 10000, banque: 28600, compteCourant: 0 };
    const c1 = { id: uid(), name: 'Agence Horizon SA (démo)', email: 'compta@exemple.be', address: 'Avenue Louise 54, 1050 Ixelles', vatNumber: 'BE' + bceMake('04567891'), country: 'BE' };
    const c2 = { id: uid(), name: 'Boulangerie Martin (démo)', email: 'martin@exemple.be', address: 'Place du Marché 3, 4000 Liège', vatNumber: 'BE' + bceMake('08765432'), country: 'BE' };
    const c3 = { id: uid(), name: 'TechNova BV (démo)', email: 'ap@exemple.nl', address: 'Keizersgracht 10, Amsterdam', vatNumber: 'NL123456789B01', country: 'NL' };
    const c4 = { id: uid(), name: 'Mme Dupont (particulier, démo)', email: '', address: 'Rue Haute 8, 5000 Namur', vatNumber: '', country: 'BE' };
    s.clients = [c1, c2, c3, c4];
    const inv = (n, client, date, lines, status, paidDate, vatRegime) => ({
      id: uid(), type: 'facture', number: `F${y}-${String(n).padStart(4, '0')}`, clientId: client.id, date,
      dueDate: addDays(date, 30), lines, status, paidDate: paidDate || '', notes: '', vatRegime: vatRegime || 'normal', revenueAccount: '701000',
    });
    s.invoices = [
      inv(1, c1, d(1, 15), [{ desc: 'Identité visuelle complète', qty: 1, unitPrice: 4500, tvaRate: 21 }], 'payee', d(2, 10)),
      inv(2, c2, d(2, 20), [{ desc: 'Shooting photo produits', qty: 1, unitPrice: 800, tvaRate: 21 }, { desc: 'Retouches', qty: 10, unitPrice: 35, tvaRate: 21 }], 'payee', d(3, 5)),
      inv(3, c3, d(3, 28), [{ desc: 'Refonte site web', qty: 1, unitPrice: 9800, tvaRate: 0 }], 'payee', d(5, 2), 'intracom_services'),
      inv(4, c1, d(5, 30), [{ desc: 'Campagne réseaux sociaux', qty: 3, unitPrice: 1200, tvaRate: 21 }], 'payee', d(6, 28)),
      inv(5, c4, d(6, 12), [{ desc: 'Portrait de famille', qty: 1, unitPrice: 350, tvaRate: 21 }], 'payee', d(6, 12)),
      inv(6, c1, d(9, 12), [{ desc: 'Maintenance annuelle', qty: 12, unitPrice: 250, tvaRate: 21 }], 'envoyee'),
      inv(7, c2, d(10, 3), [{ desc: 'Brochure (conception)', qty: 1, unitPrice: 1450, tvaRate: 21 }], 'envoyee'),
    ];
    s.invoices.push({ id: uid(), type: 'devis', number: `D${y}-0001`, clientId: c3.id, date: d(10, 1), dueDate: d(10, 31), lines: [{ desc: 'Application mobile — phase 1', qty: 1, unitPrice: 18000, tvaRate: 0 }], status: 'envoyee', notes: '', vatRegime: 'intracom_services' });
    const exp = (date, supplier, account, description, ht, rate, extra) => {
      const ded = VAT_DEDUCTIBILITY[account] ?? 100;
      return Object.assign({ id: uid(), date, supplier, account, description, ht, tvaRate: rate, tva: round2(ht * rate / 100), ttc: round2(ht * (1 + rate / 100)), deductiblePct: ded, vatRegime: 'normal', paid: true, paidDate: date, paymentMethod: 'virement', receipt: '' }, extra || {});
    };
    s.expenses = [
      exp(d(1, 5), 'Immo Centre (démo)', '610000', 'Loyer bureau janvier', 900, 0),
      exp(d(2, 5), 'Immo Centre (démo)', '610000', 'Loyer bureau février', 900, 0),
      exp(d(3, 5), 'Immo Centre (démo)', '610000', 'Loyer bureau mars', 900, 0),
      exp(d(1, 10), 'Adobe Ireland', '613400', 'Creative Cloud annuel', 720, 0, { vatRegime: 'intracom_services' }),
      exp(d(2, 14), 'SNCB', '616500', 'Train Bruxelles–Gand client', 42, 6),
      exp(d(3, 2), 'AG Insurance', '613200', 'RC professionnelle', 480, 0),
      exp(d(4, 18), 'Brasserie du Parc', '617000', 'Lunch client Horizon', 85, 12),
      exp(d(5, 6), 'Proximus', '613300', 'Internet + mobile', 60, 21),
      exp(d(6, 20), 'Fiduciaire Dubois', '613100', 'Honoraires comptables', 650, 21),
      exp(d(8, 1), 'TotalEnergies', '616000', 'Carburant', 120, 21),
    ];
    s.assets = [{ id: uid(), label: 'MacBook Pro 16"', account: '241000', date: d(2, 1), value: 3200, tvaRate: 21, duration: 3, supplier: 'Apple', paid: true }];
    s.bank = [
      { id: uid(), date: d(10, 3), label: 'DOMICILIATION CAISSE D\'ASSURANCES SOCIALES', amount: -890, matched: null },
      { id: uid(), date: d(10, 8), label: 'VIREMENT AGENCE HORIZON SA', amount: 3630, matched: null, comm: structuredComm(`00${y}0006`) },
      { id: uid(), date: d(10, 12), label: 'PAIEMENT BANCONTACT COLRUYT', amount: -64.9, matched: null },
    ];
    state = migrate(s);
    save();
  }

  Object.defineProperty(App, 'state', { get: () => state, configurable: true });
  Object.assign(App, {
    save, replace, reset, loadDemo, initCloud, uid, today, round2, eur, pct, fdate, esc, addDays, digits,
    invoiceTotals, nextNumber, invoiceComm, fiscalYear, accountLabel,
    bceValid, bceFormat, bceMake, vatParse, structuredComm, structuredValid, ibanClean, ibanValid, kboUrl, viesUrl,
    EXPENSE_CATEGORIES, ASSET_CATEGORIES, REVENUE_ACCOUNTS, TVA_RATES, ACCOUNT_LABELS, VAT_DEDUCTIBILITY,
    SALES_REGIMES, PURCHASE_REGIMES, LEGAL_MENTIONS, DEFAULT_FISCAL,
  });
})(window.App);
