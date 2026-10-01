// Past sessions: every finished season on this device's history code, what won in each line of
// business, and a side-by-side comparison of the groups the moderator picks.
import { savedHost } from '../store.js';
import { icon, emblem } from '../ui.js';
import { esc, fmt, money, pct } from '../format.js';
import { presetName, PRESET_IDS, levelName } from '../../engine.js';
import { ARCHETYPES } from '../narrative.js';
import { historyCode, cachedSessions, fetchSessions } from '../history.js';
import { hostPage } from './host.js';
import { t, getLang, locale } from '../i18n.js';

export const historyState = { status: 'idle', sessions: null, selected: new Set(), error: '', codeDraft: '' };

export async function loadHistory(onChange) {
  const h = historyState;
  if (!h.sessions) h.sessions = cachedSessions();
  h.status = 'loading'; h.error = ''; onChange();
  try { h.sessions = await fetchSessions(); h.status = 'ready'; }
  catch { h.status = 'error'; h.error = t('Couldn’t reach the server; showing the copy saved on this device.', 'Sunucuya ulaşılamadı; bu cihazda kayıtlı kopya gösteriliyor.'); }
  for (const id of [...h.selected]) if (!h.sessions.some(x => x.id === id)) h.selected.delete(id);
  onChange();
}

const styleName = key => ARCHETYPES[key]?.name ?? '—';
const dateOf = at => new Date(at).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
const winnerOf = x => x.teams.find(r => r.rank === 1 && r.eligible) || null;
const groupName = x => x.label || t(`Game ${x.code}`, `Oyun ${x.code}`);
const mainFocus = st => { const i = st.channelFocus.indexOf(Math.max(...st.channelFocus)); return `${levelName('channel', i, getLang())} ${st.channelFocus[i]}%`; };
const pricedFor = r => (Number.isFinite(r.priced) ? pct(r.priced, 0) : '—');

// Winning approaches per line of business, with the average finishing rank of each approach.
function whatWins(sessions) {
  const blocks = PRESET_IDS.map(preset => {
    const list = sessions.filter(x => x.preset === preset);
    if (!list.length) return '';
    const styles = {};
    for (const x of list) for (const r of x.teams) {
      const st = styles[r.style] ??= { wins: 0, ranks: 0, teams: 0 };
      st.teams++; st.ranks += r.rank;
      if (winnerOf(x) === r) st.wins++;
    }
    const rows = Object.entries(styles).sort((a, b) => b[1].wins - a[1].wins || a[1].ranks / a[1].teams - b[1].ranks / b[1].teams);
    const most = Math.max(1, ...rows.map(([, v]) => v.wins));
    return `<article class="hs-wins panel">
      <header><h3 class="display">${esc(presetName(preset, getLang()))}</h3><span class="chip">${t(`${list.length} session${list.length === 1 ? '' : 's'}`, `${list.length} oturum`)}</span></header>
      <ol>${rows.map(([key, v]) => `<li>
        <span class="hs-style"><b>${styleName(key)}</b><small>${t(`${v.teams} team${v.teams === 1 ? '' : 's'} · avg. rank ${fmt(v.ranks / v.teams, 1)}`, `${v.teams} takım · ort. sıra ${fmt(v.ranks / v.teams, 1)}`)}</small></span>
        <span class="hs-count num">${v.wins}<small>${t(v.wins === 1 ? 'win' : 'wins', 'galibiyet')}</small></span>
        <i class="hs-bar"><b style="width:${v.wins ? Math.max(6, v.wins / most * 100) : 0}%"></b></i>
      </li>`).join('')}</ol>
    </article>`;
  }).join('');
  return `<section class="hs-block">
    <header class="hs-block-head"><div><h2 class="display">${t('What won', 'Ne kazandı')}</h2><p class="muted">${t('Each team is sorted into an approach from its final plan: price level, how closely its coefficients follow the data, budget split and channel focus.', 'Her takım son planına göre bir yaklaşıma yerleşir: fiyat seviyesi, katsayılarının veriye ne kadar uyduğu, bütçe dağılımı ve kanal odağı.')}</p></div></header>
    <div class="hs-wins-grid">${blocks}</div>
  </section>`;
}

function compareTable(list) {
  const cell = fn => list.map(x => `<td>${fn(x)}</td>`).join('');
  const w = x => winnerOf(x);
  const avg = (x, fn) => x.teams.reduce((a, r) => a + fn(r), 0) / x.teams.length;
  const common = x => {
    const n = {}; x.teams.forEach(r => { n[r.style] = (n[r.style] || 0) + 1; });
    const [key, count] = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
    return `${styleName(key)} <small class="faint">×${count}</small>`;
  };
  const rows = [
    [t('Line of business', 'Branş'), x => esc(presetName(x.preset, getLang()))],
    [t('Date', 'Tarih'), x => dateOf(x.at)],
    [t('Teams', 'Takım'), x => x.teams.length],
    [t('Champion', 'Şampiyon'), x => (w(x) ? `<span class="hs-team">${emblem(w(x), 'xs')}<b>${esc(w(x).name)}</b></span>` : `<span class="faint">${t('None', 'Yok')}</span>`)],
    [t('Winning approach', 'Kazanan yaklaşım'), x => (w(x) ? `<b>${styleName(w(x).style)}</b>` : '—')],
    [t('Champion’s score', 'Şampiyonun puanı'), x => (w(x) ? `<span class="num">${fmt(w(x).score, 1)}</span>` : '—')],
    [t('Lead over 2nd', '2.’ye fark'), x => { const [a, b] = x.teams; return a && b ? `<span class="num">${fmt(a.score - b.score, 1)}</span>` : '—'; }],
    [t('Champion’s base premium · priced for', 'Şampiyonun baz primi · hedef HO'), x => { const r = w(x); return r ? `<span class="num">€${fmt(r.strategy.basePremium, 2)} · ${pricedFor(r)}</span>` : '—'; }],
    [t('Champion’s marketing / claims ops', 'Şampiyonun pazarlama / hasar op.'), x => (w(x) ? `<span class="num">${money(w(x).strategy.marketing)} / ${money(w(x).strategy.claimsOps)}</span>` : '—')],
    [t('Field’s average loss ratio', 'Sahanın ortalama hasar oranı'), x => (x.teams.every(r => Number.isFinite(r.lossRatio)) ? `<span class="num">${pct(avg(x, r => r.lossRatio), 0)}</span>` : '—')],
    [t('Most common approach', 'En yaygın yaklaşım'), common],
    ...(list.some(x => x.teams.some(r => !r.eligible)) ? [[t('Capital breaches', 'Sermaye ihlali'), x => { const n = x.teams.filter(r => !r.eligible).length; return `<span class="num ${n ? 'down' : ''}">${n}</span>`; }]] : [])
  ];
  return `<section class="hs-block panel hs-compare" aria-labelledby="hs-compare-title">
    <header class="hs-block-head"><h2 class="display" id="hs-compare-title">${t('Side by side', 'Yan yana')}</h2><button class="btn ghost sm" data-action="history-clear">${icon('x', 14)} ${t('Clear selection', 'Seçimi temizle')}</button></header>
    <div class="table-wrap"><table>
      <thead><tr><th></th>${list.map(x => `<th scope="col">${esc(groupName(x))}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([label, fn]) => `<tr><th scope="row">${label}</th>${cell(fn)}</tr>`).join('')}</tbody>
    </table></div>
  </section>`;
}

function standings(x) {
  return `<div class="table-wrap"><table class="hs-table">
    <thead><tr><th>${t('Rank', 'Sıra')}</th><th>${t('Team', 'Takım')}</th><th>${t('Score', 'Puan')}</th><th>${t('Approach', 'Yaklaşım')}</th><th>${t('Base premium', 'Baz prim')}</th><th>${t('Priced for LR', 'Hedef HO')}</th><th>${t('LR it got', 'Gerçekleşen HO')}</th><th>${t('Marketing', 'Pazarlama')}</th><th>${t('Main focus', 'Ana odak')}</th><th>${t('Claims ops', 'Hasar op.')}</th><th>${t('Reinsurance', 'Reasürans')}</th><th>${t('Profit', 'Kâr')}</th><th>${t('Share', 'Pay')}</th></tr></thead>
    <tbody>${x.teams.map(r => { const st = r.strategy; return `<tr class="${r.eligible ? '' : 'out'}">
      <td class="num rank">${r.rank}</td>
      <td><span class="hs-team">${emblem(r, 'xs')}<b>${esc(r.name)}</b>${r.ai ? ' <em class="ai-tag">JEV AI</em>' : ''}</span></td>
      <td class="num strong">${fmt(r.score, 1)}</td>
      <td>${styleName(r.style)}${r.changes ? ` <small class="faint">${t(`${r.changes} revision${r.changes === 1 ? '' : 's'}`, `${r.changes} revizyon`)}</small>` : ''}</td>
      <td class="num">${st.basePremium !== undefined ? `€${fmt(st.basePremium, 2)}` : '—'}</td>
      <td class="num">${pricedFor(r)}</td>
      <td class="num">${Number.isFinite(r.lossRatio) ? pct(r.lossRatio, 0) : '—'}</td>
      <td class="num">${money(st.marketing ?? 0)}</td>
      <td>${Array.isArray(st.channelFocus) ? esc(mainFocus(st)) : '—'}</td>
      <td class="num">${money(st.claimsOps ?? 0)}</td>
      <td>${st.reinsurance ? t('Yes', 'Evet') : t('No', 'Hayır')}</td>
      <td class="num ${r.profit < 0 ? 'down' : ''}">${money(r.profit)}</td><td class="num">${pct(r.share)}</td>
    </tr>`; }).join('')}</tbody>
  </table></div>`;
}

function sessionCard(x, selected) {
  const w = winnerOf(x), podium = x.teams.filter(r => r.eligible).slice(1, 3);
  return `<article class="hs-item panel ${selected ? 'on' : ''}">
    <header class="hs-item-head">
      <label class="hs-pick"><input type="checkbox" data-history-pick="${esc(x.id)}" ${selected ? 'checked' : ''}> ${t('Compare', 'Karşılaştır')}</label>
      <span class="hs-meta">${dateOf(x.at)} · ${esc(presetName(x.preset, getLang()))} · PIN ${esc(x.code)} · ${t(`${x.teams.length} teams`, `${x.teams.length} takım`)}</span>
      <button class="icon-btn hs-delete" data-action="history-delete" data-id="${esc(x.id)}" aria-label="${t('Delete this session', 'Bu oturumu sil')}" title="${t('Delete this session', 'Bu oturumu sil')}">${icon('trash', 16)}</button>
    </header>
    <label class="hs-label"><span>${t('Group name', 'Grup adı')}</span><input class="input" id="hs-label-${esc(x.id)}" data-history-label="${esc(x.id)}" maxlength="60" value="${esc(x.label || '')}" placeholder="${t('e.g. Sales team, March', 'ör. Satış ekibi, Mart')}"></label>
    <div class="hs-result">
      ${w ? `<div class="hs-champ" style="--team:${w.color}">${emblem(w, 'lg')}<div><small>${t('Champion', 'Şampiyon')}</small><strong class="display">${esc(w.name)}</strong><span>${styleName(w.style)} · <b class="num">${fmt(w.score, 1)}</b></span></div></div>`
        : `<p class="muted">${t('No team met the capital rule; no champion.', 'Sermaye kuralını sağlayan takım yok; şampiyon yok.')}</p>`}
      ${podium.length ? `<ol class="hs-podium" start="2">${podium.map(r => `<li><span class="hs-team">${emblem(r, 'xs')}<b>${esc(r.name)}</b></span><small>${styleName(r.style)} · ${fmt(r.score, 1)}</small></li>`).join('')}</ol>` : ''}
    </div>
    <details class="hs-details"><summary>${icon('chevron', 15)} ${t('Full standings and decisions', 'Tam sıralama ve kararlar')}</summary>${standings(x)}</details>
  </article>`;
}

export function historyPage() {
  const h = historyState, sessions = h.sessions ?? cachedSessions(), host = savedHost();
  const picked = sessions.filter(x => h.selected.has(x.id));
  const loading = h.status === 'loading' && !sessions.length;
  const body = loading
    ? `<section class="empty panel">${icon('history', 48)}<h2 class="display">${t('Loading…', 'Yükleniyor…')}</h2></section>`
    : !sessions.length
      ? `<section class="empty panel">${icon('history', 56)}<h2 class="display">${t('No finished seasons yet', 'Henüz biten sezon yok')}</h2><p>${t('When all twelve months of a season are complete, its results land here on their own. Keep the stage or results page open until the finale.', 'Bir sezonun on iki ayı tamamlandığında sonuçları buraya kendiliğinden gelir. Sahne veya sonuçlar sayfasını finale kadar açık tut.')}</p>${host ? `<a class="btn go" href="#/stage">${t('Back to your game', 'Oyununa dön')} ${icon('arrow', 16)}</a>` : ''}</section>`
      : `${whatWins(sessions)}
        ${picked.length >= 2 ? compareTable(picked) : `<p class="hs-hint">${icon('info', 16)} ${t('Tick “Compare” on two or more sessions to set them side by side.', 'Yan yana görmek için iki veya daha fazla oturumda “Karşılaştır”ı işaretle.')}</p>`}
        <section class="hs-block"><header class="hs-block-head"><h2 class="display">${t('All sessions', 'Tüm oturumlar')}</h2><span class="faint small">${t('Newest first', 'En yeni önce')}</span></header>
          <div class="hs-list">${sessions.map(x => sessionCard(x, h.selected.has(x.id))).join('')}</div></section>`;
  const content = `
    <div class="page-head"><div><p class="kicker blue">${t('Moderator', 'Moderatör')}</p><h1 class="display">${t('Past sessions', 'Geçmiş oturumlar')}</h1>
      <p class="lead">${t('Every finished season is filed here automatically. Compare what won with each group.', 'Biten her sezon buraya kendiliğinden kaydedilir. Her grupta neyin kazandığını karşılaştır.')}</p></div></div>
    ${h.error ? `<p class="note" role="status">${icon('info', 16)} ${esc(h.error)}</p>` : ''}
    ${body}
    <section class="hs-code panel" aria-labelledby="hs-code-title">
      <div><h2 class="display" id="hs-code-title">${t('History code', 'Geçmiş kodu')}</h2>
        <p class="muted">${t('This device files sessions under a private code. Enter the same code on another device to see this history there.', 'Bu cihaz oturumları özel bir kodla kaydeder. Aynı kodu başka bir cihaza girersen bu geçmişi orada da görürsün.')}</p></div>
      <div class="hs-code-row"><code class="num">${esc(historyCode())}</code><button class="btn ghost sm" data-action="history-copy">${icon('copy', 14)} ${t('Copy', 'Kopyala')}</button></div>
      <form class="hs-code-row" data-form="history-code"><label class="sr-only" for="hs-code-input">${t('History code from another device', 'Başka bir cihazın geçmiş kodu')}</label>
        <input class="input" id="hs-code-input" autocomplete="off" spellcheck="false" placeholder="${t('Code from another device', 'Başka cihazın kodu')}" value="${esc(h.codeDraft)}" data-history-code>
        <button class="btn sm" type="submit">${t('Use this code', 'Bu kodu kullan')}</button></form>
    </section>`;
  return hostPage('history', content, `<button class="btn ghost sm" data-action="history-refresh" ${h.status === 'loading' ? 'disabled' : ''}>${icon('reset', 14)} ${h.status === 'loading' ? t('Refreshing…', 'Yenileniyor…') : t('Refresh', 'Yenile')}</button>`);
}
