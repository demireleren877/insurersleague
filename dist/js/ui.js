import { esc } from './format.js';
import { t } from './i18n.js';

const PATHS = {
  grid: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  book: 'M4 5h6l2 2 2-2h6v14h-6l-2 2-2-2H4z M12 7v14',
  sliders: 'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 4v6 M9 14v6',
  lock: 'M6 11h12v10H6z M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  unlock: 'M6 11h12v10H6z M8.5 11V7.5a3.5 3.5 0 0 1 6.8-1.2',
  chart: 'M4 4v16h16 M8 15l4-5 3 3 5-7',
  cup: 'M8 4h8v7a4 4 0 0 1-8 0z M8 6H4.5v2a3.5 3.5 0 0 0 3.5 3.5 M16 6h3.5v2a3.5 3.5 0 0 1-3.5 3.5 M12 15v4 M8 21h8',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  back: 'M20 12H4 M10 6l-6 6 6 6',
  chevron: 'M9 5l7 7-7 7',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7',
  clock: 'M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  play: 'M8 5l11 7-11 7z',
  pause: 'M8 5v14 M16 5v14',
  next: 'M6 5l9 7-9 7z M18 5v14',
  expand: 'M9 4H4v5 M15 4h5v5 M4 15v5h5 M20 15v5h-5',
  info: 'M12 11v6 M12 7.5v.5 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  reset: 'M4 12a8 8 0 1 0 2.5-5.8 M4 4v5h5',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-2a7 7 0 0 1 14 0v2 M16 3.5a4 4 0 0 1 0 7.5 M19 14.5a6 6 0 0 1 3 5.5v1',
  bolt: 'M13 2L4 14h7l-1 8 10-12h-7z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9.5C7.5 20 4 17 4 12V6z',
  volume: 'M4 9h4l5-4v14l-5-4H4z M16.5 8.5a5 5 0 0 1 0 7',
  mute: 'M4 9h4l5-4v14l-5-4H4z M17 9.5l5 5 M22 9.5l-5 5',
  x: 'M6 6l12 12 M18 6L6 18',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 16v4h16v-4',
  target: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0 M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0',
  flag: 'M5 21V4 M5 4h13l-3 4.5 3 4.5H5',
  megaphone: 'M3 10v4h3l7 5V5L6 10z M17 9a4 4 0 0 1 0 6 M20 7a7 7 0 0 1 0 10',
  tower: 'M5 20h14 M7 20V10 M12 20V5 M17 20v-7',
  pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z M14.5 9a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0',
  coins: 'M4 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z M4 7v5c0 1.7 3.1 3 7 3 M18 7v3 M13 14c0-1.7 3.1-3 7-3 M13 14v4c0 1.7 3.1 3 7 3 M13 14c0 1.7 3.1 3 7 3M20 11c1.2 0 2 .6 2 1.5V18',
  swords: 'M4 4l9 9 M4 4v4 M4 4h4 M20 4l-9 9 M20 4v4 M20 4h-4 M7 14l3 3 M5 19l3-3 M17 14l-3 3 M19 19l-3-3',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  wifi: 'M5 12.5a10 10 0 0 1 14 0 M8.5 16a5 5 0 0 1 7 0 M12 19.5v.01',
  wifiOff: 'M5 12.5a10 10 0 0 1 4-2.4 M15 10.2a10 10 0 0 1 4 2.3 M8.5 16a5 5 0 0 1 7 0 M12 19.5v.01 M3 3l18 18',
  plus: 'M12 5v14 M5 12h14',
  spark: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5L18 18 M6 18l2.5-2.5 M15.5 8.5L18 6',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11 M11 10V4.5a1.5 1.5 0 0 1 3 0V11 M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.7-2.3L2.5 15a1.5 1.5 0 0 1 2.3-1.9L8 16',
  keyboard: 'M3 7h18v10H3z M7 11h.01 M11 11h.01 M15 11h.01 M8 14h8',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1 M3 4v5h5 M12 7.5V12l3 2',
  scale: 'M12 3v17 M6 20h12 M5 7h14 M5 7l-3 7a3 3 0 0 0 6 0z M19 7l-3 7a3 3 0 0 0 6 0z',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1'
};

export function icon(name, size = 20, cls = '') {
  const paths = (PATHS[name] || PATHS.grid).split(' M').map((d, i) => `<path d="${i ? 'M' : ''}${d}"/>`).join('');
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export const EMBLEMS = [
  { name: 'Summit arrow', nameTr: 'Zirve oku', path: 'M6 29L18 5l12 24h-7.5L18 19l-4.5 10z' },
  { name: 'Compass star', nameTr: 'Pusula yıldızı', path: 'M18 3l4 11 11 4-11 4-4 11-4-11-11-4 11-4z' },
  { name: 'Nova', nameTr: 'Nova', path: 'M18 3l4.2 9.6 10.3 1-7.8 7 2.3 10.4L18 25.7l-9 5.3 2.3-10.4-7.8-7 10.3-1z' },
  { name: 'Shield', nameTr: 'Kalkan', path: 'M18 3l13 5v9.5C31 25.5 24.5 31 18 33 11.5 31 5 25.5 5 17.5V8z' },
  { name: 'Wave', nameTr: 'Dalga', path: 'M3 13q7.5-8 15 0t15 0v6q-7.5 8-15 0t-15 0z M3 25q7.5-6 15 0t15 0v4q-7.5 6-15 0t-15 0z' },
  { name: 'Peaks', nameTr: 'Dağlar', path: 'M2 30l11-21 6.5 11.5L24 13l10 17z' },
  { name: 'Bolt', nameTr: 'Şimşek', path: 'M21 2 7 20h9l-3 14 16-20h-9l3-12z' },
  { name: 'Crown', nameTr: 'Taç', path: 'M4 29 5.5 9l7.5 7.5L18 5l5 11.5L30.5 9 32 29z' },
  { name: 'Hexagon', nameTr: 'Altıgen', path: 'M18 3l13 7.5v15L18 33 5 25.5v-15z' },
  { name: 'Diamond', nameTr: 'Elmas', path: 'M9 5h18l7 9.5L18 33 2 14.5z' },
  { name: 'Crescent', nameTr: 'Hilal', path: 'M23 3a15 15 0 1 0 10 24A13 13 0 0 1 23 3z' },
  { name: 'Tower', nameTr: 'Kule', path: 'M7 33V14l4-3V4h4.5v5h5V4H25v7l4 3v19h-8v-8h-6v8z' }
];
export const emblemName = i => t(EMBLEMS[i]?.name ?? '', EMBLEMS[i]?.nameTr ?? '');

export function emblem(team, size = 'md') {
  const shape = EMBLEMS[team.emblem ?? 0] || EMBLEMS[0];
  return `<span class="emblem emblem-${size}" style="--team:${team.color}" aria-hidden="true"><svg viewBox="0 0 36 36"><path d="${shape.path}"/></svg></span>`;
}

export function button(label, action, cls = 'ghost', attrs = '') {
  return `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
}

export const teamName = (teams, id) => esc(teams.find(t => t.id === id)?.name ?? '');
export const byId = (teams, id) => teams.find(t => t.id === id);

// Qualitative pip indicator: 1–3 filled.
export const pips = (n, label) => `<span class="pips" aria-label="${label}: ${n}/3">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;

// QR code (vendor/qrcode.js, MIT). Returns SVG; empty if the library hasn't loaded.
export function qrSvg(text, { size = 240, dark = '#0E0F12', light = '#FFFFFF' } = {}) {
  const lib = globalThis.qrcode;
  if (!lib) return '';
  const qr = lib(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), pad = 2, cells = n + pad * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${cells} ${cells}" width="${size}" height="${size}" role="img" aria-label="${t('QR code to join', 'Katılım QR kodu')}" shape-rendering="crispEdges"><rect width="${cells}" height="${cells}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

export const joinUrl = pin => `${location.origin}/#/join?pin=${pin}`;
export const joinHost = () => `${location.host}`;
export const letter = (i, color) => `<span class="ans-letter" style="--c:${color}">${'ABCD'[i]}</span>`;
