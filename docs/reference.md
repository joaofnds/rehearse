# CLI and harness reference

This reference describes the implemented command and evidence contracts. Start
with the [runbook](runbook.md) for setup and a first run, the [project status](status.md)
for remaining gaps, and the [glossary](../GLOSSARY.md) for domain terms.

## Execution modes

| Request                               | Unit of work                                              | Execution directory                 | Result                               |
| ------------------------------------- | --------------------------------------------------------- | ----------------------------------- | ------------------------------------ |
| `run --case <pipeline-case>`          | Whole workflow                                            | The target's `main` checkout        | Run artifact or stopped-stage record |
| `run --case <session-case>`           | One Claude session                                        | A fresh temporary attempt directory | Session attempt record               |
| `replay --run <name> --stage <stage>` | One pipeline stage                                        | A fresh target worktree             | Replay record                        |
| Pipeline `run --confirm`              | Repeated whole workflows                                  | Separate target worktrees           | Confirmation group and report        |
| Session `run --confirm`               | Repeated sessions                                         | Separate attempt directories        | Confirmation group and report        |
| `replay --confirm`                    | Repeated stage executions                                 | Separate target worktrees           | Confirmation group and report        |
| `compare <manifest>`                  | Completed stage/pipeline or session confirmation evidence | No execution directory              | Comparison report                    |

A debug attempt helps inspect behavior. Confirmation repeats a frozen input set
and reports reliability and resource use. Comparison consumes existing evidence;
it does not launch agents. Session comparisons use recorded checks and worker
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
`dot-git` that is a file rather than a directory is refused too. See
`cases/history-probe` for a worked example.

| Check               | Behavior                                                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `word-band`         | Count reply words against optional `min` and `max`                                                                                                                                                                                        |
| `forbidden-text`    | Fail for declared strings present in the reply                                                                                                                                                                                            |
| `forbidden-pattern` | Fail when the reply matches any of `patterns`, each a `name`, an ECMAScript `regex`, and optional `flags`; a pattern the engine refuses to compile refuses the case, and the failure names each matching pattern with the text it matched |
| `tool-calls`        | Check transcript tool-call count and optional allowed names                                                                                                                                                                               |
| `files-read`        | Require declared paths in transcript `Read` calls                                                                                                                                                                                         |

Checks measure only what the declaration asks. A passing tool-call ceiling does
not establish implementation correctness. A session that returns no reply at a
turn or budget limit records `NO_REPLY` without evaluating checks, since the
reply checks would read a reply that does not exist. Confirmation counts that rep as
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
for a command line lives inside the fixture, where the fixture digest covers it,
and the fixture's `dot-git/info/exclude` should name it: a scorer sitting in the
tree it grades is otherwise an untracked entry that fails every cleanliness
grade. Use that file rather than a `.gitignore`, which would also hide the
scorer from the repository that ships the case, so a clone would receive a case
declaring a scorer with no scorer beside it. Before the command runs, the case's
own copy of every path it names is laid back over the restore, so a session that
rewrites the scorer is still graded by the case's bytes. See `cases/state-probe`
for a worked example.

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

Absent `--corpus`, the live source permits files under `~/.claude` and one
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
evidence. Checkpoints written before this carry no transcript field and remain
readable. Replay materializes the upstream state for the
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
accepted stage. Optional model/effort flags assert those intended replay
settings as well. A session case with no prior attempt has no stale measurement.
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

| ID accepted by `show`                 | Record location under the records directory                 |
| ------------------------------------- | ----------------------------------------------------------- |
| `case:<id>`                           | Declaration is outside run state, at `cases/<id>/case.json` |
| `run:<name>`                          | `<name>.json`, or the stopped-stage record                  |
| `checkpoint:<run>/<stage>`            | `<run>.checkpoints/<stage>/checkpoint.json`                 |
| `attempt:stage:<lineage>/<timestamp>` | `replays/<lineage>/<timestamp>.json`                        |
| `attempt:session:<case>/<uuid>`       | `sessions/<case>/<uuid>/attempt.json`                       |
| `group:<group-id>`                    | `confirmations/<group-id>/group.json`                       |
| `comparison:<digest>`                 | `comparisons/<digest>/report.json`                          |

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
of a group whose claim names no checkpoint, has no attempt. A registry that cannot be read leaves every row
without a short id and adds a `short-ids` entry to the response's unreadable
records rather than failing it.

`list cases|runs|checkpoints|attempts|groups|comparisons` prints IDs usable by
`show`. For runs, checkpoints, attempts and groups the second column is the
short id, or `-` for a record its case's registry does not name; cases and
comparisons have no short id column. `list` only reads registries, so a case no command
has claimed in prints `-` throughout. `stale` prints a
checkpoint's short id the same way. Empty history is valid on a fresh clone. A malformed record is reported
without hiding readable neighbors. Stopped runs are visible through the same
commands as completed runs. `list attempts` validates attempt diagnostics, and
`show attempt:session:<case>/<uuid> --json` exposes the recorded projection. An
attempt that preserved state evidence writes it to `state/` beside that
`attempt.json`, with the session's `.git` stored as `dot-git`.

Confirmation groups retain frozen inputs, rep records, and `report.json` beside
`group.json`. Reps run concurrently in separate directories. Reports include
outcomes, success rates and uncertainty, pass^k, and resource distributions;
a failed or stopped rep remains part of that evidence. Session reports also
record the model probe and missing provider metrics explicitly.

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
before each stage session, a replay and a session attempt before their
session, and a confirmation group once when it freezes its inputs, so every rep
carries the group's version. The measurement lands in the record as
`corpusVersion`, either `{kind: "version", digest}` or `{kind: "refused",
refusal}` when the layout refused hashing: on a stage checkpoint, a replay
record, a session attempt record and a group's `inputs`. A record written
before versions were measured has no field, which readers report as version
not recorded.

Measuring keeps the version under `corpus-versions/` in the records directory:
`blobs/<sha256>` holds each file body once, `versions/<digest>.json` lists the
version's files, and `logs/<source>/<n>` numbers the versions one source was
measured at, where `<source>` is a hash of the source's resolved root. An entry
is added only when the measured version differs from the source's latest one,
so repeated or concurrent measurements of an unchanged tree add nothing. The
store copies instruction files, so a records directory inside the repository
other than `.benchmark-runs/` leaves them where git can see them.

`corpus versions [--corpus <dir>]` lists a source's log, oldest first, with
each entry's position, label and digest. `corpus show <version>` prints a
version's files, and `--file <layout-path>` prints one file as that version
held it. A version is named by its label or any prefix of its digest, with or
without `corpus@`, and a prefix matching several recorded versions is refused
with exit code 3 naming each of them. The server serves the same reads:
`/api/corpus/versions` lists the live source's log as `{position, label,
digest}` entries, `/api/corpus/versions/<version>` answers `{digest, label,
files}`, and `/api/corpus/versions/<version>/file?path=<layout-path>` answers
the file's text. A version no record holds, or a file the version does not
hold, answers 404, and an ambiguous prefix answers 409 with its `candidates`.
`/api/corpus` names the live tree by its full version `digest`, computed
without writing to the store, and omits it when any entry refused hashing.

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

Each stage, in the manifest's order, reports its status (`graded`, `stopped`,
`awaiting-judgment` or `no-record`), its grade as the letter and the judge's
verdict, its checkpoint's short id, its session and judge cost, and its tokens
as input, cache read, cache write, output and total input, summed over its
session calls and judge attempts. Its instruction files are the corpus files
its checkpoint records, or its stop record's when it saved no checkpoint, each
with its sha256 digest. As artifacts out it lists its declared artifact, the
workflow-state files it added, modified or removed against the checkpoint it
continued from, and the commit subjects and changed paths its record carries.
It says whether its checkpoint is `recorded` or `missing`, since a stopped
stage saves none.

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
its judge returns.

A sum over several parts, a stage's or the run's tokens and the run's cost,
lists the parts it lacks under `missing` with a reason for each. A part is
missing when its record holds no calls, when a call has no metrics, as in the
oldest awaiting-judgment records, or when the stage the run ended in wrote no
record at all. The run's tokens and cost count the Product Owner's calls and
cost from the main artifact once the final judge ran, and otherwise from a
stop record, which holds them up to the stop. A Product Owner never asked made
no calls, so its empty list is summed rather than missing. A run whose records
predate those readings, that wrote neither record, or whose stop record was
written before a stage's judge returned a grade, names the Product Owner as a
missing part. The run's cost also lists under `parts` each amount it
summed. When a sum has no part to add, it is unavailable and its reasons name
each missing part. The Product Owner's cost is also served alone as
`productOwnerCost`.

The fields these readings come from are optional, so a record written before
them still parses and reads each as unavailable:

- the run manifest's `minimumGrade`, the letter every stage had to reach;
- each stage record's and the main artifact's `elapsedMs`, and the main
  artifact's `productOwnerProviderCalls`;
- a stop record's `grade` (letter and verdict), judge `attempts`,
  `minimumGrade`, `elapsedMs`, `runElapsedMs`, `productOwnerCostUsd` and
  `productOwnerProviderCalls`, written when a stage's grade falls below the
  minimum and absent when its judge returned no grade;
- a replay record's `elapsedMs`, from its stage session's start to its judge's
  grade.

`finalOutcome` is the final judge's recorded result: `JUDGED` with its PASS or
FAIL verdict, `JUDGING_FAILED` with the failure the main artifact records,
`PENDING` with the running stage while the run is live, or `NOT_REACHED` with
the reason the run ended and, where a record names one, the stage it ended in.
That reason comes from the stop record, the run's interrupted or failed event,
or a stage left awaiting judgment once the run is no longer live, in that
order, and a run that recorded none of those says so. The final judge returns no letter, so none is served.

### Run history figures

Every `/api/runs` row carries `cost` and `wallTime`, and a figure its records
do not hold reads unavailable with its reasons, never zero. A cost that is
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
not parse, keeps its row with those four figures unavailable and the reason,
where the pipeline run record's route answers 404 or 500 for the same run. A
main record that does not parse still moves the run to `unreadable`.

A replay row sums its session, Product Owner and judge cost and lacks no part.
Its `finalOutcome` is `NOT_APPLICABLE` with the reason, since only a whole run
reaches the final judge, and its wall time is the elapsed time its record
keeps, unavailable in a replay record that predates it. A session attempt row's cost is its call
metrics' cost, unavailable when the attempt kept none, and its wall time is the
elapsed time it recorded. A confirmation group row's wall time is its makespan.
Its cost sums a session group's preflight call and each rep's recorded calls,
named by rep id. A rep whose record is absent or does not parse, or whose
metrics are incomplete, is named under `missing`, and under `reasons` when no
part recorded any spend.

Every row carries `corpusVersion`, the version its record measured, absent
when the record predates versions. A pipeline run row shows its latest stage
checkpoint's version and sets `corpusChangedDuringRun` when its checkpoints
recorded more than one version. A session attempt row and a replay row show
their own record's version, and a confirmation group row shows the version its
inputs froze.

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
them, and its `finalOutcomes` are all `NOT_APPLICABLE`.

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
links every other stage whose page renders. A run with no artifact takes its
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
every case. A stage or pipeline comparison needs at least two distinct cases; a
session comparison may name one, and its report estimates uncertainty over that
case's reps rather than across cases. Each path names a completed stage, pipeline, or
session confirmation `group.json` and resolves relative to the manifest. Session
groups must carry one frozen case declaration, their recorded attempt evidence,
and a corpus inventory matching that declaration. The control corpus may be
empty for a session case. The control corpus is supplied by the operator. For
example:

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

The loader checks schemas, frozen-file hashes, rep records, controlled inputs,
mode/stage consistency, and corpus identity across cases before writing a
report. Within a case the arms must preserve the controlled experiment inputs,
including model, effort, budget, and non-corpus evidence. A changed corpus is
the treatment. Session checks are read from the recorded attempt and must agree
with the frozen case declaration; no final-outcome row is synthesized. Debug
attempts cannot substitute for confirmation groups.

Statistics are recomputed from rep evidence, rather than copied from existing
confirmation reports. The output at `comparisons/<manifest-sha256>/report.json`
contains quality/resource contrasts for candidate minus baseline, candidate
minus control, and baseline minus control, with Judge agreement context. New
stage, pipeline, and session reports use schema version 5. Each source
repetition retains an ordered outcome for every quality measure, including its
judged grade and metrics-aware success value or its non-judged status. Pipeline
outcomes append `final` after the declared stages. Session source repetitions
also retain their attempt path and hash and carry an empty Judge-agreement
baseline. Readers continue to accept strict version-1 through version-4 reports
without adding outcomes or measurements that those records never contained.
`compare --json` prints the report bytes without starting provider sessions.
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
