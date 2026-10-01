// A team's own device: it joins with the game PIN, names itself, downloads its template and hands in
// its own workbook — before the race and again at every quarter review. The race itself plays on stage.
import { getState, getSession, myTeam, raceStarted, seasonDone, playhead, currentStrategyReview, teamStatus, now } from '../store.js';
import { icon, emblem } from '../ui.js';
import { esc, clock } from '../format.js';
import { monthsOf } from '../../engine.js';
import { t, getLang, languageControl } from '../i18n.js';
import { planSummary } from './plan.js';
import { sampleWorkbook } from './home.js';

const shell = (body, pin) => `<div class="join-app team-app">
  <header class="join-brand"><span class="brand-mark">${icon('bolt', 20)}</span><strong class="display">Insurers<b>League</b></strong>${pin ? `<span class="chip">PIN <b class="num">${esc(pin.replace(/(\d{3})(\d{3})/, '$1 $2'))}</b></span>` : ''}${languageControl()}</header>
  <main class="join-card" id="main">${body}</main>
</div>`;

export function pinForm(error = '') {
  return shell(`<p class="kicker amber">${t('Team entry', 'Takım girişi')}</p>
    <h1 class="display">${t('Join your game', 'Oyununa katıl')}</h1>
    <p class="muted">${t('Enter the six-digit PIN shown on the moderator’s screen.', 'Moderatör ekranındaki altı haneli PIN’i gir.')}</p>
    <form class="join-form" data-form="team-pin">
      <label for="team-pin">${t('Game PIN', 'Oyun PIN’i')}</label>
      <input class="input join-name num" id="team-pin" name="pin" inputmode="numeric" autocomplete="off" maxlength="7" placeholder="123 456" required>
      ${error ? `<p class="form-error">${esc(error)}</p>` : ''}
      <button class="btn go lg" type="submit">${t('Continue', 'Devam')} ${icon('arrow', 18)}</button>
    </form>`);
}

export function teamPage() {
  const s = getState(), sess = getSession(), pin = sess.pin;
  if (!pin) return pinForm();
  if (sess.connection === 'closed') return pinForm(t('There’s no open game with this PIN, or the game was closed.', 'Bu PIN ile açık bir oyun yok ya da oyun kapatıldı.'));
  if (sess.connection !== 'open' && !s.teams.length) return shell(`<p class="muted">${icon('clock', 16)} ${t('Connecting to the game…', 'Oyuna bağlanıyor…')}</p>`, pin);

  const team = myTeam();
  if (!team) {
    if (raceStarted()) return shell(`<h1 class="display">${t('The race has started', 'Yarış başladı')}</h1><p class="muted">${t('New teams can’t join now. Follow the race on the stage screen.', 'Artık yeni takım katılamaz. Yarışı sahne ekranından izle.')}</p>`, pin);
    const waiting = s.teams.filter(team2 => !team2.owner && !team2.ai && team2.excel);
    return shell(`<p class="kicker amber">${t('Step 1 of 2', 'Adım 1 / 2')}</p>
      <h1 class="display">${t('Name your team', 'Takımını kur')}</h1>
      <p class="muted">${t('If the moderator already added your team, type the same name to take it over.', 'Moderatör takımını zaten eklediyse aynı adı yaz; takım sana geçer.')}</p>
      <form class="join-form" data-form="team-join">
        <label for="team-name">${t('Team name', 'Takım adı')}</label>
        <input class="input join-name" id="team-name" name="name" maxlength="16" autocomplete="off" required placeholder="${t('e.g. Falcon Insurance', 'örn. Kartal Sigorta')}">
        ${waiting.length ? `<p class="join-others">${t('Teams waiting for their device', 'Cihazını bekleyen takımlar')}: ${waiting.map(team2 => `<button type="button" class="linklike" data-action="team-fill" data-name="${esc(team2.name)}">${esc(team2.name)}</button>`).join(', ')}</p>` : ''}
        <button class="btn go lg" type="submit">${t('Join the game', 'Oyuna katıl')} ${icon('arrow', 18)}</button>
      </form>`, pin);
  }

  const review = currentStrategyReview(), status = teamStatus(team);
  const head = `<div class="team-preview" style="--team:${team.color};--team-soft:color-mix(in oklab, ${team.color} 22%, var(--canvas))">${emblem(team, 'lg')}<div><strong class="display">${esc(team.name)}</strong><span class="chip ${status.id === 'locked' ? 'ok' : 'warn'}">${status.id === 'locked' ? icon('check', 13) : '<span class="dot"></span>'} ${esc(status.label)}</span></div></div>`;
  const upload = (quarter, done) => `<div class="team-steps">
      <button class="btn lg" data-action="excel-team-template" data-team="${team.id}" ${quarter ? 'data-quarter="true"' : ''}>${icon('file', 18)} ${quarter ? t('Download your current plan', 'Güncel planını indir') : t('Download your template', 'Şablonunu indir')}</button>
      <button class="btn ${done ? 'ghost' : 'go'} lg" data-action="team-upload">${icon('upload', 18)} ${done ? t('Replace your file', 'Dosyanı değiştir') : t('Upload your workbook', 'Dosyanı yükle')}</button>
      <input type="file" data-team-upload="${team.id}" ${quarter ? 'data-quarter="true"' : ''} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
    </div>`;
  const plan = team.locked ? `<p class="team-plan">${icon('check', 15)} ${esc(planSummary(team.strategy, s.config))}</p>` : '';

  if (seasonDone()) return shell(`${head}<h1 class="display">${t('The season is over', 'Sezon bitti')}</h1><p class="muted">${t('The three trophies are handed out on the stage screen.', 'Üç kupa sahne ekranında veriliyor.')}</p>`, pin);

  if (review) {
    const done = !!review.submitted?.[team.id], quarter = Math.floor(review.month / 3) + 1;
    return shell(`${head}
      <p class="kicker amber">${t(`Quarter ${quarter} review`, `${quarter}. çeyrek molası`)} · <b class="num" data-quarter-clock>${clock(Math.max(0, (review.closesAt - now()) / 1000))}</b></p>
      <h1 class="display">${done ? t('Next-quarter plan received', 'Gelecek çeyrek planın alındı') : t('Update your plan', 'Planını güncelle')}</h1>
      <p class="muted">${t('Download your current plan, change prices, marketing or claims operations, and upload it. If no file arrives, your plan carries on unchanged.', 'Güncel planını indir; fiyat, pazarlama ya da hasar operasyonunu değiştir ve yükle. Dosya gelmezse planın aynen sürer.')}</p>
      ${upload(true, done)}`, pin);
  }

  if (raceStarted()) {
    const m = Math.max(0, playhead().month);
    return shell(`${head}
      <p class="kicker amber">${t('Live race', 'Canlı yarış')} · ${monthsOf(getLang())[m]}</p>
      <h1 class="display">${t('Your plan is racing', 'Planın yarışıyor')}</h1>
      <p class="muted">${t('Follow the race on the stage screen. At every quarter end this page opens your plan for changes.', 'Yarışı sahne ekranından izle. Her çeyrek sonunda bu sayfa planını değişikliğe açar.')}</p>
      ${plan}`, pin);
  }

  return shell(`${head}
    <p class="kicker amber">${t('Step 2 of 2', 'Adım 2 / 2')}</p>
    <h1 class="display">${team.locked ? t('Plan received', 'Planın alındı') : t('Hand in your plan', 'Planını teslim et')}</h1>
    <p class="muted">${t('Download your template, fill in the base premium, the segment coefficients and the budget split, then upload it here. You can replace it until the race starts.', 'Şablonunu indir; baz primi, segment katsayılarını ve bütçe dağılımını doldur, sonra buraya yükle. Yarış başlayana kadar değiştirebilirsin.')}</p>
    ${upload(false, team.locked)}
    ${plan}
    <a class="home-history" href="${sampleWorkbook()}" download>${icon('eye', 16)} ${t('See a filled-in example', 'Doldurulmuş örneğe bak')}</a>
    <button class="linklike team-leave" data-action="team-leave">${t('Not your team? Leave it', 'Takımın bu değil mi? Ayrıl')}</button>`, pin);
}
