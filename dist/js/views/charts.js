import { esc, upper } from '../format.js';
import { monthsOf } from '../../engine.js';
import { t, getLang } from '../i18n.js';

// Hexagonal decision profile (qualitative).
export function radar(values, color, size = 220) {
  const c = size / 2, r = size / 2 - 34, n = values.length;
  const pt = (i, k) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    return [c + Math.cos(a) * r * k, c + Math.sin(a) * r * k];
  };
  const ring = k => values.map((_, i) => pt(i, k).map(v => v.toFixed(1)).join(',')).join(' ');
  const shape = values.map((v, i) => pt(i, v.value / 100).map(x => x.toFixed(1)).join(',')).join(' ');
  return `<svg class="radar" style="--c:${color}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(t('Decision profile', 'Karar profili'))}: ${esc(values.map(v => `${v.label} ${v.value}`).join(', '))}">
    ${[0.33, 0.66, 1].map(k => `<polygon points="${ring(k)}" class="radar-ring"/>`).join('')}
    ${values.map((_, i) => { const [x, y] = pt(i, 1); return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-spoke"/>`; }).join('')}
    <polygon points="${shape}" class="radar-shape"/>
    ${values.map((v, i) => { const [x, y] = pt(i, v.value / 100); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" class="radar-dot"/>`; }).join('')}
    ${values.map((v, i) => { const [x, y] = pt(i, 1.22); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" class="radar-label">${esc(v.label)}</text>`; }).join('')}
  </svg>`;
}

// Bump chart: each team's rank by month.
export function bump(history, teams, { width = 900, height = 300, upTo = 11, highlight = null } = {}) {
  const padL = 40, padR = 70, padT = 18, padB = 30;
  const n = teams.length;
  const x = m => padL + m / 11 * (width - padL - padR);
  const y = r => padT + (r - 1) / (n - 1) * (height - padT - padB);
  const lines = teams.map(t => {
    const pts = history.slice(0, upTo + 1).map((month, m) => [x(m), y(month.find(r => r.id === t.id).rank)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    const dim = highlight !== null && highlight !== t.id;
    return `<g class="bump-line ${dim ? 'dim' : ''}" style="--team:${t.color}">
      <path d="${d}" fill="none" stroke="${t.color}" stroke-width="${highlight === t.id ? 5 : 3}" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${highlight === t.id ? 5 : 3.5}" fill="${t.color}"/>`).join('')}
      <text x="${(last[0] + 12).toFixed(1)}" y="${(last[1] + 5).toFixed(1)}" fill="${t.color}" class="bump-label">${esc(t.code)}</text>
    </g>`;
  }).join('');
  return `<svg class="bump" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t('Rank changes by month', 'Aylara göre sıralama değişimi')}">
    ${Array.from({ length: n }, (_, i) => `<text x="${padL - 14}" y="${y(i + 1) + 5}" text-anchor="end" class="bump-axis">${i + 1}</text><line x1="${padL}" x2="${width - padR}" y1="${y(i + 1)}" y2="${y(i + 1)}" class="bump-grid"/>`).join('')}
    ${monthsOf(getLang()).map((mo, m) => `<text x="${x(m)}" y="${height - 6}" text-anchor="middle" class="bump-axis">${upper(mo.slice(0, 3))}</text>`).join('')}
    ${lines}
  </svg>`;
}

// Single-series sparkline.
export function spark(values, color, { width = 460, height = 120, min = null, max = null, label = '' } = {}) {
  if (!values.length) return '';
  const lo = min ?? Math.min(0, ...values), hi = max ?? Math.max(...values, lo + 1);
  const span = hi - lo || 1;
  const x = i => 16 + i / 11 * (width - 32);
  const y = v => height - 22 - (v - lo) / span * (height - 40);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const zero = lo < 0 && hi > 0 ? `<line x1="16" x2="${width - 16}" y1="${y(0)}" y2="${y(0)}" class="spark-zero"/>` : '';
  return `<svg class="spark" style="--c:${color}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">
    ${zero}
    <polyline points="${x(0)},${height - 22} ${pts} ${x(values.length - 1)},${height - 22}" class="spark-area"/>
    <polyline points="${pts}" class="spark-line"/>
    <circle cx="${x(values.length - 1)}" cy="${y(values[values.length - 1])}" r="5" class="spark-dot"/>
    <text x="16" y="${height - 4}" class="spark-axis">${upper(monthsOf(getLang())[0].slice(0, 3))}</text><text x="${width - 16}" y="${height - 4}" text-anchor="end" class="spark-axis">${upper(monthsOf(getLang())[11].slice(0, 3))}</text>
  </svg>`;
}
