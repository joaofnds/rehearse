# What Rehearse can learn from livenerf

Study date: **2026-10-05**. Status: **research and proposals; no vision or roadmap
change is accepted by this document**. [livenerf](https://github.com/ninjahawk/livenerf)
was studied at `fe43aaaae4da05af580d986ea97b887dea7969d6`; Rehearse at
`eafb19ef35dd0e64f0597f930ddd22e4e4bcef2a`. The probes in
[Evidence](#evidence) ran on macOS against Claude Code 2.1.289, started from a
shell inside a Claude desktop app session. The
[independent review record](livenerf-study/review.md) keeps the reviewer's
findings and their dispositions.

## Decision summary

livenerf asks whether one model, served through headless `claude -p`, changes
after launch. Rehearse asks whether an instruction change helps a coding agent.
The questions differ, but both run the real CLI many times and read small
differences out of noisy outcomes. livenerf's safeguards for that shared problem
transfer. Its daily schedule, question panel and plan-meter guard do not.

Rehearse should take three things, in this order:

1. **Control what a child session inherits, and check which CLI ran it.**
   Rehearse passes its whole environment to every `claude` it starts. On the
   probe machine one inherited variable, `CLAUDE_CODE_ENTRYPOINT`, added 123
   context tokens to a minimal call made with the session-case flags (556
   against 433). The probe did not carry a real case's system prompt and tools,
   so the effect on a real case is inferred, not measured. The same parent also
   passes feature flags the CLI reads when it chooses built-in agents, which a
   call with no tools cannot show. Pipeline runs record
   `claude --version`, but replays, session attempts and confirmation groups do
   not, and comparability never compares it, so two arms recorded under
   different CLI releases compare silently.
2. **Check that the requested model served the call.** Rehearse keeps each
   call's per-model usage block and never reads it. livenerf saw another model
   answer after a safety-classifier retry, which a grader would have credited to
   the requested model.
3. **Say what a comparison could have detected.** The command-line summary of a
   multi-case comparison prints a mean delta and its standard error, with no
   interval, decision rule or minimum detectable effect. The browser's What
   moved view gives each case a Wilson interval per arm, but nothing states the
   effect the comparison as a whole could detect. livenerf's validation could
   not separate low effort from high effort on accuracy at 95% with 78 items, so
   a null reading at Rehearse's usual scale says little unless the report states
   the effect size it would have caught.

The first and third overlap the
[Promptfoo study's proposals](promptfoo-study/proposals.md). Its P2 proposes a
declared minimum useful effect, a stopping rule, interleaved arms and
small-sample intervals; its P3 proposes bounded concurrency and a manifest that
records the runtime version. livenerf is a working, validated instance of those
ideas, so P1, P3 and P6 below add evidence and detail to them rather than
competing with them.

livenerf's most quoted finding, the operator's global `~/.claude/CLAUDE.md`
reaching every sample, does **not** reproduce for Rehearse on the probe machine.
`--safe-mode` keeps it out of sealed sessions, and under
`--setting-sources project` setting `CLAUDE_CODE_DISABLE_CLAUDE_MDS` moved the
context by one token. livenerf's own audit does not isolate the leak either.
By its own account, the 11.2k-token call ran with `--setting-sources user`,
which loads user settings and hooks. One commit then changed the setting source,
set four environment variables, dropped every inherited `CLAUDE_CODE_*` variable
and fixed the working directory, so its 11.2k-to-0.55k drop also contains the
kind of inherited-variable effect measured below. Its statement that the setting
source does not cover the global file was not measured on its own. The case for
a context probe rests on the entrypoint result above, not on this leak.

## What livenerf is

livenerf is a pre-registered, append-only daily series built on Inspect. Each
day it asks every question of a locked 78-question panel once, through a
hermetic `claude -p` call, and the 12 GPQA questions once more on a control
model, 90 samples in all. It compares each 10-day window against a baseline
with a paired, item-clustered estimate. Its mechanisms, in the order a sample
meets them:

- **Hermetic invocation.** The child gets `--tools ""`, an empty MCP config,
  `--setting-sources project`, an empty working directory at a fixed path, and
  an environment with every `CLAUDE_CODE_*` variable removed except the OAuth
  token, and with the model, subagent-model, effort and thinking-token
  overrides and `ANTHROPIC_API_KEY` removed. Its comment names a parent
  session's ids, messaging sockets and feature flags as the reason for the
  prefix-wide drop. Four variables are set: `DISABLE_AUTOUPDATER`,
  `CLAUDE_CODE_DISABLE_CLAUDE_MDS`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY` and
  `CLAUDE_CODE_DISABLE_ADVISOR_TOOL`. The provider's comment says the advisor
  tool attaches even with `--tools ""`.
- **Integrity guards.** A sample is an error, never scored and counted on its
  own, when the per-model usage names any other model (`[fallback]`), when it
  took more than one turn (`[retried]`), when the provider refused
  (`[refusal]`), or when its context exceeds the prompt plus a fixed overhead
  (`[context]`).
- **Harness identity.** The CLI version is pinned in the repository, a copy of
  that binary runs the series, and the runner refuses a mismatch. Every run
  records a content hash over only the files that shape a sample: provider,
  tasks, benchmark data, generators, graders, prompts, shared helpers, CLI pin
  and lockfile.
  Analysis, plotting, scheduling and budgeting code is left out, so fixing a
  chart does not count as a harness change.
- **Design before collection.** Candidate questions are screened with four
  samples and kept only when they pass one to three times. Pass rates for power
  come from fresh confirmation samples, because selected items looked closer to
  50% than they were (54.7% on the screen, 62.0% fresh). The minimum detectable
  effect is predicted from those rates before the baseline is collected.
- **Instrument validation.** Before trusting a null, the runner interleaves a
  known degradation (lower effort), a different model, and an A/A split of the
  baseline arm, rotating arm order between passes.
- **Decision rule.** A change is declared only when the 99% interval excludes
  zero in two consecutive windows in the same direction, by at least 3 points,
  with an error rate under 5%, under the same CLI version and harness hash. When
  the control model moves the same way and also clears the interval test in the
  same windows, the result is reported as a harness or platform change, not a
  change in the model under study.
- **Pre-registration.** A deviations log records every change of plan with its
  date and where it falls relative to the data it concerns. Excluded runs are
  listed and never deleted, and a crashed partial run is excluded whole because
  it over-weights the families that finished.

The panel's items stay private and only their hashes are published. A separate
synthetic panel is public.

## Comparison against Rehearse

| Concern               | livenerf at the pinned revision                                                                                                   | Rehearse now                                                                                                                                                         | Implication                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Operator instructions | `DISABLE_CLAUDE_MDS` and project setting sources; its audit saw 11.2k against ~0.6k under `user`                                  | `--safe-mode` for sealed sessions, `--setting-sources project` for session cases; probe shows no leak                                                                | Keep; probe the session path (P1) |
| Inherited environment | Drops every `CLAUDE_CODE_*` but the OAuth token, which removes a parent's feature flags, and model, effort and thinking variables | Child gets the parent environment whole; browser launches strip a named list of Rehearse's own knob variables                                                        | Gap, measured (P1)                |
| CLI version           | Pinned binary, refused on mismatch, logged per sample                                                                             | Recorded on pipeline runs only; comparability does not check it                                                                                                      | Gap (P1; Promptfoo P3)            |
| Served model          | `[fallback]` when usage names another model                                                                                       | Per-model usage block recorded, never checked                                                                                                                        | Gap (P2)                          |
| Single-call integrity | `[retried]`, `[refusal]`, `[context]`                                                                                             | Turns recorded; sealed calls check none of these                                                                                                                     | Gap for sealed calls (P2)         |
| Paired estimate       | Per-item delta, clustered SE with the G/(G−1) correction                                                                          | Per-case delta, sample variance across cases                                                                                                                         | Equivalent; keep                  |
| Interval and decision | 99% interval, two windows, minimum size, same harness                                                                             | Single-case: Wilson interval per arm. Browser What moved: per-case Wilson intervals. Command-line multi-case summary: delta and SE                                   | Gap in the summary (P3)           |
| Power                 | Detectable effect predicted before collection, realized one computed from baseline                                                | None                                                                                                                                                                 | Gap (P3; Promptfoo P2)            |
| Instrument validation | Positive control, model swap, A/A split                                                                                           | Minimal-corpus control arm; identical arms are refused                                                                                                               | Proposal (P4)                     |
| Case informativeness  | Keep items passing 1 to 3 of 4; fresh samples correct selection bias                                                              | Cases that always pass or always fail weigh like any other                                                                                                           | Proposal (P5)                     |
| Arm scheduling        | Arms interleaved in one run, order rotated; a control model attributes shared moves to the platform                               | Confirmation starts every rep at once; `compare attempts` pairs groups recorded separately                                                                           | Proposal (P6; Promptfoo P2, P3)   |
| Token signal          | Per-item log ratio, item-clustered, 99% interval                                                                                  | Paired raw differences for tokens and cost                                                                                                                           | Proposal (P7)                     |
| Harness identity      | Content hash over sample-shaping files only                                                                                       | Corpus version, grading definition and stage-settings digests; pipeline records carry the control commit and CLI version                                             | Partly present (P1)               |
| Pre-registration      | Deviations log, each entry placed against the data it concerns                                                                    | Not present; the [Promptfoo study's P2](promptfoo-study/proposals.md#p2-make-the-supported-claim-part-of-the-comparison) proposes a declared claim and stopping plan | Template for that proposal        |
| Excluded data         | Listed and kept; partial runs excluded whole                                                                                      | Failed attempts retained                                                                                                                                             | Keep                              |
| Budget                | Reads the Max plan meter from the OAuth endpoint behind Claude Code's `/usage` command                                            | USD spend ceiling                                                                                                                                                    | Not proposed                      |

## Proposals

Each proposal names the problem, the evidence, the change, and how to check it.
None is accepted by this document.

### P1. A deliberate child environment and a checked CLI

**Problem.** A session's context and tools depend on where the operator
started Rehearse. The probe measured 123 extra context tokens from
`CLAUDE_CODE_ENTRYPOINT=claude-desktop` alone, and the parent session's id,
messaging socket and effort also reach the child. The desktop parent on the
probe machine set about 50 Claude-related variables, among them
`CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1`,
`CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1` and
`CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1`. The 2.1.289 binary reads the first when it
picks the built-in agent set, under a condition this study did not trace, so a
case whose session would start a built-in agent could run without it from the
desktop app and with it from a terminal, under identical declared inputs. That
is inferred from the binary and the variable names, since every probe ran with
no tools. The probe was a minimal call,
not a real session case, and none ran with the entrypoint a terminal Claude Code
session sets, so the effect on a real case from each launch context is
inferred. The CLI's effort resolver reads `CLAUDE_CODE_EFFORT_LEVEL` ahead of
the turn and session effort, so an operator who exports it would run every case
at that effort while the record names the declared one, possibly even when
Rehearse passes `--effort`. That precedence was read from the 2.1.289 binary and
not observed, because neither the envelope nor the debug log reports the effort
applied.

**Change.** Stop passing the parent environment through unexamined. A session
under test runs the operator's toolchain and needs most of the environment, so
it should lose what Claude Code reads, not everything. Drop by prefix, as
livenerf does: every inherited `CLAUDE_CODE_*` variable except the login and
provider-selection ones (the OAuth token variables, `CLAUDE_CODE_USE_BEDROCK`,
`CLAUDE_CODE_USE_VERTEX` and their siblings), plus `CLAUDECODE`,
`CLAUDE_EFFORT`, `CLAUDE_AGENT_SDK_*`, `MAX_THINKING_TOKENS`, and
`ANTHROPIC_MODEL` and its siblings. A named list of session variables would miss
the next feature flag a parent sets. Record the names, not the values, of the
Claude and Anthropic variables still inherited, so two arms launched from
different places show it. The same rule suits sealed calls. An allowlist would
be tighter there, but it would have to keep proxy, certificate and
configuration variables such as `HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS` and
`CLAUDE_CONFIG_DIR`, or it would break runs behind a proxy or with a custom
configuration directory, and no allowlist was tested. The desktop parent also
sets `ANTHROPIC_BASE_URL` and several `DISABLE_*` flags outside the
prefix; removing them was not tested, so each removal needs the probe below
before it ships. Set `DISABLE_AUTOUPDATER=1`, as livenerf does, so the CLI
cannot update between two reps whatever the launch context. livenerf also sets
`CLAUDE_CODE_DISABLE_AUTO_MEMORY` and `CLAUDE_CODE_DISABLE_ADVISOR_TOOL`. Every
probe here inherited the advisor flag, so none saw the CLI with the advisor tool
available, and none set the auto-memory flag, while a session-case call with
stream output named an auto-memory directory. Both belong in the first probe.

Extend the CLI version that pipeline runs already record to replays, session
attempts and confirmation groups, and refuse a comparison whose arms ran under
different versions. Session cases use `--output-format json`, which in the
probes returned one result object with no init event, so the version has to
come from `claude --version` rather than from the stream's
`claude_code_version` field. The Promptfoo study's P3 proposes the
same record as part of a run manifest.

Add a paid preflight probe that starts a minimal call through the session-case
arguments, not the sealed path the current model probe uses, and records its
context tokens with the run. Comparability then treats arms whose probes differ
beyond a small tolerance as differently launched. A fixed threshold would not
work there, because session cases keep Claude Code's default system prompt,
whose size can change between releases.

**Check.** A provider test with a fake `claude` that records its environment,
as livenerf's provider tests do, asserting that the dropped variables are
absent, an unknown `CLAUDE_CODE_*` flag among them, and the kept login and
provider variables present.
The probe in [Evidence](#evidence) rerun from the desktop app, from a terminal
Claude Code session and from a plain terminal should then report the same
context. The probe must also see an injected file: the same call with the
default setting sources should report a larger context, as the "Neither set"
row did on the probe machine.

**Harness identity.** A whole-repository commit is too coarse to gate
comparisons, because documentation commits would change it; livenerf hashes
only the files that shape a sample for that reason. A digest over the code that
shapes a call and that the corpus and grading digests do not already cover (the
Judge, Product Owner and root-cause system prompts, the argument builders) is
the granularity that could join the comparability fields. This part is
optional.

### P2. Served-model and single-call integrity

**Problem.** A call answered by a model other than the one declared is graded
as the declared model. livenerf observed this after a classifier retry and now
rejects such samples.

**Change.** For sealed calls (Judges, Product Owner, root-cause analysis,
preflight), require the per-model usage block to name exactly one model and
record it as the served model. Count a mismatch, a refusal, or an unexpected
turn count as its own error rather than as a grade. For sessions under test,
record the set of served model ids and show a difference between arms beside
the contrast without refusing the comparison. A candidate instruction that makes
the session start a subagent on another model changes that set as part of the
treatment. livenerf's strict rule fits its single-turn, tool-free calls, and
Rehearse's session cases are neither. The expected turn count of a sealed call
with a JSON schema was not measured, so it needs one observation before it
becomes a guard.

**Check.** Fixture envelopes with two models in the usage block, with
`stop_reason: refusal`, and with an extra turn, each producing a counted error
and no grade for a sealed call, and a flagged but accepted comparison for a
session case.

### P3. Intervals, a decision rule, and the detectable effect

**Problem.** The command-line summary of a multi-case comparison shows a delta
and its standard error and leaves the reader to judge both. A confirmation
run's reliability error uses `sqrt(p(1−p)/n)`, which reads zero at 5 of 5 and
suggests certainty the reps cannot give. The Promptfoo study's P2 raised the
same concern and proposes small-sample intervals, a declared minimum useful
effect and a stopping rule. This proposal is the reporting part of that one,
with livenerf's numbers as evidence for it.

**Change.** Print an interval for every multi-case contrast, using a t quantile
with cases minus one degrees of freedom, since a comparison may have two cases.
Beside a contrast whose interval includes zero, print the smallest effect the
comparison could have detected at the stated confidence and 80% power, about
2.8 standard errors at 95% with many cases and more with few. Use the Wilson
interval for confirmation reliability, as single-case comparisons already do.
A stated decision rule (interval excludes zero, by at least a declared size)
belongs with the claim declaration the Promptfoo study proposes.

**Check.** Estimator tests at two, three and ten cases against known t
quantiles, and a report fixture whose null reading names its detectable effect.

### P4. An A/A check and a positive control

**Problem.** Nothing shows that a Rehearse comparison reports zero when nothing
changed, or detects a change known to matter.

**Change.** Add an explicit A/A mode, a comparison whose candidate is the
baseline corpus, read as a check that its interval contains zero. Two guards
refuse such a comparison today: deriving a baseline corpus refuses identical
arms, and a stage replay refuses when the stage reads nothing in the skill under
test. Both catch real operator mistakes, so the mode should be declared and
labeled in the record rather than made possible by loosening them. Whether a
manifest comparison accepts identical arms was not checked. Pair it with a
positive control, a candidate with a known harmful edit such as deleting the
instruction the case exercises, which the comparison must detect. Run both once
per case set before trusting a null on that set. livenerf's results show why:
its A/A difference was +6.4 points (z = 1.79), larger than its medium-effort
effect, and only token use separated the effort levels.

**Check.** The two comparisons run with real reps on one case set, with their
cost stated beforehand.

### P5. Case calibration

**Problem.** A case every arm always passes, or always fails, adds a zero delta.
It shrinks the standard error, but it pulls the mean toward zero by more. Two
cases with deltas of 0.4 and 0.2 give z = 3.0, and adding eight such cases
brings z to 1.41. livenerf found 97% of its candidate questions uninformative.

**Change.** Record each case's pass rate across confirmation runs and mark cases
at 0% or 100% as uninformative for comparison. When cases are chosen by a
screening run, take their expected pass rates from fresh reps, not the screen,
so selection does not overstate how informative they are.

**Check.** A report over recorded groups listing each case's pass rate and its
informative flag.

### P6. Interleaved arms

**Problem.** Confirmation starts every rep at once, and `compare attempts` pairs
groups recorded at different times. A change in serving conditions between the
recordings reads as a corpus effect.

**Change.** Run the arms' reps in one group with rotating order, bounded
concurrency, and recorded start times. The Promptfoo study's P2 proposes
interleaved or counterbalanced arms and its P3 bounded concurrency; livenerf
runs both. Where arms come from separate recordings, print the time between
them beside the contrast, and borrow livenerf's attribution rule: rerun a fixed
reference arm with each recording, and read a shift in it as a change in
serving conditions rather than in the corpus.

**Check.** A scheduler test asserting the arm order across passes.

### P7. Token and cost deltas as per-case log ratios

**Problem.** Raw token differences let the largest case dominate the mean.
livenerf's tokens moved −62% under low effort while accuracy moved 8.3 points
with an interval spanning zero.

**Change.** Report token and cost contrasts as the geometric mean of per-case
ratios, from the mean and standard error of per-case log ratios, printed as a
percentage change with its interval.

**Check.** Estimator tests over cases of very different sizes.

## What does not transfer

The daily series, its schedule and its baseline windows answer a drift question
Rehearse does not ask. The locked panel and its screening against public
datasets have a counterpart in Rehearse's corpus versions and frozen cases. The
plan-meter guard reads the OAuth endpoint behind Claude Code's `/usage` command
and serves only subscription accounts. Inspect would replace a harness Rehearse already owns.

## Where livenerf's evidence is thin

The A/A check passed its own bar narrowly, at z = 1.79 against 1.96. Accuracy
could not detect low effort at 95%, and a swap to a different model was not
distinguishable on accuracy at 95% or on tokens at 99%. The series runs on one
machine and one account. Its harness audit was done on Windows with CLI 2.1.280
under the `user` setting source, so its 11.2k context figure mixes the global
instruction file, hooks, an advisor tool and inherited variables. The item
audit was done by Claude on Claude, a conflict livenerf states. None of this
weakens the safeguards proposed above. It does mean livenerf's numbers bound
what accuracy can show at its scale, not what instruction changes do.

## Evidence

**Context probes.** Every call ran in one temporary directory that held only
the probes' own output files. The
row that removes the entrypoint ran this command:

```bash
echo "Reply with the single word OK." | env -u CLAUDE_CODE_ENTRYPOINT claude -p --model haiku --max-budget-usd 0.05 --output-format json --setting-sources project --strict-mcp-config --tools "" --system-prompt "You are a strict judge." --no-session-persistence
```

The other rows change only the `env` arguments and the flags. The sealed flags
are `--safe-mode --disable-slash-commands --strict-mcp-config` in place of the
two setting flags above, and "Neither set" passes only
`--disable-slash-commands --strict-mcp-config`. Each call's output parsed as one
JSON result object, and context is its input plus cache-creation plus
cache-read tokens. A real session case also passes its tools, `--settings` and
`--session-id`, and keeps the default system prompt, so these rows show what
each environment change does, not the context of a real case.

The probe shell ran inside a Claude desktop app session and inherited about 50
Claude-related variables. Read from the same shell after the probes,
`CLAUDE_CODE_DISABLE_ADVISOR_TOOL`, `DISABLE_AUTOUPDATER`,
`CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS`,
`CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS` and `DISABLE_MICROCOMPACT` were set to
1, and `CLAUDE_CODE_DISABLE_CLAUDE_MDS`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY`,
`CLAUDE_CODE_SUBAGENT_MODEL` and `MAX_THINKING_TOKENS` were unset. Every probe
kept that environment except for the change its row names.

| Flags        | Environment change                            | Context tokens |
| ------------ | --------------------------------------------- | -------------- |
| Sealed       | none                                          | 433            |
| Sealed       | `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`            | 433            |
| Neither set  | none                                          | 4,406          |
| Session-case | none                                          | 556            |
| Session-case | `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`            | 555            |
| Session-case | `CLAUDE_CODE_ENTRYPOINT` removed              | 433            |
| Session-case | seven other named variables, in five removals | 553 to 560     |

The seven other variables were the messaging socket and token, removed
together, `CLAUDE_EFFORT`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDECODE`, and the
two session ids, removed together. Their spread, 3 tokens below to 4 above the
unchanged call, puts the entrypoint's 123 well outside run-to-run variation. The
rest of the inherited variables were not removed one at a time. What those 123
tokens contain was not read. The "Neither set" row is consistent with the
operator's 12 KB global instruction file and installed skills loading, which
suggests the probe sees an injected file, but its content was not read either.
Every probe inherited `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1`, so none could show
an advisor tool, and none set `CLAUDE_CODE_DISABLE_AUTO_MEMORY`.

The skills and auto-memory observations come from one more call with the
session-case flags, `--output-format stream-json --verbose` and
`--system-prompt "x"`, whose first event is the init event. The skills it listed
did not include the operator's installed skills. It named an auto-memory
directory under the operator's `~/.claude/projects`; whether a session reads or
writes there was not tested.

**Feature flags.** A string search of the 2.1.289 binary finds
`CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS` in the function that returns the
built-in agent set, which returns none when the flag is set and one further
condition holds. It also finds `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS`,
`CLAUDE_CODE_SUBAGENT_MODEL`, `MAX_THINKING_TOKENS`, `CLAUDE_CODE_USE_BEDROCK`
and `CLAUDE_CODE_USE_VERTEX`, and no `DISABLE_MICROCOMPACT`. What each flag does
in a session case was not observed.

**Effort.** Three probes could not show whether an inherited effort variable
changes a child. Output tokens on a reasoning prompt did not even separate
explicit `--effort low` from `--effort xhigh`, and neither the envelope nor the
debug log reports the effort applied. In the 2.1.289 binary, the effort
resolver reads `CLAUDE_CODE_EFFORT_LEVEL` and takes it before the turn effort
and the session effort, and the `/effort` command reports that the variable
"overrides effort this session". The binary also describes `CLAUDE_EFFORT` as a
variable the CLI sets for hooks and Bash, which suggests it is output only.

**Code read at the pinned revision.** `runCommand` spreads `Bun.env` into every
child (`src/benchmark/command.ts`), and the browser's process launcher removes
only a declared list of `BENCHMARK_*` knob variables
(`src/server/process-launcher.ts`). Pipeline runs record `claude --version` as
`claudeVersion` (`src/benchmark/run.ts`). A search of `src` and `client` for
`claudeVersion`, `cliVersion` and `claude_code_version` finds only the run, its
record contract, the context-evidence contract, and their tests and fixtures,
so no replay, session-attempt or confirmation record carries a version, and
context-evidence captures carry their own `cliVersion`. `readClaudeCallMetrics` keeps `modelUsage` and `num_turns` with
no check (`src/benchmark/claude.ts`). Controlled-input comparability compares
model, effort, Judge model and effort, session budget, pipeline path, lineage
and corpus files, and nothing about the CLI
(`src/benchmark/comparison-comparability.ts`). The preflight model probe uses
sealed access (`src/benchmark/preflight.ts`); session cases build their
arguments in `sessionCaseArgs` (`src/benchmark/session-attempt.ts`). The
paired estimate and the Wilson interval are in
`src/benchmark/comparison-estimator.ts`, and the browser's per-case intervals in
`src/server/comparison-quality-reading.ts`. Confirmation starts its reps with
one `Promise.all` (`src/benchmark/confirmation.ts`), and its reliability error
is the binomial formula (`src/benchmark/confirmation-report.ts`). Identical arms
are refused in `src/benchmark/baseline-corpus.ts` and
`src/benchmark/compare-attempts.ts`. A case-insensitive search of `src` and
`client` outside tests for "detectable", "statistical power", "power" and "MDE"
as words finds nothing.

**Not established.** No proposal here has been built or measured on a real
comparison. The probes cover one machine, one CLI release, one model and one
launch context. livenerf's numbers come from its own documents at the pinned
revision and were not rerun.
