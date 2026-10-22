const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: k => { try { localStorage.removeItem(k); } catch {} },
};

// Saat farkı: telefonlar büyük ekranın saatine göre geri sayar
let clockOffset = 0;
const syncClock = s => { clockOffset = s.now - Date.now(); };
const serverNow = () => Date.now() + clockOffset;
const remainingMs = until => Math.max(0, until - serverNow());

let toastTimer;
function toast(msg) {
  if (!msg) return;
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
}

// Yeni olay geldi mi? (ilk yüklemede eski olayı tekrar oynatma)
let lastSeq = null;
function newEvent(s) {
  const seq = s.event ? s.event.seq : 0;
  if (lastSeq === null || seq < lastSeq) { lastSeq = seq; return null; }
  if (seq === lastSeq) return null;
  lastSeq = seq;
  return s.event;
}

const FLASH = { ok: 'DOĞRU!<br>+1', taboo: 'TABU!<br>−1', pass: 'PAS!', timeup: 'SÜRE<br>BİTTİ!', start: 'BAŞLA!' };
function flash(type, html) {
  const el = document.createElement('div');
  el.className = 'flash';
  el.innerHTML = `<div class="burst ${type}">${html || FLASH[type] || ''}</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

// Retro bip sesleri
let audio;
function tone(freqs, dur = 0.12, wave = 'square', vol = 0.12) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    let t = audio.currentTime;
    for (const f of freqs) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = wave; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(audio.destination);
      o.start(t); o.stop(t + dur);
      t += dur * 0.85;
    }
  } catch {}
}
const SFX = {
  ok: () => tone([660, 880, 1320], 0.1),
  taboo: () => tone([150, 110], 0.35, 'sawtooth', 0.18),
  pass: () => tone([440, 330], 0.1, 'triangle'),
  timeup: () => tone([880, 660, 440, 220], 0.18),
  start: () => tone([523, 659, 784, 1046], 0.09),
  question: () => tone([392, 523, 784], 0.08, 'triangle', 0.14),
  reveal: () => tone([523, 659, 784, 1046, 1318], 0.07, 'square', 0.1),
  win: () => tone([523, 523, 784, 659, 1046], 0.16, 'square', 0.12),
  tick: () => tone([1200], 0.05, 'square', 0.06),
};
const unlockAudio = () => tone([1], 0.01, 'sine', 0.0001);

// ───────── Magazin figürleri ─────────
// Alttaki afişteki (img/figurler.png) karakterler, soldan sağa
const SPRITES = ['Tarkan', 'Mustafa Sandal', 'Seda Sayan', 'Mahsun Kırmızıgül', 'Zeki Müren', 'Ajda Pekkan',
  'Sezen Aksu', 'Emel Sayın', 'İbrahim Tatlıses', 'Bülent Ersoy', 'Yonca Evcimik', 'Harun Kolçak'];

function hash(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

// Afişte olmayan ünlüler için isimden türetilen retro karikatür portre
function avatarSvg(name) {
  const h = hash(name);
  const pick = (arr, shift) => arr[(h >>> shift) % arr.length];
  const bg = pick(['#ff3ea5', '#22b5ff', '#7b3fe4', '#18c47a', '#ff8a00', '#ffe14d'], 0);
  const skin = pick(['#f6d2b4', '#e8b48f', '#c98e66', '#a86f4c'], 3);
  const hair = pick(['#141014', '#5a341f', '#f2c14e', '#b8321f', '#ff3ea5', '#8a8a8a'], 6);
  const shirt = pick(['#141014', '#ffffff', '#ff3ea5', '#22b5ff', '#ffe14d', '#7b3fe4'], 9);
  const style = (h >>> 12) % 4;
  const shades = (h >>> 15) % 3 === 0;
  const earrings = (h >>> 17) % 2 === 0;
  const ink = 'stroke="#141014" stroke-width="3" stroke-linejoin="round"';
  const back = style === 1 ? `<rect x="24" y="30" width="52" height="56" rx="22" fill="${hair}" ${ink}/>` : '';
  const top = [
    [[32, 32], [42, 24], [54, 23], [66, 28], [72, 40], [28, 44]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="${hair}" ${ink}/>`).join(''),
    `<path d="M29 46 Q29 20 50 20 Q71 20 71 46 L63 34 L37 34 Z" fill="${hair}" ${ink}/>`,
    `<path d="M29 42 L33 24 L41 32 L47 18 L54 30 L62 20 L66 33 L71 42 Q50 30 29 42 Z" fill="${hair}" ${ink}/>`,
    `<circle cx="50" cy="16" r="10" fill="${hair}" ${ink}/><path d="M29 44 Q31 24 50 24 Q69 24 71 44 Q50 32 29 44 Z" fill="${hair}" ${ink}/>`,
  ][style];
  const eyes = shades
    ? `<rect x="35" y="44" width="13" height="8" rx="3" fill="#141014"/><rect x="52" y="44" width="13" height="8" rx="3" fill="#141014"/><path d="M48 47 H52" stroke="#141014" stroke-width="3"/>`
    : `<circle cx="42" cy="48" r="3" fill="#141014"/><circle cx="58" cy="48" r="3" fill="#141014"/>`;
  const ears = earrings ? `<circle cx="30" cy="58" r="3.5" fill="#ffd23f" ${ink.replace('3"', '2"')}/><circle cx="70" cy="58" r="3.5" fill="#ffd23f" ${ink.replace('3"', '2"')}/>` : '';
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="100" height="100" fill="${bg}"/>
    <circle cx="50" cy="50" r="40" fill="rgba(255,255,255,.18)"/>
    ${back}
    <path d="M14 100 Q50 66 86 100 Z" fill="${shirt}" ${ink}/>
    <ellipse cx="50" cy="50" rx="20" ry="24" fill="${skin}" ${ink}/>
    ${top}${eyes}${ears}
    <path d="M43 61 Q50 67 57 61" fill="none" stroke="#c2185b" stroke-width="3.5" stroke-linecap="round"/>
  </svg>`;
}

// Soru ekranındaki figür kartı
function figureHtml(name) {
  if (!name) return '';
  const i = SPRITES.indexOf(name);
  const art = i >= 0
    ? `<div class="fig-sprite" style="background-position:${(i / (SPRITES.length - 1)) * 100}% 0"></div>`
    : `<div class="fig-avatar">${avatarSvg(name)}</div>`;
  return `<div class="figure">${art}<div class="fig-name">${esc(name)}</div></div>`;
}


const mysteryFigureHtml = () =>
  '<div class="figure"><div class="fig-avatar fig-mystery">?</div><div class="fig-name">GİZEMLİ ÜNLÜ</div></div>';

const OPTION_STYLE = [
  { cls: 'opt0', shape: '▲' },
  { cls: 'opt1', shape: '◆' },
  { cls: 'opt2', shape: '●' },
  { cls: 'opt3', shape: '■' },
];
const fmtSec = ms => (ms / 1000).toFixed(1).replace('.', ',') + ' sn';
const LOG_ICON = { ok: '✓', taboo: '✗', pass: '↷', time: '⏱' };
