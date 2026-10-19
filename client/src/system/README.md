# Client design system

The client uses [tokens.css](tokens.css) for palette and type values,
[theme.css](theme.css) for Tailwind roles, and [globals.css](globals.css) for base
styles. Shared UI lives in `ui/`; shared product components live in `components/`.
The [design handoff](../../../docs/design-handoff/README.md) and
[run workspace](../../../docs/run-workspace.md) describe the product structure.
Use the [UI review matrix](../../../docs/ui-quality.md) to record route, state,
viewport and evidence coverage when reviewing screens.

## Type and surfaces

Shared components use explicit type roles: `text-24 font-semibold` for screen
titles, `text-16 font-semibold` for panel titles, `text-14` for reading text,
controls, links and metric values, and `text-12` as the metadata floor. Saved prose
uses `leading-reading` (1.65); raw source and code use monospace at `text-13` with
`leading-transcript` (1.7). Inter remains the UI/reading face; JetBrains Mono
identifies code, provenance and tabular measurements. The HTML root stays 13px to
preserve Tailwind's spacing scale, while the body reads at 14px. Use explicit type
steps rather than relative `text-xs` or `text-sm`.

Neutral slate surfaces distinguish canvas, panels and raised controls. `bg-card`
identifies a panel; `bg-raised` identifies a stronger surface; `border-divider`
separates content quietly. Input boundaries use `border-strong` or `border-input`; secondary buttons use
`border-divider` and a subtle surface, so they do not compete with their labels. Tailwind's `border-border` maps to the structural
`--color-border-2`, rather than the control border.

Violet identifies a primary action or selected scope. `Button variant="primary"`
is filled, while default/outline/quiet buttons remain secondary. Quiet actions have a subtle
bordered surface; ghost buttons are reserved for controls whose surrounding
context already establishes their hit area. Use one primary
action within a decision area. Inline links use blue `text-link` with an underline and `hover:text-link-hover`.
Collection heading links use `text-foreground no-underline` with link color and an
underline on hover. Their keyboard focus remains explicit; comparison rows also
provide the named Open comparison action. Informational/live states use `text-info` and
`bg-info-surface`. Navigation selections stay violet, with a persistent edge or
filled selected surface. Keyboard focus has an opaque 2px violet outline with a
3px offset. Buttons and form controls retain 44px minimum targets. Use `Button wrap`
with a content-sized button such as `size="compact"` when its required label can
exceed the available width. It preserves the full action and spending disclosure
inside the button boundary as the label wraps.

Teal `positive`, rose `negative`, and amber `attention` have matching subtle
surfaces. Use `Button variant="destructive"` for a destructive action. Color
accompanies an explicit state label or symbol. Execution ending and comparison arm
identity remain neutral. A continued step can be teal beside a rose independent
final FAIL; a letter grade alone does not establish either outcome. The
[approved visual study](../../../prototypes/color-study/README.md) is a frozen
synthetic reference for these roles, rather than an alternative production UI.

## Visual hierarchy

Keep the chrome quiet enough for the record to lead. Canvas (`#11151c`), panel
(`#181e28`) and raised (`#202733`) surfaces establish groups without a bright blue
band on every header. Structural dividers (`#303a49`) separate records; input
boundaries (`#657389`) remain stronger where a field needs identification.
Violet (`#b09ceb`) marks a primary decision or selected scope. Existing semantic
outcome colors retain their words and symbols, with subdued surfaces and thin
tinted badge edges.

Use foreground for titles and primary readings, secondary for supporting content,
muted for descriptions and labels, and dim for metadata. Keep these roles distinct;
do not brighten every caption or put every value in an outlined badge. Small
reading text retains at least 4.5:1 contrast on its actual surface, including hover
states. Keyboard focus stays explicit and input boundaries retain 3:1 where needed.
Restraint comes from fewer competing treatments, not smaller text or lost focus.

Warnings use a restrained border/leading accent, a readable neutral message and
secondary detail. Use `Notice collapsible` for optional diagnostic lists: the
message stays above the disclosure, and expanded details fill the width below it
with a divider and wrapping identifiers. Never place a message and its expandable
diagnostics in a centered flex row; expansion must not turn them into side-by-side
columns. The disclosure keeps its 44px target and explicit Show details / Hide
details labels.

A persistent notice needs a useful next step. Runs presents missing confirmation
summaries in a neutral review panel with an Archive action per run. The copy keeps
execution and cost unknown; missing results do not establish that a process ended.
Archiving saves an operator decision with the records and leaves experiment files
in place. A compact archived list offers Restore across browsers. A later summary
appears normally, including a malformed summary's diagnostic. Genuine unreadable
records retain their full diagnostics; browser preferences cannot hide them.
Show pending and failed actions explicitly, refresh the affected collections after
a request, and move focus to the resulting status when the clicked row disappears.
Reserve large saturated surfaces for a state that needs that much attention.
Collection identities lead in neutral heading text; inline evidence
and prose links keep their blue underline. Closed record provenance uses spacing
rather than an additional full-width divider; expanded detail keeps its boundary.

## Layout and spacing

`page-gutter` aligns screen headings, section navigation, toolbars and content:
16.25px at narrow widths and 26px from the `sm` breakpoint, using the existing
Tailwind spacing scale. Page sections use `gap-6` or `gap-8`; shared panels use
`p-6`. Reading text and controls retain their type roles and 44px targets.
Use the shared search control's geometry; callers supply layout.

Keep secondary actions bounded and subordinate, with their hover surface and focus outline;
reserve filled buttons for primary actions. `Switcher` groups choices on an inset surface; its active choice uses a raised
neutral surface and foreground text. Switcher choices and filter pills mark the
selected label with medium weight and a 2px violet underline, so selection does
not depend on a faint surface change. Navigation retains its violet edge and
selected surface. Runs keeps its filters visible on desktop and provides an explicit
Filters toggle with an active count at narrow widths. Navigation retains the
corpus identity while compacting its chrome on narrow screens.

`TableShell` keeps its title outside a named, keyboard-focusable scroll region,
with the whole frame bounded to 65vh and column headings sticky within the region.
Radix overlay scrollbars occupy no layout gutter; the vertical track starts below
the measured column headings, including when they wrap. Both axes retain native
wheel, touch and keyboard scrolling, plus draggable thumbs. Callers may set
`className` and `columnClasses` to balance fixed columns without clipping data;
Runs and Corpus provide their own column geometry. Long source paths wrap within
their cells. Final-outcome disclosures use a responsive grid, and an open reading
spans its full width. Content, evidence and actions remain available as the layout
changes.

## Collections and content width

`PageContent` aligns the body with `ScreenHeader` through `page-gutter`. Data
collections use its available width; constrain an individual prose block with
`max-w-prose` rather than constraining the entire screen. Comparisons and Corpus
use this shared body. Reading-focused case and workflow cards retain their own
content limits.

Use `RecordList` and `RecordListItem` for records whose identity, change summary
and destination matter more than comparing numeric columns. Rows stack at narrow
widths, place the action beside the identity from `sm`, and align identity, summary
and action in one row from `lg`. Keep mode and scoped
counts beside the identity, retain a short identifier when names repeat, and put
selectable IDs and per-case setup in the full-width disclosure. Its native summary
retains a 44px target, one chevron and keyboard behavior. The list scrolls with the
workspace; it does not introduce a second vertical scrollbar.

Comparisons preview each changed instruction path once across their cases; setup
retains the per-case paths, corpus versions and unavailable reasons. Requested
repetitions remain labeled per arm, rather than being presented as saved results.
Keep `TableShell` for genuinely tabular collections such as Runs and Corpus.

## Components in use

| Component                                    | Contract and current use                                                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ScreenHeader](components/screen-header.tsx) | Page title, optional eyebrow and subline, with `lead` and `aside` content slots. Used across the five destinations and saved attempt/group pages.                |
| [ActionGroup](components/action-group.tsx)   | Bounded, wrapping action layout with shared spacing; callers supply actions and optional layout classes.                                                         |
| [AmountInput](components/amount-input.tsx)   | One USD field boundary, amount reading and focus treatment. Used by Setup, Settings and launch review.                                                           |
| [RadioChoice](components/radio-choice.tsx)   | Native radio inside a labeled 44px target with selected and focus treatments. Used by calibration criteria.                                                      |
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
supplies a named table title, column headings and aligned numeric columns over
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

Keep the header's main reading on identity and the state needed to choose an
action. Place supporting configuration in inspectable provenance. Apply uppercase
styling to labels alone; paths, IDs,
model names and saved values retain their recorded casing. Bound long identities
and paths with `min-w-0` and `wrap-anywhere`, retaining their full text.

`EmptyState` presents a successful empty collection and a next step. Its caller
distinguishes load failure, unreadable records, a missing selected record and no
filter matches before choosing that presentation.

## Control and evidence details

`SearchInput` gives search fields one 44px boundary and an inset search icon;
callers supply layout rather than padding a second control wrapper.
`NativeSelect` preserves native keyboard selection with a 44px target, consistent
field geometry and a reserved trailing chevron area. Runs uses its prefix slot to
group Sort with the selected order. Labels remain visible or associated by id.
`KeyHint` presents shortcuts as keycaps; hints inside actions are decorative while
the shortcut reference in Settings remains readable to assistive technology.

`FileInput` retains the native file chooser and filename within one bounded field,
with a visible Choose file action and focus outline. Associate its `id` with a
visible label. Its caller supplies `accept` and handles `onChoose`; reading,
validation and saving remain feature behavior. Import workflow uses this control.

Keep dialog headings concise. Put a long recorded filename or path in the
scrolling body so it cannot grow the header beyond a short viewport and hide
the close action. Complete saved output retains its full identity above the
unchanged output text in that body.

`ActionGroup` supplies `min-w-0`, a maximum width, wrapping and the shared gap.
Callers keep each action's content bounded and its label concise. Put a long
filename in wrapping context while retaining it in a download's accessible name
and attribute. A disabled reason belongs outside the group as reading text, linked
to the action with `aria-describedby`.

`AmountInput` takes the raw amount string, `onChange` and an `accessibleName`; an
optional `id` connects a visible label. Its prefix is `USD` or `USD per run` and
is decorative to assistive technology. The caller owns parsing, validation and
saving. Keep its input inside the shared boundary so the field and its prefix
share the 44px target and focus outline.

`RadioChoice` takes `name`, `value`, `checked`, `onChoose` and visible children.
Use a shared name for mutually exclusive choices, unique names between groups,
and a labeled parent group. The native input retains keyboard selection; the
label owns the target, selected surface and focus outline. Its caller owns the
assessment meaning and any required-choice validation.

Corpus View explicitly focuses and reveals its reader heading within the
workspace, including when the same file is selected again. Close returns focus
to the originating file action while connected. File refetches preserve current
focus; editor autofocus and selected-line behavior remain separate interactions.
Successful Apply focuses and reveals the confirmation that replaces the editor.
Both explicit reveals use `focusWorkspaceTarget`, which moves only the workspace.

`CurrentLink` lets the selected product view own `aria-current`, including links
whose URL path is shared and only search parameters differ. Narrow section
navigation reveals its current item after loading, navigating or resizing without
moving the main workspace or focus.

Runs pairs step names with neutral grade readings. Missing grades, steps not run,
and steps outside a replay/group have explicit words; group medians retain their
graded-attempt counts. Saved-session links have a visible destination label and
bounded targets. Partial and missing Cost/Wall readings reserve the same qualifier
space before right-aligned explanation actions. Quality dimensions use a stable
name/grade row, a full reading line for the note and a separate citation action.
Native disclosures center their label within the target area.

## Viewport and scroll ownership

The document and root are viewport-bound and do not scroll. `AppShell` uses the
dynamic viewport height; its sidebar, workspace and in-flight bar stay inside it.
The sidebar and workspace are positioned scroll owners, so absolute content such
as visually hidden table headings cannot create document overflow. Keep hidden
labels inside a positioned owner; `TableShell` owns its scroll hint this way.

Results and Context scroll in the workspace. Activity allocates bounded session
and Judge panes with independently scrolling bodies and persistent pane headings;
they stack below `lg`. Short windows can scroll the surrounding workspace to reach
those panes. Wide tables and graphs keep their own horizontal scrolling.
The in-flight run list occupies at most a quarter of the viewport and scrolls as
a named keyboard target, so simultaneous runs leave the workspace reachable.

The router tracks the workspace through its stable scroll-restoration ID. New
destinations start at the top, Back restores the previous position, and fragment
links reveal their target inside the workspace. Do not replace this with window
scrolling or a blanket scroll reset on every render.

`DialogContent` fits the padded overlay at either width. Headers and footers stay
outside a shrinking, `min-h-0` body with its own scrolling; a fixed maximum height
on an inner list alone does not bound it to the available dialog space. Dialog
content supplies a positioning context for hidden labels and evidence highlights.

Verify scrolling after expanding long content, moving focus, following a fragment,
changing routes and resizing across breakpoints. Check document scroll offsets and
height as well as workspace widths; horizontal fit alone cannot prove containment.
