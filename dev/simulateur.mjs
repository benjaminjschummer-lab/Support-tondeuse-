// Simulateur Scriptable minimal : exécute le widget dans Node avec des données
// fictives et produit un rendu HTML approximatif (police Inter ≈ SF Pro).
// Usage : node dev/simulateur.mjs   → écrit docs/apercu.html
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = fs.readFileSync(path.join(ROOT, "scriptable/La_Paire_RDV.js"), "utf8");

// ---------------------------------------------------------------- API factice
class Color {
  constructor(hex, alpha = 1) { this.hex = hex.replace("#", ""); this.alpha = alpha; }
  static dynamic(light, dark) { const c = new Color(dark.hex, dark.alpha); c.light = light; return c; }
  static white() { return new Color("#FFFFFF"); }
  static black() { return new Color("#000000"); }
  static clear() { return new Color("#000000", 0); }
}
const css = (c, theme) => {
  if (!c) return undefined;
  const k = theme === "light" && c.light ? c.light : c;
  const n = parseInt(k.hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${k.alpha})`;
};

const WEIGHTS = { ultraLight: 200, thin: 250, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, heavy: 800, black: 900 };
class Font { constructor(name, size) { this.name = name; this.size = size; this.weight = 400; } }
const mkFont = (size, weight, kind, italic) => Object.assign(new Font("system", size), { weight, kind, italic });
Font.systemFont = s => mkFont(s, 400);
Font.italicSystemFont = s => mkFont(s, 400, "", true);
for (const [w, v] of Object.entries(WEIGHTS)) {
  Font[`${w}SystemFont`] = s => mkFont(s, v);
  Font[`${w}MonospacedSystemFont`] = s => mkFont(s, v, "mono");
  Font[`${w}RoundedSystemFont`] = s => mkFont(s, v, "rounded");
}
class Size { constructor(w, h) { this.width = w; this.height = h; } }
class Point { constructor(x, y) { this.x = x; this.y = y; } }
class Rect { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } }
class Path {
  constructor() { this.d = ""; }
  move(p) { this.d += `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }
  addLine(p) { this.d += `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }
}
class DrawContext {
  constructor() { this.ops = []; this.size = new Size(100, 100); this.align = "start"; }
  setLineWidth(w) { this.lw = w; }
  setStrokeColor(c) { this.stroke = c; }
  setTextColor(c) { this.tc = c; }
  setFont(f) { this.font = f; }
  setTextAlignedCenter() { this.align = "middle"; }
  addPath(p) { this.path = p; }
  strokePath() { this.ops.push(`<path d="${this.path.d}" fill="none" stroke="${css(this.stroke)}" stroke-width="${this.lw}"/>`); }
  drawTextInRect(t, r) {
    const f = this.font;
    this.ops.push(`<text x="${r.x + r.width / 2}" y="${r.y + f.size * 0.95}" text-anchor="${this.align}" font-family="${family(f)}" font-weight="${f.weight}" font-size="${f.size}" fill="${css(this.tc)}">${esc(t)}</text>`);
  }
  getImage() { return { svg: `<svg viewBox="0 0 ${this.size.width} ${this.size.height}" width="100%" height="100%">${this.ops.join("")}</svg>` }; }
}
const SYMBOLS = { calendar: "▦", "arrow.clockwise": "↻", "cup.and.saucer": "☕︎", "sun.max.fill": "☀︎", "lock.fill": "🔒︎", "exclamationmark.triangle.fill": "⚠︎", "checkmark.circle": "✓" };
const SFSymbol = { named: n => ({ name: n, applyFont(f) { this.font = f; }, get image() { return { sym: n }; } }) };

class Element { constructor(type, props = {}) { Object.assign(this, { type }, props); } }
class Text extends Element {
  constructor(t) { super("text", { text: t }); }
  leftAlignText() { this.align = "left"; } centerAlignText() { this.align = "center"; } rightAlignText() { this.align = "right"; }
}
class WDate extends Text {
  constructor(d) { super(""); this.type = "date"; this.date = d; }
  applyTimerStyle() { this.timer = true; const s = Math.max(0, Math.round((this.date - clock()) / 1000)); this.text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
}
class WImage extends Element {
  constructor(img) { super("image", { img }); }
  centerAlignImage() {} leftAlignImage() {} rightAlignImage() {}
}
class Stack extends Element {
  constructor(type = "stack") { super(type, { children: [], vertical: false, align: "center", padding: null, spacing: 0 }); }
  addText(t) { return this.push(new Text(t)); }
  addDate(d) { return this.push(new WDate(d)); }
  addImage(i) { return this.push(new WImage(i)); }
  addSpacer(n) { return this.push(new Element("spacer", { length: n })); }
  addStack() { return this.push(new Stack()); }
  push(e) { this.children.push(e); return e; }
  layoutHorizontally() { this.vertical = false; } layoutVertically() { this.vertical = true; this.align = "start"; }
  topAlignContent() { this.align = "start"; } centerAlignContent() { this.align = "center"; } bottomAlignContent() { this.align = "end"; }
  setPadding(t, l, b, r) { this.padding = [t, l, b, r]; }
}
class ListWidget extends Stack {
  constructor() { super("widget"); this.vertical = true; this.padding = [16, 16, 16, 16]; }
}

let NOW = 0;
const clock = () => NOW;
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
}

// ---------------------------------------------------------------- Scénarios
const at = (dayOff, h, m) => { const d = new RealDate(2026, 10, 17 + dayOff, h, m); return d; };
const ev = (dayOff, h, m, dur, title) => ({ identifier: Math.random().toString(36), title, isAllDay: false, startDate: at(dayOff, h, m), endDate: new RealDate(at(dayOff, h, m).getTime() + dur * 60000) });
const AGENDA = [
  ev(0, 9, 0, 45, "Sophie Lambert · Coupe & brushing"),
  ev(0, 10, 15, 45, "Marie Dubois · Coupe & coloration"),
  ev(0, 11, 15, 30, "Lucas Martin · Coupe homme"),
  ev(0, 12, 30, 60, "Camille Lefèvre · Balayage"),
  ev(0, 14, 0, 30, "Nora Benali · Brushing"),
  ev(0, 15, 0, 90, "Julie Peeters · Mèches + soin"),
  ev(1, 9, 30, 45, "Thomas Janssens · Coupe & barbe"),
  ev(1, 10, 30, 60, "Emma Willems · Coloration"),
  ev(1, 14, 0, 30, "Hugo Maes - Coupe enfant"),
  ev(2, 10, 0, 60, "Léa Dupont"),
  { identifier: "conge", title: "Fermé", isAllDay: true, startDate: at(3, 0, 0), endDate: at(4, 0, 0) },
];
const SCENARIOS = {
  "en-cours": { now: at(0, 10, 40), events: AGENDA, label: "RDV en cours" },
  "bientot": { now: at(0, 11, 2), events: AGENDA, label: "Prochain dans 13 min" },
  "soir": { now: at(0, 17, 10), events: AGENDA, label: "Journée terminée" },
  "vide": { now: at(0, 10, 0), events: [], label: "Agenda vide" },
  "erreur": { now: at(0, 10, 0), events: AGENDA, calendar: "Autre", label: "Calendrier introuvable" },
};

export async function run(scenarioName, family, device = "iPhone 15 Pro") {
  const sc = SCENARIOS[scenarioName];
  NOW = sc.now.getTime();
  let result = null;
  const g = {
    Device: { screenSize: () => new Size(SIZES[device].screen[0], SIZES[device].screen[1]) },
    Color, Font, Size, Point, Rect, Path, DrawContext, ListWidget, SFSymbol, Date: FakeDate,
    config: { runsInWidget: true, runsInApp: false, widgetFamily: family },
    args: { widgetParameter: null },
    Calendar: { forEvents: async () => [{ identifier: "x", title: "Perso" }, { identifier: "y", title: sc.calendar || "La Paire" }] },
    CalendarEvent: { between: async (a, b, cals) => sc.events.filter(e => e.endDate > a && e.startDate < b && cals.length) },
    Script: { setWidget: w => { result = w; }, complete: () => {} },
    Alert: class { },
  };
  const AsyncFunction = (async () => {}).constructor;
  await new AsyncFunction(...Object.keys(g), SCRIPT)(...Object.values(g));
  if (!result) throw new Error("aucun widget produit");
  return result;
}

// ---------------------------------------------------------------- Rendu HTML
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const family = f => f.kind === "mono" ? "'DejaVu Sans Mono', monospace" : f.kind === "rounded" ? "'Inter Display', Inter, sans-serif" : "Inter, sans-serif";

function wants(el) { // l'élément veut-il s'étendre ? (spacer flexible ou timer)
  if (el.type === "date" && el.timer) return { h: true, v: false };
  if (!el.children) return { h: false, v: false };
  let h = false, v = false;
  for (const c of el.children) {
    if (c.type === "spacer" && c.length == null) { if (el.vertical) v = true; else h = true; }
    else { const w = wants(c); h ||= w.h; v ||= w.v; }
  }
  if (el.size && el.size.width > 0) h = false;
  if (el.size && el.size.height > 0) v = false;
  return { h, v };
}

function render(el, parent, theme, defaultColor) {
  const st = [];
  const pv = parent && parent.vertical;
  const w = wants(el);
  if (parent) {
    const mainGrow = pv ? w.v : w.h, crossGrow = pv ? w.h : w.v;
    if (mainGrow) st.push("flex-grow:1");
    if (crossGrow || (parent.type === "widget" && el.type === "text")) st.push("align-self:stretch");
  }
  if (el.type === "spacer") {
    return `<div style="flex:${el.length == null ? "1 1 0" : `0 0 ${el.length}px`};min-width:0;min-height:0"></div>`;
  }
  if (el.type === "text" || el.type === "date") {
    const f = el.font || Font.systemFont(16);
    st.push(`font:${f.italic ? "italic " : ""}${f.weight} ${f.size}px/${(f.size * 1.2).toFixed(1)}px ${family(f)}`,
      `color:${css(el.textColor, theme) || defaultColor}`, "min-width:0", "flex-shrink:1",
      `text-align:${el.align || "left"}`);
    if (el.textOpacity) st.push(`opacity:${el.textOpacity}`);
    if (el.lineLimit === 1) st.push("white-space:nowrap", "overflow:hidden", "text-overflow:ellipsis");
    else if (el.lineLimit) st.push("display:-webkit-box", `-webkit-line-clamp:${el.lineLimit}`, "-webkit-box-orient:vertical", "overflow:hidden");
    return `<div style="${st.join(";")}">${esc(el.text)}</div>`;
  }
  if (el.type === "image") {
    const s = el.imageSize;
    if (el.img.svg) return `<div style="${st.join(";")};width:100%;height:100%">${el.img.svg}</div>`;
    st.push(`color:${css(el.tintColor, theme) || defaultColor}`, `font:700 ${s ? s.height - 1 : 14}px/1 sans-serif`,
      `width:${s ? s.width : 16}px`, `height:${s ? s.height : 16}px`, "display:flex", "align-items:center", "justify-content:center", "flex-shrink:0");
    return `<div style="${st.join(";")}">${SYMBOLS[el.img.sym] || "•"}</div>`;
  }
  // stack / widget
  const align = { start: "flex-start", center: "center", end: "flex-end" }[el.align];
  st.push("display:flex", `flex-direction:${el.vertical ? "column" : "row"}`, `align-items:${el.type === "widget" ? "center" : align}`, "min-width:0", "flex-shrink:1");
  if (el.spacing) st.push(`gap:${el.spacing}px`);
  if (el.padding) st.push(`padding:${el.padding.map(p => p + "px").join(" ")}`);
  if (el.backgroundColor) st.push(`background:${css(el.backgroundColor, theme)}`);
  if (el.cornerRadius) st.push(`border-radius:${el.cornerRadius}px`, "overflow:hidden");
  if (el.size) {
    if (el.size.width > 0) st.push(`width:${el.size.width}px`, "flex-shrink:0");
    if (el.size.height > 0) st.push(`height:${el.size.height}px`);
  }
  if (el.type !== "widget") st.push("box-sizing:border-box");
  const inner = el.children.map(c => render(c, el, theme, defaultColor)).join("");
  return el.type === "widget" ? inner : `<div style="${st.join(";")}">${inner}</div>`;
}

export const SIZES = {
  "iPhone 15 Pro": { screen: [393, 852], small: [158, 158], medium: [338, 158], large: [338, 354], accessoryRectangular: [160, 72], accessoryCircular: [72, 72], accessoryInline: [240, 22] },
  "iPhone SE": { screen: [375, 667], small: [148, 148], medium: [321, 148], large: [321, 324], accessoryRectangular: [150, 68], accessoryCircular: [68, 68], accessoryInline: [220, 22] },
};

export function widgetHTML(w, fam, theme, device = "iPhone 15 Pro") {
  const [W, H] = SIZES[device][fam];
  const acc = fam.startsWith("accessory");
  const ink = acc ? "#fff" : theme === "light" ? "#1A1D22" : "#F4F1EA";
  const p = w.padding;
  const box = [`width:${W}px`, `height:${H}px`, "box-sizing:border-box", "display:flex", "flex-direction:column", "overflow:hidden",
    `padding:${acc ? (fam === "accessoryCircular" ? "0" : "2px 0") : p.map(x => x + "px").join(" ")}`,
    `background:${acc ? (w.addAccessoryWidgetBackground ? "rgba(255,255,255,.16)" : "transparent") : css(w.backgroundColor, theme)}`,
    `border-radius:${acc ? (fam === "accessoryCircular" ? "50%" : "0") : "22px"}`,
    acc ? "" : "box-shadow:0 8px 24px rgba(0,0,0,.25)"];
  return `<div class="widget" data-fam="${fam}" style="${box.join(";")}">${render(w, null, theme, ink)}</div>`;
}

// ---------------------------------------------------------------- Page d'aperçu
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fams = ["small", "medium", "large"];
  const accs = ["accessoryRectangular", "accessoryCircular", "accessoryInline"];
  let body = "";
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    const now = sc.now.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
    body += `<section id="${name}"><h2>${esc(sc.label)} <span>· ${now}</span></h2>`;
    for (const theme of ["dark", "light"]) {
      body += `<div class="row ${theme}">`;
      for (const f of fams) body += widgetHTML(await run(name, f), f, theme);
      if (theme === "dark") body += `<div class="lock">${(await Promise.all(accs.map(async f => widgetHTML(await run(name, f), f, theme)))).join("")}</div>`;
      body += `</div>`;
    }
    body += `</section>`;
  }
  const page = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Aperçu La Paire</title>
<style>
body{margin:0;padding:24px;background:#0b0d10;font-family:Inter,sans-serif;color:#e8e4da}
h2{font:600 15px Inter;margin:28px 0 12px;color:#C9A24D}h2 span{color:#9AA0A8;font-weight:500}
.row{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;padding:18px;border-radius:24px;margin-bottom:12px}
.row.dark{background:linear-gradient(135deg,#2b3340,#1a1f27)}.row.light{background:linear-gradient(135deg,#d9d2c4,#efe9dd)}
.lock{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:14px;border-radius:18px;background:linear-gradient(160deg,#3d4a63,#20283a)}
</style><body><h1 style="font:700 20px Inter;margin:0">La Paire — aperçu du widget</h1>${body}</body></html>`;
  fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "docs/apercu.html"), page);
  console.log("docs/apercu.html écrit");
}
