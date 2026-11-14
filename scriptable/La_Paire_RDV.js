// La Paire — widget « Prochains rendez-vous » pour Scriptable (iPhone / iPad)
// Version 2.0
//
// Lit le calendrier « La Paire » de l'appareil et affiche les prochains RDV.
// Titre conseillé des RDV : « Nom du client · Prestation »
//   (séparateurs acceptés : ·  •  –  —  -  |  entourés d'espaces)
//
// Paramètre du widget (facultatif — appui long › Modifier le widget › Parameter) :
//   « Autre agenda »                 → utilise ce calendrier
//   « cal=La Paire,Perso; jours=7 »  → plusieurs calendriers, horizon de 7 jours
//
// Lancé depuis l'app Scriptable, le script propose un aperçu de chaque taille.

// ============================ Réglages ============================
const SETTINGS = {
  calendars: ["La Paire"],                               // noms (casse ignorée)
  calendarIds: ["36C533B8-9E98-4B02-99B4-07FF4B1D15FE"], // facultatif, prioritaire
  daysAhead: 14,   // horizon de recherche, en jours
  gapMinutes: 20,  // signaler un créneau libre à partir de … minutes
  locale: "fr-BE",
};

// [mode clair, mode sombre] — le widget suit l'apparence de l'iPhone
const PALETTE = {
  bg:    ["#F6F2EA", "#14171C"],
  card:  ["#FFFFFF", "#1E232A"],
  gold:  ["#9C7A2E", "#C9A24D"],
  ink:   ["#1A1D22", "#F4F1EA"],
  muted: ["#6E737B", "#9AA0A8"],
  line:  ["#E3DDD0", "#323841"],
};

// ============================ Constantes ============================
const C = {};
for (const [k, [l, d]] of Object.entries(PALETTE)) C[k] = Color.dynamic(new Color(l), new Color(d));
C.goldSoft = Color.dynamic(new Color(PALETTE.gold[0], 0.14), new Color(PALETTE.gold[1], 0.2));

const PARAM = parseParam(args.widgetParameter);
const DAYS = clampInt(PARAM.jours ?? PARAM.days, 1, 60, SETTINGS.daysAhead);
const MIN = 60000, DAY = 86400000;
// iPhone SE / mini : widgets plus petits → mise en page resserrée
const SMALL_SCREEN = Device.screenSize().height < 700;

// Mise en page par taille. Les hauteurs servent à remplir sans jamais déborder.
const LAYOUT = {
  small:      { pad: [12, 12, 11, 12], headGap: 7 },
  medium:     SMALL_SCREEN
    ? { pad: [10, 12, 10, 12], headGap: 6, heroWidth: 142, rows: 3 }
    : { pad: [12, 14, 12, 14], headGap: 8, heroWidth: 152, rows: 3 },
  large:      { pad: [14, 14, 12, 14], headGap: 10, budget: SMALL_SCREEN ? 136 : 168 },
  extraLarge: { pad: [16, 18, 14, 18], headGap: 12, budget: 172 },
};
const HERO = {
  small:  { time: 22, name: 13, svc: false, end: false, bar: 0, pad: 8, compact: true },
  medium: { time: 22, name: 14, svc: true, end: true, bar: SMALL_SCREEN ? 116 : 126, pad: SMALL_SCREEN ? 7 : 9 },
  large:  { time: 28, name: 16, svc: true, end: true, bar: SMALL_SCREEN ? 240 : 262, pad: SMALL_SCREEN ? 9 : 11 },
};
const ROW_H = { day: 22, gap: 17, row: 35 };

// ============================ Programme ============================
await main();

async function main() {
  let family = config.widgetFamily;
  if (!config.runsInWidget) {
    family = config.runsInApp ? await pickFamily() : "large";
    if (!family) return Script.complete();
  }
  family = family || "large";

  const data = await loadAgenda();
  const widget = build(family, data);

  if (config.runsInWidget) Script.setWidget(widget);
  else await present(widget, family);
  Script.complete();
}

// ============================ Données ============================
async function loadAgenda() {
  let all;
  try {
    all = await Calendar.forEvents();
  } catch (e) {
    return { error: "access" };
  }
  const names = (PARAM.cal ? PARAM.cal.split(",") : SETTINGS.calendars)
    .map(s => s.trim()).filter(Boolean);
  const wanted = names.map(s => s.toLowerCase());
  const cals = all.filter(c =>
    (!PARAM.cal && SETTINGS.calendarIds.includes(c.identifier)) ||
    wanted.includes(c.title.trim().toLowerCase()));
  if (!cals.length) return { error: "missing", names };

  const now = new Date();
  const until = startOfDay(now); until.setDate(until.getDate() + DAYS + 1);
  const raw = await CalendarEvent.between(startOfDay(now), until, cals);

  const seen = new Set();
  const events = raw
    .filter(e => !e.isAllDay && e.endDate > now)
    .filter(e => { // un RDV présent dans deux calendriers n'apparaît qu'une fois
      const k = `${e.identifier}|${e.startDate.getTime()}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    })
    .sort((a, b) => a.startDate - b.startDate || a.endDate - b.endDate)
    .map(e => ({ ...parseTitle(e.title), start: e.startDate, end: e.endDate, live: e.startDate <= now }));
  return { events };
}

function parseTitle(title) {
  const parts = String(title || "").split(/\s+[·•–—|-]\s+/).map(s => s.trim()).filter(Boolean);
  return { name: parts[0] || "Rendez-vous", svc: parts.slice(1).join(" · ") };
}

// Prochain moment où l'affichage change (début/fin d'un RDV, minuit…)
function refreshDate(events) {
  const now = Date.now();
  const first = events[0];
  const soon = first && (first.live || first.start - now < 60 * MIN);
  let t = now + (soon ? 5 : 15) * MIN;
  t = Math.min(t, startOfDay(new Date(now + DAY)).getTime() + 30000);
  for (const e of events.slice(0, 4)) {
    for (const d of [e.start.getTime() - 60 * MIN, e.start.getTime(), e.end.getTime()]) {
      if (d > now) t = Math.min(t, d + 15000);
    }
  }
  return new Date(Math.max(t, now + MIN));
}

// ============================ Construction ============================
function build(fam, data) {
  const w = new ListWidget();
  const events = data.events || [];
  w.refreshAfterDate = refreshDate(events);
  w.url = calUrl(events[0] && events[0].start);

  if (fam.startsWith("accessory")) {
    buildAccessory(w, fam, data);
    return w;
  }

  const key = LAYOUT[fam] ? fam : "large";
  const L = LAYOUT[key];
  w.backgroundColor = C.bg;
  w.setPadding(...L.pad);

  header(w, key, data);
  w.addSpacer(L.headGap);

  if (data.error) { errorCard(w, data); w.addSpacer(); }
  else if (!events.length) { emptyCard(w); w.addSpacer(); }
  else if (key === "small") buildSmall(w, events);
  else if (key === "medium") buildMedium(w, events, L);
  else buildLarge(w, events, L);
  return w;
}

function header(w, fam, data) {
  const h = hstack(w, 5);
  symbol(h, "calendar", 10, C.gold);
  text(h, "LA PAIRE", Font.heavySystemFont(11), C.gold, { lines: 1 });
  h.addSpacer();
  if (!data.events) return;
  const today = data.events.filter(e => dayOffset(e.start) === 0);
  let label;
  if (fam === "small") label = today.length ? `${today.length} auj.` : "";
  else if (!today.length) label = "Plus de RDV aujourd'hui";
  else {
    const end = new Date(Math.max(...today.map(e => e.end.getTime())));
    label = `${today.length} restant${today.length > 1 ? "s" : ""} · fin ${hm(end)}`;
  }
  if (label) text(h, label, Font.mediumSystemFont(10.5), C.muted, { lines: 1 });
}

function buildSmall(w, events) {
  hero(w, events[0], HERO.small);
  w.addSpacer();
  const n = events[1];
  if (!n) return;
  const f = hstack(w, 4);
  text(f, "Puis", Font.mediumSystemFont(10), C.muted);
  const when = (sameDay(n.start, events[0].start) ? "" : dayLabel(n.start, "short") + " ") + hm(n.start);
  text(f, `${when} · ${n.name}`, Font.semiboldSystemFont(10), C.ink, { lines: 1 });
  f.addSpacer();
}

function buildMedium(w, events, L) {
  const row = w.addStack(); row.layoutHorizontally(); row.topAlignContent();
  hero(row, events[0], { ...HERO.medium, width: L.heroWidth });
  row.addSpacer(10);

  const col = vstack(row, 6);
  const rest = events.slice(1, 1 + L.rows);
  rest.forEach(e => eventRow(col, e, {
    h: 26, timeW: 42, timeSize: 12, nameSize: 12,
    sub: x => dayOffset(x.start) === 0 ? fmtDur(minutes(x)) : dayLabel(x.start, "short"),
  }));
  if (!rest.length) {
    const t = hstack(col, 5);
    symbol(t, "checkmark.circle", 11, C.muted);
    text(t, "Rien d'autre de prévu", Font.mediumSystemFont(11), C.muted, { lines: 2 });
    t.addSpacer();
  }
  w.addSpacer();
}

function buildLarge(w, events, L) {
  const first = events[0];
  hero(w, first, HERO.large);
  w.addSpacer(10);

  let used = 0, shown = 1;
  let prevDay = startOfDay(first.start).getTime(), prevEnd = first.end;
  const rowOpts = { h: 29, timeW: 44, timeSize: 13, nameSize: 13, sub: x => fmtDur(minutes(x)) };

  for (let i = 1; i < events.length; i++) {
    const e = events[i];
    const day = startOfDay(e.start).getTime();
    const newDay = day !== prevDay;
    const gap = newDay ? 0 : (e.start - prevEnd) / MIN;
    const cost = ROW_H.row + (newDay ? ROW_H.day : 0) + (gap >= SETTINGS.gapMinutes ? ROW_H.gap : 0);
    if (used + cost > L.budget) break;

    if (newDay) dayHeader(w, e.start, events.filter(x => sameDay(x.start, e.start)).length);
    else if (gap >= SETTINGS.gapMinutes) gapRow(w, gap);
    eventRow(w, e, rowOpts);
    w.addSpacer(6);

    used += cost; shown++;
    prevEnd = newDay ? e.end : new Date(Math.max(prevEnd, e.end));
    prevDay = day;
  }

  w.addSpacer();
  const f = hstack(w, 4);
  symbol(f, "arrow.clockwise", 8, C.muted);
  text(f, `Mis à jour ${hm(new Date())}`, Font.mediumSystemFont(9), C.muted);
  f.addSpacer();
  const hidden = events.length - shown;
  if (hidden > 0) text(f, `+${hidden} autre${hidden > 1 ? "s" : ""} RDV`, Font.mediumSystemFont(9), C.muted);
}

// ---------- Composants ----------
function hero(parent, e, o) {
  const now = new Date();
  const card = vstack(parent);
  card.backgroundColor = C.card;
  card.cornerRadius = 14;
  card.setPadding(o.pad, 11, o.pad, 11);
  if (o.width) card.size = new Size(o.width, 0);
  card.url = calUrl(e.start);

  const top = hstack(card, 6);
  const off = dayOffset(e.start);
  badge(top, e.live ? "EN COURS" : off === 0 ? "PROCHAIN" : dayLabel(e.start, "short").toUpperCase(), e.live);
  top.addSpacer();
  if (!o.compact) status(top, e, now);
  card.addSpacer(o.compact ? 4 : 6);

  const time = hstack(card, 5); time.bottomAlignContent();
  text(time, hm(e.start), Font.boldRoundedSystemFont(o.time), C.ink, { lines: 1 });
  if (o.end) text(time, `– ${hm(e.end)}`, Font.mediumRoundedSystemFont(Math.round(o.time * 0.48)), C.muted, { lines: 1 });
  time.addSpacer();

  text(card, e.name, Font.semiboldSystemFont(o.name), C.ink, { lines: 1, scale: 0.8 });
  if (o.svc && e.svc) text(card, e.svc, Font.systemFont(o.name - 2), C.muted, { lines: 1 });

  if (o.compact) {
    card.addSpacer(3);
    const s = hstack(card, 4);
    status(s, e, now);
    s.addSpacer();
  } else if (e.live && o.bar) {
    card.addSpacer(7);
    progress(card, (now - e.start) / (e.end - e.start), o.bar);
  }
}

// « dans 24:59 » (compte à rebours natif), « reste 12:03 », « dans 2 h 10 », « 45 min »
function status(parent, e, now) {
  const font = Font.mediumSystemFont(11);
  if (e.live) {
    if (e.end - now < 60 * MIN) countdown(parent, e.end, "reste");
    else text(parent, `fin ${hm(e.end)}`, font, C.gold, { lines: 1 });
  } else if (dayOffset(e.start) === 0) {
    if (e.start - now < 60 * MIN) countdown(parent, e.start, "dans");
    else text(parent, `dans ${fmtDur((e.start - now) / MIN)}`, font, C.muted, { lines: 1 });
  } else {
    text(parent, fmtDur(minutes(e)), font, C.muted, { lines: 1 });
  }
}

function countdown(parent, target, prefix) {
  const s = hstack(parent, 3);
  text(s, prefix, Font.mediumSystemFont(11), C.muted, { lines: 1 });
  const box = s.addStack(); box.size = new Size(34, 14); // un minuteur prend toute la largeur sinon
  const d = box.addDate(target);
  d.applyTimerStyle();
  d.font = Font.semiboldMonospacedSystemFont(11);
  d.textColor = C.gold;
  d.lineLimit = 1;
  d.leftAlignText();
}

function badge(parent, label, filled) {
  const b = parent.addStack();
  b.setPadding(2, 6, 2, 6);
  b.cornerRadius = 6;
  b.backgroundColor = filled ? C.gold : C.goldSoft;
  text(b, label, Font.heavySystemFont(9), filled ? C.bg : C.gold, { lines: 1 });
}

function progress(parent, ratio, width) {
  const r = Math.min(1, Math.max(0, ratio));
  const track = parent.addStack();
  track.size = new Size(width, 4);
  track.cornerRadius = 2;
  track.backgroundColor = C.line;
  const fill = track.addStack();
  fill.size = new Size(Math.max(4, Math.round(width * r)), 4);
  fill.cornerRadius = 2;
  fill.backgroundColor = C.gold;
  track.addSpacer();
}

function eventRow(parent, e, o) {
  const r = hstack(parent, 8);
  const bar = r.addStack();
  bar.size = new Size(3, o.h);
  bar.cornerRadius = 1.5;
  bar.backgroundColor = e.live ? C.gold : C.line;

  const tc = vstack(r); tc.size = new Size(o.timeW, 0);
  text(tc, hm(e.start), Font.boldMonospacedSystemFont(o.timeSize), C.ink, { lines: 1 });
  text(tc, o.sub(e), Font.mediumSystemFont(9.5), C.muted, { lines: 1 });

  const nc = vstack(r);
  text(nc, e.name, Font.semiboldSystemFont(o.nameSize), C.ink, { lines: 1 });
  if (e.svc) text(nc, e.svc, Font.systemFont(o.nameSize - 2), C.muted, { lines: 1 });
  r.addSpacer();
}

function dayHeader(parent, date, count) {
  parent.addSpacer(4);
  const h = hstack(parent, 6);
  text(h, dayLabel(date).toUpperCase(), Font.boldSystemFont(10), C.gold, { lines: 1 });
  text(h, `${count} RDV`, Font.mediumSystemFont(10), C.muted, { lines: 1 });
  h.addSpacer();
  parent.addSpacer(6);
}

function gapRow(parent, mins) {
  const g = hstack(parent, 5);
  g.setPadding(0, 12, 0, 0);
  symbol(g, "cup.and.saucer", 8, C.muted);
  text(g, `Libre · ${fmtDur(mins)}`, Font.italicSystemFont(10), C.muted, { lines: 1 });
  g.addSpacer();
  parent.addSpacer(6);
}

function infoCard(w, icon, title, body) {
  const c = vstack(w, 4);
  c.backgroundColor = C.card;
  c.cornerRadius = 14;
  c.setPadding(10, 11, 10, 11);
  const t = hstack(c, 6);
  symbol(t, icon, 13, C.gold);
  text(t, title, Font.semiboldSystemFont(13), C.ink, { lines: 2, scale: 0.8 });
  t.addSpacer();
  text(c, body, Font.systemFont(11), C.muted, { lines: 4 });
}

function emptyCard(w) {
  infoCard(w, "sun.max.fill", "Rien de prévu", `Aucun rendez-vous dans les ${DAYS} prochains jours.`);
}

function errorCard(w, data) {
  if (data.error === "access") {
    infoCard(w, "lock.fill", "Accès refusé", "Autorise Scriptable dans Réglages › Confidentialité › Calendriers.");
  } else {
    const list = (data.names || []).map(n => `« ${n} »`).join(", ");
    infoCard(w, "exclamationmark.triangle.fill", "Calendrier introuvable", `${list || "Le calendrier"} n'existe pas sur cet appareil.`);
  }
}

// ---------- Écran verrouillé ----------
function buildAccessory(w, fam, data) {
  const e = data.events && data.events[0];
  const now = new Date();

  if (fam === "accessoryInline") {
    let s;
    if (data.error) s = "La Paire : calendrier ?";
    else if (!e) s = "Aucun RDV prévu";
    else if (e.live) s = `En cours · ${e.name} → ${hm(e.end)}`;
    else s = `${dayOffset(e.start) === 0 ? "" : dayLabel(e.start, "short") + " "}${hm(e.start)} · ${e.name}`;
    text(w, s, Font.mediumSystemFont(14), Color.white(), { lines: 1 });
    return;
  }

  if (fam === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    w.setPadding(0, 0, 0, 0);
    let ratio = 0, top = "—", bottom = data.error ? "?" : "RDV";
    if (e) {
      if (e.live) { ratio = (now - e.start) / (e.end - e.start); top = hm(e.end); bottom = "fin"; }
      else {
        const left = (e.start - now) / MIN;
        if (left < 60) ratio = 1 - left / 60; // l'anneau se remplit à l'approche
        top = hm(e.start);
        bottom = dayOffset(e.start) === 0 ? e.name.split(" ")[0] : dayLabel(e.start, "short");
      }
    }
    const img = w.addImage(ringImage(ratio, top, bottom));
    img.centerAlignImage();
    return;
  }

  // accessoryRectangular
  if (data.error || !e) {
    text(w, "LA PAIRE", Font.heavySystemFont(11), Color.white(), { opacity: 0.7 });
    text(w, data.error ? "Calendrier introuvable" : "Aucun RDV prévu", Font.semiboldSystemFont(14), Color.white(), { lines: 2 });
    return;
  }
  const head = e.live ? `En cours → ${hm(e.end)}`
    : `${dayOffset(e.start) === 0 ? "" : dayLabel(e.start, "short") + " · "}${hm(e.start)} – ${hm(e.end)}`;
  text(w, head, Font.boldSystemFont(12), Color.white(), { lines: 1, opacity: 0.75 });
  text(w, e.name, Font.semiboldSystemFont(15), Color.white(), { lines: 1, scale: 0.8 });
  const sub = e.svc || (e.live ? "" : dayOffset(e.start) === 0 ? `dans ${fmtDur((e.start - now) / MIN)}` : fmtDur(minutes(e)));
  if (sub) text(w, sub, Font.systemFont(12), Color.white(), { lines: 1, opacity: 0.75 });
}

function ringImage(ratio, top, bottom) {
  const S = 100, cx = 50, cy = 50, r = 44;
  const ctx = new DrawContext();
  ctx.size = new Size(S, S);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const arc = (to) => {
    const p = new Path();
    const n = Math.max(2, Math.ceil(72 * to));
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + 2 * Math.PI * to * (i / n);
      const pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a));
      if (i) p.addLine(pt); else p.move(pt);
    }
    return p;
  };
  ctx.setLineWidth(7);
  ctx.setStrokeColor(new Color("#FFFFFF", 0.25));
  ctx.addPath(arc(1)); ctx.strokePath();
  const rr = Math.min(1, Math.max(0, ratio));
  if (rr > 0.01) {
    ctx.setStrokeColor(Color.white());
    ctx.addPath(arc(rr)); ctx.strokePath();
  }
  ctx.setTextAlignedCenter();
  ctx.setTextColor(Color.white());
  ctx.setFont(Font.boldRoundedSystemFont(22));
  ctx.drawTextInRect(top, new Rect(0, 26, S, 28));
  ctx.setFont(Font.semiboldSystemFont(13));
  ctx.drawTextInRect(bottom.slice(0, 9), new Rect(10, 56, S - 20, 18));
  return ctx.getImage();
}

// ---------- Aperçu dans l'app ----------
async function pickFamily() {
  const opts = [
    ["Grand", "large"], ["Moyen", "medium"], ["Petit", "small"],
    ["Verrouillé · rectangulaire", "accessoryRectangular"],
    ["Verrouillé · circulaire", "accessoryCircular"],
    ["Verrouillé · en ligne", "accessoryInline"],
  ];
  const a = new Alert();
  a.title = "La Paire";
  a.message = "Quel aperçu afficher ?";
  opts.forEach(([label]) => a.addAction(label));
  a.addCancelAction("Annuler");
  const i = await a.presentSheet();
  return i < 0 ? null : opts[i][1];
}

async function present(w, fam) {
  const m = {
    small: "presentSmall", medium: "presentMedium", large: "presentLarge", extraLarge: "presentExtraLarge",
    accessoryRectangular: "presentAccessoryRectangular", accessoryCircular: "presentAccessoryCircular",
    accessoryInline: "presentAccessoryInline",
  }[fam];
  await (typeof w[m] === "function" ? w[m]() : w.presentLarge());
}

// ============================ Utilitaires ============================
function text(parent, s, font, color, o = {}) {
  const t = parent.addText(String(s));
  t.font = font;
  t.textColor = color;
  if (o.lines) t.lineLimit = o.lines;
  if (o.scale) t.minimumScaleFactor = o.scale;
  if (o.opacity) t.textOpacity = o.opacity;
  return t;
}
function hstack(parent, spacing) {
  const s = parent.addStack();
  s.layoutHorizontally();
  s.centerAlignContent();
  if (spacing) s.spacing = spacing;
  return s;
}
function vstack(parent, spacing) {
  const s = parent.addStack();
  s.layoutVertically();
  if (spacing) s.spacing = spacing;
  return s;
}
function symbol(parent, name, size, color) {
  const sym = SFSymbol.named(name);
  if (!sym) return;
  sym.applyFont(Font.semiboldSystemFont(size));
  const img = parent.addImage(sym.image);
  img.imageSize = new Size(size + 2, size + 2);
  img.tintColor = color;
}

function parseParam(raw) {
  const out = {};
  for (const part of String(raw || "").split(";")) {
    const s = part.trim();
    if (!s) continue;
    const i = s.indexOf("=");
    if (i < 0) out.cal = s;
    else out[s.slice(0, i).trim().toLowerCase()] = s.slice(i + 1).trim();
  }
  return out;
}
function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  return isNaN(n) ? def : Math.min(max, Math.max(min, n));
}

function pad(n) { return String(n).padStart(2, "0"); }
function hm(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function sameDay(a, b) { return startOfDay(a).getTime() === startOfDay(b).getTime(); }
function dayOffset(d) { return Math.round((startOfDay(d) - startOfDay(new Date())) / DAY); }
function minutes(e) { return (e.end - e.start) / MIN; }
function dayLabel(d, style) {
  const n = dayOffset(d);
  if (n === 0) return "Aujourd'hui";
  if (n === 1) return "Demain";
  const opts = style === "short"
    ? { weekday: "short", day: "numeric" }
    : { weekday: "long", day: "numeric", month: "long" };
  return cap(d.toLocaleDateString(SETTINGS.locale, opts));
}
function fmtDur(min) {
  min = Math.max(1, Math.round(min));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${pad(m)}` : `${h} h`;
}
// calshow: attend des secondes depuis le 1er janvier 2001
function calUrl(d) {
  return "calshow:" + (d ? Math.round(d.getTime() / 1000 - 978307200) : "");
}
