# Client design system

The client uses [tokens.css](tokens.css) for palette and type values,
[theme.css](theme.css) for Tailwind roles, and [globals.css](globals.css) for base
styles. Shared UI lives in `ui/`; shared product components live in `components/`.
The [design handoff](../../../docs/design-handoff/README.md) and
[run workspace](../../../docs/run-workspace.md) describe the product structure.

## Type and surfaces

Shared components use explicit type steps: `text-20` for screen titles,
`text-15` for panel titles, `text-14` for reading text and metric values,
`text-13` for secondary panel descriptions, `text-12` for metadata and controls,
`text-12` for range-plot labels and ticks, `text-11` for sequence-plot ticks,
and `text-10` for eyebrows and compact captions. Raw source
and code use monospace at `text-13`; prose uses the UI font.
The base is 13px, so Tailwind's relative `text-xs` does not mean 12px here.

`bg-card` identifies a panel, `bg-muted` a secondary surface, and
`border-divider` a quiet boundary. `bg-primary` is the brand color;
`bg-accent` is a subtle interaction surface. Tailwind's `border-border` maps to
`--color-border-2`, while `border-divider` maps to `--color-border`.
The semantic `positive`, `negative`, and `attention` colors have matching subtle
surfaces. Spacing and geometry use the existing Tailwind scale.

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
