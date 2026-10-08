# CLI and harness reference

This reference describes the implemented command and evidence contracts. Start
with the [runbook](runbook.md) for setup and a first run, the [project status](status.md)
for remaining gaps, and the [glossary](../GLOSSARY.md) for domain terms.

## Execution modes

| Request                                  | Unit of work                                              | Execution directory                 | Result                                 |
| ---------------------------------------- | --------------------------------------------------------- | ----------------------------------- | -------------------------------------- |
| `run --case <pipeline-case>`             | Whole workflow                                            | The target's `main` checkout        | Run artifact or stopped-stage record   |
| `run --case <session-case>`              | One Claude session                                        | A fresh temporary attempt directory | Session attempt record                 |
| `replay --run <name> --stage <stage>`    | One pipeline stage                                        | A fresh target worktree             | Replay record                          |
| Pipeline `run --confirm`                 | Repeated whole workflows                                  | Separate target worktrees           | Confirmation group and report          |
| Session `run --confirm`                  | Repeated sessions                                         | Separate attempt directories        | Confirmation group and report          |
| `replay --confirm`                       | Repeated stage executions                                 | Separate target worktrees           | Confirmation group and report          |
| `compare <manifest>`                     | Completed stage/pipeline or session confirmation evidence | No execution directory              | Comparison report                      |
| `compare attempts --arm-a --arm-b`       | Repeated stage executions for the control group only      | Separate target worktrees           | Baseline group and comparison report   |
| `compare extend --comparison --attempts` | Repeated stage executions, one new group per arm          | Separate target worktrees           | New groups and a new comparison report |

A debug attempt helps inspect behavior. Confirmation repeats a frozen input set
and reports reliability and resource use. `compare <manifest>` consumes existing
evidence and launches no agents. `compare attempts` takes two recorded stage
groups as arms A and B and replays only the control group, so it spends
like one `replay --confirm`. Session comparisons use recorded checks and worker
metrics; they do not load pipeline Judges.

## Command interface

Use `mise exec -- bun run rehearse <command>` from the repository. The entry
point enforces the Bun version in `mise.toml`. `--help` and command-specific
`--help` are generated from [the command declarations](../src/cli/commands.ts),
which are the complete flag reference.

`run` defaults to the `audit-log` case. `--case` or `BENCHMARK_CASE` selects
another. Pipeline runs accept `--target` / `BENCHMARK_TARGET_DIR` and
`--pipeline` / `BENCHMARK_PIPELINE` to override the case. Session cases reject
these flags because they have neither a target repository nor a pipeline.

`run` and `replay` resolve workflow model and per-session budget in this order:
CLI flag, environment variable, case declaration. Missing model or budget is a
usage error. Replay consults the recorded run's case declaration as it exists
today; it can use explicit flags if that declaration no longer exists.

The shared settings are `--model`, `--effort`, `--judge-model`,
`--judge-effort`, and `--session-budget-usd`, with corresponding
`BENCHMARK_MODEL`, `BENCHMARK_EFFORT`, `BENCHMARK_JUDGE_MODEL`,
`BENCHMARK_JUDGE_EFFORT`, and `BENCHMARK_SESSION_BUDGET_USD` variables.
Effort accepts `low`, `medium`, `high`, `xhigh`, and `max`. The provider must
support the selected model and effort combination.

Workflow model and effort also govern the Product Owner. Judges default to
`opus`, or `sonnet` when the workflow model belongs to the Opus family. Judge
effort defaults to workflow effort. Explicitly selecting a Judge from the same
recognized model family prints a self-preference warning. A full model ID can
pin a comparison more precisely than a moving alias.

`--minimum-grade` / `BENCHMARK_MINIMUM_GRADE` defaults to B and controls when
a plain pipeline run continues. Replay and pipeline confirmation do not currently
thread this setting into execution. Lowering it permits further execution; it does not
rewrite the Judge's grade or make a low grade a reliability success.

### Spend and terminal requirements

- An unattended `run` or `replay` needs `--model` or `BENCHMARK_MODEL`.
  A model supplied only by the case declaration is accepted at a terminal.
- `--confirm` defaults to five repetitions. `--reps` requires `--confirm`
  and must be at least two. The projected cost needs interactive approval or
  `--yes`; `--yes` does not replace explicit model selection for unattended use.
- Pipeline `--pause` requires a terminal. Without it, a debug run restores the
  target and leaves review/calibration to separate commands.
- `calibrate --confirm-rejudge` approves revised Judge conclusions. Calibration
  can invoke paid Judges even when the target was restored long ago.

Model availability is checked with a paid probe whose budget is $0.10.
For pipeline `run`, repository and settings preconditions precede the probe,
but baseline target checks happen afterward. Session execution also probes
before some corpus and transcript validation. A refused input therefore does
not universally mean zero spend.

Before that paid probe, a resumed session case checks local `claude --help` for
`--system-prompt-snapshot <on|off>`. A CLI without that capability is refused;
fresh session cases do not need the check.

The session budget applies to each workflow session, the shared PO session, and
each Judge invocation on its own, not to the whole run. Confirmation projects
rep costs from those budgets; session confirmation includes the probe
allowance in its projection. A projection is a sum of budgets, not a cap:
Claude Code stops a session only after the call that crosses its budget, and
that call is charged in full. Stage/pipeline projections do not include that
probe allowance. Calibration rejudges are additional calls.

### Signal confinement

A session that can run a command runs as you and with your permissions, so a
`pkill -f` it issues could stop any of your processes whose command line
matches. `run` of a pipeline, `run` of a session case whose `tools` list is
non-empty, whose `settings` declare `hooks`, or whose fixture carries a
`.claude` directory, `replay`, `compare attempts` and `compare extend` therefore
replace their own process, keeping its pid, with
`/usr/bin/sandbox-exec -p '(version 1)(allow default)(deny signal)(allow signal (target same-sandbox))'`
running the same command. Every process the command starts itself shares that
one sandbox for the command's whole life:

- A session's attempt to signal a process started outside the run fails with
  `Operation not permitted`, and that process keeps running.
- A session can stop a process the same run started, in that call or an
  earlier one. A process started through a server outside the sandbox, such
  as an already running tmux server, lives outside it, and the session
  cannot signal it directly.
- Stop in the browser, Ctrl-C and SIGHUP still end the run and its sessions,
  and the launch record and run marker keep naming the run's pid.

The confined command marks its environment with `REHEARSE_CONFINED=1` so it
does not confine itself twice. A shell that exports that variable runs these
commands unconfined.

On macOS without `/usr/bin/sandbox-exec` those commands stop with exit code 3
before any provider call, naming the missing program. On any other operating
system they stop the same way, naming that system. Every other command, and
a session case with no tool, no hooks and no fixture `.claude` directory, runs
unconfined on any host. `serve` stays unconfined, and a run it launches
confines itself.

The sandbox confines signals only. It does not limit files, network, the
harness itself, or other sessions of the same run, and a signal sent on a
session's behalf by a process outside the sandbox, such as a terminal
multiplexer's server, still arrives. A setuid program such as `ps` or `sudo`
cannot start inside it, and in a pipeline such as `ps aux | grep` that failure
leaves the pipeline's status at 0, so the search finds nothing without failing.
A second `sandbox-exec` with a different profile cannot start inside it either,
so a tool that sandboxes itself with it fails there. The same failure, exit code
71 from `sandbox-exec`, ends a confining command started from inside another
sandbox. macOS marks `sandbox-exec` deprecated, and it still ships.

### Spend ceiling

`settings --spend-ceiling-usd <USD>` stores the ceiling in `settings.json` in
the records directory; `settings` alone shows it, the records location and the
linked corpus. The browser stores the same ceiling through
`PUT /api/settings/spend-ceiling`, from the launch dialog's spend field or the
settings screen's Spend limit card, so a ceiling written in any of these places
is the one every later command reads.
Pipeline and session `run`, `replay`, every `--confirm` group, `calibrate` and
`diagnose` refuse with exit code 3 and name that command when no ceiling is stored. The
refusal comes before any paid call, after the terminal checks and before the
model probe for the commands that make them.

The ceiling holds a run's whole spend: every workflow, PO and Judge session,
and every Judge retry, is started with a budget no larger than the ceiling
minus what the run has spent so far. Once the spend reaches the ceiling, the
next paid call is refused. When a stage's session or stage Judge is refused,
or fails after its spend reached the ceiling, a pipeline run stops in that
stage, writes the stage's stopped record with `ceilingStop` carrying the
ceiling and the spend, restores the target, and starts no later session.
Every such record carries `productOwnerCostUsd` and
`productOwnerProviderCalls`, the Product Owner's spend up to the stop. A
stage Judge's stopped record keeps the attempts it paid for before the stop,
and `judgeProviderCalls`, every call the Judge paid for, a halted call
included. The calls are empty when the ceiling refused the Judge's first call.
A stopped record for a stage that stopped at the ceiling in its session,
whether during a worker call, a Product Owner call or the refusal of a turn,
or in a step after the session returned, such as reading the task state,
carries `session`, holding that session's `providerCalls` up to the stop, a
halted call included, and its `costUsd`. The calls are empty and the cost 0 when the
ceiling refused the session's first call, and the cost is absent when the
session's last call reported none. A session that returned holds the last
total its calls reported, which leaves out a last call that reported none.
A final Judge refused, or failing after its spend reached the ceiling, fails
the run with a failed run record carrying `ceilingStop`, its paid attempts,
`judgeProviderCalls`, every call it paid for with a halted call after the
attempts' calls, and a Judge cost that also counts what the halted call
reported, since it has no attempt of its own. A final Judge that exhausts its retries on invalid
output writes the same record without `ceilingStop`, and one whose call fails
with budget left writes no failed run record. A refused calibration rejudge
fails the run without a `ceilingStop` record. A session
attempt's budget is clamped to the ceiling, and its record keeps the clamped
value as `sessionBudgetUsd`.

A pipeline or replay confirmation group holds each rep to the ceiling and all
reps together to the reps times the ceiling. Since reps run at once, one rep's
overrun counts against the others, and once the group total is reached no rep
starts another session. A session group's reps each start one session with a
budget clamped to the ceiling, so they share no running total. A replay or a group rep refused by the ceiling fails through its
ordinary failure path, without a `ceilingStop` field.

The run manifest, a replay record, a session attempt record, and every
group's `inputs` record the ceiling as `spendCeilingUsd`. Records written
before the ceiling existed have no such field.

The ceiling bounds spend by at most the call in flight, because Claude Code
stops a session only after the call that crosses its budget. A provider call
that fails with a result envelope, such as a session halted at its budget, is
charged the cost it reports. One that fails without an envelope reports no
cost, so it is not counted.
The model probe runs before the run's spend is counted and is outside it.

### Browser launches

The browser's New run, Replay a step and Replay from here buttons, and the corpus screen's
offer of a paired rerun after an edit, post to `POST /api/launches`,
which starts the same CLI command a terminal would, detached from the server so
the run outlives a server restart. A case launch runs
`run --case <id> --model <model>` under the case's declared model, and a replay
launch runs `replay --run <run> --stage <stage> --model <model>` under the model
the run's manifest recorded. Three, six or twelve attempts add
`--confirm --reps <N> --yes --approved-in-browser`, so the group's `approval`
records `method` `browser`. `--approved-in-browser` is refused without `--yes`.
Compare these attempts posts `{ "kind": "comparison", "armA": <group-id>,
"armB": <group-id> }` and runs `compare attempts --arm-a <group-id> --arm-b
<group-id> --yes --approved-in-browser`. Its launch record holds both group ids,
the run and stage the arms replayed, and arm A's reps as its attempts, since the
baseline group copies arm A's size. A comparison page's Add attempts button
posts `{ "kind": "extension", "comparison": <digest>, "attempts": <n>,
"statedUsd": <usd> }` and runs `compare extend --comparison <digest> --attempts
<n> --yes --approved-in-browser`, with n arm A's attempt count and the cost the
comparison's summary states for it. Its launch record holds the comparison, the
run and stage arm A replayed, the attempts added per arm and that cost.
A root-cause analysis request posts `{ "kind": "analysis", "run": <run>,
"statedUsd": <usd> }` and runs `diagnose <run> --model sonnet --budget-usd
<usd>`, with `<usd>` the cap `GET /api/runs/<run>/analyses` states. Its launch
record holds the run and that cap, with no stage or attempts. Run detail posts
this request, only a same-origin client that passes the request guard starts
one, and `run` takes the bare run name, not `run:<name>`.

The route answers 202 with the launch id and writes
`<records>/launches/<id>.json`, holding the pid, the process's start time, the
kind, the launch time and the target the kind names above, with the child's output in
`<id>.log` beside it. It answers 409 and starts nothing when no ceiling is
stored, the settings file does not parse, a recorded case's declaration or a
recorded run's manifest does not parse, or the checkpoint a replayed stage
starts from is not on disk. A case that declares no model is refused 409,
because the browser has no terminal to pick one on. It answers 404 for a case
with no declaration and for an unknown run or stage, and 400 for a malformed
body, attempts other than 1, 3, 6 or 12 for a case or replay, or a comparison
that is not a 64-character hex digest. A pipeline case is refused 409
while a corpus directory is linked, as `run` refuses it. A comparison launch
runs the arm checks `compare attempts` makes before it writes anything and
answers 409 with the refusal, 404 for a group with no `group.json`, and 400 for a group id that
is not a confirmation identity. A stage rubric that changed since arm A was
recorded and a skill under test that is not the stage's own skill are refused
409 the same way. An extension launch answers 404 for a digest with no saved
comparison, 409 with the refusal `compare extend` would give, and 409 when the
cost it computes now differs from `statedUsd`, so the click approves only the
cost the dialog showed. An analysis launch answers 404 for a run with no run
directory, 409 for a run `diagnose` would refuse (no manifest, paused, or in
flight), 409 when the cap it computes now differs from `statedUsd`, 409 while
a launch record holds an analysis of the same run whose process is alive, and
409 while another request of this server is still starting an analysis of that
run, from before its checks until its record is written. A launch record that
does not read refuses nothing. An analysis started with `diagnose` from a
terminal writes no launch record, and a second server on the same records
directory does not see a request this one is still starting, so neither is
refused. Any launch whose process starts but whose record cannot be written has
its process stopped and answers 500.
The knob refusal, the spend ceiling and the model probe
run later in the started process, so they end the launch with the reason only
in its log. `GET /api/cases` lists
every declared case with its kind, title and model. A pipeline case also
carries its `target`, its `pipeline` (each stage with its rubric, read from its
pipeline file through the harness's pipeline and stage rubric checks, or
`unavailable` with the reason the harness would refuse the file), its `finalRubric`, and
`latestMinimumGrade`: the minimum grade the newest pipeline run recorded,
`not-recorded` where that run or every run of the case lacks one, and `null`
for a case nothing ran. Group records hold no minimum grade, so a case only
groups ran reads `not-recorded`. A session case carries `target: null` and
the kinds of its declared `checks`, which are its judges. Each case's
`figures` are `no-runs` for a case nothing ran or whose every run record is
unreadable, else the runs counted at one corpus version, that version (`null`
when no run recorded one, and then every run is counted), how many runs it
left out, how many counted runs were judged and passed, and `costPerRun`: the
mean over counted runs whose whole cost is recorded, with how many were
costed and how many lack a cost. A run is a pipeline run, a session attempt,
or one rep of a pipeline or session confirmation group. Stage replays and
stage-mode groups rerun one stage rather than the case and are not counted. A
pipeline run is judged when its final Judge recorded PASS or FAIL, and a
pipeline case's `figures` add `median`, the median of those verdicts with FAIL
ranked below PASS and the lower middle taken on an even count, `null` when no
counted run was judged. A session run is judged when its checks ran, it passes
when they all pass (a rep whose metrics went missing takes the outcome its own
attempt record kept), and a session
case has no median, since its records hold no letter. The version is the first
one recorded reading the case's runs newest first, a pipeline run by its name
and a session attempt or finished group by the start time it recorded.
A run whose name names no instant, then attempts and groups written before
they recorded one, follow every timed run, attempts first and then groups in
id order. Group ids are random, so a case
only such groups ran takes an arbitrary group's version. Declarations that do not parse
are named in `unreadable`, and run records that do not parse in
`unreadableRecords`. An unreadable pipeline run or session attempt is left out
of the figures, and an unreadable group rep is still counted, unjudged and
without a cost.

`POST /api/cases` declares a session case and answers 201 with the
declaration as written and its path, `cases/<id>/case.json`, which it leaves
uncommitted and, like `case capture`, in JSON whose short arrays `bun run fmt`
must collapse before the commit. The body must hold `id`, `kind` (`session`),
`title`, `prompt`, `tools`, `corpusFiles`, at least one of `checks`, and
`model`, which the case parser leaves optional but the launch dialog needs to
start the case, and may add only `sessionBudgetUsd`. Only those fields are written, so a default the case parser
fills in never reaches the file. It answers 400 for any other field, naming a
field `case.json` does not have apart from one declared by hand, for a
`pipeline` kind, for a missing `model`, for a prompt that starts with `-`,
which the claude CLI would read as an option, for a declaration the case parser
refuses, and for a corpus file outside the layout, one with a `.` or `..`
segment, or one whose path climbs out of the linked corpus. Whether each corpus file exists is checked when the case
runs, not here. It answers 409 for an id already on disk, and for a linked
corpus directory that is no longer a corpus. A refused declaration leaves no
directory behind. The body sets no `settings`, so a case that edits files or
runs a command needs a `permissions.allow` block added to its `case.json` by
hand.

`GET /api/pipelines` lists every pipeline a pipeline case declares as its
default and every `pipelinePath` a run manifest or pipeline confirmation group
recorded, so a pipeline a run chose with `--pipeline` or `BENCHMARK_PIPELINE`
is listed too. Each entry names the pipeline by its control-relative path and
carries its stage names, as the newest run or group that recorded it ran
them, else as its file declares them,
its stage and task judge counts (a pipeline no case declares has no task judge of its own, though each run is still judged by its own case's final rubric), the declaring case, the cases that declare or ran it, the `targets` of
those cases still declared, its run names newest first, and `figures`: the
runs counted at the latest corpus version, that version, and how many runs it
left out at another version or none. In `figures` each group rep counts as a
run, though `runs` names run records only. The latest version is the first
one recorded reading runs and groups together newest first, a run by its name
and a group by the start time it recorded. The stages come from the newest of
them, the same record as the version unless that record holds none. A group written before groups recorded one has no time
and follows them in id order, and group ids are random, so among such groups
neither the stages nor the version need be the newest. When nothing recorded a version
every run is counted and the version is `null`. A case declaration, run
manifest or group record that does not parse is named in `unreadable`, and so
is a declared pipeline no run or group recorded whose file is missing or does
not pass the harness's pipeline checks against its case's rubrics. The rest
are still listed. A recorded pipeline reads as it ran, so a file changed or
broken since is not checked. Session cases have no pipeline and
never appear.

`GET /api/settings` returns the stored ceiling or `null`, the command that
sets it, the records location, the linked corpus as `kind` (`live` or
`directory`) and `root`, `liveCorpusRoot`, the live install's root whether or
not a directory is linked, the statement that calls in flight can overrun the
ceiling, and `linkCommand`, the command that links a corpus directory, which
the corpus screen names while the live install is linked. The records location is read-only there, because
`REHEARSE_RECORDS_DIR` in the server's environment chooses it.
`GET /api/settings/records` returns `bytes`, the total size of the regular files
under the records location, without following symlinks, and 0 when the
directory does not exist yet. It walks the whole tree on every request, which
is why `GET /api/settings`, read by every launch dialog, leaves it out. A
directory it cannot read answers 409 naming the entry.
`PUT /api/settings/spend-ceiling` with `{ "usd": <number> }` stores a positive
ceiling and answers 400 for anything else. `PUT /api/settings/corpus` with
`{ "directory": <path> }` links a directory in corpus layout and answers 409
for one that is not, or whose files cannot be measured, such as one that
resolves outside the directory. The path must be absolute or start with `~/`,
which names the server process's `HOME`, since the server does not
share the browser's working directory. Any other relative path answers 400,
naming that rule.
`DELETE /api/settings/corpus` unlinks it. `PUT /api/setup/corpus` with
`{ "directory": <path> }` stores the link the first-run setup scans, which the
client then reads through `GET /api/corpus`: an empty or blank path, or one
that resolves to the live install's root through `~/`, a symlink or a trailing
slash, unlinks any directory and leaves the live install linked, and any other
path links as `PUT /api/settings/corpus` does, with the same refusals. The
settings route does not resolve the live root: given such a path it refuses
when the live install links outside itself, and otherwise links it as a
directory, which makes every pipeline launch refuse. These four writes answer
the new settings, with the same fields as `GET /api/settings`:
`spendCeilingUsd`, `setCommand`, `recordsDirectory`, `linkedCorpus`,
`liveCorpusRoot`, `overrun` and `linkCommand`. `POST /api/settings/corpus/rehash` measures the linked
corpus now, or the live install when nothing is linked, recording its version,
and answers `{ label, digest }`, or 409 naming why the layout cannot be
measured. An unreadable settings file makes `PUT /api/setup/corpus` and every
settings route but `GET /api/settings/records` answer 409, since that route
reads no setting.

`/api/runs` lists each launch in `launches`, apart from `rows`, while its pid
is alive, and leaves it out while a pipeline run shows as running under that
pid. A replay, session attempt or group keeps its launch listed until the
process exits, and a pipeline run's launch is listed again once the run stops
showing as running, until its process exits. A root-cause analysis launch is
listed while its process is alive, under its run, and is never stopped. A launch the operator stopped
stays listed after its process exits, as described below.

A running row in run history offers Stop & restore repo when a browser launch
started it, and a running pipeline run's row also offers Pause after this step.
A launch row for a replay, group or session attempt offers Stop only. A
root-cause analysis launch row reads "one call" and offers no Stop, and the stop
route refuses one with 409: `diagnose` installs no signal handling, so a
stopped call could spend and leave no record. The call ends on its own, and
like any session budget its cap can be overrun by the call that crosses it.
Stop posts
to `POST /api/launches/:id/stop`, which records `stopRequestedAt` on the launch
and sends its process SIGTERM, which the process handles as it handles a
terminal's Ctrl-C (SIGINT): it kills its commands, restores the target and
removes its worktrees. The stop reads the pid from disk, so it works after a
server restart. It answers 404 for an unknown launch, and 409 when the launch's
process is no longer the one it started, judged by the process start time, or
when the launch was recorded without a start time, as launches recorded before
the start time was kept were. A run started from a terminal has no launch, so
its row offers no Stop. Pause after this step posts to `POST /api/runs/:run/pause`, which writes
`pause-request.json` in the run's checkpoints directory and answers 202, or 404
for an unknown run and 409 for one whose row does not read RUNNING. A pipeline
run reads that file once each stage is judged and its checkpoint written, then
writes `paused.json` beside the request, restores the target and exits
non-zero, and its row reads `PAUSED:<stage>`. The request is not read after the
last stage, so a Pause clicked during the last stage is accepted and has no
effect, and a stage that fails its judge ends the run as it would without
one. Nothing resumes a paused run yet.

Every stop signal a pipeline run handles, from the browser or a terminal,
writes `operator-stop.json` in its checkpoints directory with the signal's
name, so a run stopped while no stage record exists to carry the stop, during a
stage's session or between stages, reads `OPERATOR_STOPPED` rather than failed.
A run stopped while a stage is being judged reads `STOPPED:<stage>`, from that
stage's stop record, and one stopped after its artifact is pending reads
`FAILED`. A confirmation group records the stop before it kills its commands,
writing `operator-stop.json` in its group directory, and then writes no
`group.json` or report, so no stopped rep reads as a failed outcome. A rep
that settled before the process exited leaves its rep record, which reads
failed and names a worktree the stop removed, and a rep killed before it
settled leaves none. Run history and `rehearse list groups` leave the group
out rather than list it as unreadable. A stopped replay or
single session attempt writes no operator stop. A browser launch the operator
stopped keeps `stopRequestedAt`, and once its process exits its launch row
stays in run history as `OPERATOR_STOPPED` with no controls. A stopped single
pipeline case is listed too, beside its run's own `OPERATOR_STOPPED` row when
the run recorded one, since nothing links the two once the process is gone and
a case stopped before its run record exists has no other row. A replay or
group stopped from a terminal has no launch, so nothing in run history shows
its stop.

The child gets the server's environment without the `BENCHMARK_` knobs a case
declares (case, pipeline, target, model, effort, session budget, judge model
and effort, minimum grade), so a launch runs the case as declared. No launch
passes `--corpus`, so every launch measures the linked corpus.

Every request whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>`
gets 403. Every request other than GET or HEAD also needs an `Origin` of
`http://` followed by its own `Host`, `Sec-Fetch-Site` `same-origin` when the
browser sends it, and a `Content-Type` of `application/json`, or it gets 403
and starts nothing. These are headers any local program can set, so the guard
stops other web pages and not other processes on the machine. Every response
carries `X-Frame-Options: DENY` and `Content-Security-Policy:
frame-ancestors 'none'`, so a page on another site cannot frame the client and
steer a click onto Start.

### Output and exit codes

| Code | Meaning                                                               |
| ---- | --------------------------------------------------------------------- |
| 0    | Command completed; the recorded grade or check outcome may fail       |
| 1    | Execution failure                                                     |
| 2    | Invalid command, flag, or value                                       |
| 3    | Refused precondition, such as missing evidence or a required terminal |

A command that writes a record puts that record's path on stdout, or its bytes
with `--json`, and nothing else. Progress lines, grades, diagnostics, and
session check summaries use stderr, so redirecting `run --json` or
`replay --json` captures a document a parser accepts once the command exits 0.

`show` prints a readable summary for supported record kinds and raw bytes
otherwise; `show --json` prints the selected file's bytes. `list` and `stale`
do not accept `--json`.

## Cases and pipelines

Cases live under `cases/<id>/case.json`. The ID must match the directory name.
Declarations are validated by [case.ts](../src/benchmark/case.ts); pipeline
structure is validated by [pipeline.ts](../src/benchmark/pipeline.ts).

A pipeline case declares task, product brief, final rubric, pipeline, stage
rubric directory, and target path. Input paths are confined to the case; the
target path may leave it and resolves relative to the case directory. An
optional `settingsFile` overrides the committed root `stage-settings.json`.

The task is Markdown with a level-one heading and a nonempty description. The
product brief supplies settled product facts. The final rubric contains unique
IDs in this form:

```text
1. `requirement-id`: Binary requirement text.
```

The final rubric must retain `check-integrity` and `local-checks`, which the
harness resolves from measured results.

A pipeline defines board statuses, an ordered stage list, target setup commands,
target checks, check-integrity files, and a commit-subject pattern. Commands are
argument vectors with optional environment overlays. Stages name a skill,
planning/delivery kind, and stage rubric. A planning stage may require acceptance
criteria and may declare an attached durable document; a card-only planning
stage needs no document attachment. Exactly one delivery stage must come last.
The bundled pipeline is `shape` followed by `build`.

The default stage settings deny branch/worktree creation commands and disable
bundled skills. The allowed settings schema covers a deny list and selected
feature switches; it rejects arbitrary settings keys, including hook blocks.
These settings are harness-owned data, independent of the operator's live
settings file. Pipeline runs, confirmations, and replays pass the canonical JSON
to stage sessions and record its digest in checkpoint or replay lineage. Records
store a control-relative settings path, so moving the checkout does not change
the recorded identity or expose the recording machine's path.

### Session cases

A session case declares a prompt, allowed tools, declared corpus files, and at
least one deterministic check. Optional inputs are a fixture tree, transcript
prefix, inline settings/agent definitions, `projectFiles` for context
manifest reconciliation, and a `stateCheck` grading the files and git state the
session leaves. Declared settings carry a `permissions.allow` block
where the case needs to edit files or run a command. A declared
`transcript.file` is a `.jsonl` file name directly in the case directory, with
no subdirectory. Neither a fixture tree nor
a transcript prefix may be a symlink, which is refused before any provider
call.

A fixture tree may carry committed git history. Store it as a `dot-git`
directory at the fixture's root, which is the only place seeding looks: a
`dot-git` further down stays an ordinary directory. Git refuses to commit a
nested `.git`, staging it as a gitlink that reaches no clone, while a directory
under any other name commits as ordinary files and, as measured on git 2.55.0,
restores byte-exact with the same commit SHAs. Seeding renames it to `.git` and
recreates the empty `refs/heads` and `refs/tags` a commit drops.

Three constraints on the bytes it carries. Pin `user.name` and `user.email` in
its `config`, or commits the session makes carry whoever ran the arm. Leave
`core.worktree` out, since a work tree resolving outside the attempt directory
is refused. Ship no `hooks/` directory: `git status` fires `post-index-change`,
so a hook would run on the operator's machine outside the tools the case
declares, and a fixture carrying one is refused.

Before the provider is called, the seeded history must satisfy three commands:
`git rev-parse --show-toplevel` resolving to the attempt directory,
`git log --format=%H`, and `git status --short`. A fixture failing any of them
is refused by name with the failing command's stderr, and the CLI exits 3. A
`dot-git` that is a file rather than a directory is refused too, and so is one
holding a scorer file, as State checks describes. See
`cases/history-probe` for a worked example.

| Check               | Behavior                                                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `word-band`         | Count reply words against optional `min` and `max`                                                                                                                                                                                        |
| `forbidden-text`    | Fail for declared strings present in the reply                                                                                                                                                                                            |
| `forbidden-pattern` | Fail when the reply matches any of `patterns`, each a `name`, an ECMAScript `regex`, and optional `flags`; a pattern the engine refuses to compile refuses the case, and the failure names each matching pattern with the text it matched |
| `tool-calls`        | Check transcript tool-call count and optional allowed names                                                                                                                                                                               |
| `files-read`        | Require declared paths in transcript `Read` calls                                                                                                                                                                                         |

Checks measure only what the declaration asks. A passing tool-call ceiling does
not establish implementation correctness. A session whose envelope carries no reply
and marks no error records `NO_REPLY` without evaluating checks, since the
reply checks would read a reply that does not exist. A budget halt marks an
error, so it records `EXECUTION_FAILED` with the provider's stated error and
spend. Confirmation counts that rep as
unsuccessful; it also records execution failures and missing metrics
explicitly.

#### State checks

A `stateCheck` grades what the session left on disk rather than what it said.
It declares a `command` and the `outcomes` it must report:

```json
"stateCheck": {
  "command": ["sh", "score.sh"],
  "outcomes": ["ledger-amended", "work-committed", "tree-clean"]
}
```

The command runs with the restored evidence as its working directory and writes
one JSON object to stdout:

```json
{
	"results": [
		{
			"name": "tree-clean",
			"status": "PASS",
			"detail": "nothing left uncommitted"
		}
	]
}
```

`name` matches a declared outcome, `status` is `PASS` or `FAIL`, and `detail` is
a non-empty string. Results pair by name, not position. Four things are grading
errors rather than grades, recorded as `stateGradingError` with no
`stateResults`: a command that will not run, a non-zero exit, stdout the schema
rejects, and a declared outcome the scorer did not report.

The declaration is inline because that is what folds it into the attempt's
lineage: the fixture digest walks the fixture subdirectory, not the case
directory, so a scorer file beside `case.json` would be covered by no digest and
an edited scorer could be graded as the original definition. A scorer too large
for a command line lives inside the fixture, where the fixture digest covers it.
Seeding leaves every fixture file the command names out of the session's tree,
because a session that reads its scorer learns how it is graded and can pass
from that. Only a command word that is itself a path to a file inside the
fixture counts as naming one, so write `["python3", "score.py"]` rather than
`["sh", "-c", "python3 score.py"]`, and keep the scorer a single file rather
than a directory. A word naming a file the session is meant to work on
withholds that file too. A fixture whose `dot-git` holds such a file, in any
stored commit including those only the reflog or nothing reaches, or as its
current bytes in any object, is refused before any provider call, since git
would hand the session the same bytes. The lineage records which files were
withheld, so attempts recorded while sessions could read their scorer do not
compare as the same experiment.
Before the command runs, the case's own copy of every path it names is laid back
over the restore, so a session that writes a file at that path is still graded
by the case's bytes. The fixture's `dot-git/info/exclude` should name the
scorer, because the copy laid back for grading is otherwise an untracked entry
that fails every cleanliness grade. Use that file rather than a `.gitignore`,
which would also hide the scorer from the repository that ships the case, so a
clone would receive a case declaring a scorer with no scorer beside it. See
`cases/state-probe` for a worked example.

State grades are recorded separately from `checks`, so a session that returns no
reply still receives them while its outcome stays `NO_REPLY` and its `checks`
array stays empty. An attempt whose provider call failed preserves no evidence
and records no state grade, which is a different fact from grading an empty
tree.

#### Attempt state evidence

Before cleanup removes the attempt directory, the harness copies it beside the
transcript under the record directory, with `.git` stored as `dot-git`. The copy
carries the dirty tracked files, untracked files, ignored files, and commit
history the session left; the corpus overlay is excluded, being an input the
record already digests per file. Nothing is committed, because a commit round
trip drops the empty `refs/tags` a repository carries and a later restore would
then resolve to whatever repository encloses it.

Each grade runs in its own restored copy, so a scorer that writes, deletes, or
commits changes neither the saved evidence nor a later pass's input. Every
command touching a restore runs with `core.hooksPath` pointed at an empty
directory and `core.fsmonitor` cleared through `GIT_CONFIG_*`. A session under
test can write `.git/hooks/post-index-change`, which a plain `git status` fires,
and can reach the same execution through `core.fsmonitor` in its own config;
both were measured executing on git 2.55.0 before that guard and suppressed
after, with history still readable. Deleting `hooks/` alone does not close it.

Retention is per attempt and has no pruning policy, so a confirmation run of
five reps holds about five copies of the fixture per group. A group that grows
too large is answered by reducing the fixture, which is the input under the case
author's control.

#### Regrading a saved attempt

`regrade attempt:session:<case>/<uuid>` re-evaluates a saved attempt's evidence
against its case as it stands now and prints the path of the assessment it
wrote. It reaches no provider, so correcting a wrong check costs no second paid
session.

The definition comes from the case declaration on disk, the way `replay`,
`calibrate` and `stale` all read frozen evidence against what the case declares
today. An attempt whose case no longer exists is refused, naming both; there is
no flag to grade it against a substitute definition.

The evidence comes from the attempt directory: the reply from `attempt.json`,
the transcript from `transcript.jsonl` beside it, and the files and git state
from `state/`. A record's own `transcriptFile` is an absolute path on the
machine that wrote it and is not what a regrade opens. Each pass restores the
state evidence into its own copy before grading, so the saved reply, transcript
and state stay byte-identical however many passes run and whatever the scorer
writes.

Transcript checks regrade over the boundary the attempt recorded, honoring
`transcriptDiagnostics.prefixLinesExcluded` only when the diagnostics state is
`complete` or `partial`. A record with no diagnostics, or whose state is
`unavailable`, has its transcript checks reported unavailable rather than
graded over a transcript that cannot be bounded: the `unavailable` variant
still carries a `prefixLinesExcluded`, which one saved record pairs with a
zero-byte transcript, and grading on that field's presence alone would
report a `tool-calls` or `files-read` check passing over evidence that does not
exist. A case declaring a `stateCheck` whose attempt preserved no `state/`
reports that scorer unavailable for the same reason.

An assessment carries `PASS`, `FAIL` or `UNAVAILABLE` per declared check, the
digest of each evidence body it read, and a grading definition digest over
`{checks, stateCheck}`. Two assessments of one attempt whose digests differ
were produced by different definitions. An assessment in which any declared
check is unavailable carries no overall outcome, because a verdict over the
checks that had evidence would read as a verdict over the whole definition.

Assessments accumulate; nothing prunes them, and none rewrites `attempt.json`.
Comparison digests a rep's `attempt.json` bytes as provenance, so rewriting a
record in place would stale every saved comparison over that rep.

#### Transcript diagnostics

Each new session attempt record carries `transcriptDiagnostics`, derived from
the retained transcript records at and after the case's cut. The projection
keeps `prefixLinesExcluded`, `sourceLineCount`, and `measuredLineCount`; every
call or result locator is a 1-based JSONL line and 1-based content-block
position in the whole retained file. Changing the case declaration later does
not change that recorded boundary.

`toolUseOccurrences` counts recognized `tool_use` blocks, in total and by tool
name. These are raw observed occurrences, not deduplicated executions or lower
bounds. `toolErrors` contains only `tool_result` blocks whose `is_error` is
`true`; a result gains its tool name and call locator only when
`tool_use_id` identifies one unique call. `repeatedBashCommands` groups the
exact full `Bash.input.command` string on two or more distinct unique tool-use
IDs, whether or not the calls are adjacent. Whitespace remains significant.
The record stores a SHA-256 digest, character count, a preview of at most 160
UTF-16 code units without splitting a Unicode code point, a truncation flag, and
ordered call locators. The complete command remains in `transcriptFile`. A
repeated command is an observation, not a claim about waste, phase, tokens,
cost, or causality.

The diagnostic `state` is `complete`, `partial`, or `unavailable`. Complete
means the measured JSONL uses the supported message, tool-use, and tool-result
shapes; valid string user content and metadata records can therefore produce a
complete zero. Empty or malformed measured evidence, unsupported content
blocks, invalid tool blocks, missing results, and missing, duplicate, or
unmatched IDs produce `partial` with named `issues` while preserving any raw
observations that were possible. `unavailable` means the provider transcript
did not exist and carries no numeric observations. Historical attempt records
may omit `transcriptDiagnostics`; omission means not recorded, and readers do
not recompute it from the current case cut.

A session attempt also keeps its sub-agents' evidence. The provider writes each
sub-agent's transcript and meta file, `agent-<id>.jsonl` and
`agent-<id>.meta.json` with an id of lowercase letters and digits, under
`<sessionId>/subagents/` beside the session's own `<sessionId>.jsonl`.
Recording copies them into `subagents/` beside `transcript.jsonl`, for a handled
invocation failure as well. Only regular files with those two names, in a real
directory, are copied, so a symlink or any other entry the session left there
stays out of the record. A file or directory the copy cannot read stays out of
the record without failing it.

Cleanup then removes the provider's whole `<sessionId>/` directory with the
session's file, once the record holds every sub-agent file in it. Where it does
not, the directory stays, since it holds the only copy. That directory can also
hold other provider files, such as outputs offloaded to `tool-results/`, which
the record does not keep and cleanup deletes.

`unavailableSubagents` lists each agent that an Agent result, or a Skill result
that ran the skill in its own context, names at or after the cut and whose
transcript the record does not hold. An agent named in the inherited prefix ran
before the attempt and is not listed. Records written before this omit the
field and keep no `subagents/`; omission means the files were not checked, not
that the session ran no sub-agent.

An attempt record may also carry `contextEvidence` when its caller supplies a
captured provider bundle. The version-1 evidence stores the source bundle
unchanged beside a normalized projection of agents, parentage, requests,
instruction loads, compactions, raw API body references, and capture coverage.
The normalizer joins records by documented request and agent identifiers. It
partitions reused request identifiers by session, retains client/server request
aliases, collapses canonically equivalent OTel request duplicates, keeps
occurrences without a request identifier separate, and records missing or
conflicting joins instead of assigning them by timestamp. Recognized malformed
hook, OTel, raw-body-reference, and coverage records downgrade their stream
coverage rather than disappearing from the completeness result.

Request evidence separates provider-reported cost from calculated cost. A
calculation uses the supplied model rate catalog and retains the complete
selected rate plus the catalog's source, version, and USD currency. Missing or
conflicting model, usage, rates, or cache-write TTL splits leave a named
incomplete pricing state. The projection also names each reason its aggregate
accounting state is incomplete. Historical records and attempts whose caller
supplied no bundle omit `contextEvidence`; omission means the evidence was not
collected, not that the attempt used zero context or cost.

`case capture <id> --session <id-or-prefix> --cut <N>` copies records `[0, N)`
from a transcript this machine recorded, updates the declaration's
digest/source/cut, and writes the prefix under `cases/<id>/`, beside the
declaration that names it. The cut is a positive zero-based index of the first
dropped record. Run the formatter after capture.

Two stores are searched: the provider's own sessions under `~/.claude/projects`,
and the attempts the harness saved under `.benchmark-runs/sessions`. Either
store being absent means it holds no sessions, so a capture from one works on a
machine that has never written the other. The reps of a confirmation run, under
`.benchmark-runs/confirmations`, are not searched, so their transcripts cannot
be captured by id.

A session is identified by the id its records carry, not by its file name: every
transcript a session attempt writes is named `transcript.jsonl`, and the uuid of
the directory holding it is a separate value from the session's. Where a
transcript's records name more than one session, which is what a resumed session
leaves, the file's own `<sessionId>.jsonl` name settles which of them owns it.
A transcript that names no session, or several with none of them its file's
name, is refused by path. Several files may carry one id, since a subagent's
transcript carries the session's; the file the store named for the session is
the one a capture reads.

The loader reads the prefix from that one location. `.gitignore` excludes the
`.jsonl` files directly inside a case directory, which is where a prefix may
sit and nothing else does, so a captured prefix stays out of a commit until a
negation names it. Publishing one is therefore an explicit edit that
CONTRIBUTING.md's content review can gate. A case whose prefix is withheld
reaches another clone as a declaration with no bytes beside it, and an attempt
at it is refused. Resumption checks the declared digest and that the declared
source session occurs in the prefix's bytes, since the fork rewrites that id
where it occurs and an absent one would leave the source session named in the
attempt. It then forks the prefix under a fresh session ID and owns only the
forked session file for cleanup. Its Claude invocation sets
`--system-prompt-snapshot off`, so the system prompt is rendered again from the
case's declared settings and installed corpus rather than reused from the
prefix's original conversation. Missing or changed bytes are refused.

## Corpus sources and delivery

The corpus is the engineer's instruction set. The target's own `CLAUDE.md`,
`AGENTS.md`, and project documents belong to the target. Rehearse's root
`AGENTS.md` instructs contributors working on Rehearse.

A corpus directory has this layout; only the entries needed by an execution
must be present:

```text
CLAUDE.md
skills/<name>/...
output-styles/<name>.md
agents/<name>.md
rulebook/...
```

Absent `--corpus`, a command reads the linked corpus. `settings --link-corpus
<dir>` (or `PUT /api/settings/corpus`) stores a directory in corpus layout as
`linkedCorpusDirectory` in `settings.json`. It refuses a directory whose layout
cannot be hashed, such as one holding a file that resolves outside it through a
symlink, naming each refused entry and keeping the link it had, because such a
corpus has no version to replay or rehash against. `settings --unlink-corpus` (or
`DELETE /api/settings/corpus`) removes it. Replay, session `run` and session
attempts, `stale`, `show group:<id>`, the corpus commands and the browser's
corpus and run reads then treat the linked directory as if it were passed with
`--corpus`, re-checking it on every read. A replay of the linked directory also
runs with project-level settings preferred, as a replay given `--corpus` does.
A pipeline `run` refuses before the model probe while a directory is linked,
naming the command that unlinks it, because a pipeline run measures only the
live install. For the same reason `calibrate` names the live install's
instructions as its edit target whether or not a directory is linked. With
nothing linked, the corpus is the live install.

Linking changes what run history reports as stale, because `stale`, `show` and
the run list judge recorded reads against the linked directory rather than the
live install. Unlink to read staleness against the live install again.

A linked directory that is later moved or emptied is not a corpus any more.
Every command that would read it refuses with exit code 3, and the browser's
corpus and run reads answer 409, naming the directory and the commands that
link another or unlink it. `show group:<id>` still lists the reads, unjudged.
`GET /api/settings` still answers, naming the directory that is linked, so the
settings routes can recover from it.

The live source permits files under `~/.claude` and one
external backing tree. `BENCHMARK_LIVE_CORPUS_BACKING_ROOT` selects that tree
and defaults to `~/.agents`. An override replaces the default and must be a
non-empty absolute path without NUL bytes. A missing backing tree grants no
permission. Rehearse checks the backing tree only when a file resolves outside
the live install, so files stored directly under `~/.claude` remain usable when
the optional tree is missing or unreadable.

Live instruction reads, declared-file hashes, stage capture, and corpus layout
reports refuse paths whose real paths leave both permitted trees. Checks cover
each selected layout directory and its entries, including links through a parent
directory. Allowed links may cross layout directories within the permitted
extent. Records retain layout paths and content hashes; real paths authorize
access without changing file identity.

A corpus path selected for reading is refused by name whenever it cannot supply
the directory entries or file bytes its role claims: it escapes the permitted
trees, its link target is missing, its link never resolves, its bytes cannot be
read, or it has the wrong file type. One refusal omits its own layout
directory's files and the whole-corpus digest, and retains healthy directories.

The corpus API returns HTTP 200 carrying those refusals. Refusals name the
corpus path without exposing the outside target or its descendants. Stage
capture fails before the affected workflow runs.

An instruction file the corpus cannot supply, including one it simply does not
hold, is a staleness cause rather than a failure: every checkpoint hashed one,
so those measurements can no longer be reproduced. The run-history API and
`stale` both report it that way, per checkpoint, and keep answering for every
other record.

A declared directory source must exist and contain at least one recognized
layout entry. Rehearse consumes a directory; rendering a revision from a
dotfiles repository is external work. Directory sources and frozen stage
snapshots permit paths within their own root only. Project-level stage inputs
keep that same boundary even when a live source supplies a fallback. The first
selected directory shadows lower-priority roots; a refused directory cannot
fall through to a different source.

These checks do not constrain hard-linked data, make provider execution a
filesystem sandbox, or prevent a concurrent process from replacing a link
between its check and read. Corpus sources remain trusted experimental inputs.

| Mode                                | Live corpus                                           | Directory supplied with `--corpus`                                      |
| ----------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Pipeline debug `run`                | Supported                                             | Refused                                                                 |
| Pipeline confirmation               | Frozen stage/global inputs installed in rep worktrees | Refused by `run`                                                        |
| Stage replay, debug or confirmation | Supported                                             | Supported; installed in the worktree with project settings sources      |
| Session debug                       | Declared overlaid inputs are copied, then hashed      | Declared styles, agents, rulebook, skills, and `CLAUDE.md` are overlaid |
| Session confirmation                | Declared files are frozen                             | Declared files are frozen                                               |
| `stale`                             | Compare against live files                            | Compare against the supplied directory                                  |

Session overlays write declared styles, agents, rulebook, skills, and `CLAUDE.md`
under the attempt's `.claude/`, and session attempts run with project settings
sources. That flag is what makes the overlay authoritative: a project-level skill
does not otherwise shadow a same-named user-level one, so without it a declared
skill would be hashed into lineage and never read. A session attempt does not
load the operator's `~/.claude/CLAUDE.md`, and a declared `CLAUDE.md` is framed
the way Claude Code frames a repository's own `CLAUDE.md`, not as user-level
instructions.

Excluding the operator's settings source also means their permission defaults do
not reach the session. A case that edits files or runs a command declares the
grant itself, as a `permissions.allow` block in its `settings`, alongside the
`tools` list that admits those tools. Both are the case's own declaration, so an
unrelated machine default cannot decide whether the case can execute.

Session attempts also run with `--strict-mcp-config` and no MCP configuration,
so no MCP server reaches the session, the claude.ai account's connectors
included. Those connectors would otherwise arrive at no fixed point in the
session and differ between reps of one group, and one that arrives between two
calls makes the second rewrite the prompt cache.

A live session attempt copies the declared files it must overlay and hashes the
copies, so `resolvedPath` names the frozen copy rather than the operator's
install; `corpusOrigin` keeps the provenance. A live source declaring no overlaid
file keeps its pointer. The undeclared remainder of the live install is never
copied or modified. Only a declared output style is selected; an unrelated style
in the source does not become the measured style.

An attempt record carries `settingsDigest`, the identity of the case's declared
behavior settings, beside the per-file corpus digests. Lineage already covers
those settings, so two arms differing only there are incomparable; the digest is
what names settings as the input that differed. A case declaring no settings
records no digest.

Stage snapshots include global instructions, the stage's skill, and available
agents, output styles, and rulebook. Snapshotting validates selected inputs
before copying their files, and copies allowed links as ordinary files so the
snapshot remains usable after the original trees change or disappear. The
additional global-skills list is currently empty. Explicit-directory replay and
stage/pipeline confirmation install snapshots under the worktree's `.claude/`,
preserving its root project instructions, and use project settings sources.
The install also writes `.claude/.gitignore`, which names each installed file
and itself, so a target that does not ignore `.claude` stays clean for the
stage's checks, while a file the stage writes under `.claude` still shows. The
file lives in the worktree and goes with it, and the repository's shared Git
excludes are untouched. A target that tracks files under the installed layout
still reads as dirty, because an ignore rule does not cover a tracked file.
Plain live debug replay leaves settings sources unset and does not install a
snapshot. It uses the live agent environment, as a live debug pipeline does.
Consequently, corpus hashes alone do not establish equivalence between all
ambient hooks, memory, and MCP behavior.

## Pipeline execution and grading

A debug pipeline requires a clean control repository and a separate clean target
repository root on `main`, including ordinary untracked files. The harness
claims the target and backs up its managed workflow state: the root Backlog
configuration, `backlog/`, `.backlog/`, `.boris/`, and a configured custom board
path when one exists. It then runs baseline checks, verifies the unchanged clean
baseline, and captures context/integrity bytes.
It then seeds a real Backlog.md task and records an initial checkpoint.

Each stage starts a fresh engineering session with its named skill. Durable
cards, documents, commits, and checkpoints carry work across stages. Stage
sessions have broad tool access and skip permission prompts. Use a dedicated
target whose services and schema already satisfy the case's declared checks.

A stage session's call has no limit on how long it runs. It streams its events,
and the harness's own timer kills it, with its whole process group, only after
its stdout stays silent for 30 minutes while it still runs, the silence limit.
The stage then fails with an error containing `Command wrote nothing for
1800000 ms, its silence limit, and was killed`, which names silence rather
than a crash. Claude Code 2.1.283, probed with a Bash tool, writes a progress
line every 30 seconds during a foreground tool, so a long tool does not count
as silence. A wait on a background sub-agent writes nothing, so waiting on one
for longer than the limit ends the call while it still works. The Product
Owner and the Judges keep a 30-minute limit on elapsed time.

A shared Product Owner session answers engineering questions using the task and
product brief, retaining earlier decisions. It does not receive the grading
rubric or candidate diff. Its policy preserves stated product facts, chooses
small coherent scope where facts are silent, and leaves implementation choices
to engineering. Questions and answers are recorded.

Planning-stage validation requires clean descendant history on the original
branch and any declared acceptance criteria/artifact. Planning commits become
evidence and advance the next stage's baseline. Delivery requires at least one
commit matching the pipeline's pattern, clean descendant history, and target
checks/integrity. The delivery Judge sees delivery-stage commits; the final
Judge sees the candidate since task setup.

Stage rubrics define hard blockers, binary requirements, and letter-graded
quality dimensions. A blocker yields F; a missing requirement caps the result
at C. Otherwise the worst dimension determines the grade. A/B is the normal
continuation and reliability-success band. `--minimum-grade` can alter pipeline
continuation without changing those Judge conclusions.

The stage Judge receives frozen task, brief, instructions, bounded tracked
repository context, questions/decisions, task state, declared artifact, and
accepted prior artifacts. Delivery adds diff and measured checks. Binary files,
`bun.lock`, and content beyond configured capture limits are excluded from full
context. Harness-detected delivery/check failures force blockers.

Judges run with safe mode and no tools. Output must satisfy schemas, evidence
citations, and grade derivation. Invalid returned output gets one correction
attempt against the same evidence; invocation/envelope failures are not retried.
Scorecards retain the prompt, frozen rubric/input, returned attempts, validation
outcomes, and costs.

Each stage Judge evidence item carries a quote copied from the source it cites.
The harness finds the quote in the frozen input, after collapsing whitespace and,
for the diff, with or without line prefixes, and records a `locator`: the file
and line range for a text source, the file and header of the hunk a quote
starts in for the diff, whose cited file the harness reads in order with its
header lines and hunk headers so a quote may span that file's hunks but not
another file's, the index of the subject a quote starts in for commit
subjects, which the harness reads one per line so a quote may span
consecutive subjects, and the exchange, field and character range for the
transcript. A quote its cited source does not hold rejects the attempt.
Items citing `check-integrity`, `local-checks` or `harness-failure`, and blockers
the harness forces, carry no quote and a `harness` locator saying whether the
input holds that result; commit subjects a stage never recorded get an `absent`
locator. The final Judge quotes the diff and baseline context the same way, and
its `check-integrity` and `local-checks` requirements carry the harness's own
results with a `harness` locator; the local check results the run records keep
their shape. Records written before quoted spans have neither field, and
`show run:<name>` lists each stage's and the final Judge's evidence, marking
those items as recorded before quoted spans.

After accepted delivery, the final Judge grades the external rubric against
baseline context, the candidate diff, and measured checks. Requirement IDs must
appear exactly once, citations must refer to supplied evidence, and PASS needs
all requirements. The harness overrides `local-checks` and `check-integrity`
with its own measurements. Target integrity files must exist at baseline and
retain their bytes, preventing a candidate from passing by weakening checks.

## Review and calibration

Without `--pause`, a pipeline debug run retains its candidate under
`refs/rehearse/<run>`, restores the target, and prints the record and follow-up
commands. A completed candidate awaits human review; a quality stop records the
stage evidence that stopped it. Review remains separate from the machine grade.

`show run:<name> --checkout <new-directory>` creates a detached worktree in the
recorded source repository from the retained ref. The directory must not exist.
Remove the checkout with `git worktree remove` afterward. The retained ref keeps
candidate commits reachable after target restoration.

`review <run>` accepts either `--file <review.json>` or `--verdict`, `--summary`,
and repeated JSON `--finding` flags. It validates the run and review before
writing `<run>.review.json`. This hypothetical finding uses the bundled final
rubric. Replace its path and description with evidence from the actual candidate:

```json
{
	"verdict": "REJECT",
	"summary": "The persisted audit row omits details.",
	"findings": [
		{
			"description": "The worker does not persist the payload details.",
			"paths": ["src/audit/worker/audit.worker.ts"],
			"stage": "final",
			"judgeAssessment": "MISSED",
			"rubricId": "entity"
		}
	]
}
```

| Assessment       | Calibration meaning                                                 |
| ---------------- | ------------------------------------------------------------------- |
| `CAUGHT`         | Original Judge already failed the cited criterion                   |
| `MISSED`         | Revised rubric must catch a defect the original Judge missed        |
| `FALSE_POSITIVE` | Revised rubric must pass behavior the original Judge wrongly failed |
| `NOT_PROMOTED`   | Record the observation without making it a reusable Judge rule      |

`stage` names a stage or `final`; omission defaults to `final` for compatibility.
The first three assessments require `rubricId`. ACCEPT cannot include a CAUGHT
or MISSED defect. Edit the relevant stage rubric or final rubric for Judge
errors, and the measured instruction corpus for observed agent-behavior defects.

`calibrate <run>` reads the review, current rubrics/instructions, and frozen
recorded evidence. Changed stage rubrics rejudge the same stage input; a changed
final rubric rejudges the same candidate when final evidence exists. No new
implementation run is required. A final-rubric edit at a stage stop cannot
produce a final grade for a pipeline that never reached delivery.

Calibration checks findings against original and revised judgments. Revised
conclusions require `--confirm-rejudge`; without it, the command prints the
revision, leaves the record unchanged, and exits 3. Running again to confirm
invokes the Judges again against current inputs and incurs those calls again.
Invalid reviews or ineffective rubric changes leave the record uncalibrated.
A successful calibration records COMPLETE with the review and revised evidence.

With `--pause`, the candidate stays in the target, a review template is created,
and the interactive loop waits until review and calibration validate. Changes
to corpus/rubrics made during review remain after target restoration.

Completed calibration contributes Judge/human contingency counts per exact
Judge model, stage, frozen rubric contract, and criterion. Reports include
observed agreement and Cohen's kappa; kappa is null when its denominator is zero.
Changing the model or rubric starts a distinct agreement baseline.

### Operator grades

`serve` lets the operator grade, blind, any stage whose record carries a Judge
letter: a pipeline run's scorecard or stop record, a confirmation rep's stage, or
a replay's scorecard. Before the operator grades, the review shows only the
frozen input the Judge read, each field as text with a structured one as
indented JSON, and the stage's criteria. A stop record keeps no
rubric, so its criteria are the ids the Judge graded. Once the grade is
recorded, the review adds the Judge's grade for the same stage.

The operator grades every criterion the way the Judge does: PASS or FAIL for
each hard blocker and requirement, and a letter from A to F for each dimension.
The stage letter is derived by the Judge's own rule. A grade with an id missing
from or extra to the stage's criteria, a value outside those scales, or an id
segment that is not a letter or digit followed by letters, digits, `.`, `_` or `-`, is refused and writes nothing. A stage takes
one grade. A second one is refused, since it would be given after the Judge's
grade was shown.

The calibration report lists each graded stage with both letters and how many
steps apart they are, the count of reviews within one step, the stages still
ungraded and the oldest of them, and each dimension's drift. Drift is the
operator's letter place minus the Judge's, averaged per dimension within one
Judge model, stage name and rubric contract, so a positive figure means the
Judge grades more generously. A stop record's group has no rubric contract.

| Route                                                                 | Use                         |
| --------------------------------------------------------------------- | --------------------------- |
| `GET /api/calibration`                                                | Agreement rows and drift    |
| `GET /api/calibration/runs/<run>/stages/<stage>`                      | Review of a run stage       |
| `GET /api/calibration/groups/<group-id>/reps/<rep-id>/stages/<stage>` | Review of a rep stage       |
| `GET /api/calibration/replays/<lineage>/<timestamp>`                  | Review of a replay          |
| `POST <review route>/grade`                                           | Record the operator's grade |

Operator grades never change a Judge grade or any existing record. Each is its
own file under `operator-grades/`, listed under Record locations.

In the browser, the Calibration screen at `/calibration` shows the agreement
rows, the drift by group and a link to the oldest ungraded stage. Each review
opens at its API path without the `/api` prefix, as a form with one choice per
criterion and an optional note. The Judge's grade appears beside the
operator's only after the operator's is recorded.

### Root-cause analysis

One real-provider analysis has run, and it named no root cause, so the checks
on a named root cause below are tested only against a fake provider.

`diagnose <run> --model <model>` asks one sealed session which corpus file, if
any, an ended run's outcome most plausibly traces to, and records its answer.
`<run>` is a pipeline run's name or `run:<name>`. Replays, groups and session
attempts are refused. The session gets no tools, no project settings and no
commands. It reads a bundle of the run: the manifest's task and brief, each
stage's grade or stop with the Judge's findings, commit subjects and changed
paths, the run's outcome, and the bodies of the corpus files each stage read,
taken from the corpus version the stage recorded. Prompts, whole transcripts and
diffs stay out of the bundle, but a Judge finding quotes its evidence, so
excerpts of both reach the session through the grades. A stage written before
read manifests were kept names the corpus files it was given in place of what it
read, and a stage written before corpus versions were kept, or a read its version
does not hold, carries no body. A stage the spend ceiling refused before its
session counts as a stage that never ran.

A run has ended when its final record, a stage stop or an operator stop exists,
or when its process died with no outcome, in which case it is analyzed as it
stands. A run with no manifest, a paused run, and a run whose target's marker
names a live process are refused with exit code 3 before any call. The marker
belongs to the target and not to the run, so a dead run whose target a later
run now holds is refused as in flight until that run ends.

`--budget-usd` sets the session budget and defaults to 1. The command lowers it
to the stored spend ceiling when it is higher and states it on stderr before
the call. Like any session budget it is not a cap, since Claude Code stops a
session only after the call that crosses it. The analysis is not charged to the
run it reads, so its cost sits outside that run's ceiling. The command runs no
model probe, so an unavailable model ends in a failed record rather than a
second paid call.

The harness checks the answer before keeping it. It reads exactly the stages
that ran, at most one stage is the root cause and it is the stage the
root cause names, the root-cause file is one that stage read, and a line range lies
within that file's body as the stage read it. A stage's role is `not
a factor`, `contributing factor` or `root cause`, and a declared stage that
never ran is recorded as `never ran`.

The record, with `schemaVersion: 2`, holds the run, the model, `capUsd` (the
budget the call ran under), `startedAt`, `durationMs`, the bundle's digest and
size, and `costUsd` when the provider reported one. A kept answer adds
`outcome: "recorded"`, the `rootCause` (`stage`, `file` and optional `lines`, or null),
the `narrative`, the `pairedRerun` that would confirm the reading, and `stages`,
each stage's role with a `note` and a `contribution`. An answer that breaks a rule, or
a session that returns none, is kept with `outcome: "failed"`, its `reason` and
whatever the session returned, and the command exits 1. Either way the command
prints the record's path, or the record itself with `--json`. `show` does not
open analysis records.

A record with `schemaVersion: 1` was written before the culprit analysis was
renamed root-cause analysis. It stays on disk as written and is read under the
new names: its `culprit` as the `rootCause`, and its roles `not implicated`,
`contributing` and `primary culprit` as `not a factor`, `contributing factor`
and `root cause`. The reader and the API give it as a version-2 record. A
failed record's `reason` and `payload` stay as they were written, so they can
still carry the old names.

Records live at `<records>/analyses/<run>/<startedAt>.json`, with each `:` in
the time replaced by `-`. `GET /api/runs/<run>/analyses`, implemented in
[root-cause-analyses.ts](../src/server/root-cause-analyses.ts), answers `{run, newest,
earlierCount, unreadable, request}`: the newest record or `null`, how many older ones the run
holds, `unreadable`, each `.json` file in the run's directory that does not
parse or match the schema with its reason, and `request`, the `model` (`sonnet`, the model recorded
runs are compared under), the `capUsd` a browser request would run under and a
`refusal`. `capUsd` is the 1-dollar default lowered to the stored spend ceiling.
When no ceiling is stored or the settings file cannot be opened or parsed,
`capUsd` is `null` and `refusal` names the fix, since nothing spends without a ceiling, and
the analyses are still served. A record is written whole to a temporary file and
linked into place, so the route never reads half of one. It answers 400 for a
malformed run name and 404 for a run with no manifest.

## Target restoration

Normal direct-target cleanup force-switches to `main`, resets to the original
SHA, cleans ordinary untracked files, restores the workflow paths recorded in
the pre-run backup, then verifies the original clean state before removing the
run marker and backup. Candidate commits survive through retained refs. Ignored
dependency/build folders outside the workflow paths are not restored byte for
byte. Repository-private Backlog exclude entries remain in Git metadata after
restoration and are reused by later runs.

SIGINT, SIGTERM, and SIGHUP stop child process groups and trigger restoration.
A hard kill or crash may leave `.git/benchmark-run.json` and a temporary workflow
backup. The next run refuses that target. Follow its recovery instructions:
stop surviving children, restore the recorded Git state and workflow backup,
verify recovery, and only then remove the marker. Server interruption detection
does not perform that restoration for you.

An initial checkpoint captures task setup and the stage-settings digest;
accepted stages create subsequent checkpoints with target SHA, workflow state,
artifacts, settings, and lineage. A stage checkpoint also preserves that
stage's raw session transcript as `transcript.jsonl` beside the record, so a
later reader can observe what the stage actually loaded rather than inferring
it from the parsed exchanges. Where the provider wrote no transcript, the
record says so with an explicit unavailable status instead of omitting the
evidence. Where the stage's transcript is available, its sub-agent transcripts
and meta files are copied into `subagents/` beside it by the same rules as a
session attempt's. A checkpoint keeps no list of unavailable sub-agents, so a
checkpoint without `subagents/` does not show that no sub-agent ran. The stage
ran in the target repository, so the provider's files in that repository's
projects slug are left in place. Checkpoints written before this carry no
transcript field and remain readable. A stage that stopped the run, by its
grade or by its judging failing, saves no checkpoint, so its transcript and
sub-agent files are copied by the same rules into `<run>.<stage>.session/` in
the runs directory, beside its stop record. No reader requires the copy: a
copy that fails is reported on stderr and the run ends as it would have
without it. A stop recorded before this keeps no transcript. A stage
checkpoint, a replay record and a session attempt record also carry
`readManifest`, the files the record declared
or its transcript shows it loading. A stage record carries `readManifest` too,
which is the only copy for a stage its judge stopped, since that stage saves no
checkpoint, and so does each stage file of a confirmation rep, stopped or not. A corpus entry is
a file loaded from where the record's corpus resolved it: the live install
when the corpus is live, or, in a `.claude` the harness installed the corpus
into or the corpus resolved files from, only the files installed or resolved
there at the start. From the target, a stage, replay or rep lists the
`CLAUDE.md` and `AGENTS.md` files it loaded and each other file it loaded from
the target's own `.claude`, the latter as a `project` entry by its path in the
target, such as `.claude/skills/local/SKILL.md`. A session attempt leaves out
a load from its `.claude` that the harness did not install, and every record
leaves out a load from any other `.claude` directory. Each entry has a `path`, a `half` of `corpus`, `project` or
`rubric`, one `role` of `global instructions`, `project instructions`,
`stage skill`, `judge rubric` or `read for context`, an `evidence` of
`declared`, `observed` or `declared and observed`, and a `sha256` where one is
recorded. A stage or replay declares the corpus `CLAUDE.md`, its skill and its
judge rubric, and a session attempt declares its case's corpus and project
files. A corpus hash is the one the record's corpus files carry, or for a
corpus file loaded outside them, the one the corpus version measured at the
record's start holds, absent when that measurement refused or holds no file at
that path. A confirmation rep measures that version once, at its group's
start. A rubric hash
is the SHA-256 of the frozen scorecard's rubric as parsed, not of the file's
bytes, so an edit to formatting or to a field the parser drops leaves it
unchanged, and a project file's hash is its bytes when
the record started: at the stage's starting commit, or as the fixture seeded
the attempt, including an instruction file the attempt loaded undeclared. A
project file absent there has no hash. Records written before
this carry no `readManifest` and remain readable. Replay materializes the upstream state for the
named stage. It can inspect a stale checkpoint for exploration, while
confirmation/comparison require compatible frozen evidence. Replay permits an
uncommitted control repository and records its SHA with a dirty marker.

`stale` compares recorded corpus inputs with live or supplied corpus files and
compares each pipeline run with the stage settings its case declares today.
The root `stage-settings.json` applies when a case declares no override or no
longer loads as a pipeline case. The comparison uses canonical JSON, so
whitespace-only edits and checkout relocation remain fresh. A missing or invalid
current settings file stales that run by name without hiding other runs. The
initial checkpoint participates, including for runs that stopped before an
accepted stage. A stopped stage saves no checkpoint, so it is judged from the
reads its stop record keeps as though it were the stage after the run's last
checkpoint, so any stale checkpoint reads on it as `upstream stage <stage> is
stale`, naming the first stale stage in the chain. It is listed under its run's
id, `run:<name>`, which `show` opens, and run history and `corpus invalidation`
judge that run's row by the stopped stage rather than by a checkpoint. A stop
record without `corpusFiles`, written before 2026-09-07, is not judged, and
its run is judged by its checkpoints alone. A stop record, or another stage
record of its run, that does not parse names `run:<name>` among the unreadable
records while the run's checkpoints are still judged, and the run's row then
has no judgment: run history reads its staleness as unavailable where it keeps
the row, and `corpus invalidation` does not count it. Optional
model/effort flags assert those intended replay settings as well for
checkpoints, stopped stages, replays and groups. Every session attempt is
judged on its own against the files its case declares, so an older attempt is
named as well as the newest, and a session case with no prior attempt has no
stale measurement. An attempt of a case no longer declared is named on stderr
rather than judged, since its corpus files are unknown. Every stage replay
is judged against the stage corpus it read, and is also stale when the
checkpoint it consumed is stale or when a model or effort flag differs from the
one it ran with. Every confirmation group is judged by the corpus files it
froze: a stage or pipeline group per stage, against the skill its frozen
pipeline names, and a session group against the files its case declares. A
stage that froze none of its own skill, as a comparison's control group does,
is judged on the rest of its corpus. A file several stages froze is named once. A group is also stale when a model or
effort flag differs from the one it froze. A stage or pipeline group froze its
own checkpoint, so no live checkpoint can stale it. A stage or pipeline group
that froze no pipeline, and a session group whose case is no longer declared,
are named on stderr rather than judged. A group is also judged by the read
manifests its reps recorded, on their stage files and checkpoints or their
attempts: a corpus file a rep loaded outside the frozen files stales the group
when it changed, and a judge rubric a rep's stage was graded by that now
differs names `judge rubric <path> changed`, which makes the group count as
stale by more than corpus files.

Each line `stale` prints is the record id, its short id or `-`, its version
distance, and each cause. The distance reads `distance N`, the number of
positions the record's corpus version sits behind the corpus under test in that
corpus's version log, with 0 when the corpus under test is that version. It
reads `distance not recorded` for the initial checkpoint, which reads no corpus,
a record written before corpus versions, one whose attempt measured no version,
one whose version is not in that corpus's log, or when the corpus under test
refuses a layout entry. Distance never makes a record stale. Only its causes
do. A corpus file a checkpoint, stopped stage, replay or session attempt loaded outside its
captured corpus files, and hashed, is compared too, so an edit to it or its removal stales the record as
an edit to a captured file does. A checkpoint, stopped stage or replay whose read manifest holds a judge rubric
that now differs, is gone, or no longer parses, names
`judge rubric <path> changed`. The rubric is read from the control repository,
whatever `--corpus` names. That
cause leaves the distance as it was. A later stage and a replay that consumed
the checkpoint read it as `upstream stage <stage> is stale`, since they ran
only because that stage's grade let them, and none of them counts as stale only
by corpus files.

Missing files and changed inputs are evidence to inspect, not a substitute for
running the revised case.

Ordinary checkpoints created before settings evidence was recorded appear stale
even when the settings file has not changed. Their records cannot show that the
currently declared settings applied to those stage sessions.

## Record locations and IDs

The authoritative evidence lives under ignored `.benchmark-runs/`. The SQLite
run-event store supports live UI updates and is derived state.

Set `REHEARSE_RECORDS_DIR` to keep records in another directory. Every command
and `serve` then read and write there instead of `.benchmark-runs/`, including
the locations below and the stores `case capture` searches. A relative value
resolves against the directory the command runs in, which `bun run rehearse`
sets to the repository root. An empty value is a usage error. Give `serve` and
the commands the same value, or the UI shows a store the commands do not write.
Only `.benchmark-runs/` is git-ignored, so an override inside the repository
leaves transcripts and run artifacts where git can see them.

| ID accepted by `show`                   | Record location under the records directory                  |
| --------------------------------------- | ------------------------------------------------------------ |
| `case:<id>`                             | Declaration is outside run state, at `cases/<id>/case.json`  |
| `run:<name>`                            | `<name>.json`, or the stopped-stage record                   |
| `checkpoint:<run>/<stage>`              | `<run>.checkpoints/<stage>/checkpoint.json`                  |
| `attempt:stage:<lineage>/<timestamp>`   | `replays/<lineage>/<timestamp>.json`                         |
| `attempt:session:<case>/<uuid>`         | `sessions/<case>/<uuid>/attempt.json`                        |
| `group:<group-id>`                      | `confirmations/<group-id>/group.json`                        |
| `rep:stage:<group-id>/<rep-id>/<stage>` | `confirmations/<group-id>/reps/<rep-id>/stages/<stage>.json` |
| `rep:session:<group-id>/<rep-id>`       | `confirmations/<group-id>/reps/<rep-id>/attempt.json`        |
| `comparison:<digest>`                   | `comparisons/<digest>/report.json`                           |

`compare attempts` and `compare extend` also write the baseline corpus they replay under
`baseline-corpora/<corpus-digest>/`, the manifest it compares under
`comparison-manifests/<control-group-id>.json`, and `baseline.json` beside the
report. Browser launches record themselves as `launches/<id>.json` with the
child's output in `launches/<id>.log`. A root-cause analysis lives at
`analyses/<run>/<started-at>.json`, named by its start time with `:` written
as `-` and created once, so a second analysis of the
same run sits beside the first. Operator grades live at
`operator-grades/run/<run>/<stage>.json`,
`operator-grades/rep/<group-id>/<rep-id>/<stage>.json` and
`operator-grades/replay/<lineage>/<timestamp>.json`, each created once and
carrying `schemaVersion: 1`.

`show` also accepts a short id, an alias scoped by case: `<case>/r<n>` names
a run, replay or session attempt, `<case>/g<n>` a confirmation group, and
`<case>/r<n>/s<k>` a run's checkpoint, with `s0` taken after task setup and
`s<k>` after the k-th stage of the pipeline the run froze in its manifest.
Numbers are unpadded, and a run and a group of one case never share one. A
command claims its number when it commits to executing, after its refusals and
before its first workflow session, and a number is never reused. A command
that fails before writing its record, such as a failed replay, leaves a number
that names nothing; a run or session attempt that fails still writes its
record and keeps its number. A short id whose case segment is not a case id is
refused before any path is built. Short ids are unique within one records
directory: another clone numbers its own records from 1.

Short ids live in the registry at `short-ids/<case>/`. `claims/<n>` holds what
the command knew when it claimed: the record for a run, session attempt or
group, and for a replay the checkpoint it replays, whose record `bindings/<n>`
names once its timestamp is known. A replay confirmation's claim also names
the checkpoint its reps replayed. Every command that writes a run, replay,
session attempt or confirmation group claims a number, and a case's first
claim takes number 1. A record no claim names has no short id, and nothing
numbers it later. The registry is part of the records, not derived
state: deleting it drops every number in its case and the next claim starts
again at 1, so a short id already printed or quoted can then name a different
record.

The server's `/api/runs` rows carry the same numbers. A row's `shortId` is
absent when its case's registry does not name it, a run lists its
`checkpoints` with their short ids, a replay carries the `checkpointShortId` it
started from and its `attempt`, and a group lists `repAttempts` as
`{repId, attempt}` entries. An `attempt` is `{position, count}`, a replay's or
stage-mode rep's place among the attempts at its checkpoint. Those attempts are
the original run's stage when it saved that stage's checkpoint, scored it, or
stopped on a grade below the pipeline's minimum, every replay of the checkpoint
that claimed a short id, and every stage-mode rep judged at every stage in a
group whose claim names the checkpoint, ordered by when each claimed its number
and then by rep order. The count grows with every later attempt, and a replay
claimed after a group moves back once that group's reps are judged, so an
attempt is a position label rather than a name. A session-mode rep's attempt is
its position among the reps its group declared. A pipeline-mode rep, and a rep
of a group whose claim names no checkpoint, has no attempt. A case's registry
cannot be read when any of its files fails to open, and then the whole case
counts as unreadable. A claim file that opens but does not parse is skipped
without a report, leaving only the record it named unnamed. An unreadable
case's rows lose every field its registry supplies: `shortId`, a run's
`checkpoints`, which come back empty, a replay's `checkpointShortId` and
`attempt`, and a group's `checkpoint` and `repAttempts`. The response gains
a `short-ids` entry with the id `short-ids/<case>` among its unreadable
records, and every other case keeps those fields. When `short-ids/` itself
cannot be listed, every row loses them and one entry with the id `short-ids`
is added. Neither fails the response.

`list cases|runs|checkpoints|attempts|groups|comparisons` prints IDs usable by
`show`. For runs, checkpoints, attempts and groups the second column is the
short id, or `-` for a record its case's registry does not name; cases and
comparisons have no short id column. `list comparisons` and
`GET /api/comparisons` leave out a comparison an extension replaced, which
still opens by its digest. `list` only reads registries, so a case no command
has claimed in prints `-` throughout. A case's registry that cannot be read
prints `-` for that case's records only and writes one stderr line,
`short-ids/<case>: <reason>`, and a `short-ids/` that cannot be listed prints
`-` throughout with one `short-ids: <reason>` line. Either way the command
still lists every record and exits 0. `stale` prints each record's short id,
and reports an unreadable registry, the same way. Empty history is valid on a fresh clone. A malformed record is reported
without hiding readable neighbors. Stopped runs are visible through the same
commands as completed runs. `list attempts` validates attempt diagnostics, and
`show attempt:session:<case>/<uuid> --json` exposes the recorded projection. An
attempt that preserved state evidence writes it to `state/` beside that
`attempt.json`, with the session's `.git` stored as `dot-git`.
A session attempt's `attempt.json`, a group rep's included, records
`startedAt`, the ISO instant its `elapsedMs` starts. A standalone attempt
written before the field existed carries none, and run history and the Cases
screen place it after every timed record. A group rep is placed by its group's
`startedAt`.

Confirmation groups retain frozen inputs, rep records, and `report.json` beside
`group.json`. Reps run concurrently in separate directories. Reports include
outcomes, success rates and uncertainty, pass^k, and resource distributions;
a failed or stopped rep remains part of that evidence. A group the operator
stopped writes neither `group.json` nor `report.json`, and keeps its rep
records; see [browser launches](#browser-launches). Session reports also
record the model probe and missing provider metrics explicitly. `group.json`
records `startedAt`, the ISO instant its `makespanMs` starts, so `startedAt`
plus `makespanMs` is when the group finished. Run history, the Tasks and Cases
screens, and calibration place a group by it, and a group written before the
field existed after every timed record.

An attempt's provider metrics retain the CLI's per-model usage block verbatim
when the CLI reports one, giving each model's tokens, the cost charged for them,
the model's context window, and the basis that cost was priced on. A record
written from a CLI that reports no such block omits the field rather than
recording an empty one. Only a cost the provider priced at list is re-derivable
from a rate catalog; any other basis stays reported spend.

### Corpus versions

A corpus version is the whole corpus layout of one source as it stood when it
was measured: every file the layout holds, whether or not a stage reads it,
identified by the sha256 of the canonical file list. Its label is `corpus@`
followed by the first six hex characters. A pipeline run measures its source
when it starts, recording the version on its manifest, and again before each
stage session. A replay and a session attempt measure it before their
session, and a confirmation group once when it freezes its inputs, so every rep
carries the group's version. The measurement lands in the record as
`corpusVersion`, either `{kind: "version", digest}` or `{kind: "refused",
refusal}` when the layout refused hashing: on the run manifest, a stage
checkpoint and the stage's record, including a stop record and one whose
judge failed, a replay record, a session attempt record and a group's
`inputs`. A record written
before versions were measured has no field, which readers report as version
not recorded.

Measuring keeps the version under `corpus-versions/` in the records directory:
`blobs/<sha256>` holds each file body once, `versions/<digest>.json` lists the
version's files, and `logs/<source>/<n>` numbers the versions one source was
measured at, where `<source>` is a hash of the directory the source's root
resolves to, so a root reached through a link shares that directory's log. File
bodies are written readable by their owner only. An entry is added only when
the measured version differs from the source's latest one, so repeated or
concurrent measurements of an unchanged tree add nothing, and a new entry takes
the position after the highest one present. The
store copies instruction files, so a records directory inside the repository
other than `.benchmark-runs/` leaves them where git can see them.

`corpus versions [--corpus <dir>]` lists a source's log, oldest first, with
each entry's position, label and digest. `corpus show <version>` prints a
version's files, and `--file <layout-path>` prints one file as that version
held it, decoded as UTF-8 text, so bytes that are not UTF-8 print as
replacement characters. A version is named by its label or any prefix of its
digest, with or without `corpus@`. An empty prefix names no version, and a
prefix matching several versions the store holds is refused with exit code 3
naming each of them. The server serves the same reads:
`/api/corpus/versions` lists the live source's log as `{position, label,
digest}` entries, `/api/corpus/versions/<version>` answers `{digest, label,
files}`, and `/api/corpus/versions/<version>/file?path=<layout-path>` answers
the file's stored bytes as `application/octet-stream`, and 400 when `path` is
missing. A version the store does not hold, or a file the version does not
hold, answers 404, and an ambiguous prefix answers 409 with its `candidates`.
`/api/corpus` names the live tree by its full version `digest`, computed
without writing to the store, and omits it when any entry refused hashing.
Until a run, replay, session attempt or rehash measures that tree, the store
does not hold its version, so the rail's `corpus@` label can name a version that answers 404.

`corpus invalidation [--corpus <dir>]` prints one line per corpus file,
`<read-by>\t<invalidated>\t<path>`, then the last edit's line and the id of
each row it invalidated, one per line. `/api/corpus` carries the same counts as
each file's `readBy` and `invalidated` and the report's `lastEdit`. It also
gives each file's `lines`, which the command does not print: a last line
without a trailing newline counts, and an empty file counts 0. Read-by
counts the distinct run-history rows whose records read the file: a pipeline
run, whatever its stages read, a session attempt, a replay and a confirmation
group. Invalidated counts the rows that read the file with the hash the
previous version holds while the file differs now, which can include a row
already stale for another reason. Both list only the files the corpus holds
now, so a row that read a file the last edit deleted shows only among the last
edit's rows. The previous version is the log entry before the corpus under
test. The last edit's rows are those the stale judgment calls fresh against
that entry's stored files and stale against the corpus under test, so a row
stale through an upstream stage, its settings or a knob before the edit is not
among them. A pipeline run is judged by its stopped stage when that stage is
judged, and otherwise by its latest checkpoint directory in pipeline order, as
the run history judges it, so a run whose latest directory holds no record, or
whose stopped stage cannot be read, has no judgment and is not among them
either. `lastEdit`
answers `{kind: "measured", previous, count, rows}`, or `{kind:
"not-recorded", reason}` when the log holds no earlier version, the store no
longer holds that version's files, or the corpus under test refused hashing. A record that cannot be read counts nowhere, and
a run whose manifest or checkpoints do not parse is named unreadable by its
run id in `stale`, and its run-history row reads unavailable with the parse
error, rather than failing either.
`/api/runs?ids=<id>,<id>` returns only the rows with those record ids, taking
every `ids` parameter given, so the last edit's rows list as run history. An
empty `ids=` names no record and returns no row.

`GET /api/corpus/file?path=<path>` serves the bytes a file the corpus report
lists holds now, which an edit starts from, whether or not the version store
has measured them. The `x-corpus-version` header names the full version the
corpus held when the file was read. A request with no `path` answers 400, a
path the report does not list answers 404, and a corpus that is no longer a
directory of instructions or whose layout refuses an entry answers 409.

`POST /api/corpus/edits/review` with `{path, text, startsFrom}`, where
`startsFrom` is the version the file route named when the file was opened,
reads what writing `text` over one file of the linked corpus would do, writing
nothing. It answers 409 when the linked directory no longer holds
`startsFrom`, since the edit would overwrite a change its editor never saw.
Otherwise it answers
`{startsFrom, invalidated, applyRefusal}`, where `startsFrom` is the full
version the linked directory holds now, `invalidated` counts the run-history
rows fresh against the tree now and stale against it with the edit, judged as
the last edit's rows are, and `applyRefusal` is why an apply would be refused
for writing under the live install, or `null`. `POST /api/corpus/edits/apply`
with `{path, text, startsFrom}` measures the tree, so the store logs the
starting version, renames a copy holding `text` over the file's real path with
the file's mode, and measures again, answering `{previous, version,
invalidated, rerun, needsComparisonManifest}`. `rerun` is the paired rerun the
edit asks for and starts nothing: `{kind: "offered", run, stage}`, the stage
of the newest invalidated pipeline run or stage replay that read the edited
file, the first such stage in pipeline order for a run, when the checkpoint it
would replay from is recorded, or `{kind: "none", reason}`. A run that stopped
at a stage offers that stage from the reads its stop record keeps. Session
attempts and confirmation groups are not offered yet, stage groups included,
and the reason names any invalidated row whose records could not be read.
`needsComparisonManifest` is true for a file outside a skill directory, whose
browser comparison needs its control supplied through a comparison manifest.
That comparison also needs two stage groups at one checkpoint, as
`compare attempts` does, which a single replay is not.
With no record written in between, `/api/corpus`'s `lastEdit`
then names `previous` and carries `invalidated` as its count. A `path` the
corpus report does not list answers 404 on either route. Either route answers
409 when the linked directory is no longer a corpus or its layout refuses an
entry, since such a tree has no version to start from. The apply answers
409, writing nothing and logging no version, when the linked corpus is the
live install, when the linked directory or the file resolves into the live
install or its backing tree by real path, when the directory no longer holds
`startsFrom`, when `text` leaves the file's bytes as they are, when a launch
the server started is live, and while a launch start or another apply is under
way in the server. A launch start answers 409 while an apply is under way. A
launch record that does not read refuses nothing. The tree is hashed again
just before the rename, and a change since `startsFrom` refuses the write
after the starting version is logged, and so does a file whose real path now
lies outside the linked directory or under the live install.

### Pipeline run record

`/api/runs/<run>` reads one pipeline run across the files it wrote, its
manifest, each stage's record, its checkpoints and its main artifact, into one
record, implemented in [run-record.ts](../src/server/run-record.ts). It answers
400 for any run name it refuses, such as one outside the runs directory, and
404 for a run with no manifest. One stage record that does not parse fails the
whole response with 500.

The record names the run by its directory name and its short id, and carries
its case id and its status as the run history reports it, and the minimum
grade the run manifest records, unavailable in a manifest that predates it.
Its `identity` names what the run ran against and with, from the manifest: the
target as the source root's directory name, never its absolute path, the
commit, the model, and the effort, absent when the manifest records none,
and the corpus version the run measured when it started, absent in a manifest
that predates it.

Each stage, in the manifest's order, reports its status (`graded`, `stopped`,
`awaiting-judgment` or `no-record`), its grade as the letter and the judge's
verdict, how many of the rubric's hard blockers its judge found fired out of
how many it checked, with the fired ones' ids, read from a scorecard's grade
or from a stop record's top level, unavailable when its record holds no graded
hard blockers, its
checkpoint's short id, its session and judge cost, and its tokens
as input, cache read, cache write, output and total input, summed over its
session calls and its judge's calls, read from `judgeProviderCalls` where the
record holds them and from the judge's attempts otherwise. Its instruction files are the corpus files
its checkpoint records, or its stop record's when it saved no checkpoint, each
with its sha256 digest, and its `corpusVersion` comes from the same place. Its `readManifest` is its checkpoint's read manifest, each corpus and judge
rubric entry with a `state` judged as the run history judges its latest
checkpoint (below), or, when the stage saved no checkpoint, as when its judge
stopped it, its stage record's, judged against the corpus files that stage
record captured. When the corpus under test
cannot judge the run, such as when it no longer holds a stage's skill, every
entry is served without a state rather than failing the response. It is unavailable when the stage recorded neither or its checkpoint
predates read manifests. As artifacts out it lists its declared artifact, the
workflow-state files it added, modified or removed against the checkpoint it
continued from, and the commit subjects and changed paths its record carries.
As `artifactsIn` it lists what its session started from: the task card the run
seeded, by the task id its manifest records, the target at the checkpoint
before it, which for the first stage is the initial checkpoint, with that
checkpoint's short id, and each workflow-state file an earlier stage added or
modified, once, named by the latest stage that changed it. A file whose latest
change removed it is left out, and an earlier stage's declared artifact is
listed as the workflow-state file it is. An earlier stage whose changes cannot
be read is listed under `artifactsIn.missing` with the reason. The stage's
record also says whether its checkpoint is `recorded` or `missing`, since a
stopped stage saves none.

Each stage also reports its wall time, the elapsed time its record keeps, and
the run reports its own. A stage's elapsed time runs from its stage-started
event to its judge's grade on the run's clock, and the run's from the run's
start to its main artifact or, for a stopped run, to the stop.

A figure the records do not hold reads `{"state": "unavailable", "reasons":
[...]}` rather than zero or an empty list. Wall time is unavailable for a
record that predates it, for a stage still awaiting its judge, and for a stop
whose judge returned no grade. A stopped stage serves the letter it fell to
and the judge's verdict, which the judge sets against a fixed B while the stop
follows the run's minimum grade, both unavailable in a stop record that predates the letter or
whose judge returned none, and an awaiting stage's grade is unavailable until
its judge returns. A stage that wrote no record gives one reason for its
grade, hard blockers, wall time, costs and tokens: the run ended or is running
in it, the run has not reached it, or its record is missing, for a stage
before the one the run ended in or in a run whose outcome names no stage.

A sum over several parts, a stage's or the run's tokens and the run's cost,
lists the parts it lacks under `missing` with a reason for each. A part is
missing when its record holds no calls, when a call has no metrics, as in the
oldest awaiting-judgment records, or when the stage the run ended in wrote no
record at all. A stage's session cost is unavailable when the last call its
record holds has no metrics, since a resumed call's total covers the calls
before it, and a judge's cost is unavailable when any call it paid for has
no metrics, reading a failed Judge's calls before its attempts as its tokens
do. A call without metrics may have reported no cost, which the recorded cost
then leaves out. Either cost then counts as a missing part of the run's cost.
The run's tokens and cost count the Product Owner's calls and cost from the
main artifact once the final judge ran, and otherwise from a stop record,
which holds them up to the stop. A Product Owner never asked made
no calls, so its empty list is summed rather than missing, and so is a stop
record's empty `session.providerCalls` or `judgeProviderCalls`, a session or
Judge the ceiling refused before its first call. A run whose records
predate those readings, that wrote neither record, or whose stop record was
written before a stage's judge returned a grade for a reason other than the
spend ceiling, names the Product Owner as a missing part. The run's cost also lists under `parts` each amount it
summed. When a sum has no part to add, it is unavailable and its reasons name
each missing part. The Product Owner's cost is also served alone as
`productOwnerCost`.

The fields these readings come from are optional, so a record written before
them still parses and reads each as unavailable:

- the run manifest's `minimumGrade`, the letter every stage had to reach, and
  its `corpusVersion`, the version measured when the run started;
- each stage record's and the main artifact's `elapsedMs`, and the main
  artifact's `productOwnerProviderCalls`;
- a stop record's `grade` (letter and verdict), its top-level `hardBlockers`,
  judge `attempts`,
  `minimumGrade`, `elapsedMs`, `runElapsedMs`, `productOwnerCostUsd` and
  `productOwnerProviderCalls`, written when a stage's grade falls below the
  minimum or the spend ceiling stops the stage, and absent otherwise;
- a ceiling stop record's `session`, written when the ceiling stopped the
  stage's session;
- a failed Judge's `judgeProviderCalls`, written on a stage's stop record or a
  failed main artifact whenever the Judge failed after paying, at the ceiling
  or by exhausting its retries, and read for the Judge's tokens in place of
  its attempts, which lack a halted call; a record without it reads them from
  the attempts;
- a replay record's `elapsedMs`, from its stage session's start to its judge's
  grade.

`finalOutcome` is the final judge's recorded result: `JUDGED` with its PASS or
FAIL verdict, `JUDGING_FAILED` with the failure the main artifact records,
`PENDING` with the running stage while the run is live, or `NOT_REACHED` with
the reason the run ended and, where a record names one, the stage it ended in.
That reason comes from the stop record, the run's interrupted or failed event,
or a stage left awaiting judgment once the run is no longer live, in that
order, and a run that recorded none of those says so. The final judge returns no letter, so none is served.

### Judge evidence sources

`/api/runs/<run>/stages/<stage>/evidence/<section>/<item>/<index>` opens the
source a stage judge's evidence item cites, and
`/api/runs/<run>/final/evidence/<item>/<index>` opens one of the final judge's
requirements, implemented in
[evidence-source.ts](../src/server/evidence-source.ts). The section is
`hardBlockers`, `requirements` or `dimensions`, and the index counts the
item's evidence from 0. The answer names the record file relative to the
repository, the cited source, path, claim and quote, and a `view`: `text` with
the recorded text and the quoted span's `start` and `end`, `harness` with the
harness result the locator names, `absent`, or `before-quoted-spans` for an
item recorded before quoted spans. Every text comes from the run's record, so
a path a judge wrote never reaches the filesystem. The stage is matched against
the stage records the run wrote, including the record of a stage whose grade
fell below its minimum, which keeps its judged items beside its status. A
missing item, section, index or stage, including `..` and a name holding a
slash, answers 404, and a run id with a traversing segment answers 400.

The browser opens the same item at `/runs/<run>/stages/<stage>/evidence/...`
and `/runs/<run>/final/evidence/<item>/<index>`, showing the recorded text
read-only with the quoted span marked and scrolled into view. The live
monitor's judge pane links each cited item of a judged stage here.

### Judge progress

A pipeline run's stage judge streams its output, and the run records a
`judge-progress` event when each judge attempt starts, with every count at
zero, and again each time an item of the judge's output closes and passes the
checks one item can face: its id is one of the rubric section's items and not
yet returned, each citation names a supplied source, and each quote is text
that source holds. Checks on the whole output, such as every rubric item
returned exactly once, run only when the attempt ends, so an attempt can count
every item it wrote and still be rejected. The event's `judge` field is
`{state: "returning", attempt, sections, items}`, where `sections` holds
`hardBlockers`, `requirements` and `dimensions`, each as `{returned, total}`
against the rubric, and `items` holds every rubric `hardBlockers` item as
`{id, status}` and every `dimensions` item as `{id, grade}` in rubric order,
with `status` (`PASS` or `FAIL`) or the letter `grade` present once that item
has returned. Progress recorded before `items` existed has none and still
reads as its counts, and a reader built before it drops the key. The other
reading is `{state: "rejected", attempt, reason}` when the whole
output of that attempt failed validation. A stage judge gets two attempts, so
a rejected first attempt is followed by a second that counts again from zero,
and a rejected second attempt ends the stage. A judge call that fails outright,
such as a timeout or a stream that ends without a result, records no rejected
reading. If the model starts its structured output over within one attempt,
the counts return to zero under the same attempt number. The grade and verdict
exist only once an attempt is accepted, in the stage's record rather than in
any event. Each event's `spentUsd` covers the stage's session, as
`stage-judging` does.

`/api/runs/<run>/events` serves these events like any other. While no new event
arrives, it writes an SSE comment line (`: keepalive`) every 500 ms, which
carries no event, so a reader that parses the stream itself must skip it. The
stream ends only after a terminal event, so a reader of a run that died or never
existed closes the connection itself. While a `judge-progress` event is a
running run's latest, its `/api/runs` row's `progress` carries it as `judge`,
and the field is absent otherwise. A stage graded below its minimum records no
event of its own, so while a paused run waits for its calibration review the row
still carries the last reading. A run event store created before this event
existed gains its column on open and keeps its events. Stage replays, replay
confirmation, calibration, pipeline confirmation and the final judge do not
record judge progress.

### Stage judge

`/api/runs/<run>/stages/<stage>/judge` answers one stage's judge as the live
monitor's judge pane reads it, implemented in
[stage-judge.ts](../src/server/stage-judge.ts). Once the stage's record holds
a grade, including the record of a stage that stopped the run below its
minimum, it answers `{state: "judged", hardBlockers, dimensions}` with each
blocker's `status` and each dimension's `grade`, and each item's `evidence`
as `source`, `path`, `claim`, `quote` where the judge quoted, and `place`
where the judge recorded a locator, that locator read as a phrase. A record its judge never graded answers
`not-judged`. Otherwise, including while the stage's record awaits its judge,
a stage with a `stage-judging` event answers `{state: "returning", progress,
spentUsd}` from the run's events, where `progress` is the latest returning
`judge-progress` reading since that event, absent before the first one and
after a rejected attempt until the next attempt reports, and `spentUsd` is
what the run's spend has grown by since judging began, absent where those
events were recorded before run spend was. A stage without that event answers
`waiting`. A stage the run's pipeline does not have answers 404, and a stage
record that does not parse as one fails the request with 500.

### Stage times

`/api/runs/<run>/stage-times`, implemented in
[stage-times.ts](../src/server/stage-times.ts), answers `{stages}` with one
entry per stage of the run's pipeline: `{stage, state: "available", medianMs}`,
the median elapsed time that stage's record kept across the earlier runs of the
same case where the stage was graded, or `{stage, state: "unavailable",
reasons}` when no prior run of the case exists or none recorded a graded time
for that stage. Earlier means the run's name sorts before this one, and run
names are start times, so a run started later never counts. A stop record is
left out, since a ceiling or operator stop keeps the time only up to the stop,
and so is an earlier manifest or stage record that does not parse, which run
history lists among the records it could not read. A run name outside the runs
directory answers 400, and a run with no manifest answers 404.

The live monitor's spend band shows the remaining estimate from it, labelled by
the steps after the running one ("Remaining step 3, at current rate"): the
time is the sum of each unfinished stage's median, the running stage's median
less the time it has run so far and never below zero, and the spend is that
time at the run's burn rate, its run spend divided by its elapsed time as the
latest run event measured them. Between run events the time counts down while
the rate holds. With no estimate it shows a dash and the reason: no prior run,
no graded time for a step, no run spend, no recorded start of the running step,
every step finished while the final judge returns, or the stage times could not
be read. No run event refetches the stage times.

### Stage session

A pipeline stage's `stage-started` event carries `sessionId`, the uuid the
stage's provider session then runs under, chosen before the session starts so
its transcript can be found while it is still being written. A run event store
created before the field gains its column on open, and its older events read
without one. Stage replays, replay confirmation and pipeline confirmation draw
their own session id and record none.

`/api/runs/<run>/stages/<stage>/session`, implemented in
[stage-session.ts](../src/server/stage-session.ts), answers one stage's
session. Once the stage's `<run>.<stage>.json` exists, a record still awaiting
its judge included, it answers `{state: "closed", spans}` with the evidence
the stage judge cites from the session's exchanges (source `transcript`), each
with its section, item, index, claim, quote and, where its evidence locates
it, the exchange from 1 and whether it quotes the agent's `message` or the
`productOwnerAnswer`. A graded record keeps the judged items under its grade,
and the record of the stage that stopped the run keeps them beside it. A
record that holds neither shape fails the request. Where the stage's
checkpoint preserved a transcript, or for a stage that stopped the run its
`<run>.<stage>.session/` copy, the answer adds `lineCount` and
`transcriptPath`, relative to the parent of the runs directory's real path.
The saved stage history at `/runs/<run>/stages/<stage>` reads the same copy
for a stopped stage.
Before the record exists it answers `{state: "running", lineCount, lines,
latestToolCall}` from the provider's own transcript. `lines` are the rows of
its last 200 lines, each with its `line`, a `kind` of `user`, `assistant`,
`tool` or `result`, and its `text`: a message's text, a tool call as its name
and the first of its `file_path`, `command`, `pattern`, `url` or
`description`, or a tool result's first line. Text past 1,000 characters is
cut and ends in `…`. A record the provider marks as meta, such as a loaded
skill body, and a record that is neither a user nor an assistant message show
no row. `latestToolCall` is the last tool call among those rows, absent when
they hold none. Until the provider writes the transcript the answer is
`{state: "running", lineCount: 0, lines: []}`. A stage with no recorded start
answers `{state: "not-started"}`, and one started before session ids were
recorded answers `{state: "untracked"}`. The request names a run and a stage
only. The server rebuilds the transcript path from the run manifest's source
root and the recorded session id. It answers 400 for a malformed run or stage
name, a recorded id that is not a uuid, a symlinked transcript, or a
transcript whose real path leaves the provider's projects directory, and 404
for a stage the run's pipeline does not have or a missing projects directory.
A stage record that is not valid JSON, such as one read while it is being
written, answers 500.

`/api/runs/<run>/stages/<stage>/attempts`, implemented in
[stage-attempts.ts](../src/server/stage-attempts.ts), answers the attempts at
the checkpoint the stage started from: the previous stage's, or the run's
initial checkpoint for the first stage. It answers `{checkpoint, attempts}`,
`checkpoint` being that checkpoint's short id or else its Record ID. The
attempts are in claim order. The original run counts when it recorded a
checkpoint or a grade for the stage, a stop below the minimum included, and
carries its short id and staleness, its grade and corpus version being the
run record's. A stage replay and a stage-mode confirmation rep from that
checkpoint each carry their id, grade, corpus version and staleness, a rep
named `<group short id> rep <n>`. Staleness is judged as run history judges
it, and the original attempt at a stage that stopped the run is judged under
the run's own id. It answers 404 for a stage the run's pipeline does not have.

### Run history figures

Every `/api/runs` row carries `cost` and `wallTime`, and a figure its records
do not hold reads unavailable with its reasons, never zero. A session attempt
or confirmation group row carries `startedAt`, the start time its record kept,
and leaves it undefined for a record written before the field existed. Rows
come newest first by that time, a run's name or a replay's timestamp, and the
rest follow in listing order. A cost that is
available has the same shape as the pipeline run record's run cost: `usd`, the
`parts` it summed and the parts it lacks under `missing`.

A pipeline run row reads its figures through the pipeline run record above.
`stageGrades` lists each stage in the manifest's order with its status and
grade. A stage with no record is `not-run` when it comes after the stage the
run ended or is running in, and keeps `no-record` otherwise, since a run that
finished reached every stage. The design labels these the step grades and the task
grade, and those names stay in the client.
`finalOutcome` is the run record's `finalOutcome`, and `cost` and `wallTime` are the
run's totals. A run that wrote no manifest, or one of whose stage records does
not parse, keeps its row with those four figures, its `minimumGrade` and its
`firedBlockers` unavailable and the reason,
where the pipeline run record's route answers 404 or 500 for the same run. A
main record that does not parse still moves the run to `unreadable`.

A replay row sums its session, Product Owner and judge cost and lacks no part.
Its `finalOutcome` is `NOT_APPLICABLE` with the reason, since only a whole run
reaches the final judge, and its wall time is the elapsed time its record
keeps, unavailable in a replay record that predates it. A session attempt
row's cost is its call metrics' cost, unavailable when the attempt kept none,
and its wall time is the elapsed time it recorded. A confirmation group row's
wall time is its makespan.
Its cost sums a session group's preflight call and each rep's recorded calls,
named by rep id. A rep whose record is absent or does not parse, or whose
metrics are incomplete, is named under `missing`, and under `reasons` when no
part recorded any spend.

The step grades column places each grade among its pipeline's stages, so the
rows that do not carry `stageGrades` carry the stage order or count it needs. A
replay row's `pipelineStages` lists the source run's stages in its manifest's
order, and is unavailable with the reason when that manifest is gone or does
not list the stage replayed. A session attempt row's `checks` count how many of
the checks the attempt ran `passed` of the `declared` it recorded, and are
unavailable with the reason when it ran none: the session gave no reply, or
failed to run. The failed session's error is left out of that reason, since it
can carry the whole command line and the provider's reply, and
`show attempt:session:<case>/<uuid>` reads it from the attempt record.

Every row carries `corpusVersion`, the version its record measured, absent
when the record predates versions. A pipeline run row shows the version of its
latest stage that recorded one, from the stage's checkpoint or, when it saved
none, its stop record. Until a stage has recorded one, including a run stopped
or failed in its first stage session, the row shows the version the run's
manifest recorded at its start. The row sets `corpusChangedDuringRun` when its
stages measured more than one version, and the start version does not count
toward that, since no stage ran against it alone. A refusal counts toward
neither. A session attempt row and a replay row show
their own record's version, and a confirmation group row shows the version its
inputs froze.

Every row also carries `staleness`, the judgment `stale` makes of the same
record against the corpus the server serves: `stale`, its `causes`, its
`changedFiles`, each a `path` with a `change` of `changed`, `added` or
`removed`, its `distance`, `onlyCorpusFiles`, and `readManifest`, the
record's read manifest with a `state` of `unchanged` or `changed` on each
corpus and judge rubric entry that recorded a hash. A project entry carries no
state, since the target repository is not under test, and neither does a corpus
entry when the corpus under test refuses to be read. The list is empty for a
record written before read manifests, a confirmation group whose reps recorded
none, and a run row judged at its initial checkpoint. A pipeline run row is judged at its stopped
stage when that stage is judged, otherwise at its latest checkpoint, or at its
initial checkpoint when it saved no stage, and has no judgment when its stopped
stage cannot be read. Each row is
judged with the model and effort its record ran with, since the history
compares a record against the corpus rather than against a replay about to
run. A record the staleness report names unreadable, or never reaches, such as
a run that wrote no manifest or a session attempt of a case no longer declared,
has `staleness` unavailable with its reason rather than clear. The run history
screen's corpus column shows `✓ clean` for a record at distance 0 with no
cause. `onlyCorpusFiles` is true when changed corpus files the record read are
its own only causes, and any upstream stage it follows went stale from changed
corpus files alone, so one edit to a file every stage reads keeps its wording
through the chain. Then the column shows
`⚠ stale · corpus changed since` at distance 1 and
`⚠ superseded · N versions back` at 2 or more. Any other judgment shows the
stale or clear badge with its causes.

A confirmation group row merges the reads of all its reps into one list.
`/api/groups/<group>/reads` keeps them apart. Its `reps` holds one entry for
each rep and stage that recorded reads, with its `repId`, its `stage`, which a
session rep leaves out, and its `readManifest`, judged the same way where the
group can be judged. The reads are listed whether or not they can be judged.
`reasons` names each rep stage whose file does not parse, which leaves only
that rep stage out, and why the rest carry no state: a session case no longer
declared, a stage or pipeline group that froze no pipeline or whose frozen
pipeline is missing, or a stage the group froze no corpus for. `reasons` is
empty when every entry was judged. An id that names no group is refused with
404 and one that escapes the records directory with 400.

`show group:<id>` prints the same reads as a table after the group's cost,
with the first 12 characters of each file's hash, judged against the linked
corpus as `stale` judges by default. A line under the table names that
corpus, because the states follow the corpus as it is when `show` runs and
the rest of the summary follows the record alone. Each reason prints on its
own line. A live install that does not resolve lists the reads with no state
and names why. A group whose reps recorded no read, which includes every
group written before read manifests, prints `No rep recorded a read.` A
single rep's raw file prints through `show rep:stage:...` or
`show rep:session:...`, with its full hashes and no state.

A confirmation group row accounts for every rep. `stageSummaries` has one entry
per declared stage with the `graded` count, the `ungraded` reps counted under
their recorded status, and `grades`: the `lowest`, the `highest` and the
`median`. On an even count the median is the lower of the two middle grades, so
it is always a grade some rep received. `finalOutcomes` counts the reps by the
final judge's verdict, or by their status where it did not judge. `successful`
counts the successful reps of the `reps` requested, and `unreadReps` names each
rep whose record is absent or does not parse, with the reason, so one damaged
rep never hides the row. A session group's `checks` summary counts its reps but
serves no letter, since its reps pass or fail on checks and no judge grades
them, and its `finalOutcomes` are all `NOT_APPLICABLE`. A pipeline group's
`pipelineStages` are its declared stages. A stage group's come from the
pipeline its inputs froze, and are unavailable with the reason when it froze
none, when that file is missing or does not parse, or when it does not list
the stage. A session group runs no pipeline, so its `pipelineStages` are
unavailable.

A run, replay or group row's `firedBlockers` lists, once each, the id of every
hard blocker its stage judges found fired, which the run history's search
matches. A run's come from its stage records, the stop record of the stage
that stopped it included, a replay's from its stage
grade, and a group's from each rep's stage record rather than its judge
attempts, whose payload a retried attempt can leave disagreeing with the grade
the rep kept. The list is unavailable with the reason when no stage record
holds graded hard blockers or the run's record cannot be read, a group's is unavailable naming each rep stage
record that does not parse, since that record could hold a fired blocker, and
a session group's always is, since checks grade its reps.

### Saved session context history

The local browser can inspect standalone session attempts at
`/attempts/session/<case>/<uuid>`, confirmation attempts at
`/groups/<group>/reps/<rep>/attempt`, pipeline stages at
`/runs/<run>/stages/<stage>`, and stage replays at
`/replays/<lineage>/<timestamp>`. Their JSON summaries are
`/api/attempts/session/<case>/<uuid>/history`,
`/api/groups/<group>/reps/<rep>/attempt/history`, and
`/api/runs/<run>/stages/<stage>/history`; appending
`/<line>:<block>` to any of those API paths returns the selected event detail.
Each locator is the saved transcript's one-based physical line and content
block.

The run history screen and these pages name a record by its short id where
`/api/runs` names it, keeping beneath it the name the record is filed under:
the run name, the attempt id, the replay's timestamp or, on the run history
screen, the group id. A stage page also names its checkpoint, and a replay page
the run and checkpoint it started from and its attempt, by short id. A session-mode rep's page shows
its attempt within its group, such as `attempt 2 of 2 of <case>/g1`. A
stage-mode rep has no page, so its attempt appears only in `/api/runs`. The
page URLs and history APIs above take no short id.

`/api/replays/<lineage>/<timestamp>/history` reports a replay under the same
stage identity. A replay keeps no raw transcript, so the report is always
evidence-unavailable and carries no event detail path. Its browser page shows
that summary and says it serves no per-event detail, and it asks for no request
series or corpus reconciliation. It reads the source run's manifest, so a replay
whose source run manifest is gone has no page, and run history names that
instead of linking it.

A stage report names its run, stage and lineage where an attempt report names a
case and attempt id, because a checkpoint records no attempt id and no outcome.
A stage the run stopped on wrote no checkpoint, so its report names the run and
the stage without a lineage, and names why the stage stopped instead.
A stage session resumes no earlier session, so its whole transcript is its own
region and Starting context is empty. A stage has no per-request token and cost
timeline: those readings come from a session attempt record, which a checkpoint
is not.

`/api/runs/<run>/stages/<stage>/history/corpus` reconciles the declared corpus
files the stage recorded, in whichever of its three records exists, against the
reads its transcript shows, keyed on the corpus layout path. Each entry reads observed with its locator, no observation
recorded, or undeclared for an observed corpus read the declaration omits.
Hashing a file does not establish when its contents entered context, so no
entry reads as loaded on the strength of its hash, and no observation recorded
is not a claim of absence. A stage whose report is evidence-unavailable has no
reads to reconcile against, so every declared file reads no observation
recorded. No checkpoint written so far carries a transcript, and neither a
stopped stage nor a stage awaiting judgment records one at all, so that is what
the reconciliation shows for every stage currently on disk.

Missing raw evidence names the fact that produced it rather than one wording
for all of them. A checkpoint recording transcript status UNAVAILABLE reads as
the provider having written no transcript for the stage session; a checkpoint
with no transcript field reads as no capture having been recorded; a checkpoint
recording AVAILABLE whose file is no longer beside it says so rather than
refusing the whole report.

A replay reports through the API route above. It writes one flat record with no
transcript field and removes the worktree whose name locates the provider's copy,
so the record resolves and reports that a replay retains no raw transcript. Its
scorecard holds parsed exchanges; those stay out of the event ledger, since a
parsed exchange is not the raw evidence the report is about.

One cause reports without a checkpoint. A stage that stopped on its grade wrote
none, since the grade assertion precedes the checkpoint write. It does leave a
`<run>.<stage>.json` stop record, and `show run:<name>` prints that record's
reason. The report reads that record when the checkpoint directory is absent and
names the case, the run, the stage, the model, why the stage stopped and the
corpus files the stage declared, with its evidence unavailable. It shows no lineage, because the record carries none: a lineage is a
hash of the inputs rather than a stored field, two of which no stop record holds,
so any lineage shown would be minted here and indistinguishable from a recorded
one.

A second cause reports without a checkpoint. A run interrupted between a stage's
session finishing and its judging completing leaves that stage's
`<run>.<stage>.json` holding the Judge's pending input under
`AWAITING_STAGE_JUDGE`, which nothing overwrote. The report reads that record
too, and names the case, the run, the stage and the model with its evidence
unavailable, giving that judging never completed as the reason. It carries no
lineage and no stop reason, because the record holds neither, and it does not
describe the stage as stopped: nothing judged it and nothing failed. The parsed
exchanges the record's input holds stay out of every event ledger, the same
substitution the unavailable state prevents for a replay.

A stage with none of those records still answers 404, which is what separates a
stage the reader can name from a page that failed. The run history screen shows
a stopped run as `STOPPED:<stage>`, linked to that stage's context history, and
links every other stage whose page renders. A run with no artifact shows
`PAUSED:<stage>` or `OPERATOR_STOPPED` from its files, and otherwise takes its
status from its event stream and shows as `INTERRUPTED` or `FAILED`. A run the
server did not see end becomes `INTERRUPTED` when the next server start
reconciles it, and stays out of the list until then. When a failed run's last
started stage saved no checkpoint, the row names that stage as having failed
before saving its context. A failed run whose events name no started stage
names no stage.

The summary separates inherited Starting context from Attempt events when the
attempt record retains its transcript cut. Older records without a cut use the
Boundary unknown region: their rows and content stay selectable, while
inherited, attempt-activity, delivery, and repeat counts remain unavailable.
Read result text is the observed delivery. A structured Read file body is a
separate source snapshot and is not added to the delivery measurement. Text
sizes count Unicode code points, not tokens. Source rows keep failed, partial,
missing-result, and unavailable occurrence counts separate and deduplicate
repeated evidence reasons.

Selected detail contains at most 65,536 UTF-8 bytes across the delivery and
snapshot excerpts. It cuts only at a Unicode boundary and marks an omitted
suffix as application-truncated. The saved transcript remains the full-body
record. Summary reads stream the transcript while retaining body-free event
metadata; detail reopens the verified file and retains only the selected
physical line. The reader does not trust the attempt record's absolute
transcript path or any path observed inside a Read. It rejects traversal,
symbolic links, non-regular evidence files, detected path or inode replacement
during open verification, and paths outside the real run directory.

Session comparison pages, for every report version that records attempt
evidence, link to a rep's history only after the server verifies the recorded
group, rep, and attempt paths, ownership, and all three SHA-256 digests. Failed provenance validation appears as stale provenance
without a navigable link; a valid failed experiment remains inspectable.
A comparison records those paths relative to its manifest. A path that names
the runs directory resolves from after its last occurrence of that name, which
covers a manifest outside the runs directory. A manifest in a subdirectory of the
runs directory records paths that begin with `../`; the server drops those
leading segments and resolves the rest from the runs directory. A `..` after
the first other segment is refused. A report does not record where its manifest
was, so a manifest kept inside the `confirmations` directory, where every
directory is read as a confirmation run, records paths that resolve nowhere,
and its reps read as stale provenance.

## Comparison manifests

`compare` requires baseline, candidate, and minimal-corpus control arms for
every case. A pipeline comparison needs at least two distinct cases. A stage
comparison may name one checkpoint replayed in each arm, and a session comparison
may name one case. Either one-case report estimates uncertainty over that case's
reps rather than across cases. Each path names a completed stage, pipeline, or
session confirmation `group.json` and resolves relative to the manifest. Session
groups must carry one frozen case declaration, their recorded attempt evidence,
and a corpus inventory matching that declaration, where a declared skill also
brings the other files of its directory, as the attempt installed them. The
control corpus may be empty for a session case. The control corpus is supplied
by the operator. For example:

```json
{
	"schemaVersion": 1,
	"cases": [
		{
			"caseId": "case-1",
			"arms": {
				"baseline": "groups/case-1-baseline/group.json",
				"candidate": "groups/case-1-candidate/group.json",
				"control": "groups/case-1-control/group.json"
			}
		},
		{
			"caseId": "case-2",
			"arms": {
				"baseline": "groups/case-2-baseline/group.json",
				"candidate": "groups/case-2-candidate/group.json",
				"control": "groups/case-2-control/group.json"
			}
		}
	]
}
```

An arm may also name a non-empty list of `group.json` paths, which the loader
reads as one arm with their reps in the order named. It refuses a group named
twice and a later group whose mode, declared stages, controlled inputs or
executed corpus differ from the first's.

The loader checks schemas, frozen-file hashes, rep records, controlled inputs,
mode/stage consistency, and corpus identity across cases before writing a
report. Within a case the arms must preserve the controlled experiment inputs,
including model, effort, budget, and non-corpus evidence. A changed corpus is
the treatment. Session checks are read from the recorded attempt and must agree
with the frozen case declaration; no final-outcome row is synthesized. Debug
attempts cannot substitute for confirmation groups.

`compare attempts --arm-a <group-id> --arm-b <group-id>` compares two stage
confirmation groups replayed at one checkpoint without a hand-written manifest
or control corpus. Arm A takes the baseline role and arm B the candidate role.
Before any rep runs it refuses a group with no `group.json`, one of another
shape or whose corpus version the store does not hold, arms replayed at
different checkpoints, groups that are not stage groups or record no corpus
version, arms whose controlled inputs differ, and corpora that are identical,
differ in more than one unit, or differ in a unit that is not a skill, naming
the units. A comparison whose arms differ in something other than one skill
needs a manifest-supplied control. It also refuses when the replayed stage never
read the skill under test, since a stage replay freezes only its stage's own
skill and all three arms would read the same files. Past those checks the command writes arm A's recorded
corpus without the skill under test to `baseline-corpora/<corpus-digest>/`, or
arm A's corpus unchanged when the skill is new in arm B, and replays the
checkpoint on it with `--confirm --without-stage-skill` and arm A's model,
effort, Judge, session budget and reps. `--without-stage-skill` freezes the
stage's corpus without its own skill and refuses a corpus that still holds it;
the session's prompt is unchanged and still names the stage's skill, so the
arms differ only in whether the skill is installed. It is accepted only with
`--confirm`. The group it records takes the control role, which the design
calls the baseline arm. A skill new in arm B needs an arm A that was itself
replayed with `--without-stage-skill`, since a plain replay installs the
stage's own skill. Its
replay meets the spend ceiling, model probe and cost approval of any replay,
`--yes` answers the approval, and the replay's own output goes to stderr. Before
the model probe the command refuses a stage rubric that changed since arm A was
recorded, since the baseline would be graded on a rubric arm A was not. A replay
that would resolve a knob, such as a Judge effort, to a value arm A did not
record is refused before the model probe too, and so is a skill under test
that is not the stage's own skill in the run's pipeline, the only skill the
replay can remove. The command then writes the manifest to
`comparison-manifests/<control-group-id>.json`, loads the evidence as
`compare` does, writes `baseline.json` and then the report into the report's
directory, and prints the report's path. Evidence the loader refuses, for
example a control group that recorded another model, leaves no report
directory. `baseline.json` records how the control group's corpus was made: `kind` `derived` or
`armA`, `skillUnderTest`, `arms` naming each role's groups as a list of group
ids (`baseline` is arm A and `control` the groups the command ran),
`controlCorpus`, the digest naming that group's corpus directory, and for an
extension `extends`, the digest of the comparison it extends. It is schema
version 3. Version 1 records called `controlCorpus` `baselineCorpus`, and
versions 1 and 2 name one group id per role; both are still read, as one-group
lists.

`compare extend --comparison <comparison:digest> --attempts <n>` adds n
attempts to every arm of a comparison `compare attempts` saved. It prints what
they cost, n times the sum of each arm's mean recorded cost per attempt, and
asks once; `--yes` answers instead, and `--approved-in-browser` records the
approval as the browser's. Each new group records its approval as `yes` even
when the prompt was answered, since the replays run after the one answer.
Before asking it refuses fewer than 2 attempts, a digest with no saved
comparison, a comparison with no `baseline.json` (a manifest-supplied one
records neither the checkpoint nor the corpora its arms would replay), an
unreadable `baseline.json`, a cost it cannot state because an arm recorded no
cost for some attempt, and every refusal `compare attempts` makes of arm A's
recorded group: a stage rubric changed since arm A was recorded or unreadable,
a stage the run no longer has, a skill under test that is not the stage's own,
and an arm group that is missing, unreadable, or records no checkpoint or
corpus version. Once approved it replays one group of n reps per arm at the
checkpoint arm A replayed, under arm A's model, effort, Judge and budget: arm A
on its recorded corpus, arm B on its recorded corpus, and the baseline arm on
arm A's corpus without the skill under test, derived again, with
`--without-stage-skill`. Each replay meets the spend ceiling and model probe of
any replay. It then writes a manifest whose arms list each role's earlier
groups and the new one, and a new comparison with `extends` naming the one it
extends, which is kept unchanged. A replay that fails part way leaves the
earlier arms' new groups recorded with no comparison naming them.

Statistics are recomputed from rep evidence, rather than copied from existing
confirmation reports. The output at `comparisons/<manifest-sha256>/report.json`
contains quality/resource contrasts for candidate minus baseline, candidate
minus control, and baseline minus control, with Judge agreement context. New
stage, pipeline, and session reports use schema version 6, whose arm source
lists the arm's groups and numbers each rep by its ordinal within the arm and
the index of the group it came from. Each source
repetition retains an ordered outcome for every quality measure, including its
judged grade and metrics-aware success value or its non-judged status. Pipeline
outcomes append `final` after the declared stages. Session source repetitions
also retain their attempt path and hash and carry an empty Judge-agreement
baseline. Readers continue to accept strict version-1 through version-5 reports
without adding outcomes or measurements that those records never contained.
`compare --json` prints the report bytes without starting provider sessions.
Each current source repetition also records the word count of its output: a
session repetition's reply, or for a stage or pipeline repetition the output
of its last declared stage: that stage's artifact, or the worker's final reply
where the stage wrote none, as a delivery stage does. A repetition the judge
stopped before its last declared stage, or with no such output, records
`unavailable` with its reason, so an arm's average never mixes an earlier
stage's output in. A stage or pipeline repetition records, per judged stage, which hard
blockers fired and each dimension's letter, read at compare time from the stage
scorecard its evidence names; the scorecard's path and hash join the report's
provenance, and a missing or malformed scorecard stops `compare` with its field
named. Reports written before these fields read unavailable.

`GET /api/comparisons/<digest>` serves, beside the report and its attribution,
`qualityReadings`, `armFigures` (each arm's median and range with `graded`, the
count of graded attempts, on a letter measure, or `successful` of `attempts` on
a pass/fail one, with cost and average words) and `whatMoved`: per case,
ordered rows for the overall measure, each hard blocker's firings, each
dimension's letter span, reply length and cost per attempt. A blocker row reads
each arm's 95% Wilson interval on its firing rate and names the arm that fires
less when the intervals separate; a meter row gives each arm's mean and
low-to-high range over its attempts, the signed percent change of the means,
and names the higher arm only when the ranges do not overlap and full
separation has at most a 5% two-sided chance under rerun noise, 2 / C(n + m, n)
for n and m attempts, which takes about four attempts an arm. A row where
either arm recorded nothing reads verdict `unavailable`, where a meter row's
verdict carries `reasons`, the reasons either arm recorded nothing, and so does
a quality reading in `qualityReadings` where either arm reached no grade. A report
without recorded grading serves no blocker or dimension rows. Every letter span
and rate interval reads from the bottom of its own scale to the top, `low` the
worse letter and the lower percent. `baselineArm` says where the report's
baseline arm came from: `derived` or `armA` with `skillUnderTest` when
`compare attempts` made it, `supplied` when the report has no `baseline.json`
and the manifest's author supplied the control, and `unreadable` with its
`reason` when that file does not parse, in which case the report is still
served.

`checkpoint` names the `run` and `stage` every arm of a stage comparison
replayed, read from each group's short-id claim, with its `shortId` once that
run holds one. It reads `unavailable` with its reasons for a session or
pipeline comparison, when the arms replayed more than one checkpoint, when a
group's claim names none, or when a group record or the case's short ids
cannot be read. `corpusVersions` gives, per case and arm, the `digest` of the
corpus version every group of the arm ran, or `unavailable` with the reason:
`version not recorded` for groups written before versions, the arm's distinct
readings when its groups ran more than one, or the group record that could not
be read. A record that cannot be read costs only these fields, never the
comparison. `attempts` lists,
per case and arm, each recorded attempt in the order the arm recorded it, with
its rep id, ordinal, stage outcomes, the hard blockers that fired and its words;
a field a report never recorded reads `unavailable` with its reason. Attempts
carry no pair index or seed, since nothing recorded ties one arm's attempt to
another's, so ordinal 1 of two arms is not a pair. `summary` gives, per case,
arm B against arm A, arm A against the baseline arm and arm B against the
baseline arm on every overall measure, each as its quality reading's verdict
beside how many combinations of one attempt from each arm come out higher,
equal and lower (a pass/fail measure counts every attempt; a graded one counts
only graded attempts, and reads `unavailable` when an arm has none); the reply-length change from arm A to arm B with its
meter reading; and `moreAttempts`, what as many attempts again as arm A holds
would cost in every arm, or `unavailable` naming each attempt with no recorded
cost. The facts to read the summary with care are the response's other fields:
`attempts` for how many attempts each arm holds, each arm's `executedCorpus`,
`baselineArm`, and the arm B against arm A attribution.

`GET /api/comparisons/<digest>/arm-diff` serves, per case, each file that
differs between arms A and B, by its corpus-layout `path`, with the text arm A
ran under `baseline` and the text arm B ran under `candidate`, the harness roles
of those arms: `available` with its `text`, read as UTF-8 from the copy one of
the arm's groups froze under `inputs/corpus/` and checked against the digest the
report recorded; `absent` when that arm ran no such file; or `unavailable` with
its `reasons` when the frozen copy is missing, unreadable, no longer matches
that digest, or is not UTF-8 text. A case whose arms ran identical corpora
lists no file. A digest with no recorded comparison answers 404, as
`GET /api/comparisons/<digest>` does.

Session resource values are per-repetition worker metrics; group preflight cost
remains at confirmation-group level, and unavailable metrics stay visible as
unavailable.

Each arm's resources carry its attempt elapsed time as the per-repetition
observations and their mean, beside cost and tokens, so a variant that got
slower at the same spend stays visible. The single-case summary prints that
delta beside the cost delta, labelled per-attempt. Version-4 and older reports
carry no elapsed measurement, and their elapsed column reads `unavailable`
rather than zero. Group makespan and provider duration are separate quantities
that comparison reports do not carry; see [the glossary](../GLOSSARY.md).
