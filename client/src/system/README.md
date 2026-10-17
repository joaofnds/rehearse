# Client design system

The client uses [tokens.css](tokens.css) for palette and type values,
[theme.css](theme.css) for Tailwind roles, and [globals.css](globals.css) for base
styles. Shared UI lives in `ui/`; shared product components live in `components/`.
The [design handoff](../../../docs/design-handoff/README.md) and
[run workspace](../../../docs/run-workspace.md) describe the product structure.

## Type and surfaces

Shared components use explicit type roles: `text-24 font-semibold` for screen
titles, `text-16 font-semibold` for panel titles, `text-14` for reading text,
controls, links and metric values, and `text-12` as the metadata floor. Saved prose
uses `leading-reading` (1.65); raw source and code use monospace at `text-13` with
`leading-transcript` (1.7). Inter remains the UI/reading face; JetBrains Mono
identifies code, provenance and tabular measurements. The HTML root stays 13px to
preserve Tailwind's spacing scale, while the body reads at 14px. Use explicit type
steps rather than relative `text-xs` or `text-sm`.

Slate surfaces distinguish canvas, panels and raised controls. `bg-card`
identifies a panel; `bg-raised` identifies a stronger surface; `border-divider`
separates content quietly. Necessary control boundaries use `border-strong` or
`border-input`. Tailwind's `border-border` maps to the structural
`--color-border-2`, rather than the control border.

Violet identifies a primary action or selected scope. `Button variant="primary"`
is filled, while default/outline/quiet buttons remain secondary. Use one primary
action within a decision area. Links use blue `text-link` with an underline and
`hover:text-link-hover`; informational/live states use `text-info` and
`bg-info-surface`. Navigation selections stay violet, with a persistent edge or
filled selected surface. Keyboard focus has an opaque 2px violet outline with a
3px offset. Buttons and form controls retain 44px minimum targets.

Teal `positive`, rose `negative`, and amber `attention` have matching subtle
surfaces. Use `Button variant="destructive"` for a destructive action. Color
accompanies an explicit state label or symbol. Execution ending and comparison arm
identity remain neutral. A continued step can be teal beside a rose independent
final FAIL; a letter grade alone does not establish either outcome. The
[approved visual study](../../../prototypes/color-study/README.md) is a frozen
synthetic reference for these roles, rather than an alternative production UI.

## Layout and spacing

`page-gutter` aligns screen headings, section navigation, toolbars and content:
16.25px at narrow widths and 26px from the `sm` breakpoint, using the existing
Tailwind spacing scale. Page sections use `gap-6` or `gap-8`; shared panels use
`p-6`. Reading text and controls retain their type roles and 44px targets.
Search wrappers supply horizontal padding; their input owns the control height.

Keep secondary actions quiet, with their hover surface and focus outline;
reserve filled buttons for primary actions. `Switcher` groups choices on an inset
surface. Runs keeps its filters visible on desktop and provides an explicit
Filters toggle with an active count at narrow widths. Navigation retains the
corpus identity while compacting its chrome on narrow screens.

`TableShell` supplies a named, keyboard-focusable scroll region bounded to 65vh,
with column headings sticky within that region. Callers may set
`className` and `columnClasses` to balance fixed columns without clipping data;
Runs and Corpus provide their own column geometry. Long source paths wrap within
their cells. Final-outcome disclosures use a responsive grid, and an open reading
spans its full width. Content, evidence and actions remain available as the layout
changes.

## Components in use

| Component                                    | Contract and current use                                                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ScreenHeader](components/screen-header.tsx) | Page title, optional eyebrow and subline, with `lead` and `aside` content slots. Used across the five destinations and saved attempt/group pages.                |
| [SummaryPanel](components/summary-panel.tsx) | Named section with an `h2`, optional description, actions and anchor `id`. Used for final outcomes, session assessments, case details and comparison summaries.  |
| [Metric](components/metric.tsx)              | Label, value and optional basis or coverage hint. Its parent supplies a `dl`. Used by session/group results, case details, comparisons and request measurements. |
| [StateBadge](components/state-badge.tsx)     | Caller supplies words and a neutral, positive, negative or attention tone. Used for independent outcomes, saved state checks, review state and case kinds.       |
| [Status](components/status.tsx)              | Existing execution glyph vocabulary, including the live glyph. Used by workflow nodes and ledgers.                                                               |
| [RecordedText](components/recorded-text.tsx) | Saved text with Formatted and Raw reading modes. Used by saved output, case text and calibration output.                                                         |
| [RangePlot](components/range-plot.tsx)       | Aligned low/high ranges with an optional value marker and a textual reading for each row. Used by comparison measures and session assessment rates.              |
| [SequencePlot](components/sequence-plot.tsx) | Selectable request-order series with click and keyboard navigation. Used by the request timeline.                                                                |

[Button](ui/button.tsx), [Dialog](ui/dialog.tsx),
[Switcher](components/switcher.tsx), [TableShell](components/table-shell.tsx),
[Disclosure](components/disclosure.tsx), [Notice](components/notice.tsx), and
[EmptyState](components/empty-state.tsx) remain the shared interaction pieces.
`Switcher` is a labeled group of mutually exclusive pressed buttons. `FilterPill` is a
pressed button for one filter; its feature owns how filters combine. `TableShell`
supplies a named caption, column headings and aligned numeric columns over
caller-provided cell content. `SectionLabel` supplies the compact eyebrow treatment.
`Grade` preserves the existing letter-grade display; a letter does not imply an
independent final result. Feature-specific evidence and navigation stay with their
feature.

## Evidence semantics

Components present the meaning their caller supplies. A positive badge does not
compute a quality result. Execution ended, independent final PASS/FAIL,
continuation at a minimum grade, and human review each have their own label.
Recorded session outcomes use reply/transcript checks; saved state checks retain a
separate count and assessment. A recorded success can coexist with failed state
checks. Missing evidence retains its reason and denominator.

Metric labels state scope and units. A request's input, an attempt's total, peak
request input, own cost and descendant cost are different measurements. Detailed Context
cost readings round primary currency and retain exact amounts and their pricing basis in
detail. Search and list previews use cents and lead to the saved record, which retains
its exact readings.
Unavailable measurements remain unavailable; a measured zero remains zero.

Range plots take the domain and value formatter from their caller. The measure
names its sample size and range meaning nearby: pass-rate intervals are 95%
confidence intervals, while cost, word counts and grades use observed ranges.
Range labels and ticks use HTML text so narrow columns retain readable type; point
markers retain their size as the drawing stretches to fit.
Sequence plots retain request order; an undefined measurement creates a gap in the
line and remains selectable as unavailable. The timeline supplies scope, total and
peak labels alongside the chart.

## Saved text and provenance

Formatted mode renders headings, paragraphs, ordered and unordered lists, inline
code, bold text and fenced code as React nodes. Saved HTML remains literal text;
the renderer does not inject HTML or load resources from the saved content.
Unsupported Markdown remains readable source text. Callers choose the initial mode;
saved delivery diffs open Raw so added and removed line signs are preserved. Raw mode
preserves the exact saved string, including whitespace. Complete output retains the
same saved text.

Readable run, case, step, replay and group identities lead headers. Opaque record
IDs, lineage, file paths and exact timestamps belong in inspectable provenance,
with selectable text for copying. Navigation retains the selected step and the
source or comparison return context.
