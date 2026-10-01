import { savedHost } from '../store.js';
import { icon } from '../ui.js';
import { esc } from '../format.js';
import { t, getLang, languageControl } from '../i18n.js';

// A filled-in example of what teams hand in (built by scripts/build-samples.mjs).
export const sampleWorkbook = () => (getLang() === 'tr' ? 'samples/kasko-karar-ornegi.xlsx' : 'samples/casco-decision-sample.xlsx');

// Everyone watches the moderator's screen; the home page is where the moderator starts or resumes a game.
export function home() {
  const host = savedHost();
  const steps = [
    ['file', t('Hand out the data', 'Veriyi dağıt'), t('Teams get the casco sample and the claims model, and work out which segments pay.', 'Takımlar kasko örneklemini ve hasar modelini alır; hangi segmentin kazandırdığını çıkarır.')],
    ['sliders', t('Collect the workbooks', 'Dosyaları topla'), t('Each team sets a base premium, 19 segment coefficients and its budget in the Excel template.', 'Her takım Excel şablonunda baz primini, 19 segment katsayısını ve bütçesini belirler.')],
    ['flag', t('Race the market', 'Pazarda yarıştır'), t('Upload the files; twelve months play out on this screen, with a strategy review every quarter.', 'Dosyaları yükle; on iki ay bu ekranda oynanır, her çeyrek bir strateji molası verilir.')]
  ];
  return `<div class="home">
    <header class="home-brand"><span class="brand-mark">${icon('bolt', 22)}</span><strong class="display">Insurers<b>League</b></strong>${languageControl()}</header>
    <main class="home-main" id="main">
      <section class="home-hero">
        <p class="kicker amber">${t('A casco pricing race', 'Bir kasko fiyatlama yarışı')}</p>
        <h1 class="display">${t('One market.<br>12 months.<br><em>Who prices it right?</em>', 'Tek pazar.<br>12 ay.<br><em>Kim doğru fiyatlar?</em>')}</h1>
        <p class="lead">${t('Teams read a real casco sample, price every segment and split a budget between marketing, claims operations and reinsurance. Then they compete for the same customers all year.', 'Takımlar gerçek bir kasko örneklemini okur, her segmenti fiyatlar ve bütçesini pazarlama, hasar operasyonu ve reasürans arasında böler. Sonra yıl boyunca aynı müşteriler için yarışır.')}</p>
      </section>
      <section class="home-cards">
        <div class="home-card host">
          <h2 class="display">${t('Run a session', 'Oturum yönet')}</h2>
          <p class="muted">${t('This is the screen you project. Teams hand in their workbooks from their own device.', 'Yansıtacağın ekran budur. Takımlar dosyalarını kendi cihazlarından teslim eder.')}</p>
          <ol class="home-steps">${steps.map(([ic, title, text], i) => `<li><span class="home-step-no num">${i + 1}</span><span><b>${icon(ic, 15)} ${title}</b><small>${text}</small></span></li>`).join('')}</ol>
          ${host ? `<button class="btn gold lg" data-action="resume-host">${icon('play', 18)} ${t('Back to your game', 'Oyununa dön')} · PIN ${esc(host.pin)}</button>` : ''}
          <button class="btn ${host ? 'ghost' : 'gold'} lg" data-action="create-room">${icon('plus', 18)} ${t('Start a new game', 'Yeni oyun başlat')}</button>
          <a class="home-history" href="${sampleWorkbook()}" download>${icon('file', 16)} ${t('Example decision workbook (.xlsx)', 'Örnek karar dosyası (.xlsx)')}</a>
          <a class="home-join" href="#/team"><b>${icon('users', 16)} ${t('Joining as a team?', 'Takım olarak mı katılıyorsun?')}</b><small>${t('Enter the PIN on the moderator’s screen and upload your own workbook.', 'Moderatör ekranındaki PIN’i gir ve kendi dosyanı yükle.')}</small></a>
          <a class="home-history" href="#/history">${icon('history', 16)} ${t('Past sessions', 'Geçmiş oturumlar')} ${icon('arrow', 14)}</a>
        </div>
      </section>
    </main>
  </div>`;
}
