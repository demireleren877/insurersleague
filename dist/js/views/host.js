// Shared shell for the moderator's off-stage pages.
import { getState, getSession, seasonDone, raceStarted } from '../store.js';
import { icon } from '../ui.js';
import { esc } from '../format.js';
import { t, languageControl } from '../i18n.js';

export function hostPage(active, content, actions = '') {
  const s = getState(), role = getSession().role, inRoom = role === 'host' || role === 'stage';
  // Session history needs no open room: outside one, the bar leads back home instead.
  const tabs = inRoom ? [
    ['stage', t('Stage', 'Sahne'), 'tower'],
    ['rules', t('Rule studio', 'Kural stüdyosu'), 'sliders'],
    ...(seasonDone() ? [['results', t('Results', 'Sonuçlar'), 'chart']] : []),
    ...(role === 'host' ? [['history', t('Past sessions', 'Geçmiş oturumlar'), 'history']] : [])
  ] : [
    ['', t('Home', 'Ana sayfa'), 'back'],
    ['history', t('Past sessions', 'Geçmiş oturumlar'), 'history']
  ];
  return `<div class="host-page">
    <header class="host-bar">
      <span class="brand-mark">${icon('bolt', 18)}</span><strong class="display">Insurers<b>League</b></strong>
      ${inRoom ? `<span class="chip">PIN ${esc(s.code)}</span>` : ''}
      <nav class="host-tabs" aria-label="${t('Moderator pages', 'Moderatör sayfaları')}">${tabs.map(([id, label, ic]) => `<a href="#/${id}" class="${active === id ? 'on' : ''}" ${active === id ? 'aria-current="page"' : ''}>${icon(ic, 15)} ${label}</a>`).join('')}</nav>
      <div class="host-bar-actions">${actions}${languageControl(true)}</div>
    </header>
    ${raceStarted() && active === 'rules' ? `<div class="host-banner">${icon('lock', 16)} ${t('The race is running. Rules are locked; to change them, end the game and start "New game, same teams".', 'Yarış sürüyor. Kurallar kilitli; değiştirmek için oyunu bitirip “Aynı takımlarla yeni oyun”u başlat.')}</div>` : ''}
    <main class="host-main ${active === 'rules' ? 'wide' : ''}" id="main">${content}</main>
  </div>`;
}
