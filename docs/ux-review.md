# Desktop UX review

Reviewed on 2026-10-15 against `6cdba3f9`. These are proposals for the next design
pass. The [desktop run workspace](run-workspace.md) remains the accepted design.
The [visual review](ux-review.html) illustrates three proposed arrangements.

Rehearse helps an engineer decide whether changing an instruction improves the
agent's work at an acceptable cost. The interface should help them find a result,
understand the evidence, make a testable edit, and compare repeated attempts.

The five global destinations and the shared run workspace provide a good base.
Keep the dark navy surfaces, restrained violet selection, connected workflow,
monospace measurements, and direct links to saved evidence. The next pass should
put the conclusion and the next investigation ahead of the record's bookkeeping.

## Scope and evidence

The review used the running application with local records, inspected at 1440 ×
900 and with a narrower check at 1280 × 800. It covered Runs, Results, archived
Activity, Context & cost, a replay, a standalone session, a group and an individual
group attempt, both comparison presentations, Cases, Workflows and its step editor,
case creation, Corpus, Settings, calibration and its blind grading form. Launch
forms were opened without starting work. A second server with an empty temporary
records directory supplied the fresh-install screen, then was stopped.

This is a heuristic review supported by browser observations and source inspection,
not a usability study. The priorities below are design judgments. There was no live
run during this review. No paid execution, Judge submission, corpus apply, workflow
save, or case declaration was performed. The live corpus was read-only; editable
draft behavior was inspected in source rather than exercised against that install.
No private transcripts or screenshots are included in these documents.

## Recommended order

| Order           | Improvement                                        | User benefit                                               | Scope                                                     |
| --------------- | -------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| First           | Explain outcomes and surface their evidence        | Understand what failed and whether work is still running   | Shared state presentation plus saved final-Judge evidence |
| First           | Finish the attempt inspection experience           | Judge a replay or failed session without reading JSON      | Results readers and shared evidence presentation          |
| First           | Put Context & cost investigations above manifests  | Reach useful cost, request and source readings immediately | Layout, selection and evidence-aware visualizations       |
| First           | Make comparisons lead with what changed            | Decide what the experiment supports                        | Index, default presentation and consistent arm labels     |
| Alongside these | Improve text contrast and reading hierarchy        | Read dense evidence comfortably                            | Existing tokens and typography roles                      |
| Next            | Make corpus editing recoverable and protect drafts | Complete an edit/replay loop without losing work           | File navigation, draft state and explicit corpus linking  |
| Next            | Make launch conditions and budget scope explicit   | Know what will run and what a setting change affects       | Launch form and preflight summary                         |
| Next            | Improve history filtering and case discovery       | Find the right experiment and prepare another              | Runs and Cases                                            |
| Later           | Improve calibration and first use                  | Get a first useful measurement or trustworthy human grade  | Guided empty states and form layout                       |

The first pass should improve the existing destinations. A new dashboard or another
global destination would add navigation before resolving these reading problems.

## 1. Explain the outcome before presenting step detail

**Observed.** One ended pipeline showed “pending” and `AWAITING_HUMAN_REVIEW` in
history, a final FAIL, and accepted C/B steps. Those readings describe different
things, but the screen makes the engineer reconcile them. A group with four
recorded repetitions and zero successful repetitions carries a check mark beside
“4 of 4 recorded.” The task's final result card explains how grading works but
provides no failure rationale. Its detailed API currently serves a judged final
outcome as a verdict alone.

**Proposal.** Give execution, final outcome, and human review separate labels.
For example: “Execution ended · Final result: FAIL · Human review: pending.” A
record-completeness mark should say “4 executions recorded”; the quality reading
should independently say “0 of 4 passed.” Retain step letters and their acceptance
thresholds as step evidence.

Lead Results with the recorded failed criteria and citations, followed by the
selected step and its attempts. The current historical comparison can become a
compact secondary reading; an incompatible older result should not share the
headline's emphasis. Put a brief explanation of the independent final Judge behind
a labeled disclosure. If no rationale was saved, say that and offer the saved
evidence. An optional paid root-cause analysis remains a separate, priced action.
Do not infer a failure reason from a lower step grade.

**Check the design by observing:** an engineer can distinguish execution state,
final result and review state from the first viewport, then open the evidence
behind the final result without requesting another model call.

Sources: [task result card](../client/src/run-detail/task-grade-card.tsx),
[run results](../client/src/run-detail/run-detail-page.tsx),
[final outcome reader](../src/server/run-record.ts),
[group presentation](../client/src/run-history/group-workspace.tsx).

## 2. Give attempts the same useful inspection depth

**Observed.** The replay and individual group attempt have working Results and
Context & cost navigation, but their Results screens are mostly a grade, cost,
time and raw-record disclosure. The standalone session shows a passed-check count
without its reply or individual check explanations. The group attempt heading
leads with UUIDs, while the group has separate lists for attempt results and saved
session context. This is a thinner experience than pipeline-step inspection.

**Proposal.** Use the same reading structure for the original execution and its
replays: outcome, saved output, failed checks or rubric findings, citations, cost,
and relevant comparison actions. Render the evidence each record actually saved;
keep JSON as an export and debugging option. Where older repetition records only
retain a summary, explain that boundary rather than imply detailed checks exist.

Use a breadcrumb such as case → run → step → attempt, a readable attempt position,
and previous/next controls. Keep the canonical record ID available to copy. One
attempt table can offer both Results and Context actions, with its grade, cost,
corpus and coverage together. Preserve the parent and view in the URL so returning
from evidence restores the investigation.

Use readings appropriate to the case: deterministic checks for a session, step
grading for a replay, and an independent final result for a complete workflow.
An irrelevant final-workflow panel does not need to occupy a session's summary.
Its absence must not conceal missing evidence for a workflow that should have it.

**Check the design by observing:** the engineer can inspect why a recorded attempt
failed, compare adjacent attempts, and return to the parent without opening raw
JSON or losing the selected step.

Sources: [attempt workspace](../client/src/session-history/attempt-workspace.tsx),
[group workspace](../client/src/run-history/group-workspace.tsx).

## 3. Put the Context & cost workbench within reach

**Observed.** On the inspected two-step pipeline, the event workbench began at
approximately y=3141 at 1440 × 900 and y=3174 at 1280 × 800. Run setup, token
readings, repeated identity fields and a long declared-corpus list preceded it.
After scrolling, four narrow columns split sources, events, requests and detail.
The saved pipeline had no request series, so an unavailable request pane still
occupied a column. The Activity action “open transcript” arrived at this view's
top, leaving the events far below it.

**Proposal.** Start with selected-scope cost and coverage, followed by the
investigation surface. Collapse full provenance and declared files into counted
disclosures, retaining their warning summaries. Give sources/events a compact
navigation column and the selected evidence most of the desktop width. Keep a
compact run/step selector visible while scrolling; allow the full workflow graph
to expand in place.

Use visualizations to answer specific questions:

- A labeled cost breakdown by execution, Judge and delegated work, with coverage
  and unallocated amounts beside the reading. Show own and descendant totals
  separately so they cannot be added twice.
- Context input at recorded requests, by agent, with recorded compaction markers.
  This is a request measurement, not a model context-limit meter or a cumulative
  token total. An agent's window is not summed with another agent's.
- A sortable source table for delivered size, repeated delivery and source
  evidence. Preserve characters versus tokens, declared versus observed loads,
  and the fact that a delivery does not establish that the agent followed it.

For an archive without request measurements, show a compact availability note and
expandable explanation in place of an empty chart column. Deep links such as
“open transcript” should select and reveal the events directly.
For a fully unpriced request, lead with “Unpriced” rather than a calculated $0.00.
Where only some requests are priced, retain their known subtotal with its coverage.
Saved replays retain no raw transcript or request series; the visual example uses
a session repetition with recorded requests, not a replay.

**Check the design by observing:** at 1280 × 800, the first viewport contains a
useful selected-scope reading and an investigation control, with no manifest
scroll required; selecting a source reveals its evidence in the same workspace.

Sources: [saved evidence workbench](../client/src/session-history/session-history-page.tsx),
[request readings](../client/src/session-history/request-timeline.tsx),
[agent evidence](../client/src/session-history/agent-tree-pane.tsx),
[run resource readings](../client/src/run-detail/resource-readings.tsx).

## 4. Let comparisons open with the experiment's meaning

**Observed.** The comparison index lists a hash, mode, cases and repetitions.
It offers little help recognizing which edit a report tests. A detail page opens
on Attempt pairs. Its “What moved” presentation already gives a more compact
reading of checks, reply length and cost. The UI calls the control “Baseline” and
the baseline/candidate “Arm A”/“Arm B,” translating the record's role names.

**Proposal.** Lead the index with the case and a readable description of the
recorded corpus difference, with a supported result summary and coverage. Keep the
digest secondary. Lead detail with the existing “What moved” reading and its
limitations; put attempt-level evidence directly beneath or one click away.

Consider labels that expose the roles: baseline (before), candidate (after), and
control, with the control's actual construction underneath. A supplied minimal
corpus, a removed skill, and an unchanged baseline are different controls. These
labels are a proposal, not a glossary change.

Show sample counts, spread, failures, ungraded attempts and attribution limits
beside the conclusion. “No supported improvement yet” is an appropriate reading
when differences fall inside rerun noise; equal passing checks alone do not prove
equivalent quality. A multi-case report must retain disagreements between cases.
Add a contextual path from eligible source/replay groups to the existing controlled
comparison launch. Keep exploratory source/replay inspection visibly distinct.

**Check the design by observing:** the engineer identifies what changed and what
the evidence supports before reading a table of attempts, then opens the corpus
diff or an outlying attempt without guessing an arm's meaning.

Sources: [comparison index](../client/src/comparison/comparisons-page.tsx),
[comparison detail](../client/src/comparison/comparison-page.tsx),
[role translation](../client/src/comparison/design-arms.ts),
[control descriptions](../client/src/comparison/arm-cards-band.tsx).

## 5. Make corpus editing a recoverable part of the experiment

**Observed.** The current install lists 137 files without a file-search control.
It is linked to the live install, so the contextual “Test an instruction” path
ends at a read-only explanation and a terminal command. Settings can link another
directory. The editor source holds its draft in component state and documents
that navigation or file switching drops it. The existing review/apply flow already
preserves versions, reports stale results and offers the selected source replay.

**Proposal.** Add file search and a directory navigator alongside the editor,
with source-step files first when arriving from a run. Show frozen source and
current editable version together, with their difference available. Preserve
unapplied drafts by file/source, or explicitly guard navigation that discards them;
reopening a draft must still check the current file before apply.

For a live install, offer an in-product route to link an existing editable copy.
A later “Create editable copy” action could prepare and link a copy while preserving
the selected source. That requires new filesystem behavior and should clearly
show its destination before writing. Keep the live install read-only. Keep the
existing review, apply and source-bound replay steps; give each a clear next action.

**Check the design by observing:** an engineer can recover from the live-install
state and resume the same source-bound edit, and an accidental view change does
not silently lose their draft.

Sources: [corpus browser](../client/src/corpus/corpus-page.tsx),
[editor lifecycle](../client/src/corpus/corpus-edit.tsx),
[source identity](../client/src/corpus/experiment-source.tsx),
[corpus settings](../client/src/settings/corpus-settings-card.tsx).

## 6. Show the conditions of a launch before its commitment

**Observed.** The new-run dialog has a narrow, truncated native case selector,
current corpus, spend ceiling and attempt presets. It says the model is declared
by the case without showing that model in the form. “Store ceiling” changes the
persisted limit for future CLI and browser launches, inside a dialog that otherwise
looks specific to this launch.

**Proposal.** Expand the selected case description and show execution model/effort,
relevant Judge model, corpus, target or frozen input, attempt count, and the
projected budget basis. A replay should explicitly say that it freezes the input
and which corpus it will use; it must not imply that all original conditions are
unchanged when it uses the current corpus.

Label the stored limit's scope beside its edit action. Show per-attempt and group
thresholds together, preserving the qualification that calls in flight may overrun
them. Keep optional settings behind a disclosure, and give Start the primary
emphasis. Avoid a wizard for a straightforward repeat launch.

**Check the design by observing:** before Start, the engineer can state which
case/input, corpus and models will run, how many attempts will start, and whether
editing the displayed budget changes future launches.

Source: [launch dialog](../client/src/launch/launch-dialog.tsx).

## 7. Make the history table easier to scan and revisit

**Observed.** Runs mixes execution-state filters with record-kind filters in one
pill row. The observed header counted 189 records while All and the sidebar counted
190, including a launch. Outcome, step grades and final outcome compete within a
dense row. Primary links are short run identifiers, and raw state/error strings
appear in supporting text. The search control is already useful.

**Proposal.** Separate composable status, kind and case filters, and preserve
search/filter state when returning from a run. Use one clear primary result with
execution and review state beside it, while keeping step letters inspectable.
Count saved records, launches and unread records with explicit scope. Give the
row a generous opening target while retaining real links, modified-click behavior
and independently actionable step/evidence controls.

Translate states into short human descriptions; expose full errors and exact IDs
on demand. Keep corpus validity visible as a separate evidence qualification.
A corpus that matches today's install is not proof that the experiment succeeded.

**Check the design by observing:** filtering for a case and replay kind survives
inspection and back navigation, and no row's completion mark can be mistaken for
a passing result.

Source: [run history](../client/src/run-history/run-history-page.tsx).

## 8. Improve reading comfort and reserve emphasis for decisions

**Observed.** Computed styles in the saved-attempt workbench used 9.75px text
for labels and evidence qualifications. Dim text `#75798c` over `#1a1c28` had a
contrast ratio of approximately 3.93:1; over `#161826`, approximately 4.08:1.
These are ordinary text readings below the 4.5:1 minimum described by
[WCAG's contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
This was a targeted measurement, not a complete accessibility audit.

**Proposal.** Keep the palette and type families. Use 13–14px for prose users need
to read, 11.5–12px for secondary metadata, and reserve monospace for code, paths,
IDs and measurements. Raise dim-text contrast where it carries information. Reduce
repeated uppercase labels and borders before reducing reading size. Give the
primary action a distinct treatment; keep selection violet and semantic outcome
labels distinguishable by text and shape as well as color.

Use desktop width for evidence and editing. Keep simple Settings forms comfortably
bounded; a narrow text column is appropriate there. The more complex case form
and evidence inspectors need more room. Preserve visible keyboard focus and the
existing shortcuts, with a discoverable help entry near the working surface.

**Check the design by observing:** required text meets contrast targets, ordinary
reading is comfortable at 100% zoom, and keyboard users can see where they are
and return from an inspector to its trigger.

Sources: [design tokens](../client/src/system/tokens.css),
[base styles](../client/src/system/globals.css),
[dialog primitives](../client/src/system/ui/dialog.tsx).

## 9. Make Cases a place to understand and choose a test

**Observed.** A long explanation of aggregation rules precedes the case list.
Cards combine technical IDs, repository paths, corpus-specific historical figures,
check-kind names and launch buttons. Workflows are reachable, but session cases
have no equivalent visible inspection action in their cards. Case creation puts
prompt, tools, corpus paths, model, budget and checks into a narrow modal.

**Proposal.** Add case search and type filters. Lead each row with the behavior
being tested, then the latest corpus-specific aggregate with its sample count.
Put the aggregation method behind “How these figures are calculated.” Provide a
case inspector for prompt/input, declared instructions, checks, workflow and recent
attempts. Use one Run entry with repetition count in its form, while preserving
quick repeat actions where they save work.

Give creation a wider form with the behavior and success checks prominent and
execution details grouped under advanced settings. Offer a supplied session example
as a starting point. Keep workflow editing/import/export under Cases, with consistent
labels and clear links to the cases using a workflow.

**Check the design by observing:** an engineer finds a relevant test, reads what
it grades, and prepares a run without opening source files or memorizing check kinds.

Sources: [Cases](../client/src/cases/cases-page.tsx),
[case declaration](../client/src/cases/declare-case-dialog.tsx),
[Workflows](../client/src/tasks/tasks-page.tsx).

## 10. Give calibration and first use a concrete starting point

**Observed.** Zero calibration reviews produced empty table headers and a drift
panel. “Review next unjudged step” opens evidence and a long grading form in two
columns. The fresh-install screen starts with budget and corpus setup, then case
declaration; its global corpus card can already describe the live install while
setup still asks for a corpus selection.

**Proposal.** Keep Judges under Settings and the contextual review link in Results.
Replace the empty table with a short explanation and an eligible review to start.
For blind grading, provide an evidence outline, criterion navigation, answered
count and a persistent save action. Keep the Judge's answer hidden until the human
has submitted. Distinguish this operator calibration grade from a saved human
review of final work.

For first use, offer a supplied low-cost session case after corpus and budget
selection, with an explicit launch and a clear route into its saved result. Explain
whether the detected live corpus is already selected or only available to select.
Retain custom case creation as an available path. The first useful outcome should
teach the experiment loop before requiring the engineer to author its setup.

**Check the design by observing:** a first-time engineer can reach one inspectable
measurement without inventing a case, and a reviewer can grade evidence without
seeing the Judge's answers or losing their position.

Sources: [calibration](../client/src/calibration/calibration-page.tsx),
[blind review](../client/src/calibration/stage-review-page.tsx),
[setup](../client/src/setup/setup-page.tsx),
[fresh-install detection](../client/src/setup/fresh-install.ts).

## Validate the next prototype

Use the existing desktop prototype for the first four recommendations. Keep its
records explicitly synthetic. Include a failed final result with accepted steps,
a stopped run with missing measurements, a failed session repetition, an unpriced
request, an archive without request measurements, an incompatible older corpus,
and an inconclusive comparison.

Ask engineers to distinguish execution and quality, find a failure's evidence,
inspect a replay, locate an expensive interval, and explain what a comparison
supports. Observe task completion, wrong interpretations, backtracking and lost
selection. Compare against the current product using the same tasks and records.
Set performance targets after recording that baseline; the review does not claim
a measured usability improvement.

At 1280 × 800 and 1440 × 900, verify the first useful reading, accessible primary
actions, readable evidence, stable run/step/attempt identity and preservation of
the full record behind disclosures. Keep the application unchanged until the
proposed layouts have been evaluated.
