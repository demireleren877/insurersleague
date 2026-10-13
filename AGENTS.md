# AGENTS.md — Insurers League

Read this first, then `GELISTIRICI.md` (the full model and architecture). The owner writes in Turkish and wants short Turkish replies.

## What this is
A casco (motor own-damage) pricing workshop game. 2–12 teams compete for one shared market for 12 months. A team decides only two things:
- **Price:** a base premium and 19 segment coefficients (0.50–2.50, step 0.05).
- **Marketing:** a yearly wallet of €500k that runs a digital campaign — a media/gift split and four gift weights.

There are two trophies, **profit** and **market share** (gross premium share among the teams). There is no NPS, no capital, no reinsurance, no claims operations and no channel commission.

Costs each month: claims + fixed cost/12 (€664k a year) + 12% of written premium (`expenseRatio`) + marketing bought. The 12% was chosen so that underpricing hurts: break-even sits near a 68–70% target loss ratio, and a flat tariff never makes money. Composite score thresholds are `profitFloor` 0 and `profitTarget` 0.10.

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
5. **The marketing wallet:** a plan's `marketing` is spent evenly from the month it takes effect to December. A quarter revision may allocate only what is left. The cost is only what was bought (media + gifts handed out); unallocated budget and unused gift money stay in profit.
6. **Pre-race workbook uploads** are allowed only in the `decisions` phase. Quarter reviews run 15 / 10 / 5 minutes (`EXCEL_REVIEW_MINUTES`); the decision window is 20 minutes.
7. **Players rejoin by team name** when their device is offline (`excel-join`), even mid-race. Their identity lives in `localStorage`.
8. **Bump the asset version** (`?v=NN` in `dist/index.html` and in `dist/js/main.js` imports) on every UI change. Replace the number everywhere: `grep -rl "v=NN" dist | xargs sed -i '' 's/v=NN/v=NN+1/g'`.
9. **The participant data file is served by the Worker from R2** (`/data/katilimci-verisi.xlsx`, downloads as "Pricing Case Data.xlsx"). Do not put it back into `dist/`: as a static asset it went missing on some Cloudflare edges.
10. **Every UI string is bilingual:** `t('English', 'Türkçe')`. Room content uses `M(cfg, en, tr)`.

## Style
- UI: hand-drawn sketch look (drawn borders, yellow highlighter), typeface IBM Plex Sans. Desktop and projector first; the owner does not want work on phone or tablet layouts.
- Code: match the surrounding comment density and naming. Comments explain why, not what.
- Commit messages: a short summary line, then a plain paragraph.

## Not in git
`veri/` (the case data), `oyun-varsayimlari.xlsx`, `simulasyon-*.xlsx`, `duyarlilik-analizi.xlsx`.
