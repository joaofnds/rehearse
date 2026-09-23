# Runbook

Start with a session case to learn the record format, then use repetitions to
measure variability. Pipeline runs need a separate target repository and more
setup. Read [current limitations](status.md#known-limitations) before using them.

Commands below run from the Rehearse repository root. Placeholders such as
`<group-id>` must be replaced with IDs printed by your own commands.

## Install and inspect without calling a model

```sh
mise install
mise exec -- bun install --frozen-lockfile
mise exec -- bun run rehearse --help
mise exec -- bun run rehearse case list
mise exec -- bun run rehearse case show smoke --json
```

Mise pins Bun and Backlog.md. Follow the [Claude Code quickstart](https://code.claude.com/docs/en/quickstart)
to install and authenticate the CLI separately, and make sure `claude` is on the command's `PATH` before running an
experiment. Rehearse invokes that installed CLI with your credentials.

`case list` discovers declarations present in your checkout. `case show` prints
the declaration's path by default and its JSON with `--json`. A declaration can
exist even when its external inputs are missing; listing it is not a readiness check.

## Supply the smoke case's corpus

The [smoke declaration](../cases/smoke/case.json) asks for a one-word reply with
no tools. It also declares `output-styles/brief.md`, which is not bundled in the
repository. Create a small example corpus under the ignored run directory:

```sh
mkdir -p .benchmark-runs/example-corpus/output-styles
cat > .benchmark-runs/example-corpus/output-styles/brief.md <<'STYLE'
---
name: brief
description: Concise replies for the Rehearse smoke example.
---
Answer concisely. Follow the requested reply format.
STYLE
```

This is an example input you can edit, not the maintainer's personal style.
Passing its directory with `--corpus` avoids installing it into your live agent
configuration. Other live settings can still affect the session; this is not a
sealed environment.

## Run one attempt

The next command calls the provider and costs money:

```sh
mise exec -- bun run rehearse run --case smoke \
  --corpus .benchmark-runs/example-corpus \
  --model sonnet --session-budget-usd 0.2
```

The session budget is USD 0.20. The model-availability probe is a separate paid
call with a USD 0.10 budget. These are configured budgets, not price estimates,
and not caps: Claude Code stops a session only after the call that crosses its
budget, so a charge can exceed it. An actual charge depends on the provider,
context, and cache state. No paid recipe in this guide was exercised for the
documentation audit.

The command prints check results and an attempt record path. Inspect it with:

```sh
mise exec -- bun run rehearse list attempts
mise exec -- bun run rehearse show attempt:session:smoke/<uuid>
```

Use the complete ID printed by `list attempts`. The record includes the prompt,
reply, declared corpus digests, transcript evidence, check results, provider
metrics, and the grades of a declared state scorer. `NO_REPLY` means the session
ended without a final reply, so the reply and transcript checks were not
evaluated; a declared state scorer still grades the tree the session left. Read the outcome even when the command exits 0; a recorded
failing grade or check can be a successfully completed experiment.

## Repeat with frozen inputs

```sh
mise exec -- bun run rehearse run --case smoke \
  --corpus .benchmark-runs/example-corpus \
  --model sonnet --session-budget-usd 0.2 \
  --confirm --reps 2
```

The terminal asks you to approve the projected budget before any provider call.
For this example it is USD 0.50: two USD 0.20 sessions plus the USD 0.10 model
probe. It is the sum of those budgets, not a cap, since each session can overrun
its own by the call that crosses it. For automation, add `--yes` to approve that
projection without a prompt.
Keep `--model` explicit; `--yes` does not select or authorize a case-default model
for unattended use.

A group freezes the declaration, fixture, prefix, and declared corpus inputs
once. Each repetition gets its own attempt directory and evidence. Failed
repetitions remain in the group rather than disappearing from the result.

```sh
mise exec -- bun run rehearse list groups
mise exec -- bun run rehearse show group:<group-id>
mise exec -- bun run rehearse show group:<group-id> --json
```

Two reps demonstrate the mechanism. They do not establish that an instruction
helps. Confirmation defaults to five reps and requires at least two; choose a
sample size appropriate to the result's variability.

Session confirmation writes every declared corpus file, skills and `CLAUDE.md`
included, under the attempt's own `.claude/`, and a declared skill brings its
whole directory. The session runs with project settings sources, so a declared
skill is the copy it runs, whether the model or a slash command invokes it, even
when `~/.claude/skills` holds a skill of the same name. A declared `CLAUDE.md`
is framed the way Claude Code frames a repository's own `CLAUDE.md`, not as the
operator's user-level instructions, and an undeclared `~/.claude/CLAUDE.md` is
not loaded. The session also runs with `--strict-mcp-config`, so no MCP server
reaches it, the claude.ai account's connectors included. Claude Code still adds
context the case does not declare: the environment, the date, the account's
email, a git status snapshot, and, in a session that can call skills, a listing
of Claude Code's built-in skills.
[Corpus sources and delivery](reference.md#corpus-sources-and-delivery)
describes the overlay.

Session groups can feed `compare` when each case has baseline, candidate, and
control groups. The comparison reads the frozen case, checks, corpus inventory,
rep records, and each referenced `attempt.json`; it starts no provider process.
Use a manifest with the shape in the [reference](reference.md#comparison-manifests),
then inspect the saved report:

```sh
mise exec -- bun run rehearse compare path/to/comparison.json
mise exec -- bun run rehearse list comparisons
mise exec -- bun run rehearse show comparison:<manifest-sha256>
mise exec -- bun run rehearse show comparison:<manifest-sha256> --json
```

Session reports use the checks row only. A missing or inconsistent attempt is a
refused comparison, and an empty declared control corpus is valid.

## Inspect staleness

After editing the example style, ask which recorded debug attempts or checkpoints
no longer match it:

```sh
mise exec -- bun run rehearse stale --corpus .benchmark-runs/example-corpus
```

The session result is reported at case level using its latest debug attempt.
This command does not inventory confirmation groups. With no prior measurement
there is nothing to mark stale. It reads the current corpus and starts no session.

For pipeline checkpoints, add `--model` or `--effort` to check those conditions
as well. Without those flags, the command checks corpus changes and each run's
current declared or default stage settings. A settings value change stales the
initial checkpoint and carries forward through later checkpoints; changing only
JSON whitespace does not. A missing or invalid settings file appears as a cause
for the affected run while the command continues reporting the others.
Ordinary checkpoints from before settings evidence was recorded also appear
stale, because they cannot establish which settings their stages received.

A corpus that cannot supply a file a record hashed, including a missing,
unreadable, or escaping `CLAUDE.md`, is reported as that record's cause rather
than refusing the whole report.

## Configure a linked live corpus

Commands that use the live corpus read instructions from `~/.claude`. If your
instruction files link into a backing tree other than the default `~/.agents`,
set its absolute path in the shell where you run Rehearse:

```sh
export BENCHMARK_LIVE_CORPUS_BACKING_ROOT=/absolute/path/to/agents
```

This setting applies to live corpus reads by CLI commands and the browser
server. See [corpus sources and delivery](reference.md#corpus-sources-and-delivery)
for the permitted paths, supported execution modes, and remaining containment
limits.

## Use a pipeline on a prepared target

The bundled [audit-log case](../cases/audit-log/case.json) describes a NestJS
feature and a `shape → build` workflow. Its relative default target is a sibling
checkout used by the maintainer. It does not download a template. Supply your
own compatible checkout with `--target`.

Before running, prepare the target's dependencies, services, and database using
that target's instructions. Inspect the [pipeline definition](../cases/audit-log/pipelines/default.json)
for its commands and protected files. Its checks expect `CONFIG_PATH=src/config/test.yaml`
and the scripts `typecheck`, `check`, and `test:unit`. An arbitrary repository
will need its own case, rubrics, and pipeline.

The control repository must be committed and clean. The target must be a
separate clean Git repository root on `main`. The workflow needs the installed
skills named by the pipeline, the corpus's global instructions, and working
Backlog.md configuration. For linked instruction files, follow
[live-corpus setup](#configure-a-linked-live-corpus).

When a target has no board, the harness initializes one under `backlog/` with
the pinned Backlog.md CLI and excludes its workflow state through the
repository's private Git excludes. It writes no agent instruction file or
commit. An existing `backlog.config.yml`, `backlog/config.yml`, or
`.backlog/config.yml` is retained. The harness updates an untracked
configuration with the pipeline's statuses. A tracked configuration must
already be normalized by the pinned Backlog.md CLI and its status list must
match the pipeline exactly, so task creation cannot enter the measured source
diff. The board directory must contain no tracked files other than its folder
configuration file.

Once those prerequisites are satisfied, the invocation is:

```sh
mise exec -- bun run rehearse run --case audit-log \
  --target /absolute/path/to/compatible-target \
  --model sonnet --effort medium --session-budget-usd 10
```

This is paid workflow execution. The limit applies per session, not to the
entire run: workers, the shared Product Owner, Judges, and rejudges can all
consume budget. The CLI checks repository readiness and settings before its
paid model probe. The harness then runs baseline target checks before launching
workflow stages. A baseline failure therefore avoids workflow spend, but may
follow the model probe.

A plain pipeline run works directly on the target's `main`, then restores it.
It uses agents with permission bypass on the host. Use a designated benchmark
target whose committed state and workflow artifacts can be restored; ignored
build outputs and external services are not snapshotted. See
[target restoration](reference.md#target-restoration) before relying on recovery.
The repository-private board exclusions remain after restoration and are reused
by later runs.

## Read, review, and replay a pipeline result

```sh
mise exec -- bun run rehearse list runs
mise exec -- bun run rehearse show run:<run-name>
mise exec -- bun run rehearse list checkpoints
```

Stopped runs are included. Their summary shows recorded stages, grades, failure
information, and costs where available. The default stage continuation threshold
is B; `--minimum-grade` changes it without changing the Judge's recorded grade.

Without `--pause`, a run requiring human review retains its candidate, restores
the target, and exits. Review and calibration are separate commands. `--pause`
keeps the candidate in place for interactive calibration and requires a terminal.
Use the [review and calibration reference](reference.md#review-and-calibration)
for verdicts, findings, and rejudging.

Replay a stage for which the run retained an input checkpoint:

```sh
mise exec -- bun run rehearse replay --run <run-name> --stage build \
  --model sonnet --effort medium --session-budget-usd 10
```

Replay creates a temporary host worktree, runs only that stage, and writes an
attempt. It can use `--corpus /absolute/path/to/variant` and can repeat with
`--confirm`. Read the [corpus support matrix](reference.md#corpus-sources-and-delivery)
before choosing a mode; pipeline `run` and `replay` have different support.

## Open the browser UI

```sh
mise exec -- bun run build:client
mise exec -- bun run serve
```

Open `http://localhost:4173`. `PORT` overrides the server port. The server reads
local records and the live corpus; it does not launch experiments. It has no
authentication and binds to `127.0.0.1`; do not forward its port or otherwise
expose it as a public service.

For linked instruction files, configure the server's shell using
[live-corpus setup](#configure-a-linked-live-corpus). A layout directory or file
entry selected for reading that the harness cannot hash, because it leaves the
permitted extent, never resolves, cannot be read, or has the wrong file type,
produces a named refusal and withholds the corpus digest. Healthy layout
directories remain visible. An unavailable instruction file or a refusal while
hashing a selected layout directory becomes a staleness cause, so run history
stays readable.

See [current UI coverage](status.md#browser-ui) for available routes and planned
controls. An empty run-history page is expected in a fresh clone.
