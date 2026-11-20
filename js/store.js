/* ComptaPro — stockage local, modèle de données, utilitaires */
window.App = window.App || {};

(function (App) {
  const KEY = 'comptapro.v1';

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const today = () => new Date().toISOString().slice(0, 10);
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const eur = (n) => (Number(n) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const pct = (n) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
  const fdate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR') : '—');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Plan comptable (PCG) simplifié : catégories de dépenses proposées */
  const EXPENSE_CATEGORIES = [
    { account: '601000', label: 'Achats de matières premières' },
    { account: '606100', label: 'Eau, énergie' },
    { account: '606300', label: 'Petit équipement (< 500 € HT)' },
    { account: '606400', label: 'Fournitures de bureau' },
    { account: '607000', label: 'Achats de marchandises' },
    { account: '611000', label: 'Sous-traitance' },
    { account: '613200', label: 'Loyers immobiliers' },
    { account: '613500', label: 'Locations mobilières / leasing' },
    { account: '615000', label: 'Entretien et réparations' },
    { account: '616000', label: 'Assurances' },
    { account: '618000', label: 'Documentation, formation' },
    { account: '622600', label: 'Honoraires (comptable, avocat…)' },
    { account: '623000', label: 'Publicité, marketing' },
    { account: '625100', label: 'Déplacements, transports' },
    { account: '625600', label: 'Missions, hôtels' },
    { account: '625700', label: 'Réceptions, repas d\'affaires' },
    { account: '626000', label: 'Télécom, internet, poste' },
    { account: '627000', label: 'Frais bancaires' },
    { account: '628100', label: 'Cotisations professionnelles' },
    { account: '651000', label: 'Logiciels, abonnements SaaS' },
    { account: '635100', label: 'Impôts et taxes (CFE…)' },
    { account: '641000', label: 'Rémunération du personnel / dirigeant' },
    { account: '645000', label: 'Charges sociales (URSSAF…)' },
    { account: '661100', label: 'Intérêts d\'emprunt' },
    { account: '671000', label: 'Charges exceptionnelles' },
  ];

  const ASSET_CATEGORIES = [
    { account: '205000', label: 'Logiciels, brevets', duration: 3 },
    { account: '213500', label: 'Agencements, installations', duration: 10 },
    { account: '215400', label: 'Matériel industriel / outillage', duration: 5 },
    { account: '218200', label: 'Matériel de transport (véhicule)', duration: 5 },
    { account: '218300', label: 'Matériel informatique', duration: 3 },
    { account: '218400', label: 'Mobilier', duration: 10 },
  ];

  const ACCOUNT_LABELS = {
    '101000': 'Capital social', '108000': 'Compte de l\'exploitant', '110000': 'Report à nouveau', '120000': 'Résultat de l\'exercice',
    '164000': 'Emprunts bancaires', '401000': 'Fournisseurs', '404000': 'Fournisseurs d\'immobilisations', '411000': 'Clients',
    '421000': 'Personnel - rémunérations dues', '431000': 'URSSAF', '444000': 'État - impôt sur les bénéfices',
    '445510': 'TVA à décaisser', '445620': 'TVA déductible sur immobilisations', '445660': 'TVA déductible sur ABS',
    '445670': 'Crédit de TVA à reporter', '445710': 'TVA collectée', '455000': 'Associés - comptes courants',
    '467000': 'Autres débiteurs / créditeurs', '471000': 'Compte d\'attente', '512000': 'Banque', '530000': 'Caisse',
    '681100': 'Dotations aux amortissements', '695000': 'Impôt sur les sociétés',
    '706000': 'Prestations de services', '707000': 'Ventes de marchandises', '708000': 'Produits des activités annexes',
    '740000': 'Subventions d\'exploitation', '758000': 'Produits divers de gestion', '768000': 'Produits financiers', '771000': 'Produits exceptionnels',
  };
  EXPENSE_CATEGORIES.forEach((c) => (ACCOUNT_LABELS[c.account] = c.label));
  ASSET_CATEGORIES.forEach((c) => {
    ACCOUNT_LABELS[c.account] = c.label;
    ACCOUNT_LABELS['28' + c.account.slice(1)] = 'Amort. ' + c.label.toLowerCase();
  });
  const accountLabel = (a) => ACCOUNT_LABELS[a] || ('Compte ' + a);

  const TVA_RATES = [20, 10, 5.5, 2.1, 0];

  const defaultState = () => ({
    version: 1,
    settings: {
      company: {
        name: 'Mon entreprise', legalForm: 'EURL', siret: '', tvaNumber: '', address: '', email: '', phone: '', iban: '', bic: '',
        regimeTva: 'reel_normal', // franchise | reel_simplifie | reel_normal
        tvaPeriod: 'mensuelle', // mensuelle | trimestrielle | annuelle
        exigibilite: 'debits', // debits | encaissements
        impot: 'IS', // IS | IR
        fiscalYearStart: '01-01',
        invoicePrefix: 'F', quotePrefix: 'D', creditPrefix: 'AV',
        paymentTerms: 30,
        legalMentions: 'Pénalités de retard : 3 fois le taux d\'intérêt légal. Indemnité forfaitaire pour frais de recouvrement : 40 €.',
      },
      ai: { apiKey: '', model: 'claude-opus-5-5', effort: 'medium' },
      opening: { capital: 0, reportANouveau: 0, emprunts: 0, banque: 0, comptesCourants: 0 },
    },
    clients: [],
    suppliers: [],
    invoices: [],
    expenses: [],
    bank: [],
    assets: [],
    entries: [],
    tvaDeclarations: [],
    closings: [],
    aiChat: [],
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { console.warn('Lecture impossible', e); }
    return defaultState();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { App.toast && App.toast('Stockage plein : exportez une sauvegarde et supprimez des justificatifs volumineux.', 'error'); }
  }

  function replace(newState) { state = Object.assign(defaultState(), newState); save(); }
  function reset() { state = defaultState(); save(); }

  /* Montants d'une facture */
  function invoiceTotals(inv) {
    const byRate = {};
    let ht = 0, tva = 0;
    (inv.lines || []).forEach((l) => {
      const lht = round2((Number(l.qty) || 0) * (Number(l.unitPrice) || 0) * (1 - (Number(l.discount) || 0) / 100));
      const rate = Number(l.tvaRate) || 0;
      const ltva = round2(lht * rate / 100);
      ht += lht; tva += ltva;
      byRate[rate] = byRate[rate] || { base: 0, tva: 0 };
      byRate[rate].base = round2(byRate[rate].base + lht);
      byRate[rate].tva = round2(byRate[rate].tva + ltva);
    });
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

  /* Exercice comptable contenant une date */
  function fiscalYear(year) {
    const [mm, dd] = (state.settings.company.fiscalYearStart || '01-01').split('-');
    const start = `${year}-${mm}-${dd}`;
    const endDate = new Date(Number(year) + 1, Number(mm) - 1, Number(dd));
    endDate.setDate(endDate.getDate() - 1);
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    return { start, end, label: mm === '01' && dd === '01' ? String(year) : `${start} → ${end}` };
  }

  /* Données de démonstration */
  function loadDemo() {
    const y = new Date().getFullYear();
    const d = (m, day) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const s = defaultState();
    s.settings.company = Object.assign(s.settings.company, {
      name: 'Studio Lumière SARL', legalForm: 'SARL', siret: '123 456 789 00012', tvaNumber: 'FR12123456789',
      address: '12 rue des Lilas\n75011 Paris', email: 'contact@studio-lumiere.fr', iban: 'FR76 3000 6000 0112 3456 7890 189', bic: 'AGRIFRPP',
    });
    s.settings.opening = { capital: 5000, reportANouveau: 0, emprunts: 10000, banque: 15000, comptesCourants: 0 };
    const c1 = { id: uid(), name: 'Agence Horizon', email: 'compta@horizon.fr', address: '5 av. Foch, 69006 Lyon', siret: '', tvaNumber: 'FR55987654321' };
    const c2 = { id: uid(), name: 'Boulangerie Martin', email: 'martin@gmail.com', address: '3 place du Marché, 33000 Bordeaux', siret: '', tvaNumber: '' };
    const c3 = { id: uid(), name: 'TechNova SAS', email: 'ap@technova.io', address: '40 rue de Rivoli, 75004 Paris', siret: '', tvaNumber: 'FR33456789123' };
    s.clients = [c1, c2, c3];
    s.suppliers = [{ id: uid(), name: 'OVHcloud' }, { id: uid(), name: 'SNCF' }, { id: uid(), name: 'Apple Store' }];
    const inv = (n, client, date, lines, status, paidDate) => ({
      id: uid(), type: 'facture', number: `F${y}-${String(n).padStart(4, '0')}`, clientId: client.id, date,
      dueDate: addDays(date, 30), lines, status, paidDate: paidDate || '', notes: '',
    });
    s.invoices = [
      inv(1, c1, d(1, 15), [{ desc: 'Identité visuelle complète', qty: 1, unitPrice: 4500, tvaRate: 20 }], 'payee', d(2, 10)),
      inv(2, c2, d(2, 20), [{ desc: 'Shooting photo produits', qty: 1, unitPrice: 800, tvaRate: 20 }, { desc: 'Retouches', qty: 10, unitPrice: 35, tvaRate: 20 }], 'payee', d(3, 5)),
      inv(3, c3, d(3, 28), [{ desc: 'Refonte site web', qty: 1, unitPrice: 9800, tvaRate: 20 }], 'payee', d(5, 2)),
      inv(4, c1, d(5, 30), [{ desc: 'Campagne réseaux sociaux', qty: 3, unitPrice: 1200, tvaRate: 20 }], 'payee', d(6, 28)),
      inv(5, c3, d(7, 12), [{ desc: 'Maintenance annuelle', qty: 12, unitPrice: 250, tvaRate: 20 }], 'envoyee'),
      inv(6, c2, d(9, 3), [{ desc: 'Brochure imprimée (conception)', qty: 1, unitPrice: 1450, tvaRate: 20 }], 'envoyee'),
    ];
    s.invoices.push({ id: uid(), type: 'devis', number: `D${y}-0001`, clientId: c3.id, date: d(10, 1), dueDate: d(10, 31), lines: [{ desc: 'Application mobile — phase 1', qty: 1, unitPrice: 18000, tvaRate: 20 }], status: 'envoyee', notes: '' });
    const exp = (date, supplier, account, description, ht, rate, extra) => Object.assign({
      id: uid(), date, supplier, account, description, ht, tvaRate: rate, tva: round2(ht * rate / 100), ttc: round2(ht * (1 + rate / 100)), paid: true, paymentMethod: 'virement', receipt: '',
    }, extra || {});
    s.expenses = [
      exp(d(1, 5), 'Foncia', '613200', 'Loyer bureau janvier', 900, 20),
      exp(d(2, 5), 'Foncia', '613200', 'Loyer bureau février', 900, 20),
      exp(d(3, 5), 'Foncia', '613200', 'Loyer bureau mars', 900, 20),
      exp(d(1, 10), 'Adobe', '651000', 'Creative Cloud annuel', 720, 20),
      exp(d(2, 14), 'SNCF', '625100', 'Train Paris-Lyon client', 96, 10),
      exp(d(3, 2), 'AXA', '616000', 'RC Pro annuelle', 480, 0),
      exp(d(4, 18), 'Restaurant Le Zinc', '625700', 'Déjeuner client Horizon', 85, 10),
      exp(d(5, 6), 'Bouygues Telecom', '626000', 'Box + mobile', 60, 20),
      exp(d(6, 20), 'Cabinet Durand', '622600', 'Honoraires juridiques', 650, 20),
      exp(d(8, 1), 'Google Ads', '623000', 'Publicité en ligne', 400, 20),
    ];
    s.assets = [{ id: uid(), label: 'MacBook Pro 16"', account: '218300', date: d(2, 1), value: 3200, tvaRate: 20, duration: 3, supplier: 'Apple Store' }];
    s.bank = [
      { id: uid(), date: d(10, 3), label: 'PRLV SEPA URSSAF', amount: -1250, matched: null },
      { id: uid(), date: d(10, 8), label: 'VIR AGENCE HORIZON', amount: 950, matched: null },
      { id: uid(), date: d(10, 12), label: 'CB AMAZON MKTP FR', amount: -64.9, matched: null },
    ];
    state = Object.assign(defaultState(), s);
    save();
  }

  function addDays(date, n) {
    const dt = new Date(date + 'T00:00:00');
    dt.setDate(dt.getDate() + Number(n || 0));
    return dt.toISOString().slice(0, 10);
  }

  Object.defineProperty(App, 'state', { get: () => state, configurable: true });
  Object.assign(App, {
    save, replace, reset, loadDemo, uid, today, round2, eur, pct, fdate, esc, addDays,
    invoiceTotals, nextNumber, fiscalYear, accountLabel,
    EXPENSE_CATEGORIES, ASSET_CATEGORIES, TVA_RATES, ACCOUNT_LABELS,
  });
})(window.App);
