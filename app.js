'use strict';
/* Platine — une platine vinyle épurée qui pilote Spotify (Spotify Connect + Web API). */

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/* ---------- Stockage ---------- */
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('platine.' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('platine.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('platine.' + k); } catch {} },
};

/* ---------- Géométrie du bras (coordonnées du viewBox 125×100) ---------- */
const GEO = { cx: 50, cy: 50, px: 108, py: 16, L: 58, rOuter: 39.5, rInner: 16.8 };
const stylus = (deg) => {
  const t = (deg * Math.PI) / 180;
  return { x: GEO.px - GEO.L * Math.sin(t), y: GEO.py + GEO.L * Math.cos(t) };
};
const radiusAt = (deg) => { const p = stylus(deg); return Math.hypot(p.x - GEO.cx, p.y - GEO.cy); };
function angleForRadius(r) { // le rayon décroît quand l'angle augmente sur [0°, 55°]
  let lo = 0, hi = 55;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; radiusAt(m) > r ? (lo = m) : (hi = m); }
  return (lo + hi) / 2;
}
const A_REST = 0;
const A_OUTER = angleForRadius(GEO.rOuter);
const A_INNER = angleForRadius(GEO.rInner);
const A_EDGE = angleForRadius(42); // bord du disque

/* ---------- Lecteur démo (sans compte) ---------- */
class DemoPlayer {
  constructor() {
    this.kind = 'demo';
    this.tracks = [
      { id: 'd1', title: 'Lignes Claires', artist: 'Studio Platine', duration: 214000, color: '#ff5a36' },
      { id: 'd2', title: 'Après-midi Bleu', artist: 'Les Sillons', duration: 187000, color: '#3b6cf6' },
      { id: 'd3', title: 'Papier Blanc', artist: 'Mono Club', duration: 243000, color: '#1f9d6b' },
    ];
    this.i = 0;
    this.state = this.make(false, 0);
  }
  make(isPlaying, progress) {
    const t = this.tracks[this.i];
    return { isPlaying, progress, duration: t.duration, at: performance.now(),
      track: { ...t, art: null }, device: null };
  }
  async refresh() {
    const s = this.state;
    if (s.isPlaying && progressOf(s) >= s.duration) { this.i = (this.i + 1) % this.tracks.length; this.state = this.make(true, 0); }
    return this.state;
  }
  async play() { this.state = { ...this.state, isPlaying: true, at: performance.now() }; }
  async pause() { this.state = { ...this.state, isPlaying: false, progress: progressOf(this.state), at: performance.now() }; }
  async seek(ms) { this.state = { ...this.state, progress: clamp(ms, 0, this.state.duration), at: performance.now() }; }
  async next() { this.i = (this.i + 1) % this.tracks.length; this.state = this.make(this.state.isPlaying, 0); }
  async prev() {
    if (progressOf(this.state) > 3000) return this.seek(0);
    this.i = (this.i + this.tracks.length - 1) % this.tracks.length; this.state = this.make(this.state.isPlaying, 0);
  }
}

/* ---------- Spotify (OAuth PKCE, sans serveur) ---------- */
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
const REDIRECT_URI = location.origin + location.pathname.replace(/index\.html$/, '');
const API = 'https://api.spotify.com/v1';

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function randomString(n) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => chars[b % chars.length]).join('');
}

async function login(clientId) {
  const verifier = randomString(64);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = randomString(16);
  store.set('verifier', verifier); store.set('oauthState', state); store.set('clientId', clientId);
  const q = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES, state });
  location.href = 'https://accounts.spotify.com/authorize?' + q;
}

async function tokenRequest(params) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || 'Échec de l’authentification');
  const prev = store.get('token') || {};
  const tok = { access: j.access_token, refresh: j.refresh_token || prev.refresh, expires: Date.now() + j.expires_in * 1000 };
  store.set('token', tok);
  return tok;
}

async function handleCallback() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return;
  history.replaceState(null, '', REDIRECT_URI);
  if (q.has('error')) throw new Error('Connexion refusée : ' + q.get('error'));
  if (q.get('state') !== store.get('oauthState')) throw new Error('Réponse d’authentification invalide');
  await tokenRequest({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: REDIRECT_URI,
    client_id: store.get('clientId'), code_verifier: store.get('verifier') });
  store.del('verifier'); store.del('oauthState');
}

class NoDeviceError extends Error {}

class SpotifyPlayer {
  constructor() { this.kind = 'spotify'; this.state = null; this.devices = []; }

  async token() {
    let t = store.get('token');
    if (!t) throw new Error('Non connecté');
    if (Date.now() > t.expires - 60000) t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: store.get('clientId') });
    return t.access;
  }

  async api(method, path, body, retry = true) {
    const r = await fetch(API + path, {
      method, headers: { Authorization: 'Bearer ' + (await this.token()), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401 && retry) { const t = store.get('token'); if (t) { t.expires = 0; store.set('token', t); } return this.api(method, path, body, false); }
    if (r.status === 204 || r.status === 202) return null;
    const text = await r.text();
    const j = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
    if (r.status === 404 && /device/i.test(text)) throw new NoDeviceError();
    if (r.status === 403) throw new Error('Action refusée (Spotify Premium requis ?)');
    if (r.status === 429) throw new Error('Trop de requêtes, patiente un instant');
    if (!r.ok) throw new Error(j?.error?.message || `Erreur Spotify ${r.status}`);
    return j;
  }

  async refresh() {
    const j = await this.api('GET', '/me/player?additional_types=episode');
    if (!j || !j.item) {
      this.state = { isPlaying: false, progress: 0, duration: 0, at: performance.now(), track: null, device: j?.device || null };
      return this.state;
    }
    const it = j.item;
    const images = it.album?.images || it.images || it.show?.images || [];
    this.state = {
      isPlaying: !!j.is_playing,
      progress: j.progress_ms || 0,
      duration: it.duration_ms || 0,
      at: performance.now(),
      device: j.device || null,
      track: {
        id: it.id || it.uri,
        title: it.name,
        artist: it.artists ? it.artists.map((a) => a.name).join(', ') : it.show?.name || '',
        art: images[0]?.url || null,
      },
    };
    return this.state;
  }

  async listDevices() { const j = await this.api('GET', '/me/player/devices'); this.devices = j?.devices || []; return this.devices; }
  async transfer(id, play = true) { await this.api('PUT', '/me/player', { device_ids: [id], play }); }

  async play() {
    try { await this.api('PUT', '/me/player/play'); }
    catch (e) {
      if (!(e instanceof NoDeviceError)) throw e;
      const devs = await this.listDevices();
      if (!devs.length) throw e;
      const pick = devs.find((d) => d.type === 'Smartphone' || d.type === 'Tablet') || devs[0];
      await this.transfer(pick.id, true);
    }
  }
  async pause() { await this.api('PUT', '/me/player/pause'); }
  async next() { await this.api('POST', '/me/player/next'); }
  async prev() { await this.api('POST', '/me/player/previous'); }
  async seek(ms) { await this.api('PUT', '/me/player/seek?position_ms=' + Math.round(ms)); }
}

/* ---------- État partagé ---------- */
function progressOf(s) {
  if (!s) return 0;
  return clamp(s.progress + (s.isPlaying ? performance.now() - s.at : 0), 0, s.duration || 0);
}

let player = store.get('token') ? new SpotifyPlayer() : new DemoPlayer();
let S = player.state || { isPlaying: false, progress: 0, duration: 0, at: performance.now(), track: null };

const ui = {
  record: $('#record'), arm: $('#arm'), armShadow: $('#armShadow'), armLayer: $('#armLayer'), armHit: $('#armHit'),
  title: $('#title'), artist: $('#artist'), seek: $('#seek'), deck: $('#deck'),
  play: $('#playBtn'), led: $('#led'), status: $('#status'),
  labelArt: $('#labelArt'), labelText: $('#labelText'), labelTitle: $('#labelTitle'), label: $('#label'),
  tint: document.documentElement,
};

let statusTimer;
function setStatus(html, sticky = false) {
  ui.status.innerHTML = html || '';
  clearTimeout(statusTimer);
  if (!sticky && html) statusTimer = setTimeout(baseStatus, 4000);
}
function baseStatus() {
  if (player.kind === 'demo') return setStatus('Mode démo · <a href="#" data-open-settings>connecter Spotify</a>', true);
  if (!S.track) return setStatus('Aucune lecture en cours · <a href="spotify:">ouvrir Spotify</a>', true);
  setStatus('', true);
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ---------- Rendu des métadonnées ---------- */
let lastTrackId = null;
function renderMeta() {
  const t = S.track;
  ui.play.classList.toggle('playing', S.isPlaying);
  ui.play.setAttribute('aria-label', S.isPlaying ? 'Pause' : 'Lecture');
  ui.led.classList.toggle('on', S.isPlaying);
  const id = t ? t.id : null;
  if (id === lastTrackId) return;
  lastTrackId = id;
  ui.title.textContent = t ? t.title : 'Rien à l’écoute';
  ui.artist.textContent = t ? t.artist : '';
  ui.labelTitle.textContent = t ? t.title : 'Platine';
  if (t && t.art) {
    ui.labelArt.style.opacity = 0;
    ui.labelArt.onload = () => { ui.labelArt.hidden = false; ui.labelArt.style.opacity = 1; ui.labelText.hidden = true; tintFrom(ui.labelArt); };
    ui.labelArt.src = t.art;
  } else {
    ui.labelArt.hidden = true; ui.labelText.hidden = false;
    const c = t?.color || '#ff5a36';
    ui.label.style.background = `radial-gradient(circle at 35% 30%, ${c}cc, ${c} 60%)`;
    setTint(hexToRgb(c));
  }
  baseStatus();
}

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (c, d, t) => c.map((v, i) => Math.round(v + (d[i] - v) * t));
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const rgbStr = (c) => `rgb(${c.join(',')})`;

/* ---------- Fond : auto / clair / sombre / pochette ---------- */
let palette = null; // { main, second } tirées de la pochette (ou de l'étiquette en démo)

function paletteFrom(img) {
  const N = 24, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, N, N);
  const d = x.getImageData(0, 0, N, N).data; // lève une erreur si l'image n'est pas lisible (CORS)
  const buckets = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const k = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
    const o = buckets.get(k) || { r: 0, g: 0, b: 0, n: 0 };
    o.r += d[i]; o.g += d[i + 1]; o.b += d[i + 2]; o.n++; buckets.set(k, o);
  }
  const list = [...buckets.values()].map((o) => {
    const col = [o.r / o.n, o.g / o.n, o.b / o.n].map(Math.round);
    const sat = (Math.max(...col) - Math.min(...col)) / 255;
    return { col, score: o.n * (1 + sat * 3) };
  }).sort((p, q) => q.score - p.score);
  const main = list[0].col;
  const far = list.find((p) => Math.hypot(...p.col.map((v, i) => v - main[i])) > 90);
  return { main, second: far ? far.col : mix(main, lum(main) > 0.5 ? [0, 0, 0] : [255, 255, 255], 0.35) };
}

function applyTheme() {
  const mode = store.get('theme') || 'auto';
  const root = document.documentElement;
  root.classList.toggle('album', mode === 'album');
  root.style.removeProperty('--bg');
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
  else if (mode === 'album' && palette) {
    const light = lum(palette.main) > 0.58;
    root.dataset.theme = light ? 'light' : 'dark';
    root.style.setProperty('--bg', rgbStr(light ? mix(palette.main, [255, 255, 255], 0.55) : mix(palette.main, [0, 0, 0], 0.55)));
  } else delete root.dataset.theme;
  let tint = palette ? palette.main : [242, 240, 235];
  if (mode === 'album' && palette) {
    // sur fond sombre, la 2e couleur de la pochette brille ; sur fond clair, on reste dans la couleur principale
    tint = root.dataset.theme === 'dark' ? palette.second : mix(mix(palette.main, palette.second, 0.2), [0, 0, 0], 0.1);
  }
  root.style.setProperty('--tint-rgb', tint.join(', '));
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
  document.querySelectorAll('#themeSeg button').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.v === mode);
    btn.setAttribute('aria-checked', btn.dataset.v === mode);
  });
}

function tintFrom(img) {
  try { palette = paletteFrom(img); applyTheme(); } catch { /* image non lisible : on garde le fond actuel */ }
}
function setTint(rgb) { palette = { main: rgb, second: mix(rgb, [255, 255, 255], 0.4) }; applyTheme(); }

/* ---------- Animation : disque + bras ---------- */
const RPM_DEG = 200; // 33⅓ tours/min = 200°/s
let rot = 0, speed = 0, armAngle = A_REST, dragging = false, dragAngle = A_REST, seekingUI = false, lastFrame = performance.now();
const showTime = (ms) => setStatus(`${fmt(ms)} / ${fmt(S.duration)}`, true);

function armTarget() {
  if (dragging) return dragAngle;
  if (S.isPlaying && S.duration) return A_OUTER + (A_INNER - A_OUTER) * (progressOf(S) / S.duration);
  return A_REST;
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
  const target = armTarget();
  const gap = target - armAngle;
  if (dragging) armAngle = target;
  else armAngle += Math.sign(gap) * Math.min(Math.abs(gap), Math.max(Math.abs(gap) * dt * 3, 12 * dt)); // mouvement calme et amorti

  const onRecord = armAngle >= A_EDGE - 0.5;
  const lifted = dragging || Math.abs(target - armAngle) > 0.3 || !S.isPlaying;
  // le plateau tourne dès la lecture, on « pose » ensuite le diamant
  speed += ((S.isPlaying ? RPM_DEG : 0) - speed) * Math.min(1, dt * (S.isPlaying ? 2.2 : 1.1));
  if (grab) {
    // le doigt tient le disque : sans mouvement récent, il est à l'arrêt
    if (now - grab.lastMove > 60) grab.vel *= Math.pow(0.001, dt);
    scratchSound(grab.vel);
  } else {
    rot = (rot + speed * dt) % 360;
  }

  ui.record.style.transform = `rotate(${rot}deg)`;
  ui.arm.setAttribute('transform', `translate(${GEO.px} ${GEO.py}) rotate(${armAngle})`);
  const off = lifted && onRecord ? 3.2 : lifted ? 2.2 : 1.1;
  ui.armShadow.setAttribute('transform', `translate(${GEO.px + off * 0.6} ${GEO.py + off}) rotate(${armAngle})`);

  if (!seekingUI) {
    const p = progressOf(S);
    const v = S.duration ? (p / S.duration) * 1000 : 0;
    ui.seek.value = v; ui.seek.style.setProperty('--p', v / 10 + '%');
  }
  if (S.isPlaying && S.duration && progressOf(S) >= S.duration) schedule(300);
  requestAnimationFrame(frame);
}

/* ---------- Actions ---------- */
let busy = Promise.resolve();
function act(optimistic, fn, delay = 700) {
  if (optimistic) { S = { ...S, ...optimistic(S), at: performance.now() }; renderMeta(); }
  busy = busy.then(fn).then(() => schedule(delay)).catch(handleError);
  return busy;
}
function handleError(e) {
  if (e instanceof NoDeviceError) setStatus('Aucun appareil actif · <a href="spotify:">ouvre Spotify</a> puis réessaie', true);
  else setStatus(escapeHtml(e.message || 'Erreur'));
  schedule(1000);
}

const doPlay = () => act(() => ({ isPlaying: true, progress: progressOf(S) }), () => player.play());
const doPause = () => act(() => ({ isPlaying: false, progress: progressOf(S) }), () => player.pause());
const toggle = () => (S.isPlaying ? doPause() : doPlay());
const doSeek = (ms) => { ms = clamp(ms, 0, Math.max(0, S.duration - 500)); return act(() => ({ progress: ms }), () => player.seek(ms)); };
const doNext = () => act(() => ({ progress: 0 }), () => player.next(), 800);
const doPrev = () => act(() => ({ progress: 0 }), () => player.prev(), 800);

ui.play.addEventListener('click', toggle);
$('#startBtn').addEventListener('click', toggle);
$('#nextBtn').addEventListener('click', doNext);
$('#prevBtn').addEventListener('click', doPrev);

ui.seek.addEventListener('input', () => {
  seekingUI = true;
  ui.seek.style.setProperty('--p', ui.seek.value / 10 + '%');
  showTime((ui.seek.value / 1000) * S.duration);
});
ui.seek.addEventListener('change', () => { seekingUI = false; baseStatus(); doSeek((ui.seek.value / 1000) * S.duration); });

/* ---------- Bras manipulable ---------- */
function pointerAngle(e) {
  // la platine peut être pivotée de 90° (iPhone/iPad en portrait) : on ramène le point dans son repère
  const r = ui.deck.getBoundingClientRect();
  const turned = r.height > r.width;
  const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const ux = turned ? dy : dx, uy = turned ? -dx : dy;
  const W = turned ? r.height : r.width, H = turned ? r.width : r.height;
  const pt = { x: (ux / W + 0.5) * 125, y: (uy / H + 0.5) * 100 };
  const deg = (Math.atan2(-(pt.x - GEO.px), pt.y - GEO.py) * 180) / Math.PI;
  return clamp(deg, A_REST - 4, A_INNER);
}
ui.armHit.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  dragging = true; dragAngle = armAngle;
  ui.armLayer.classList.add('dragging');
  ui.armHit.setPointerCapture(e.pointerId);
});
ui.armHit.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  dragAngle = pointerAngle(e);
  if (S.duration && dragAngle >= A_OUTER) {
    const p = clamp((dragAngle - A_OUTER) / (A_INNER - A_OUTER), 0, 1);
    showTime(p * S.duration);
    seekingUI = true;
  }
});
function endDrag() {
  if (!dragging) return;
  dragging = false; seekingUI = false; baseStatus();
  ui.armLayer.classList.remove('dragging');
  if (dragAngle >= A_EDGE && S.duration) {
    // diamant posé sur le disque : on se place à cet endroit et on joue
    const p = clamp((dragAngle - A_OUTER) / (A_INNER - A_OUTER), 0, 1);
    const ms = p * S.duration;
    armAngle = dragAngle;
    act(() => ({ progress: ms, isPlaying: true }), async () => { await player.seek(ms); await player.play(); });
  } else if (dragAngle >= A_EDGE && !S.duration) {
    doPlay();
  } else if (S.isPlaying) {
    doPause(); // bras ramené sur son support : on arrête
  }
}
ui.armHit.addEventListener('pointerup', endDrag);
ui.armHit.addEventListener('pointercancel', endDrag);

/* ---------- Mode scratch ---------- */
// La musique Spotify est jouée par l'app Spotify : on ne peut pas toucher à son son.
// Le scratch fait tourner le disque au doigt et produit un son de scratch synthétisé par-dessus.
let scratchOn = !!store.get('scratch');
let grab = null; // { last, lastMove, vel, id }
let actx = null, sx = null;

function setScratch(on) {
  scratchOn = on; store.set('scratch', on);
  document.body.classList.toggle('scratch', on);
  $('#scratchToggle').checked = on;
}

function audioInit() {
  if (!actx) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch {} // se mélange avec Spotify sans le couper
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    const len = actx.sampleRate * 2, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0, b = 0; i < len; i++) { b = 0.85 * b + 0.15 * (Math.random() * 2 - 1); d[i] = b * 3; } // bruit de sillon un peu feutré
    const noise = actx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const osc = actx.createOscillator(); osc.type = 'sawtooth';
    const osc2 = actx.createOscillator(); osc2.type = 'square';
    const og = actx.createGain(); og.gain.value = 0.45;
    const og2 = actx.createGain(); og2.gain.value = 0.18;
    const ng = actx.createGain(); ng.gain.value = 0.5;
    const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4000;
    const vca = actx.createGain(); vca.gain.value = 0;
    noise.connect(ng).connect(bp); osc.connect(og).connect(bp); osc2.connect(og2).connect(bp);
    bp.connect(lp).connect(vca).connect(actx.destination);
    noise.start(); osc.start(); osc2.start();
    sx = { osc, osc2, bp, vca };
  }
  if (actx.state !== 'running') actx.resume().catch(() => {});
}

function scratchSound(vel) {
  if (!sx) return;
  const t = actx.currentTime;
  const n = clamp(Math.abs(vel) / RPM_DEG, 0, 5); // 1 = vitesse normale du disque
  const dir = vel >= 0 ? 1 : 0.82; // à l'envers, le son est un peu plus grave
  const g = n < 0.04 ? 0 : clamp(0.12 + n * 0.32, 0, 0.9);
  sx.vca.gain.setTargetAtTime(g, t, 0.012);
  sx.osc.frequency.setTargetAtTime((70 + n * 190) * dir, t, 0.01);
  sx.osc2.frequency.setTargetAtTime((140 + n * 330) * dir, t, 0.01);
  sx.bp.frequency.setTargetAtTime((350 + n * 900) * dir, t, 0.01);
}

function recordAngle(e) {
  const r = ui.record.getBoundingClientRect();
  return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
}
ui.record.addEventListener('pointerdown', (e) => {
  if (!scratchOn || dragging) return;
  e.preventDefault();
  audioInit();
  grab = { id: e.pointerId, last: recordAngle(e), lastMove: performance.now(), vel: 0 };
  ui.record.setPointerCapture(e.pointerId);
  ui.record.classList.add('grabbed');
});
ui.record.addEventListener('pointermove', (e) => {
  if (!grab || e.pointerId !== grab.id) return;
  const now = performance.now(), a = recordAngle(e);
  let delta = a - grab.last;
  if (delta > 180) delta -= 360; else if (delta < -180) delta += 360;
  const dt = Math.max(8, now - grab.lastMove) / 1000;
  grab.vel = grab.vel * 0.4 + (delta / dt) * 0.6;
  grab.last = a; grab.lastMove = now;
  rot = (rot + delta) % 360;
});
function releaseRecord(e) {
  if (!grab || e.pointerId !== grab.id) return;
  speed = clamp(grab.vel, -1500, 1500); // le disque repart avec l'élan donné puis reprend sa vitesse
  grab = null;
  ui.record.classList.remove('grabbed');
  scratchSound(0);
}
ui.record.addEventListener('pointerup', releaseRecord);
ui.record.addEventListener('pointercancel', releaseRecord);
$('#scratchToggle').addEventListener('change', (e) => { setScratch(e.target.checked); if (e.target.checked) audioInit(); });
setScratch(scratchOn);

document.querySelectorAll('#themeSeg button').forEach((btn) =>
  btn.addEventListener('click', () => { store.set('theme', btn.dataset.v); applyTheme(); }));
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

/* ---------- Synchronisation ---------- */
let pollTimer;
function schedule(ms = 2500) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, ms);
}
async function poll() {
  if (document.hidden) return;
  try {
    if (!dragging && !seekingUI) { S = await player.refresh(); renderMeta(); }
  } catch (e) { handleError(e); return; }
  schedule(player.kind === 'demo' ? 500 : 2500);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { schedule(50); keepAwake(); } });

/* Écran allumé pendant l'écoute */
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => (wakeLock = null)); } } catch {}
}

/* ---------- Réglages ---------- */
const dlg = $('#settings');
$('#redirectUri').textContent = REDIRECT_URI;
$('#clientId').value = store.get('clientId') || '';

function renderSettings() {
  const connected = player.kind === 'spotify';
  $('#connectedGroup').hidden = !connected;
  $('#loginGroup').hidden = connected;
  if (connected) renderDevices();
}
async function renderDevices() {
  const box = $('#devices');
  try {
    const devs = await player.listDevices();
    box.innerHTML = devs.length ? '' : '<p class="hint">Aucun appareil. Ouvre Spotify sur ton iPhone ou iPad.</p>';
    for (const d of devs) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'device' + (d.is_active ? ' active' : '');
      b.innerHTML = `<span>${escapeHtml(d.name)}</span><small>${escapeHtml(d.type)}</small>`;
      b.addEventListener('click', () => act(null, () => player.transfer(d.id, true), 900).then(renderDevices));
      box.appendChild(b);
    }
  } catch (e) { box.innerHTML = `<p class="hint">${escapeHtml(e.message)}</p>`; }
}
function openSettings() { renderSettings(); dlg.showModal(); }
$('#settingsBtn').addEventListener('click', openSettings);
document.addEventListener('click', (e) => { if (e.target.closest('[data-open-settings]')) { e.preventDefault(); openSettings(); } });
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
$('#refreshDevices').addEventListener('click', renderDevices);
$('#copyUri').addEventListener('click', async (e) => {
  try { await navigator.clipboard.writeText(REDIRECT_URI); e.target.textContent = 'Copié'; } catch { e.target.textContent = 'Sélectionne'; }
});
$('#loginBtn').addEventListener('click', () => {
  const id = $('#clientId').value.trim();
  if (!/^[0-9a-f]{32}$/i.test(id)) { $('#clientId').focus(); $('#clientId').style.borderColor = '#e5484d'; return; }
  login(id).catch((e) => setStatus(escapeHtml(e.message)));
});
$('#logoutBtn').addEventListener('click', () => {
  store.del('token'); player = new DemoPlayer(); S = player.state; lastTrackId = undefined; dlg.close(); renderMeta(); schedule(50);
});

/* ---------- Démarrage ---------- */
(async function init() {
  try {
    await handleCallback();
    if (store.get('token') && player.kind !== 'spotify') player = new SpotifyPlayer();
  } catch (e) { setStatus(escapeHtml(e.message)); }
  if (player.kind === 'demo') S = await player.refresh();
  renderMeta();
  requestAnimationFrame(frame);
  schedule(50);
  document.addEventListener('pointerdown', keepAwake, { once: true });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
