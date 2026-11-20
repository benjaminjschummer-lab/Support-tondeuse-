/* ComptaPro Belgique — TVA (déclaration, listing, relevé intracom), journal, comptes annuels, clôture */
(function (App) {
  const { $, $$, esc, eur, fdate, round2, head } = App;
  const V = App.views;

  /* ============ TVA ============ */
  V.tva = (el) => {
    const s = App.state, c = s.settings.company, y = App.getYear();
    if (c.regimeTva !== 'normal') {
      const ca = App.incomeStatement(y).chiffreAffaires;
      el.innerHTML = head('TVA', c.regimeTva === 'franchise' ? 'Régime de la franchise des petites entreprises (art. 56bis CTVA)' : 'Assujetti exempté (art. 44 CTVA)') + `<div class="card">
        <div class="alert">${c.regimeTva === 'franchise' ? 'Vous ne facturez pas de TVA et ne la récupérez pas. Pas de déclaration périodique ; la mention légale de franchise est ajoutée automatiquement à vos factures. Le listing annuel des clients n\'est plus dû depuis 2022 en franchise.' : 'Vos opérations sont exemptées : pas de déclaration périodique ni de droit à déduction.'}</div>
        <div class="kpi"><div class="label">Chiffre d'affaires ${y}</div><div class="value">${eur(ca)}</div><div class="sub">${c.regimeTva === 'franchise' ? `Seuil de franchise : ${eur(s.settings.fiscal.franchiseSeuil)} HTVA par année civile (${App.pct(ca / s.settings.fiscal.franchiseSeuil * 100)} utilisé). En cas de dépassement, le régime normal s'applique dès l'opération qui fait dépasser le seuil.` : ''}</div></div>
        <p><a class="btn" href="#/parametres">Changer de régime de TVA</a></p></div>`;
      return;
    }
    let tab = 'decl';
    try { tab = sessionStorage.getItem('tva-tab') || 'decl'; } catch (e) { /* ignore */ }
    el.innerHTML = head('TVA', `Déclaration ${c.tvaPeriod}, grilles officielles, fichier XML pour Intervat, listing clients et relevé intracommunautaire.`, `<select id="year">${App.yearOptions(y)}</select>`) +
      `<div class="card"><div class="tabs"><button data-t="decl">Déclarations périodiques</button><button data-t="listing">Listing clients ${y}</button><button data-t="intra">Relevé intracommunautaire</button></div><div id="tc"></div></div>`;
    const draw = () => {
      $$('.tabs button', el).forEach((b) => b.classList.toggle('active', b.dataset.t === tab));
      const tc = $('#tc', el);
      if (tab === 'decl') {
        const periods = App.tvaPeriods(y);
        tc.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Période</th><th>Échéance</th><th class="num">Ventes (01-03)</th><th class="num">TVA due (XX)</th><th class="num">Déductible (YY)</th><th class="num">Solde</th><th>Statut</th><th></th></tr></thead><tbody>
          ${periods.map((p) => {
            const dec = s.tvaDeclarations.find((d) => d.start === p.start && d.end === p.end);
            const t = dec || App.computeTva(p.start, p.end);
            const g = t.grids;
            const future = p.start > App.today();
            const st = dec ? (dec.paid || dec.net <= 0 ? '<span class="badge success">Déposée' + (dec.net > 0 ? ' et payée' : '') + '</span>' : '<span class="badge primary">Déposée — à payer</span>') : future ? '<span class="badge">À venir</span>' : p.due < App.today() ? '<span class="badge danger">En retard</span>' : p.end < App.today() ? '<span class="badge warning">À déposer</span>' : '<span class="badge">En cours</span>';
            return `<tr><td><strong>${esc(p.label)}</strong></td><td>${fdate(p.due)}</td><td class="num">${eur((g['01'] || 0) + (g['02'] || 0) + (g['03'] || 0))}</td><td class="num">${eur(t.xx ?? 0)}</td><td class="num">${eur(t.yy ?? 0)}</td><td class="num ${t.net > 0 ? 'neg' : 'pos'}">${t.net >= 0 ? eur(t.net) + ' (71)' : eur(-t.net) + ' (72)'}</td><td>${st}</td><td class="num">${future ? '' : `<button class="btn sm" data-p="${p.start}">${dec ? 'Voir' : 'Préparer'}</button>`}</td></tr>`;
          }).join('')}</tbody></table></div>
          <p class="small muted">Les grilles sont calculées à partir de vos factures (date de facture), dépenses, investissements et opérations bancaires catégorisées. Le fichier XML s'importe dans Intervat (SPF Finances) : vérifiez toujours l'aperçu avant de signer.</p>`;
        $$('[data-p]', tc).forEach((b) => (b.onclick = () => tvaModal(periods.find((p) => p.start === b.dataset.p))));
      } else if (tab === 'listing') {
        const l = App.clientListing(y);
        tc.innerHTML = `<p class="muted">Clients assujettis belges à qui vous avez facturé au moins ${eur(s.settings.fiscal.listingSeuil)} HTVA en ${y}. À déposer via Intervat avant le 31 mars ${y + 1}.</p>
          ${l.list.length ? `<div class="table-wrap"><table><thead><tr><th>Client</th><th>N° TVA</th><th class="num">Chiffre d'affaires HTVA</th><th class="num">TVA</th></tr></thead><tbody>${l.list.map((r) => `<tr><td>${esc(r.client.name)}</td><td>${esc(r.vat)}</td><td class="num">${eur(r.turnover)}</td><td class="num">${eur(r.vatAmount)}</td></tr>`).join('')}<tr class="total"><td colspan="2">Total (${l.list.length} client(s))</td><td class="num">${eur(l.sumT)}</td><td class="num">${eur(l.sumV)}</td></tr></tbody></table></div>` : '<div class="empty">Aucun client à reprendre : listing « néant ».</div>'}
          <div class="actions" style="margin-top:12px"><button class="btn primary" id="lx">Télécharger le XML Intervat</button><button class="btn" id="lc">Exporter CSV</button></div>`;
        $('#lx', tc).onclick = () => App.download(`listing_clients_${y}.xml`, l.xml);
        $('#lc', tc).onclick = () => App.download(`listing_clients_${y}.csv`, App.toCSV([['Client', 'N° TVA', 'CA HTVA', 'TVA'], ...l.list.map((r) => [r.client.name, r.vat, r.turnover, r.vatAmount])]));
      } else {
        const periods = App.tvaPeriods(y);
        tc.innerHTML = `<p class="muted">Relevé des livraisons de biens (L) et prestations de services (S) à des assujettis d'autres États membres, à déposer pour chaque période où vous en avez effectué.</p>` + periods.map((p) => {
          const rows = App.intracomStatement(p.start, p.end);
          return rows.length ? `<h3 style="margin-top:16px">${esc(p.label)} — échéance ${fdate(p.due)}</h3><div class="table-wrap"><table><thead><tr><th>Client</th><th>N° TVA</th><th>Code</th><th class="num">Montant</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.client.name || '')}</td><td>${esc(r.vat)}</td><td>${r.code}</td><td class="num">${eur(r.amount)}</td></tr>`).join('')}</tbody></table></div>` : '';
        }).join('') || '<div class="empty">Aucune opération intracommunautaire cette année.</div>';
      }
    };
    $$('.tabs button', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; try { sessionStorage.setItem('tva-tab', tab); } catch (e) { /* ignore */ } draw(); }));
    $('#year', el).onchange = (e) => { App.setYear(e.target.value); V.tva(el); };
    draw();
  };

  function gridsTable(grids) {
    return App.GRID_SECTIONS.map(([title, keys]) => {
      const rows = keys.filter((k) => grids[k]).map((k) => `<tr ${['71', '72'].includes(k) ? 'class="total"' : ''}><td style="width:56px"><strong>${k}</strong></td><td>${esc(App.GRID_LABELS[k])}</td><td class="num">${eur(grids[k])}</td></tr>`).join('');
      return `<tr class="section"><td colspan="3">${title}</td></tr>${rows || '<tr class="sub"><td colspan="3">—</td></tr>'}`;
    }).join('');
  }

  function tvaModal(p) {
    const s = App.state;
    const dec = s.tvaDeclarations.find((d) => d.start === p.start && d.end === p.end);
    const t = App.computeTva(p.start, p.end);
    const grids = dec ? dec.grids : t.grids;
    const net = dec ? dec.net : t.net;
    const changed = dec && JSON.stringify(dec.grids) !== JSON.stringify(t.grids);
    App.modal({
      title: `Déclaration TVA — ${esc(p.label)}`, wide: true,
      body: `${dec ? `<div class="alert success">Déclaration validée le ${fdate(dec.validatedAt)} : montants figés.</div>` : ''}
        ${changed ? '<div class="alert warning">Des pièces de cette période ont été modifiées après validation. Annulez la validation pour recalculer, ou passez une régularisation dans la période suivante.</div>' : ''}
        <div class="table-wrap"><table class="statement"><tbody>${gridsTable(grids)}</tbody></table></div>
        <div class="alert ${net > 0 ? 'warning' : 'success'}" style="margin-top:14px"><strong>${net > 0 ? `Grille 71 — à payer : ${eur(net)}` : `Grille 72 — à récupérer : ${eur(-net)}`}</strong><br><span class="small">${net > 0 ? `À verser au SPF Finances avant le ${fdate(p.due)}, avec la communication structurée reprise sur votre compte courant TVA (MyMinfin).` : 'Le crédit reste sur votre compte courant TVA ; le remboursement peut être demandé dans la déclaration (case « restitution »).'}</span></div>
        ${!dec ? `<p class="small muted">Pièces prises en compte : ${t.docs.invoices.length} facture(s), ${t.docs.expenses.length} dépense(s), ${t.docs.assets.length} investissement(s), ${t.docs.bank.length} opération(s) bancaire(s).</p>` : ''}
        ${dec && dec.net > 0 ? `<label class="field" style="max-width:240px;margin-top:12px">Date de paiement <input type="date" id="pd" value="${dec.paidDate || App.today()}"></label>` : ''}`,
      footer: dec
        ? `<button class="btn danger" id="cancel">Annuler la validation</button><button class="btn" id="xml">XML Intervat</button><button class="btn" data-close>Fermer</button>${dec.net > 0 && !dec.paid ? '<button class="btn primary" id="pay">Marquer comme payée</button>' : ''}`
        : `<button class="btn" data-close>Fermer</button><button class="btn" id="xml">Télécharger le XML Intervat</button><button class="btn primary" id="val">Valider (déposée)</button>`,
      onMount: (m, close) => {
        $('#xml', m).onclick = () => {
          if (!App.bceValid(s.settings.company.enterpriseNumber)) return App.toast('Indiquez d\'abord votre numéro d\'entreprise dans Paramètres', 'error');
          App.download(`TVA_${p.year}_${p.kind === 'Month' ? 'M' : 'T'}${p.num}.xml`, App.intervatXml(p, grids));
        };
        const v = $('#val', m);
        if (v) v.onclick = () => {
          s.tvaDeclarations.push({ id: App.uid(), start: p.start, end: p.end, label: p.label, validatedAt: App.today(), grids: t.grids, net: t.net, paid: false, paidDate: '' });
          App.save(); close(); App.toast('Déclaration validée et écriture passée', 'success'); App.render();
        };
        const pay = $('#pay', m);
        if (pay) pay.onclick = () => { dec.paid = true; dec.paidDate = $('#pd', m).value; App.save(); close(); App.render(); };
        const cancel = $('#cancel', m);
        if (cancel) cancel.onclick = () => App.confirmBox('Annuler la validation ? L\'écriture de liquidation sera supprimée.', () => { s.tvaDeclarations = s.tvaDeclarations.filter((x) => x !== dec); App.save(); close(); App.render(); });
      },
    });
  }

  /* ============ JOURNAL, GRAND LIVRE, BALANCE ============ */
  V.journal = (el) => {
    const y = App.getYear(), fy = App.fiscalYear(y);
    let tab = 'journal', jf = '';
    try { tab = sessionStorage.getItem('jr-tab') || 'journal'; jf = sessionStorage.getItem('jr-j') || ''; } catch (e) { /* ignore */ }
    const all = App.buildJournal();
    const j = all.filter((e) => e.date >= fy.start && e.date <= fy.end);
    el.innerHTML = head('Journaux & grand livre', 'Écritures en partie double (PCMN) générées automatiquement à partir de vos pièces, plus vos opérations diverses.',
      `<select id="year">${App.yearOptions(y)}</select><button class="btn" id="od">+ Opération diverse</button><button class="btn" id="exp">Exporter les écritures</button>`) +
      `<div class="card"><div class="tabs"><button data-t="journal">Journaux</button><button data-t="gl">Grand livre</button><button data-t="balance">Balance</button></div><div id="tc"></div></div>`;
    const draw = () => {
      $$('.tabs button', el).forEach((b) => b.classList.toggle('active', b.dataset.t === tab));
      const tc = $('#tc', el);
      if (tab === 'journal') {
        const list = j.filter((e) => !jf || e.journal === jf);
        const tot = list.reduce((x, e) => { e.lines.forEach((l) => { x.d += l.debit; x.c += l.credit; }); return x; }, { d: 0, c: 0 });
        tc.innerHTML = `<div class="toolbar"><select id="jf"><option value="">Tous les journaux</option>${App.options(Object.entries(App.JOURNALS), jf)}</select><span class="muted small">${list.length} écriture(s)</span></div>
          ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Jnl</th><th>Pièce</th><th>Compte</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th></tr></thead><tbody>
          ${list.map((e) => e.lines.map((l, k) => `<tr ${k === 0 ? 'style="border-top:2px solid var(--border)"' : ''}><td>${k === 0 ? fdate(e.date) : ''}</td><td>${k === 0 ? e.journal : ''}</td><td>${k === 0 ? esc(e.ref) + (e.source.type === 'manual' ? ` <button class="btn ghost sm" data-del="${e.id}" title="Supprimer">✕</button>` : '') : ''}</td><td title="${esc(App.accountLabel(l.account))}">${l.account}</td><td>${esc(l.label || e.label)}</td><td class="num">${l.debit ? eur(l.debit) : ''}</td><td class="num">${l.credit ? eur(l.credit) : ''}</td></tr>`).join('')).join('')}
          <tr class="total"><td colspan="5">Totaux</td><td class="num">${eur(tot.d)}</td><td class="num">${eur(tot.c)}</td></tr></tbody></table></div>` : '<div class="empty">Aucune écriture sur cet exercice.</div>'}`;
        $('#jf', tc).onchange = (e) => { jf = e.target.value; try { sessionStorage.setItem('jr-j', jf); } catch (er) { /* ignore */ } draw(); };
        $$('[data-del]', tc).forEach((b) => (b.onclick = () => App.confirmBox('Supprimer cette écriture ?', () => { App.state.entries = App.state.entries.filter((x) => x.id !== b.dataset.del); App.save(); App.render(); })));
      } else if (tab === 'gl') {
        const bal = App.trialBalance(fy.start, fy.end, all);
        tc.innerHTML = bal.length ? bal.map((a) => {
          let run = 0;
          const lines = j.flatMap((e) => e.lines.filter((l) => l.account === a.account).map((l) => ({ e, l })));
          return `<h2 style="margin-top:18px">${a.account} — ${esc(a.label)}</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Pièce</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th><th class="num">Solde</th></tr></thead><tbody>
            ${lines.map(({ e, l }) => { run = round2(run + l.debit - l.credit); return `<tr><td>${fdate(e.date)}</td><td>${esc(e.ref)}</td><td>${esc(l.label || e.label)}</td><td class="num">${l.debit ? eur(l.debit) : ''}</td><td class="num">${l.credit ? eur(l.credit) : ''}</td><td class="num">${eur(run)}</td></tr>`; }).join('')}
            <tr class="total"><td colspan="3">Total du compte</td><td class="num">${eur(a.debit)}</td><td class="num">${eur(a.credit)}</td><td class="num">${eur(a.solde)}</td></tr></tbody></table></div>`;
        }).join('') : '<div class="empty">Aucune écriture.</div>';
      } else {
        const bal = App.trialBalance(fy.start, fy.end, all);
        const t = bal.reduce((x, a) => ({ d: x.d + a.debit, c: x.c + a.credit }), { d: 0, c: 0 });
        tc.innerHTML = `<div class="toolbar"><button class="btn sm" id="bcsv">Exporter la balance</button></div><div class="table-wrap"><table><thead><tr><th>Compte</th><th>Intitulé</th><th class="num">Débit</th><th class="num">Crédit</th><th class="num">Solde débiteur</th><th class="num">Solde créditeur</th></tr></thead><tbody>
          ${bal.map((a) => `<tr><td>${a.account}</td><td>${esc(a.label)}</td><td class="num">${eur(a.debit)}</td><td class="num">${eur(a.credit)}</td><td class="num">${a.solde > 0 ? eur(a.solde) : ''}</td><td class="num">${a.solde < 0 ? eur(-a.solde) : ''}</td></tr>`).join('')}
          <tr class="total"><td colspan="2">Totaux ${Math.abs(t.d - t.c) < 0.01 ? '<span class="badge success">équilibrée</span>' : '<span class="badge danger">déséquilibrée</span>'}</td><td class="num">${eur(t.d)}</td><td class="num">${eur(t.c)}</td><td></td><td></td></tr></tbody></table></div>`;
        $('#bcsv', tc).onclick = () => App.download(`balance_${y}.csv`, App.toCSV([['Compte', 'Intitulé', 'Débit', 'Crédit', 'Solde'], ...bal.map((a) => [a.account, a.label, a.debit, a.credit, a.solde])]));
      }
    };
    $$('.tabs button', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; try { sessionStorage.setItem('jr-tab', tab); } catch (e) { /* ignore */ } draw(); }));
    $('#year', el).onchange = (e) => { App.setYear(e.target.value); V.journal(el); };
    $('#exp', el).onclick = () => App.download(`ecritures_${y}.csv`, App.toCSV(App.exportJournalCsv(y)));
    $('#od', el).onclick = manualEntry;
    draw();
  };

  function manualEntry() {
    const lines = [{ account: '', label: '', debit: 0, credit: 0 }, { account: '', label: '', debit: 0, credit: 0 }];
    const known = Object.entries(App.ACCOUNT_LABELS).sort();
    const draw = (m) => {
      const t = lines.reduce((x, l) => ({ d: x.d + Number(l.debit || 0), c: x.c + Number(l.credit || 0) }), { d: 0, c: 0 });
      $('#ol', m).innerHTML = lines.map((l, k) => `<tr data-k="${k}"><td><input list="acc-list" data-f="account" value="${esc(l.account)}" placeholder="ex. 616000"></td><td><input data-f="label" value="${esc(l.label)}"></td><td><input type="number" step="0.01" data-f="debit" value="${l.debit || ''}"></td><td><input type="number" step="0.01" data-f="credit" value="${l.credit || ''}"></td></tr>`).join('') +
        `<tr class="total"><td colspan="2">${Math.abs(t.d - t.c) < 0.01 && t.d > 0 ? '<span class="badge success">Équilibrée</span>' : `<span class="badge danger">Écart ${eur(t.d - t.c)}</span>`}</td><td class="num">${eur(t.d)}</td><td class="num">${eur(t.c)}</td></tr>`;
      $$('[data-f]', m).forEach((i) => (i.onchange = () => { const l = lines[i.closest('tr').dataset.k]; l[i.dataset.f] = ['debit', 'credit'].includes(i.dataset.f) ? Number(i.value) || 0 : i.value.trim(); draw(m); }));
    };
    App.modal({
      title: 'Opération diverse', wide: true,
      body: `<div class="form-grid"><label class="field">Date <input type="date" id="od-date" value="${App.today()}"></label><label class="field">Journal <select id="od-j">${App.options(Object.entries(App.JOURNALS), 'OD')}</select></label><label class="field">Pièce <input id="od-ref" value="OD"></label><label class="field full">Libellé <input id="od-label" placeholder="ex. Charges à reporter, provision pécule de vacances, affectation du résultat…"></label></div>
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

  /* ============ COMPTES ANNUELS (schéma abrégé BNB) ============ */
  function incomeRows(r) {
    return [
      ['section', 'I. Ventes et prestations (70/76A)'], ['', 'A. Chiffre d\'affaires (70)', 'chiffreAffaires'], ['', 'D. Autres produits d\'exploitation (74)', 'autresProduits'], ['', 'E. Produits d\'exploitation non récurrents (76A)', 'produitsNonRecurrents'],
      ['total', 'Total ventes et prestations', 'ventesPrestations'],
      ['section', 'II. Coût des ventes et prestations (60/66A)'], ['', 'A. Approvisionnements et marchandises (60)', 'approvisionnements'], ['', 'B. Services et biens divers (61)', 'servicesBiensDivers'],
      ['', 'C. Rémunérations, charges sociales et pensions (62)', 'remunerations'], ['', 'D. Amortissements (630)', 'amortissements'], ['', 'G. Autres charges d\'exploitation (640/648)', 'autresCharges'], ['', 'I. Charges d\'exploitation non récurrentes (66A)', 'chargesNonRecurrentes'],
      ['total', 'Total coût des ventes et prestations', 'coutVentes'],
      ['sub', 'Marge brute d\'exploitation (9900)', 'margeBrute'],
      ['total', 'III. Bénéfice (perte) d\'exploitation (9901)', 'resultatExploitation'],
      ['', 'IV. Produits financiers (75)', 'produitsFinanciers'], ['', 'V. Charges financières (65)', 'chargesFinancieres'],
      ['total', 'IX. Bénéfice (perte) de l\'exercice avant impôts (9903)', 'resultatAvantImpot'],
      ['', 'X. Impôts sur le résultat (67/77)', 'impots'],
      ['total', 'XI. Bénéfice (perte) de l\'exercice (9904)', 'resultatNet'],
    ];
  }
  function incomeHTML(r, prev) {
    return `<table class="statement"><thead><tr><th>Compte de résultats</th><th class="num">${r.fy.label}</th>${prev ? `<th class="num">${prev.fy.label}</th>` : ''}</tr></thead><tbody>
      ${incomeRows(r).map(([cls, l, k]) => cls === 'section' ? `<tr class="section"><td colspan="3">${l}</td></tr>` : `<tr class="${cls}"><td>${l}</td><td class="num">${eur(r[k])}</td>${prev ? `<td class="num muted">${eur(prev[k])}</td>` : ''}</tr>`).join('')}
    </tbody></table>`;
  }
  function balanceRows(b) {
    const A = b.actif, P = b.passif;
    return {
      actif: [['section', 'Actifs immobilisés (20/28)'], ['', 'I. Frais d\'établissement (20)', A.fraisEtablissement], ['', 'II. Immobilisations incorporelles (21)', A.immoIncorp], ['', 'III. Immobilisations corporelles (22/27)', A.immoCorp], ['', 'IV. Immobilisations financières (28)', A.immoFin], ['total', 'Total actifs immobilisés', A.immobilise],
        ['section', 'Actifs circulants (29/58)'], ['', 'VI. Stocks (3)', A.stocks], ['', 'VII. Créances à un an au plus — clients (40)', A.creancesClients], ['', 'VII. Autres créances (41) dont TVA', A.autresCreances], ['', 'VIII. Placements de trésorerie (50/53)', A.placements], ['', 'IX. Valeurs disponibles (54/58)', A.disponibilites], ['', 'X. Comptes de régularisation (490/1)', A.regularisation], ['total', 'Total actifs circulants', A.circulant],
        ['total', 'TOTAL DE L\'ACTIF (20/58)', A.total]],
      passif: [['section', 'Capitaux propres (10/15)'], ['', 'Apport / capital (10/11)', P.capital], ['', 'IV. Réserves (13)', P.reserves], ['', 'V. Bénéfice (perte) reporté(e) (14)', P.resultatReporte], ['', 'Résultat de l\'exercice (à affecter)', P.resultatExercice], ['', 'VI. Subsides en capital (15)', P.subsides], ['total', 'Total capitaux propres', P.capitauxPropres],
        ['', 'VII. Provisions (16)', P.provisions],
        ['section', 'Dettes (17/49)'], ['', 'VIII. Dettes à plus d\'un an (17)', P.dettesLongTerme], ['', 'IX. Dettes financières à un an au plus (43)', P.dettesFinancieres], ['', 'IX. Fournisseurs (44)', P.fournisseurs], ['', 'IX. Dettes fiscales, salariales et sociales (45)', P.dettesFiscalesSociales], ['', 'IX. Autres dettes (47/48)', P.autresDettes], ['', 'X. Comptes de régularisation (492/3)', P.regularisation],
        ['total', 'TOTAL DU PASSIF (10/49)', P.total]],
    };
  }
  function balanceHTML(b) {
    const r = balanceRows(b);
    const tbl = (rows, title) => `<table class="statement"><thead><tr><th>${title}</th><th class="num">Montant</th></tr></thead><tbody>${rows.map(([cls, l, v]) => cls === 'section' ? `<tr class="section"><td colspan="2">${l}</td></tr>` : `<tr class="${cls}"><td>${l}</td><td class="num">${eur(v)}</td></tr>`).join('')}</tbody></table>`;
    return `<div class="grid grid-2"><div style="min-width:0">${tbl(r.actif, 'Actif')}</div><div style="min-width:0">${tbl(r.passif, 'Passif')}</div></div>
      ${b.equilibre ? '<div class="alert success" style="margin-top:14px">✓ Bilan équilibré</div>' : `<div class="alert danger" style="margin-top:14px">Écart actif / passif : ${eur(b.ecart)}. Vérifiez vos opérations diverses.</div>`}`;
  }
  function ratios(r, b) {
    const ca = r.chiffreAffaires || 1;
    const rows = [['Marge brute', r.margeBrute, r.margeBrute / ca * 100], ['EBITDA (résultat d\'exploitation + amortissements)', r.ebitda, r.ebitda / ca * 100], ['Résultat d\'exploitation', r.resultatExploitation, r.resultatExploitation / ca * 100], ['Résultat net', r.resultatNet, r.resultatNet / ca * 100], ['Cash-flow (résultat net + amortissements)', round2(r.resultatNet + r.amortissements), null]];
    const liq = b.passif.dettesCourtTerme ? (b.actif.circulant / b.passif.dettesCourtTerme) : null;
    const solv = b.passif.total ? (b.passif.capitauxPropres / b.passif.total * 100) : null;
    return `<table><thead><tr><th>Indicateur</th><th class="num">Montant</th><th class="num">% du CA</th></tr></thead><tbody>${rows.map(([l, v, p]) => `<tr><td>${l}</td><td class="num">${eur(v)}</td><td class="num">${p === null ? '' : App.pct(p)}</td></tr>`).join('')}
      <tr><td>Liquidité au sens large (actifs circulants / dettes court terme)</td><td class="num">${liq === null ? '—' : liq.toFixed(2)}</td><td></td></tr>
      <tr><td>Solvabilité (capitaux propres / total du bilan)</td><td class="num">${solv === null ? '—' : App.pct(solv)}</td><td></td></tr></tbody></table>`;
  }

  V.etats = (el) => {
    const y = App.getYear();
    let tab = 'resultat';
    try { tab = sessionStorage.getItem('et-tab') || 'resultat'; } catch (e) { /* ignore */ }
    const j = App.buildJournal();
    const r = App.incomeStatement(y, j), prev = App.incomeStatement(y - 1, j), b = App.balanceSheet(y, j);
    el.innerHTML = head('Comptes annuels', `Exercice ${r.fy.label} — bilan et compte de résultats selon le schéma abrégé de la Banque nationale (codes BNB entre parenthèses).`,
      `<select id="year">${App.yearOptions(y)}</select><button class="btn" id="csv">Exporter (CSV)</button>`) +
      `<div class="card"><div class="tabs no-print"><button data-t="resultat">Compte de résultats</button><button data-t="bilan">Bilan</button><button data-t="ratios">Indicateurs</button></div><div id="tc"></div></div>`;
    const draw = () => {
      $$('.tabs button', el).forEach((x) => x.classList.toggle('active', x.dataset.t === tab));
      $('#tc', el).innerHTML = `<div class="table-wrap">${tab === 'resultat' ? incomeHTML(r, prev) : tab === 'bilan' ? balanceHTML(b) : ratios(r, b)}</div>`;
    };
    $$('.tabs button', el).forEach((x) => (x.onclick = () => { tab = x.dataset.t; try { sessionStorage.setItem('et-tab', tab); } catch (e) { /* ignore */ } draw(); }));
    $('#year', el).onchange = (e) => { App.setYear(e.target.value); V.etats(el); };
    $('#csv', el).onclick = () => {
      const br = balanceRows(b);
      const rows = [['Rubrique', 'Montant'], ['BILAN — ACTIF', ''], ...br.actif.filter((x) => x[0] !== 'section').map((x) => [x[1], x[2]]), ['BILAN — PASSIF', ''], ...br.passif.filter((x) => x[0] !== 'section').map((x) => [x[1], x[2]]), ['COMPTE DE RÉSULTATS', ''], ...incomeRows(r).filter((x) => x[0] !== 'section').map((x) => [x[1], r[x[2]]])];
      App.download(`comptes_annuels_${y}.csv`, App.toCSV(rows));
    };
    draw();
  };

  /* ============ CLÔTURE ANNUELLE ============ */
  V.cloture = (el) => {
    const s = App.state, c = s.settings.company, y = App.getYear(), fy = App.fiscalYear(y);
    const j = App.buildJournal();
    const r = App.incomeStatement(y, j), b = App.balanceSheet(y, j), tax = App.taxEstimate(y, j);
    const closing = s.closings.find((x) => x.year === y);
    const inFy = (d) => d >= fy.start && d <= fy.end;
    const bankTodo = s.bank.filter((x) => inFy(x.date) && !x.matched).length;
    const drafts = s.invoices.filter((i) => inFy(i.date) && i.type === 'facture' && i.status === 'brouillon').length;
    const unpaid = s.invoices.filter((i) => inFy(i.date) && i.type === 'facture' && i.status === 'envoyee');
    const noReceipt = s.expenses.filter((e) => inFy(e.date) && !e.receipt).length;
    const periods = c.regimeTva === 'normal' ? App.tvaPeriods(y) : [];
    const tvaTodo = periods.filter((p) => p.end < App.today() && !s.tvaDeclarations.some((d) => d.start === p.start)).length;
    const suspense = App.trialBalance(null, fy.end, j).filter((a) => a.account.startsWith('499') && Math.abs(a.solde) > 0.01);
    const isCompany = c.impot === 'ISOC';
    const checks = [
      { ok: !bankTodo, t: 'Rapprochement bancaire', d: bankTodo ? `${bankTodo} opération(s) non rapprochée(s) — <a href="#/banque">rapprocher</a>` : 'Toutes les opérations sont rapprochées' },
      { ok: !drafts, t: 'Factures en brouillon', d: drafts ? `${drafts} facture(s) non comptabilisée(s) — <a href="#/factures">vérifier</a>` : 'Aucune' },
      { ok: !unpaid.length, t: 'Créances clients', d: unpaid.length ? `${unpaid.length} facture(s) impayée(s) (${eur(unpaid.reduce((x, i) => x + App.invoiceTotals(i).ttc, 0))}). Créance douteuse : réduction de valeur (compte 634) à envisager.` : 'Toutes les factures sont réglées' },
      { ok: !noReceipt, t: 'Justificatifs', d: noReceipt ? `${noReceipt} dépense(s) sans justificatif — à conserver 10 ans` : 'Tous les justificatifs sont joints' },
      { ok: !tvaTodo, t: 'Déclarations TVA', d: tvaTodo ? `${tvaTodo} période(s) échue(s) non déposée(s) — <a href="#/tva">déclarer</a>` : c.regimeTva !== 'normal' ? 'Pas de déclaration périodique' : 'À jour' },
      { ok: true, t: 'Amortissements', d: `Amortissements ${y} comptabilisés automatiquement : ${eur(r.amortissements)}` },
      { ok: !suspense.length, t: 'Compte d\'attente 499', d: suspense.length ? `Solde de ${eur(suspense.reduce((x, a) => x + a.solde, 0))} à reclasser via une opération diverse` : 'Soldé' },
      { ok: b.equilibre, t: 'Équilibre du bilan', d: b.equilibre ? 'Actif = passif' : 'Écart ' + eur(b.ecart) },
      { ok: !!closing, t: 'Impôt et clôture', d: closing ? `Exercice clôturé le ${fdate(closing.date)}${closing.taxAmount ? ' — impôt comptabilisé : ' + eur(closing.taxAmount) : ''}` : 'À enregistrer ci-dessous' },
    ];
    const done = checks.filter((x) => x.ok).length;
    const va = App.prepaymentDates(y + 1);
    el.innerHTML = head('Clôture annuelle', `Exercice ${fy.label} — du ${fdate(fy.start)} au ${fdate(fy.end)}`, `<select id="year">${App.yearOptions(y)}</select>`) +
      `<div class="grid grid-2">
        <div class="card"><h2>Check-list de clôture (${done}/${checks.length})</h2><ul class="checklist">${checks.map((x) => `<li><span class="st ${x.ok ? 'ok' : 'ko'}">${x.ok ? '✓' : '!'}</span><div><strong>${x.t}</strong><div class="small muted">${x.d}</div></div></li>`).join('')}</ul></div>
        <div class="card"><h2>Synthèse et impôt</h2><table><tbody>
          <tr><td>Chiffre d'affaires</td><td class="num">${eur(r.chiffreAffaires)}</td></tr>
          <tr><td>Résultat avant impôts</td><td class="num">${eur(r.resultatAvantImpot)}</td></tr>
          ${tax.social ? `<tr><td>Cotisations sociales d'indépendant estimées</td><td class="num">${eur(tax.social)}</td></tr><tr><td>Revenu imposable estimé</td><td class="num">${eur(tax.base)}</td></tr>` : ''}
          <tr><td>${esc(tax.label)}<div class="small muted">${esc(tax.detail)}</div></td><td class="num">${eur(tax.tax)}</td></tr>
          <tr class="total"><td>Résultat net ${closing ? '' : '(prévisionnel)'}</td><td class="num">${eur(isCompany && !closing ? r.resultatAvantImpot - tax.tax : r.resultatNet)}</td></tr>
          <tr><td>Total du bilan</td><td class="num">${eur(b.actif.total)}</td></tr>
          <tr><td>Capitaux propres</td><td class="num">${eur(b.passif.capitauxPropres)}</td></tr>
          <tr><td>Trésorerie</td><td class="num">${eur(b.actif.disponibilites)}</td></tr></tbody></table>
          <p class="small muted">Estimation indicative (paramètres modifiables dans Paramètres). Pour l'ISOC : taux réduit sous conditions (PME, rémunération du dirigeant suffisante…). Versements anticipés ${y + 1} pour éviter la majoration : ${va.map(([d]) => fdate(d)).join(', ')} — environ ${eur(tax.tax / 4)} chacun.</p>
          ${closing ? `<div class="alert success" style="margin-top:14px">Exercice clôturé. Le résultat est reporté automatiquement (compte 14) à l'ouverture de l'exercice suivant.</div><button class="btn danger" id="reopen">Rouvrir l'exercice</button>`
            : `<div class="form-grid" style="margin-top:14px">${isCompany ? `<label class="field">Impôt des sociétés à comptabiliser <input type="number" step="1" id="taxamt" value="${Math.round(tax.tax)}"></label>` : ''}</div>
               <div class="actions" style="margin-top:12px"><button class="btn primary" id="close">Clôturer l'exercice ${y}</button></div>`}
        </div></div>
      <div class="card"><h2>Documents de fin d'exercice</h2><div class="actions">
        <a class="btn" href="#/etats">Bilan et compte de résultats</a>
        <button class="btn" id="exp">Toutes les écritures (CSV)</button>
        <button class="btn" id="listing">Listing clients ${y} (XML)</button>
        <button class="btn" id="ai-close" ${App.ai.isReady() ? '' : 'disabled'}>✦ Revue de clôture par l'IA</button>
      </div><div id="ai-out" class="report" style="margin-top:14px"></div></div>
      <div class="card"><h2>Obligations après la clôture</h2><ul>
        ${isCompany ? `<li>Approbation des comptes par l'assemblée générale dans les 6 mois de la clôture.</li>
        <li>Dépôt des comptes annuels à la Banque nationale (Centrale des bilans) dans les 30 jours de l'approbation, au plus tard 7 mois après la clôture.</li>
        <li>Déclaration à l'impôt des sociétés via Biztax (date limite fixée chaque année par le SPF Finances).</li>` : `<li>Déclaration à l'impôt des personnes physiques (Tax-on-web / MyMinfin), avec l'annexe des revenus professionnels.</li>
        <li>Régularisation des cotisations sociales par votre caisse d'assurances sociales, sur base du revenu définitif.</li>`}
        ${c.regimeTva === 'normal' ? `<li>Listing annuel des clients assujettis avant le 31 mars.</li>` : ''}
        <li>Conservation des livres et pièces justificatives pendant 10 ans.</li></ul>
        <p class="small muted">Délais usuels : vérifiez-les chaque année sur finances.belgium.be et nbb.be.</p></div>`;
    $('#year', el).onchange = (e) => { App.setYear(e.target.value); V.cloture(el); };
    $('#exp', el).onclick = () => App.download(`ecritures_${y}.csv`, App.toCSV(App.exportJournalCsv(y)));
    $('#listing', el).onclick = () => App.download(`listing_clients_${y}.xml`, App.clientListing(y).xml);
    const cl = $('#close', el);
    if (cl) cl.onclick = () => App.confirmBox(`Clôturer l'exercice ${y} ? ${checks.some((x) => !x.ok && x.t !== 'Impôt et clôture') ? '<br><strong>Certains contrôles ne sont pas validés.</strong>' : ''}`, () => {
      s.closings.push({ year: y, date: App.today(), taxAmount: isCompany ? Number(($('#taxamt', el) || {}).value) || 0 : 0 });
      App.save(); App.toast('Exercice clôturé', 'success'); App.render();
    }, 'Clôturer');
    const ro = $('#reopen', el);
    if (ro) ro.onclick = () => App.confirmBox('Rouvrir l\'exercice ? L\'écriture d\'impôt sera supprimée.', () => { s.closings = s.closings.filter((x) => x.year !== y); App.save(); App.render(); });
    const aiBtn = $('#ai-close', el);
    if (aiBtn) aiBtn.onclick = async () => {
      aiBtn.disabled = true; const out = $('#ai-out', el); out.innerHTML = '<span class="spinner"></span> Revue en cours…';
      try {
        await App.ai.chat([{ role: 'user', content: `Fais la revue de clôture de l'exercice ${fy.label} selon le droit comptable et fiscal belge. Check-list : ${JSON.stringify(checks.map((x) => ({ point: x.t, ok: x.ok, detail: x.d.replace(/<[^>]+>/g, '') })))}. Liste les écritures d'inventaire à passer (charges à reporter 490, produits acquis 491, charges à imputer 492, produits à reporter 493, provisions, réductions de valeur), les dépenses non admises à surveiller, l'estimation de l'impôt et des versements anticipés, puis un plan d'action numéroté.` }], (t) => (out.innerHTML = App.ai.md(t)));
      } catch (e) { out.innerHTML = `<div class="alert danger">${esc(e.message)}</div>`; }
      aiBtn.disabled = false;
    };
  };
})(window.App);
