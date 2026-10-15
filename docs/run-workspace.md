# Desktop run workspace

The [run workspace prototype](../prototypes/run-workspace/README.md) is the accepted
visual and navigation direction. The application uses its existing React components,
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

A shared connected workflow keeps the step grades, measured cost and time, corpus,
checkpoint, status, and output summary visible. Inputs & output, replay, and testing
an instruction act on the selected step. Results combines the independent final
outcome, step Judge evidence, other attempts at the checkpoint, root-cause analysis,
the saved human review verdict and findings, and setup/provenance. The contextual
Judge review action records operator grades for calibration. The whole workflow record remains inspectable.
Context & cost embeds the existing context workbench and its saved evidence.
Results and Context use one page scroll; Activity gives the session and Judge their
own scroll areas inside the desktop workspace, with a minimum readable height.

Sessions and replays retain their own evidence identity. Groups open as aggregates
with their attempts nested beneath them. Missing grades, unread attempts, incomplete
costs, and unavailable transcripts must remain visible as gaps, rather than failed
work or zero measurements. A pipeline's final PASS/FAIL is separate from step letters.

## Editing and experiments

Test an instruction opens the actual corpus skill named by the selected step's read
manifest. The editor carries the source run, step, corpus and starting checkpoint
through review, apply, and the replay offer. The saved source is historical; the edit
applies to the currently linked editable corpus directory, through the existing
review/apply guard. A generic corpus edit asks the engineer to choose a source rather
than silently substituting a recent run.

Replay uses the original starting checkpoint. Launch, stop, pause, analysis and operator grading use the existing production
routes. Human review records written by the CLI remain read-only in Results.
A paused process has ended; its retained checkpoints can be replayed. A stage group's source readings and replay
readings can be inspected together as exploratory evidence. Such a comparison has no
control and does not establish that an instruction caused an improvement. Existing
controlled comparison reports and their launch routes remain available.

Workflow editing/import/export and case declaration retain their real production
behavior. No simulated action, fabricated timeline, grade, cost or corpus diff is
introduced. The request timeline is shown only for evidence that actually recorded it.
Desktop is the priority; narrow layouts retain basic access without a separate tablet
or mobile redesign.

## Acceptance observations

- Runs is the single global entry for history and run inspection; the sidebar has five destinations.
- Opening a running pipeline shows Activity and its live controls; an ended pipeline opens Results.
- Changing view retains the run and selected step; reload and old stage links reach the same evidence.
- A run completing does not remove its Activity view or clear the selected step.
- The shared workflow exposes selected-step inputs/output and eligible replay/edit actions.
- Results preserves final outcome, step evidence, artifacts, attempts, analysis, human review and provenance.
- Context & cost retains the saved workbench, source/event detail, agent evidence and all measurement gaps.
- Instruction editing keeps a validated source through apply and offers that source's replay; a direct edit selects its source explicitly.
- Groups expose nested attempts, unread evidence, setup, and honest source/replay readings; saved controlled comparisons remain distinct.
- Cases exposes workflow editing/import/export; Settings exposes calibration; existing addresses remain usable.
- Real records render at 1440px and 1280px desktop widths and in a short window without inaccessible controls or content.
- Provider-free behavior tests, the complete project gate, direct browser observation and independent review precede completion.
