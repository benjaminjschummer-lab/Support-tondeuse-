/* ComptaPro — TVA, journal, états financiers, clôture annuelle */
(function (App) {
  const { $, $$, esc, eur, fdate, round2, head } = App;
  const V = App.views;

  /* ============ TVA ============ */
  V.tva = (el) => {
    const s = App.state, c = s.settings.company;
    const y = App.getYear();
    if (c.regimeTva === 'franchise') {
      const ca = App.incomeStatement(y).chiffreAffaires;
      el.innerHTML = head('TVA', 'Franchise en base de TVA (art. 293 B du CGI)') + `<div class="card"><div class="alert">Vous êtes en franchise en base : vous ne facturez pas de TVA et ne la récupérez pas. La mention « TVA non applicable, art. 293 B du CGI » est ajoutée automatiquement à vos factures.</div>
        <div class="kpi"><div class="label">Chiffre d'affaires ${y}</div><div class="value">${eur(ca)}</div><div class="sub">Surveillez les seuils de franchise (prestations de services / ventes) : en cas de dépassement, la TVA devient exigible. Demandez le seuil applicable à l'assistant IA.</div></div>
        <p><a class="btn" href="#/parametres">Changer de régime de TVA</a></p></div>`;
      return;
    }
    const periods = App.tvaPeriods(y);
    el.innerHTML = head('TVA', `Régime ${c.regimeTva === 'reel_normal' ? 'réel normal' : 'réel simplifié'} · déclaration ${c.tvaPeriod} · TVA sur les ${c.exigibilite}`, `<select id="year">${App.yearOptions(y)}</select>`) +
      `<div class="card"><div class="table-wrap"><table><thead><tr><th>Période</th><th class="num">Base HT</th><th class="num">TVA collectée</th><th class="num">TVA déductible</th><th class="num">Solde</th><th>Statut</th><th></th></tr></thead><tbody>
      ${periods.map((p) => {
        const dec = s.tvaDeclarations.find((d) => d.start === p.start && d.end === p.end);
        const t = dec || App.computeTva(p.start, p.end);
        const future = p.start > App.today();
        const st = dec ? (dec.paid || dec.net <= 0 ? '<span class="badge success">Déclarée' + (dec.net > 0 ? ' & payée' : '') + '</span>' : '<span class="badge primary">Déclarée — à payer</span>') : future ? '<span class="badge">À venir</span>' : p.end < App.today() ? '<span class="badge warning">À déclarer</span>' : '<span class="badge">En cours</span>';
        return `<tr><td><strong>${esc(p.label)}</strong><div class="small muted">${fdate(p.start)} → ${fdate(p.end)}</div></td><td class="num">${eur(t.baseTotal)}</td><td class="num">${eur(t.collected)}</td><td class="num">${eur(t.totalDed)}</td><td class="num ${t.net > 0 ? 'neg' : 'pos'}">${t.net >= 0 ? eur(t.net) + ' à payer' : eur(-t.net) + ' crédit'}</td><td>${st}</td><td class="num">${future ? '' : `<button class="btn sm" data-p="${p.start}|${p.end}|${esc(p.label)}">${dec ? 'Voir' : 'Préparer'}</button>`}</td></tr>`;
      }).join('')}
      </tbody></table></div></div>
      <div class="card"><h2>Comment ça marche</h2><p class="muted">La TVA collectée provient de vos factures émises (ou encaissées, selon l'exigibilité choisie), la TVA déductible de vos dépenses et immobilisations. « Préparer » calcule les cases du formulaire CA3 (ou CA12) à reporter sur impots.gouv.fr ; « Valider » passe l'écriture de liquidation (44571 / 44566 / 44562 / 44551) et le paiement en banque.</p></div>`;
    $('#year', el).onchange = (e) => { App.setYear(e.target.value); V.tva(el); };
    $$('[data-p]', el).forEach((b) => (b.onclick = () => { const [st, en, lb] = b.dataset.p.split('|'); tvaModal(st, en, lb); }));
  };

  function tvaModal(start, end, label) {
    const s = App.state;
    const dec = s.tvaDeclarations.find((d) => d.start === start && d.end === end);
    const t = App.computeTva(start, end);
    const shown = dec || t;
    const ca3 = dec ? dec.ca3 : t.ca3;
    App.modal({
      title: `TVA — ${esc(label)}`, wide: true,
      body: `${dec ? `<div class="alert success">Déclaration validée le ${fdate(dec.validatedAt)}. Les montants sont figés.</div>` : ''}
        ${!dec && Math.abs(t.net - (dec ? dec.net : t.net)) > 0.01 ? '' : ''}
        <div class="grid grid-2"><div><h3>Formulaire CA3 — cases à reporter</h3><table><tbody>${Object.entries(ca3).map(([k, v]) => `<tr ${/^(16|23|28|25)/.test(k) ? 'class="total"' : ''}><td>${esc(k)}</td><td class="num">${eur(v)}</td></tr>`).join('')}</tbody></table></div>
        <div><h3>Détail par taux</h3><table><thead><tr><th>Taux</th><th class="num">Base HT</th><th class="num">TVA</th></tr></thead><tbody>${Object.entries(shown.rates || {}).map(([r, v]) => `<tr><td>${r} %</td><td class="num">${eur(v.base)}</td><td class="num">${eur(v.tva)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Aucune vente</td></tr>'}</tbody></table>
        ${!dec ? `<h3 style="margin-top:18px">Pièces prises en compte</h3><p class="small muted">${t.docs.invoices.length} facture(s), ${t.docs.expenses.length} dépense(s), ${t.docs.assets.length} immobilisation(s), ${t.docs.bank.length} opération(s) bancaire(s).</p>` : ''}
        <div class="alert ${shown.net > 0 ? 'warning' : 'success'}" style="margin-top:14px"><strong>${shown.net > 0 ? 'TVA nette à payer : ' + eur(shown.net) : 'Crédit de TVA : ' + eur(-shown.net)}</strong>${shown.net < 0 ? '<br><span class="small">Reporté automatiquement sur la déclaration suivante (ou remboursable sur demande, formulaire 3519).</span>' : ''}</div></div></div>
        ${dec && dec.net > 0 ? `<label class="field" style="max-width:240px;margin-top:12px">Date de paiement <input type="date" id="pd" value="${dec.paidDate || App.today()}"></label>` : ''}`,
      footer: dec
        ? `<button class="btn danger" id="cancel">Annuler la validation</button><button class="btn" data-close>Fermer</button>${dec.net > 0 && !dec.paid ? '<button class="btn primary" id="pay">Marquer comme payée</button>' : ''}`
        : `<button class="btn" data-close>Fermer</button><button class="btn" id="csv">Exporter</button><button class="btn primary" id="val">Valider la déclaration</button>`,
      onMount: (m, close) => {
        const v = $('#val', m);
        if (v) v.onclick = () => {
          s.tvaDeclarations.push({ id: App.uid(), start, end, label, validatedAt: App.today(), rates: t.rates, baseTotal: t.baseTotal, collected: t.collected, deductibleAbs: t.deductibleAbs, deductibleImmo: t.deductibleImmo, creditPrevious: t.creditPrevious, totalDed: t.totalDed, net: t.net, ca3: t.ca3, paid: false, paidDate: '' });
          App.save(); close(); App.toast('Déclaration validée et écriture passée', 'success'); App.render();
        };
        const csv = $('#csv', m);
        if (csv) csv.onclick = () => App.download(`TVA_${start}_${end}.csv`, App.toCSV([['Case', 'Montant'], ...Object.entries(t.ca3)]), 'text/csv');
        const pay = $('#pay', m);
        if (pay) pay.onclick = () => { dec.paid = true; dec.paidDate = $('#pd', m).value; App.save(); close(); App.render(); };
        const cancel = $('#cancel', m);
        if (cancel) cancel.onclick = () => App.confirmBox('Annuler la validation de cette déclaration ? L\'écriture de liquidation sera supprimée.', () => { s.tvaDeclarations = s.tvaDeclarations.filter((x) => x !== dec); App.save(); close(); App.render(); });
      },
    });
  }

  /* ============ JOURNAL, GRAND LIVRE, BALANCE ============ */
  V.journal = (el) => {
    const y = App.getYear(), fy = App.fiscalYear(y);
    let tab = sessionStorage.getItem('jr-tab') || 'journal';
    const all = App.buildJournal();
    const j = all.filter((e) => e.date >= fy.start && e.date <= fy.end);
    el.innerHTML = head('Journal & grand livre', 'Écritures en partie double générées automatiquement depuis vos pièces, plus vos opérations diverses.',
      `<select id="year">${App.yearOptions(y)}</select><button class="btn" id="od">+ Écriture manuelle</button><button class="btn" id="fec">Export FEC</button>`) +
      `<div class="card"><div class="tabs"><button data-t="journal">Journal</button><button data-t="gl">Grand livre</button><button data-t="balance">Balance</button></div><div id="tc"></div></div>`;
    const draw = () => {
      $$('.tabs button', el).forEach((b) => b.classList.toggle('active', b.dataset.t === tab));
      const tc = $('#tc', el);
      if (tab === 'journal') {
        const jf = sessionStorage.getItem('jr-j') || '';
        const list = j.filter((e) => !jf || e.journal === jf);
        const tot = list.reduce((x, e) => { e.lines.forEach((l) => { x.d += l.debit; x.c += l.credit; }); return x; }, { d: 0, c: 0 });
        tc.innerHTML = `<div class="toolbar"><select id="jf"><option value="">Tous les journaux</option>${App.options(Object.entries(App.JOURNALS), jf)}</select><span class="muted small">${list.length} écriture(s)</span></div>
          ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Jnl</th><th>Pièce</th><th>Compte</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th></tr></thead><tbody>
          ${list.map((e) => e.lines.map((l, k) => `<tr ${k === 0 ? 'style="border-top:2px solid var(--border)"' : ''}><td>${k === 0 ? fdate(e.date) : ''}</td><td>${k === 0 ? e.journal : ''}</td><td>${k === 0 ? esc(e.ref) + (e.source.type === 'manual' ? ` <button class="btn ghost sm" data-del="${e.id}" title="Supprimer">✕</button>` : '') : ''}</td><td title="${esc(App.accountLabel(l.account))}">${l.account}</td><td>${esc(l.label || e.label)}</td><td class="num">${l.debit ? eur(l.debit) : ''}</td><td class="num">${l.credit ? eur(l.credit) : ''}</td></tr>`).join('')).join('')}
          <tr class="total"><td colspan="5">Totaux</td><td class="num">${eur(tot.d)}</td><td class="num">${eur(tot.c)}</td></tr></tbody></table></div>` : '<div class="empty">Aucune écriture sur cet exercice.</div>'}`;
        $('#jf', tc).onchange = (e) => { sessionStorage.setItem('jr-j', e.target.value); draw(); };
        $$('[data-del]', tc).forEach((b) => (b.onclick = () => App.confirmBox('Supprimer cette écriture manuelle ?', () => { App.state.entries = App.state.entries.filter((x) => x.id !== b.dataset.del); App.save(); App.render(); })));
      } else if (tab === 'gl') {
        const bal = App.trialBalance(fy.start, fy.end, all);
        tc.innerHTML = bal.length ? bal.map((a) => {
          let run = 0;
          const lines = j.flatMap((e) => e.lines.filter((l) => l.account === a.account).map((l) => ({ e, l })));
          return `<h2 style="margin-top:18px">${a.account} — ${esc(a.label)}</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Pièce</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th><th class="num">Solde</th></tr></thead><tbody>
            ${lines.map(({ e, l }) => { run = round2(run + l.debit - l.credit); return `<tr><td>${fdate(e.date)}</td><td>${esc(e.ref)}</td><td>${esc(l.label || e.label)}</td><td class="num">${l.debit ? eur(l.debit) : ''}</td><td class="num">${l.credit ? eur(l.credit) : ''}</td><td class="num">${eur(run)}</td></tr>`; }).join('')}
            <tr class="total"><td colspan="3">Total compte</td><td class="num">${eur(a.debit)}</td><td class="num">${eur(a.credit)}</td><td class="num">${eur(a.solde)}</td></tr></tbody></table></div>`;
        }).join('') : '<div class="empty">Aucune écriture.</div>';
      } else {
        const bal = App.trialBalance(fy.start, fy.end, all);
        const t = bal.reduce((x, a) => ({ d: x.d + a.debit, c: x.c + a.credit }), { d: 0, c: 0 });
        tc.innerHTML = `<div class="toolbar"><button class="btn sm" id="bcsv">Exporter la balance</button></div><div class="table-wrap"><table><thead><tr><th>Compte</th><th>Intitulé</th><th class="num">Débit</th><th class="num">Crédit</th><th class="num">Solde débiteur</th><th class="num">Solde créditeur</th></tr></thead><tbody>
          ${bal.map((a) => `<tr><td>${a.account}</td><td>${esc(a.label)}</td><td class="num">${eur(a.debit)}</td><td class="num">${eur(a.credit)}</td><td class="num">${a.solde > 0 ? eur(a.solde) : ''}</td><td class="num">${a.solde < 0 ? eur(-a.solde) : ''}</td></tr>`).join('')}
          <tr class="total"><td colspan="2">Totaux ${Math.abs(t.d - t.c) < 0.01 ? '<span class="badge success">équilibrée</span>' : '<span class="badge danger">déséquilibrée</span>'}</td><td class="num">${eur(t.d)}</td><td class="num">${eur(t.c)}</td><td></td><td></td></tr></tbody></table></div>`;
        $('#bcsv', tc).onclick = () => App.download(`balance_${y}.csv`, App.toCSV([['Compte', 'Intitulé', 'Débit', 'Crédit', 'Solde'], ...bal.map((a) => [a.account, a.label, a.debit, a.credit, a.solde])]), 'text/csv');
      }
    };
    $$('.tabs button', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; sessionStorage.setItem('jr-tab', tab); draw(); }));
    $('#year', el).onchange = (e) => { App.setYear(e.target.value); V.journal(el); };
    $('#fec', el).onclick = () => { const f = App.exportFEC(y); App.download(f.filename, f.content); App.toast('FEC exporté : ' + f.filename, 'success'); };
    $('#od', el).onclick = manualEntry;
    draw();
  };

  function manualEntry() {
    const lines = [{ account: '', label: '', debit: 0, credit: 0 }, { account: '', label: '', debit: 0, credit: 0 }];
    const known = Object.entries(App.ACCOUNT_LABELS).sort();
    const draw = (m) => {
      const t = lines.reduce((x, l) => ({ d: x.d + Number(l.debit || 0), c: x.c + Number(l.credit || 0) }), { d: 0, c: 0 });
      $('#ol', m).innerHTML = lines.map((l, k) => `<tr data-k="${k}"><td><input list="acc-list" data-f="account" value="${esc(l.account)}" placeholder="ex. 625100"></td><td><input data-f="label" value="${esc(l.label)}"></td><td><input type="number" step="0.01" data-f="debit" value="${l.debit || ''}"></td><td><input type="number" step="0.01" data-f="credit" value="${l.credit || ''}"></td></tr>`).join('') +
        `<tr class="total"><td colspan="2">${Math.abs(t.d - t.c) < 0.01 && t.d > 0 ? '<span class="badge success">Équilibrée</span>' : `<span class="badge danger">Écart ${eur(t.d - t.c)}</span>`}</td><td class="num">${eur(t.d)}</td><td class="num">${eur(t.c)}</td></tr>`;
      $$('[data-f]', m).forEach((i) => (i.onchange = () => { const l = lines[i.closest('tr').dataset.k]; l[i.dataset.f] = i.dataset.f === 'debit' || i.dataset.f === 'credit' ? Number(i.value) || 0 : i.value.trim(); draw(m); }));
    };
    App.modal({
      title: 'Écriture manuelle (opération diverse)', wide: true,
      body: `<div class="form-grid"><label class="field">Date <input type="date" id="od-date" value="${App.today()}"></label><label class="field">Journal <select id="od-j">${App.options(Object.entries(App.JOURNALS), 'OD')}</select></label><label class="field">Pièce <input id="od-ref" value="OD"></label><label class="field full">Libellé <input id="od-label" placeholder="ex. Charges constatées d'avance, salaires, emprunt…"></label></div>
        <datalist id="acc-list">${known.map(([a, l]) => `<option value="${a}">${esc(l)}</option>`).join('')}</datalist>
        <div class="table-wrap" style="margin-top:14px"><table class="lines-table"><thead><tr><th>Compte</th><th>Libellé</th><th>Débit</th><th>Crédit</th></tr></thead><tbody id="ol"></tbody></table></div>
        <button class="btn sm" id="addl" style="margin-top:8px">+ Ligne</button>`,
      footer: '<button class="btn" data-close>Annuler</button><button class="btn primary" id="ok">Enregistrer</button>',
      onMount: (m, close) => {
        draw(m);
        $('#addl', m).onclick = () => { lines.push({ account: '', label: '', debit: 0, credit: 0 }); draw(m); };
        $('#ok', m).onclick = () => {
          const valid = lines.filter((l) => l.account && (l.debit || l.credit));
          const d = round2(valid.reduce((x, l) => x + l.debit, 0)), c = round2(valid.reduce((x, l) => x + l.credit, 0));
          if (valid.length < 2 || d !== c) return App.toast('L\'écriture doit comporter au moins 2 lignes et être équilibrée', 'error');
          if (valid.some((l) => !/^\d{3,8}$/.test(l.account))) return App.toast('Numéro de compte invalide (chiffres uniquement)', 'error');
          valid.forEach((l) => { l.account = l.account.padEnd(6, '0'); });
          App.state.entries.push({ id: 'OD-' + App.uid(), date: $('#od-date', m).value, journal: $('#od-j', m).value, ref: $('#od-ref', m).value, label: $('#od-label', m).value || 'Opération diverse', lines: valid });
          App.save(); close(); App.toast('Écriture enregistrée', 'success'); App.render();
        };
      },
    });
  }

  /* ============ ÉTATS FINANCIERS ============ */
  function incomeHTML(r, prev) {
    const row = (l, v, p, cls) => `<tr class="${cls || ''}"><td>${l}</td><td class="num">${eur(v)}</td>${prev ? `<td class="num muted">${eur(p)}</td>` : ''}</tr>`;
    const P = prev || {};
    return `<table class="statement"><thead><tr><th>Compte de résultat</th><th class="num">${r.fy.label}</th>${prev ? `<th class="num">${prev.fy.label}</th>` : ''}</tr></thead><tbody>
      <tr class="section"><td colspan="3">Produits d'exploitation</td></tr>
      ${row('Ventes de marchandises', r.ventesMarchandises, P.ventesMarchandises)}${row('Production vendue (services)', r.production, P.production)}
      ${row('Chiffre d\'affaires net', r.chiffreAffaires, P.chiffreAffaires, 'sub')}${row('Subventions d\'exploitation', r.subventions, P.subventions)}${row('Autres produits', r.autresProduits, P.autresProduits)}
      ${row('Total produits d\'exploitation', r.produitsExploitation, P.produitsExploitation, 'total')}
      <tr class="section"><td colspan="3">Charges d'exploitation</td></tr>
      ${row('Achats de marchandises', r.achatsMarchandises, P.achatsMarchandises)}${row('Achats de matières et fournitures', r.achatsMatieres, P.achatsMatieres)}${row('Autres achats et charges externes', r.chargesExternes, P.chargesExternes)}
      ${row('Impôts, taxes et versements assimilés', r.impotsTaxes, P.impotsTaxes)}${row('Salaires et traitements', r.salaires, P.salaires)}${row('Charges sociales', r.chargesSociales, P.chargesSociales)}
      ${row('Dotations aux amortissements', r.dotations, P.dotations)}${row('Autres charges', r.autresCharges, P.autresCharges)}
      ${row('Total charges d\'exploitation', r.chargesExploitation, P.chargesExploitation, 'total')}
      ${row('<strong>Résultat d\'exploitation</strong>', r.resultatExploitation, P.resultatExploitation, 'total')}
      ${row('Produits financiers', r.produitsFinanciers, P.produitsFinanciers)}${row('Charges financières', r.chargesFinancieres, P.chargesFinancieres)}
      ${row('Résultat financier', r.resultatFinancier, P.resultatFinancier, 'sub')}${row('<strong>Résultat courant avant impôt</strong>', r.resultatCourant, P.resultatCourant, 'total')}
      ${row('Produits exceptionnels', r.produitsExceptionnels, P.produitsExceptionnels)}${row('Charges exceptionnelles', r.chargesExceptionnelles, P.chargesExceptionnelles)}
      ${row('Résultat exceptionnel', r.resultatExceptionnel, P.resultatExceptionnel, 'sub')}${row('Impôt sur les bénéfices', r.is, P.is)}
      ${row('<strong>RÉSULTAT NET</strong>', r.resultatNet, P.resultatNet, 'total')}
    </tbody></table>`;
  }

  function balanceHTML(b) {
    const A = b.actif, P = b.passif;
    return `<div class="grid grid-2">
      <div><table class="statement"><thead><tr><th>Actif</th><th class="num">Brut</th><th class="num">Amort.</th><th class="num">Net</th></tr></thead><tbody>
        <tr class="section"><td colspan="4">Actif immobilisé</td></tr>
        <tr><td>Immobilisations incorporelles</td><td class="num">${eur(A.immoIncorp.brut)}</td><td class="num">${eur(A.immoIncorp.amort)}</td><td class="num">${eur(A.immoIncorp.net)}</td></tr>
        <tr><td>Immobilisations corporelles</td><td class="num">${eur(A.immoCorp.brut)}</td><td class="num">${eur(A.immoCorp.amort)}</td><td class="num">${eur(A.immoCorp.net)}</td></tr>
        <tr><td>Immobilisations financières</td><td class="num">${eur(A.immoFin.brut)}</td><td class="num"></td><td class="num">${eur(A.immoFin.net)}</td></tr>
        <tr class="total"><td colspan="3">Total actif immobilisé</td><td class="num">${eur(A.totalImmo)}</td></tr>
        <tr class="section"><td colspan="4">Actif circulant</td></tr>
        <tr><td colspan="3">Stocks</td><td class="num">${eur(A.stocks)}</td></tr>
        <tr><td colspan="3">Créances clients</td><td class="num">${eur(A.clients)}</td></tr>
        <tr><td colspan="3">Autres créances (dont TVA)</td><td class="num">${eur(A.autresCreances)}</td></tr>
        <tr><td colspan="3">Disponibilités</td><td class="num">${eur(A.disponibilites)}</td></tr>
        <tr><td colspan="3">Charges constatées d'avance</td><td class="num">${eur(A.chargesConstatees)}</td></tr>
        <tr class="total"><td colspan="3">Total actif circulant</td><td class="num">${eur(A.totalCirculant)}</td></tr>
        <tr class="total"><td colspan="3"><strong>TOTAL ACTIF</strong></td><td class="num">${eur(A.total)}</td></tr>
      </tbody></table></div>
      <div><table class="statement"><thead><tr><th>Passif</th><th class="num">Montant</th></tr></thead><tbody>
        <tr class="section"><td colspan="2">Capitaux propres</td></tr>
        <tr><td>Capital / compte de l'exploitant</td><td class="num">${eur(P.capital)}</td></tr>
        <tr><td>Réserves</td><td class="num">${eur(P.reserves)}</td></tr>
        <tr><td>Report à nouveau</td><td class="num">${eur(P.reportANouveau)}</td></tr>
        <tr><td>Résultat de l'exercice</td><td class="num ${P.resultat >= 0 ? 'pos' : 'neg'}">${eur(P.resultat)}</td></tr>
        <tr class="total"><td>Total capitaux propres</td><td class="num">${eur(P.capitauxPropres)}</td></tr>
        <tr><td>Provisions</td><td class="num">${eur(P.provisions)}</td></tr>
        <tr class="section"><td colspan="2">Dettes</td></tr>
        <tr><td>Emprunts et dettes financières</td><td class="num">${eur(P.emprunts)}</td></tr>
        <tr><td>Dettes fournisseurs</td><td class="num">${eur(P.fournisseurs)}</td></tr>
        <tr><td>Dettes fiscales et sociales (dont TVA)</td><td class="num">${eur(P.dettesFiscales)}</td></tr>
        <tr><td>Autres dettes (comptes courants…)</td><td class="num">${eur(P.autresDettes)}</td></tr>
        <tr><td>Produits constatés d'avance</td><td class="num">${eur(P.produitsConstates)}</td></tr>
        <tr class="total"><td>Total dettes</td><td class="num">${eur(P.dettes)}</td></tr>
        <tr class="total"><td><strong>TOTAL PASSIF</strong></td><td class="num">${eur(P.total)}</td></tr>
      </tbody></table></div></div>
      ${b.equilibre ? '<div class="alert success" style="margin-top:14px">✓ Bilan équilibré</div>' : `<div class="alert danger" style="margin-top:14px">Écart actif / passif : ${eur(b.ecart)}. Vérifiez vos écritures manuelles.</div>`}`;
  }

  function sig(r) {
    const ca = r.chiffreAffaires || 1;
    const rows = [['Chiffre d\'affaires', r.chiffreAffaires], ['Valeur ajoutée', r.valeurAjoutee], ['Excédent brut d\'exploitation (EBE)', r.ebe], ['Résultat d\'exploitation', r.resultatExploitation], ['Résultat courant avant impôt', r.resultatCourant], ['Résultat net', r.resultatNet], ['Capacité d\'autofinancement (approx.)', round2(r.resultatNet + r.dotations)]];
    return `<table><thead><tr><th>Soldes intermédiaires de gestion</th><th class="num">Montant</th><th class="num">% CA</th></tr></thead><tbody>${rows.map(([l, v]) => `<tr><td>${l}</td><td class="num">${eur(v)}</td><td class="num">${App.pct((v / ca) * 100)}</td></tr>`).join('')}</tbody></table>`;
  }

  V.etats = (el) => {
    const y = App.getYear();
    let tab = sessionStorage.getItem('et-tab') || 'resultat';
    const j = App.buildJournal();
    const r = App.incomeStatement(y, j), prev = App.incomeStatement(y - 1, j), b = App.balanceSheet(y, j);
    el.innerHTML = head('Bilan & compte de résultat', `Exercice ${r.fy.label} — états établis selon le PCG (modèle simplifié type 2033).`,
      `<select id="year">${App.yearOptions(y)}</select>${App.isArtifact ? '' : '<button class="btn" id="print">Imprimer / PDF</button>'}`) +
      `<div class="card"><div class="tabs no-print"><button data-t="resultat">Compte de résultat</button><button data-t="bilan">Bilan</button><button data-t="sig">Soldes de gestion</button></div><div id="tc"></div></div>`;
    const draw = () => {
      $$('.tabs button', el).forEach((x) => x.classList.toggle('active', x.dataset.t === tab));
      $('#tc', el).innerHTML = `<div class="table-wrap">${tab === 'resultat' ? incomeHTML(r, prev) : tab === 'bilan' ? balanceHTML(b) : sig(r)}</div>`;
    };
    $$('.tabs button', el).forEach((x) => (x.onclick = () => { tab = x.dataset.t; sessionStorage.setItem('et-tab', tab); draw(); }));
    $('#year', el).onchange = (e) => { App.setYear(e.target.value); V.etats(el); };
    if ($('#print', el)) $('#print', el).onclick = () => window.print();
    draw();
  };

  /* ============ CLÔTURE ANNUELLE ============ */
  V.cloture = (el) => {
    const s = App.state, c = s.settings.company;
    const y = App.getYear(), fy = App.fiscalYear(y);
    const j = App.buildJournal();
    const r = App.incomeStatement(y, j), b = App.balanceSheet(y, j);
    const closing = s.closings.find((x) => x.year === y);
    const inFy = (d) => d >= fy.start && d <= fy.end;
    const bankTodo = s.bank.filter((x) => inFy(x.date) && !x.matched).length;
    const drafts = s.invoices.filter((i) => inFy(i.date) && i.type === 'facture' && i.status === 'brouillon').length;
    const unpaid = s.invoices.filter((i) => inFy(i.date) && i.type === 'facture' && i.status === 'envoyee');
    const noReceipt = s.expenses.filter((e) => inFy(e.date) && !e.receipt).length;
    const periods = c.regimeTva === 'franchise' ? [] : App.tvaPeriods(y);
    const tvaTodo = periods.filter((p) => p.end < App.today() && !s.tvaDeclarations.some((d) => d.start === p.start)).length;
    const suspense = App.trialBalance(null, fy.end, j).filter((a) => a.account.startsWith('471') && Math.abs(a.solde) > 0.01);
    const isEstimate = c.impot === 'IS' ? App.estimateIS(r.resultatAvantImpot) : 0;
    const checks = [
      { ok: !bankTodo, t: 'Rapprochement bancaire', d: bankTodo ? `${bankTodo} opération(s) non rapprochée(s) — <a href="#/banque">rapprocher</a>` : 'Toutes les opérations sont rapprochées' },
      { ok: !drafts, t: 'Factures en brouillon', d: drafts ? `${drafts} facture(s) en brouillon non comptabilisée(s) — <a href="#/factures">vérifier</a>` : 'Aucune' },
      { ok: !unpaid.length, t: 'Créances clients', d: unpaid.length ? `${unpaid.length} facture(s) non réglée(s) (${eur(unpaid.reduce((x, i) => x + App.invoiceTotals(i).ttc, 0))}). Évaluez le risque d'impayé : provision pour créance douteuse (compte 491/6817) si nécessaire.` : 'Toutes les factures sont réglées' },
      { ok: !noReceipt, t: 'Justificatifs', d: noReceipt ? `${noReceipt} dépense(s) sans justificatif — à conserver 10 ans` : 'Tous les justificatifs sont joints' },
      { ok: !tvaTodo, t: 'Déclarations de TVA', d: tvaTodo ? `${tvaTodo} période(s) échue(s) non déclarée(s) — <a href="#/tva">déclarer</a>` : c.regimeTva === 'franchise' ? 'Franchise en base' : 'À jour' },
      { ok: true, t: 'Amortissements', d: `Dotations ${y} calculées automatiquement : ${eur(r.dotations)}` },
      { ok: !suspense.length, t: 'Compte d\'attente 471', d: suspense.length ? `Solde de ${eur(suspense.reduce((x, a) => x + a.solde, 0))} à reclasser via une écriture manuelle` : 'Soldé' },
      { ok: b.equilibre, t: 'Équilibre du bilan', d: b.equilibre ? 'Actif = passif' : 'Écart ' + eur(b.ecart) },
      { ok: !!closing, t: 'Impôt et clôture', d: closing ? `Exercice clôturé le ${fdate(closing.date)}${closing.isAmount ? ' — IS comptabilisé : ' + eur(closing.isAmount) : ''}` : 'À enregistrer ci-dessous' },
    ];
    const done = checks.filter((x) => x.ok).length;
    el.innerHTML = head('Clôture annuelle', `Exercice ${fy.label} — du ${fdate(fy.start)} au ${fdate(fy.end)}`, `<select id="year">${App.yearOptions(y)}</select>`) +
      `<div class="grid grid-2">
        <div class="card"><h2>Check-list de clôture (${done}/${checks.length})</h2><ul class="checklist">${checks.map((x) => `<li><span class="st ${x.ok ? 'ok' : 'ko'}">${x.ok ? '✓' : '!'}</span><div><strong>${x.t}</strong><div class="small muted">${x.d}</div></div></li>`).join('')}</ul></div>
        <div class="card"><h2>Synthèse</h2><table><tbody>
          <tr><td>Chiffre d'affaires</td><td class="num">${eur(r.chiffreAffaires)}</td></tr>
          <tr><td>Résultat avant impôt</td><td class="num">${eur(r.resultatAvantImpot)}</td></tr>
          <tr><td>${c.impot === 'IS' ? 'IS estimé (15 % / 25 %)' : 'Résultat imposable à l\'IR (BIC/BNC)'}</td><td class="num">${eur(c.impot === 'IS' ? isEstimate : r.resultatAvantImpot)}</td></tr>
          <tr class="total"><td>Résultat net ${closing ? '' : '(prévisionnel)'}</td><td class="num">${eur(c.impot === 'IS' && !closing ? r.resultatAvantImpot - isEstimate : r.resultatNet)}</td></tr>
          <tr><td>Total du bilan</td><td class="num">${eur(b.actif.total)}</td></tr>
          <tr><td>Capitaux propres</td><td class="num">${eur(b.passif.capitauxPropres)}</td></tr>
          <tr><td>Trésorerie</td><td class="num">${eur(b.actif.disponibilites)}</td></tr></tbody></table>
          ${closing ? `<div class="alert success" style="margin-top:14px">Exercice clôturé. Le résultat sera reporté automatiquement en « report à nouveau » à l'ouverture de l'exercice suivant.</div><button class="btn danger" id="reopen">Rouvrir l'exercice</button>`
            : `<div class="form-grid" style="margin-top:14px">${c.impot === 'IS' ? `<label class="field">Montant de l'IS à comptabiliser <input type="number" step="1" id="isamt" value="${Math.round(isEstimate)}"></label>` : ''}</div>
               <div class="actions" style="margin-top:12px"><button class="btn primary" id="close">Clôturer l'exercice ${y}</button></div>`}
        </div></div>
      <div class="card"><h2>Documents de fin d'exercice</h2><div class="actions">
        <a class="btn" href="#/etats">Bilan & compte de résultat</a>
        <button class="btn" id="fec">Fichier des écritures comptables (FEC)</button>
        <button class="btn" id="liasse">Tableau de reprise liasse 2033</button>
        <button class="btn" id="ai-close" ${App.ai.isReady() ? '' : 'disabled title="Activez l\'IA dans les paramètres"'}>✦ Revue de clôture par l'IA</button>
      </div><div id="ai-out" class="report" style="margin-top:14px"></div></div>
      <div class="card"><h2>Échéances après clôture</h2><ul>
        <li>Liasse fiscale (2033 ou 2050) et ${c.impot === 'IS' ? 'relevé de solde d\'IS (2572)' : 'déclaration de résultat (2031 BIC / 2035 BNC)'} : en général le 2e jour ouvré suivant le 1er mai pour une clôture au 31/12 (délai supplémentaire de 15 jours en ligne).</li>
        ${c.regimeTva === 'reel_simplifie' ? '<li>Déclaration annuelle de TVA CA12 : début mai pour une clôture au 31/12.</li>' : ''}
        ${c.legalForm !== 'EI' && c.legalForm !== 'Micro' ? '<li>Approbation des comptes par l\'assemblée dans les 6 mois, puis dépôt au greffe dans le mois suivant.</li>' : ''}
        <li>Déclaration des revenus du dirigeant / DSI selon le statut.</li></ul></div>`;
    $('#year', el).onchange = (e) => { App.setYear(e.target.value); V.cloture(el); };
    $('#fec', el).onclick = () => { const f = App.exportFEC(y); App.download(f.filename, f.content); };
    $('#liasse', el).onclick = () => liasse(r, b);
    const cl = $('#close', el);
    if (cl) cl.onclick = () => App.confirmBox(`Clôturer l'exercice ${y} ? ${checks.some((x) => !x.ok && x.t !== 'Impôt et clôture') ? '<br><strong>Certains contrôles ne sont pas validés.</strong>' : ''}`, () => {
      s.closings.push({ year: y, date: App.today(), isAmount: c.impot === 'IS' ? Number(($('#isamt', el) || {}).value) || 0 : 0 });
      App.save(); App.toast('Exercice clôturé', 'success'); App.render();
    }, 'Clôturer');
    const ro = $('#reopen', el);
    if (ro) ro.onclick = () => App.confirmBox('Rouvrir l\'exercice ? L\'écriture d\'IS sera supprimée.', () => { s.closings = s.closings.filter((x) => x.year !== y); App.save(); App.render(); });
    const aiBtn = $('#ai-close', el);
    if (aiBtn) aiBtn.onclick = async () => {
      aiBtn.disabled = true; const out = $('#ai-out', el); out.innerHTML = '<span class="spinner"></span> Revue en cours…';
      try {
        await App.ai.chat([{ role: 'user', content: `Fais la revue de clôture de l'exercice ${fy.label}. Check-list : ${JSON.stringify(checks.map((x) => ({ point: x.t, ok: x.ok, detail: x.d.replace(/<[^>]+>/g, '') })))}. Liste les écritures d'inventaire à passer (charges à payer, produits à recevoir, charges et produits constatés d'avance, provisions), les risques fiscaux, l'optimisation possible du résultat (légale), et le montant d'IS/IR. Termine par un plan d'action numéroté.` }], (t) => (out.innerHTML = App.ai.md(t)));
      } catch (e) { out.innerHTML = `<div class="alert danger">${esc(e.message)}</div>`; }
      aiBtn.disabled = false;
    };
  };

  function liasse(r, b) {
    const rows = [
      ['2033-A', 'Immobilisations incorporelles (net)', b.actif.immoIncorp.net], ['2033-A', 'Immobilisations corporelles (net)', b.actif.immoCorp.net],
      ['2033-A', 'Créances clients', b.actif.clients], ['2033-A', 'Autres créances', b.actif.autresCreances], ['2033-A', 'Disponibilités', b.actif.disponibilites], ['2033-A', 'TOTAL ACTIF', b.actif.total],
      ['2033-A', 'Capital social ou individuel', b.passif.capital], ['2033-A', 'Report à nouveau', b.passif.reportANouveau], ['2033-A', 'Résultat de l\'exercice', b.passif.resultat],
      ['2033-A', 'Emprunts et dettes assimilées', b.passif.emprunts], ['2033-A', 'Fournisseurs et comptes rattachés', b.passif.fournisseurs], ['2033-A', 'Autres dettes (fiscales, sociales…)', round2(b.passif.dettesFiscales + b.passif.autresDettes)], ['2033-A', 'TOTAL PASSIF', b.passif.total],
      ['2033-B', 'Ventes de marchandises', r.ventesMarchandises], ['2033-B', 'Production vendue (services)', r.production], ['2033-B', 'Subventions d\'exploitation', r.subventions],
      ['2033-B', 'Achats de marchandises', r.achatsMarchandises], ['2033-B', 'Achats de matières premières et approvisionnements', r.achatsMatieres], ['2033-B', 'Autres charges externes', r.chargesExternes],
      ['2033-B', 'Impôts, taxes', r.impotsTaxes], ['2033-B', 'Rémunérations du personnel', r.salaires], ['2033-B', 'Charges sociales', r.chargesSociales], ['2033-B', 'Dotations aux amortissements', r.dotations],
      ['2033-B', 'Résultat d\'exploitation', r.resultatExploitation], ['2033-B', 'Produits financiers', r.produitsFinanciers], ['2033-B', 'Charges financières', r.chargesFinancieres],
      ['2033-B', 'Produits exceptionnels', r.produitsExceptionnels], ['2033-B', 'Charges exceptionnelles', r.chargesExceptionnelles], ['2033-B', 'Impôt sur les bénéfices', r.is], ['2033-B', 'Bénéfice ou perte', r.resultatNet],
    ];
    App.modal({
      title: 'Tableau de reprise — liasse 2033', wide: true,
      body: `<p class="muted small">Montants à reporter sur les formulaires 2033-A (bilan simplifié) et 2033-B (compte de résultat simplifié). Les retraitements fiscaux (2033-B cadre B : réintégrations, déductions) restent à apprécier — demandez à l'assistant IA.</p><table><thead><tr><th>Formulaire</th><th>Rubrique</th><th class="num">Montant</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${x[0]}</td><td>${x[1]}</td><td class="num">${eur(x[2])}</td></tr>`).join('')}</tbody></table>`,
      footer: '<button class="btn" data-close>Fermer</button><button class="btn primary" id="csv">Exporter CSV</button>',
      onMount: (m) => ($('#csv', m).onclick = () => App.download(`liasse_2033_${r.fy.end.slice(0, 4)}.csv`, App.toCSV([['Formulaire', 'Rubrique', 'Montant'], ...rows]), 'text/csv')),
    });
  }
})(window.App);
