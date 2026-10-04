# Handoff: Rehearse — benchmark harness for an instruction corpus

> Design reference from 2026-09-04, not an inventory of shipped features.
> Read the [handoff index](README.md) for implementation scope and vocabulary.

## Overview

Rehearse is a local-only developer tool (runs on the engineer's machine, opens in their browser, single user) for benchmarking an *instruction corpus* — the project instruction file, skills, and rubrics an engineer writes for their coding agents.

The problem: engineers edit those instructions on a hunch and never learn whether an edit helped, because they are never working on the same task twice. Rehearse freezes a task, runs an agent against it under a known corpus version, grades the result, and lets the engineer change one instruction, run it again, and see what moved.

**The core loop the product is built around** (stated by the owner): *edit one instruction file → replay a single step from a checkpoint against it → compare that attempt to the previous one at the same checkpoint.* Full task runs are rarer and expensive. Every screen must serve that loop first.

### Three non-negotiable product rules

These are not styling preferences. Violating any of them makes the tool actively misleading:

1. **A single run is never presented as a score.** Identical reruns of the same task vary severalfold — by up to two letter grades in the reference data. Any single grade must be readable as one data point. Comparisons carry a baseline arm so verbosity cannot be mistaken for improvement.
2. **Every number names the corpus version that produced it.** A result whose corpus has changed since is worthless, and the user must never confuse the two. Every grade, row, and card carries a `corpus@<hash>`, and stale/superseded records are marked as such and excluded from comparisons.
3. **A run stopping at a bad grade is a normal outcome, not an error.** Never style a stopped run as a failure state — no red alert treatment, no error iconography. The step that fell below the minimum *is the finding*.

## About the Design Files

`prototype.html` in this bundle is a **design reference created in HTML** — a prototype showing intended look, structure, and behavior. It is **not production code to copy directly**. It uses a custom streaming-template runtime (`support.js`) that exists only in the design environment; do not port that runtime.

The task is to **recreate this design in the target codebase's existing environment** — React, Vue, Svelte, whatever the Rehearse backend already serves — using its established patterns, component library, and routing. If no frontend exists yet, choose the most appropriate framework for a local single-user tool that reads from disk and streams live run state, and implement the designs there.

All the visual and behavioral specification you need is in this README. The HTML is the reference for anything ambiguous.

## Fidelity

**High fidelity.** Final colors, typography, spacing, density, and interaction behavior. Exact values are listed in Design Tokens below. Recreate the UI faithfully using the codebase's existing libraries; where this design's tokens conflict with an existing design system in the codebase, the existing system wins for primitives (button chrome, focus ring implementation) but this design's *density, information hierarchy, and status vocabulary* should be preserved.

## Domain model

Get these four nouns right; the whole UI is organized around them. The owner settled this vocabulary explicitly.

| Noun | Definition |
| --- | --- |
| **Step** | One agent session with instruction files coming in and artifacts coming out, followed by an independent judge. The unit that gets graded and replayed. |
| **Task** | A chain of steps against a base repository. Judged *as a whole* from the first input and the last artifact only — the task judge does not look inside the intermediate steps. |
| **Case** | A task **plus** the corpus, judges, and thresholds it runs under. What you actually run. |
| **Run** | One execution of a case. A durable record on disk. Runs contain step records and (when the task completed) a task grade. |

Consequences to honor in the implementation:

- Because a task is judged only on first input and last artifact, **the same work as four steps and as one step produce comparable task grades.** That comparison is the point of the one-step variant (`auth-refactor-single` in the reference data). Do not compute a task grade by averaging step grades.
- **A task that stopped early is not gradable at task level** — there is no final artifact. Show `—` with the reason, not a zero and not an error.
- Tasks and their judges are intended to be shareable/importable later (import/export are drawn but disabled). Keep task declarations as portable data — the reference model is `tasks/*.yaml` on disk, with cases pinning corpus + judges + thresholds separately, so someone else's task is useful without their thresholds.

Reference data used throughout: task `auth-refactor` = 4 steps (Spec review → Plan → Implement → Verify) against `omelette-web @ main…e91f2a`, minimum grade `B−`, current corpus `corpus@a41c7e`.

## Global chrome

### Left sidebar — 222px fixed, `#14161f`, 1px right border `#292b31`

Top block: product name "Rehearse" (15px/500, letter-spacing −.01em) with version `v0.6.2` (mono 10px, `#75798c`) on the same baseline. Beneath it a bordered corpus card (`#1c1e2b`, 1px `#2f3140`, radius 6px, padding 7px 8px):
- label "CORPUS UNDER TEST" (10px, letter-spacing .09em, uppercase, `#75798c`)
- `corpus@a41c7e` (mono 11.5px, `#d2cefd`) + `14 files` (mono 10px, `#9397ab`)
- `✓ clean · no edits since 09:12` (10.5px, `#9397ab`)

This card is load-bearing: it is the always-visible answer to "which corpus am I looking at."

Nav list: 8 items, each a full-width button, padding 6px 8px, radius 6px, 9px gap, with a 2px left border that is `#9184d9` when current and transparent otherwise. Icon (Phosphor regular, 15px, opacity .85) + label + right-aligned count badge (mono 10px, `#75798c`). Selected: background `rgba(145,132,217,.16)`, text `#d2cefd`, `aria-current="page"`.

Items in order, with badge source:

1. **Run history** — `ph-list-dashes` — record count (148)
2. **Live monitor** — `ph-activity` — count of in-flight runs (1)
3. **Run detail** — `ph-file-text` — no badge
4. **Comparisons** — `ph-git-diff` — 7
5. **Corpus** — `ph-scroll` — file count (14)
6. **Tasks** — `ph-graph` — task count
7. **Cases** — `ph-cube` — case count
8. **Calibration** — `ph-scales` — review count (41)
9. **Settings** — `ph-sliders-horizontal` — no badge

**Derive every badge from the collection it links to.** A nav count that disagrees with its own list is a credibility bug in a tool whose premise is that numbers name their source. (This was caught in review as a real defect.)

Sidebar footer (prototype-only, drop in production): a toggle between demo records and fresh-install state.

### Persistent run status bar — 38px, full width, bottom, above nothing

Visible from **every** screen whenever a run is in flight. The owner's requirement: "I start a run and go do something else, so I need it visible from anywhere without it taking the screen."

Background `#1c1e2b`, 1px top border `#3f424d`, 12px text, items separated by `│` glyphs in `#3f424d` (decorative, `aria-hidden`). Contents left to right:

- pulsing `●` (`#b5abfc`, 1.4s ease-in-out opacity 1→.28 loop)
- run id `r-0148` (mono, `#d2cefd`)
- case name `auth-refactor` (`#b2b6ca`)
- `step 3 of 4 · Implement` (`#e9e9ed`) + `judge grading` (`#9397ab`)
- spend: `$1.83` (mono, `#e9e9ed`) `/ $20.00` (`#75798c`) + a 76×5px progress track (1px `#3f424d`, radius 3px, fill `#796cbf`)
- elapsed `06:12` (mono, `#b2b6ca`)
- `grades so far A− B+` (`#75798c`)
- right-aligned: **Open monitor** (accent-bordered) and **Stop** buttons

Container is `role="status" aria-live="polite"`. Announce meaningful transitions (step accepted, step stopped, ceiling approached) — not every dollar tick, which would make the live region unusable.

## Screens

### 1. Run history — the default screen

**Purpose.** "Open on run history, newest first. The durable record is what I come back to." This is the landing view.

**Layout.** Vertical stack: header, filter bar, scrolling table.

Header (padding 14px 20px 12px, 1px bottom border `#292b31`): `h1` "Run history" (17px/500, −.01em); subline 11.5px `#75798c`: "148 records on disk · newest first · every row names the corpus version that produced it". Right side: **Replay a stage** (1px `#3f424d`, with keyboard hint `R` in mono 10px) and **New run** (1px `#9184d9`, text `#d2cefd`, hint `N`).

Filter bar (padding 9px 20px, 1px bottom border): label "FILTER" then pill buttons — All 148 / Running / Stopped / Replays / Groups / Clean corpus only. Pills: padding 4px 10px, radius 99px, 11.5px; selected = `rgba(145,132,217,.16)` bg, `#9184d9` border, `#d2cefd` text, `aria-pressed`. Right-aligned search input (`ph-magnifying-glass` 13px + 210px input) placeholder "case, corpus hash, blocker id".

Table, 12.5px, `<caption>` "DURABLE RECORDS" (visually a section label), sticky `<thead>` (`#161826` bg, `box-shadow: inset 0 -1px 0 #292b31`). Column headers 10px uppercase .08em `#75798c` weight 500. Rows separated by 1px `#232532`, hover `#1c1e2b`, cells padding 9px 12px (20px on the outer edges), vertical-align top.

Columns:

| Column | Content |
| --- | --- |
| **Run** (`<th scope="row">`) | Run id as a link-styled button (mono 12px, `#d2cefd`, 1px bottom border `#423a6a`) + timestamp beneath (11px `#75798c`) |
| **Case** | case name (mono 11.5px) + kind beneath (`task · 4 steps`, `replay step 3 · ckpt-0147-s2`, `group · 6 attempts`, `single session · checks`) |
| **Outcome** | status glyph + phrase, e.g. `● running · step 3 of 4`, `◼ stopped at step 3`, `✓ accepted`, `⊘ interrupted`; second line gives the reason (`Implement D · below minimum B−`, `spend ceiling reached mid-step 2`) |
| **Step grades** | mono 12px, letter-spacing .04em, one token per step with `·` for steps that did not run: `A− B+ D ·` |
| **Task grade** | mono 13px/700 + note beneath: `—` / `pending`, `—` / `no final artifact`, `n/a` / `step replay only`, `B` / `graded independently` |
| **Corpus** | `corpus@a41c7e` (mono 11.5px `#b2b6ca`) + staleness beneath with glyph: `✓ clean`, `⚠ stale · corpus changed since`, `⚠ superseded · 2 versions back` |
| **Cost** | right-aligned mono 12px |
| **Wall** | right-aligned mono 12px `#b2b6ca`; live for the running row |

Footer prose under the table (11.5px `#75798c`, max 70ch): "A stopped run is a recorded outcome, not an error: the step that fell below the minimum is the finding. Runs marked stale were produced by a corpus version that has since changed — their grades are kept as history and excluded from comparisons." This copy carries product rules 2 and 3; keep it.

**Empty state** (fresh install with corpus linked but no runs): header with "0 records on disk"; centered left-aligned block ≤44ch containing a small ASCII box drawn in mono 11px `#3f424d`, `h2` "No runs recorded", prose "The corpus is linked and a spend limit is set. Declare a case, then run it. Every attempt lands here as a durable record.", and a **Declare a case** button. No illustration, no marketing.

---

### 2. Live monitor — the most designed screen

**Purpose.** The owner's words: "It is the screen I have never had and the one where money is being spent while I watch." Money and position first, then the graph, then the detail.

**Layout.** Four bands, top to bottom: identity header → spend band → task graph (max 60% height, own scroll) → two-column session + judge (min-height 230px so the judge can never be squeezed out).

#### 2a. Identity header
padding 12px 20px, 1px bottom border. Pulsing `●` + `h1` "Run **r-0148** in progress" (16px, id in mono); case name (mono 11.5px `#9397ab`); corpus pill (`corpus@a41c7e`, padding 2px 8px, radius 99px, 1px `#423a6a`, `#d2cefd`); then `target omelette-web @ main…e91f2a · sonnet-4.6 · effort high` (11.5px `#75798c`, identifiers in mono). Right: **Pause after this step** and **Stop & restore repo** (the second names its consequence — the repo restore is not a side effect the user should discover).

#### 2b. Spend band — `#1a1c28`, padding 12px 20px, 1px bottom border

A row of figures, then a ceiling meter. Figures: each has a 10px uppercase .09em `#75798c` label above the value.

- **Spent this run** — `$1.83` in mono **26px**/500, letter-spacing −.02em, `#e9e9ed`, with `of $20.00 limit` beside it (mono 12px `#9397ab`). This is the largest number on the screen by design.
- **Burn rate** — `$0.29` + `/min` (11px `#75798c`)
- **Elapsed** — `06:12` mono 15px
- **Tokens in / out** — `842k / 31k` mono 15px `#b2b6ca`
- right-aligned: **Remaining step 4, at current rate** — `≈ $0.90 · 3m`

Ceiling meter: 9px tall, 1px `#3f424d`, radius 5px, track `#161826`. Fill is a **diagonal repeating stripe** — `repeating-linear-gradient(115deg, #796cbf 0 6px, #5d5294 6px 12px)` — so it reads as filled without relying on hue, plus a 1px `#e9e9ed` tick at the fill edge extending 3px past the bar top and bottom. Meter is `role="img"` with `aria-label="Spent 1.83 dollars of a 20.00 dollar ceiling"`. Below: `$0.00` … `44% of ceiling used · stops mid-step at the ceiling` … `$20.00` (mono 10.5px `#75798c`).

The "stops mid-step at the ceiling" phrasing matters — the ceiling is a hard stop, not a warning.

#### 2c. Task graph — `#181a26`, `flex: 0 1 auto; max-height: 60%; overflow-y: auto`

The owner asked for "a visual graph-like freeform flowing thing, just like some CI runners have, where they have boxes that attach to other boxes." Current workflows are **linear only**, so this is a horizontal chain of node cards with connectors; build the layout so branching can be added later, but do not build a freeform canvas now.

Graph header row (padding 8px 16px 0): `h2` "TASK · AUTH-REFACTOR · 4 STEPS, IN ORDER" (10px uppercase .09em `#75798c`); hint "click a step to bring its session and judge below" (11px `#9397ab`); right-aligned legend `✓ accepted · ● running · ○ queued · ◆ checkpoint` (10.5px, `aria-hidden` — the legend is a reading aid, every glyph is also labeled in words at its use site).

The chain is an `<ol>`, `display:flex`, `min-width: max-content`, inside a horizontally scrolling wrapper (padding 10px 16px 12px). Each `<li>` holds: node card + a vertical action stack + a connector (omitted after the last node).

**Node card** — 252px wide, padding 10px 12px, radius 8px, 1px border, `display:flex; flex-direction:column; gap:7px`. Border: `#9184d9` when selected, `#5d5294` while running, `#2f3140` otherwise; background `rgba(145,132,217,.16)` when selected. `aria-current="step"` on the selected node. Contents in order:

1. Row: step number (mono 10.5px `#75798c`) · step name (13px `#e9e9ed`, flex 1) · **grade** (mono 19px/700, line-height 1)
2. Row: status glyph (pulsing if running) + status words (11.5px `#b2b6ca`) — `accepted`, `judge grading`, `queued`
3. **Live tool call**, only while running: a full-width chip, 1px `#423a6a`, radius 5px, bg `#1c1e2b`, mono 10.5px `#d2cefd`, `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` — e.g. `judge: reading cited spans`
4. 2×2 mono 10.5px `#9397ab` grid: cost · duration · `2 of 4 fired` · corpus hash
5. Checkpoint line above a 1px dashed `#3f424d` top border: `◆ ckpt-0148-s1` (`#b2b6ca`) or `◇ no checkpoint yet` (`#75798c`)
6. Contribution phrase (11px `#9397ab`): what the step's record says it produced, such as `produced 1 commit, 2 files changed`, until an analysis of the ended run gives one agent's reading of the step; `contribution pending` while the step has neither, `not started`
7. In/out counts (mono 10.5px `#b2b6ca`, two columns): `↓ 5 instruction files in` · `↑ 2 artifacts out`

**Action stack** beside each card (vertical, 4px gap, centered): **in / out ▸** (opens the step modal, `aria-label="Implement — instructions in, artifacts out"`) and **replay** (`aria-disabled="true"` with `aria-label="Verify has no checkpoint to replay from"` when there is no checkpoint).

**Connector**: 24px × 1px line + a small `▶`, colored `#5d5294` when the upstream step was accepted and `#3f424d` otherwise, `aria-hidden` (order is conveyed by the `<ol>` and the step numbers).

Graph footer prose (11px `#75798c`): "Minimum grade for every step in this task is **B−**. A step below it stops the run and restores **omelette-web** to **main…e91f2a**. A step shows what its record says it produced until an analysis of the ended run gives one agent's reading of its contribution to the task's final grade."

#### 2d. Session pane + judge pane — `grid-template-columns: minmax(380px,1fr) minmax(320px,.8fr)`, container `min-height: 230px`, horizontal scroll if narrower

Both panes follow the selected graph node.

**Session pane.** Header (padding 9px 14px, 1px bottom border): `h2` "STEP 3 · IMPLEMENT" (12px uppercase .04em `#9397ab`); meta `session closed · 1,284 lines · 4m02s · $1.12` (mono 11px `#75798c`); right-aligned link "open session.jsonl".

Body: mono 11.5px, line-height 1.7, three columns per line — line number (44px, right-aligned, `#4a4d5c`), kind (64px, `#75798c`: `assistant` / `tool` / `result`), text (wrapping, `#e9e9ed` for assistant, `#b2b6ca` for tool, `#9397ab` for result).

**Only the spans a judge cited are stored and shown.** The owner: "Sessions run to thousands of lines and I read them to check a verdict, not for their own sake." At the end of the stored spans, an inline note (Inter 11.5px, bordered `#2f3140` box) says so and links out to the file on disk: `runs/r-0148/step-3/session.jsonl`.

Footer (7px 14px, 1px top border, 11px `#75798c`): pulsing `●` + "Following tail · `j/k` to scroll, `f` to unfollow" and right-aligned "tool calls collapsed (34)".

**Judge pane.** Background `#181a26`. Header: `h2` "JUDGE · STEP 3", pulsing `●`, "grading" (`#b5abfc`), right-aligned `independent session · $0.08` — the judge being a separate priced session is information the user needs.

Body, in this order (the owner's stated priority: "blockers and grades, evidence on click"):

1. **Verdict + grade card** (padding 10px 12px, 1px `#3f424d`, radius 7px, `#1c1e2b`): left = "VERDICT" label + glyph + phrase (`◌ pending — dimensions still returning`); right = "GRADE" label + mono 22px/700 value (`—` in `#595d6c` while pending).
2. **Hard blockers** — `h3` "HARD BLOCKERS · 4 of 4 evaluated". List rows: padding 7px 10px, radius 6px. Fired = 1px `#5d5294` border, `rgba(145,132,217,.10)` bg, glyph `✕`, word `FIRED`. Clear = 1px `#2f3140`, transparent, glyph `✓`, word `CLEAR`. Row content: glyph · blocker id (mono 11.5px) · state word (10px uppercase) · evidence toggle button (`2 cited` / `hide evidence` / `no evidence`, `aria-expanded`, `aria-disabled` when none).
3. **Quality dimensions** — `h3` "QUALITY DIMENSIONS · 3 of 5 returned". Rows: name (11.5px; `#75798c` when still pending) · a 5-cell mono bar `▮▮▯▯▯` (`aria-hidden`, `#4a4d5c`, letter-spacing .12em) · grade (mono 13px/700, 26px right-aligned) · evidence toggle.
4. **Variance note** (1px `#2f3140`, radius 7px, `#1c1e2b`): "READ THIS AS ONE ATTEMPT — Identical reruns of this case have varied by two letter steps here. A single grade is a data point, not a score — *compare arms* to say whether an edit moved anything." The link goes to Comparisons. **This is product rule 1 made visible; do not cut it.**

**Expanded evidence** (the disclosure target for both blockers and dimensions): a block with a 2px left border `#5d5294`, bg `#161826`. Per evidence item: a source chip (`transcript` / `diff` / `instruction`, mono 10.5px, 1px `#3f424d`, radius 4px), a locator link (`session.jsonl:1284`, `src/auth/tokens.ts +38 −12`, `skills/implement.md:43`) that opens the file on disk, then a `<blockquote>` of the cited span — mono 11.5px `#e4e7f5`, `white-space: pre-wrap`, 1px left border, padding 6px 9px.

Every judge claim must be traceable to a source the user can open. That is the whole reason evidence exists: "the cited evidence is what I read when I want to argue with the judge."

---

### 3. Step modal — reached from any node's **in / out ▸**

`role="dialog" aria-modal="true"`, max-width 860px, max-height 86vh, 1px `#595d6c`, radius 10px, `#1c1e2b`, `box-shadow: 0 16px 40px rgba(0,0,0,.65)`. Overlay `rgba(10,11,17,.66)`. Esc closes; the Esc affordance is also a visible button. Trap focus, restore focus to the invoking node on close.

Header: step number (mono 10px .09em) · `h2` step name (15px) · `skills/implement.md · $1.12 · 4m02s` (mono 11px `#9397ab`) · right: `verdict pending` + grade (mono 20px/700) + Esc button.

Body, two equal columns:

**Left — what went in.**
- `h3` "INSTRUCTIONS THIS STEP LOADED" then a bordered list (1px `#2f3140`, radius 7px). Per file: path (mono 11.5px) + hash (mono 10.5px `#75798c`) on the first line; role + changed-state on the second (10.5px) — role is one of `project instructions`, `step skill`, `judge rubric`, `read for context`; state is `✓ unchanged` (`#9397ab`) or `⚠ changed since this run` (`#b2b6ca`).
- `h3` "ARTIFACTS IN" — rows with `↓`, artifact name (mono 11.5px), and the originating step (`step 02 · Plan`, `step 02 checkpoint`, `task declaration`).

**Right — what came out and what to do.**
- `h3` "ARTIFACTS OUT" — rows with `↑`, name, detail; 1px `#5d5294` border and `rgba(145,132,217,.08)` bg to distinguish outputs from inputs. Detail carries findings where relevant: `+38 −12 · outside declared scope`. Omit the section when there are none (queued step).
- `h3` "JUDGE" — one-line summary (`2 of 4 blockers fired · 3 of 5 dimensions returned`), then **Full step report** (navigates to Run detail) and a `session.jsonl on disk` link.
- `h3` "OPERATE ON THIS STEP" — **Replay from checkpoint** (live, accent border) plus **Edit this step** and **Edit its skill**, both `aria-disabled` and followed by: "Editing a step or its instructions writes a new corpus version and marks the results it invalidates. Planned for a later version."

This modal is what makes the read-only graph sufficient: clicking a node gives you its inputs, outputs, grade, and every operation without a separate editing surface.

---

### 4. Run detail — three layouts, user-switchable

Header: back button "← History"; `h1` `r-0147` + case name; meta line `◼ stopped at step 3 · below minimum B− · 04 Sep 09:41 · 6m12s · $2.41 · sonnet-4.6 / high`; right side: corpus pill, a segmented **layout switcher** (`role="group" aria-label="Run detail layout"`, options Step rail / Record ledger / Contribution, `aria-pressed`), and **Replay step 3**.

Restore banner beneath the header (`#1a1c28`, padding 8px 20px, 11.5px `#b2b6ca`): `ph-arrow-counter-clockwise` + "Repository restored to **omelette-web @ main…e91f2a**. Checkpoints from steps 1–2 are retained and replayable." Right-aligned, the current layout's one-line rationale.

The three layouts exist because the owner said this is where they had least idea what good looks like. Ship all three switchable, or pick one after use — but if you pick one, **Step rail** is the daily driver and **Contribution** is the one that answers "why did the run end this way."

#### 4a. Step rail (`grid-template-columns: 300px minmax(0,1fr)`)
Left rail: "STEPS & CHECKPOINTS" list (same node vocabulary as the graph, vertical), then **"ATTEMPTS AT CKPT-0147-S2"** — the loop's payoff. Each attempt card (1px `#2f3140`, radius 7px, `#1c1e2b`): attempt id (mono 11.5px `#d2cefd`) + grade (mono 13px/700); corpus hash beneath; then `✓ current corpus` or `⚠ stale · corpus changed`. Below the list, **Compare these attempts** → Comparisons.

Right pane: step report. Title block (`h2` "Step 3 · Implement", meta `skills/implement.md · 4m02s · $1.12 · 1,284 transcript lines`) with two right-aligned stat cards — Grade (mono 24px/700 + `min B−`) and Verdict (`◼ stop` + `2 blockers fired`). Then, max-width 900px: Hard blockers (same rows as the judge pane), Quality dimensions (with a note column, max 38ch), and **"INSTRUCTIONS THIS STEP READ"** — a bordered table of path · hash · `✓ unchanged` / `⚠ changed since this run`. That last table is how the user knows whether this record still means anything.

#### 4b. Record ledger (single column, max-width 1000px)
One `<article>` per step, top to bottom — the whole durable record. Card header (1px bottom `#2f3140`; stopped steps get `rgba(145,132,217,.10)` bg and a `#5d5294` card border): step number · name · glyph + state words · meta · corpus pill · grade (mono 19px/700). Body: two columns, blockers left, dimensions right, both compact. Footer: checkpoint line with icon (`ph-git-commit` for retained, `ph-arrow-counter-clockwise` for discarded/restored) + evidence toggle + **Replay from here** (disabled where there is no checkpoint).

Expanded evidence here uses a wider treatment: `grid-template-columns: 180px minmax(0,1fr)` — left column holds source chip, locator link, and "supports <dimension>"; right column the quoted span. Closing line: "Uncited spans are not stored here. *Open the full session on disk*".

After the last card, a dashed note for the step that never ran: "Step 4 · Verify never ran. The run stopped after step 3 fell below the minimum and the target repository was restored. This is a recorded outcome for corpus@a41c7e, not a failed execution."

#### 4c. Contribution (single column, max-width 1000px)
Answers "trace the final result back to each step," in the two-phase form the owner specified: **grade the outcome on its own first, then have an agent look for a culprit.**

1. **Task grade card** (`grid-template-columns: minmax(0,1fr) 280px`). Left: "TASK GRADE · GRADED ON ITS OWN" + mono 30px/700 value (`—` in `#595d6c` here) + "not gradable · the task produced no final artifact", then: "The task judge sees only what went in at step 1 and what came out of the last step. It does not read the intermediate steps, so it cannot grade a run that stopped early. Step grades below are unaffected." Right: "LAST TASK GRADE FOR THIS CASE" — `B` + `r-0144` + `⚠ stale · corpus@9f30d1` + "Not comparable to a corpus@a41c7e result."
2. **The map** — a compact horizontal chain of small step chips (number · name · grade · role glyph) with `▶` connectors. The graph as a map, not a second graph.
3. **Culprit analysis** (1px `#5d5294`, radius 8px). Header: `h2` "Culprit analysis" + provenance `an agent read the recorded steps · $0.24 · 41s · 04 Sep 09:48` + right-aligned `culprit: skills/implement.md · scope-declaration block`. Then the narrative paragraph, then this disclaimer, verbatim in spirit: "This is one agent's reading of the evidence, not a measurement. The way to confirm it is a paired rerun with that block changed and nothing else." Actions: **Set up the paired rerun** (accent), **Open the block it names**, **Re-run the analysis**.
   Then one row per step: `grid-template-columns: 150px 92px 128px minmax(0,1fr) 92px` — step id/name · grade with a mono `▯ ▮ ▯ ▯ ▯` position track over an `A B C D F` axis label (9px `#4a4d5c`) · role (`· not implicated`, `~ contributing`, `✕ primary culprit`, `○ never ran`) · the agent's note · **Step report** button.

Do **not** invent edge weights or per-node ablation deltas here. Ablation requires a rerun per node; that is a separate planned feature. This view uses only recorded evidence plus one explicitly-labeled agent opinion.

---

### 5. Comparisons — two presentations, user-switchable

Header: `h1` "Comparison · step 3 replay at ckpt-0144-s2"; subline "6 paired attempts per arm · same checkpoint, same task, same seed set · $8.94 total"; right-aligned segmented switcher (Attempt pairs / What moved).

**Arm cards band** (`#1a1c28`, 3 equal columns, always visible). Per arm: role label ("BASELINE" / "ARM A" / "ARM B") + corpus hash (mono 11px `#d2cefd`) on one row; description (`skill under test removed`, `before the edit`, `after the edit`); then median on its own line (mono 20px/700) with `median of 6 · range C+ – A−` beneath; then `$3.31 · avg 925 words`. Arm B gets the `#5d5294` border. Word counts sit beside cost deliberately — that is how verbosity gets caught.

**The baseline arm is mandatory**, not optional: it strips the skill under test and keeps everything else, which is what proves the corpus is doing work at all.

#### 5a. Attempt pairs
Table, max-width 920px: Pair (seed id, `<th scope="row">`) · Baseline · Arm A · Arm B · **A → B** · **Blockers that changed**. Grades in mono 700; baseline column in `#9397ab` to sit back. Delta cell: arrow glyph + words (`↑ +1 step`, `= no change`, `↓ −1 step`); `#75798c` for no-change, `#e9e9ed` otherwise. Blocker column names the transition in mono 11px: `scope-declared: fired → clear`.

Below, two side-by-side cards:
- **"WHAT THE PAIRING SAYS"** — "4 of 6 pairs improved by one letter step, 1 held, 1 regressed. Both arms clear the baseline by two steps or more, so the corpus is doing work — but the A→B difference sits inside the spread of identical reruns." + "Reply length rose 34% in arm B. Verbosity control held at B, so the gain is not length alone."
- **"READ WITH CARE"** — bulleted: 6 pairs sees a one-step shift, not a half-step one; every grade was produced by the corpus named in its column, both arms clean; the baseline arm strips the skill under test and keeps everything else. Plus **Add 6 more pairs · ≈ $8.90** (cost stated on the button).

#### 5b. What moved
Table, max-width 980px, rows are measures and columns are arms: Measure (name + kind — `overall` / `hard blocker` / `dimension` / `meter`) · Baseline · A · B · **Spread across 6 attempts** · **Reading**.

Spread cell renders a mono ASCII interval (`├──┼──┤`, `#796cbf`) plus a note (`arms overlap by 2 steps`, `reply length +34%`). Reading cell is a glyph + verdict phrase: `~ inside rerun noise`, `↑ fires less often`, `= unchanged, already clear`, `↑ clearest movement`, `↓ +10% per attempt`. Blocker rows count firings (`3/6 fired`) rather than grading them.

Closing **"ATTRIBUTION"** card: "The only difference between arms A and B is `skills/implement.md` — the scope-declaration block was rewritten. Every other file hash is identical across arms, so a movement here is attributable to that block." + **See the diff between arms** and **Add 6 more pairs · ≈ $8.90**.

Attribution is only legitimate when exactly one file hash differs. If more than one differs, say so and refuse the attribution claim.

---

### 6. Corpus

Header: `h1` "Instruction corpus"; subline `~/code/omelette/.claude · 14 files · current version corpus@a41c7e`. Right-aligned card: **"INVALIDATED BY THE LAST EDIT"** — `⚠ 23 recorded results · review them` (link to filtered run history).

Table (max-width 1000px): Path · Hash · Last edited · Read by (run count) · Invalidated (`✓ 0 results` / `⚠ 23 results`) · Edit (disabled button per row).

**Planned block** below, styled as designed-but-disabled: 1px **dashed** `#5d5294`, `opacity: .62`, header `h2` "Edit an instruction, review, then apply" + a "PLANNED" pill (1px `#796cbf`, radius 99px, `#d2cefd`) + "Not available in v0.6 — edit on disk for now". Body is two columns: a diff preview (mono 11.5px, line numbers `#4a4d5c`, removed lines on `#2b2136`, added on `#1f2b2a`) and a review panel listing what applying would do — "Writes a new corpus version, keeps the old one addressable" / "Marks 23 recorded results stale, none deleted" / "Offers the paired rerun that would settle it" — with disabled Apply / Discard.

The dashed border + opacity + "PLANNED" pill is the established vocabulary for planned features. Use it consistently; never show a planned control as live.

---

### 7. Tasks

Header: `h1` "Tasks"; subline "A task is a chain of steps against a base repository · declared at `tasks/*.yaml`". Right: **Import a task** and **Export with judges**, both `aria-disabled` (sharing is a seam, not a feature, in this version).

Intro prose (12px `#9397ab`, ≤78ch): "A step is judged on what went into it and what came out. A task is judged from the first input and the last artifact only, so the same work as four steps and as one step produce comparable task grades. Import and export are drawn but not wired in v0.6."

One card per task: id (mono 14px) · base repo · right-aligned `38 runs · 2 cases · 4 step judges + 1 task judge`; description; then "STEPS" + the chain in mono (`spec review → plan → implement → verify`), with **Open graph** (→ Live monitor) and a disabled **Edit steps**.

Reference tasks: `auth-refactor` (4 steps), `auth-refactor-single` (`idea → code`, same task judge — "The same work as one step, for when the four-step chain is tuned enough to run unsupervised"), `doc-rewrite` (3 steps).

---

### 8. Cases

Header: `h1` "Cases"; subline "Declared as data on disk · `cases/*.yaml`"; **Declare a case**.

One card per case: id (mono 14px) · kind pill (`task · target repo`, `single session · deterministic checks`) · target · right-aligned `38 runs · median B · $3.04/run`; description; then a steps/checks line and **Run group** / **Run once**.

Note for implementation: this screen is the thinnest of the nine. A case is task + corpus + judges + thresholds, and the card currently under-shows that. Consider surfacing the pinned corpus version, the judge set, and the minimum grade per case.

---

### 9. Calibration

Header: `h1` "Judge calibration"; subline "41 reviews recorded · agreement within one letter step on `34/41` (83%)"; **Review next unjudged step**.

Two columns (`minmax(0,1fr) 280px`). Left: table "YOUR GRADE AGAINST THE JUDGE'S, SAME EVIDENCE" — Step · Judge · You · Agreement (`✓ exact`, `≈ within 1 step`, `✕ 2 steps apart`) · Where you differed (free text: "I read the import reorder as churn", "judge accepted an unverified claim").

Right aside: **"WHERE THE JUDGE DRIFTS"** — per dimension, a label + signed value (`judge +0.7 steps`, `agrees`) over a 7-cell mono bar. Closing line, which states the feature's whole purpose: "Calibration does not change a grade. It tells you how much to trust one."

---

### 10. Settings

Records location and size (`~/.rehearse/runs · 148 records, 612 MB`). Three cards, max-width 640px: **Spend limit** (per-run USD input + "Group ceiling: 6 × per-run"), **Corpus** (path + hash, Rehash now / Unlink corpus), **Keyboard** (two-column list of shortcut chips).

---

### 11. Fresh install — first-run setup

The owner's requirement: "Fresh install asks first: set a spend limit, then point at an instruction corpus. A case cannot be declared before the tool knows what corpus it measures." Ordered and gated, not a dashboard with empty widgets.

Centered column, max-width 620px, padding 56px 32px. `h1` "Nothing is measured yet"; intro (≤52ch): "Rehearse needs two things before a case can be declared: a hard ceiling on what a run may spend, and the instruction corpus whose effect it is measuring. A case is meaningless without a corpus to attribute results to."

An `<ol>` of three cards, each with a numbered circle (20px, 1px `#5d5294`, radius 50%, mono 11px `#d2cefd`), an `h2`, a right-aligned state word, and prose:

1. **Set a spend limit** — "REQUIRED". "Applies per run and per group. Rehearse refuses to start a run without one, and stops mid-step when the ceiling is reached." Controls: USD input + preset buttons $5.00 / $20.00 / $50.00 (selected preset gets `#9184d9` border).
2. **Point at an instruction corpus** — dimmed to `opacity: .55` with state "Set a limit first" until a limit exists, then "Required" → "Linked". Prose: "A directory of instruction files — the project instruction file, skills, rubrics. Rehearse hashes each file on every run so a result always names the version that produced it." Path input (placeholder `~/code/omelette/.claude`) + **Scan**. After scanning: a bordered result list headed "Found 14 files · hashed as corpus@a41c7e", each row path · hash · line count in mono.
3. **Declare your first case** — 1px **dashed**, `opacity: .5`, state "LOCKED". "Unlocks once a corpus is linked. Two kinds: a multi-step task against a target repository, or a single agent session judged by deterministic checks."

Footer: **Finish setup** (disabled until a corpus is scanned) + a hint line that states what is missing. Completing setup lands on Run history in its empty state.

## Interactions & Behavior

- **Navigation.** Left sidebar switches screens; `aria-current="page"` on the active item. Selecting a graph node or rail item drives the dependent panes (`aria-current="step"`).
- **Evidence disclosure.** Blocker and dimension rows expand in place. Button label toggles `N cited` → `hide evidence`; `aria-expanded` tracks state; rows with no evidence are `aria-disabled` and read `no evidence`. Multiple rows may be open at once — the user is comparing evidence across dimensions.
- **Modals.** Step modal and the run-launch dialog: `role="dialog" aria-modal="true"`, Esc closes, focus trapped while open, focus restored to the invoker. Both show a visible Esc affordance.
- **Live updates.** Elapsed ticks every second; spend accrues continuously; the status bar, spend band, and the running node update together. Pulse animation: `opacity 1 → .28 → 1`, 1.4s, `ease-in-out`, infinite. Respect `prefers-reduced-motion` — replace the pulse with a static glyph.
- **Run launch / replay dialog.** Fields: checkpoint (`ckpt-0147-s2 · after Plan (B+)`), corpus (with `· 1 file changed since ckpt` when true), attempts (×1 / ×3 / ×6 / ×12, `aria-pressed`), spend limit input. Contains the **planned** projected-cost block (dashed, "PLANNED", `est. $–.–– ± –.––`, "v0.6 reports cost after the fact. Until then the ceiling above is the only guard."). Explanation: "Replaying restores omelette-web to the checkpoint state, runs step 3 against the current corpus, and records each attempt separately. Steps 1–2 are not re-run." Footer restates the ceiling; primary action names the count: **Start · 3 attempts**.
- **Keyboard.** `g r` run history, `g m` live monitor, `n` new run, `r` replay a step, `e` expand cited evidence, `j`/`k` row movement, `f` follow/unfollow tail, `Esc` close dialog. Focus ring everywhere: `outline: 2px solid #9184d9; outline-offset: 2px; border-radius: 3px` on `:focus-visible`.
- **No hover-only information.** Hover is `#1c1e2b` on rows and `rgba(145,132,217,.14)` + `#9184d9` border on buttons; it never reveals content.
- **Responsive.** Single fixed-width desktop layout; panes carry explicit minimums (graph nodes 252px, session pane 380px, judge pane 320px) and their containers scroll horizontally rather than crushing. The graph caps at 60% of the monitor height and scrolls internally so the judge pane keeps its 230px floor.

## State Management

Screen/route state: `screen`, plus `layout` (rail | ledger | trace) and `compare` (paired | matrix) for the two switchable views.

Selection state: `step` (selected graph node), `dstage` (selected step in run detail), `modal` (step index or null), `launch` (bool), `ev` (map of expanded evidence keys), `filter`.

Live run state (server-pushed in production — SSE or a websocket off the run process): elapsed seconds, spend, burn rate, tokens, current step, per-step status/grade/cost/duration/blocker counts, current tool call, checkpoint ids as they are recorded.

Config state: spend limit, corpus path, scan result, install/setup completion.

Data reads, all from disk: run records (`~/.rehearse/runs`), per-run step records with judge output (blockers, dimensions, cited evidence with source + locator + quoted span), checkpoints, corpus file list with hashes and per-run read manifests, task and case declarations (`tasks/*.yaml`, `cases/*.yaml`), calibration reviews.

Two derived values worth centralizing: **staleness** (a record is stale when any instruction file it read has a different hash now — drives every `⚠ stale` marker and excludes the record from comparisons) and **badge counts** (always from the collection, never hardcoded).

## Design Tokens

Nocturne, dark-mode primary.

**Color**
| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#161826` | app background |
| Surface | `#1a1c28` / `#1c1e2b` | cards, bands, dialogs |
| Surface alt | `#181a26` | judge pane, graph band |
| Sidebar | `#14161f` | nav |
| Row hover | `#1c1e2b` | table rows |
| Border subtle | `#232532` | row separators |
| Border | `#292b31` / `#2f3140` | section and card borders |
| Border strong | `#3f424d` / `#595d6c` | inputs, buttons, dialog edge |
| Text | `#e9e9ed` | primary |
| Text bright | `#e4e7f5` | quoted evidence |
| Text secondary | `#b2b6ca` | supporting |
| Text muted | `#9397ab` | labels, prose |
| Text dim | `#75798c` | metadata, section labels |
| Text faint | `#4a4d5c` / `#595d6c` | line numbers, empty bars |
| Accent | `#9184d9` | selection border, focus ring |
| Accent light | `#b5abfc` | live pulse, links |
| Accent pale | `#d2cefd` | primary button text, hashes |
| Accent deep | `#796cbf` / `#5d5294` | meter fill, evidence border |
| Accent tint | `rgba(145,132,217,.16)` / `.10` / `.08` | selected, fired, artifact-out |
| Diff add / remove | `#1f2b2a` / `#2b2136` | diff line backgrounds |

**Color carries no meaning on its own.** Every state has a glyph and a word: `✓ accepted/clear/clean`, `● running`, `○ queued`, `◼ stopped`, `⊘ interrupted`, `✕ fired`, `⚠ stale`, `◌ pending`, `◆`/`◇` checkpoint present/absent, `≈ within 1 step`, `~ contributing`. Grades are letters. Deltas are arrow + words. Progress uses a striped fill plus a numeric label.

**Type.** Inter 400/500/600 for UI; JetBrains Mono 400/500/700 for **every** identifier, hash, path, grade, cost, duration, count, and quoted span. Base 13px / 1.45. Scale: 30 (task grade) · 26 (spend) · 24 (grade card) · 22 · 20 · 19 (node grade) · 17 (h1) · 15 · 14 (h2) · 13 (grade inline) · 12.5 (body) · 12 · 11.5 (meta) · 11 · 10.5 · 10 (section labels, uppercase .09em) · 9 (axis). Section labels: 10px, uppercase, letter-spacing .09em, `#75798c`. Never below 10px.

**Space.** 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 11 · 12 · 14 · 16 · 18 · 20 · 22 · 28 · 36 · 56. Screen padding 12–16px vertical, 20px horizontal. Card padding 10–16px. Layout via flex/grid with `gap` throughout.

**Radius.** 3 (focus) · 4 (chips) · 5 · 6 (buttons, inputs) · 7 (cards) · 8 (sections) · 10 (dialogs) · 99px (pills) · 50% (numbered circles).

**Borders.** 1px solid for real things; 1px **dashed** + `opacity: .5–.62` for planned things; 2px left border for evidence blocks; 2px left accent on selected nav items.

**Shadow.** Dialogs only: `0 16px 40px rgba(0,0,0,.65)`.

**Scrollbars.** 11px, thumb `#3f424d` with a 3px canvas-colored border, radius 6px, transparent track.

## Assets

- **Fonts** — Inter (400/500/600) and JetBrains Mono (400/500/700), Google Fonts. Self-host in production; this tool runs locally and should not need network access.
- **Icons** — Phosphor Icons 2.1.1, regular weight: `list-dashes`, `activity`, `file-text`, `git-diff`, `scroll`, `graph`, `cube`, `scales`, `sliders-horizontal`, `magnifying-glass`, `git-commit`, `arrow-counter-clockwise`. Install the package rather than a CDN link.
- **Status glyphs** — Unicode text, not icons: `✓ ● ○ ◼ ⊘ ✕ ⚠ ◌ ◆ ◇ ↑ ↓ ▶ ≈ ~ · ├ ┼ ┤ ▮ ▯ ─`. They are part of the type system and must stay selectable text.
- No images, no illustrations, no logo.

## Files

- `prototype.html` — the complete design: all nine screens, both modals, three run-detail layouts, two comparison presentations, and the fresh-install setup. Screens are toggled by internal state; the sidebar footer switches between demo records and the fresh-install state.
- `support.js` — the design environment's streaming-template runtime. **Reference only; do not port.**

To read the design: open `prototype.html` in a browser, then walk the sidebar. Use the sidebar footer toggle to see the fresh-install flow, the layout switcher on Run detail for the three report layouts, and the switcher on Comparisons for both presentations. Reference data is embedded in the logic class at the bottom of the file — grades, blocker ids, evidence quotes, and hashes are all there as a shape reference for the real data model.
