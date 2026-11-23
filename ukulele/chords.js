// Ukulele chord engine (GCEA, re-entrant tuning). Shared by the app and the self-test.
(function (global) {
  const NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const NOTES_PREF = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const NOTES_FR = ["Do", "Do#", "Ré", "Mib", "Mi", "Fa", "Fa#", "Sol", "Lab", "La", "Sib", "Si"];
  const FR_ROOTS = { DO: 0, RE: 2, "RÉ": 2, MI: 4, FA: 5, SOL: 7, LA: 9, SI: 11 };
  const EN_ROOTS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const STRINGS = [7, 0, 4, 9]; // G C E A pitch classes
  const STRING_MIDI = [67, 60, 64, 69];
  const STRING_NAMES = ["G", "C", "E", "A"];

  const QUALITIES = {
    "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
    "6": [0, 4, 7, 9], m6: [0, 3, 7, 9], "9": [0, 4, 7, 10, 2], m9: [0, 3, 7, 10, 2],
    maj9: [0, 4, 7, 11, 2], add9: [0, 4, 7, 2], madd9: [0, 3, 7, 2], sus2: [0, 2, 7], sus4: [0, 5, 7],
    "7sus4": [0, 5, 7, 10], dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8],
    "5": [0, 7], mmaj7: [0, 3, 7, 11], "11": [0, 4, 7, 10], "13": [0, 4, 7, 10, 9], "7b9": [0, 4, 7, 10],
  };

  // Hand-picked common shapes [G, C, E, A]. Checked against the theory by the self-test.
  const PREFERRED = {
    C: "0003", Cm: "0333", C7: "0001", Cm7: "3333", Cmaj7: "0002", C6: "0000", Csus4: "0013", Csus2: "0233",
    "C#": "1114", "C#m": "1104", "C#7": "1112", "C#m7": "1102", "C#maj7": "1113",
    D: "2220", Dm: "2210", D7: "2223", Dm7: "2213", Dmaj7: "2224", Dsus4: "0230", Dsus2: "2200", D6: "2222",
    Eb: "0331", Ebm: "3321", Eb7: "3334", Ebm7: "3324", Ebmaj7: "3335",
    E: "1402", Em: "0432", E7: "1202", Em7: "0202", Emaj7: "1302",
    F: "2010", Fm: "1013", F7: "2313", Fm7: "1313", Fmaj7: "5500",
    "F#": "3121", "F#m": "2120", "F#7": "3424", "F#m7": "2424",
    G: "0232", Gm: "0231", G7: "0212", Gm7: "0211", Gmaj7: "0222", G6: "0202", Gsus4: "0233", Gsus2: "0230",
    Ab: "5343", Abm: "4342", Abm7: "1322", Abmaj7: "1333",
    A: "2100", Am: "2000", A7: "0100", Am7: "0000", Amaj7: "1100", Asus4: "2200", Asus2: "2452", A6: "2424",
    Bb: "3211", Bbm: "3111", Bb7: "1211", Bbm7: "1111", Bbmaj7: "3210",
    B: "4322", Bm: "4222", B7: "2322", Bm7: "2222", Bmaj7: "4321",
    Bdim: "4212",
  };

  function normQuality(q) {
    q = q.replace(/\s+/g, "").replace(/[()]/g, "");
    q = q.replace(/^(min|mi|-)(?!\d*[b#])/, "m");
    q = q.replace(/^M(?=7|9|$)/, "maj").replace(/^Δ/, "maj").replace(/^ma(?=[79])/, "maj");
    q = q.replace(/°7?/, (s) => (s.length > 1 ? "dim7" : "dim")).replace(/^ø7?/, "m7b5").replace(/^\+$/, "aug").replace(/^aug5?$/, "aug");
    q = q.replace(/^m7\(?-5\)?$/, "m7b5").replace(/^sus$/, "sus4").replace(/^7sus$/, "7sus4").replace(/^add2$/, "add9");
    q = q.replace(/^mM7$/, "mmaj7").replace(/^m\/?maj7$/, "mmaj7");
    if (QUALITIES[q]) return q;
    // Fall back to the closest family we know.
    if (/^m(?!aj)/.test(q)) return /7/.test(q) ? "m7" : "m";
    if (/^maj/.test(q)) return "maj7";
    if (/^(9|11|13)/.test(q) || /^7/.test(q)) return "7";
    if (/^6/.test(q)) return "6";
    if (/^dim/.test(q)) return "dim";
    if (/^sus/.test(q)) return "sus4";
    return "";
  }

  const CHORD_RE = /^\(?(Do|Ré|Re|Mi|Fa|Sol|La|Si|[A-G])([#b♯♭]?)((?:maj|min|mi|ma|m|M|dim|aug|sus|add|°|ø|Δ|\+|-)?(?:\d{0,2})(?:(?:sus|add|maj|b|#|\+|-|\()?\d{1,2}\)?)*)(?:\/(Do|Ré|Re|Mi|Fa|Sol|La|Si|[A-G])([#b♯♭]?))?\)?\*?$/;

  function rootPc(name, acc) {
    const up = name.toUpperCase();
    let pc = name.length === 1 ? EN_ROOTS[up] : FR_ROOTS[up];
    if (pc === undefined) return null;
    if (acc === "#" || acc === "♯") pc++;
    if (acc === "b" || acc === "♭") pc--;
    return (pc + 12) % 12;
  }

  function parseChord(token) {
    const m = CHORD_RE.exec(token.trim());
    if (!m) return null;
    const root = rootPc(m[1], m[2]);
    if (root === null) return null;
    const rawQ = m[3] || "";
    const bass = m[4] ? rootPc(m[4], m[5]) : null;
    return { root, rawQ, quality: normQuality(rawQ), bass };
  }

  function isChord(token) { return !!parseChord(token); }

  function rawQualityLabel(raw) {
    return raw.replace(/^min|^mi(?!n)/, "m").replace(/^-(?=\d|$)/, "m");
  }

  function chordName(ch, transpose, notation) {
    const names = notation === "fr" ? NOTES_FR : NOTES_PREF;
    const r = (ch.root + transpose + 120) % 12;
    let s = names[r] + rawQualityLabel(ch.rawQ);
    if (ch.bass !== null) s += "/" + names[(ch.bass + transpose + 120) % 12];
    return s;
  }

  // Key used for shape lookup: canonical English root + normalized quality.
  function shapeKey(ch, transpose) {
    return NOTES_PREF[(ch.root + transpose + 120) % 12] + ch.quality;
  }

  function tonesOf(root, quality) {
    return QUALITIES[quality].map((i) => (root + i) % 12);
  }

  function checkShape(frets, root, quality) {
    const tones = tonesOf(root, quality);
    const set = new Set(tones);
    const played = frets.map((f, i) => (STRINGS[i] + f) % 12);
    if (!played.every((p) => set.has(p))) return false;
    const fifth = (root + 7) % 12;
    const req = tones.filter((t) => !(t === fifth && tones.length > 3));
    return req.every((t) => played.includes(t));
  }

  const cache = new Map();
  function findShapes(root, quality, max = 4) {
    const key = root + "|" + quality;
    if (cache.has(key)) return cache.get(key);
    const tones = tonesOf(root, quality);
    const set = new Set(tones);
    const fifth = (root + 7) % 12;
    let req = tones.filter((t) => !(t === fifth && tones.length > 3));
    if (req.length > 4) req = req.filter((t) => t !== root);
    const results = [];
    const opts = STRINGS.map((s) => {
      const o = [];
      for (let f = 0; f <= 12; f++) if (set.has((s + f) % 12)) o.push(f);
      return o;
    });
    for (const a of opts[0]) for (const b of opts[1]) for (const c of opts[2]) for (const d of opts[3]) {
      const fr = [a, b, c, d];
      const played = fr.map((f, i) => (STRINGS[i] + f) % 12);
      if (!req.every((t) => played.includes(t))) continue;
      const fretted = fr.filter((f) => f > 0);
      const mn = fretted.length ? Math.min(...fretted) : 0;
      const mx = fretted.length ? Math.max(...fretted) : 0;
      if (mx - mn > 3) continue;
      const missing = tones.filter((t) => !played.includes(t)).length;
      const opens = fr.filter((f) => f === 0).length;
      const score = mx * 1.6 + (mx - mn) * 1.2 + fretted.length * 0.6 - opens * 0.4 + missing * 1.5 + (played[1] === root ? -0.4 : 0);
      results.push({ frets: fr, score, mn });
    }
    results.sort((x, y) => x.score - y.score);
    const picked = [];
    for (const r of results) {
      if (picked.some((p) => Math.abs(p.mn - r.mn) < 2 && (p.mn === 0) === (r.mn === 0))) continue;
      picked.push(r);
      if (picked.length >= max) break;
    }
    const out = picked.map((p) => p.frets);
    cache.set(key, out);
    return out;
  }

  function shapesFor(ch, transpose) {
    const root = (ch.root + transpose + 120) % 12;
    const list = findShapes(root, ch.quality).map((f) => f.slice());
    const pref = PREFERRED[NOTES_PREF[root] + ch.quality];
    if (pref) {
      const f = pref.split("").map(Number);
      const i = list.findIndex((x) => x.join() === f.join());
      if (i >= 0) list.splice(i, 1);
      list.unshift(f);
    }
    return list.slice(0, 4);
  }

  // Finger numbers + barre detection, simple and predictable.
  function fingering(frets) {
    const fretted = frets.map((f, i) => ({ f, i })).filter((x) => x.f > 0);
    const fingers = [0, 0, 0, 0];
    let barre = null;
    if (!fretted.length) return { fingers, barre };
    const mn = Math.min(...fretted.map((x) => x.f));
    const atMin = fretted.filter((x) => x.f === mn);
    if (fretted.length === 4 && atMin.length >= 2) {
      barre = { fret: mn, from: atMin[0].i, to: atMin[atMin.length - 1].i };
      for (const x of fretted) fingers[x.i] = Math.min(4, 1 + x.f - mn);
      // keep fingers unique outside the barre
      const used = new Set();
      for (const x of fretted.filter((x) => x.f > mn).sort((a, b) => a.f - b.f || a.i - b.i)) {
        let n = fingers[x.i];
        while (used.has(n) && n < 4) n++;
        fingers[x.i] = n; used.add(n);
      }
    } else {
      fretted.sort((a, b) => a.f - b.f || a.i - b.i).forEach((x, k) => (fingers[x.i] = k + 1));
    }
    return { fingers, barre };
  }

  global.UkeChords = {
    NOTES_PREF, NOTES_FR, NOTES_SHARP, STRINGS, STRING_MIDI, STRING_NAMES, QUALITIES, PREFERRED,
    parseChord, isChord, chordName, shapeKey, shapesFor, findShapes, checkShape, fingering, tonesOf,
  };
})(typeof window !== "undefined" ? window : globalThis);
