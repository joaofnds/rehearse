# Building and reviewing the UI

Use the [client design system](../client/src/system/README.md) for component,
type, surface and spacing contracts. This checklist defines the scope and evidence
for a UI review. It records no completed review. The
[router](../client/src/router.tsx) is the route inventory; update the matrix when
routes, views or dialogs change.

## Build from the shared contracts

Give each screen a readable identity, a short explanation of its current state
and an action that names its destination or effect. Keep exact record identifiers,
model configuration and timestamps in inspectable provenance unless they answer
the immediate reading. Preserve the separate meanings of execution, independent
final outcomes, continuation grades and human review.

Use `ActionGroup` where actions need to wrap within their available width. Its
children still need bounded content: put a long download filename in wrapping
context beside a concise Download action, retaining the filename in its accessible
name and download attribute. Keep disabled-action explanations in a reading row
and associate them with the action.

Use `AmountInput` for the shared USD field boundary and `RadioChoice` for native
radio options. The caller owns amount validation, persistence, radio grouping and
the choice's meaning. Check keyboard focus on the complete control and check the
44px target, including in a dialog. The
[control contracts](../client/src/system/README.md#control-and-evidence-details)
describe their props and responsibilities.

Apply label casing to the label itself. Preserve the recorded casing of paths,
case identities, model names and saved text. Give long values room to wrap with
`min-w-0` and `wrap-anywhere` at the element that contains the value; a wrapping
parent flex row alone cannot break a long filename. Keep the sole record identity
and required evidence available in full.

Choose `TableShell` when users compare counts, amounts or measures across aligned
columns. Use `RecordList` when identity, a change summary and a destination lead
the reading. Put prose width limits on prose; use the screen's available width for
a data collection. Retain units, coverage and unavailable reasons when changing
layout.

Use `EmptyState` after a successful read establishes that the relevant collection
has no records. Keep failed reads, unreadable records, a missing selected record
and filters with no matches distinguishable. Name the next action and retain its
working control. Setup wording must match the current controls: scanning can
precede choosing a spend limit, a linked corpus unlocks declaration, and Finish
requires both a linked corpus and a positive limit before storing that limit.

An explicit Corpus View action reveals and focuses the reader heading in the
workspace. Close returns focus to the originating file action while it remains
connected. Repeated View actions can reveal the same file again. Background
refetches preserve the user's newer focus. Keep editor autofocus in linked
directories, selected lines and recovered drafts when working on this interaction.
When Apply replaces the editor, focus and reveal its confirmation in the workspace.

Follow the existing
[viewport and scroll ownership](../client/src/system/README.md#viewport-and-scroll-ownership)
contract for workspace, table, pane and dialog containment.

## Evidence and inspection conditions

Record the revision, browser, viewport width and height, data source, route, selected
view and relevant state for an observation. Include the action used to reach it,
what appeared, where focus moved and which region scrolled. Link the screenshot
or other retained evidence and the finding's resolution or remaining limit.

| Evidence                                    | What it establishes                                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source review                               | Reachable branches, labels, component use and likely layout risks. Mark rendering predictions as unverified.                                                         |
| DOM check                                   | Rendered text, accessible roles, focus, state transitions or requests under the test's fixtures. DOM checks do not measure browser layout.                           |
| Browser inspection with saved local records | The served application's rendered behavior for the named records, browser and viewport.                                                                              |
| Browser inspection with synthetic fixtures  | The rendered behavior of the same client for the named fixture responses. State that the data is synthetic and identify any live integration that remains unchecked. |
| Unavailable                                 | The missing data, environment or interaction and the evidence needed to inspect it. This is a coverage limit.                                                        |

Start from the integrated browser setup in
[Contributing](../CONTRIBUTING.md#development-setup). Inspect a desktop viewport,
320px width and a short window; record the heights. Resize the same expanded state
across its layout breakpoints. Use keyboard navigation as well as pointer input,
including focus inside overflow regions and dialogs. Check shared-component
consumers after a shared change.

For states absent from local records, prepare public synthetic responses in a
disposable local fixture environment. Existing
[client test support](../client/src/test-support/) and feature tests show the
response shapes; they do not provide a browser fixture server. A local fixture
responder should serve the built client, keep its responses reviewable and prevent
requests from reaching live mutation or provider endpoints. Keep launch, save,
apply, stop and corpus-link actions from changing the installed application during
inspection. Tests with fakes can verify writes; label a browser fixture's canned
write outcome as synthetic. Keep benchmark case fixtures unchanged for a UI review.

Use placeholder identities such as `:run`, `:caseId` and `:digest` in public review
notes. Keep screenshots and responses free of private transcripts, instruction
bodies and machine paths before publishing them. Include the fixture's setup and
limits so another contributor can reproduce the state.

## Route and state review matrix

The paths below use placeholders for recorded identities and search values. Choose
available records or synthetic fixtures for the listed states; mark missing states
in the review record. Shared views still need their different record kinds checked
where their data, actions or unavailable readings differ.

| Family and entry points                                                                                                                                         | States and interactions to inspect                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell on product routes                                                                                                                                         | Compact and desktop navigation, current section after navigation/resize, corpus identity, global Search scopes and long results, no matches and failed collections, dialog close/focus return. In-flight bar with one and several runs, long labels, missing cost and bounded scrolling.                                                                                                      |
| Runs `/`                                                                                                                                                        | Search, sort, status/kind/corpus filters, narrow Filters toggle, no matches, successful empty history, unreadable records, active queue and ended launch history with a launch that ended by an error. Expand invalidation/count explanations and partial cost/time readings; scroll the table on both axes. Open New run, Replay a step and comparison launch reviews without starting them. |
| Workflow Results `/runs/:run?view=results`                                                                                                                      | Selected steps, final outcome and failed criteria, step output in Formatted/Raw and complete output dialog, assessment citations, input/checkpoint, setup/provenance, whole workflow record and analysis map. Cover stopped execution, missing evidence and independent final failure.                                                                                                        |
| Workflow Activity `/runs/:run?view=activity`                                                                                                                    | Running, pending, ended and interrupted session/Judge panes, long transcript/tool content, tail follow/pause, step details, workflow graph and spend readings. Check stacked panes and access in short windows.                                                                                                                                                                               |
| Workflow Context `/runs/:run?view=context`                                                                                                                      | Evidence, Requests and Agents views; source/event search, event filters, request selection, cost breakdowns, provenance and diagnostics. Check long evidence and unavailable request/agent readings. Retain selected step/event through navigation.                                                                                                                                           |
| Workflow entry aliases `/runs`, `/monitor`, `/monitor/:run`, `/runs/:run/stages/:stage`                                                                         | Newest run selection, no available run, Activity for the selected run and Context for the selected step. Follow existing links through these entries and verify the resulting view and return context.                                                                                                                                                                                        |
| Session attempts `/attempts/session/:caseId/:uuid`                                                                                                              | Results and Context & cost, saved reply, separate reply/transcript and saved-state assessments, disagreement, missing output, complete output dialog and provenance.                                                                                                                                                                                                                          |
| Replays `/replays/:lineage/:timestamp`                                                                                                                          | Results and Context & cost, source comparison, saved output and assessments, missing event-detail support, provenance and return to source/comparison.                                                                                                                                                                                                                                        |
| Groups `/groups/:groupId`                                                                                                                                       | Results and Attempts for session, step and whole workflow groups; requested versus saved attempts, source comparison, frozen reads, provenance, partial costs, unreadable attempts and missing checks. Inspect the attempts table and its evidence destinations.                                                                                                                              |
| Group attempts `/groups/:groupId/reps/:repId/attempt`                                                                                                           | Results and Context & cost, step selection, adjacent attempts, source/group/comparison return paths, saved-state checks and missing attempt evidence.                                                                                                                                                                                                                                         |
| Comparisons `/comparisons`, `/comparisons/:digest`                                                                                                              | Collection Setup & record disclosures, repeated case names and long paths. Detail modes session/step/whole workflow, What moved and Attempt pairs, control/baseline/candidate coverage, unavailable arms or attribution, uncertainty and review for more attempts. Keep requested repetitions distinct from saved results.                                                                    |
| Cases `/cases`, `/cases?caseId=:caseId`                                                                                                                         | Successful empty collection, unreadable declarations/records, missing selected case, long identity/title, prompt/evaluation contract, corpus cohort selection and member evidence. Declare session/workflow case forms, checks, model-unavailable reasons and Run once/Run group reviews.                                                                                                     |
| Workflows `/cases?view=workflows`, `/tasks`                                                                                                                     | Full lists and lists filtered by case, idle/live graph actions, empty/unreadable states, Import and Export dialogs, long export filenames, import preview/refusal, Edit steps with add/move/remove controls and bounded header/footer actions.                                                                                                                                                |
| Corpus `/corpus`                                                                                                                                                | Live read-only and linked-directory inventories, search/no matches, refusal and empty states. View/Close focus, long paths, Formatted/Raw, linked Edit, diff/review/refusal and applied state from a fixture. Recover a draft after navigation; distinguish reload clearing it. Check `file`, `start`/`end` and `sourceRun`/`sourceStep` link context.                                        |
| Settings `/settings`, `/settings?view=judges`, `/calibration`                                                                                                   | General amount input, corpus fields/actions, keyboard reference and record-size errors. Judges first-review/empty state, agreement table, drift groups and unavailable report. Inspect forms without storing configuration.                                                                                                                                                                   |
| Calibration review `/calibration/runs/:run/stages/:stage`, `/calibration/groups/:groupId/reps/:repId/stages/:stage`, `/calibration/replays/:lineage/:timestamp` | Blind criteria selection, native radio keyboard behavior, evidence sections, long criterion text, optional note and disabled/incomplete submission. Use fixtures for recorded-review comparison and refusal; verify the return destination for each record kind.                                                                                                                              |
| Cited source `/runs/:run/stages/:stage/evidence/:section/:item/:index`, `/runs/:run/final/evidence/:item/:index`                                                | Citation dialog and full page, quoted span reveal, long source/claim, harness result, absent source and older evidence without quoted spans. Check close/focus return and return from the full page to Results.                                                                                                                                                                               |
| Fresh setup over product routes                                                                                                                                 | Blank/invalid/chosen spend limit, scan before limit, pending/refused scan, long scanned paths, linked corpus and declaration unlock, Finish readiness and fixture failure. Confirm no section falsely appears current while setup replaces its page.                                                                                                                                          |
| Unknown address and missing records                                                                                                                             | Unknown-route recovery; missing run, group, attempt and comparison messages; useful return links; long requested addresses without workspace overflow.                                                                                                                                                                                                                                        |

## Recording coverage

Use one row per observed state and viewport. A review record can use this shape:

| Family/state         | Entry and actions         | Browser/viewport                 | Data and evidence kind                       | Observation/artifact        | Finding and disposition                          |
| -------------------- | ------------------------- | -------------------------------- | -------------------------------------------- | --------------------------- | ------------------------------------------------ |
| `:family` / `:state` | `:route`, then `:actions` | `:browser`, `:width` × `:height` | `:saved-record-or-fixture`, `:evidence-kind` | `:observation`, `:artifact` | `:finding-or-no-finding`, `:resolution-or-limit` |

A full application review covers each route family at desktop and 320px, keyboard
focus, meaningful expanded content, empty/error states and resizing. A source scan
or a passing DOM suite supplies evidence for its own scope. Identify remaining
unavailable browser states and limit the completion claim to the recorded coverage.

For a finding, retain the input/state and before/after observation, name the shared
contract involved and check affected consumers. Report unresolved behavior and
untested integrations with the result. The review record supports an assessment of
the inspected application; it does not establish that future data or changes will
render correctly.
