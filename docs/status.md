# Current state and priorities

Reviewed against the code and project board on **2026-10-04**. This is the public
feature inventory, not a release guarantee. The [vision](vision.md) describes the
longer-term goal; the [runbook](runbook.md) describes the supported first steps.

The project has moved beyond its original NestJS benchmark into a general
instruction-corpus experiment harness. Its CLI can run and repeat experiments,
replay stages, retain grading evidence, and read records. The public onboarding
path is a session case with a small supplied corpus. Complete workflow operation
still requires environment-specific setup.

## Implemented

| Capability                     | Current boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Source                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data-declared cases            | Session and pipeline kinds; bundled inputs have differing portability                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [Case loader](../src/benchmark/case.ts)                                                                                                                                                                                                                                                                                |
| Session attempts               | Fixture/prefix support, deterministic reply/transcript checks, and command-scored grades over the preserved post-session tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [Session execution](../src/benchmark/session-attempt.ts)                                                                                                                                                                                                                                                               |
| Regrading saved evidence       | Re-evaluates a saved attempt's reply, transcript and preserved state against the case as it stands now, reaching no provider; assessments accumulate beside the attempt and never rewrite it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | [Regrade](../src/benchmark/session-regrade.ts)                                                                                                                                                                                                                                                                         |
| Session confirmation           | Repeated frozen inputs, retained failures, per-attempt checks, projected budget including model preflight, not a cap: each session can overrun its budget by the call that crosses it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [Session confirmation](../src/benchmark/session-confirmation.ts)                                                                                                                                                                                                                                                       |
| Spend ceiling                  | A stored ceiling every paid command requires; stored from the CLI or the browser's launch dialog; each session budget clamped to the ceiling left, a pipeline run stopped in its stage with the ceiling and spend recorded, confirmation reps held together to the reps times the ceiling, and the ceiling recorded on every run, replay, attempt and group                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [Spend ceiling](../src/benchmark/spend-ceiling.ts)                                                                                                                                                                                                                                                                     |
| Culprit analysis               | `analyze <run>` records one sealed session's reading of which corpus file an ended run's outcome traces to, with each stage's role, checked against the stages that ran and the files they read; an API route reads a run's analyses and the request a browser would make, and a guarded launch route can start one, which `/runs/<run>` shows and requests at the stated cap. While a run is in flight the monitor node shows what each finished step's record says it produced, as counts of its commits, changed files and workflow-state changes, with no model call, `contribution pending` when the record counts none, and `not started` for a step that has not begun; the phrase from the newest analysis replaces it where one exists, but the monitor lists only runs in flight and an analysis reads only an ended run, so a monitored node shows an analysis phrase only when a crashed run reads as in flight, as the live monitor limits below describe; no real-provider analysis has run | [Culprit analysis](../src/benchmark/culprit-analysis.ts), [analyze command](../src/cli/analyze-command.ts), [analyses route](../src/server/culprit-analyses.ts), [launches](../src/server/launches.ts), [run detail](../client/src/run-detail/run-detail-page.tsx), [task graph](../client/src/monitor/task-graph.tsx) |
| Pipeline execution             | Configured stages, portable private-board setup, dynamic PO, Judges, baseline checks, calibration, restoration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [Run orchestration](../src/benchmark/run.ts)                                                                                                                                                                                                                                                                           |
| Checkpoint replay              | One stage in a host worktree, including explicit corpus variants                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [Replay command](../src/cli/replay-command.ts)                                                                                                                                                                                                                                                                         |
| Pipeline/stage confirmation    | Repetitions with shared frozen inputs and resource/reliability reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | [Pipeline confirmation](../src/benchmark/pipeline-confirmation.ts), [replay confirmation](../src/benchmark/replay-confirmation.ts)                                                                                                                                                                                     |
| Comparison reports             | Baseline/candidate/control arms over at least two cases, or one case in stage or session mode; stage, pipeline, and browser-validated provider-free session evidence; per-attempt elapsed time beside cost; a multi-case report names each case's own delta and its cost contrast, and reads a contrast whose cases disagree; `compare attempts` builds one from two recorded stage groups at one checkpoint and replays its control group, and `compare extend` adds attempts to every arm at a stated cost as a new comparison                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [Comparison loader](../src/benchmark/comparison-loader.ts), [comparability](../src/benchmark/comparison-comparability.ts), [compare attempts](../src/benchmark/compare-attempts.ts)                                                                                                                                    |
| Record inspection              | Cases, runs including stopped stages, checkpoints with their stages' raw transcripts, attempts, groups, a confirmation rep's stage file or session attempt, comparisons, and staleness, named by Record ID, and runs, checkpoints, attempts and groups also by short id; short ids also reach the run history API and the browser's run history and record pages, though no page URL or history API takes one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [CLI commands](../src/cli/commands.ts), [run history](../src/server/run-history.ts)                                                                                                                                                                                                                                    |
| Corpus versions                | Every run manifest records the version at the run's start, and every run stage, replay, session attempt and confirmation group records the whole-layout version it ran against; `corpus versions` and `corpus show` read the kept files back; `corpus invalidation` and `/api/corpus` count the rows that read each file and name the rows the last edit invalidated; the browser shows the label but cannot open a version yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [Version store](../src/benchmark/corpus-version.ts), [corpus command](../src/cli/corpus-command.ts)                                                                                                                                                                                                                    |
| Session context manifests      | Deduplicated loads the transcript records (Reads not answered with an error, instructions attachments, skill bodies, the output style), corpus/project classification, and declared-input reconciliation; no timeline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [Manifest construction](../src/benchmark/context-manifest.ts)                                                                                                                                                                                                                                                          |
| Read manifests                 | Every pipeline stage checkpoint, confirmation reps' included, replay and session attempt written now records what it declared and loaded, with role and starting hash; `show` prints it, the run API serves it per stage with each entry's changed state, a group's summary and its reads route list each confirmation rep's reads, stage by stage for a pipeline or stage group, with the same state, listed unjudged with the reason where the group cannot be judged, and staleness marks each corpus and judge rubric entry unchanged or changed, with a changed rubric staling the record without moving its distance; no screen shows it yet                                                                                                                                                                                                                                                                                                                                                        | [Read manifest](../src/benchmark/read-manifest.ts), [stage reads](../src/benchmark/stage-reads.ts), [staleness](../src/benchmark/staleness-report.ts), [show](../src/cli/show-command.ts), [API](../src/server/api.ts)                                                                                                 |
| Provider context normalization | Versioned source bundle, session-scoped request joins, agent lineage, explicit loss states, frozen-rate pricing provenance, and optional attempt persistence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | [Evidence normalization](../src/benchmark/context-evidence.ts)                                                                                                                                                                                                                                                         |
| Session transcript diagnostics | Post-cut tool occurrences, explicit tool-result errors, exact repeated Bash inputs, source locators, and evidence completeness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [Transcript projection](../src/benchmark/transcript.ts)                                                                                                                                                                                                                                                                |
| Saved context history          | Read-only four-pane workbench for standalone and confirmation session attempts: sources, events, a per-request token and cost timeline, and bounded saved evidence detail, with comparison provenance links. A pipeline stage opens through the same projection, named by run, stage and lineage, with its declared corpus reconciled against the reads its transcript shows and no request timeline. A stage replay opens under the same stage identity as an evidence-unavailable summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [History projection](../src/benchmark/session-history.ts), [instruction loads](../src/benchmark/transcript-instruction-loads.ts), [browser page](../client/src/session-history/session-history-page.tsx), [request timeline](../client/src/session-history/request-timeline.tsx)                                       |
| Local UI, event and launch API | Partial browser views, guarded routes that launch a case or replay detached, stop a launch and pause a run after its stage, settings routes that read and store the ceiling and link, unlink or rehash a corpus directory, server-side event streaming, a per-run record API with each stage's cost, tokens, wall time, artifacts in and out, and a stopped stage's letter, the run's minimum grade, wall time and final outcome, run history rows with stage grades, final outcome, cost and wall time, and confirmation group rows with each stage's median, range and graded count, a final outcome tally and the spend their reps recorded, naming each figure no record holds, the task and case listings behind the Tasks and Cases screens, and a guarded route that declares a session case                                                                                                                                                                                                       | [Router](../client/src/router.tsx), [API](../src/server/api.ts), [Run record](../src/server/run-record.ts), [Run history](../src/server/run-history.ts), [Tasks](../src/server/pipelines.ts), [Cases](../src/server/case-listing.ts), [Case declaration](../src/server/case-declaration.ts)                            |

An implemented path can still have missing real-provider validation. Session
comparison uses frozen records and a provider-free integration path. Its saved
Attempt-pairs view has been verified through the built browser route: each case
shows the recorded arm distributions, and corpus attribution distinguishes zero,
one, and multiple differing layout paths. Its What moved view groups the served
per-measure quality readings by case, including both arm intervals and the reading
verdict. That browser verification covers the multi-case shape; a single-case
session report reaches the same server route and its report is served with the
case present, but no browser check has been run over it. Since ACT-271.1 the
route reads a session's checks and a pipeline's final verdict by each arm's 95%
Wilson interval on its success rate, printed as percentages, and serves each
arm's median and range (letters for a stage, successes of attempts for a
pass/fail measure) with its total and per-attempt cost and, since
ACT-271.2, its average words; a report written before word counts reads
unavailable. Since ACT-271.3 a stage comparison may name one replayed checkpoint,
and the route serves What moved rows for hard-blocker firings, dimension letters,
reply length and cost per attempt, read from the grading each rep's scorecard
recorded; a meter names a higher arm only past rerun noise, which takes about
four attempts an arm, and these rows are API-verified only. Since ACT-271.4 the
route also lists each arm's recorded attempts side by side, unpaired. Run history can
choose two stage groups at one checkpoint and start `compare attempts` from the
browser. Its control group replays the stage on arm A's corpus without the
stage's own skill, under an unchanged prompt that still names that skill; it
refuses a skill the stage never read, since all three arms would read the same files. No real-provider
comparison of attempts has run yet. A comparison launch that fails after its
process starts leaves no run history row, and its log is not served; the
failure is only in `launches/<id>.log`. Since ACT-271.5 the route also serves
a per-case summary of how arm B compares with arm A and each with the baseline
arm over every combination of their attempts, arm B's reply-length change and
what adding attempts would cost. `compare extend` adds attempts to every arm of
a saved comparison of attempts at that stated cost, from the CLI or the
comparison page, and the comparisons list shows the extension in place of the
comparison it extends; no extension has run on real provider calls yet
(ACT-271.6). The page does not show those arm figures, rows, attempts or the
summary yet (ACT-257).

## Known limitations

- **The spend ceiling can be overrun by the call in flight.** Claude Code
  stops a session only after the call that crosses its budget, a provider
  call that fails without a result envelope reports no cost and is not
  counted, and the model probe is outside the run's spend. A replay, a group
  rep, or a pipeline run's final Judge or calibration rejudge that the ceiling
  refuses fails like any other execution failure, without the ceiling-stop
  reading a pipeline stage records. See
  [spend ceiling](reference.md#spend-ceiling).

- **Short ids are unique per records directory.** Another clone numbers its own
  records from 1, so a short id quoted from one machine can name a different
  record on another. A record no claim names has no short id, and nothing
  numbers it later. See
  [record locations](reference.md#record-locations-and-ids).

- **Read manifests see only what the transcript and declarations show.** A
  stage's project instructions are found by the loads its transcript records,
  so one it never loaded is absent, and one is hashed only when the starting
  commit held it. A record whose transcript could not be read lists only its
  declared entries and does not say so. A corpus file the record loaded
  outside its captured corpus files takes the hash the corpus version measured
  at its start holds for its path, not a hash of the bytes read, so it carries
  no hash when that measurement refused or the version holds no file there,
  and an edit to the corpus file stales the record while a change to the bytes
  the stage read goes unseen. On a live corpus a stage's captured files resolve
  from the target's own `.claude` first, so a file the target overrides is a
  corpus entry carrying the target's bytes, not the live install's. A session
  attempt's manifest leaves out a load from its `.claude` that the harness did
  not install, so a file the session wrote there and read is not listed.
  The run API serves a run's entries without a changed state when the corpus
  under test cannot judge it, such as when it no longer holds a stage's skill.
  The run history screen shows a rubric-only stale record with the plain stale
  badge rather than the agreed `⚠ stale · judge rubric changed`.

- **Session comparison does not isolate new inputs.** It consumes the frozen
  case, fixture, transcript, and corpus rows already written by confirmation.
- **A session case declares its own execution permissions.** Session attempts
  run with project settings sources, so the operator's permission defaults do
  not reach the session. A case that edits files or runs a command carries a
  `permissions.allow` block in its declared settings; without one those tools
  are denied at runtime even when the operator's own settings would allow them.
  See the [support matrix](reference.md#corpus-sources-and-delivery).
- **Only signals are confined.** Commands whose sessions can run commands keep
  those sessions from directly signalling a process outside the run with a
  `sandbox-exec` sandbox, which makes them macOS-only, and setuid programs such
  as `ps` cannot run inside it. Files, network, the harness, other sessions of
  the same run, and signals sent through a process outside the sandbox are not
  confined. See
  [signal confinement](reference.md#signal-confinement).
- **Corpus containment is a read boundary.** Declared inputs, stage capture,
  `stale`, and the corpus API check layout roots and entries against their
  source extent. Live sources allow the install and configured backing tree;
  directory sources and frozen snapshots stay within their own root. These
  checks do not constrain hard-linked data, sandbox provider tools, or prevent
  concurrent link replacement. A corpus path selected for reading that cannot
  supply its claimed entries or bytes, whether it escapes, dangles, never
  resolves, cannot be read, or has the wrong file type, produces a named
  refusal; the refused path's layout directory then contributes no files and
  the corpus digest is withheld.
- **Corpus versions have gaps at their edges.** Two measurements racing across
  an edit can log the older version after the newer one. The rail's `corpus@`
  label names the linked tree before anything has measured it, so that version
  may not open until a run, replay, session attempt or rehash stores it. The
  `corpus show --file` command prints a file as UTF-8 text, so a non-text file
  does not print as its bytes; the file route serves the bytes. See
  [corpus versions](reference.md#corpus-versions).
- **The corpus screen does not show invalidation counts yet.** The counts and
  the last edit's rows exist in `corpus invalidation` and `/api/corpus`, and
  the browser does not read them. See
  [corpus versions](reference.md#corpus-versions).
- **The corpus column words only corpus-file drift by distance.** A record
  stale because its model, effort or stage settings changed, or downstream of
  a stage that did or whose judge rubric changed, shows the plain stale badge and its causes, since the
  design has no reading for those yet. A record with no cause reads `✓ clean`
  only at distance 0 and `✓ clear` otherwise, including the initial checkpoint
  and records written before corpus versions, whose distance is not recorded.
  A session attempt of a case that is no longer declared reads its staleness
  as unavailable on the run history, and `stale` names it on stderr.
  A stopped stage whose stop record has no `corpusFiles` (written before
  2026-09-07) is not judged, so its run is judged by its checkpoints alone.
  One whose stage records do not parse is named unreadable, and its run row
  has no judgment.
- **Pipeline `run --corpus` is refused.** Replay supports explicit corpus
  directories, but the forward pipeline command does not yet use that path.
  A pipeline `run`, and a pipeline case launched from the browser, is refused
  the same way while a corpus directory is linked, naming the command that
  unlinks it, so it never measures the live install in the linked
  directory's place.
- **Several cases depend on private inputs.** `brief-reply-*` need transcript
  prefixes that are ignored rather than published; `smoke` and `history-probe`
  need an output style; doctrine examples need installed corpus files. `manifest-probe` carries
  its prefix in the repository, so a clone has its bytes, and still needs the
  corpus files it declares.
- **Session output grading reads only what one run left.** Reply and transcript
  checks are joined by a case-declared scorer over the preserved post-session
  tree, and `regrade` re-reads that saved evidence against a corrected case
  without another model run. Comparison does not yet refuse two arms graded
  under different definitions, so an assessment's grading definition digest is
  recorded but not enforced across arms. A doctrine example's tool-call check
  is not evidence that its implementation is correct.
- **Context visibility is incomplete.** Session manifests still retain names
  rather than a timeline. The saved-attempt browser derives recorded Read and
  Skill deliveries, repeated loads, timestamps, content measurements, and
  evidence gaps from a retained transcript. It does not measure the provider's
  active context window. The saved-attempt browser also renders a per-request
  timeline from that transcript: total input tokens, the four usage categories,
  the executing model, each request's calculated cost against the committed rate
  catalog, the attempt's provider-reported and calculated costs as distinct
  readings, the request in flight when a compaction happened, and the automatic
  instruction loads with their file names. Load reason, trigger, and include
  parent stay unavailable, because a transcript does not record them. The
  harness can also normalize a supplied provider capture into request usage,
  nested-agent lineage, instruction loads, compactions, and priced cost, then
  preserve it on an attempt. The shipped run path does not collect that bundle,
  and the UI does not render that richer form. A pipeline stage opens through
  the same browser projection, but only a stage that passed its grade and kept
  a transcript can show events: a stage the run stopped on reports the stop and
  its reason rather than events, and no saved checkpoint carries a transcript
  yet, so every stage on disk today reports its evidence as unavailable.
  Context visualizations beyond those panes are unfinished. Session transcript
  diagnostics report raw post-cut tool occurrences, explicit errors, and exact
  command repetition; they do not attribute phase, tokens, cost, causality, or
  waste. Their evidence state distinguishes a complete observed zero from
  partial or unavailable evidence.
- **Progress events are not a resource timeline.** They carry the run's spend
  and token totals so far but no instruction-load events, and each event's own
  `spentUsd` changes scope between stage start, worker turns, stage judging,
  stage completion, and run completion. Aggregate provider usage cannot establish active
  context size or a file's causal cost. See the
  [context assessment](context-visibility.md) before drawing attribution
  conclusions.

## Browser UI

Every screen carries a navigation rail listing the nine sections the design
enumerates. It links seven of them, run history, the Live monitor, the saved
comparisons, the corpus, Tasks, Cases and Calibration, with a badge on run
history, the monitor, the comparisons, the corpus and Calibration counting that
collection, the monitor's counting the pipeline runs in flight and
Calibration's the recorded operator reviews, and marks the other two planned. The run and comparison badges leave out the entries that cannot be
read. The rail reaches no other address. The comparisons screen links each saved comparison to its own
page, in digest order because no comparison records when it was made, and a
comparison screen links onward to the attempts it names. The Tasks screen lists
one card per pipeline a case declares as its default or a run or pipeline
confirmation group recorded, with its target, its steps, its step and task
judges, its cases, and a run count over the runs at the latest corpus version
it ran under, with a count of the runs it left out. Each rep of a pipeline confirmation
group counts as a run. Groups record no time, so for a task only groups ran
the steps shown are those of the group whose id sorts first, and the version counted is the first one recorded in that order, so neither need be the newest. A group reaches a card only once it finishes. Open graph goes to the monitor for the
task's newest run in flight and is disabled with the reason while none is, so
a running confirmation group never enables it. A run started after the screen
opened reaches its card once its manifest is written, on a history poll that
still shows it in flight. Import a task, Export with judges and Edit steps
are drawn disabled because they are not wired.

The Cases screen lists one card per declared case with its kind, its target or
no repository for a session case, its title, its steps and judges or its
checks, and figures over its runs at one corpus version: the run count, a count of the runs left out, a pipeline case's median
final verdict and how many runs were graded or a session case's count of runs
that passed their checks, and the mean cost per run with how many runs lack a
cost. A case nothing ran, or whose every run record is unreadable, reads No
runs yet. A pipeline case also shows the minimum grade its newest pipeline run
recorded, which reads not recorded for a case only confirmation groups ran,
since groups record none, even when a group ran after that pipeline run. The
version counted is the first recorded reading pipeline runs newest first, then
session attempts, then groups in id order. Group ids are random and groups
record no time, so the version need not be the newest for any case: a pipeline
run outranks a later group, and a case only groups ran takes an arbitrary
group's version. A group counts once it finishes, and a pipeline run counts as
soon as its manifest is written, unjudged while it runs. A run record that does
not parse is named in a notice: an unreadable pipeline run or session attempt
is left out, and an unreadable group rep is still counted, unjudged and
without a cost. Run once and Run group
open the launch dialog on that case with one or three attempts, and are
disabled for a case that declares no model. Declare a case opens a form
that writes a session case's `case.json` and lists the case without a reload,
saying the file is uncommitted and needs `bun run fmt` before its commit. The form sets only the id, title, prompt,
tools, corpus files, checks, model and session budget; a pipeline case, and
any other session field, is still declared by hand. Because the form sets no
`settings`, a tool that edits files or runs a command is denied when the case
runs until a `permissions.allow` block is added to its `case.json` by hand. The empty run
history's Declare a case opens the Cases screen.

Run history lists every saved record kind in one table: pipeline runs, standalone
session attempts, confirmation runs and stage replays, including a run that
failed or was interrupted before writing any stage record. Each row names its
kind and links every page that can render for it: each pipeline stage with a
checkpoint, a stop record or a pending judgment, a session attempt's or a
replay's own history, and each confirmation rep that recorded an attempt. A
link that cannot open names why, such as a failed run's stage that saved no
context, a stage-mode or pipeline-mode rep with no session to show, or a replay
whose source run manifest is gone. Rows whose records say
when they ran come first, newest first, followed by session attempts and
confirmation runs, which record no time. The count, the All filter and the
rail badge cover every listed record. A browser launch, running or stopped,
is listed under All above the records, and is not a record, so the count and
the badge leave it out. A stopped launch's row stays there, whatever its age,
and a stopped single pipeline case shows twice, as its launch and as its run. A running pipeline run's row offers Pause after this step, and a row a
browser launch started offers Stop & restore repo, except a culprit analysis,
which cannot be stopped; see
[browser launches](reference.md#browser-launches). A paused run reads
`PAUSED:<stage>` and cannot be resumed. A run a signal stopped reads
`OPERATOR_STOPPED`, or `STOPPED:<stage>` when the stage was being judged. A
stopped confirmation group writes no group record, so its reps never read as
failed, and a replay, group or session attempt stopped from the browser stays
listed as an `OPERATOR_STOPPED` launch. One stopped from a terminal leaves no
row. Stopped matches only pipeline runs
with a stopped stage. Records that cannot be read are counted by kind in a
notice above the table, with their ids and reasons behind a toggle. A replay
keeps no raw transcript, so its page shows an evidence-unavailable summary with
no events, per-event detail, request series or corpus reconciliation. A run
with unfinished events whose process is gone stays out of the list until the
next server start reconciles it as interrupted.

The rail also names the corpus under test, showing the linked corpus's
current `corpus@` version (the live tree's when nothing is linked), its file count and its latest edit, and saying in words
that the version is withheld when any entry refused hashing. Pressing `g` then
`r` reaches run history from any screen. An address the app does not serve
renders inside the same chrome, naming the address and linking back. `/system`
is reachable only by typing it, because the design's nav does not name it.

| Route                                                                                                                                           | Available today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                                                                                             | Run-history index of every saved pipeline run, standalone session attempt, confirmation run and stage replay, each row linking the context pages that render for it and naming why any other cannot open; the records it could not read, counted by kind with their ids and reasons; empty and error states; a run in flight appears as a RUNNING row carrying its stage, elapsed time, and scoped spend                                                                                                                                                                                                                                                                                                                                                                                              |
| `/corpus`                                                                                                                                       | Linked corpus inventory; instruction editing is marked planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/comparisons`                                                                                                                                  | Every saved comparison an extension has not replaced, by digest, mode, cases and reps, each linking to its own page; the comparisons that could not be read, with their reasons; empty and error states                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/comparisons/<digest>`                                                                                                                         | Saved case/arm distributions, attribution, quality readings, and validated session-attempt links; the API also serves each arm's median, range, cost and average words, which the page does not show yet; a comparison `compare attempts` made offers adding as many attempts again to each arm at the cost stated on the button, or the reasons that cost cannot be stated                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `/attempts/session/<case>/<uuid>`                                                                                                               | Saved standalone session context history, with the per-request token and cost timeline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `/groups/<group>/reps/<rep>/attempt`                                                                                                            | Saved confirmation-rep context history, with the per-request token and cost timeline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/runs/<run>`                                                                                                                                   | Run detail in its Contribution layout, the only one the switcher offers yet: the header with how the run ended, its corpus and a replay of the step it stopped at, the repository-restored banner for a stopped run, the Task grade card with the final outcome beside the last task grade recorded for the case and its staleness, the step map, and the Culprit analysis section with the newest analysis, a failed one's reason, or a request stating its cap before the click. Open the block it names opens the corpus screen rather than the named block, and Set up the paired rerun opens the replay dialog for the culprit step without changing the block. "No recorded run has this id" when run history does not list it. The monitor's run name links here, and run history does not yet |
| `/runs/<run>/stages/<stage>`                                                                                                                    | Saved pipeline-stage context history and its corpus reconciliation; no request timeline. Missing raw capture names which record state produced it; a stage the run stopped on wrote no checkpoint and reports the stop, its reason and its declared corpus instead of events; a stage whose judging never completed reports that instead, with no stop reason, no lineage and no declared corpus                                                                                                                                                                                                                                                                                                                                                                                                      |
| `/runs/<run>/stages/<stage>/evidence/<section>/<item>/<index>`, `/runs/<run>/final/evidence/<item>/<index>`                                     | One judge evidence item's cited source as the run record holds it, read-only, with the quoted span marked and scrolled into view and the record file named; a harness result, an absent source, or an item recorded before quoted spans says which. The monitor's judge pane links here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/replays/<lineage>/<timestamp>`                                                                                                                | Saved stage-replay summary, always evidence-unavailable because a replay keeps no raw transcript; no events, per-event detail, request timeline or corpus reconciliation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `/calibration`                                                                                                                                  | Judge calibration: reviews recorded and agreement within one letter step, each graded stage's two letters, their agreement and where they differed, the Judge's drift per dimension by Judge model, stage and rubric, and a link to the oldest ungraded stage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/calibration/runs/<run>/stages/<stage>`, `/calibration/groups/<group>/reps/<rep>/stages/<stage>`, `/calibration/replays/<lineage>/<timestamp>` | One judged stage graded blind: the input the Judge read and one choice per criterion with an optional note; the Judge's grade beside the operator's only once the operator's is recorded, and no second grade                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/monitor`                                                                                                                                      | The Live monitor for the newest pipeline run in flight; the "No run in flight" empty state when none is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/monitor/<run>`                                                                                                                                | The Live monitor for the run whose Record ID the address names, as each bar's Open monitor opens it; the "This run is not in flight" empty state once that run stops running, or when no run has that id                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `/system`                                                                                                                                       | Design tokens and reusable component gallery                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

New run on run history and Replay from here on a pipeline stage's page open
the run-launch dialog, which starts a case or replays a stage as one attempt or
a group of three, six or twelve under the stored spend ceiling. The launch shows
in run history as running until its process exits or its pipeline run shows
as running. The dialog's spend
field stores the ceiling itself, which every later launch and CLI command then
holds to, and the dialog projects no cost except for adding attempts to a
comparison. The settings API reads and
writes the ceiling and the linked corpus, but no settings screen or first-run
setup shows them yet. Run detail's Step rail and Record ledger layouts,
declaring a pipeline case, editing a case, task import, export and editing,
settings, and first-run setup are design targets. The rail marks
Run detail and Settings planned rather
than linking to them. Live monitoring is partly
delivered: the run list reports a run in flight with its stage, elapsed time and
scoped spend, and the run API also reports how many of a judging stage's
rubric items are back per section, which the monitor's judge pane shows. While a
pipeline run is in flight, a bar along the bottom of every screen shows its
short id, case, step and stage state, run spend against the ceiling the run
started under, a clock ticking each second, and its grades so far, with Stop
for a run started from the browser. A run started outside the browser, from a
terminal for instance, shows Stop disabled with the reason beside it. With
several runs in flight each gets its own bar, newest first. A screen reader
hears a stage accepted, a run stopped, and run spend first reaching 80% of its
ceiling, a share no source sets yet. The run list and the bar read the event
store through a polled route rather than through the SSE API. A crashed run
whose target a later browser launch has claimed can read as in flight, and its
row, bar and monitor then offer a Stop that stops that later launch.
The Live monitor shows one pipeline run in flight. Opened from the rail or
`g m` it shows the newest, and opened from a bar it shows that bar's run. It
shows the run's identity with Pause and Stop & restore repo, which is disabled
with the reason under it for a run started outside the browser, run spend against
the ceiling with burn rate, elapsed time, tokens in and out, a remaining
estimate of time and spend from the median times of the unfinished steps in
earlier runs of the case or the reason it has none, and the task graph with each stage's grade, status, cost, duration, fired hard blockers,
corpus version and checkpoint, and replay where a checkpoint exists. The
running stage's duration counts that stage's own elapsed time each second. The
header and the running stage show the latest corpus version any stage of the
run recorded, or while none has, the version the run measured when it started.
It follows the run's SSE stream, so its readings move as each event lands.
The session and judge panes name the running stage, or the stage selected in
the graph. The running stage's node shows its latest tool call, and the
session pane shows the tail of its transcript, re-read every 2 seconds, with
`f` to stop and resume following it and `j` and `k` to scroll, where `k` also
stops following. A finished stage's pane shows the spans its judge cites from
the session rather than the transcript itself, and once the stage's checkpoint
has preserved the transcript it links to the stage's history page, which
renders it. A stage not started yet says so, and one started before its
session id was recorded shows no transcript. The judge pane shows the stage's
verdict and grade card, the judge's cost, and every hard blocker and quality
dimension under its count of those returned. While the judge is returning,
each returned blocker reads fired or clear and each returned dimension its
grade, the rest read pending, the verdict and grade stay pending until the
record holds them, and the pane re-reads the judge every 2 seconds. Each item
reads evidence pending until the record holds the item's evidence, and a
judged stage's items open it, each cited source linking to its evidence page.
The judge's cost reads pending during its first attempt, and after a rejected
attempt it reads what the judge has cost so far. Between a rejected attempt
and the next one's first reading, and before the first, the pane lists no
items. Progress recorded before per-item results shows the counts alone. A
stage whose judge has not started, or which ended without a judged grade,
says so in one line. A note inside the pane says how far identical reruns'
grades for the step have varied and links to comparisons. It counts as an
identical rerun any other run of the same case under the same corpus version,
whatever model, effort or pipeline it ran with, since the run list it reads
carries none of them. When the runs in flight cannot be read, the monitor
says "Could not read the runs in flight." A step's instructions in and
artifacts out remain design targets. The server has no authentication and binds to IPv4 loopback; use it locally. It answers 403 to a
non-loopback `Host`, and to a write that is not a same-origin JSON request.
The guard reads headers any local program can set, so any process on this
machine can start a paid launch. A launch runs the case as declared, without
the `BENCHMARK_` knobs of the shell that started the server, and measures
the linked corpus, so a pipeline case is refused while a directory is linked.
Settings changes are serialized inside the server, but a `rehearse settings`
command run at the same moment as a browser change can still overwrite the
other's field. A launch whose command refuses after the 202, for a
dirty target or a failed probe, leaves its launch record and log under
`launches/` once its process exits, with no row in run history and no reason
on any screen. A launch
row is kept while a process holds its recorded pid, and a reused pid is not
told apart there, though Stop tells it apart by the process start time.

## Near-term priorities

The board's goals are to let a second person run an experiment, distinguish an
instruction improvement from noise, watch a run's spend, and read a comparison
well enough to decide whether an edit helped. The remaining work follows those
goals, with context visibility added to help explain resource use:

1. Add reproducible public pipeline case inputs.
2. Compare session experiments across arms. State grading and regrading have
   landed; refusing a comparison whose arms were graded under different
   definitions has not.
3. Make context use inspectable alongside outcomes. Build on saved-session
   event and source inspection by validating per-request collection, then extend
   to pipeline steps and reviewer trees. Use a review-efficiency comparison to
   demonstrate reduced tokens and cost with retained quality. Attribute both
   to skills and subagents using request-level model and pricing evidence. The
   [accepted sequence](context-visibility.md#accepted-roadmap) reuses transcript,
   comparison, and monitor work; context history need not wait for live UI.
   Complete comparison explanations and live monitoring as the related evidence
   becomes available.
4. Tighten corpus-source containment and measurement boundaries without
   claiming that host execution is a sandbox.

These are contribution areas, not a fixed delivery schedule. For concrete entry
points, inspect the linked modules and their neighboring tests, then follow
[Contributing](../CONTRIBUTING.md). The personal board's historical card numbers
may appear in code diagnostics, but public readers need no board access to
understand the limitations described here.
