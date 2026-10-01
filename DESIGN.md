# Design system: sketchbook

**Direction:** the game looks hand-drawn, as if the whole league were planned in a notebook and raced on a whiteboard. It is still a strategy simulation: the sketch language stays disciplined, with one stroke weight, a strict grid, legible data and doodles used sparingly. Workshops happen in lit rooms with a projector, so everything sits on white paper with ink-black strokes.

Tokens live in `dist/css/base.css`. Component files add their own surfaces to the shared recipes described below.

## Materials

| Material | How it is made | Used for |
|---|---|---|
| Paper | `--paper` #FFFFFF with a faint dot grid (`--paper-dots`) | Page and overlay backgrounds |
| Ink stroke | `border: var(--stroke) solid var(--ink)` (2px, #1E1E1E) with an uneven hand-drawn radius (`--sk-a` … `--sk-d`) | Every card, button, input and tile |
| Second pass | An `::after` stroke at 1.5px, 34% opacity, using a different radius variant and offset 1–3px | Main surfaces, so shapes read as drawn twice |
| Hatching | `repeating-linear-gradient(-45deg, pen 0 1.6px, transparent 1.6px 6px)` over a light fill | Anything that measures: race bars, gauges, budget, podium blocks, weight bars |
| Highlighter | `--hl` #FFD43B as a band behind text or as a button fill | The primary action and "this is you" |
| Marker circle | One scribble SVG (`--scribble`) used as a CSS mask; colour comes from `--mark` | Positions (P1 gold, P2 silver, P3 bronze), countdown, locked-in count |
| Sticky note | Pastel fill, 1px hairline, small hard shadow, rotated ±0.7° | News: market flash, pit-wall messages, trade-off, badges, toast |
| Stamp | 3px coloured border, uppercase, rotated −3° to −12° | *Parc fermé*, LOCKED on the product card |

**Rules:**
- Rotations are reserved for sticky notes, stamps and small doodles. Cards and data rows stay square to the grid.
- A surface is either drawn (ink stroke) or washed (`--ground`, dashed 1.5px border). Never nest two drawn cards.
- Pages clip horizontal overflow (`overflow-x: clip`). This keeps the second pass from causing sideways scrolling.
- An element that carries the second-pass `::after` must stay positioned (`relative`, `sticky`). Otherwise the stroke attaches to the page.

## Colour

Colour means something or it isn't used.

**Ink**

| Token | Value | Use |
|---|---|---|
| `--ink` | #1E1E1E | Text and strokes |
| `--ink-2` | #45474A | Secondary text |
| `--ink-3` | #686B70 | Tertiary text, including placeholders |
| `--ink-4` | #ADB5BD | Decoration only, never text |

Every text step passes 4.5:1 on white and on the wash.

**Action**
- `--hl` yellow is the only action colour: the next step (`.btn.go`), the current tab and "your row".
- `.btn.gold` is ink-filled, for a committed secondary action.

**Semantics.** Each has `-ink` for text, `-fill`/`-mark` for drawn fills and pens, and `-soft` for washes:

| Meaning | Colour |
|---|---|
| Up / gain | Green |
| Down / loss | Red |
| Warning / changed | Orange |
| Fastest lap | Purple |
| Information / links | Sky |

**Score components.** Each wears one fill everywhere: profit #FFE066, share #A5D8FF, experience #B2F2BB (`--comp-*`).

**Team liveries**
- Liveries are the pastel `TEAM_COLORS`, always with an ink outline and ink glyph.
- For text in a team colour, use `--team-ink` (the colour mixed 50% with ink). `--team-edge` is the hatching pen and `--team-soft` the wash.
- These are resolved wherever `--team` is set inline (`[style*="--team"]`); `--c` gets the same treatment for quiz answer colours.

## Type

A single family: **Shantell Sans** (Google Fonts, variable). Its informality axis does the work that a second typeface would otherwise do.

| Role | Weight | INFM | BNCE | Use |
|---|---|---|---|---|
| `--hand-body` | 400 | 16 | 0 | Reading text |
| `--hand-ui` | 650–700 | 45 | 0 | Buttons, labels, tabs |
| `--hand-num` | 650–800 | 62 | 0 | Figures (tabular) |
| `--hand-display` | 700–800 | 100 | 16 | Headlines, race numerals |

- `font-variation-settings` is not merged per axis, so every role sets the full list.
- `.tag`-style uppercase labels (letter-spacing .06–.1em) are used only for small data labels, never above every section.
- Turkish glyphs and ₺ are covered. Digits are tabular, so animated stage values don't jitter.

## Surfaces

**Home.** A hand-lettered headline with a highlighted answer ("Who wins?"). A pen arrow points from the pitch to the join card, and the PIN is entered in a drawn box. The line-of-business picker highlights the chosen preset.

**Team phone.**
- The paddock is a name card in the team's colour, with the box number circled.
- *Parc fermé* gets a green stamp.
- Start lights are an ink-filled gantry.
- **Race HUD:** the position is circled in podium or team ink. Interval tiles turn green (*Attack*) or red (*Defend*) within 1.5 points. The timing tower highlights your row. Telemetry is hatched by component, followed by the season haul. The pit wall is a column of sticky notes explaining the lap.
- A pit stop is a drawn card with the pit clock. The chequered flag is a drawn checker strip, and the finishing position is circled.
- The 12-lap strip is the signature. Months are coloured against the field's median gain: purple for the fastest in the field, green for at or above the median, amber for below it. Pit stops after months 3, 6 and 9 are marked with ink ticks.

**Stage (projector).**
- A whiteboard. Lanes are drawn rows and slide as ranks change, so every overtake matches a real rank change.
- Bars are hatched in the team colour, with the team's tile riding at the nose. Positions 1–3 are circled in gold, silver and bronze throughout the race.
- Market news arrives as a sticky note, and the market pulse is a ruled strip along the bottom.
- Overlays (lobby, briefing, decision window, quiz, review, finale) share the paper background. The countdown is circled in red. The finale podium is hatched in metals, and badges are sticky notes.

**Moderator pages.**
- The rule studio, results and settings drawer are drawn cards on dotted paper.
- "Changed" values are orange with a pencil mark (✎). The active section is highlighted in yellow.
- **Balance test** (rule studio tab): the verdict is a stamp on a washed card (green balanced, orange leaning, red dominant). Win-rate bars are hatched in each profile's colour, with an ink tick at the fair share (one season in six). The live preview aside is hidden on this tab so the table gets the full width.
- **Past sessions:** per line of business, winning approaches are drawn as highlighter bars. Picked sessions get a yellow outline and go into a side-by-side table whose row labels stay pinned while it scrolls. The history code sits in a dashed box.

## Fitting text

Handwriting is wider and taller than a UI sans, so text is fitted deliberately:

- **Names are never cut.** Team names (up to 16 characters) and product lines wrap to a second line: tower rows, entry lists, lane subtitles, the moderator's lists, medals and badges.
  - The only exception is the phone header at 360px and below. It keeps the name and drops the product line, so the sticky header keeps its height.
- **Ellipsis is reserved** for free-text previews that can be expanded, such as a collapsed quiz question (two lines, then "…").
- **Line height is at least 1.2** on single-line clipped text. Otherwise the tails of ğ, ş, ç, g and y are cut.
- **Inputs are sized in digits** (`ch`), so the longest legal value always fits.
  - Long free text uses a text area: the strategy sentence and option descriptions. Event titles grow to fit (`field-sizing: content`).
  - Dropdowns whose options are phrases get a full row.
- **Large buttons** (`.lg`, `.xl`) may wrap their label on a phone. Buttons that share a row with text keep their natural width.
- **Stage columns are sized for their longest value in every metric** (profit values such as "−₺803,8 bin" included). The new-leader strip allows two lines.

## Motion

Motion changes only with state: lanes slide on rank changes (750ms), a new leader's strip sweeps in, and fresh stats flash their wash once. Selected surfaces tilt slightly on hover. The hold-to-lock button fills with hatching over 0.9s; it keeps its real duration under reduced motion because it is a progress indicator. Everything else is instant under `prefers-reduced-motion` or the in-app "Reduce animations" setting.

## Accessibility

- Focus is a dashed sky outline.
- Colour is always paired with a sign, glyph or label (▲▼, check or cross, emblem + code).
- Touch targets are at least 36px, and 44–56px for primary actions.
- The layout holds from 320px phones to 1920×1080 projection with no horizontal scroll.
- Portrait tablets and phones get a dedicated moderator workspace instead of a shrunken stage.
