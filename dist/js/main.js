import * as store from './store.js';
import { icon } from './ui.js';
import { clock } from './format.js';
import { getLang, setLang, onLangChange, t } from './i18n.js';
import { defaultRules, assumptionsFor } from '../engine.js';
import { home } from './views/home.js';
import { teamPage } from './views/team.js';
import { prepareBrochure } from './brochure.js';
import { briefingContent } from './views/briefing.js';
import { resultsPage, setResultsCategory } from './views/results.js';
import { settingsPanel } from './views/settings.js';
import { rulesPage, rulesState, rulesPackage, sectionOf } from './views/rules.js';
import { fieldSpec, getPath } from './rules.js';
import { stageMarkup, mountStage } from './views/stage.js?v=54';
import { historyPage, historyState, loadHistory } from './views/history.js';
import { archiveSeason, putSession, deleteSession, useHistoryCode, historyCode, cachedSessions } from './history.js';
import { balanceState, runBalanceTest } from './views/balance.js';
import { buildTemplate, readSheets, readTeamSheet } from './sheet.js?v=54';
import { buildAuditWorkbook } from './audit.js?v=54';

const { getState, getSession, timeLeft, playhead, dispatch, subscribe } = store;

const app = document.getElementById('app');
const ROUTES = {
  home: { view: home, title: () => t('Home', 'Ana Sayfa') },
  stage: { view: null, title: () => t('Stage', 'Sahne') },
  rules: { view: () => rulesPage(hashParam('b')), title: () => t('Rule studio', 'Kural stüdyosu') },
  results: { view: resultsPage, title: () => t('Results', 'Sonuçlar') },
  history: { view: historyPage, title: () => t('Past sessions', 'Geçmiş oturumlar') },
  team: { view: teamPage, title: () => t('My team', 'Takımım') },
  join: { view: teamPage, title: () => t('My team', 'Takımım') }
};

const route = () => { const r = location.hash.replace(/^#\/?/, '').split('?')[0]; return ROUTES[r] ? r : 'home'; };
const hashParam = key => new URLSearchParams(location.hash.split('?')[1] || '').get(key);
const go = (r, query = '') => { const target = `#/${r === 'home' ? '' : r}${query}`; if (location.hash === target) render(); else location.hash = target; window.scrollTo(0, 0); };

let stage = null, renderedRoute = null, renderedHtml = '', modalFn = null, pointerActive = false, pendingRender = false;

// ——— Route ↔ connection ———
function ensureConnection(r) {
  const host = store.savedHost(), sess = getSession();
  if (r === 'stage' || r === 'results' || r === 'rules') {
    const pin = hashParam('pin');
    if (host && (!pin || pin === host.pin)) store.connectHost(host);
    else if (pin) store.connectStage(pin);
    else { go('home'); }
    return;
  }
  if (r === 'history') { loadHistory(render); return; }
  if (r === 'team' || r === 'join') {
    const pin = (hashParam('pin') || '').replace(/\D/g, '');
    if (/^\d{6}$/.test(pin)) store.connectPlayer(pin);
    else if (sess.role !== 'player') store.resumePlayer();
    return;
  }
  if (sess.role !== 'none' && r === 'home') store.disconnect();
}

// ——— Rendering ———
function captureFocus() {
  const el = document.activeElement;
  if (!el || !el.matches('input, select, textarea')) return null;
  if (el.id && el.id !== 'import-file') {
    let sel = null; try { sel = [el.selectionStart, el.selectionEnd]; } catch { /* numeric field */ }
    return { selector: `#${CSS.escape(el.id)}`, sel, inModal: !!el.closest('dialog') };
  }
  const attrs = ['data-index', 'data-config', 'data-assumption', 'data-weight', 'data-event', 'data-prop', 'data-quiz', 'data-setting'].filter(a => el.hasAttribute(a));
  if (!attrs.length) return null;
  const typeAttr = el.getAttribute('type');
  const selector = `${el.tagName.toLowerCase()}${typeAttr ? `[type="${typeAttr}"]` : ''}${attrs.map(a => `[${a}="${el.getAttribute(a)}"]`).join('')}`;
  let sel = null; try { sel = [el.selectionStart, el.selectionEnd]; } catch { /* numeric field */ }
  return { selector, sel, inModal: !!el.closest('dialog') };
}
function restoreFocus(f, scope) {
  if (!f) return;
  const el = scope.querySelector(f.selector);
  if (!el) return;
  el.focus({ preventScroll: true });
  try { if (f.sel?.[0] != null) el.setSelectionRange(...f.sel); } catch { /* ignore */ }
}

function render() {
  if (pointerActive || editingField()) { pendingRender = true; return; }
  const r = route(), s = getState();
  document.documentElement.classList.toggle('reduce-motion', !!s.reduce);
  document.documentElement.lang = getLang();
  document.title = `${ROUTES[r].title()} · Insurers League`;
  const skip = document.querySelector('.skip-link');
  if (skip) skip.textContent = t('Skip to content', 'İçeriğe geç');

  if (r === 'stage') {
    if (renderedRoute !== 'stage') {
      stage?.destroy();
      app.innerHTML = stageMarkup();
      stage = mountStage(app);
      document.body.classList.add('on-stage');
      renderedHtml = '';
    }
  } else {
    if (stage) { stage.destroy(); stage = null; }
    document.body.classList.remove('on-stage');
    const html = ROUTES[r].view();
    if (renderedRoute !== r || html !== renderedHtml) {
      const focus = renderedRoute === r ? captureFocus() : null;
      const scrollY = window.scrollY;
      app.innerHTML = html;
      renderedHtml = html;
      if (renderedRoute === r) window.scrollTo(0, scrollY);
      if (focus && !focus.inModal) restoreFocus(focus, app);
    }
  }
  renderedRoute = r;
  renderModal();
}

// If a field is being typed into but not yet committed, delay re-rendering until it's left.
function editingField() {
  const el = document.activeElement;
  if (route() !== 'rules' || renderedRoute !== 'rules' || !el?.matches('#app input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), #app textarea')) return false;
  return el.value !== el.defaultValue;
}
document.addEventListener('focusout', () => { if (pendingRender && !pointerActive) { pendingRender = false; setTimeout(render); } });

function renderModal() {
  let dlg = document.getElementById('modal');
  if (!modalFn) { if (dlg?.open) dlg.close(); dlg?.remove(); return; }
  const { title, body, kind = 'modal' } = modalFn();
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'modal';
    dlg.setAttribute('aria-labelledby', 'modal-title');
    dlg.addEventListener('close', () => { modalFn = null; dlg.remove(); });
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg);
  }
  dlg.className = kind;
  const html = `<header class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="${t('Close', 'Kapat')}">${icon('x', 18)}</button></header><div class="modal-body">${body}</div>`;
  if (dlg.dataset.html !== html) {
    const focus = dlg.contains(document.activeElement) ? captureFocus() : null;
    const scroll = dlg.querySelector('.modal-body')?.scrollTop || 0;
    dlg.innerHTML = html; dlg.dataset.html = html;
    dlg.querySelector('.modal-body').scrollTop = scroll;
    if (focus) restoreFocus(focus, dlg);
  }
  if (!dlg.open) dlg.showModal();
}
const openModal = fn => { modalFn = fn; renderModal(); };
const closeModal = () => { modalFn = null; renderModal(); };

let quiet = false;
subscribe((source, detail) => {
  if (source === 'error') { toast(detail); return; }
  if (quiet && source === 'local') return;
  if (route() === 'stage' && renderedRoute === 'stage') { renderModal(); return; }
  render();
});

function act(action, { quietly = false } = {}) {
  quiet = quietly;
  const result = dispatch(action);
  quiet = false;
  if (result?.error) toast(result.error);
  return result;
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 4200);
}

function exportSession() {
  const s = getState();
  const blob = new Blob([JSON.stringify({ ...s, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `insurers-league-${s.config.year}-${s.code}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function download(data, name) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function startRoomFlow(btn) {
  if (btn) btn.disabled = true;
  try { await store.createRoom(); go('stage'); }
  catch (err) { toast(err.message); if (btn) btn.disabled = false; }
}

// ——— Clicks ———
document.addEventListener('click', async e => {
  const language = e.target.closest('[data-language]');
  if (language) { setLang(language.dataset.language); return; }
  const el = e.target.closest('button, a[data-action], [data-metric], [data-focus], .st-lightbox');
  if (!el || el.disabled) return;
  const s = getState(), d = el.dataset, teamId = d.team !== undefined ? Number(d.team) : null;

  if (d.metric) { act({ type: 'metric', metric: d.metric }, { quietly: true }); return; }
  if (d.focus !== undefined && !d.action) {
    if (store.isHost()) act({ type: 'focus', teamId: Number(d.focus) }, { quietly: true });
    if (el.classList.contains('lane')) stage?.openDetail();
    return;
  }

  switch (d.action) {
    // Home and joining
    case 'create-room': await startRoomFlow(el); break;
    case 'resume-host': store.connectHost(); go('stage'); break;
    case 'excel-team-template': {
      const team = s.teams.find(t2 => t2.id === teamId);
      if (!team) break;
      // Before the race: the team's blank template with its name filled in. At a review: its current plan to edit.
      const quarter = d.quarter === 'true';
      const bytes = buildTemplate(s, { lang: getLang(), teams: [team], single: true });
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      const slug = team.name.toLocaleLowerCase(getLang() === 'tr' ? 'tr-TR' : 'en-US').replace(/\s+/g, '-');
      a.href = url; a.download = quarter ? `${slug}-${t('quarter', 'ceyrek')}-${Math.floor((store.currentStrategyReview()?.month ?? 0) / 3) + 1}.xlsx` : `${slug}-${t('decisions', 'kararlar')}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
    case 'excel-team-upload': el.closest('.xl-team, .xl-chip')?.querySelector('[data-team-upload]')?.click(); break;
    case 'team-upload': el.closest('.team-steps')?.querySelector('[data-team-upload]')?.click(); break;
    case 'brochure-upload': el.closest('[data-brochure-box], .xl-team, .xl-chip')?.querySelector('[data-brochure-upload]')?.click(); break;
    case 'brochure-view': stage?.showBrochure(Number(d.team)); break;
    case 'brochure-close': stage?.closeBrochure(); break;
    case 'team-fill': { const input = document.getElementById('team-name'); if (input) { input.value = d.name; input.focus(); } break; }
    case 'team-leave': act({ type: 'leave-team' }); break;
    case 'excel-select-file': el.closest('.excel-intake')?.querySelector(`[data-sheet-import="${d.sheetTarget}"]`)?.click(); break;
    case 'excel-template': {
      const quarter = d.quarter === 'true', state = getState();
      const bytes = buildTemplate(state, { lang: getLang(), quarter });
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = quarter ? `insurers-league-quarter-${Math.floor((store.currentStrategyReview()?.month ?? 0) / 3) + 1}.xlsx` : `insurers-league-strategies-${state.config.year}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(quarter ? t('Quarter workbook downloaded.', 'Çeyrek strateji dosyası indirildi.') : t('Strategy template downloaded.', 'Strateji şablonu indirildi.'));
      break;
    }

    // Session history
    case 'history-refresh': loadHistory(render); break;
    case 'history-clear': historyState.selected.clear(); render(); break;
    case 'history-copy':
      try { await navigator.clipboard.writeText(historyCode()); toast(t('History code copied.', 'Geçmiş kodu kopyalandı.')); }
      catch { toast(t('Couldn’t copy; select the code and copy it by hand.', 'Kopyalanamadı; kodu seçip elle kopyala.')); }
      break;
    case 'history-delete': {
      const entry = historyState.sessions?.find(x => x.id === d.id);
      if (!entry || !confirm(t(`Delete the ${entry.label || `game ${entry.code}`} session from the history?`, `${entry.label || `${entry.code} oyunu`} oturumu geçmişten silinsin mi?`))) break;
      historyState.sessions = historyState.sessions.filter(x => x.id !== d.id);
      historyState.selected.delete(d.id); render();
      try { await deleteSession(d.id); toast(t('Session deleted.', 'Oturum silindi.')); }
      catch { toast(t('Deleted on this device; the server couldn’t be reached.', 'Bu cihazdan silindi; sunucuya ulaşılamadı.')); }
      break;
    }

    // Balance test
    case 'balance-run': runBalanceTest(getState().config, render); break;
    case 'open-brief': openModal(() => ({ title: t('Market brief', 'Pazar dosyası'), body: briefingContent({ nav: true }), kind: 'sheet' })); break;
    case 'brief-jump': document.getElementById(d.target)?.scrollIntoView({ block: 'start', behavior: s.reduce ? 'auto' : 'smooth' }); break;
    case 'close-modal': closeModal(); break;
    case 'close-modal-nav': closeModal(); break;

    // Moderator flow
    case 'phase': act({ type: 'phase', to: d.to }); break;
    case 'extend': if (!act({ type: 'extend' })?.error) toast(t('Added 5 minutes to the decision window.', 'Karar süresine 5 dakika eklendi.')); break;
    case 'start-race': act({ type: 'start-race' }); break;
    case 'toggle-play': act({ type: 'toggle-play' }, { quietly: true }); break;
    case 'next-month': act({ type: 'next-month' }, { quietly: true }); break;
    case 'skip-countdown': act({ type: 'skip-countdown' }, { quietly: true }); break;
    case 'quiz-close': act({ type: 'quiz-close' }, { quietly: true }); break;
    case 'quiz-continue': act({ type: 'quiz-continue' }, { quietly: true }); break;
    case 'quarter-close': act({ type: 'quarter-close' }, { quietly: true }); break;
    case 'skip-final': stage?.skipFinal(); break;
    case 'final-award': stage?.showFinalAward(Number(d.award)); break;
    case 'results-category': setResultsCategory(d.category); render(); break;
    case 'toggle-detail': stage?.toggleDetail(); break;
    case 'toggle-sound': act({ type: 'setting', key: 'sound', value: !s.sound }, { quietly: true }); break;

    // Settings
    case 'open-settings': openModal(() => ({ ...settingsPanel(), kind: 'drawer' })); break;
    case 'add-ai-team':
      if (!act({ type: 'add-ai-team' })?.error) toast(t('Jev is preparing an AI strategy…', 'Jev bir AI stratejisi hazırlıyor…'));
      break;
    case 'revision': if (!act({ type: 'revision', teamId })?.error) toast(t('The team’s lock was released.', 'Takımın kilidi açıldı.')); break;
    case 'remove-team': if (confirm(t(`Remove ${s.teams.find(t2 => t2.id === teamId)?.name ?? 'this team'} from the game?`, `${s.teams.find(t2 => t2.id === teamId)?.name ?? 'Takım'} oyundan çıkarılsın mı?`))) act({ type: 'remove-team', teamId }); break;
    case 'replay': if (!act({ type: 'replay' })?.error) { closeModal(); if (route() !== 'stage') go('stage'); } break;
    case 'new-game':
      if (!confirm(t('Start a new game with the same teams? Decisions and results reset; teams stay in the lobby.', 'Aynı takımlarla yeni oyun başlasın mı? Kararlar ve sonuçlar sıfırlanır; takımlar lobide kalır.'))) break;
      if (!act({ type: 'new-game' })?.error) { closeModal(); go('stage'); }
      break;
    case 'close-room':
      if (!confirm(t('Close the game? This device stops being the moderator; teams will need a new PIN to join.', 'Oyun kapatılsın mı? Bu cihaz moderatörlükten çıkar; takımların katılmak için yeni bir PIN’e ihtiyacı olur.'))) break;
      closeModal(); store.forgetHost(); store.disconnect(); go('home');
      break;
    case 'export': exportSession(); break;
    case 'audit-workbook': {
      if (el.disabled) break;
      el.disabled = true;
      toast(t('Building the calculation workbook…', 'Hesap dosyası hazırlanıyor…'));
      try {
        const bytes = await buildAuditWorkbook(getState(), { lang: getLang() });
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = `${t('insurers-league-calculation', 'insurers-league-hesap')}-${getState().code}.xlsx`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast(t('Calculation workbook downloaded. Its Score sheet matches the app.', 'Hesap dosyası indirildi. Puan sayfası uygulamayla aynı sonucu verir.'));
      } catch (err) { toast(t(`Couldn’t build the workbook: ${err.message}`, `Dosya hazırlanamadı: ${err.message}`)); }
      finally { el.disabled = false; }
      break;
    }

    // Rule studio
    case 'rule-default': act({ type: 'rule', path: d.path, value: getPath(defaultRules(), d.path) }); break;
    case 'assumption-default': act({ type: 'assumption', key: d.key, value: assumptionsFor(getState().config.lang)[d.key].value }); break;
    case 'weights-normalize': act({ type: 'weights-normalize' }); break;
    case 'rules-reset-section': {
      const sec = sectionOf(d.section);
      if (sec.reset && confirm(t(`Reset every setting in “${sec.name}” to default?`, `“${sec.name}” bölümündeki tüm ayarlar varsayılana dönsün mü?`)) && !act({ type: 'rules-reset', ...sec.reset })?.error) toast(t(`${sec.name} was reset to default.`, `${sec.name} varsayılana döndü.`));
      break;
    }
    case 'rules-reset-all':
      if (!confirm(t('Reset every rule, scoring setting, market figure and event to default?', 'Tüm kurallar, puanlama ayarları, pazar rakamları ve olaylar varsayılana dönsün mü?'))) break;
      if (!act({ type: 'rules-reset', scoring: true, market: true, events: true })?.error) toast(t('Every rule was reset to default.', 'Tüm kurallar varsayılana döndü.'));
      break;
    case 'rules-export': download(rulesPackage(), `insurers-league-rules-${s.config.year}.json`); toast(t('Rules file downloaded.', 'Kural dosyası indirildi.')); break;
    case 'event-add': if (!act({ type: 'event-add' })?.error) toast(t('Event added to July; set its month and effects.', 'Olay Temmuz ayına eklendi; ayını ve etkilerini ayarla.')); break;
    case 'event-remove': if (confirm(t(`Delete “${s.config.events[Number(d.index)]?.title ?? 'this event'}” from the calendar?`, `“${s.config.events[Number(d.index)]?.title ?? 'Olay'}” takvimden silinsin mi?`))) act({ type: 'event-remove', index: Number(d.index) }); break;
    case 'question-toggle': if (rulesState.open.has(d.id)) rulesState.open.delete(d.id); else rulesState.open.add(d.id); render(); break;
    case 'question-add': {
      const id = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      if (!act({ type: 'question-add', id })?.error) {
        rulesState.open.add(id); render();
        requestAnimationFrame(() => { const box = document.getElementById(`q-${id}-text`); box?.scrollIntoView({ block: 'center', behavior: s.reduce ? 'auto' : 'smooth' }); box?.focus({ preventScroll: true }); });
      }
      break;
    }
    case 'question-move': act({ type: 'question-move', id: d.id, dir: d.dir }); break;
    case 'question-remove': if (confirm(t('Delete this question from the bank?', 'Bu soru bankadan silinsin mi?'))) { rulesState.open.delete(d.id); act({ type: 'question-remove', id: d.id }); } break;
    case 'questions-reset': if (confirm(t('Reset the question bank to the default questions? Questions you added or edited will be deleted.', 'Soru bankası varsayılan sorulara dönsün mü? Eklediğin veya düzenlediğin sorular silinecek.'))) { rulesState.open.clear(); act({ type: 'questions-reset' }); } break;
  }
});

// Dragging a slider defers re-renders until it's released.
document.addEventListener('pointerdown', e => { if (e.target.closest('input[type=range]')) pointerActive = true; });
const endPointer = () => { if (pointerActive) { pointerActive = false; if (pendingRender) { pendingRender = false; render(); } } };
document.addEventListener('pointerup', endPointer);
document.addEventListener('pointercancel', endPointer);

document.addEventListener('submit', async e => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  if (form.dataset.form === 'excel-add-team') {
    const input = form.querySelector('input[name="name"]'), name = input?.value.trim() ?? '';
    if (!act({ type: 'excel-add-team', name })?.error) { toast(t(`${name} added. Hand it its template.`, `${name} eklendi. Kendi şablonunu ver.`)); requestAnimationFrame(() => document.getElementById('xl-new-team')?.focus()); }
    return;
  }
  if (form.dataset.form === 'team-pin') {
    const pin = (form.querySelector('input[name="pin"]')?.value || '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(pin)) { toast(t('The PIN has six digits.', 'PIN altı hanelidir.')); return; }
    go('team', `?pin=${pin}`);
    return;
  }
  if (form.dataset.form === 'team-join') {
    act({ type: 'excel-join', name: form.querySelector('input[name="name"]')?.value.trim() ?? '' });
    return;
  }
  if (form.dataset.form === 'history-code') {
    if (!useHistoryCode(historyState.codeDraft)) { toast(t('That doesn’t look like a history code. Copy it from the other device’s Past sessions page.', 'Bu bir geçmiş kodu gibi görünmüyor. Kodu diğer cihazın Geçmiş oturumlar sayfasından kopyala.')); return; }
    historyState.codeDraft = ''; historyState.sessions = []; historyState.selected.clear();
    toast(t('This device now uses that history code.', 'Bu cihaz artık o geçmiş kodunu kullanıyor.'));
    loadHistory(render);
  }
});

document.addEventListener('input', e => {
  const el = e.target, d = el.dataset;
  if (d.historyCode !== undefined) { historyState.codeDraft = el.value; return; }
});

document.addEventListener('change', async e => {
  const el = e.target, d = el.dataset;
  if (d.brochureUpload !== undefined && el.files?.length) {
    try {
      toast(t('Preparing the brochure…', 'Broşür hazırlanıyor…'));
      const { blob, w, h } = await prepareBrochure(el.files[0]);
      await store.sendBrochure(Number(d.brochureUpload), blob, w, h);
      toast(t('Brochure uploaded.', 'Broşür yüklendi.'));
    } catch (err) { toast(t(`Brochure not uploaded: ${err.message}`, `Broşür yüklenmedi: ${err.message}`)); }
    finally { el.value = ''; }
    return;
  }
  if (d.rule) {
    const spec = fieldSpec(d.rule);
    if (!spec) return;
    let value = el.value;
    if (spec.format !== 'text') {
      if (el.value === '' || !Number.isFinite(Number(el.value))) { toast(t('Enter a number.', 'Bir sayı girin.')); el.value = el.defaultValue; render(); return; }
      value = Number((Number(el.value) / (spec.format === 'pct' ? 100 : 1)).toFixed(6));
    }
    if (act({ type: 'rule', path: d.rule, value })?.error) { el.value = el.defaultValue; }
    render();
    return;
  }
  if (d.historyPick) { if (el.checked) historyState.selected.add(d.historyPick); else historyState.selected.delete(d.historyPick); render(); return; }
  if (d.historyLabel) {
    const entry = historyState.sessions?.find(x => x.id === d.historyLabel);
    if (!entry) return;
    entry.label = el.value.trim().slice(0, 60);
    try { await putSession(entry); toast(t('Group name saved.', 'Grup adı kaydedildi.')); }
    catch { toast(t('Saved on this device; the server couldn’t be reached.', 'Bu cihaza kaydedildi; sunucuya ulaşılamadı.')); }
    render(); return;
  }
  if (d.balanceSeasons !== undefined) { balanceState.seasons = Number(el.value); render(); return; }
  if (d.ruleBool) { act({ type: 'rule', path: d.ruleBool, value: el.checked }); return; }
  if (d.q) {
    const key = d.qKey;
    const value = key === 'enabled' ? el.checked : key === 'correct' ? Number(el.value) : el.value;
    if (act({ type: 'question-update', id: d.q, key, index: d.qIndex !== undefined ? Number(d.qIndex) : undefined, value })?.error) el.value = el.defaultValue;
    render();
    return;
  }
  if (d.config) {
    if (el.type === 'number' && (!el.checkValidity() || el.value === '')) { toast(t(`Enter a value between ${el.min} and ${el.max}.`, `Değeri ${el.min}–${el.max} aralığında girin.`)); renderModal(); return; }
    act({ type: 'config', key: d.config, value: d.config === 'branch' ? el.value : Number(el.value) }, { quietly: route() === 'stage' });
    return;
  }
  if (d.setting) { act({ type: 'setting', key: d.setting, value: el.checked }); return; }
  if (d.quiz) { act({ type: 'quiz-config', key: d.quiz, value: el.type === 'checkbox' ? el.checked : el.value }); return; }
  if (d.weight !== undefined) { act({ type: 'weight', index: Number(d.weight), value: el.value }); return; }
  if (d.assumption) {
    const value = Number((Number(el.value) / Number(d.scale || 1)).toFixed(6));
    if (el.value === '' || act({ type: 'assumption', key: d.assumption, value })?.error) el.value = el.defaultValue;
    render();
    return;
  }
  if (d.event !== undefined) {
    if (act({ type: 'event', index: Number(d.event), prop: d.prop, value: el.value })?.error) el.value = el.defaultValue;
    render();
    return;
  }
  if (el.id === 'import-file' && el.files[0]) {
    try {
      const file = el.files[0];
      if (file.size > 200000) throw Error(t('The scenario file exceeds the 200 KB limit.', 'Senaryo dosyası 200 KB sınırını aşıyor.'));
      const data = JSON.parse(await file.text());
      if (!act({ type: 'import-config', config: data.config || data, quiz: data.quiz })?.error) toast(data.quiz ? t('Rules and question bank loaded.', 'Kurallar ve soru bankası yüklendi.') : t('Scenario loaded.', 'Senaryo yüklendi.'));
      el.value = '';
    } catch (err) { toast(t(`Couldn’t load: ${err.message}`, `Yüklenemedi: ${err.message}`)); }
  }
  if (d.teamUpload !== undefined && el.files?.length) {
    const state = getState(), team = state.teams.find(t2 => t2.id === Number(d.teamUpload));
    try {
      const file = el.files[0];
      if (!team) throw Error(t('That team is no longer in the game.', 'Bu takım artık oyunda değil.'));
      if (file.size > 3_000_000) throw Error(t('The workbook must be under 3 MB.', 'Dosya 3 MB’tan küçük olmalı.'));
      const result = await readTeamSheet(file, team, state.config, getLang());
      if (result.errors.length) throw Error(`${result.errors.slice(0, 2).join(' ')}${result.errors.length > 2 ? ` ${t(`And ${result.errors.length - 2} more issue(s).`, `Ayrıca ${result.errors.length - 2} sorun daha var.`)}` : ''}`);
      if (!act({ type: 'excel-team-plan', teamId: team.id, strategy: result.strategy })?.error) {
        const renamed = result.fileName && result.fileName.toLocaleLowerCase() !== team.name.toLocaleLowerCase();
        toast(d.quarter === 'true'
          ? t(`${team.name}’s next-quarter plan received.`, `${team.name} takımının gelecek çeyrek planı alındı.`)
          : t(`${team.name}’s plan received.${renamed ? ` (The file said “${result.fileName}”.)` : ''}`, `${team.name} takımının planı alındı.${renamed ? ` (Dosyada “${result.fileName}” yazıyordu.)` : ''}`));
      }
    } catch (err) { toast(t(`Workbook not taken: ${err.message}`, `Dosya alınmadı: ${err.message}`)); }
    finally { el.value = ''; }
    return;
  }
  if (d.sheetImport && el.files?.length) {
    try {
      const files = [...el.files], quarter = d.sheetImport === 'quarter';
      if (files.length > 12) throw Error(t('Upload no more than 12 workbooks at a time.', 'Tek seferde en fazla 12 çalışma kitabı yükleyin.'));
      const total = files.reduce((sum, file) => sum + file.size, 0);
      if (total > 12_000_000 || files.some(file => file.size > 3_000_000)) throw Error(t('The selected workbooks are too large. Each file must be under 3 MB and the total under 12 MB.', 'Seçilen dosyalar çok büyük. Her dosya 3 MB, toplamları 12 MB altında olmalı.'));
      const state = getState();
      const review = quarter ? store.currentStrategyReview() : null;
      const currentTeams = quarter ? state.teams.filter(team => team.excel && !team.ai).map(team => ({
        ...team,
        strategy: review?.initialStrategies?.[team.id] ?? team.quarterDraft ?? team.strategy
      })) : [];
      const result = await readSheets(files, state.config, getLang(), { quarter, currentTeams });
      if (result.errors.length) {
        const details = result.errors.slice(0, 2).join(' ');
        throw Error(`${details}${result.errors.length > 2 ? ` ${t(`And ${result.errors.length - 2} more issue(s).`, `Ayrıca ${result.errors.length - 2} sorun daha var.`)}` : ''}`);
      }
      const action = quarter ? 'excel-quarter-submit' : 'excel-import-teams';
      const applied = act({ type: action, teams: result.teams });
      if (!applied?.error) toast(quarter
        ? t(`${result.teams.length} quarterly plan${result.teams.length === 1 ? '' : 's'} updated.`, `${result.teams.length} çeyrek planı güncellendi.`)
        : t(`${result.teams.length} team strateg${result.teams.length === 1 ? 'y' : 'ies'} imported.`, `${result.teams.length} takım stratejisi alındı.`));
    } catch (err) { toast(t(`Workbook not imported: ${err.message}`, `Çalışma kitabı alınmadı: ${err.message}`)); }
    finally { el.value = ''; }
  }
});

// A title is one line even when it wraps: Enter commits it instead of adding a line break.
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches?.('textarea.ev-title')) { e.preventDefault(); e.target.blur(); }
});

document.addEventListener('keydown', e => {
  if (route() !== 'stage' || !store.isHost() || document.getElementById('modal') || e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const round = store.currentRound();
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (round) act({ type: round.revealedAt ? 'quiz-continue' : 'quiz-close' }, { quietly: true });
    else if (store.currentStrategyReview()) act({ type: 'quarter-close' }, { quietly: true });
    else if (store.raceStarted()) act({ type: 'toggle-play' }, { quietly: true });
  }
  else if (e.key === 'ArrowRight') act({ type: 'next-month' }, { quietly: true });
  else if (e.key.toLowerCase() === 'd') stage?.toggleDetail();
});

let lastHash = location.hash;
window.addEventListener('hashchange', () => {
  const sameRoute = route() === renderedRoute;
  ensureConnection(route()); render();
  if (sameRoute && location.hash !== lastHash) window.scrollTo(0, 0);
  lastHash = location.hash;
});

// Clock: counters, and re-render on phase/month/question changes
let lastSig = '';
setInterval(() => {
  const left = timeLeft();
  document.querySelectorAll('[data-clock]').forEach(el => { if (left !== null) el.textContent = clock(left); });
  const round = store.currentRound();
  if (round && !round.revealedAt) {
    const secs = Math.max(0, (round.closesAt - store.now()) / 1000);
    document.querySelectorAll('[data-quiz-clock]').forEach(el => { el.textContent = Math.ceil(secs); });
    document.querySelectorAll('[data-quiz-bar]').forEach(el => { el.style.width = `${secs / getState().quiz.duration * 100}%`; });
  }
  const review = store.currentStrategyReview();
  if (review) {
    const secs = Math.max(0, (review.closesAt - store.now()) / 1000);
    document.querySelectorAll('[data-quarter-clock]').forEach(el => { el.textContent = clock(secs); });
  }
  // A finished season files itself into the moderator's session history.
  if (store.isHost() && store.seasonDone()) archiveSeason(getState(), store.results()).then(saved => { if (saved && historyState.sessions) { historyState.sessions = cachedSessions(); if (route() === 'history') render(); } });
  if (route() === 'stage') return;
  const h = playhead();
  const sig = `${h.month}|${h.countdown}|${left === 0}|${round?.qid}|${round?.revealedAt}|${review?.month}|${review?.closedAt}`;
  if (sig !== lastSig) { lastSig = sig; if (!document.activeElement?.matches('input:not([type=range]), textarea')) render(); }
}, 250);

ensureConnection(route());
// The language toggle is personal to this device only: it re-renders this browser's own DOM.
// It must never dispatch a shared action — a room's content language is fixed once at
// creation, and one viewer's toggle can't change what anyone else on the same room sees.
onLangChange(() => {
  document.documentElement.lang = getLang();
  // The stage view's outer shell (column headers, metric buttons, hostbar/dock labels) is
  // static markup built once at mount time, not re-rendered every frame — so a language
  // change must rebuild it from scratch rather than rely on the frame loop's partial refresh.
  if (stage) { stage.destroy(); app.innerHTML = stageMarkup(); stage = mountStage(app); }
  renderedHtml = '';
  render();
});
render();
