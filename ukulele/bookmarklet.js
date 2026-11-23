// Favori « → Kanikapila » : à lancer sur la page d'une chanson (La Boîte à Chansons ou autre site d'accords).
// Il repère la grille paroles + accords dans la page que tu consultes et la copie pour Kanikapila.
// Minifié par build-bookmarklet.sh ; le lien __APP__ est remplacé par l'adresse de l'appli.
(() => {
  const APP = "__APP__";
  const R = /^\(?(Do|Ré|Re|Mi|Fa|Sol|La|Si|[A-G])[#b♯♭]?(maj|min|mi|ma|m|M|dim|aug|sus|add|°|ø|\+|-)?\d{0,2}((sus|add|maj|b|#|\+|-|\()?\d{1,2}\)?)*(\/(Do|Ré|Re|Mi|Fa|Sol|La|Si|[A-G])[#b♯♭]?)?\)?\*?$/;
  const isC = (t) => R.test(t.trim());
  const filler = (x) => /^(\||\|\||-|\/|%|x\d+|\(x\d+\)|\d+x)$/i.test(x);
  const chordLine = (l) => { const w = l.trim().split(/\s+/).filter((x) => x && !filler(x)); return w.length > 0 && w.every(isC); };
  const score = (t) => t.split("\n").filter(chordLine).length + (t.match(/\[[^\]]{1,10}\]/g) || []).filter((x) => isC(x.slice(1, -1))).length;
  const hidden = (n) => { const s = getComputedStyle(n); return s.display === "none" || s.visibility === "hidden"; };
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|BUTTON|SELECT|OPTION|SVG|IFRAME|NAV|HEADER|FOOTER|INPUT|TEXTAREA)$/i;

  let text = "", container = null;
  const sel = String(getSelection() || "");
  if (sel.trim().length > 30) text = sel;
  else {
    // 1. Chords marked up as their own small elements (most chord sites).
    const chordEls = [...document.body.querySelectorAll("span,b,strong,em,i,a,sup,div,code,u,abbr,ins,var")].filter((e) =>
      e.children.length === 0 && e.textContent.trim().length <= 10 && isC(e.textContent) && !e.closest("nav,header,footer,select,button") && !hidden(e));
    if (chordEls.length >= 3) {
      const count = new Map();
      for (const e of chordEls) for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) count.set(a, (count.get(a) || 0) + 1);
      let best = document.body, depth = -1;
      for (const [a, n] of count) if (n >= chordEls.length * 0.6) { let d = 0; for (let x = a; x; x = x.parentElement) d++; if (d > depth) { depth = d; best = a; } }
      container = best;
      if (getComputedStyle(container).whiteSpace.startsWith("pre") && score(container.innerText) >= 3) text = container.innerText;
      else {
        const set = new Set(chordEls), out = [];
        const walk = (n) => {
          if (n.nodeType === 3) { out.push(n.nodeValue.replace(/[ \t\r\n]+/g, " ")); return; }
          if (n.nodeType !== 1 || SKIP.test(n.tagName) || hidden(n)) return;
          if (set.has(n)) { out.push("[" + n.textContent.trim() + "]"); return; }
          if (n.tagName === "BR") { out.push("\n"); return; }
          const blk = /^(block|flex|grid|list-item|table)/.test(getComputedStyle(n).display);
          if (blk) out.push("\n");
          if (getComputedStyle(n).whiteSpace.startsWith("pre") && score(n.innerText) >= 2) out.push(n.innerText);
          else for (const c of n.childNodes) walk(c);
          if (blk) out.push("\n");
        };
        walk(container);
        text = out.join("");
      }
    }
    // 2. Plain text blocks (<pre>, pre-wrap) with chords above the lyrics.
    if (score(text) < 3) {
      for (const e of document.body.querySelectorAll("pre,div,p,section,article,td")) {
        if (!getComputedStyle(e).whiteSpace.startsWith("pre") && e.tagName !== "PRE") continue;
        const t = e.innerText || "";
        if (score(t) > score(text)) { text = t; container = e; }
      }
    }
    // 3. Last resort: the deepest block holding the most chord lines.
    if (score(text) < 3) {
      let bs = score(text);
      for (const e of document.body.querySelectorAll("main,article,section,div,td")) {
        if (e.closest("nav,header,footer")) continue;
        const t = e.innerText || "", sc = score(t);
        if (sc >= 3 && sc >= bs) { bs = sc; text = t; container = e; }
      }
    }
  }
  text = text.replace(/ /g, " ").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();

  const q = (s) => document.querySelector(s);
  const title = ((q("h1") || {}).textContent || (q('meta[property="og:title"]') || {}).content || document.title || "").trim().replace(/\s+/g, " ");
  const artEl = q('[itemprop="byArtist"],[class*="artiste"],[class*="artist"],[class*="interprete"]');
  const artist = artEl ? artEl.textContent.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  const around = (container && container.parentElement ? container.parentElement.innerText : document.body.innerText) || "";
  const capo = (/capo(?:dastre)?[^\n\d]{0,25}(\d{1,2})/i.exec(around) || [])[1] || "";
  const n = score(text);
  const payload = "{title: " + title + "}\n" + (artist ? "{artist: " + artist + "}\n" : "") + (capo ? "{capo: " + capo + "}\n" : "") + "{source: " + location.href + "}\n\n" + text;

  // Small overlay: preview + copy button (a real tap, so copying works on phones).
  const old = document.getElementById("kk-ov"); if (old) old.remove();
  const ov = document.createElement("div"); ov.id = "kk-ov";
  ov.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(5,12,10,.55);display:flex;align-items:flex-end;justify-content:center;font:16px system-ui,sans-serif";
  const box = document.createElement("div");
  box.style.cssText = "background:#fff;color:#13201C;width:100%;max-width:520px;border-radius:18px 18px 0 0;padding:18px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;max-height:90vh";
  const h = document.createElement("b"); h.style.fontSize = "18px";
  h.textContent = n >= 2 ? "Kanikapila : " + n + " lignes d'accords trouvées" : "Kanikapila : grille introuvable";
  const p = document.createElement("div"); p.style.cssText = "font-size:14px;color:#5A6B64;line-height:1.4";
  p.textContent = n >= 2 ? (title + (capo ? " · capo " + capo + " (transposé pour le ukulélé)" : "")) : "Sélectionne le texte de la chanson (paroles + accords) avec le doigt, puis touche à nouveau le favori.";
  const ta = document.createElement("textarea"); ta.value = payload; ta.readOnly = true;
  ta.style.cssText = "width:100%;height:160px;font:12px ui-monospace,monospace;border:1px solid #D3DDD8;border-radius:10px;padding:8px;box-sizing:border-box;white-space:pre";
  const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
  const btn = (label, primary) => { const b = document.createElement(primary ? "button" : "a"); b.textContent = label;
    b.style.cssText = "flex:1;min-width:120px;text-align:center;text-decoration:none;border-radius:12px;padding:12px;font-weight:700;font-size:16px;border:1px solid #0D7A6E;" + (primary ? "background:#0D7A6E;color:#fff" : "background:#fff;color:#0D7A6E"); return b; };
  const copy = btn("Copier pour Kanikapila", true);
  const open = btn("Ouvrir Kanikapila", false); open.href = APP; open.target = "_blank"; open.rel = "noopener";
  const close = document.createElement("button"); close.textContent = "Fermer";
  close.style.cssText = "border:0;background:none;color:#5A6B64;font-size:15px;padding:6px";
  copy.onclick = () => {
    const done = () => { copy.textContent = "Copié ✓"; p.textContent = "Ouvre Kanikapila, touche la zone « Coller ici » puis Coller."; };
    const fallback = () => { ta.readOnly = false; ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length); try { document.execCommand("copy"); done(); } catch (e) { p.textContent = "Copie impossible : sélectionne le texte ci-dessus et copie-le."; } ta.readOnly = true; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(payload).then(done, fallback); else fallback();
  };
  close.onclick = () => ov.remove();
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  if (n >= 2) row.append(copy, open); else row.append(open);
  box.append(h, p, ta, row, close); ov.append(box); document.body.append(ov);
})();
