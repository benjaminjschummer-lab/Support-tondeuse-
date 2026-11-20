/* ComptaPro — moteur comptable : partie double, TVA, amortissements, états financiers, FEC */
(function (App) {
  const { round2 } = App;

  /* Ajoute une ligne signée : montant > 0 = débit, < 0 = crédit */
  function line(account, amount, label) {
    const a = round2(amount);
    if (!a) return null;
    return { account, label: label || '', debit: a > 0 ? a : 0, credit: a < 0 ? -a : 0 };
  }
  function entry(id, date, journal, ref, label, lines, source) {
    return { id, date, journal, ref, label, lines: lines.filter(Boolean), source };
  }

  const JOURNALS = { AN: 'À nouveaux', VE: 'Ventes', AC: 'Achats', BQ: 'Banque', OD: 'Opérations diverses' };

  /* Amortissement linéaire prorata temporis (base 360 jours, usage fiscal français) */
  function depreciationSchedule(asset) {
    const rows = [];
    const value = Number(asset.value) || 0;
    const years = Math.max(1, Number(asset.duration) || 1);
    const annual = value / years;
    const start = new Date(asset.date + 'T00:00:00');
    let startYear = start.getFullYear();
    const fy0 = App.fiscalYear(startYear);
    if (asset.date < fy0.start) startYear -= 1;
    let remaining = value, cumul = 0, y = startYear;
    while (remaining > 0.005 && rows.length < 60) {
      const fy = App.fiscalYear(y);
      let dot;
      if (y === startYear) {
        const end = new Date(fy.end + 'T00:00:00');
        const days = days360(start, end) + 1;
        dot = Math.min(remaining, annual * Math.min(days, 360) / 360);
      } else {
        dot = Math.min(remaining, annual);
      }
      dot = round2(dot);
      if (remaining - dot < 0.01) dot = round2(remaining);
      cumul = round2(cumul + dot); remaining = round2(value - cumul);
      rows.push({ year: y, end: fy.end, dotation: dot, cumul, vnc: remaining });
      y++;
    }
    return rows;
  }
  function days360(a, b) {
    const d1 = Math.min(a.getDate(), 30), d2 = Math.min(b.getDate(), 30);
    return (b.getFullYear() - a.getFullYear()) * 360 + (b.getMonth() - a.getMonth()) * 30 + (d2 - d1);
  }

  function amortAccount(account) { return '28' + account.slice(1); }

  /* Génère l'ensemble du journal à partir des pièces */
  function buildJournal() {
    const s = App.state, out = [];
    const today = App.today();

    // À-nouveaux d'ouverture
    const o = s.settings.opening || {};
    const allDates = [...s.invoices.map((i) => i.date), ...s.expenses.map((e) => e.date), ...s.bank.map((b) => b.date), ...s.assets.map((a) => a.date)].filter(Boolean).sort();
    const firstYear = allDates.length ? Number(allDates[0].slice(0, 4)) : new Date().getFullYear();
    let fyFirst = App.fiscalYear(firstYear);
    if (allDates.length && allDates[0] < fyFirst.start) fyFirst = App.fiscalYear(firstYear - 1);
    const openTotal = (Number(o.capital) || 0) + (Number(o.reportANouveau) || 0) + (Number(o.emprunts) || 0) + (Number(o.comptesCourants) || 0);
    const bankOpen = Number(o.banque) || 0;
    if (openTotal || bankOpen) {
      out.push(entry('AN', fyFirst.start, 'AN', 'AN', 'Bilan d\'ouverture', [
        line('512000', bankOpen),
        line('101000', -(Number(o.capital) || 0)),
        line('110000', -(Number(o.reportANouveau) || 0)),
        line('164000', -(Number(o.emprunts) || 0)),
        line('455000', -(Number(o.comptesCourants) || 0)),
        line('471000', openTotal - bankOpen, 'Écart d\'ouverture à justifier'),
      ], { type: 'opening' }));
    }

    // Ventes
    s.invoices.filter((i) => i.type !== 'devis' && i.status !== 'brouillon').forEach((inv) => {
      const t = App.invoiceTotals(inv);
      const client = s.clients.find((c) => c.id === inv.clientId);
      const lbl = `${inv.number} ${client ? client.name : ''}`.trim();
      const lines = [line('411000', t.ttc, lbl)];
      Object.entries(t.byRate).forEach(([rate, v]) => {
        lines.push(line(inv.revenueAccount || '706000', -v.base * t.sign, `${lbl} (HT ${rate} %)`));
        lines.push(line('445710', -v.tva * t.sign, `${lbl} TVA ${rate} %`));
      });
      out.push(entry('VE-' + inv.id, inv.date, 'VE', inv.number, lbl, lines, { type: 'invoice', id: inv.id }));
      if (inv.status === 'payee') {
        out.push(entry('BQV-' + inv.id, inv.paidDate || inv.date, 'BQ', inv.number, 'Règlement ' + lbl, [
          line('512000', t.ttc), line('411000', -t.ttc),
        ], { type: 'invoice', id: inv.id }));
      }
    });

    // Achats / dépenses
    s.expenses.forEach((e) => {
      const lbl = `${e.supplier || ''} ${e.description || ''}`.trim();
      const ref = e.ref || ('DEP-' + e.id.slice(-5).toUpperCase());
      out.push(entry('AC-' + e.id, e.date, 'AC', ref, lbl, [
        line(e.account || '471000', Number(e.ht), lbl), line('445660', Number(e.tva), 'TVA ' + lbl), line('401000', -Number(e.ttc), lbl),
      ], { type: 'expense', id: e.id }));
      if (e.paid) {
        const treso = e.paymentMethod === 'especes' ? '530000' : '512000';
        out.push(entry('BQA-' + e.id, e.paidDate || e.date, 'BQ', ref, 'Paiement ' + lbl, [
          line('401000', Number(e.ttc)), line(treso, -Number(e.ttc)),
        ], { type: 'expense', id: e.id }));
      }
    });

    // Immobilisations + dotations
    s.assets.forEach((a) => {
      const tva = round2((Number(a.value) || 0) * (Number(a.tvaRate) || 0) / 100);
      const ttc = round2((Number(a.value) || 0) + tva);
      out.push(entry('IM-' + a.id, a.date, 'AC', 'IMMO', 'Acquisition ' + a.label, [
        line(a.account, Number(a.value)), line('445620', tva), line('404000', -ttc),
      ], { type: 'asset', id: a.id }));
      if (a.paid !== false) {
        out.push(entry('BQI-' + a.id, a.date, 'BQ', 'IMMO', 'Paiement ' + a.label, [line('404000', ttc), line('512000', -ttc)], { type: 'asset', id: a.id }));
      }
      if (a.disposedDate) return;
      depreciationSchedule(a).forEach((r) => {
        if (r.year > new Date(today).getFullYear() + 0) return;
        out.push(entry(`DOT-${a.id}-${r.year}`, r.end, 'OD', 'DOT' + r.year, `Dotation ${r.year} ${a.label}`, [
          line('681100', r.dotation), line(amortAccount(a.account), -r.dotation),
        ], { type: 'asset', id: a.id }));
      });
    });

    // Banque : opérations catégorisées directement
    s.bank.forEach((b) => {
      const m = b.matched;
      if (!m || m.type !== 'category') return;
      const amount = Number(b.amount);
      const rate = Number(m.tvaRate) || 0;
      const ttc = Math.abs(amount), ht = round2(ttc / (1 + rate / 100)), tva = round2(ttc - ht);
      const lines = amount < 0
        ? [line(m.account, ht), line(m.account.startsWith('6') ? '445660' : '471000', tva), line('512000', -ttc)]
        : [line('512000', ttc), line(m.account, -ht), line('445710', -tva)];
      out.push(entry('BQC-' + b.id, b.date, 'BQ', 'REL', b.label, lines, { type: 'bank', id: b.id }));
    });

    // Déclarations de TVA validées
    s.tvaDeclarations.forEach((d) => {
      const lines = [line('445710', d.collected), line('445660', -d.deductibleAbs), line('445620', -d.deductibleImmo)];
      if (d.creditPrevious) lines.push(line('445670', -d.creditPrevious));
      if (d.net > 0) lines.push(line('445510', -d.net)); else if (d.net < 0) lines.push(line('445670', -d.net));
      out.push(entry('TVA-' + d.id, d.end, 'OD', 'TVA', 'Liquidation TVA ' + d.label, lines, { type: 'tva', id: d.id }));
      if (d.paid && d.net > 0) {
        out.push(entry('BQT-' + d.id, d.paidDate || d.end, 'BQ', 'TVA', 'Paiement TVA ' + d.label, [line('445510', d.net), line('512000', -d.net)], { type: 'tva', id: d.id }));
      }
    });

    // Impôt sur les sociétés enregistré à la clôture
    s.closings.forEach((c) => {
      if (Number(c.isAmount) > 0) {
        out.push(entry('IS-' + c.year, App.fiscalYear(c.year).end, 'OD', 'IS' + c.year, 'Impôt sur les sociétés ' + c.year, [line('695000', c.isAmount), line('444000', -c.isAmount)], { type: 'closing' }));
      }
    });

    // Écritures manuelles
    s.entries.forEach((e) => out.push(Object.assign({ source: { type: 'manual', id: e.id } }, e, { lines: e.lines.map((l) => ({ account: l.account, label: l.label || '', debit: round2(l.debit), credit: round2(l.credit) })) })));

    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  /* Balance des comptes sur une plage */
  function trialBalance(from, to, journal) {
    const j = journal || buildJournal();
    const acc = {};
    j.forEach((e) => {
      if ((from && e.date < from) || (to && e.date > to)) return;
      e.lines.forEach((l) => {
        acc[l.account] = acc[l.account] || { account: l.account, label: App.accountLabel(l.account), debit: 0, credit: 0 };
        acc[l.account].debit = round2(acc[l.account].debit + l.debit);
        acc[l.account].credit = round2(acc[l.account].credit + l.credit);
      });
    });
    return Object.values(acc).map((a) => Object.assign(a, { solde: round2(a.debit - a.credit) })).sort((a, b) => a.account.localeCompare(b.account));
  }

  const sumPrefix = (bal, prefixes, sign) => round2(bal.filter((a) => prefixes.some((p) => a.account.startsWith(p))).reduce((s, a) => s + a.solde, 0) * (sign || 1));

  /* Compte de résultat */
  function incomeStatement(year, journal) {
    const fy = App.fiscalYear(year);
    const bal = trialBalance(fy.start, fy.end, journal);
    const r = {
      fy,
      ventesMarchandises: sumPrefix(bal, ['707'], -1),
      production: sumPrefix(bal, ['706', '708', '704', '705'], -1),
      subventions: sumPrefix(bal, ['74'], -1),
      autresProduits: sumPrefix(bal, ['75', '78', '79'], -1),
      achatsMarchandises: sumPrefix(bal, ['607', '6037'], 1),
      achatsMatieres: sumPrefix(bal, ['601', '602', '6031', '604', '605', '606', '608', '609'], 1),
      chargesExternes: sumPrefix(bal, ['61', '62'], 1),
      impotsTaxes: sumPrefix(bal, ['63'], 1),
      salaires: sumPrefix(bal, ['641', '642', '643', '644'], 1),
      chargesSociales: sumPrefix(bal, ['645', '646', '647', '648'], 1),
      dotations: sumPrefix(bal, ['68'], 1),
      autresCharges: sumPrefix(bal, ['65'], 1),
      produitsFinanciers: sumPrefix(bal, ['76'], -1),
      chargesFinancieres: sumPrefix(bal, ['66'], 1),
      produitsExceptionnels: sumPrefix(bal, ['77'], -1),
      chargesExceptionnelles: sumPrefix(bal, ['67'], 1),
      is: sumPrefix(bal, ['69'], 1),
      balance: bal,
    };
    r.chiffreAffaires = round2(r.ventesMarchandises + r.production);
    r.produitsExploitation = round2(r.chiffreAffaires + r.subventions + r.autresProduits);
    r.chargesExploitation = round2(r.achatsMarchandises + r.achatsMatieres + r.chargesExternes + r.impotsTaxes + r.salaires + r.chargesSociales + r.dotations + r.autresCharges);
    r.resultatExploitation = round2(r.produitsExploitation - r.chargesExploitation);
    r.resultatFinancier = round2(r.produitsFinanciers - r.chargesFinancieres);
    r.resultatCourant = round2(r.resultatExploitation + r.resultatFinancier);
    r.resultatExceptionnel = round2(r.produitsExceptionnels - r.chargesExceptionnelles);
    r.resultatAvantImpot = round2(r.resultatCourant + r.resultatExceptionnel);
    r.resultatNet = round2(r.resultatAvantImpot - r.is);
    r.valeurAjoutee = round2(r.chiffreAffaires - r.achatsMarchandises - r.achatsMatieres - r.chargesExternes);
    r.ebe = round2(r.valeurAjoutee + r.subventions - r.impotsTaxes - r.salaires - r.chargesSociales);
    return r;
  }

  /* Bilan à la clôture de l'exercice */
  function balanceSheet(year, journal) {
    const j = journal || buildJournal();
    const fy = App.fiscalYear(year);
    const bal = trialBalance(null, fy.end, j);
    const before = trialBalance(null, App.addDays(fy.start, -1), j);
    const resultPrior = -sumPrefix(before, ['6', '7'], 1);
    const is = incomeStatement(year, j);
    const pos = (prefixes) => round2(bal.filter((a) => prefixes.some((p) => a.account.startsWith(p)) && a.solde > 0).reduce((s, a) => s + a.solde, 0));
    const neg = (prefixes) => round2(-bal.filter((a) => prefixes.some((p) => a.account.startsWith(p)) && a.solde < 0).reduce((s, a) => s + a.solde, 0));

    const immoIncorp = sumPrefix(bal, ['20'], 1), immoCorp = sumPrefix(bal, ['21', '22', '23'], 1), immoFin = sumPrefix(bal, ['26', '27'], 1);
    const amortIncorp = sumPrefix(bal, ['280'], -1), amortCorp = sumPrefix(bal, ['281', '282'], -1);
    const actif = {
      immoIncorp: { brut: immoIncorp, amort: amortIncorp, net: round2(immoIncorp - amortIncorp) },
      immoCorp: { brut: immoCorp, amort: amortCorp, net: round2(immoCorp - amortCorp) },
      immoFin: { brut: immoFin, amort: 0, net: immoFin },
      stocks: pos(['3']),
      clients: pos(['411', '416', '418']),
      autresCreances: round2(pos(['40', '44', '45', '46', '47', '42', '43'])),
      disponibilites: pos(['51', '53']),
      chargesConstatees: pos(['486']),
    };
    actif.totalImmo = round2(actif.immoIncorp.net + actif.immoCorp.net + actif.immoFin.net);
    actif.totalCirculant = round2(actif.stocks + actif.clients + actif.autresCreances + actif.disponibilites + actif.chargesConstatees);
    actif.total = round2(actif.totalImmo + actif.totalCirculant);

    const passif = {
      capital: round2(sumPrefix(bal, ['101', '108'], -1)),
      reserves: round2(sumPrefix(bal, ['106'], -1)),
      reportANouveau: round2(sumPrefix(bal, ['110', '119', '120', '129'], -1) + resultPrior),
      resultat: is.resultatNet,
      provisions: round2(sumPrefix(bal, ['15'], -1)),
      emprunts: round2(neg(['16']) + neg(['51'])),
      fournisseurs: neg(['401', '403', '404', '408']),
      dettesFiscales: neg(['42', '43', '44']),
      autresDettes: round2(neg(['45', '46', '47', '419'])),
      produitsConstates: neg(['487']),
    };
    passif.capitauxPropres = round2(passif.capital + passif.reserves + passif.reportANouveau + passif.resultat);
    passif.dettes = round2(passif.emprunts + passif.fournisseurs + passif.dettesFiscales + passif.autresDettes + passif.produitsConstates);
    passif.total = round2(passif.capitauxPropres + passif.provisions + passif.dettes);
    return { fy, actif, passif, equilibre: Math.abs(actif.total - passif.total) < 0.05, ecart: round2(actif.total - passif.total) };
  }

  /* Périodes de TVA d'une année */
  function tvaPeriods(year) {
    const p = App.state.settings.company.tvaPeriod;
    const out = [];
    const mk = (m1, m2, label) => {
      const end = new Date(year, m2, 0);
      out.push({ start: `${year}-${String(m1).padStart(2, '0')}-01`, end: `${year}-${String(m2).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`, label });
    };
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    if (p === 'mensuelle') for (let m = 1; m <= 12; m++) mk(m, m, `${months[m - 1]} ${year}`);
    else if (p === 'trimestrielle') for (let q = 0; q < 4; q++) mk(q * 3 + 1, q * 3 + 3, `T${q + 1} ${year}`);
    else mk(1, 12, `Année ${year} (CA12)`);
    return out;
  }

  /* Calcul d'une déclaration de TVA type CA3 */
  function computeTva(start, end) {
    const s = App.state;
    const exig = s.settings.company.exigibilite;
    const rates = {};
    const addRate = (rate, base, tva) => {
      rates[rate] = rates[rate] || { base: 0, tva: 0 };
      rates[rate].base = round2(rates[rate].base + base);
      rates[rate].tva = round2(rates[rate].tva + tva);
    };
    const inP = (d) => d && d >= start && d <= end;
    const docs = { invoices: [], expenses: [], assets: [], bank: [] };

    s.invoices.filter((i) => i.type !== 'devis' && i.status !== 'brouillon').forEach((inv) => {
      const d = exig === 'encaissements' ? (inv.status === 'payee' ? inv.paidDate : null) : inv.date;
      if (!inP(d)) return;
      const t = App.invoiceTotals(inv);
      Object.entries(t.byRate).forEach(([r, v]) => addRate(r, v.base * t.sign, v.tva * t.sign));
      docs.invoices.push(inv);
    });
    let dedAbs = 0, dedImmo = 0;
    s.expenses.forEach((e) => { if (inP(e.date)) { dedAbs += Number(e.tva) || 0; docs.expenses.push(e); } });
    s.assets.forEach((a) => { if (inP(a.date)) { dedImmo += round2((Number(a.value) || 0) * (Number(a.tvaRate) || 0) / 100); docs.assets.push(a); } });
    s.bank.forEach((b) => {
      if (!inP(b.date) || !b.matched || b.matched.type !== 'category') return;
      const rate = Number(b.matched.tvaRate) || 0; if (!rate) return;
      const ttc = Math.abs(b.amount), ht = round2(ttc / (1 + rate / 100)), tva = round2(ttc - ht);
      if (b.amount > 0) addRate(rate, ht, tva); else if (b.matched.account.startsWith('6')) dedAbs += tva;
      docs.bank.push(b);
    });
    const collected = round2(Object.values(rates).reduce((x, r) => x + r.tva, 0));
    const baseTotal = round2(Object.values(rates).reduce((x, r) => x + r.base, 0));

    // crédit reporté de la déclaration précédente
    const prev = s.tvaDeclarations.filter((d) => d.end < start).sort((a, b) => (a.end < b.end ? 1 : -1))[0];
    const creditPrevious = prev && prev.net < 0 ? round2(-prev.net) : 0;
    dedAbs = round2(dedAbs); dedImmo = round2(dedImmo);
    const totalDed = round2(dedAbs + dedImmo + creditPrevious);
    const net = round2(collected - totalDed);
    return {
      start, end, rates, baseTotal, collected, deductibleAbs: dedAbs, deductibleImmo: dedImmo, creditPrevious, totalDed, net, docs,
      ca3: {
        '01 — Ventes, prestations de services': baseTotal,
        '08 — Base taux normal 20 %': rates[20]?.base || 0,
        '9B — Base taux intermédiaire 10 %': rates[10]?.base || 0,
        '09 — Base taux réduit 5,5 %': rates[5.5]?.base || 0,
        '10 — Base taux particulier 2,1 %': rates[2.1]?.base || 0,
        '16 — Total TVA brute due': collected,
        '19 — TVA déductible sur immobilisations': dedImmo,
        '20 — TVA déductible sur autres biens et services': dedAbs,
        '22 — Report du crédit apparaissant ligne 27 précédente': creditPrevious,
        '23 — Total TVA déductible': totalDed,
        '25 — Crédit de TVA': net < 0 ? -net : 0,
        '28 — TVA nette due': net > 0 ? net : 0,
      },
    };
  }

  /* Estimation de l'impôt sur les sociétés (taux réduit PME 15 % jusqu'à 42 500 €) */
  function estimateIS(resultatFiscal) {
    const r = Math.max(0, Number(resultatFiscal) || 0);
    const low = Math.min(r, 42500), high = Math.max(0, r - 42500);
    return round2(low * 0.15 + high * 0.25);
  }

  /* Export FEC (art. A47 A-1 du LPF) */
  function exportFEC(year) {
    const fy = App.fiscalYear(year);
    const j = buildJournal().filter((e) => e.date >= fy.start && e.date <= fy.end);
    const head = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'];
    const d8 = (d) => d.replace(/-/g, '');
    const num = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');
    const clean = (s) => String(s || '').replace(/[\t\r\n|]/g, ' ');
    const rows = [head.join('\t')];
    j.forEach((e, i) => {
      e.lines.forEach((l) => {
        rows.push([e.journal, JOURNALS[e.journal] || e.journal, String(i + 1).padStart(6, '0'), d8(e.date), l.account, clean(App.accountLabel(l.account)), '', '', clean(e.ref), d8(e.date), clean(l.label || e.label), num(l.debit), num(l.credit), '', '', d8(e.date), '', ''].join('\t'));
      });
    });
    const siren = (App.state.settings.company.siret || '000000000').replace(/\s/g, '').slice(0, 9) || '000000000';
    return { filename: `${siren}FEC${d8(fy.end)}.txt`, content: rows.join('\r\n') };
  }

  /* Indicateurs du tableau de bord */
  function dashboard(year) {
    const j = buildJournal();
    const is = incomeStatement(year, j);
    const fy = is.fy;
    const bal = trialBalance(null, App.today(), j);
    const treso = sumPrefix(bal, ['512', '530'], 1);
    const s = App.state;
    const unpaid = s.invoices.filter((i) => i.type === 'facture' && i.status === 'envoyee');
    const overdue = unpaid.filter((i) => i.dueDate && i.dueDate < App.today());
    const monthly = Array.from({ length: 12 }, (_, k) => {
      const d = new Date(fy.start + 'T00:00:00'); d.setMonth(d.getMonth() + k);
      const key = d.toISOString().slice(0, 7);
      return { key, label: d.toLocaleDateString('fr-FR', { month: 'short' }), produits: 0, charges: 0 };
    });
    j.forEach((e) => {
      if (e.date < fy.start || e.date > fy.end) return;
      const m = monthly.find((x) => x.key === e.date.slice(0, 7)); if (!m) return;
      e.lines.forEach((l) => {
        if (l.account.startsWith('7')) m.produits = round2(m.produits + l.credit - l.debit);
        if (l.account.startsWith('6') && !l.account.startsWith('695')) m.charges = round2(m.charges + l.debit - l.credit);
      });
    });
    const byCategory = {};
    is.balance.filter((a) => a.account.startsWith('6')).forEach((a) => (byCategory[a.label] = round2((byCategory[a.label] || 0) + a.solde)));
    const now = App.today();
    const currentPeriod = tvaPeriods(Number(now.slice(0, 4))).find((p) => now >= p.start && now <= p.end);
    const tvaCurrent = currentPeriod ? computeTva(currentPeriod.start, currentPeriod.end) : null;
    return {
      is, treso, unpaid, overdue, monthly, byCategory, currentPeriod, tvaCurrent,
      unpaidTotal: round2(unpaid.reduce((x, i) => x + App.invoiceTotals(i).ttc, 0)),
      overdueTotal: round2(overdue.reduce((x, i) => x + App.invoiceTotals(i).ttc, 0)),
      bankToReconcile: s.bank.filter((b) => !b.matched).length,
    };
  }

  /* Contexte comptable résumé pour l'IA */
  function aiContext() {
    const s = App.state;
    const year = new Date().getFullYear();
    const db = dashboard(year);
    const bs = balanceSheet(year);
    return {
      date_du_jour: App.today(),
      entreprise: { nom: s.settings.company.name, forme: s.settings.company.legalForm, regime_tva: s.settings.company.regimeTva, periodicite_tva: s.settings.company.tvaPeriod, exigibilite: s.settings.company.exigibilite, impot: s.settings.company.impot },
      exercice: db.is.fy,
      compte_de_resultat: Object.fromEntries(Object.entries(db.is).filter(([k, v]) => typeof v === 'number')),
      bilan: { actif: bs.actif, passif: bs.passif, equilibre: bs.equilibre },
      tresorerie: db.treso,
      factures_impayees: db.unpaid.map((i) => ({ numero: i.number, client: (s.clients.find((c) => c.id === i.clientId) || {}).name, ttc: App.invoiceTotals(i).ttc, echeance: i.dueDate })),
      tva_periode_en_cours: db.tvaCurrent ? { periode: db.currentPeriod.label, collectee: db.tvaCurrent.collected, deductible: db.tvaCurrent.totalDed, nette: db.tvaCurrent.net } : null,
      charges_par_categorie: db.byCategory,
      ca_mensuel: db.monthly,
      operations_bancaires_a_rapprocher: s.bank.filter((b) => !b.matched).map((b) => ({ date: b.date, libelle: b.label, montant: b.amount })),
      nb_depenses: s.expenses.length, nb_factures: s.invoices.length,
      dernieres_depenses: s.expenses.slice(-30).map((e) => ({ date: e.date, fournisseur: e.supplier, compte: e.account, ht: e.ht, tva: e.tva })),
      immobilisations: s.assets.map((a) => ({ libelle: a.label, valeur: a.value, date: a.date, duree: a.duration })),
    };
  }

  Object.assign(App, {
    JOURNALS, buildJournal, trialBalance, incomeStatement, balanceSheet, tvaPeriods, computeTva,
    depreciationSchedule, estimateIS, exportFEC, dashboard, aiContext, amortAccount,
  });
})(window.App);
