// A team's own device: it joins with the game PIN, names itself, downloads its template and hands in
// its own strategy — before the race and again at the half-year review. The race itself plays on stage.
// Every state shows one thing to do: a title, one line and at most two buttons; optional things are small links.
import { getState, getSession, myTeam, raceStarted, seasonDone, playhead, currentStrategyReview, now as now_, timeLeft } from '../store.js';
import { icon, emblem } from '../ui.js';
import { esc, clock, short } from '../format.js';
import { monthsOf } from '../../engine.js';
import { t, getLang, languageControl } from '../i18n.js';
import { sampleWorkbook, CASE_DATA } from './home.js';

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
    // Mid-race the form only takes a team back (a closed tab, another device); new teams can't join.
    if (raceStarted()) return shell(`<p class="kicker amber">${t('Race in progress', 'Yarış sürüyor')}</p>
      <h1 class="display">${t('Back to your team', 'Takımına geri dön')}</h1>
      <p class="muted">${t('Type your team’s name exactly as it is on the stage. New teams can’t join now.', 'Takımının adını sahnedeki gibi yaz. Artık yeni takım katılamaz.')}</p>
      <form class="join-form" data-form="team-join">
        <label for="team-name">${t('Team name', 'Takım adı')}</label>
        <input class="input join-name" id="team-name" name="name" maxlength="40" autocomplete="off" required>
        ${s.teams.filter(t2 => !t2.ai && !t2.connected).length ? `<p class="join-others">${t('Teams without a device', 'Cihazı bağlı olmayan takımlar')}: ${s.teams.filter(t2 => !t2.ai && !t2.connected).map(t2 => `<button type="button" class="linklike" data-action="team-fill" data-name="${esc(t2.name)}">${short(t2.name)}</button>`).join(', ')}</p>` : ''}
        <button class="btn go lg" type="submit">${t('Back to the game', 'Oyuna dön')} ${icon('arrow', 18)}</button>
      </form>`, pin);
    const waiting = s.teams.filter(team2 => !team2.ai && team2.excel && !team2.connected);
    return shell(`<p class="kicker amber">${t('Step 1 of 2', 'Adım 1 / 2')}</p>
      <h1 class="display">${t('Name your team', 'Takımını kur')}</h1>
      <p class="muted">${t('If the moderator already added your team, type the same name to take it over.', 'Moderatör takımını zaten eklediyse aynı adı yaz; takım sana geçer.')}</p>
      <form class="join-form" data-form="team-join">
        <label for="team-name">${t('Team name', 'Takım adı')}</label>
        <input class="input join-name" id="team-name" name="name" maxlength="40" autocomplete="off" required placeholder="${t('e.g. Falcon Insurance', 'örn. Kartal Sigorta')}">
        ${waiting.length ? `<p class="join-others">${t('Teams waiting for their device', 'Cihazını bekleyen takımlar')}: ${waiting.map(team2 => `<button type="button" class="linklike" data-action="team-fill" data-name="${esc(team2.name)}">${short(team2.name)}</button>`).join(', ')}</p>` : ''}
        <button class="btn go lg" type="submit">${t('Join the game', 'Oyuna katıl')} ${icon('arrow', 18)}</button>
      </form>`, pin);
  }

  const review = currentStrategyReview(), months = monthsOf(getLang());
  const head = `<div class="team-preview" style="--team:${team.color};--team-soft:color-mix(in oklab, ${team.color} 22%, var(--canvas))">${emblem(team, 'md')}<strong class="display">${short(team.name)}</strong></div>`;

  // One thing at a time: a title, one line, at most two buttons. Everything optional sits in small links below.
  const screen = ({ kicker, title, text = '', timer = '', actions = '', links = [] }) => shell(`${head}
    ${timer}
    <div class="team-now"><p class="kicker amber">${kicker}</p><h1 class="display">${title}</h1>${text ? `<p class="muted">${text}</p>` : ''}</div>
    ${actions ? `<div class="team-steps">${actions}</div>` : ''}
    ${links.length ? `<div class="team-links">${links.join('')}</div>` : ''}`, pin);
  const clockLine = (label, secs, attr) => `<p class="team-timer">${icon('clock', 16)} ${label} <b class="num" ${attr}>${clock(secs)}</b></p>`;
  const uploadBtn = (quarter, done) => `<button class="btn ${done ? '' : 'go'} lg" data-action="team-upload">${icon('upload', 18)} ${done ? t('Replace your strategy', 'Stratejini değiştir') : t('Upload your strategy', 'Stratejini yükle')}</button><input type="file" data-team-upload="${team.id}" ${quarter ? 'data-quarter="true"' : ''} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>`;
  const templateBtn = (quarter, cls = 'btn lg') => `<button class="${cls}" data-action="excel-team-template" data-team="${team.id}" ${quarter ? 'data-quarter="true"' : ''}>${icon('file', cls.startsWith('btn') ? 18 : 15)} ${quarter ? t('Download your current plan', 'Güncel planını indir') : t('Download your template', 'Şablonunu indir')}</button>`;
  const dataLink = (cls = 'btn lg') => `<a class="${cls}" href="${CASE_DATA}" download>${icon('chart', cls.startsWith('btn') ? 18 : 15)} ${t('Download the casco data', 'Kasko verisini indir')}</a>`;
  const exampleLink = `<a class="linklike" href="${sampleWorkbook()}" download>${icon('eye', 15)} ${t('Filled-in example', 'Doldurulmuş örnek')}</a>`;
  const assetLink = `<span data-brochure-box><button class="linklike" data-action="brochure-upload" data-team="${team.id}">${team.brochure ? icon('check', 15) : icon('upload', 15)} ${team.brochure ? t('Communication asset uploaded · replace', 'İletişim materyali yüklendi · değiştir') : t('Communication asset (optional)', 'İletişim materyali (isteğe bağlı)')}</button><input type="file" data-brochure-upload="${team.id}" accept="image/png,image/jpeg,image/webp,application/pdf" hidden></span>`;
  const leave = `<button class="linklike team-leave" data-action="team-leave">${t('Not your team? Leave', 'Takımın bu değil mi? Ayrıl')}</button>`;

  if (seasonDone()) return screen({ kicker: t('Season over', 'Sezon bitti'), title: t('Look at the stage', 'Sahneye bak'), text: t('The trophies are handed out on the stage screen.', 'Kupalar sahne ekranında veriliyor.') });

  if (review) {
    const done = !!review.submitted?.[team.id];
    return screen({
      kicker: t('Half-year review', 'Yarıyıl molası'),
      timer: clockLine(t('Closes in', 'Kapanmasına'), Math.max(0, (review.closesAt - now_()) / 1000), 'data-quarter-clock'),
      title: done ? t('Second-half plan received', 'İkinci yarıyıl planın alındı') : t('Change your plan for July–December', 'Temmuz–Aralık planını değiştir'),
      text: done ? t('You can replace it while the review is open.', 'Mola açıkken değiştirebilirsin.') : t('Download your current plan, change it and upload it. If you upload nothing, it carries on as it is.', 'Güncel planını indir, değiştir ve yükle. Yüklemezsen plan aynen sürer.'),
      actions: `${templateBtn(true)}${uploadBtn(true, done)}`,
      links: [assetLink]
    });
  }

  if (raceStarted()) return screen({
    kicker: t(`Live race · ${months[Math.max(0, playhead().month)]}`, `Canlı yarış · ${months[Math.max(0, playhead().month)]}`),
    title: t('Watch the stage', 'Sahneyi izle'),
    text: playhead().month < 6 ? t('Nothing to do now. At the end of June you can change your plan once.', 'Şu an yapacak bir şey yok. Haziran sonunda planını bir kez değiştirebileceksin.') : t('Nothing to do now. The trophies come after December.', 'Şu an yapacak bir şey yok. Kupalar Aralık’tan sonra.')
  });

  if (s.phase !== 'decisions') return screen({
    kicker: t('Getting ready', 'Hazırlık'),
    title: t('Prepare your strategy', 'Stratejini hazırla'),
    text: t('Study the data and fill in your template. Uploading opens when the moderator starts the decision window.', 'Veriyi incele ve şablonunu doldur. Yükleme, moderatör karar aşamasını başlatınca açılır.'),
    actions: `${dataLink()}${templateBtn(false)}`,
    links: [exampleLink, assetLink, leave]
  });

  const left = timeLeft(), late = left !== null && left <= 0;
  return screen({
    kicker: t('Decision window', 'Karar aşaması'),
    timer: left === null ? '' : late ? `<p class="form-error">${t('Time’s up. Ask the moderator for more time.', 'Süre doldu. Moderatörden süre iste.')}</p>` : clockLine(t('Time left', 'Kalan süre'), left, 'data-clock'),
    title: team.locked ? t('Strategy received', 'Stratejin alındı') : t('Upload your strategy', 'Stratejini yükle'),
    text: team.locked ? t('You can replace it until the race starts.', 'Yarış başlayana kadar değiştirebilirsin.') : t('Upload your filled-in template before the time runs out.', 'Doldurduğun şablonu süre bitmeden yükle.'),
    actions: uploadBtn(false, team.locked),
    links: [dataLink('linklike'), templateBtn(false, 'linklike'), assetLink, leave]
  });
}
