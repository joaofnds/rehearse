# Desktop run workspace

The [connected desktop prototype](../prototypes/ux-comparison/README.md) is the accepted
visual and interaction direction, following the original
[run workspace prototype](../prototypes/run-workspace/README.md). The application uses its existing React components,
record readers, guarded write routes, and local server. Prototype sample records and
actions do not define production evidence.

The engineer starts in Runs, chooses a run, inspects its evidence, tests an instruction,
and returns to the same frozen input. Confirmation still requires repeated attempts
and controls. Navigation must preserve the identity of the evidence being inspected.

## Navigation

The five global destinations are Runs, Comparisons, Cases, Corpus, and Settings.
Cases contains workflow definitions; Settings contains Judge calibration. Existing
monitor, run-detail, stage-history, task, and calibration addresses remain usable.
A pipeline run has Results, Activity, and Context & cost under `/runs/<run>`.
The URL carries the view and selected step. A running run opens Activity; an ended
run opens Results. Activity stays available after the run finishes.
Activity follows the running step until the engineer selects one; an explicit
selection stays in place as the run advances or ends.

Runs combines status, kind, corpus and text filters in the URL. Search includes record
IDs, case names, corpus versions and fired blockers. The Runs breadcrumb and sidebar
restore the last selection during app navigation; Clear removes it. Sorting supports
newest, oldest, highest cost and case; missing dates and partial or missing costs stay
last. Active launches have their own queue, and ended launch records remain in a counted
history disclosure, whose label also counts the launches that ended with a reason, each
shown with that reason, which may be a refusal, a pause or a stop below the minimum grade. List counts distinguish saved records from launches. Failed requires
a
recorded quality failure, while execution errors and missing judgments stay distinct.
Search in the sidebar, also available with Command/Ctrl-K, finds runs, cases,
instructions and saved comparisons without adding a destination. Search groups those
destinations, supports a scope filter, prioritizes exact matches and previews recorded
time, outcome basis and cost where available.

The workflow starts with a compact step selector showing state and grade. Workflow
details expands its cost, time, corpus, checkpoints and recorded output summary.
Activity keeps the full graph. This is the existing sequential graph; a richer live
workflow visualization with dependency and handoff information remains deferred.

Results separates execution state, the independent final outcome and human review.
The final outcome leads with the saved failed criteria and first finding; disclosures
retain every criterion and citation, grading scope and the previous task result.
Execution completion, continuation at a minimum grade and a positive evaluation are
distinct. A step that continued at a permissive threshold retains its letter and fired
blockers. The selected step's saved artifact or completion reply sits beside one
assessment.
Formatted and Raw modes use the same saved text. Formatted mode renders a limited set of
Markdown structures safely, without injecting saved HTML; Raw preserves exact
whitespace. Open complete output retains the complete source. Saved diffs open Raw so
change signs remain intact. Ended Activity shows saved output when available, with cited
spans and a link to the retained transcript; absent transcripts retain their reason.
Citations open their retained source
in a dialog with a shareable full-page link. Input & checkpoint, workflow records,
human review, optional root-cause analysis and provenance remain inspectable.
Analysis is labeled agent opinion and retains its priced request path.

Next action follows the state: running work leads to Activity, a failed final task to
its saved evidence, and an unstarted step on an ended workflow back to the last
recorded step. Eligible source-bound editing and replay remain available. Judge
review is offered for recorded Judge grades. Results and Context use one page scroll;
Activity gives the session and Judge their own scroll areas.

Context & cost starts with scoped cost and coverage, then the source/event workbench.
Evidence, Requests and Agents share the wide detail area. Full manifests and identity
are counted disclosures with their missing-evidence warnings retained. Each record's
source, event, request, agent and reading-mode selections survive returning through
Results while the app cache remains alive. Open transcript selects the event ledger.
Fresh Context opens a measured delivery before raw unclassified chronology. Sources and
events have search; Activity, Deliveries, Errors and All records filter events. Explicit
event links reveal raw chronology, and request selections reveal their corresponding
evidence. Source rows show characters, observed deliveries and repeats; warnings appear
only when present. The request chart keeps the full series scale while filters narrow
the list. It shows sequential input tokens, selectable requests and gaps for missing
usage; peak request input and attempt totals have separate labels. Agents opens with
compact transcript coverage and calculated cost, with missing-agent identities and
per-model cost basis in expandable detail.

Request input, cumulative usage, source estimates, own cost and descendant cost retain
their separate meanings. Unpriced requests stay unpriced; absent series stay unavailable.

Sessions and replays retain their own evidence identity. Groups open as aggregates
with their attempts nested beneath them. Missing grades, unread attempts, incomplete
costs, and unavailable transcripts must remain visible as gaps, rather than failed
work or zero measurements. A pipeline's final PASS/FAIL is separate from step letters.
Session results distinguish recorded reply/transcript checks from command-scored checks
on the saved state; a recorded success can coexist with a failed saved-state assessment.
Failures lead the assessment, while every result and its evidence remain accessible.
Group results show saved-state coverage over requested attempts, with missing or
unreadable assessments explicit. Runs shows the same assessment split for sessions
and session groups, including disagreements and unavailable coverage; case cohort
members retain their own assessment layers.

Cases opens a hub for the declared prompt, execution/evaluation contract, recorded
corpus cohorts, actual member records and related comparisons. Selecting a cohort scopes
the member list and its figures together; unknown corpus remains an explicit cohort.
Workflow definitions use human titles while retaining their case and pipeline
identities.

## Editing and experiments

Edit instruction & replay opens the actual corpus skill named by the selected step's read
manifest. The editor carries the source run, step, corpus and starting checkpoint
through review, apply, and the replay offer. Corpus file search narrows the inventory
and prioritizes the contextual file. Unapplied drafts stay in app memory by linked
corpus, file and source until Discard, successful Apply or a page reload. Returning
reads the current file again before review/apply. A live-install edit links to Settings
and back to the same source after linking an existing editable copy. File names also
open a read-only formatted/raw viewer, including live-install files. Viewing does not
relax the edit guard. Read-by counts distinct history rows with captured files or
additional recorded corpus reads; it does not establish model attention. Prior-version
results counts rows using a previous file hash, including already stale rows. Last edit
counts only results newly stale across that entire version transition. The saved source
is historical; the edit
applies to the currently linked editable corpus directory, through the existing
review/apply guard. A generic corpus edit asks the engineer to choose a source rather
than silently substituting a recent run.

Replay uses the original starting checkpoint. Launch, stop, pause, analysis and operator
grading use the existing production
routes. A launch uses the saved spend ceiling; changing that default is a separate
settings action, and an unsaved draft never implies a per-launch override. Effective
settings absent from the API remain unavailable. Human review records written by the CLI
remain read-only in Results.
A paused process has ended; its retained checkpoints can be replayed. A stage group's source readings and replay
readings can be inspected together as exploratory evidence. A replay's Compare with source
opens its saved output and readings beside the source step. Adjacent group attempts
have previous/next controls retaining the selected view, step and comparison return
link. Group repetitions follow their recorded ordinal; sessions and replays advance
from older to newer executions. A single group-attempt table combines results, context availability, cost, time
and corpus; older summary-only records state their evidence limits. Such a comparison has no
control and does not establish that an instruction caused an improvement. Existing
controlled comparison reports and their launch routes remain available. Saved
comparison detail opens What moved, with sample counts, uncertainty and corpus changes
before arm evidence. Browser roles use Control, Baseline (before) and Candidate (after);
the CLI retains its arm A/arm B terminology. Recorded check outcomes and saved-state
results have separate comparison rates. A synthetic A/F conversion from reply checks is
labeled as checks rather than an independent Judge grade. Aligned range plots include
every available arm: pass rates use 95% confidence intervals computed from the observed
counts; cost, words and numeric grades use observed ranges. Sample counts, graded
coverage and interval meanings stay beside the plots. Individual attempts link back to
their
comparison, and the index leads with cases and requested attempts rather than a digest.

Workflow editing/import/export and case declaration retain their real production
behavior. No simulated action, fabricated timeline, grade, cost or corpus diff is
introduced. The request timeline is shown only for evidence that actually recorded it.
Calibration supplies a first-review guide when no reviews exist. Blind review has Task,
Output, Instructions and Evidence navigation; unknown recorded fields remain
inspectable, and Judge answers remain hidden until review is saved.

The [client design system](../client/src/system/README.md) defines shared semantic
badges, summaries, metrics, text readers, headers, filters, tables and chart contracts.
Feature components supply evidence meaning and missing-data coverage; shared
presentation never infers a pass.

Desktop is the priority; narrow layouts retain basic access without a separate tablet
or mobile redesign.

## Acceptance observations

- Runs is the single global entry for history and run inspection; the sidebar has five destinations.
- Opening a running pipeline shows Activity and its live controls; an ended pipeline opens Results.
- Changing view retains the run and selected step; reload and old stage links reach the same evidence.
- A run completing does not remove its Activity view or clear the selected step.
- The shared workflow exposes selected-step inputs/output and eligible replay/edit actions.
- Results shows saved output beside one assessment, preserves complete artifacts, and exposes saved final criteria/citations without another model call.
- State-aware actions reach Activity, the failed final evidence, the ended step or eligible edit/replay.
- Sessions, replays and group attempts show their saved reply/checks/Judge input, with unavailable history stated explicitly.
- Context & cost puts scoped readings and investigation controls before manifests, preserves selection on return, and retains source/event detail, agent evidence and measurement gaps.
- Runs filters compose, search and selection survive inspection, Clear restores the list, and global search opens the relevant record or definition.
- Comparisons lead with What moved and sample limits, then reach source groups and individual attempts with a return path.
- Instruction editing keeps a validated source through apply and offers that source's replay; a direct edit selects its source explicitly. Drafts survive app navigation and are rechecked against current file content.
- Groups expose nested attempts, unread evidence, setup, and honest source/replay readings; saved controlled comparisons remain distinct.
- Cases exposes workflow editing/import/export; Settings exposes calibration; existing addresses remain usable.
- Real records render at 1440px and 1280px desktop widths and in a short window without inaccessible controls or content.
- Provider-free behavior tests, the complete project gate, direct browser observation and independent review precede completion.
