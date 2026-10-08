# Developer notes

```
npm run dev      # Game server + site: http://127.0.0.1:8787 (Cloudflare Worker, local)
npm test         # engine, narrative and game-logic tests
npm run check    # syntax check
npm run deploy   # publish to Cloudflare (run `wrangler login` first)
```

## Jev AI rivals

The moderator can add a Jev-controlled rival from **Game settings → Jev AI rival**. Jev chooses only from legal strategy options; `dist/engine.js` still calculates every premium, claim, capital and score deterministically.

For local development, copy `.dev.vars.example` to `.dev.vars` and set `OPENROUTER_API_KEY`. For production, store the key as a Cloudflare secret:

```bash
npx wrangler secret put OPENROUTER_API_KEY
```

The Worker calls OpenRouter's Decisions endpoint with `typesafe/jev-1.13`, requests zero-data-retention routing, validates the returned strategy, and surfaces API errors to the moderator without changing room state.

## The game: a casco pricing race
Teams run casco (motor own-damage) insurers in one shared market. Only the moderator's screen is used; teams hand in their decisions as Excel workbooks.

- **Market:** the case-study data (`veri/pricing_case_data.xlsx`, 50,000 rows) is a *sample* of the market. `scripts/build-casco-market.py` turns it and the model config (`veri/insurers_league_model_config.xlsx`) into `dist/data/casco-market.js`: 563 city × channel × vehicle age × persona × customer type cells with their head count, last-term premium and competitor price index. The moderator sets the yearly policy count (Rule studio → Market & money); every cell gets exactly its sample share of it. Re-run when the data changes: `python3 scripts/build-casco-market.py` (defaults to `veri/pricing_case_data_duzeltilmis.xlsx` + the config).
- **Case data fix:** `python3 scripts/fix-case-data.py` rebuilds the data with claim amounts ×(1,753.90 ÷ 133.244) — the same Gamma draws at the corrected severity — into `veri/pricing_case_data_duzeltilmis.xlsx` (all sheets, VALIDATION recomputed; observed loss ratio 59.4%) and `veri/katilimci_verisi.xlsx` (what teams get: columns A–O plus a dictionary).
- **Calibration (done by the script):** the frequency and severity coefficient products are normalized to the portfolio as in the data (`freqNorm` ≈ 0.910, `sevNorm` ≈ 0.920, read from the data's combined-coefficient columns); the market premium coefficients are the data's own (COEFFICIENTS sheet; the config's city premium coefficients differ and are not used); the base severity is set so the reference premium reproduces the data's premiums (€1,753.90 — the config's €133.244 would give a 4.5% loss ratio against those premiums). Result: portfolio frequency 10%, average reference premium = the data's €294.67, market loss ratio ≈ 60% (the data's own expected LR), combined ≈ 80%.
- **Assumptions book:** `python3 scripts/build-assumptions-book.py` writes `oyun-varsayimlari.xlsx` (every variable and assumption, one topic per sheet, read from the engine).
- **Digital campaign (Marketing_Input.xlsx):** a team sends `campaign`% of its marketing to a social-media acquisition campaign (the rest still buys channel visibility through the focus %), splits it `mediaShare`% media / rest gifts, and picks one `offer` (concert, restaurant, coffee, gym — interest, click, hit, cost from the case). Media buys impressions at €10 per 1,000. One target group per month is shared by all teams: digital users × target share × decision budget ÷ €5m per team-year (the case's people per euro), × teams ÷ 12, × seasonality and the event demand of the campaign cells. Reach = impressions × min(1, audience ÷ all impressions); frequency = max(1, all impressions ÷ audience); above 5 the hit ratio is ×1.1. Customers = reach × interest × click × hit, spread over the Digital channel's cells by sample share × min(2, (offer ÷ reference)^(−β)), and capped at gift budget ÷ gift cost (unused gift money is spent anyway). Campaign customers are new policies at the team's own prices, with normal claims, channel expense and claims-ops load. Rules: `rules.campaign` (Rule studio → Digital campaign); the audit workbook has a Campaign sheet with the same formulas.
- **Decision workbook:** one team per file, in the case's own design (Marketing_Input.xlsx): sheets Input (guide + team name), Premium (base premium + 19 coefficient dropdowns, 0.50–2.50), Marketing (media/offer split, cost per reach, offers table, selected offer; plus marketing budget, campaign share and the channel table), Claim (claims operations, budget check, quota-share yes/no). `CASE_CELLS` in `dist/js/sheet.js` maps every decision to its cell; the reader turns that layout into the row checks and still accepts the old row-layout files.
- **Decisions:** coefficients 0.50–2.50 in steps of 0.05 (the data's risk relativities run ~0.70–1.75); marketing focus over the four sales channels, each at least 10%; campaign share and media share 0–100% in steps of 5; one gift. Workbooks from before the campaign still import (no campaign).
- **Claims:** from the model config only. Count ~ Poisson(base frequency × the five level coefficients), amount ~ Gamma(shape, base severity × coefficients). The sample's own claim columns are never read.
- **Decisions (per team):** a base premium, one price coefficient for each of the 19 levels (offer = base × the customer's five coefficients), a marketing budget with a focus split across the four channels, a claims-operations budget and a yes/no quota-share treaty with fixed terms and a fixed fee paid from the budget.
- **Customer choice:** each month a twelfth of the market buys a one-year policy. Every cell compares each team's offer with the rest of the market's price (reference premium × competitor index), channel visibility and claims-service reputation; how strongly depends on the persona (hidden from teams; Rule studio → Customer behaviour).
- **Accounts:** underwriting-year basis — a month's policies book their full premium, channel expense and ultimate claims when sold. Claims operations set the service score; overload lowers it and leaks claims cost.
- **Score:** profitability (profit / capital), premium share among the teams and customer satisfaction (average service score), weighted 50/30/20 by default. Negative equity rules a team out of the title.

## Flow
1. **Moderator** `/` → *Start a new game*. The browser stores the moderator key and moves to the stage (`#/stage`), the screen that gets projected.
2. **Lobby:** *Download template*, hand a copy to each team (or share one workbook), then *Import completed files* (several at once). Imports are validated against the current rules and merge by team name; 2–12 teams.
3. **Briefing:** the market's profile from the sample, the money and the scoring weights.
4. **Decisions → Start the race:** out-of-range values are brought to the nearest valid one (a notice appears on stage). Twelve months play out.
5. **Quarter reviews** (after March, June, September): *Download quarter file*, collect revised copies and import them. Only the base premium, coefficients, marketing, focus and claims operations change; reinsurance holds for the year. The pause runs ten minutes; unsubmitted teams keep their plan when the moderator closes it.
6. **Final:** podium, then *Detailed results* (decision attribution, the full plan, the book each team actually won) and *Past sessions*.

The workbook is vertical: one decision per row, one team per column; hidden column A holds machine keys so translated labels never break an import. It opens in Excel, Google Sheets, Numbers and LibreOffice.


## Rule studio (`#/rules`)
Editable only on the moderator's device; locks once the race starts. Sections: Scoring · Market & money (yearly policies, capital, budget, fixed cost, reinsurance fee, competition, coefficient bounds, seed) · Claims model · Segment coefficients (frequency, severity, market premium, channel expense ratio per level) · Customer behaviour · Marketing & service · Reinsurance · Event calendar (month, duration, scope = whole market or one level, claims and demand multipliers) · Balance test.

- Every numeric field comes from the `dist/js/rules.js` schema. The server validates against the same schema.
- Changing the yearly policy count rescales capital, budget, fixed cost, the treaty fee and imported teams' budgets in proportion.
- The **balance preview** plays six sample approaches through a year; the **balance test** plays hundreds of seasons and flags an approach that wins far more than its share.

Stage shortcuts: Space/Enter play/pause or close a quarter review · → next month · 1/2/3 metric · D team detail · F full screen.

## Structure
- `dist/casco.js` — the pure market engine (rules, money, validation, simulation, reference strategies). `dist/engine.js` — the façade the app imports: scenario, events, bilingual segment names.
- `dist/js/game.js` — game state and every action (`reduce`), the playback clock, quarter reviews and `viewFor`. Runs in the browser (optimistic) and in the Worker.
- `dist/js/sheet.js` — writes the `.xlsx` templates and reads filled workbooks without a spreadsheet library.
- `dist/js/views/` — `home`, `stage`, `settings`, `rules` (rule studio), `results`, `history`, `balance`, `plan`, `impact`.
- `dist/js/attribution.js` — re-runs the seeded season with one decision or event reset to measure what it was worth.
- `worker/index.js` — rooms (`Room` Durable Object per PIN) and session history (`Archive`). The moderator, view-only stage screens and team devices (`role=player`, a 24-hex device id) connect.
- `dist/js/jev.js` — Jev AI rivals choose a pricing view, target loss ratio, budget split, channel focus and reinsurance from finite options; the engine computes every result.

## Roles and privacy
- **Moderator:** connects with the key issued when the room was created. Only this device runs the game.
- **Team device, `#/team?pin=…` (also `#/join`):** the team names itself (`excel-join`; typing a name the moderator already added takes that card over), downloads its own template and uploads its own workbook (`excel-team-plan`, only for its own team) before the race and at each quarter review. Leaving hands the card back to the moderator.
- **`#/stage?pin=…`:** view-only on any other device. Team plans are withheld until the season ends; future months are withheld until they arrive.
