# Current state and priorities

Reviewed against the code and project board on **2026-09-25**. This is the public
feature inventory, not a release guarantee. The [vision](vision.md) describes the
longer-term goal; the [runbook](runbook.md) describes the supported first steps.

The project has moved beyond its original NestJS benchmark into a general
instruction-corpus experiment harness. Its CLI can run and repeat experiments,
replay stages, retain grading evidence, and read records. The public onboarding
path is a session case with a small supplied corpus. Complete workflow operation
still requires environment-specific setup.

## Implemented

| Capability                     | Current boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Source                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data-declared cases            | Session and pipeline kinds; bundled inputs have differing portability                                                                                                                                                                                                                                                                                                                                                                                                                       | [Case loader](../src/benchmark/case.ts)                                                                                                                                                                                                                                          |
| Session attempts               | Fixture/prefix support, deterministic reply/transcript checks, and command-scored grades over the preserved post-session tree                                                                                                                                                                                                                                                                                                                                                               | [Session execution](../src/benchmark/session-attempt.ts)                                                                                                                                                                                                                         |
| Regrading saved evidence       | Re-evaluates a saved attempt's reply, transcript and preserved state against the case as it stands now, reaching no provider; assessments accumulate beside the attempt and never rewrite it                                                                                                                                                                                                                                                                                                | [Regrade](../src/benchmark/session-regrade.ts)                                                                                                                                                                                                                                   |
| Session confirmation           | Repeated frozen inputs, retained failures, per-attempt checks, projected budget including model preflight, not a cap: each session can overrun its budget by the call that crosses it                                                                                                                                                                                                                                                                                                       | [Session confirmation](../src/benchmark/session-confirmation.ts)                                                                                                                                                                                                                 |
| Pipeline execution             | Configured stages, portable private-board setup, dynamic PO, Judges, baseline checks, calibration, restoration                                                                                                                                                                                                                                                                                                                                                                              | [Run orchestration](../src/benchmark/run.ts)                                                                                                                                                                                                                                     |
| Checkpoint replay              | One stage in a host worktree, including explicit corpus variants                                                                                                                                                                                                                                                                                                                                                                                                                            | [Replay command](../src/cli/replay-command.ts)                                                                                                                                                                                                                                   |
| Pipeline/stage confirmation    | Repetitions with shared frozen inputs and resource/reliability reports                                                                                                                                                                                                                                                                                                                                                                                                                      | [Pipeline confirmation](../src/benchmark/pipeline-confirmation.ts), [replay confirmation](../src/benchmark/replay-confirmation.ts)                                                                                                                                               |
| Comparison reports             | Baseline/candidate/control arms over at least two cases, or one case in session mode; stage, pipeline, and browser-validated provider-free session evidence; per-attempt elapsed time beside cost; a multi-case report names each case's own delta and its cost contrast, and reads a contrast whose cases disagree                                                                                                                                                                         | [Comparison loader](../src/benchmark/comparison-loader.ts), [comparability](../src/benchmark/comparison-comparability.ts)                                                                                                                                                        |
| Record inspection              | Cases, runs including stopped stages, checkpoints with their stages' raw transcripts, attempts, groups, comparisons, and staleness, named by Record ID, and runs, checkpoints, attempts and groups also by short id; short ids also reach the run history API and the browser's run history and record pages, though no page URL or history API takes one                                                                                                                                   | [CLI commands](../src/cli/commands.ts), [run history](../src/server/run-history.ts)                                                                                                                                                                                              |
| Corpus versions                | Every run stage, replay, session attempt and confirmation group records the whole-layout version it ran against; `corpus versions` and `corpus show` read the kept files back; `corpus invalidation` and `/api/corpus` count the rows that read each file and name the rows the last edit invalidated; the browser shows the label but cannot open a version yet                                                                                                                            | [Version store](../src/benchmark/corpus-version.ts), [corpus command](../src/cli/corpus-command.ts)                                                                                                                                                                              |
| Session context manifests      | Deduplicated loads the transcript records (Reads not answered with an error, instructions attachments, skill bodies, the output style), corpus/project classification, and declared-input reconciliation; no timeline                                                                                                                                                                                                                                                                       | [Manifest construction](../src/benchmark/context-manifest.ts)                                                                                                                                                                                                                    |
| Read manifests                 | Every pipeline run's stage checkpoint, replay and session attempt written now records what it declared and loaded, with role and starting hash; `show` prints it, the run API serves it per stage, and staleness marks each corpus and judge rubric entry unchanged or changed, with a changed rubric staling the record without moving its distance; no screen shows it yet                                                                                                                | [Read manifest](../src/benchmark/read-manifest.ts), [stage reads](../src/benchmark/stage-reads.ts), [staleness](../src/benchmark/staleness-report.ts)                                                                                                                            |
| Provider context normalization | Versioned source bundle, session-scoped request joins, agent lineage, explicit loss states, frozen-rate pricing provenance, and optional attempt persistence                                                                                                                                                                                                                                                                                                                                | [Evidence normalization](../src/benchmark/context-evidence.ts)                                                                                                                                                                                                                   |
| Session transcript diagnostics | Post-cut tool occurrences, explicit tool-result errors, exact repeated Bash inputs, source locators, and evidence completeness                                                                                                                                                                                                                                                                                                                                                              | [Transcript projection](../src/benchmark/transcript.ts)                                                                                                                                                                                                                          |
| Saved context history          | Read-only four-pane workbench for standalone and confirmation session attempts: sources, events, a per-request token and cost timeline, and bounded saved evidence detail, with comparison provenance links. A pipeline stage opens through the same projection, named by run, stage and lineage, with its declared corpus reconciled against the reads its transcript shows and no request timeline. A stage replay opens under the same stage identity as an evidence-unavailable summary | [History projection](../src/benchmark/session-history.ts), [instruction loads](../src/benchmark/transcript-instruction-loads.ts), [browser page](../client/src/session-history/session-history-page.tsx), [request timeline](../client/src/session-history/request-timeline.tsx) |
| Local read UI and event API    | Partial browser views, server-side event streaming, a per-run record API with each stage's cost, tokens, wall time, artifacts in and out, and a stopped stage's letter, the run's minimum grade, wall time and final outcome, run history rows with stage grades, final outcome, cost and wall time, and confirmation group rows with each stage's median, range and graded count, a final outcome tally and the spend their reps recorded, naming each figure no record holds              | [Router](../client/src/router.tsx), [API](../src/server/api.ts), [Run record](../src/server/run-record.ts), [Run history](../src/server/run-history.ts)                                                                                                                          |

An implemented path can still have missing real-provider validation. Session
comparison uses frozen records and a provider-free integration path. Its saved
Attempt-pairs view has been verified through the built browser route: each case
shows the recorded arm distributions, and corpus attribution distinguishes zero,
one, and multiple differing layout paths. Its What moved view groups the served
per-measure quality readings by case, including both arm intervals and the reading
verdict. That browser verification covers the multi-case shape; a single-case
session report reaches the same server route and its report is served with the
case present, but no browser check has been run over it.

## Known limitations

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
  outside its captured corpus files carries no hash and no changed state.
  Entries read from the target's own `.claude` are recorded as corpus entries,
  with the corpus file's hash, rather than marked as coming from the target.
  Confirmation pipeline reps and a stage that saves no checkpoint record no
  read manifest. The run API serves each stage's manifest without its changed
  state, which only the run history row carries, for the latest checkpoint.
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
  label names the live tree before anything has measured it, so that version
  may not open until a run, replay or session attempt stores it. The
  `corpus show --file` command prints a file as UTF-8 text, so a non-text file
  does not print as its bytes; the file route serves the bytes. See
  [corpus versions](reference.md#corpus-versions).
- **The corpus screen does not show invalidation counts yet.** The counts and
  the last edit's rows exist in `corpus invalidation` and `/api/corpus`, and
  the browser does not read them. See
  [corpus versions](reference.md#corpus-versions).
- **The corpus column words only corpus-file drift by distance.** A record
  stale because its model, effort or stage settings changed, or downstream of
  a stage that did, shows the plain stale badge and its causes, since the
  design has no reading for those yet. A record with no cause reads `✓ clean`
  only at distance 0 and `✓ clear` otherwise, including the initial checkpoint
  and records written before corpus versions, whose distance is not recorded.
  A session attempt of a case that is no longer declared reads its staleness
  as unavailable on the run history, and `stale` names it on stderr.
- **Pipeline `run --corpus` is refused.** Replay supports explicit corpus
  directories, but the forward pipeline command does not yet use that path.
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
- **Progress events are not a resource timeline.** They contain no token/load
  events, and spend changes scope between stage start, worker turns, stage
  judging, stage completion, and run completion. The run list names what each
  reading covers rather than resolving the scopes into a running total, which no
  non-terminal event carries. Aggregate provider usage cannot establish active
  context size or a file's causal cost. See the
  [context assessment](context-visibility.md) before drawing attribution
  conclusions.

## Browser UI

Every screen carries a navigation rail listing the nine sections the design
enumerates. It links the three that have a screen listing their whole
collection, run history, the saved comparisons and the corpus, with a badge on
each counting that collection, and marks the other six planned. The run and
comparison badges leave out the entries that cannot be read. The rail reaches no
other address. The comparisons screen links each saved comparison to its own
page, in digest order because no comparison records when it was made, and a
comparison screen links onward to the attempts it names.

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
rail badge cover every listed record, and Stopped matches only pipeline runs
with a stopped stage. Records that cannot be read are counted by kind in a
notice above the table, with their ids and reasons behind a toggle. A replay
keeps no raw transcript, so its page shows an evidence-unavailable summary with
no events, per-event detail, request series or corpus reconciliation. A run
with unfinished events whose process is gone stays out of the list until the
next server start reconciles it as interrupted.

The rail also names the corpus under test, showing the live tree's
current `corpus@` version, its file count and its latest edit, and saying in words
that the version is withheld when any entry refused hashing. Pressing `g` then
`r` reaches run history from any screen. An address the app does not serve
renders inside the same chrome, naming the address and linking back. `/system`
is reachable only by typing it, because the design's nav does not name it.

| Route                                | Available today                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                  | Run-history index of every saved pipeline run, standalone session attempt, confirmation run and stage replay, each row linking the context pages that render for it and naming why any other cannot open; the records it could not read, counted by kind with their ids and reasons; empty and error states; a run in flight appears as a RUNNING row carrying its stage, elapsed time, and scoped spend |
| `/corpus`                            | Live corpus inventory; instruction editing is marked planned                                                                                                                                                                                                                                                                                                                                             |
| `/comparisons`                       | Every saved comparison by digest, mode, cases and reps, each linking to its own page; the comparisons that could not be read, with their reasons; empty and error states                                                                                                                                                                                                                                 |
| `/comparisons/<digest>`              | Saved case/arm distributions, attribution, quality readings, and validated session-attempt links                                                                                                                                                                                                                                                                                                         |
| `/attempts/session/<case>/<uuid>`    | Saved standalone session context history, with the per-request token and cost timeline                                                                                                                                                                                                                                                                                                                   |
| `/groups/<group>/reps/<rep>/attempt` | Saved confirmation-rep context history, with the per-request token and cost timeline                                                                                                                                                                                                                                                                                                                     |
| `/runs/<run>/stages/<stage>`         | Saved pipeline-stage context history and its corpus reconciliation; no request timeline. Missing raw capture names which record state produced it; a stage the run stopped on wrote no checkpoint and reports the stop, its reason and its declared corpus instead of events; a stage whose judging never completed reports that instead, with no stop reason, no lineage and no declared corpus         |
| `/replays/<lineage>/<timestamp>`     | Saved stage-replay summary, always evidence-unavailable because a replay keeps no raw transcript; no events, per-event detail, request timeline or corpus reconciliation                                                                                                                                                                                                                                 |
| `/system`                            | Design tokens and reusable component gallery                                                                                                                                                                                                                                                                                                                                                             |

Run launch, full run detail, task/case management, calibration screens,
settings, and first-run setup are design targets. The rail marks Live monitor,
Run detail, Tasks, Cases, Calibration and Settings planned rather
than linking to them. Live monitoring is partly
delivered: the run list reports a run in flight with its stage, elapsed time and
scoped spend, while a monitor carrying the judge's reasoning and per-stage detail
remains a design target. That row reads the event store through the same polled
route the list uses rather than through the SSE API. The server has no
authentication and binds to IPv4 loopback; use it locally.

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
