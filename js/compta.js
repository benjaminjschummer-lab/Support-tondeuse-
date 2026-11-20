/* ComptaPro Belgique — moteur comptable : partie double PCMN, TVA (grilles), amortissements,
   comptes annuels (schéma BNB), Intervat, listing clients, Peppol UBL, CODA, échéancier */
(function (App) {
  const { round2 } = App;

  function line(account, amount, label) {
    const a = round2(amount);
    if (!a) return null;
    return { account, label: label || '', debit: a > 0 ? a : 0, credit: a < 0 ? -a : 0 };
  }
  function entry(id, date, journal, ref, label, lines, source) {
    return { id, date, journal, ref, label, lines: lines.filter(Boolean), source };
  }
  const JOURNALS = { OUV: 'Ouverture', VEN: 'Ventes', ACH: 'Achats', FIN: 'Financier (banque)', OD: 'Opérations diverses' };
  const AUTOLIQ = ['intracom_biens', 'intracom_services', 'cocontractant'];

  /* Détail TVA d'une dépense : déductible / non déductible / autoliquidée */
  function expenseVat(e) {
    const tva = Number(e.tva) || 0;
    const pct = e.deductiblePct ?? 100;
    const ded = round2(tva * pct / 100);
    return { tva, ded, nonDed: round2(tva - ded), autoliq: AUTOLIQ.includes(e.vatRegime) };
  }
  function assetVat(a) {
    const tva = round2((Number(a.value) || 0) * (Number(a.tvaRate) || 0) / 100);
    const pct = a.deductiblePct ?? (a.account === '245000' ? 50 : 100);
    const ded = round2(tva * pct / 100);
    return { tva, ded, nonDed: round2(tva - ded) };
  }

  /* Amortissement linéaire, prorata temporis la 1re année (règle belge depuis 2020) */
  function depreciationSchedule(asset) {
    const rows = [];
    const base = (Number(asset.value) || 0) + assetVat(asset).nonDed;
    const years = Math.max(1, Number(asset.duration) || 1);
    const annual = base / years;
    const start = new Date(asset.date + 'T00:00:00');
    let y = start.getFullYear();
    if (asset.date < App.fiscalYear(y).start) y -= 1;
    const first = App.fiscalYear(y);
    let remaining = base, cumul = 0;
    while (remaining > 0.005 && rows.length < 60) {
      const fy = App.fiscalYear(y);
      let dot;
      if (y === Number(first.start.slice(0, 4))) {
        const days = (new Date(fy.end + 'T00:00:00') - start) / 86400000 + 1;
        const total = (new Date(fy.end + 'T00:00:00') - new Date(fy.start + 'T00:00:00')) / 86400000 + 1;
        dot = annual * Math.min(1, days / total);
      } else dot = annual;
      dot = round2(Math.min(remaining, dot));
      if (remaining - dot < 0.01) dot = round2(remaining);
      cumul = round2(cumul + dot); remaining = round2(base - cumul);
      rows.push({ year: y, end: fy.end, dotation: dot, cumul, vnc: remaining });
      y++;
    }
    return rows;
  }
  const amortAccount = (account) => account.slice(0, 3) + '900';

  function buildJournal() {
    const s = App.state, out = [];
    const nowYear = new Date().getFullYear();

    const o = s.settings.opening || {};
    const dates = [...s.invoices.map((i) => i.date), ...s.expenses.map((e) => e.date), ...s.bank.map((b) => b.date), ...s.assets.map((a) => a.date)].filter(Boolean).sort();
    const firstYear = dates.length ? Number(dates[0].slice(0, 4)) : nowYear;
    let fyFirst = App.fiscalYear(firstYear);
    if (dates.length && dates[0] < fyFirst.start) fyFirst = App.fiscalYear(firstYear - 1);
    const n = (k) => Number(o[k]) || 0;
    const passifOpen = n('capital') + n('reserves') + n('resultatReporte') + n('emprunts') + n('compteCourant');
    if (passifOpen || n('banque')) {
      out.push(entry('OUV', fyFirst.start, 'OUV', 'OUV', 'Bilan d\'ouverture', [
        line('550000', n('banque')), line('100000', -n('capital')), line('133000', -n('reserves')),
        line(n('resultatReporte') >= 0 ? '140000' : '141000', -n('resultatReporte')), line('173000', -n('emprunts')), line('489100', -n('compteCourant')),
        line('499000', passifOpen - n('banque'), 'Écart d\'ouverture à justifier'),
      ], { type: 'opening' }));
    }

    // Ventes
    s.invoices.filter((i) => i.type !== 'devis' && !['brouillon', 'annulee'].includes(i.status)).forEach((inv) => {
      const t = App.invoiceTotals(inv);
      const client = s.clients.find((c) => c.id === inv.clientId);
      const lbl = `${inv.number} ${client ? client.name : ''}`.trim();
      const lines = [line('400000', t.ttc, lbl)];
      Object.entries(t.byRate).forEach(([rate, v]) => {
        lines.push(line(inv.revenueAccount || '701000', -v.base * t.sign, `${lbl} (HT ${rate} %)`));
        lines.push(line('451000', -v.tva * t.sign, `${lbl} TVA ${rate} %`));
      });
      out.push(entry('VEN-' + inv.id, inv.date, 'VEN', inv.number, lbl, lines, { type: 'invoice', id: inv.id }));
      if (inv.status === 'payee') {
        out.push(entry('FINV-' + inv.id, inv.paidDate || inv.date, 'FIN', inv.number, 'Encaissement ' + lbl, [line('550000', t.ttc), line('400000', -t.ttc)], { type: 'invoice', id: inv.id }));
      }
    });

    // Achats
    s.expenses.forEach((e) => {
      const lbl = `${e.supplier || ''} ${e.description || ''}`.trim();
      const ref = e.ref || ('ACH-' + e.id.slice(-5).toUpperCase());
      const v = expenseVat(e);
      const ht = Number(e.ht) || 0;
      const lines = [line(e.account || '499000', ht + v.nonDed, lbl), line('411000', v.ded, 'TVA déductible ' + lbl)];
      if (v.autoliq) { lines.push(line('451000', -v.tva, 'TVA autoliquidée ' + lbl)); lines.push(line('440000', -ht, lbl)); }
      else lines.push(line('440000', -(ht + v.tva), lbl));
      out.push(entry('ACH-' + e.id, e.date, 'ACH', ref, lbl, lines, { type: 'expense', id: e.id }));
      if (e.paid) {
        const paidAmount = v.autoliq ? ht : ht + v.tva;
        const treso = e.paymentMethod === 'especes' ? '570000' : e.paymentMethod === 'prive' ? '489100' : '550000';
        out.push(entry('FINA-' + e.id, e.paidDate || e.date, 'FIN', ref, 'Paiement ' + lbl, [line('440000', paidAmount), line(treso, -paidAmount)], { type: 'expense', id: e.id }));
      }
    });

    // Immobilisations et amortissements
    s.assets.forEach((a) => {
      const v = assetVat(a);
      const value = Number(a.value) || 0;
      out.push(entry('IM-' + a.id, a.date, 'ACH', 'IMMO', 'Acquisition ' + a.label, [line(a.account, value + v.nonDed), line('411000', v.ded), line('440000', -(value + v.tva))], { type: 'asset', id: a.id }));
      if (a.paid !== false) out.push(entry('FINI-' + a.id, a.date, 'FIN', 'IMMO', 'Paiement ' + a.label, [line('440000', value + v.tva), line('550000', -(value + v.tva))], { type: 'asset', id: a.id }));
      depreciationSchedule(a).forEach((r) => {
        if (r.year > nowYear) return;
        out.push(entry(`DOT-${a.id}-${r.year}`, r.end, 'OD', 'AMO' + r.year, `Amortissement ${r.year} ${a.label}`, [line('630000', r.dotation), line(amortAccount(a.account), -r.dotation)], { type: 'asset', id: a.id }));
      });
    });

    // Banque : opérations catégorisées directement
    s.bank.forEach((b) => {
      const m = b.matched;
      if (!m || m.type !== 'category') return;
      const amount = Number(b.amount), rate = Number(m.tvaRate) || 0;
      const ttc = Math.abs(amount), ht = round2(ttc / (1 + rate / 100)), tva = round2(ttc - ht);
      const isCharge = /^6/.test(m.account);
      const lines = amount < 0
        ? [line(m.account, isCharge ? ht : ttc), isCharge ? line('411000', tva) : null, line('550000', -ttc)]
        : [line('550000', ttc), line(m.account, /^7/.test(m.account) ? -ht : -ttc), /^7/.test(m.account) ? line('451000', -tva) : null];
      out.push(entry('FINC-' + b.id, b.date, 'FIN', 'EXTR', b.label, lines, { type: 'bank', id: b.id }));
    });

    // Déclarations de TVA validées : liquidation sur le compte courant TVA
    s.tvaDeclarations.forEach((d) => {
      const due = round2((d.grids['54'] || 0) + (d.grids['55'] || 0) + (d.grids['56'] || 0) + (d.grids['57'] || 0) + (d.grids['61'] || 0) + (d.grids['63'] || 0));
      const ded = round2((d.grids['59'] || 0) + (d.grids['62'] || 0) + (d.grids['64'] || 0));
      const lines = [line('451000', due), line('411000', -ded)];
      const net = round2(due - ded);
      if (net > 0) lines.push(line('451800', -net)); else if (net < 0) lines.push(line('411800', -net));
      out.push(entry('TVA-' + d.id, d.end, 'OD', 'TVA', 'Déclaration TVA ' + d.label, lines, { type: 'tva', id: d.id }));
      if (d.paid && net > 0) out.push(entry('FINT-' + d.id, d.paidDate || d.end, 'FIN', 'TVA', 'Paiement TVA ' + d.label, [line('451800', net), line('550000', -net)], { type: 'tva', id: d.id }));
    });

    // Impôt estimé enregistré à la clôture
    s.closings.forEach((c) => {
      if (Number(c.taxAmount) > 0) out.push(entry('IMP-' + c.year, App.fiscalYear(c.year).end, 'OD', 'IMP' + c.year, 'Impôt estimé ' + c.year, [line('670000', c.taxAmount), line('450000', -c.taxAmount)], { type: 'closing' }));
    });

    s.entries.forEach((e) => out.push(Object.assign({ source: { type: 'manual', id: e.id } }, e, { lines: e.lines.map((l) => ({ account: l.account, label: l.label || '', debit: round2(l.debit), credit: round2(l.credit) })) })));
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  function trialBalance(from, to, journal) {
    const acc = {};
    (journal || buildJournal()).forEach((e) => {
      if ((from && e.date < from) || (to && e.date > to)) return;
      e.lines.forEach((l) => {
        const a = (acc[l.account] = acc[l.account] || { account: l.account, label: App.accountLabel(l.account), debit: 0, credit: 0 });
        a.debit = round2(a.debit + l.debit); a.credit = round2(a.credit + l.credit);
      });
    });
    return Object.values(acc).map((a) => Object.assign(a, { solde: round2(a.debit - a.credit) })).sort((a, b) => a.account.localeCompare(b.account));
  }
  const sumPrefix = (bal, prefixes, sign) => round2(bal.filter((a) => prefixes.some((p) => a.account.startsWith(p))).reduce((s, a) => s + a.solde, 0) * (sign || 1));

  /* Compte de résultats — schéma abrégé BNB */
  function incomeStatement(year, journal) {
    const fy = App.fiscalYear(year);
    const bal = trialBalance(fy.start, fy.end, journal);
    const r = {
      fy, balance: bal,
      chiffreAffaires: sumPrefix(bal, ['70'], -1),
      autresProduits: sumPrefix(bal, ['71', '72', '74'], -1),
      produitsNonRecurrents: sumPrefix(bal, ['76'], -1),
      approvisionnements: sumPrefix(bal, ['60'], 1),
      servicesBiensDivers: sumPrefix(bal, ['61'], 1),
      remunerations: sumPrefix(bal, ['62'], 1),
      amortissements: sumPrefix(bal, ['630'], 1),
      autresCharges: sumPrefix(bal, ['631', '632', '633', '634', '635', '64'], 1),
      chargesNonRecurrentes: sumPrefix(bal, ['66'], 1),
      produitsFinanciers: sumPrefix(bal, ['75'], -1),
      chargesFinancieres: sumPrefix(bal, ['65'], 1),
      impots: sumPrefix(bal, ['67'], 1) - sumPrefix(bal, ['77'], -1),
    };
    r.ventesPrestations = round2(r.chiffreAffaires + r.autresProduits + r.produitsNonRecurrents);
    r.margeBrute = round2(r.chiffreAffaires + r.autresProduits - r.approvisionnements - r.servicesBiensDivers);
    r.coutVentes = round2(r.approvisionnements + r.servicesBiensDivers + r.remunerations + r.amortissements + r.autresCharges + r.chargesNonRecurrentes);
    r.resultatExploitation = round2(r.ventesPrestations - r.coutVentes);
    r.resultatFinancier = round2(r.produitsFinanciers - r.chargesFinancieres);
    r.resultatAvantImpot = round2(r.resultatExploitation + r.resultatFinancier);
    r.resultatNet = round2(r.resultatAvantImpot - r.impots);
    r.ebitda = round2(r.resultatExploitation + r.amortissements);
    return r;
  }

  /* Bilan — schéma abrégé BNB */
  function balanceSheet(year, journal) {
    const j = journal || buildJournal();
    const fy = App.fiscalYear(year);
    const bal = trialBalance(null, fy.end, j);
    const before = trialBalance(null, App.addDays(fy.start, -1), j);
    const resultPrior = -sumPrefix(before, ['6', '7'], 1);
    const is = incomeStatement(year, j);
    const pick = (prefixes, sign) => bal.filter((a) => prefixes.some((p) => a.account.startsWith(p)) && (sign > 0 ? a.solde > 0 : a.solde < 0)).reduce((s, a) => s + Math.abs(a.solde), 0);
    const net = (pref) => sumPrefix(bal, [pref], 1);
    const immoIncorp = round2(net('21')), immoCorp = round2(['22', '23', '24', '25', '26', '27'].reduce((s, p) => s + net(p), 0)), immoFin = round2(net('28'));
    const actif = {
      fraisEtablissement: round2(net('20')),
      immoIncorp, immoCorp, immoFin,
      stocks: round2(pick(['3'], 1)),
      creancesClients: round2(pick(['40'], 1)),
      autresCreances: round2(pick(['41', '42', '43', '44', '45', '46', '47', '48', '499'], 1)),
      placements: round2(pick(['50', '51', '52', '53'], 1)),
      disponibilites: round2(pick(['54', '55', '56', '57', '58'], 1)),
      regularisation: round2(pick(['490', '491'], 1)),
    };
    actif.immobilise = round2(actif.fraisEtablissement + immoIncorp + immoCorp + immoFin);
    actif.circulant = round2(actif.stocks + actif.creancesClients + actif.autresCreances + actif.placements + actif.disponibilites + actif.regularisation);
    actif.total = round2(actif.immobilise + actif.circulant);
    const passif = {
      capital: round2(-sumPrefix(bal, ['10', '11'], 1)),
      reserves: round2(-sumPrefix(bal, ['13'], 1)),
      resultatReporte: round2(-sumPrefix(bal, ['14'], 1) + resultPrior),
      resultatExercice: is.resultatNet,
      subsides: round2(-sumPrefix(bal, ['15'], 1)),
      provisions: round2(-sumPrefix(bal, ['16'], 1)),
      dettesLongTerme: round2(-sumPrefix(bal, ['17'], 1)),
      dettesFinancieres: round2(pick(['42', '43', '54', '55', '56', '57', '58'], -1)),
      fournisseurs: round2(pick(['44'], -1)),
      dettesFiscalesSociales: round2(pick(['45'], -1)),
      autresDettes: round2(pick(['40', '41', '46', '47', '48', '499'], -1)),
      regularisation: round2(pick(['492', '493'], -1)),
    };
    passif.capitauxPropres = round2(passif.capital + passif.reserves + passif.resultatReporte + passif.resultatExercice + passif.subsides);
    passif.dettesCourtTerme = round2(passif.dettesFinancieres + passif.fournisseurs + passif.dettesFiscalesSociales + passif.autresDettes);
    passif.total = round2(passif.capitauxPropres + passif.provisions + passif.dettesLongTerme + passif.dettesCourtTerme + passif.regularisation);
    return { fy, actif, passif, equilibre: Math.abs(actif.total - passif.total) < 0.05, ecart: round2(actif.total - passif.total) };
  }

  /* Périodes de déclaration TVA */
  function tvaPeriods(year) {
    const p = App.state.settings.company.tvaPeriod;
    const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const out = [];
    const mk = (m1, m2, label, kind, num) => {
      const end = new Date(year, m2, 0);
      const endStr = `${year}-${String(m2).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
      const due = m2 === 12 ? `${year + 1}-01-20` : `${year}-${String(m2 + 1).padStart(2, '0')}-20`;
      out.push({ start: `${year}-${String(m1).padStart(2, '0')}-01`, end: endStr, label, kind, num, year, due });
    };
    if (p === 'mensuelle') for (let m = 1; m <= 12; m++) mk(m, m, `${months[m - 1]} ${year}`, 'Month', m);
    else for (let q = 0; q < 4; q++) mk(q * 3 + 1, q * 3 + 3, `T${q + 1} ${year}`, 'Quarter', q + 1);
    return out;
  }

  /* Grilles de la déclaration périodique belge */
  function computeTva(start, end) {
    const s = App.state;
    const g = {};
    const add = (k, v) => { if (v) g[k] = round2((g[k] || 0) + v); };
    const inP = (d) => d && d >= start && d <= end;
    const docs = { invoices: [], expenses: [], assets: [], bank: [] };
    const rateGrid = { 6: '01', 12: '02', 21: '03' };

    s.invoices.filter((i) => i.type !== 'devis' && !['brouillon', 'annulee'].includes(i.status) && inP(i.date)).forEach((inv) => {
      const t = App.invoiceTotals(inv);
      const reg = inv.vatRegime || 'normal';
      if (reg === 'franchise') return;
      docs.invoices.push(inv);
      Object.entries(t.byRate).forEach(([rate, v]) => {
        if (inv.type === 'avoir') {
          if (['intracom_services', 'intracom_biens'].includes(reg)) add('48', v.base);
          else { add('49', v.base); add('64', v.tva); }
          return;
        }
        if (reg === 'normal') { add(rateGrid[rate] || '00', v.base); add('54', v.tva); }
        else if (reg === 'cocontractant') add('45', v.base);
        else if (reg === 'intracom_services') add('44', v.base);
        else if (reg === 'intracom_biens') add('46', v.base);
        else add('47', v.base);
      });
    });

    const purchase = (gridBase, ht, v, regime) => {
      add(gridBase, ht);
      if (regime === 'intracom_biens') { add('86', ht); add('55', v.tva); }
      else if (regime === 'intracom_services') { add('88', ht); add('55', v.tva); }
      else if (regime === 'cocontractant') { add('87', ht); add('56', v.tva); }
      add('59', v.ded);
    };
    s.expenses.filter((e) => inP(e.date)).forEach((e) => {
      const cat = App.EXPENSE_CATEGORIES.find((c) => c.account === e.account);
      const grid = cat ? cat.grid : '82';
      if (!grid) return;
      docs.expenses.push(e);
      purchase(grid, Number(e.ht) || 0, expenseVat(e), e.vatRegime || 'normal');
    });
    s.assets.filter((a) => inP(a.date)).forEach((a) => { docs.assets.push(a); purchase('83', Number(a.value) || 0, assetVat(a), 'normal'); });
    s.bank.filter((b) => inP(b.date) && b.matched && b.matched.type === 'category').forEach((b) => {
      const rate = Number(b.matched.tvaRate) || 0;
      const ttc = Math.abs(b.amount), ht = round2(ttc / (1 + rate / 100)), tva = round2(ttc - ht);
      const acc = b.matched.account;
      if (b.amount > 0 && /^7/.test(acc)) { add(rateGrid[rate] || '00', ht); add('54', tva); docs.bank.push(b); }
      else if (b.amount < 0 && /^6/.test(acc)) {
        const cat = App.EXPENSE_CATEGORIES.find((c) => c.account === acc);
        if (cat && !cat.grid) return;
        add(cat ? cat.grid : '82', ht); add('59', tva); docs.bank.push(b);
      }
    });
    const xx = round2(['54', '55', '56', '57', '61', '63'].reduce((x, k) => x + (g[k] || 0), 0));
    const yy = round2(['59', '62', '64'].reduce((x, k) => x + (g[k] || 0), 0));
    if (xx - yy > 0) g['71'] = round2(xx - yy); else if (yy - xx > 0) g['72'] = round2(yy - xx);
    return { start, end, grids: g, xx, yy, net: round2(xx - yy), docs };
  }

  const GRID_LABELS = {
    '00': 'Opérations soumises à un régime particulier / taux 0 %', '01': 'Opérations à 6 %', '02': 'Opérations à 12 %', '03': 'Opérations à 21 %',
    '44': 'Services intracommunautaires (autoliquidation chez le client)', '45': 'Opérations avec autoliquidation (cocontractant)', '46': 'Livraisons intracommunautaires exemptées',
    '47': 'Autres opérations exemptées et exportations', '48': 'Notes de crédit sur grilles 44 et 46', '49': 'Autres notes de crédit émises',
    '81': 'Marchandises, matières premières et auxiliaires', '82': 'Services et biens divers', '83': 'Biens d\'investissement', '84': 'Notes de crédit reçues sur 86 et 88', '85': 'Autres notes de crédit reçues',
    '86': 'Acquisitions intracommunautaires de biens', '87': 'Autres opérations à l\'entrée avec autoliquidation', '88': 'Services intracommunautaires reçus',
    '54': 'TVA sur les opérations des grilles 01, 02 et 03', '55': 'TVA sur les opérations des grilles 86 et 88', '56': 'TVA sur les opérations de la grille 87', '57': 'TVA sur les importations (report de perception)',
    '61': 'Régularisations en faveur de l\'État', '63': 'TVA à reverser sur notes de crédit reçues', '59': 'TVA déductible', '62': 'Régularisations en faveur du déclarant', '64': 'TVA à récupérer sur notes de crédit émises',
    '71': 'Taxe due à l\'État', '72': 'Somme due par l\'État', '91': 'Acompte de décembre (déclarants mensuels)',
  };
  const GRID_SECTIONS = [
    ['II. Opérations à la sortie', ['00', '01', '02', '03', '44', '45', '46', '47', '48', '49']],
    ['III. Opérations à l\'entrée', ['81', '82', '83', '84', '85', '86', '87', '88']],
    ['IV. Taxes dues', ['54', '55', '56', '57', '61', '63']],
    ['V. Taxes déductibles', ['59', '62', '64']],
    ['VI. Solde', ['71', '72']],
  ];

  const xmlEsc = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
  const amt = (n) => (Number(n) || 0).toFixed(2);

  function declarantXml(prefix) {
    const c = App.state.settings.company;
    const p = prefix || '';
    return `<${p}VATNumber>${App.digits(c.enterpriseNumber).padStart(10, '0')}</${p}VATNumber><${p}Name>${xmlEsc(c.name)}</${p}Name><${p}Street>${xmlEsc(c.address)}</${p}Street><${p}PostCode>${xmlEsc(c.postcode)}</${p}PostCode><${p}City>${xmlEsc(c.city)}</${p}City><${p}CountryCode>BE</${p}CountryCode>${c.email ? `<${p}EmailAddress>${xmlEsc(c.email)}</${p}EmailAddress>` : ''}${c.phone ? `<${p}Phone>${xmlEsc(App.digits(c.phone))}</${p}Phone>` : ''}`;
  }

  /* Fichier XML de déclaration périodique pour Intervat */
  function intervatXml(period, grids) {
    const lastOfYear = (period.kind === 'Month' && period.num === 12) || (period.kind === 'Quarter' && period.num === 4);
    const data = Object.entries(grids).filter(([, v]) => Number(v)).sort(([a], [b]) => Number(a) - Number(b)).map(([k, v]) => `      <Amount GridNumber="${Number(k)}">${amt(v)}</Amount>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<VATConsignment xmlns="http://www.minfin.fgov.be/VATConsignment" xmlns:common="http://www.minfin.fgov.be/InputCommon" VATDeclarationsNbr="1">
  <VATDeclaration SequenceNumber="1" DeclarantReference="${period.year}-${period.kind[0]}${period.num}">
    <Declarant>${declarantXml('common:')}</Declarant>
    <Period><${period.kind}>${period.num}</${period.kind}><Year>${period.year}</Year></Period>
    <Data>
${data}
    </Data>
${lastOfYear ? '    <ClientListingNihil>NO</ClientListingNihil>\n' : ''}    <Ask Restitution="NO" Payment="NO"/>
  </VATDeclaration>
</VATConsignment>`;
  }

  /* Listing annuel des clients assujettis belges */
  function clientListing(year) {
    const s = App.state, seuil = Number(s.settings.fiscal.listingSeuil) || 250;
    const rows = {};
    s.invoices.filter((i) => i.type !== 'devis' && !['brouillon', 'annulee'].includes(i.status) && i.date.startsWith(String(year))).forEach((inv) => {
      const c = s.clients.find((x) => x.id === inv.clientId);
      if (!c) return;
      const v = App.vatParse(c.vatNumber);
      if (v.country !== 'BE' || !v.valid) return;
      const t = App.invoiceTotals(inv);
      const r = (rows[c.id] = rows[c.id] || { client: c, vat: v.formatted, turnover: 0, vatAmount: 0 });
      r.turnover = round2(r.turnover + t.ht); r.vatAmount = round2(r.vatAmount + t.tva);
    });
    const list = Object.values(rows).filter((r) => r.turnover >= seuil).sort((a, b) => b.turnover - a.turnover);
    const sumT = round2(list.reduce((x, r) => x + r.turnover, 0)), sumV = round2(list.reduce((x, r) => x + r.vatAmount, 0));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ns2:ClientListingConsignment xmlns="http://www.minfin.fgov.be/InputCommon" xmlns:ns2="http://www.minfin.fgov.be/ClientListingConsignment" ClientListingsNbr="1">
  <ns2:ClientListing SequenceNumber="1" ClientsNbr="${list.length}" DeclarantReference="LIST-${year}" TurnOverSum="${amt(sumT)}" VATAmountSum="${amt(sumV)}">
    <ns2:Declarant>${declarantXml('')}</ns2:Declarant>
    <ns2:Period>${year}</ns2:Period>
${list.map((r, i) => `    <ns2:Client SequenceNumber="${i + 1}"><ns2:CompanyVATNumber issuedBy="BE">${r.vat.slice(2)}</ns2:CompanyVATNumber><ns2:TurnOver>${amt(r.turnover)}</ns2:TurnOver><ns2:VATAmount>${amt(r.vatAmount)}</ns2:VATAmount></ns2:Client>`).join('\n')}
  </ns2:ClientListing>
</ns2:ClientListingConsignment>`;
    return { list, sumT, sumV, xml };
  }

  /* Relevé intracommunautaire (clients UE, grilles 44 et 46) */
  function intracomStatement(start, end) {
    const s = App.state, rows = {};
    s.invoices.filter((i) => i.type !== 'devis' && !['brouillon', 'annulee'].includes(i.status) && i.date >= start && i.date <= end && ['intracom_services', 'intracom_biens'].includes(i.vatRegime)).forEach((inv) => {
      const c = s.clients.find((x) => x.id === inv.clientId) || {};
      const code = inv.vatRegime === 'intracom_services' ? 'S' : 'L';
      const key = (c.vatNumber || c.name) + code;
      const r = (rows[key] = rows[key] || { client: c, vat: App.vatParse(c.vatNumber).formatted, code, amount: 0 });
      r.amount = round2(r.amount + App.invoiceTotals(inv).ht);
    });
    return Object.values(rows);
  }

  /* Facture électronique Peppol BIS Billing 3.0 (UBL 2.1) */
  function peppolUbl(inv) {
    const s = App.state, c = s.settings.company, cl = s.clients.find((x) => x.id === inv.clientId) || {};
    const t = App.invoiceTotals(inv);
    const isCredit = inv.type === 'avoir';
    const root = isCredit ? 'CreditNote' : 'Invoice';
    const reg = inv.vatRegime || 'normal';
    const cat = (rate) => {
      if (reg === 'normal') return Number(rate) > 0 ? { id: 'S' } : { id: 'Z' };
      if (reg === 'cocontractant' || reg === 'intracom_services') return { id: 'AE', code: 'vatex-eu-ae', reason: App.LEGAL_MENTIONS[reg] };
      if (reg === 'intracom_biens') return { id: 'K', code: 'vatex-eu-ic', reason: App.LEGAL_MENTIONS[reg] };
      if (reg === 'export') return { id: 'G', code: 'vatex-eu-g', reason: App.LEGAL_MENTIONS[reg] };
      return { id: 'E', reason: App.LEGAL_MENTIONS[reg] };
    };
    const scheme = { BE: '0208', NL: '9944', DE: '9930', FR: '9957', LU: '9938', AT: '9914', ES: '9920', IT: '9906' };
    const sv = 'BE' + App.digits(c.enterpriseNumber).padStart(10, '0');
    const cv = App.vatParse(cl.vatNumber);
    const cEndpoint = cv.country === 'BE' ? `<cbc:EndpointID schemeID="0208">${App.digits(cv.number).padStart(10, '0')}</cbc:EndpointID>` : cv.country && scheme[cv.country] ? `<cbc:EndpointID schemeID="${scheme[cv.country]}">${xmlEsc(cv.formatted)}</cbc:EndpointID>` : '';
    const party = (endpoint, name, street, city, pc, country, vat, legalId) => `<cac:Party>${endpoint}<cac:PostalAddress>${street ? `<cbc:StreetName>${xmlEsc(street)}</cbc:StreetName>` : ''}${city ? `<cbc:CityName>${xmlEsc(city)}</cbc:CityName>` : ''}${pc ? `<cbc:PostalZone>${xmlEsc(pc)}</cbc:PostalZone>` : ''}<cac:Country><cbc:IdentificationCode>${country}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>${vat ? `<cac:PartyTaxScheme><cbc:CompanyID>${xmlEsc(vat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}<cac:PartyLegalEntity><cbc:RegistrationName>${xmlEsc(name)}</cbc:RegistrationName>${legalId || ''}</cac:PartyLegalEntity></cac:Party>`;
    const taxCat = (rate, tag) => { const k = cat(rate); return `<cac:${tag}><cbc:ID>${k.id}</cbc:ID><cbc:Percent>${k.id === 'S' ? Number(rate) : 0}</cbc:Percent>${tag === 'TaxCategory' && k.code ? `<cbc:TaxExemptionReasonCode>${k.code}</cbc:TaxExemptionReasonCode>` : ''}${tag === 'TaxCategory' && k.reason && !k.code ? `<cbc:TaxExemptionReason>${xmlEsc(k.reason)}</cbc:TaxExemptionReason>` : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:${tag}>`; };
    const abs = (n) => amt(Math.abs(n));
    const lines = inv.lines.map((l, i) => {
      const lht = round2(l.qty * l.unitPrice * (1 - (l.discount || 0) / 100));
      const rate = reg === 'normal' ? l.tvaRate : 0;
      return `<cac:${root}Line><cbc:ID>${i + 1}</cbc:ID><cbc:${isCredit ? 'CreditedQuantity' : 'InvoicedQuantity'} unitCode="C62">${l.qty}</cbc:${isCredit ? 'CreditedQuantity' : 'InvoicedQuantity'}><cbc:LineExtensionAmount currencyID="EUR">${amt(lht)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${xmlEsc(l.desc || 'Article')}</cbc:Name>${taxCat(rate, 'ClassifiedTaxCategory')}</cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">${l.qty ? (lht / l.qty).toFixed(4) : '0'}</cbc:PriceAmount></cac:Price></cac:${root}Line>`;
    }).join('\n');
    const sub = Object.entries(t.byRate).map(([rate, v]) => `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">${amt(v.base)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">${amt(v.tva)}</cbc:TaxAmount>${taxCat(rate, 'TaxCategory')}</cac:TaxSubtotal>`).join('');
    const legal = (num) => num ? `<cbc:CompanyID schemeID="0208">${App.digits(num).padStart(10, '0')}</cbc:CompanyID>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
<cbc:ID>${xmlEsc(inv.number)}</cbc:ID>
<cbc:IssueDate>${inv.date}</cbc:IssueDate>
${!isCredit && inv.dueDate ? `<cbc:DueDate>${inv.dueDate}</cbc:DueDate>\n` : ''}<cbc:${root}TypeCode>${isCredit ? 381 : 380}</cbc:${root}TypeCode>
${inv.notes ? `<cbc:Note>${xmlEsc(inv.notes)}</cbc:Note>\n` : ''}<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
<cbc:BuyerReference>${xmlEsc(inv.buyerReference || inv.number)}</cbc:BuyerReference>
<cac:AccountingSupplierParty>${party(`<cbc:EndpointID schemeID="0208">${App.digits(c.enterpriseNumber).padStart(10, '0')}</cbc:EndpointID>`, c.name, c.address, c.city, c.postcode, 'BE', c.regimeTva === 'franchise' ? '' : sv, legal(c.enterpriseNumber))}</cac:AccountingSupplierParty>
<cac:AccountingCustomerParty>${party(cEndpoint, cl.name || '', cl.address, '', '', cl.country || cv.country || 'BE', cv.valid ? cv.formatted : '', cv.country === 'BE' ? legal(cv.number) : '')}</cac:AccountingCustomerParty>
${!isCredit ? `<cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode><cbc:PaymentID>${xmlEsc(App.invoiceComm(inv))}</cbc:PaymentID>${c.iban ? `<cac:PayeeFinancialAccount><cbc:ID>${App.ibanClean(c.iban)}</cbc:ID></cac:PayeeFinancialAccount>` : ''}</cac:PaymentMeans>\n<cac:PaymentTerms><cbc:Note>Paiement à ${c.paymentTerms} jours</cbc:Note></cac:PaymentTerms>\n` : ''}<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${abs(t.tva)}</cbc:TaxAmount>${sub}</cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">${abs(t.ht)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">${abs(t.ht)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">${abs(t.ttc)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">${abs(t.ttc)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
${lines}
</${root}>`;
  }

  /* Lecture des extraits de compte CODA (format bancaire belge, enregistrements de 128 caractères) */
  function parseCoda(text) {
    const out = [];
    let cur = null;
    const ddmmyy = (s) => (/^\d{6}$/.test(s) ? `20${s.slice(4, 6)}-${s.slice(2, 4)}-${s.slice(0, 2)}` : '');
    text.split(/\r?\n/).forEach((raw) => {
      const l = raw.padEnd(128, ' ');
      if (l[0] === '2' && l[1] === '1') {
        const sign = l[31] === '1' ? -1 : 1;
        const amount = sign * Number(l.slice(32, 47)) / 1000;
        const structured = l[61] === '1';
        let comm = l.slice(62, 115);
        if (structured && comm.startsWith('101')) comm = App.structuredComm(comm.slice(3, 13));
        cur = { date: ddmmyy(l.slice(115, 121)) || ddmmyy(l.slice(47, 53)), amount: round2(amount), comm: structured ? comm : '', free: structured ? '' : comm.trim(), name: '', account: '' };
        out.push(cur);
      } else if (cur && l[0] === '2' && l[1] === '2') {
        if (!cur.comm) cur.free = (cur.free + ' ' + l.slice(10, 63).trim()).trim();
      } else if (cur && l[0] === '2' && l[1] === '3') {
        cur.account = l.slice(10, 44).trim();
        cur.name = l.slice(47, 82).trim();
        if (!cur.comm) cur.free = (cur.free + ' ' + l.slice(82, 125).trim()).trim();
      }
    });
    return out.filter((x) => x.date && x.amount).map((x) => ({ date: x.date, amount: x.amount, comm: x.comm, label: [x.name, x.free || x.comm].filter(Boolean).join(' — ') || 'Opération', counterparty: x.account }));
  }

  /* ---------- Estimations d'impôts belges ---------- */
  function estimateISOC(base) {
    const f = App.state.settings.fiscal, r = Math.max(0, Number(base) || 0);
    if (App.state.settings.company.isocReduit === false) return round2(r * f.isocNormalTaux / 100);
    const low = Math.min(r, f.isocReduitPlafond), high = Math.max(0, r - f.isocReduitPlafond);
    return round2(low * f.isocReduitTaux / 100 + high * f.isocNormalTaux / 100);
  }
  function estimateSocial(revenu) {
    const f = App.state.settings.fiscal, r = Math.max(0, Number(revenu) || 0);
    const t1 = Math.min(r, f.socialPlafond1) * f.socialTaux1 / 100;
    const t2 = Math.max(0, Math.min(r, f.socialPlafond2) - f.socialPlafond1) * f.socialTaux2 / 100;
    return round2(Math.max(f.socialMinimumAnnuel, t1 + t2));
  }
  function estimateIPP(revenuImposable) {
    const f = App.state.settings.fiscal, r = Math.max(0, Number(revenuImposable) || 0);
    let tax = 0, prev = 0;
    for (const [limit, rate] of f.ippTranches) { if (r > prev) tax += (Math.min(r, limit) - prev) * rate / 100; prev = limit; }
    tax = Math.max(0, tax - f.ippQuotiteExemptee * 0.25);
    return round2(tax * (1 + f.ippAdditionnelCommunal / 100));
  }
  function taxEstimate(year, journal) {
    const is = incomeStatement(year, journal);
    const c = App.state.settings.company;
    if (c.impot === 'ISOC') {
      const tax = estimateISOC(is.resultatAvantImpot);
      return { kind: 'ISOC', base: is.resultatAvantImpot, tax, label: 'Impôt des sociétés estimé', detail: c.isocReduit === false ? `taux normal ${App.state.settings.fiscal.isocNormalTaux} %` : `taux réduit PME ${App.state.settings.fiscal.isocReduitTaux} % jusqu'à ${App.eur(App.state.settings.fiscal.isocReduitPlafond)}, puis ${App.state.settings.fiscal.isocNormalTaux} %` };
    }
    const alreadySocial = is.balance.filter((a) => a.account.startsWith('623')).reduce((x, a) => x + a.solde, 0);
    const social = estimateSocial(is.resultatAvantImpot + alreadySocial);
    const revenu = Math.max(0, is.resultatAvantImpot + alreadySocial - social);
    const tax = estimateIPP(revenu);
    return { kind: 'IPP', base: revenu, tax, social, label: 'IPP estimé (+ additionnels communaux)', detail: `revenu net après cotisations sociales estimées (${App.eur(social)})` };
  }

  /* Versements anticipés recommandés (pour éviter la majoration) */
  function prepaymentDates(year) {
    return [[`${year}-04-10`, 'VA 1'], [`${year}-07-10`, 'VA 2'], [`${year}-10-10`, 'VA 3'], [`${year}-12-20`, 'VA 4']];
  }

  /* Échéancier fiscal et social des prochains mois */
  function deadlines(fromDate, months) {
    const s = App.state, c = s.settings.company;
    const from = fromDate || App.today();
    const to = App.addDays(from, (months || 6) * 31);
    const list = [];
    const y0 = Number(from.slice(0, 4));
    for (const y of [y0 - 1, y0, y0 + 1]) {
      if (c.regimeTva === 'normal') {
        tvaPeriods(y).forEach((p) => {
          const done = s.tvaDeclarations.some((d) => d.start === p.start);
          list.push({ date: p.due, label: `Déclaration et paiement TVA — ${p.label}`, kind: 'tva', done, href: '#/tva' });
        });
        if (c.tvaPeriod === 'mensuelle') list.push({ date: `${y}-12-24`, label: 'Acompte TVA de décembre (grille 91)', kind: 'tva', href: '#/tva' });
        list.push({ date: `${y}-03-31`, label: `Listing annuel des clients assujettis ${y - 1}`, kind: 'tva', href: '#/tva' });
      }
      if (c.impot === 'ISOC') prepaymentDates(y).forEach(([d, l]) => list.push({ date: d, label: `Versement anticipé ${l} (impôt des sociétés)`, kind: 'impot', href: '#/cloture' }));
      else {
        prepaymentDates(y).forEach(([d, l]) => list.push({ date: d, label: `Versement anticipé ${l} (facultatif, évite la majoration IPP)`, kind: 'impot', href: '#/cloture' }));
        [['03-31', 'T1'], ['06-30', 'T2'], ['09-30', 'T3'], ['12-31', 'T4']].forEach(([d, q]) => list.push({ date: `${y}-${d}`, label: `Cotisations sociales d'indépendant ${q}`, kind: 'social', href: '#/cloture' }));
      }
      if (['SRL', 'SA', 'SC', 'SNC', 'SComm', 'ASBL'].includes(c.legalForm)) {
        list.push({ date: `${y}-06-30`, label: `Assemblée générale — approbation des comptes ${y - 1}`, kind: 'cloture', href: '#/cloture' });
        list.push({ date: `${y}-07-31`, label: `Dépôt des comptes annuels ${y - 1} à la BNB`, kind: 'cloture', href: '#/cloture' });
      }
    }
    return list.filter((d) => d.date >= App.addDays(from, -40) && d.date <= to && !d.done).sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  function exportJournalCsv(year) {
    const fy = App.fiscalYear(year);
    const rows = [['Journal', 'Date', 'Pièce', 'Compte', 'Intitulé du compte', 'Libellé', 'Débit', 'Crédit']];
    buildJournal().filter((e) => e.date >= fy.start && e.date <= fy.end).forEach((e) => e.lines.forEach((l) => rows.push([e.journal, e.date, e.ref, l.account, App.accountLabel(l.account), l.label || e.label, l.debit, l.credit])));
    return rows;
  }

  function dashboard(year) {
    const j = buildJournal();
    const is = incomeStatement(year, j);
    const fy = is.fy;
    const bal = trialBalance(null, App.today(), j);
    const treso = sumPrefix(bal, ['55', '57'], 1);
    const s = App.state;
    const unpaid = s.invoices.filter((i) => i.type === 'facture' && i.status === 'envoyee');
    const overdue = unpaid.filter((i) => i.dueDate && i.dueDate < App.today());
    const monthly = Array.from({ length: 12 }, (_, k) => {
      const d = new Date(fy.start + 'T00:00:00'); d.setMonth(d.getMonth() + k);
      return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('fr-BE', { month: 'short' }), produits: 0, charges: 0 };
    });
    j.forEach((e) => {
      if (e.date < fy.start || e.date > fy.end) return;
      const m = monthly.find((x) => x.key === e.date.slice(0, 7)); if (!m) return;
      e.lines.forEach((l) => {
        if (l.account.startsWith('7')) m.produits = round2(m.produits + l.credit - l.debit);
        if (l.account.startsWith('6') && !l.account.startsWith('67')) m.charges = round2(m.charges + l.debit - l.credit);
      });
    });
    const byCategory = {};
    is.balance.filter((a) => a.account.startsWith('6') && !a.account.startsWith('67')).forEach((a) => (byCategory[a.label] = round2((byCategory[a.label] || 0) + a.solde)));
    const now = App.today();
    const currentPeriod = s.settings.company.regimeTva === 'normal' ? tvaPeriods(Number(now.slice(0, 4))).find((p) => now >= p.start && now <= p.end) : null;
    const tvaCurrent = currentPeriod ? computeTva(currentPeriod.start, currentPeriod.end) : null;
    const franchiseCA = s.settings.company.regimeTva === 'franchise' ? is.chiffreAffaires : null;
    return {
      is, treso, unpaid, overdue, monthly, byCategory, currentPeriod, tvaCurrent, franchiseCA,
      tax: taxEstimate(year, j), deadlines: deadlines(now, 4),
      unpaidTotal: round2(unpaid.reduce((x, i) => x + App.invoiceTotals(i).ttc, 0)),
      overdueTotal: round2(overdue.reduce((x, i) => x + App.invoiceTotals(i).ttc, 0)),
      bankToReconcile: s.bank.filter((b) => !b.matched).length,
    };
  }

  function aiContext() {
    const s = App.state, year = new Date().getFullYear();
    const db = dashboard(year), bs = balanceSheet(year);
    return {
      pays: 'Belgique', date_du_jour: App.today(),
      entreprise: { nom: s.settings.company.name, forme: s.settings.company.legalForm, numero_entreprise: s.settings.company.enterpriseNumber, regime_tva: s.settings.company.regimeTva, periodicite_tva: s.settings.company.tvaPeriod, impot: s.settings.company.impot, code_nace: s.settings.company.nace },
      parametres_fiscaux_indicatifs: s.settings.fiscal,
      exercice: db.is.fy,
      compte_de_resultats: Object.fromEntries(Object.entries(db.is).filter(([, v]) => typeof v === 'number')),
      bilan: { actif: bs.actif, passif: bs.passif, equilibre: bs.equilibre },
      estimation_impot: db.tax, tresorerie: db.treso,
      factures_ouvertes: db.unpaid.map((i) => ({ numero: i.number, client: (s.clients.find((c) => c.id === i.clientId) || {}).name, ttc: App.invoiceTotals(i).ttc, echeance: i.dueDate })),
      tva_periode_en_cours: db.tvaCurrent ? { periode: db.currentPeriod.label, grilles: db.tvaCurrent.grids } : null,
      echeances: db.deadlines.map((d) => ({ date: d.date, quoi: d.label })),
      charges_par_categorie: db.byCategory, mensuel: db.monthly,
      operations_bancaires_a_rapprocher: s.bank.filter((b) => !b.matched).map((b) => ({ date: b.date, libelle: b.label, montant: b.amount })),
      dernieres_depenses: s.expenses.slice(-30).map((e) => ({ date: e.date, fournisseur: e.supplier, compte: e.account, ht: e.ht, tva: e.tva, deductible_pct: e.deductiblePct, regime: e.vatRegime })),
      immobilisations: s.assets.map((a) => ({ libelle: a.label, valeur: a.value, date: a.date, duree: a.duration })),
    };
  }

  Object.assign(App, {
    JOURNALS, GRID_LABELS, GRID_SECTIONS, buildJournal, trialBalance, incomeStatement, balanceSheet, tvaPeriods, computeTva,
    depreciationSchedule, amortAccount, expenseVat, assetVat, intervatXml, clientListing, intracomStatement, peppolUbl, parseCoda,
    estimateISOC, estimateIPP, estimateSocial, taxEstimate, prepaymentDates, deadlines, exportJournalCsv, dashboard, aiContext,
  });
})(window.App);
