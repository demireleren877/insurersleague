# Developer notes

```
npm run dev      # Game server + site: http://127.0.0.1:8787 (Cloudflare Worker, local)
npm test         # engine, narrative and game-logic tests
npm run check    # syntax check
npm run deploy   # publish to Cloudflare (run `wrangler login` first)
```

## Jev AI rivals

The moderator can add a Jev-controlled rival from **Game settings → Jev AI rival**. Jev chooses only from legal strategy options; `dist/engine.js` still calculates every premium, claim, profit and score deterministically.

For local development, copy `.dev.vars.example` to `.dev.vars` and set `OPENROUTER_API_KEY`. For production, store the key as a Cloudflare secret:

```bash
npx wrangler secret put OPENROUTER_API_KEY
```

The Worker calls OpenRouter's Decisions endpoint with `typesafe/jev-1.13`, requests zero-data-retention routing, validates the returned strategy, and surfaces API errors to the moderator without changing room state.

## The game: a casco pricing race
Teams run casco (motor own-damage) insurers in one shared market. Only the moderator's screen is used; teams hand in their strategies as Excel files.

- **Market:** the case-study data (`veri/pricing_case_data.xlsx`, 50,000 rows) is a *sample* of the market. `scripts/build-casco-market.py` turns it and the model config (`veri/insurers_league_model_config.xlsx`) into `dist/data/casco-market.js`: 563 city × channel × vehicle age × persona × customer type cells with their head count, last-term premium and competitor price index. The moderator sets the yearly policy count (Rule studio → Market & money); every cell gets exactly its sample share of it. Re-run when the data changes: `python3 scripts/build-casco-market.py` (defaults to `veri/pricing_case_data_duzeltilmis.xlsx` + the config).
- **Case data fix:** `python3 scripts/fix-case-data.py` rebuilds the data with claim amounts ×(1,753.90 ÷ 133.244) — the same Gamma draws at the corrected severity — into `veri/pricing_case_data_duzeltilmis.xlsx` (all sheets, VALIDATION recomputed; observed loss ratio 59.4%) and `veri/katilimci_verisi.xlsx` (what teams get: only the columns the game uses — the five segments, final premium, competitor index, claim count and amount — plus a dictionary and a MARKETING sheet with the case's marketing inputs at this game's budget and audience). The site serves it as “Pricing Case Data.xlsx” from R2 (`/data/katilimci-verisi.xlsx`, bucket `insurersleague-data`); after rebuilding it run `npm run upload-data`.
- **Calibration (done by the script):** the frequency and severity coefficient products are normalized to the portfolio as in the data (`freqNorm` ≈ 0.910, `sevNorm` ≈ 0.920, read from the data's combined-coefficient columns); the market premium coefficients are the data's own (COEFFICIENTS sheet; the config's city premium coefficients differ and are not used); the base severity is set so the reference premium reproduces the data's premiums (€1,753.90 — the config's €133.244 would give a 4.5% loss ratio against those premiums). Result: portfolio frequency 10%, average reference premium = the data's €294.67, market loss ratio ≈ 60% (the data's own expected LR), combined ≈ 80%.
- **Assumptions book:** `python3 scripts/build-assumptions-book.py` writes `oyun-varsayimlari.xlsx` (every variable and assumption, one topic per sheet, read from the engine).
- **Digital campaign (Marketing_Input.xlsx):** the whole marketing budget runs a social-media acquisition campaign. A team splits it `mediaShare`% media / rest gifts and gives each of the four gifts (concert, restaurant, coffee, gym — interest, click, hit, cost from the case) a weight in `offers` (any percentage, total 100). Media buys contacts: €10 (`campaign.reachCost`) buys 100 contacts in the target group. One target group per month is shared by all teams: digital users × target share × marketing budget ÷ €5m per team-year (the case's people per euro), × teams ÷ 12, × seasonality and the event demand of the campaign cells. Distinct reach of all teams = audience × (1 − e^(−all contacts ÷ audience)), split by contacts bought, so every extra euro reaches fewer new people (`referenceBudget` €7.5m makes the group fill up within the budgets). There is no frequency bonus. Tuned (gift rates untouched): restaurant gift with ~40% media pays with diminishing returns, a 25/25/25/25 mix or 60%+ media loses money, the gym gift (€85) costs more than a customer earns. The ads show each gift by its weight: leads = reach × weight × interest × click, wanted = leads × hit × Σ pull, won = min(wanted, gift budget × weight ÷ gift cost). Customers spread over the Digital channel's cells by sample share × min(2, (offer ÷ reference)^(−β)). Campaign customers are new policies at the team's own prices, with normal claims. Rules: `rules.campaign` (Rule studio → Digital campaign); the audit workbook has a Campaign sheet with the same formulas, one block of columns per gift.
- **Decision workbook:** one team per file, in the case's own design (Marketing_Input.xlsx): sheets Input (guide + team name), Premium (base premium + 19 coefficient dropdowns, 0.50–2.50), Marketing (media/offer split, the budget per half-year in D14 — at the half-year review the same cell is July–December's budget — the cost of reaching 100 customers, the offers table with a weight column K16:K19). The first template of a room team that has not handed in a plan leaves the base premium (Premium!C5) empty; the review copy pre-fills the current plan and shows D14 as spent. `CASE_CELLS` in `dist/js/sheet.js` maps every decision to its cell. Workbooks from before the redesign (they still have a Claim sheet) are refused with a message to download the new template.
- **Decisions:** coefficients 0.50–2.50 in steps of 0.05 (the data's risk relativities run ~0.70–1.75); one marketing budget per half-year (the file's one cell fills `marketing` and `marketing2`; the half-year review file sets `marketing2`), up to half the yearly budget; media share 0–100% (any percentage); gift weights any percentage totalling 100. No channel focus, claims operations or reinsurance any more; plans saved with a single `offer` read as 100% on that gift.
- **Claims:** from the model config only. Count ~ Poisson(base frequency × the five level coefficients), amount ~ Gamma(shape, base severity × coefficients). The sample's own claim columns are never read.
- **Decisions (per team):** a base premium, one price coefficient for each of the 19 levels (offer = base × the customer's five coefficients) and the campaign (marketing budget, media share, gift weights).
- **Customer choice:** each month a twelfth of the market buys a one-year policy. Every cell compares each team's offer with the rest of the market's price (reference premium × competitor index); how strongly depends on the persona (hidden from teams; Rule studio → Customer behaviour). The campaign adds its customers on top.
- **Accounts:** underwriting-year basis — a month's policies book their full premium and ultimate claims when sold. Expenses = fixed cost (claims handling included, €200k a year) + 5% of written premium (`expenseRatio`) + channel commission on written premium (`rules.commission`: Agency 5%, Bank 10%, Digital 2%, Broker 10%; campaign customers buy through Digital) + marketing actually bought: the media and the gifts handed out. Calibration (6 balance bots, 40 seeds): data-based pricing makes ~12–13% of a fair slice (about €1,5M), break-even sits near an 80% target loss ratio, a flat tariff loses ~7%. Default events (`EVENT_TEXT` in `dist/engine.js`): currency depreciation March–August claims ×1.08, Istanbul hail June ×1.3, new-car loans July–August demand ×1.3, holiday traffic September ×1.03, online rival October–November digital demand ×0.8.
- **Trophy and score:** one trophy, the SVM Cup, by total points. Each component gives no points below its floor, 50 at the floor and rises in a straight line to 100 at its target: profit `profitFloor` €0 → `profitTarget` €1M (pro-rated during the year: a monthly fit to the business plan), market share — gross premium share among the teams — `shareFloor` 15% → `shareTarget` 18% (not pro-rated). Total = profit points + share points (0–200); ties are broken by profit. A combined ratio above `bankruptRatio` (135%) is bankruptcy: `row.bankrupt`, `eligible` false, ranked last and stamped BANKRUPT/BATTI on the results and the final. The profit thresholds scale with the policy count. `config.weights` is no longer used. The detailed results page is the trophy table.
- **Marketing and profit:** the marketing budget (€500k per team at the default market size) comes in two halves of €250k, a cap rather than money handed out: `marketing` for January–June and `marketing2` for July–December, each spent in six equal monthly parts (`monthlyMarketing`, `marketingSpent`, `halvesOf` in `dist/casco.js`). Nothing carries over. At the half-year review only `marketing2` can change (`QUARTER_KEYS` leaves `marketing` out). Only what the money bought is a cost: the media and the gifts handed out. Budget never allocated and gift money no customer took both stay in profit.
- **Policy file (results page → “Policy data (.xlsx)”, `dist/js/portfolio.js`):** the season as individual policies and claims, for teams to test the model. Each team-month's fractional cell counts (market and campaign, from `simulateTraced`) become whole policies by largest remainder; the engine's claim count is kept exactly, each claim lands on a policy in proportion to its expected frequency with a Gamma size around its cell's severity, and the sizes are scaled so the team-month total equals the engine's claim amount. A Reconciliation sheet puts the engine's figures next to COUNTIFS/SUMIFS over the rows. About 250k policies for 7 teams, ~3 MB, ~3 s in the browser.

## Flow
1. **Moderator** `/` → *Start a new game*. The browser stores the moderator key and moves to the stage (`#/stage`), the screen that gets projected.
2. **Lobby:** *Download template*, hand a copy to each team (or share one workbook), then *Import completed files* (several at once). Imports are validated against the current rules and merge by team name; 2–12 teams.
3. **Briefing:** the market's profile from the sample, the money and the scoring weights.
4. **Decisions → Start the race:** out-of-range values are brought to the nearest valid one (a notice appears on stage). Twelve months play out.
5. **Half-year review** (after June, 15 minutes; `STRATEGY_REVIEW_MONTHS` = [5]): *Download the half-year file*, collect revised copies and import them. Only the base premium, coefficients, the July–December budget, media share and gift weights change. The stage shows the first half's results table through the pause, with the teams' plan status and communication assets in a strip below; unsubmitted teams keep their plan when the moderator closes it.
6. **Final:** podium, then *Detailed results* (decision attribution, the full plan, the book each team actually won) and *Past sessions*.

In **Detailed results**, a team name opens its analysis dialog: the annual profit bridge and actual policy mix, monthly profit/share charts and accounts, campaign costs and gift performance, the plans applied in each half, and isolated decision/event contributions in euros and premium-share percentage points. `dist/js/team-analysis.js` derives the accounts from published monthly results; it never simulates hidden plans. Counterfactual attribution runs only on demand with complete plans and is shown only when the replay matches the published result. Contributions interact and must not be added together.

The workbook is vertical: one decision per row, one team per column; hidden column A holds machine keys so translated labels never break an import. It opens in Excel, Google Sheets, Numbers and LibreOffice.


## Rule studio (`#/rules`)
Editable only on the moderator's device; locks once the race starts. Sections: Scoring · Market & money (yearly policies, marketing budget, fixed cost, expense ratio, channel commissions, competition, coefficient bounds, seed) · Claims model · Segment coefficients (frequency, severity, market premium per level) · Customer behaviour (price sensitivity) · Digital campaign · Event calendar (month, duration, scope = whole market or one level, claims and demand multipliers) · Balance test.

- Every numeric field comes from the `dist/js/rules.js` schema. The server validates against the same schema.
- Changing the yearly policy count rescales the budget, fixed cost and imported teams' marketing in proportion.
- The **balance preview** plays six sample approaches through a year; the **balance test** plays hundreds of seasons and flags an approach that wins far more than its share.

Stage shortcuts: Space/Enter play/pause or close the half-year review · → next month · 1/2/3 metric · D team detail · F full screen.

## Structure
- `dist/casco.js` — the pure market engine (rules, money, validation, simulation, reference strategies). `dist/engine.js` — the façade the app imports: scenario, events, bilingual segment names.
- `dist/js/game.js` — game state and every action (`reduce`), the playback clock, the half-year review and `viewFor`. Runs in the browser (optimistic) and in the Worker.
- `dist/js/sheet.js` — writes the `.xlsx` templates and reads filled workbooks without a spreadsheet library.
- `dist/js/views/` — `home`, `stage`, `settings`, `rules` (rule studio), `results`, `history`, `balance`, `plan`, `impact`.
- `dist/js/attribution.js` — re-runs the seeded season with one decision or event reset to measure what it was worth.
- `dist/js/team-analysis.js` — reconciled monthly, half-year, campaign and portfolio summaries; `dist/js/views/team-analysis.js` — the results-page analysis dialog.
- `worker/index.js` — rooms (`Room` Durable Object per PIN) and session history (`Archive`). The moderator, view-only stage screens and team devices (`role=player`, a 24-hex device id) connect.
- `dist/js/jev.js` — Jev AI rivals choose a pricing view, target loss ratio, how much of the marketing budget to spend and a campaign mix (media share, gift weights) from finite options; the engine computes every result.

## Roles and privacy
- **Moderator:** connects with the key issued when the room was created. Only this device runs the game.
- **Team device, `#/team?pin=…` (also `#/join`):** the team names itself (`excel-join`; typing a name the moderator already added takes that card over), downloads its own template and uploads its own workbook (`excel-team-plan`, only for its own team) before the race and at each quarter review. Leaving hands the card back to the moderator.
- **`#/stage?pin=…`:** view-only on any other device. Team plans are withheld until the season ends; future months are withheld until they arrive.
