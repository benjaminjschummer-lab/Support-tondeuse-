// Vérifie que rien ne déborde (iPhone 15 Pro et iPhone SE) et fait les captures.
// Usage : node dev/verifier.mjs [--captures]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { run, widgetHTML, SIZES } from "./simulateur.mjs";

// Playwright préinstallé globalement ou dans node_modules
const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenarios = ["en-cours", "bientot", "soir", "vide", "erreur"];
const fams = ["small", "medium", "large", "accessoryRectangular", "accessoryCircular", "accessoryInline"];

const browser = await chromium.launch();
const page = await browser.newPage();
let html = "", problems = 0;
for (const device of Object.keys(SIZES))
  for (const sc of scenarios)
    for (const f of fams)
      for (const theme of ["dark", "light"])
        html += `<div data-id="${device} / ${sc} / ${f} / ${theme}">${widgetHTML(await run(sc, f, device), f, theme, device)}</div>`;
await page.setContent(`<body style="font-family:Inter">${html}</body>`);
await page.evaluate(() => document.fonts.ready);
const issues = await page.evaluate(() => {
  const out = [];
  for (const wrap of document.querySelectorAll("[data-id]")) {
    const w = wrap.firstElementChild, wr = w.getBoundingClientRect();
    if (w.scrollHeight > w.clientHeight + 1) out.push(`${wrap.dataset.id} : déborde en hauteur (${w.scrollHeight} > ${w.clientHeight})`);
    for (const el of w.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > wr.right + 1 || r.left < wr.left - 1)) { out.push(`${wrap.dataset.id} : déborde en largeur « ${el.textContent.slice(0, 30)} »`); break; }
    }
  }
  return out;
});
for (const i of issues) { console.log("✗", i); problems++; }
console.log(problems ? `${problems} problème(s)` : "✓ aucun débordement");

if (process.argv.includes("--captures")) {
  const p2 = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1060, height: 800 } });
  await p2.goto("file://" + path.join(ROOT, "docs/apercu.html"));
  await p2.evaluate(() => document.fonts.ready);
  for (const id of ["en-cours", "bientot", "soir"]) {
    await p2.locator(`#${id}`).screenshot({ path: path.join(ROOT, `docs/apercu-${id}.png`) });
  }
  console.log("captures écrites dans docs/");
}
await browser.close();
process.exit(problems ? 1 : 0);
