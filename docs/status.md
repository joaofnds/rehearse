# Current state and priorities

Reviewed against the code and project board on **2026-09-24**. This is the public
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
| Record inspection              | Cases, runs including stopped stages, checkpoints with their stages' raw transcripts, attempts, groups, comparisons, and staleness                                                                                                                                                                                                                                                                                                                                                          | [CLI commands](../src/cli/commands.ts)                                                                                                                                                                                                                                           |
| Session context manifests      | Deduplicated loads the transcript records (Reads not answered with an error, instructions attachments, skill bodies, the output style), corpus/project classification, and declared-input reconciliation; no timeline                                                                                                                                                                                                                                                                       | [Manifest construction](../src/benchmark/context-manifest.ts)                                                                                                                                                                                                                    |
| Provider context normalization | Versioned source bundle, session-scoped request joins, agent lineage, explicit loss states, frozen-rate pricing provenance, and optional attempt persistence                                                                                                                                                                                                                                                                                                                                | [Evidence normalization](../src/benchmark/context-evidence.ts)                                                                                                                                                                                                                   |
| Session transcript diagnostics | Post-cut tool occurrences, explicit tool-result errors, exact repeated Bash inputs, source locators, and evidence completeness                                                                                                                                                                                                                                                                                                                                                              | [Transcript projection](../src/benchmark/transcript.ts)                                                                                                                                                                                                                          |
| Saved context history          | Read-only four-pane workbench for standalone and confirmation session attempts: sources, events, a per-request token and cost timeline, and bounded saved evidence detail, with comparison provenance links. A pipeline stage opens through the same projection, named by run, stage and lineage, with its declared corpus reconciled against the reads its transcript shows and no request timeline. A stage replay opens under the same stage identity as an evidence-unavailable summary | [History projection](../src/benchmark/session-history.ts), [instruction loads](../src/benchmark/transcript-instruction-loads.ts), [browser page](../client/src/session-history/session-history-page.tsx), [request timeline](../client/src/session-history/request-timeline.tsx) |
| Local read UI and event API    | Partial browser views and server-side event streaming                                                                                                                                                                                                                                                                                                                                                                                                                                       | [Router](../client/src/router.tsx), [API](../src/server/api.ts)                                                                                                                                                                                                                  |

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
`corpus root@` digest, its file count and its latest edit, and saying in words
that the digest is withheld when any entry refused hashing. Pressing `g` then
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
