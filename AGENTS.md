# AGENTS.md — Insurers League

Read this first, then `GELISTIRICI.md` (the full model and architecture). The owner writes in Turkish and wants short Turkish replies.

## What this is
A casco (motor own-damage) pricing workshop game. 2–12 teams compete for one shared market for 12 months. A team decides only two things:
- **Price:** a base premium and 19 segment coefficients (0.50–2.50, step 0.05).
- **Marketing:** one budget per half-year, up to €250k (the decision file has one cell; it runs January–June and again July–December unless the half-year review file changes it; nothing carried over) that run a digital campaign — a media/gift split and four gift weights. Media costs €10 per 100 contacts; reach saturates in the shared target group.

There is one trophy, by total points: profit points (none below €0, 50 at €0, 100 at €1M) + premium points (none below €4M, 50 at €4M, 100 at €8M), ties by profit; a combined ratio above 135% is bankruptcy (ranked last, stamped). There is no NPS, no capital, no reinsurance and no claims operations. Teams revise their plan once, at the half-year review after June.

Costs each month: claims + fixed cost/12 (€500k a year) + 5% of written premium (`expenseRatio`) + channel commission on written premium (Agency 5%, Bank 10%, Digital 2%, Broker 10%; `rules.commission`) + marketing bought. Calibrated so data-based pricing makes ~10% of a fair slice, break-even sits near a 76% target loss ratio and a flat tariff loses. Score thresholds are euro amounts in the assumptions (`profitFloor`, `profitTarget`, `premiumFloor`, `premiumTarget`, `bankruptRatio`).

It runs on Cloudflare Workers:
- `worker/index.js`, with Durable Objects `Room` (one per 6-digit PIN) and `Archive`.
- R2 bucket `insurersleague-data` for the participant data file.
- Static UI in `dist/`, plain ES modules, no build step.

## Commands
- `npm test`: node test runner, all of `tests/*.test.mjs`. Must stay green.
- `npm run check`: syntax-checks every module.
- `npm run dev`: local Worker on :8787.
- `npm run deploy`: deploys. Only when the owner says "yayınla".
- Push: `git push` (local `master` → `origin/main`). Only when the owner says "pushla" or "gönder".
- `npm run upload-data`: uploads `veri/katilimci_verisi.xlsx` to R2 after rebuilding it with `python3 scripts/fix-case-data.py`.

## Map
- `dist/casco.js`: the market engine (rules, money, validation, `simulateCasco`, wallet helpers `planAt` / `monthlyMarketing` / `marketingSpent`).
- `dist/engine.js`: the façade the app imports (scenario, names, events).
- `dist/js/game.js`: state and every action (`reduce(state, action, ctx)`).
- `dist/js/store.js`: client connection.
- `dist/js/sheet.js`: the decision workbook (template writer and reader, `CASE_CELLS`).
- `dist/js/audit.js`: the audit workbook, the whole season as Excel formulas.
- `dist/js/portfolio.js`: the policy file, the season as individual policies and claims (results page, "Policy data"). Claim counts and amounts equal the engine's per team-month; policies and premium differ only by rounding fractional counts.
- `dist/js/views/*`: screens (`stage.js` is the projected moderator screen, `team.js` the team's device).
- `dist/js/jev.js`: AI rivals.
- `dist/js/balance.js`: balance test bots.
- `dist/js/attribution.js`: "why you finished here".
- `scripts/`: Python and Node builders for data, samples and workbooks.

## Invariants (each one broke something before)
1. **`reduce` runs twice:** on the server (the truth) and optimistically in each browser. A team's browser sees rivals' plans hidden (`strategy._hidden`), so client-side code must never re-run `simulate` there (see `recalculateSeason`). Test any player action against a `viewFor(..., {role:'player'})` copy, not only the full state.
2. **The engine is deterministic:** same plans plus same seed give the same season. All luck comes from `drawsFor` (seeded tables).
3. **The audit workbook mirrors the engine formula by formula.** If you change the engine's arithmetic, change `audit.js` the same way and verify in Microsoft Excel: open the generated file, calculate, and the "Puan" sheet difference column must be ~0.
4. **Every Excel input rule is enforced on the server too** (`validateCasco`, `strategyFrom`, `marketingOver`). Excel validation is a convenience, not a guard.
5. **Marketing halves:** `marketing` is January–June, `marketing2` July–December, each ≤ half the budget and spent evenly over its six months. Only `marketing2` is a review lever. The cost is only what was bought (media + gifts handed out); unallocated budget and unused gift money stay in profit.
6. **Pre-race workbook uploads** are allowed only in the `decisions` phase. There is one review, after June, for 15 minutes (`STRATEGY_REVIEW_MONTHS`, `EXCEL_REVIEW_MINUTES`); the decision window is 20 minutes.
7. **Players rejoin by team name** when their device is offline (`excel-join`), even mid-race. Their identity lives in `localStorage`.
8. **Bump the asset version** (`?v=NN` in `dist/index.html` and in `dist/js/main.js` imports) on every UI change. Replace the number everywhere: `grep -rl "v=NN" dist | xargs sed -i '' 's/v=NN/v=NN+1/g'`.
9. **The participant data file is served by the Worker from R2** (`/data/katilimci-verisi.xlsx`, downloads as "Pricing Case Data.xlsx"). Do not put it back into `dist/`: as a static asset it went missing on some Cloudflare edges.
10. **Every UI string is bilingual:** `t('English', 'Türkçe')`. Room content uses `M(cfg, en, tr)`. Team-facing words: the decision file is the team's "strategy" (not "workbook"); the uploaded image is a "communication asset" ("iletişim materyali"). Names are capped generously (`NAME_MAX` 40, `PRODUCT_MAX` 60, `SENTENCE_MAX` 300); screens shorten them with `short()`.

## Style
- UI: hand-drawn sketch look (drawn borders, yellow highlighter), typeface IBM Plex Sans. Desktop and projector first; the owner does not want work on phone or tablet layouts.
- Code: match the surrounding comment density and naming. Comments explain why, not what.
- Commit messages: a short summary line, then a plain paragraph.

## Not in git
`veri/` (the case data), `oyun-varsayimlari.xlsx`, `simulasyon-*.xlsx`, `duyarlilik-analizi.xlsx`.
