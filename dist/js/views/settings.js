// Moderator settings: the side panel opened on stage.
import { getState, teamStatus, raceStarted } from '../store.js';
import { icon, emblem, qrSvg, joinUrl } from '../ui.js';
import { esc } from '../format.js';
import { rulesOf } from '../../engine.js';
import { getLang, t } from '../i18n.js';
import { aiProfileName } from '../jev.js';
import { SECTIONS } from './rules.js';

export function settingsPanel() {
  const s = getState(), active = raceStarted();
  const R = rulesOf(s.config), changed = SECTIONS.reduce((n, x) => n + x.changes(s, R), 0);
  const url = joinUrl(s.code);
  return {
    title: t('Game settings', 'Oyun ayarları'),
    body: `
    <section class="set-block">
      <header><h3>${icon('users', 16)} ${t('Game', 'Oyun')}</h3><span class="faint small">PIN ${esc(s.code)}</span></header>
      ${s.inputMode === 'excel'
        ? `<p class="set-note">${icon('file', 15)} ${t('Teams hand in their plans as workbooks on their lobby cards; no participant device joins.', 'Takımlar planlarını lobideki kartlarına dosya olarak teslim eder; katılımcı cihazı bağlanmaz.')}</p>`
        : `<div class="set-join">${qrSvg(url, { size: 112 })}<div><b class="num">${esc(s.code.replace(/(\d{3})(\d{3})/, '$1 $2'))}</b><a href="${esc(url)}" target="_blank" rel="noopener" translate="no">${esc(url.replace(/^https?:\/\//, ''))}</a></div></div>`}
      <ul class="set-teams">${s.teams.length ? s.teams.map(t2 => { const st = teamStatus(t2); return `<li style="--team:${t2.color}">${emblem(t2, 'xs')}<span><b>${esc(t2.name)} ${t2.ai ? '<em class="ai-tag">JEV AI</em>' : ''}</b><small class="st-${st.id}">${st.label}${t2.ai ? ` · ${esc(aiProfileName(t2.ai.profile, getLang()))}` : ''}</small></span>
        ${s.inputMode !== 'excel' && !active && t2.locked && !t2.ai ? `<button class="btn ghost sm" data-action="revision" data-team="${t2.id}">${icon('unlock', 13)} ${t('Unlock', 'Kilidi aç')}</button>` : ''}
        ${!active ? `<button class="icon-btn sm" data-action="remove-team" data-team="${t2.id}" aria-label="${t(`Remove ${esc(t2.name)}`, `${esc(t2.name)} takımını çıkar`)}" title="${t('Remove team', 'Takımı çıkar')}">${icon('x', 14)}</button>` : ''}</li>`; }).join('') : `<li class="faint">${t('No teams yet.', 'Henüz takım yok.')}</li>`}</ul>
      <div class="set-ai">
        <div><b>${icon('bolt', 15)} ${t('Jev AI rival', 'Jev AI rakibi')}</b><small>${t('Jev chooses a complete strategy from legal options. The simulation engine still calculates every financial result.', 'Jev geçerli seçeneklerden tam bir strateji seçer. Tüm finansal sonuçları yine simülasyon motoru hesaplar.')}</small></div>
        <button class="btn gold sm" data-action="add-ai-team" ${active || s.teams.length >= 12 ? 'disabled' : ''}>${icon('plus', 14)} ${t('Add AI team', 'AI takım ekle')}</button>
      </div>
    </section>

    <a class="set-rules" href="#/rules" data-action="close-modal-nav">
      <span class="set-rules-icon">${icon('sliders', 22)}</span>
      <span><b>${t('Rule studio', 'Kural stüdyosu')}</b><small>${active ? t('The race is running; review the rules.', 'Yarış sürüyor; kuralları incele.') : t('Scoring, market size, claims model, segment coefficients and events.', 'Puanlama, pazar büyüklüğü, hasar modeli, segment katsayıları ve olaylar.')}</small></span>
      <em class="chip ${changed ? 'warn' : 'ok'}">${changed ? t(`${changed} change${changed === 1 ? '' : 's'}`, `${changed} değişiklik`) : t('Default', 'Varsayılan')}</em>
      ${icon('chevron', 18)}
    </a>

    <section class="set-block">
      <header><h3>${icon('clock', 16)} ${t('Live broadcast', 'Canlı akış')}</h3><span class="faint small">${t('Can also change during the race', 'Yarış sırasında da değiştirilebilir')}</span></header>
      <div class="set-grid">
        <label class="field"><span>${t('Time per month', 'Ay başına süre')}</span><select class="select" data-config="speed">${[3, 4, 6, 8, 12].map(n => `<option value="${n}" ${s.config.speed === n ? 'selected' : ''}>${t(`${n} seconds`, `${n} saniye`)}</option>`).join('')}</select></label>
      </div>
      <label class="toggle-row"><input type="checkbox" data-setting="sound" ${s.sound ? 'checked' : ''}><span><b>${t('Broadcast sounds', 'Yayın sesleri')}</b><small>${t('Month transitions, overtakes and leader sounds.', 'Ay geçişi, sollama ve lider sesleri.')}</small></span></label>
      <label class="toggle-row"><input type="checkbox" data-setting="reduce" ${s.reduce ? 'checked' : ''}><span><b>${t('Reduce animations', 'Animasyonları azalt')}</b><small>${t('Results are shown instantly.', 'Sonuçlar anında gösterilir.')}</small></span></label>
    </section>

    <details class="set-block set-tools">
      <summary><span><b>${icon('sliders', 16)} ${t('Session tools', 'Oturum araçları')}</b><small>${t('Export, replay and game management', 'Dışa aktarma, tekrar oynatma ve oyun yönetimi')}</small></span>${icon('chevron', 16)}</summary>
      <div class="set-actions">
        <button class="btn ghost sm" data-action="audit-workbook">${icon('sliders', 14)} ${t('Calculation workbook (.xlsx)', 'Hesap dosyası (.xlsx)')}</button>
        <button class="btn ghost sm" data-action="export">${icon('file', 14)} ${t('Download session', 'Oturumu indir')}</button>
        ${active ? `<button class="btn ghost sm" data-action="replay">${icon('reset', 14)} ${t('Replay the race from the start', 'Yarışı baştan izlet')}</button>` : ''}
        <button class="btn ghost sm" data-action="new-game">${icon('reset', 14)} ${t('New game, same teams', 'Aynı takımlarla yeni oyun')}</button>
      </div>
      <button class="btn danger sm set-close" data-action="close-room">${icon('x', 14)} ${t('Close the game', 'Oyunu kapat')}</button>
    </details>`
  };
}
