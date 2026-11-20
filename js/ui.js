/* ComptaPro — composants d'interface */
(function (App) {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 6000 : 3200);
  }

  function modal({ title, body, footer, wide, onMount }) {
    const root = $('#modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${title}</h2><button class="btn ghost sm" data-close aria-label="Fermer">✕</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
    const close = () => { wrap.remove(); document.body.classList.remove('printing-modal'); };
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    $$('[data-close]', wrap).forEach((b) => b.addEventListener('click', close));
    root.appendChild(wrap);
    if (onMount) onMount(wrap, close);
    const first = $('input, select, textarea', wrap); if (first) first.focus();
    return { el: wrap, close };
  }

  function confirmBox(message, onYes, label) {
    modal({
      title: 'Confirmation', body: `<p>${message}</p>`,
      footer: `<button class="btn" data-close>Annuler</button><button class="btn primary" id="cf-yes">${label || 'Confirmer'}</button>`,
      onMount: (el, close) => $('#cf-yes', el).addEventListener('click', () => { close(); onYes(); }),
    });
  }

  function formData(form) {
    const o = {};
    $$('input, select, textarea', form).forEach((el) => {
      if (!el.name) return;
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'number') o[el.name] = el.value === '' ? 0 : Number(el.value);
      else if (el.type !== 'file') o[el.name] = el.value;
    });
    return o;
  }

  async function download(filename, content, mime) {
    if (App.isArtifact) {
      const dl = await window.claude.use('downloads').catch(() => null);
      if (!dl) return toast('Le téléchargement n\'est pas disponible ici.', 'error');
      try { await dl.save({ filename, data: content }); toast('Fichier enregistré', 'success'); }
      catch (e) { if (e && e.code !== 'declined') toast('Téléchargement impossible (' + (e.code || e.message) + ')', 'error'); }
      return;
    }
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function toCSV(rows) {
    return '﻿' + rows.map((r) => r.map((c) => {
      const v = typeof c === 'number' ? String(c).replace('.', ',') : String(c ?? '');
      return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(';')).join('\r\n');
  }

  /* Analyse CSV tolérante (séparateur ; , ou tabulation) */
  function parseCSV(text) {
    const first = text.split(/\r?\n/)[0] || '';
    const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }
  const parseAmount = (s) => {
    let v = String(s || '').replace(/[\s€ ]/g, '');
    if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
    else v = v.replace(/,/g, '');
    return Number(v) || 0;
  };
  const parseDate = (s) => {
    s = String(s || '').trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : '';
  };

  /* Graphique en barres SVG (produits / charges) */
  function barChart(data) {
    const W = 720, H = 220, P = { l: 52, r: 8, t: 10, b: 26 };
    const max = Math.max(1, ...data.flatMap((d) => [d.produits, d.charges]));
    const step = (W - P.l - P.r) / data.length, bw = Math.min(16, step / 3);
    const y = (v) => P.t + (H - P.t - P.b) * (1 - Math.max(0, v) / max);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);
    const k = (v) => (v >= 1000 ? Math.round(v / 100) / 10 + ' k' : Math.round(v));
    let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Produits et charges par mois">`;
    ticks.forEach((t) => { svg += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--border)"/><text x="${P.l - 6}" y="${y(t) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${k(t)}</text>`; });
    data.forEach((d, i) => {
      const x = P.l + i * step + step / 2;
      svg += `<rect x="${x - bw - 1}" y="${y(d.produits)}" width="${bw}" height="${H - P.b - y(d.produits)}" rx="2" fill="var(--primary)"><title>${d.label} — produits ${App.eur(d.produits)}</title></rect>`;
      svg += `<rect x="${x + 1}" y="${y(d.charges)}" width="${bw}" height="${H - P.b - y(d.charges)}" rx="2" fill="var(--warning)"><title>${d.label} — charges ${App.eur(d.charges)}</title></rect>`;
      svg += `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${d.label}</text>`;
    });
    return svg + '</svg>';
  }

  const statusBadge = (st) => ({
    brouillon: '<span class="badge">Brouillon</span>', envoyee: '<span class="badge primary">Envoyée</span>',
    payee: '<span class="badge success">Payée</span>', retard: '<span class="badge danger">En retard</span>',
    accepte: '<span class="badge success">Accepté</span>', refuse: '<span class="badge danger">Refusé</span>', annulee: '<span class="badge">Annulée</span>',
  }[st] || `<span class="badge">${App.esc(st)}</span>`);

  const options = (list, selected) => list.map((o) => {
    const [v, l] = Array.isArray(o) ? o : [o.value ?? o.account ?? o, o.label ?? o];
    return `<option value="${App.esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${App.esc(l)}</option>`;
  }).join('');
  const tvaOptions = (sel) => options(App.TVA_RATES.map((r) => [r, r + ' %']), sel);
  const yearOptions = (sel) => {
    const now = new Date().getFullYear();
    const years = new Set([now + 1, now, now - 1, now - 2, now - 3]);
    App.state.invoices.concat(App.state.expenses).forEach((x) => x.date && years.add(Number(x.date.slice(0, 4))));
    return options([...years].sort((a, b) => b - a).map((y) => [y, 'Exercice ' + App.fiscalYear(y).label]), sel);
  };

  /* Compresse une image pour le stockage local */
  function compressImage(file, maxW) {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) return resolve('');
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, (maxW || 1000) / img.width);
        const c = document.createElement('canvas');
        c.width = img.width * scale; c.height = img.height * scale;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => resolve('');
      img.src = URL.createObjectURL(file);
    });
  }

  App.isArtifact = !!(window.claude && window.claude.use);
  Object.assign(App, { $, $$, toast, modal, confirmBox, formData, download, toCSV, parseCSV, parseAmount, parseDate, barChart, statusBadge, options, tvaOptions, yearOptions, compressImage });
})(window.App);
