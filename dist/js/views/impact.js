// End-of-season scorecard: what each decision and each event was actually worth, in points.
// The numbers come from attribution.js (counterfactual re-runs of the same seeded season), so every
// line on screen is a real "what if" the engine computed — not a rule of thumb.
import { getState } from '../store.js';
import { icon } from '../ui.js';
import { esc, fmt, money, points } from '../format.js';
import { localizedEventTitle, monthsOf, dimensionName, levelName, campaignOf } from '../../engine.js';
import { giftMix } from './plan.js';
import { attribution } from '../attribution.js';
import { t, getLang } from '../i18n.js';

const NOISE = 0.05; // below this a line says nothing; don't spend a row on it

const componentNames = () => [t('profitability', 'kârlılık'), t('market share', 'pazar payı')];

// What the team actually chose, in words, so the row reads as "this choice, worth this much".
function decisionLabel(key, strategy, config) {
  const lang = getLang();
  if (key.startsWith('coef.')) {
    const dim = key.slice(5);
    return [t(`${dimensionName(dim, lang)} coefficients`, `${dimensionName(dim, lang)} katsayıları`), strategy.coef[dim].map((v, i) => `${levelName(dim, i, lang)} ${fmt(v, 2)}`).join(' · ')];
  }
  switch (key) {
    case 'basePremium': return [t('Base premium', 'Baz prim'), `€${fmt(strategy.basePremium, 2)}`];
    case 'marketing': return [t('Marketing budget', 'Pazarlama bütçesi'), money(strategy.marketing)];
    case 'mediaShare': return [t('Media share', 'Medya payı'), `${campaignOf(strategy).media}%`];
    case 'offers': return [t('Gift weights', 'Hediye ağırlıkları'), giftMix(strategy, config, lang)];
    default: return [key, ''];
  }
}

function row(label, value, delta, why, scale) {
  const dir = delta >= 0 ? 'up' : 'down';
  return `<li class="imp ${dir}">
    <span class="imp-what"><b>${esc(label)}</b>${value ? `<small>${esc(value)}</small>` : ''}</span>
    <span class="imp-bar" aria-hidden="true"><i style="width:${Math.min(100, Math.abs(delta) / scale * 100).toFixed(1)}%"></i></span>
    <span class="imp-delta num">${points(delta, 1, true)}</span>
    ${why ? `<span class="imp-why">${esc(why)}</span>` : ''}
  </li>`;
}

// `compact` is the phone: same numbers, tighter copy, top rows only.
export function impactPanel(team, { compact = false } = {}) {
  const s = getState();
  const data = attribution(s.teams, s.config, team.id);
  if (!data) return '';
  const months = monthsOf(getLang());
  const names = componentNames();

  const decisions = data.decisions.filter(d => Math.abs(d.delta) >= NOISE);
  const events = data.events.filter(e => Math.abs(e.delta) >= NOISE);
  if (!decisions.length && !events.length) return '';
  const shownD = compact ? decisions.slice(0, 5) : decisions;
  const shownE = compact ? events.slice(0, 4) : events;
  const scale = Math.max(NOISE, ...[...shownD, ...shownE].map(x => Math.abs(x.delta)));

  const why = x => (Math.abs(x.topDelta) < NOISE ? '' : t(`mostly ${names[x.top]} ${points(x.topDelta, 1, true)}`, `çoğunlukla ${names[x.top]} ${points(x.topDelta, 1, true)}`));

  return `<section class="impact ${compact ? 'compact' : ''}">
    <header class="impact-head">
      <p class="kicker blue">${icon('chart', 15)} ${t('Why you finished here', 'Neden buradasın')}</p>
      ${compact ? '' : `<p class="muted">${t('Every line is the same season re-run with one thing changed, so the points are measured, not estimated.', 'Her satır, aynı sezonun tek bir şey değiştirilip yeniden oynatılmasıdır; puanlar tahmin değil, ölçüm.')}</p>`}
    </header>

    ${shownD.length ? `<div class="impact-group">
      <h4>${t('Your decisions', 'Kararların')}</h4>
      <p class="impact-note">${t('What each choice was worth against the default everyone started from.', 'Her seçimin, herkesin başladığı varsayılana göre değeri.')}</p>
      <ol class="impact-list">${shownD.map(d => {
        const [label, value] = decisionLabel(d.key, team.strategy, s.config);
        return row(label, value, d.delta, why(d), scale);
      }).join('')}</ol>
    </div>` : ''}

    ${shownE.length ? `<div class="impact-group">
      <h4>${t('The year’s events', 'Yılın olayları')}</h4>
      <p class="impact-note">${t('What your score would have been if each event had never happened.', 'Her olay hiç yaşanmasaydı puanının ne olacağı.')}</p>
      <ol class="impact-list">${shownE.map(e => {
        const label = `${months[e.month]} · ${localizedEventTitle(e.title, s.config, getLang())}`;
        return row(label, '', e.delta, why(e), scale);
      }).join('')}</ol>
    </div>` : ''}
  </section>`;
}
