# Architecture

Rehearse is a TypeScript application on Bun. Its CLI launches experiments and
writes local evidence. A Hono server exposes that evidence to a React client.
The [vision](vision.md) describes the intended measurement loop; [current state](status.md)
records the gaps in its implementation.

## Components

| Location                              | Responsibility                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`rehearse.ts`](../rehearse.ts)       | Bun version gate and command dispatch                                                                                  |
| [`src/cli/`](../src/cli/)             | Command definitions, argument policy, terminal gates, output, and harness wiring                                       |
| [`src/benchmark/`](../src/benchmark/) | Case loading, provider invocation, execution, grading, checkpoints, records, and comparisons                           |
| [`src/server/`](../src/server/)       | Read API, derived reports, event streaming, startup reconciliation, target liveness probing, and static client serving |
| [`client/src/`](../client/src/)       | React routes and shared design system                                                                                  |
| [`cases/`](../cases/)                 | Benchmark declarations, fixtures, transcript prefixes, tasks, and rubrics                                              |
| `.benchmark-runs/`                    | Local evidence, confirmation groups, comparisons, and event database                                                   |

Zod validates case and record boundaries. Bun's test runner covers the harness
and server; the client suite uses a DOM environment. The current client uses
TanStack Router and Query, with a typed Hono client for API requests. Package
versions and scripts belong to [package.json](../package.json).

## Execution paths

```text
CLI → case + flags + preconditions
        ├─ session → temporary directory → deterministic checks → attempt
        ├─ pipeline → target main → stages + Judges → run + checkpoints
        └─ replay → checkpoint worktree → one stage + Judge → attempt

--confirm → freeze shared inputs → isolated repetitions → group + report
compare   → existing stage/pipeline/session groups → validated comparison report

JSON records → Hono read API → React views
Run events  → SQLite store → SSE endpoint
            → SQLite store → Hono read API → React views
```

A debug pipeline runs directly on the target's clean `main`. It seeds a task,
records an initial checkpoint, runs the declared stages, and records further
checkpoints after accepted stages. The default pipeline is `shape → build`.
Preflight loads the case's declared stage settings, or the root default, once.
Each fresh worker session receives that canonical JSON, and the initial and
accepted-stage checkpoints record its digest. A shared Product Owner session
answers questions from the task and product brief. Stage Judges see frozen
evidence and rubrics, and the final Judge evaluates the delivered candidate.

The target owns its project instructions. The harness no longer installs this
repository's `CLAUDE.md` into the target. Normal cleanup restores the original
Git state and backed-up workflow directories. Retained Git refs keep candidate
and checkpoint commits available afterward.

Replay materializes a stage's input checkpoint in a host worktree. It runs only
that stage and preserves its result as another attempt. Pipeline and replay
confirmation use separate worktrees for repetitions. Host worktrees retain real
agent CLI behavior but use different paths, so path-dependent state can differ
from the original checkout. They are not sandboxes for arbitrary host actions.

Session cases use temporary directories seeded with optional fixture files and
conversation prefixes. Their checks consume replies and tool calls, and a case
may also declare a scorer over the files and git state the session leaves. That
tree is copied into the run's record directory before cleanup, and each grade
runs against its own restored copy, so the evidence outlives the attempt and a
later pass reads the bytes this one did.
Session confirmation freezes its declared inputs once and retains each repetition,
including unsuccessful and execution-failed attempts.

## Instruction and evidence identity

The control repository holds the harness and case definitions. The corpus under
evaluation comes from `~/.claude` or an explicit directory in corpus layout.
A target's own instructions are separate project inputs.

Checkpoints record source commits, workflow state, artifacts, corpus digests,
the canonical stage-settings digest, and lineage. A changed upstream input,
model, effort, or stage-settings value changes the conditions under which a
result was produced. `stale` reports mismatches for recorded checkpoints,
stopped stages, session debug attempts, stage replays and confirmation groups.
Comparison loading checks compatible inputs and derives
its statistics from rep records rather than trusting a saved summary.

Corpus hashing and delivery are distinct responsibilities. A live debug session
that declares no corpus file keeps a reference to installed files rather than a
frozen copy; any session that declares one, and every session confirmation,
copies and delivers each declared file. Replay can install stage corpus
snapshots using project settings. The complete support matrix is in the
[reference](reference.md#corpus-sources-and-delivery).

Do not treat an instruction being declared or hashed as proof the provider
loaded it. Session context manifests reconcile declared inputs with transcript
observations, within what those transcripts expose. Pipeline transcript capture
and complete context attribution remain unfinished.

The [context assessment](context-visibility.md) describes the planned evidence
and visualization work. Current provider metrics are CLI-call aggregates, and
progress events contain neither token readings nor instruction-load events.
Their spend scope varies by lifecycle event. Neither source alone reconstructs
context at individual model requests or across a worker's nested agents.

## Persistence and recovery

The paths below are under the records directory, which is `.benchmark-runs/`
unless `REHEARSE_RECORDS_DIR` names another.

JSON artifacts are authoritative evidence for a completed attempt or run. They
retain grading inputs, outcomes, provider metrics when available, and failures.
Record schemas are versioned where their contracts differ. Readers preserve
supported historical formats rather than rewriting old evidence.

The SQLite database at `.benchmark-runs/run-events.sqlite` stores progress
notifications. The server streams those through `/api/runs/:run/events` and
reconciles abandoned processes at startup. The run-history report reads the
same store to tell a run in flight from one that ended. It reads the store only
after the authoritative files answer nothing: an artifact or a stop record
settles a run's outcome on its own, and the stream is consulted for the runs
those files do not cover. A non-terminal stream is not enough by itself, so the
report also checks that the process holding the run's target is alive. A run
that dies while the server keeps running leaves its stream non-terminal, and
startup is the only moment reconciliation could correct that.
Event recording is best effort; it must not turn a successful experiment into a
failed one. It is not a substitute for the final artifact. There is no command
that reconstructs a deleted event history from JSON records.

The corpus version store at `.benchmark-runs/corpus-versions/` is
authoritative too, since a record's `corpusVersion` names a version whose files
only the store keeps once the source changes. File bodies and version manifests
are content-addressed and written whole before they are renamed into place, so
concurrent writers of one version write the same bytes. Each source's log entry
is linked into place by an exclusive create, and a writer that loses the race
re-reads the log, so two measurements of one new state add one entry. A new
entry takes the position after the highest one present, so a missing entry
cannot stall later writers. Two measurements racing across an edit can still
log the older state after the newer one, since each compares against the
latest entry it read.

The short id registry at `.benchmark-runs/short-ids/` is authoritative too,
since a quoted short id means only what the registry says. Each number is
claimed by an exclusive file create, so concurrent commands in one records
directory never share a number, and a command that fails after claiming leaves
a gap rather than freeing the number. Only a claim writes a number, so a
record no claim names stays unnumbered.

See [record formats and target restoration](reference.md) for storage paths,
identifiers, retained candidates, and recovery boundaries.

## Browser boundary

The production server serves `client/dist` and the API from one origin. The API
reads runs, corpus information, saved comparisons, raw records, and events.
Current routes are listed in [UI coverage](status.md#browser-ui). The client does
not yet drive paid execution or implement the full design prototype.

[The design handoff](design-handoff/README.md) governs visual direction. Its
screen labels map `task` to the harness's `pipeline`, `step` to `stage`, and
`group` to `confirmation run`. Keep that translation at the UI boundary.
Shared tokens and components live under `client/src/system/`; new screens should
extend that system instead of defining independent visual conventions.
