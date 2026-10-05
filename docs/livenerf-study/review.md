# Independent review record

Scope: the [livenerf study](../livenerf-study.md), its glossary entries
(Minimum detectable effect, A/A check, Positive control, Served model) and its
documentation-index entry. Review-docs supplied the document criteria and
adversarial-review supplied the independent review procedure. The reviewer
received the user's research request, the artifact paths, the livenerf checkout
at the pinned revision, and the instruction to treat the paid probe results as
reported measurements, without the author's assessment.

The report below is the reviewer's text. Its headings are one level lower to fit
this record, Rehearse paths are relative to the repository root, and two
names are set as code so they render. The
livenerf paths under `/tmp/livenerf-study` are a temporary clone; substitute any
checkout of the pinned revision. The study's first draft pinned Rehearse at
`bb588f8f`, so the line numbers in the findings refer to that draft.

## Reviewer report, verbatim

**Verdict: stop.** The study states two false facts: one about Rehearse and one about livenerf. Its main conclusion about the leak is also contradicted by livenerf's own history. Fix these before the document is committed.

### Findings, worst first

**1. Blocking: false claim about Rehearse.** Verified by command.

- **Location:** docs/livenerf-study.md L26, and table row L90 ("Not recorded on attempts").
- **Claim:** "No attempt records the CLI version."
- **Evidence:**
  - src/benchmark/run.ts L1258-1261 runs `runCommand(["claude", "--version"], CONTROL_DIR)`.
  - L241 stores `claudeVersion: inputs.claudeVersion.trim()` in the run evidence. The field is declared at src/benchmark/contracts.ts L574.
  - The context-evidence contract also carries `cliVersion`.
- **How it goes wrong:** Every original pipeline run already records the version. The part that is true is narrower: replays, session attempts and confirmation groups do not record it, and comparison-comparability.ts does not check it. P1's "Record the CLI version" proposes a field that already exists and should start from it. The second half of row L90 ("comparability does not check it") is correct.

**2. Blocking: false claim about livenerf.** Verified by command.

- **Location:** L49.
- **Claim:** The daily panel asks 78 questions "several samples each".
- **Evidence:** /tmp/livenerf-study/docs/DESIGN.md gives the schedule as "once a day, every panel question 1×", plus the control arm. /tmp/livenerf-study/README.md reports 90 samples a day (78 panel plus 12 control).
- **How it goes wrong:** It misstates the sampling design that the study's own MDE and interval comparisons depend on.

**3. Blocking: the conclusion is contradicted by the evidence.** Verified by command.

- **Location:** L39-44 ("the result depends on platform or release") and row L88 ("saw 11.2k against ~0.6k").
- **Evidence:**
  - In livenerf's history, commits 453ca17 and 80b1f86 used `setting_sources: str = "user"`. Commit d4ff4d7 switched to `project` and added `CLAUDE_CODE_DISABLE_CLAUDE_MDS` in the same commit.
  - /tmp/livenerf-study/PILOT.md L74-93 records that the audit found "--setting-sources user loaded the user's hooks".
  - The provider comment at /tmp/livenerf-study/livenerf/providers/claudecode.py L66-69 gives the 11.2k figure without naming the setting source.
- **How it goes wrong:** The likeliest explanation for 11.2k is the `user` setting source, which Rehearse never uses. The platform-or-release explanation is not the likeliest one. Row L88 puts 11.2k next to "project setting sources", which implies it was measured under the configuration Rehearse uses. The argument at L44 for a preflight probe would then rest on a confound.

**4. Should-fix: P1's preflight check would test the wrong path.** Verified by command and reasoning.

- **Location:** P1, L135.
- **Claim:** "Extend the paid preflight model probe to read its envelope's context."
- **Evidence:**
  - `defaultModelProbe` in src/benchmark/preflight.ts calls `claudeArgs({..., access: "sealed"})`, which goes through the `--safe-mode` path.
  - The leak the study measured (556 against 433) appears only with the session-case flags (`--setting-sources project`, from `sessionCaseArgs` in src/benchmark/session-attempt.ts L172-199).
  - livenerf's probe (/tmp/livenerf-study/livenerf/preflight.py L95-111) goes through the same provider path as its samples.
- **How it goes wrong:** An injected CLAUDE.md under the session-case path would pass this probe. Session cases also run with the default system prompt, so a "fixed overhead" threshold there depends on the release.

**5. Should-fix: the probe setup does not match real session cases.** Verified by command.

- **Location:** Evidence section, L262-308. The 123-token claim is at L20-27.
- **Evidence:**
  - The probes used `--tools ""`, a fixed `--system-prompt` and `--no-session-persistence`.
  - `sessionCaseArgs` passes no `--system-prompt`, passes the declared tools, `--session-id` and `--settings`, and uses `--output-format json`.
  - The doc never says what the 123 tokens contain. Removing `CLAUDE_CODE_ENTRYPOINT` gives 433; removing other single variables gives 553 to 560, which suggests about ±4 tokens of noise.
  - No probe ran with `ENTRYPOINT=cli` (Rehearse launched from a terminal claude session).
  - No positive control shows that the probe detects a CLAUDE.md when one loads.
- **How it goes wrong:** Applying the 123-token effect to "a case launched from the desktop app" is inference that the probes do not support.

**6. Should-fix: overstated gap on multi-case intervals.** Verified by command.

- **Location:** L33-34, row L94 ("Multi-case: delta and SE only"), and P3.
- **Evidence:**
  - src/server/comparison-quality-reading.ts and src/server/comparison-what-moved.ts give the browser's What moved view per-case, per-arm Wilson intervals and verdicts (insideRerunNoise, separated).
  - docs/status.md L40-56 says this view is verified on the multi-case shape, and that a meter names a higher arm only past rerun noise.
- **How it goes wrong:** The claim holds only for the CLI `comparisonSummary` in record-summary.ts. A reader would take the decision rule and intervals to be missing everywhere.

**7. Should-fix: overlap with the Promptfoo study is not declared.** Verified by command.

- **Location:** P1 (version recording), P3, P6, L176, L185, row L101.
- **Evidence:**
  - docs/promptfoo-study/proposals.md P2 (L77-150) already proposes a declared minimum useful effect, a stopping rule, interleaved or counterbalanced arms, and small-sample binary intervals.
  - Its P3 (L152-205) already proposes bounded concurrency in place of `Promise.all`, and a manifest that records the agent and runtime version.
- **How it goes wrong:** The study cites Promptfoo only for the claim declaration and the SE concern, and gives no link. P3, P6 and P1's version recording read as new proposals when they duplicate existing ones.

**8. Should-fix: livenerf's control arm and its attribution rule are left out.** Verified by command.

- **Location:** L76-78 (the decision rule).
- **Evidence:**
  - /tmp/livenerf-study/PREREGISTRATION.md L138-150 adds Attribution through the control arm to its four rules.
  - /tmp/livenerf-study/README.md includes "not show up in the control arm".
  - DESIGN.md defines the claude-opus-5 control arm.
- **How it goes wrong:** This is the mechanism livenerf uses to separate harness or platform drift from model drift. It is the one most relevant to P6, where arms are recorded at different times.

**9. Should-fix: two of livenerf's four hermetic variables are dropped.** Verified by command.

- **Evidence:** /tmp/livenerf-study/livenerf/providers/claudecode.py L70-75 sets four variables:
  - `DISABLE_AUTOUPDATER`
  - `CLAUDE_CODE_DISABLE_CLAUDE_MDS`
  - `CLAUDE_CODE_DISABLE_AUTO_MEMORY`
  - `CLAUDE_CODE_DISABLE_ADVISOR_TOOL`
    The provider comment says the advisor tool attaches "even with --tools \"\"".
- **How it goes wrong:** The study never covers the auto-memory or advisor-tool variables, even though its own Evidence section found an auto-memory directory under ~/.claude/projects. Both are plausible session-case leaks that were never probed.

**10. Should-fix: P2's refusal rule would reject real effects.** Reasoning only.

- **Location:** L158-162.
- **Claim:** Refuse a comparison "whose arms were served by different" model sets.
- **How it goes wrong:** A candidate instruction that makes the session spawn a subagent on another model changes the set of served models. That change is the treatment effect, not contamination, so the rule would refuse valid comparisons. livenerf's `set(served) != {model}` guard works because its calls are single-turn and tool-free (claudecode.py L185-188, L228). Rehearse session cases are neither.

**11. Should-fix: glossary entries describe things Rehearse does not have as if it had them.** Verified by command.

- **Location:** GLOSSARY.md, the new entries A/A check, Positive control and Served model.
- **Evidence:**
  - The glossary header (L3) says: "Terms describe the harness unless explicitly marked as UI design concepts."
  - Of the four new entries, only Minimum detectable effect says Rehearse lacks the concept.
  - Served model says the value is "read from its per-model usage block". `git grep modelUsage` over non-test src and client finds only claude.ts (copied without being checked, `readClaudeCallMetrics` L245-264) and contracts.ts.
- **How it goes wrong:** A reader takes all three as harness behavior that exists.

**12. Should-fix: unsupported history claim about livenerf's harness hash.** Verified by command.

- **Location:** L63-67.
- **Claim:** "An earlier hash over the whole package changed with every report edit."
- **Evidence:** The earlier identity at 453ca17 was the git commit SHA plus a dirty flag, not a content hash. No livenerf source states this reason. I checked /tmp/livenerf-study/livenerf/schedule.py L68-86, the PREREGISTRATION deviations and PLAN.md L290-291. schedule.py's `SAMPLE_SHAPING` also includes the generators and common.py, which the doc's list of hashed files at L65-66 leaves out.

**13. Note: "locked public panel" is wrong.** Verified by command.

- **Location:** L247.
- **Evidence:** /tmp/livenerf-study/README.md says the frozen panel items are private and only their hashes are published. A separate synthetic panel is public.

**14. Note: deviations are not always "dated before the data".** Verified by command.

- **Location:** L79 and row L101.
- **Evidence:** The PREREGISTRATION deviations log has a 2026-10-05 crash exclusion that was written after the crashed attempt.

**15. Note: the P1 sealed allowlist is untested and may drop needed variables.** Reasoning only.

- **Location:** L123.
- **How it goes wrong:**
  - The allowlist includes "Rehearse's own records variable", which the claude child never reads.
  - Unless they are listed, it would strip `HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS` and `CLAUDE_CONFIG_DIR`. That would break runs behind a proxy or with a custom config directory. The study tested no allowlist.
- **Security context:** Today src/benchmark/command.ts L113-115 passes `{...Bun.env, ...options.env}` to every child. This includes `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and `CLAUDE_CODE_EFFORT_LEVEL`. The study is right to flag that this inheritance can silently change billing, model and effort.

**16. Note: the init-event version is not available to session cases.** Verified by command.

- **Location:** L135-140.
- **Evidence:** P1 suggests reading `claude_code_version` from the stream init event. `sessionCaseArgs` uses `--output-format json`, so session cases never receive an init event. The binary's init schema does require the field (Python string search over the 2.1.289 binary).

**17. Note: P4 skips an existing refusal.** Verified by command.

- **Location:** P4, L195 ("Allow a comparison whose candidate is the baseline corpus").
- **Evidence:** src/benchmark/compare-attempts.ts L328-345 (`assertStageReadsSkillUnderTest`) throws "arms A and B ran the same files and nothing is under test".
- **How it goes wrong:** P4 has to change or bypass this guard, and it does not mention it. I did not probe whether the manifest-based `compare` refuses an A/A comparison.

**18. Note: weaker evidence quoted for the effort-override claim.** Verified by command.

- **Evidence:** The `CLAUDE_CODE_EFFORT_LEVEL` string the doc quotes is in the bridge `apply_flag_settings` and `/effort` paths. A stronger source is in the 2.1.289 binary: resolver `iw()` computes `g=p??(...)??r??n??E` from `pK()`, which reads `CLAUDE_CODE_EFFORT_LEVEL`. The env value therefore takes precedence over turn and session effort. `CLAUDE_EFFORT` is only set for hooks and Bash, as output.

**19. Note: the process launcher strips a named subset, not every `BENCHMARK_*` variable.** Verified by command.

- **Evidence:** src/server/process-launcher.ts strips only `DECLARED_KNOB_VARIABLES`. For example, `BENCHMARK_LIVE_CORPUS_BACKING_ROOT` passes through. This matters for any doc wording that implies the launcher sanitizes the environment.

**20. Note: the stated commit and the working tree have moved.** Verified by command.

- **Evidence:** L6 says "Rehearse at bb588f8f, clean". HEAD is now af2fb99b. `git diff --stat bb588f8f HEAD` touches none of the files the study cites.
- **Working tree:** It also shows modified files outside this change: client/src/run-detail/contribution-layout.test.tsx and client/src/run-detail/root-cause-analysis-section.tsx. The commit for this study must stage only docs/livenerf-study.md, GLOSSARY.md and docs/README.md.

**21. Note: style and link issues.** Verified by command.

- Row L101 names the Promptfoo study's P2 without a link.
- This would be the first glossary entry to link to a study.
- The new entries use "Term: definition". The file has both styles: 34 colon entries and 133 em-dash entries.

### Checks that came back clean

- No em dash in the new text of any of the three files.
- `oxfmt --check` passes.
- These links resolve: `docs/livenerf-study.md` from GLOSSARY.md, `livenerf-study.md` from docs/README.md, and `#evidence`.
- Probe arithmetic is consistent (556 - 433 = 123).
- These livenerf numbers match /tmp/livenerf-study/docs/VALIDATION.md, DESIGN.md and PREREGISTRATION.md:
  - 54.7% to 62.0%
  - 97% uninformative
  - A/A z 1.79 against the 1.96 criterion
  - low effort not detected at 95% (-8.3, CI -17.1 to +0.5)
  - model swap not distinguishable at 95% accuracy (-3.8, SE 6.3) or at 99% tokens (-23%, CI -46% to +8%)
  - -62% tokens with -8.3 points of accuracy
  - MDE about 2.8 SE
- The Rehearse estimator descriptions match the code:
  - `buildPairedEstimate` and `wilsonInterval` in src/benchmark/comparison-estimator.ts.
  - Confirmation SE `sqrt(p(1-p)/n)` at src/benchmark/confirmation-report.ts L102.
  - `Promise.all` at src/benchmark/confirmation.ts L193.
- The claim that comparability does not check the CLI version holds (src/benchmark/comparison-comparability.ts).

### Context sources examined

- **The change:** docs/livenerf-study.md (whole), plus the GLOSSARY.md and docs/README.md diffs.
- **Rehearse code:**
  - src/benchmark/: command.ts, claude.ts, run.ts, contracts.ts, comparison-comparability.ts, comparison-estimator.ts, confirmation.ts, confirmation-report.ts, record-summary.ts, session-attempt.ts, preflight.ts, compare-attempts.ts
  - src/server/: comparison-quality-reading.ts, comparison-what-moved.ts, process-launcher.ts
  - the sealed callers: judge.ts, root-cause-analysis.ts, stage-grading.ts, workflow.ts
- **Rehearse docs:** docs/status.md, docs/promptfoo-study.md, docs/promptfoo-study/proposals.md, CONTRIBUTING.md
- **livenerf:**
  - /tmp/livenerf-study/: README.md, PREREGISTRATION.md, PILOT.md, PLAN.md (in part), docs/DESIGN.md, docs/VALIDATION.md
  - /tmp/livenerf-study/livenerf/: providers/claudecode.py (with git history), schedule.py (with history), validate.py, preflight.py, `analysis/__init__.py`
- **The CLI:** the 2.1.289 binary through Python string search, plus `claude --help`.

### Material gaps

- The paid context and effort probes were not rerun, as the brief directed. I checked them for internal consistency only.
- Whether `CLAUDE_CODE_DISABLE_CLAUDE_MDS` and the `userSettings` source gate user-level CLAUDE.md loading is not confirmed. I saw the gate on the "User" rules only.
- I did not probe whether the manifest-based `compare` already allows an A/A comparison.
- I did not read these livenerf files in full: EVAL_CARD.md, CALIBRATION.md, all of PLAN.md, daily.py, and the tests.

## Disposition

1. **Fixed.** The study says pipeline runs record `claudeVersion` and replays,
   session attempts and confirmation groups do not, and P1 extends the existing
   field. Probe: `grep -rn -E "claudeVersion|cliVersion|claude_code_version" src --include='*.ts'`
   outside tests found only `run.ts`, `contracts.ts` and the context-evidence
   capture schema.
2. **Fixed.** Each panel question runs once a day, 90 samples with the control
   arm. Probe: `docs/DESIGN.md` line 9 in the livenerf checkout.
3. **Fixed by reframing.** livenerf's `docs/PILOT.md` lists
   `--setting-sources user` among the audit's causes, and commit `d4ff4d7`
   changed the setting source and set the four variables together. The study
   now says livenerf did not isolate the leak, drops "depends on platform or
   release", and rests the case for a probe on the entrypoint measurement. This
   changed a claim about behavior, so the study went back to the reviewer once.
4. **Fixed.** P1's probe goes through the session-case arguments and is compared
   between arms instead of against a fixed threshold, because the default
   system prompt can change between releases.
5. **Fixed as labels.** The summary, P1 and Evidence say the probe was a
   minimal call, list what a real case adds, and state that the 123 tokens'
   content was not read, that no probe used a terminal Claude Code entrypoint,
   and the spread of the other removals. The "Neither set" row is cited as a
   partial positive control and labeled as inference. No new paid probe ran;
   P1's check asks for them.
6. **Fixed.** The gap is narrowed to the command-line summary, and the
   browser's per-case Wilson intervals are named in the summary, the table and
   P3.
7. **Fixed.** The summary links the Promptfoo proposals and names the overlap,
   and P1, P3, P6 and the table credit it.
8. **Fixed.** The decision-rule bullet carries the attribution rule, and the
   table and P6 borrow it.
9. **Fixed.** The hermetic bullet lists all four variables, and P1 and Evidence
   say the two unprobed ones belong in the first probe.
10. **Fixed.** P2 refuses only sealed calls and flags a different served-model
    set for sessions.
11. **Fixed.** Each new glossary entry states what Rehearse lacks, and the
    glossary no longer links the study.
12. **Fixed.** The history clause is gone, the hashed list names generators and
    shared helpers, and the reason given is the comment above `SAMPLE_SHAPING`
    in livenerf's `schedule.py`.
13. **Fixed.** The study says the panel's items are private with hashes
    published and a synthetic panel is public.
14. **Fixed.** Deviations are described as dated and placed against the data
    they concern.
15. **Fixed.** P1 proposes the denylist for both paths, names the proxy,
    certificate and configuration variables an allowlist would have to keep,
    and drops the records variable.
16. **Fixed.** P1 says session cases receive no init event, so the version
    comes from `claude --version`.
17. **Fixed.** P4 names both refusals, the one in `compare-attempts.ts` and a
    second in `baseline-corpus.ts` found while checking this finding, and
    proposes a declared A/A mode. Whether a manifest comparison accepts
    identical arms is stated as unchecked.
18. **Fixed.** P1 and Evidence cite the resolver. Probe: a Python search of the
    2.1.289 binary showed `iw` computing `g=p??(p===null?E:void 0)??r??n??E`
    with `p=pK()`, and `pK` reading `CLAUDE_CODE_EFFORT_LEVEL`.
19. **Fixed.** The table says the launcher strips a named list of knob
    variables, and Evidence cites `process-launcher.ts`.
20. **Fixed.** The pin is `e2f7e053`. Probe: `git diff --stat bb588f8f HEAD`
    over every cited source file printed nothing. The commit stages only the
    study's own paths.
21. **Partly fixed.** The Promptfoo P2 reference is a link and the glossary no
    longer links the study. The entries keep the colon form, which 34 existing
    entries use.

Findings 1, 6, 11 and 19 are one class: a statement that Rehearse lacks
something, written without the search that would have found it. "No attempt
records the CLI version" and "Multi-case: delta and SE only" both failed on the
first search the reviewer ran. For findings 1, 6 and 19 the revised study now
names in Evidence the search or the file behind the statement.

## Follow-up reviewer report, verbatim

Finding 3 changed a claim about behavior, so the revised study went back to the
same reviewer once, with the record above and the same mandate. The report below
is the reviewer's text with the same changes as the first: headings one level
lower, Rehearse paths relative to the repository root, and one fixture path set
as code so it renders. Its line numbers refer
to the study as it stood at that review, pinned at `e2f7e053`.

**Verdict: proceed.** Nothing is blocking, but fix four things before committing. P1's proposed list of variables to drop misses parent feature flags that change which tools and agents a session under test gets. Its evidence about the advisor tool misreads the probe environment. Two passages contradict each other on whether the probes saw an init event. One claim about livenerf has no source.

HEAD is now 93134fac, two commits past the pin e2f7e053. Those commits touch none of the files the study cites (`git diff --stat e2f7e053 HEAD`).

### Status of the 21 earlier findings

| #   | Status                                                                            | Where (docs/livenerf-study.md unless named)                                                                              | How checked                                                                                                                        |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Resolved                                                                          | L27-30, L119, L171-176, L377-380                                                                                         | `git grep -n -E "claudeVersion\|cliVersion\|claude_code_version"` found only run.ts, contracts.ts and context-evidence-contract.ts |
| 2   | Resolved                                                                          | L65-68                                                                                                                   | DESIGN.md, README.md                                                                                                               |
| 3   | Resolved; one gap in the fix description (new note E)                             | L52-61, L117, L321-324                                                                                                   | `sed -n 70,100p docs/PILOT.md`, `git show d4ff4d7`                                                                                 |
| 4   | Resolved                                                                          | L178-183                                                                                                                 | Read                                                                                                                               |
| 5   | Resolved as labels; leftovers are new should-fix B                                | L26-27, L144-147, L337-339, L351-357                                                                                     | Read                                                                                                                               |
| 6   | Resolved                                                                          | L35-39, L123, L226                                                                                                       | Read                                                                                                                               |
| 7   | Resolved                                                                          | L44-50, L119, L124, L127, L175-176, L229-232, L288-290                                                                   | Read                                                                                                                               |
| 8   | Resolved                                                                          | L102-104, L127, L290-293. Matches PREREGISTRATION.md L148-150                                                            | `sed -n 136,152p PREREGISTRATION.md`                                                                                               |
| 9   | Resolved; see new should-fix B                                                    | L76-79, L165-169, L358-360                                                                                               | Read                                                                                                                               |
| 10  | Resolved                                                                          | L210-215. The fixture `src/benchmark/__fixtures__/budget-halt-envelope.json` names two models, which supports the change | python json read                                                                                                                   |
| 11  | Resolved                                                                          | All four entries now say Rehearse lacks the thing                                                                        | `git diff GLOSSARY.md`                                                                                                             |
| 12  | Resolved                                                                          | L85-90 matches the schedule.py comment                                                                                   | `sed -n 60,92p livenerf/schedule.py`                                                                                               |
| 13  | Resolved                                                                          | L110-111, L312                                                                                                           | Read                                                                                                                               |
| 14  | Resolved                                                                          | L105-106                                                                                                                 | Read                                                                                                                               |
| 15  | Resolved; the list itself is incomplete (new should-fix A)                        | L159-164                                                                                                                 | Read                                                                                                                               |
| 16  | Resolved at L173-175, but it now contradicts L168 and L360-363 (new should-fix C) |                                                                                                                          | Read                                                                                                                               |
| 17  | Resolved                                                                          | L252-257                                                                                                                 | `sed -n 50,70p src/benchmark/baseline-corpus.ts`, compare-attempts.ts L342                                                         |
| 18  | Resolved                                                                          | L147-152, L368-371                                                                                                       | Read                                                                                                                               |
| 19  | Resolved                                                                          | L118, L375-377                                                                                                           | Read                                                                                                                               |
| 20  | Resolved for e2f7e053; HEAD has since moved (note I)                              |                                                                                                                          | `git log --oneline -5`, `git diff --stat e2f7e053 HEAD`                                                                            |
| 21  | Resolved within the no-em-dash constraint                                         | L130 link, anchor `#p2-make-the-supported-claim-part-of-the-comparison` matches proposals.md L77                         | Python link check                                                                                                                  |

### New findings

**A. Should-fix: P1's drop list leaves the parent's feature flags on a session under test.**

- **Where:** L154-159.
- **What I saw:**
  - This review's environment, which runs under the same desktop parent the study names at L8, carries about 50 Claude-related variables (`env | cut -d= -f1`).
  - `printenv` showed these set to 1: `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS`, `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS`, `DISABLE_MICROCOMPACT`, `CLAUDE_CODE_DISABLE_ADVISOR_TOOL`, `DISABLE_AUTOUPDATER`.
  - Also present: `CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL`, `CLAUDE_CODE_DISABLE_POLICY_SKILLS`, `CLAUDE_CODE_DISABLE_CRON`, `CLAUDE_CODE_TERMINAL_MCP_TOOLS`.
  - A Python string search of the 2.1.289 binary finds `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS`, `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS`, `CLAUDE_CODE_SUBAGENT_MODEL(_FORCE)` and `MAX_THINKING_TOKENS` ("unset MAX_THINKING_TOKENS=0").
  - livenerf removes `CLAUDE_CODE_SUBAGENT_MODEL` and `MAX_THINKING_TOKENS` (/tmp/livenerf-study/livenerf/providers/claudecode.py L48-61). It also drops every `CLAUDE_CODE_*` variable except OAuth, and its comment names "feature flags from a parent session" (L62-64). P1's list has neither variable; `CLAUDE_CODE_SUBAGENT_MODEL` is not an `ANTHROPIC_MODEL` sibling.
- **How it goes wrong:** A session case that uses built-in agents would run with them disabled from the desktop app but enabled from a terminal. The record would show identical declared inputs. The probe used `--tools ""`, so it could not see this. That each flag changes behavior is my inference from its name; I did not observe it.

**B. Should-fix: the advisor-tool reasoning and the removal list misread the probe environment.**

- **Where:** L349, L351-352, L358-360.
- **What I saw:** `printenv CLAUDE_CODE_DISABLE_ADVISOR_TOOL` printed `1` in this review's desktop-launched environment.
- **How it goes wrong:**
  - If the author's probe shell matched (inference, not observed), every probe ran with the advisor tool disabled. L358-360 says no probe set that variable and that the use of haiku could hide an advisor tool. The likelier reason the probes showed no advisor tool is that the parent had already disabled it.
  - Started from a terminal, the same probe would have the advisor tool enabled. That is a launch-context difference the study never names.
  - The table row at L349 ("one other parent variable removed at a time") reads as if every parent variable was tested. L351-352 shows only about seven of roughly fifty were removed.

**C. Should-fix: the doc contradicts itself on the init event.**

- **Where:** L168-169 and L360-363, against L173-174 and L333.
- **What I saw:**
  - L333 says every probe used `--output-format json`.
  - L173 says json "carries no init event".
  - L168 and L361 cite "a session-case call's init event" naming an auto-memory directory, and L360 cites the skills that call listed.
- **How it goes wrong:** If no probe used stream-json or `--verbose`, the auto-memory and skills evidence has no recorded source. If one did, it is missing from Evidence, and the json-versus-init statement deserves a second look. That json output carries no init event is something I inferred in my first report; no command here checked it. How I checked: reasoning over the lines above.

**D. Should-fix: "undocumented" endpoint has no source.**

- **Where:** L132 ("undocumented OAuth usage endpoint") and L314 ("an endpoint Anthropic does not document").
- **What I saw:** `grep -rn -i -E "unofficial|not documented|undocumented"` over livenerf's .md and .py files found nothing. /tmp/livenerf-study/livenerf/usage.py L1-9 only says the endpoint is the one `/usage` reads.
- **How it goes wrong:** The goal requires every factual claim to match a source. I could not check Anthropic's documentation from here.

**E. Note: the fix description leaves out part of livenerf's fix.**

- **Where:** L58-59.
- **What I saw:** `git show d4ff4d7` and /tmp/livenerf-study/docs/PILOT.md L85-90 show the same fix also dropped every inherited `CLAUDE_CODE_*` variable and fixed the working directory.
- **Why it matters:** livenerf's 11.2k-to-0.55k drop therefore includes the entrypoint-style effect P1 rests on. L323-324 partly covers this.

**F. Note: "Neither set" is not the user setting source.**

- **Where:** L189-191, "the user setting source ... as the 'Neither set' row did".
- **Why:** "Neither set" passes no `--setting-sources`, so it loads the default sources, not `user` alone. Reasoning only.

**G. Note: "narrows nothing" is wrong arithmetic.**

- **Where:** L269-270.
- **What I saw:** A Python run on case deltas [0.4, 0.2] gives mean 0.3, SE 0.1. Adding eight zero cases gives mean 0.06, SE 0.043, so z falls from 3.0 to 1.41.
- **Why it matters:** Cases that always pass do narrow the SE. The harm is that they dilute the mean. P5's conclusion stands; its stated reason does not.

**H. Note: the disposition overstates the Evidence section.**

- **Where:** docs/livenerf-study/review.md L283-284 says the study "names the search behind each such statement in Evidence".
- **What I saw:** Evidence (L374-394) names files, not searches. Two examples are L378-379 "no replay ... record carries it" and L393 "No source file mentions a detectable effect".
- **Are the claims true?** Yes. `git grep -n -i -E "detectable|statistical power|\bpower\b|\bmde\b"` over src and client, non-test, returned nothing, and the version grep in row 1 above confirms the other.

**I. Note: the pin is behind HEAD.** L6 pins e2f7e053, and HEAD is 93134fac. `git diff --stat e2f7e053 HEAD` lists only short-id, run-history, list-command and reference.md changes, none of them cited.

**J. Note: an error of mine is reproduced in the record.** My first report cited `/tmp/livenerf-study/PILOT.md`, and review.md L46 repeats it. The real path is `docs/PILOT.md` (`git ls-files | grep -i pilot`).

**K. Note: the hashed-file list is incomplete.** L87-88 omits `livenerf/benchmarks/data.py`, which `SAMPLE_SHAPING` includes (schedule.py L69-71).

**L. Note: evidence layout differs from the sibling studies.** Both keep evidence in a separate file: docs/promptfoo-study/evidence.md and docs/typesafe-study/evidence.md. This study keeps it inline at L329-399 and gives no exact probe command lines. How I checked: `grep -n "evidence.md"` on both sibling studies.

### Clean checks

- **Em dashes:** none in the study, review.md, docs/README.md, or the added GLOSSARY.md lines (Python scan for U+2014 and U+2013).
- **Formatting:** `./node_modules/.bin/oxfmt --check` passed on all four files.
- **Links and paths:** every relative link resolves, and no personal absolute path appears. Only `~/.claude` and the temporary `/tmp/livenerf-study` clone, which the review header explains.
- **livenerf figures:** 78 items, A/A +6.4 (z 1.79), low effort -8.3 (CI -17.1 to +0.5), tokens -62% and -26% with intervals excluding zero, and model swap -23% (CI -46% to +8%) all match docs/VALIDATION.md. The decision rule matches PREREGISTRATION.md. "Claude on Claude" matches PREREGISTRATION.md L109, and "one machine, one account" matches docs/EVAL_CARD.md L87.
- **Rehearse code:**
  - `modelUsage` is stored and never checked (claude.ts L247-285).
  - `controlSha` is on pipeline records (contracts.ts L562).
  - Confirmation starts all reps with `Promise.all` (confirmation.ts L193) and uses the binomial SE (confirmation-report.ts L102).
  - `sessionCaseArgs` flags match L336-338.
- **Global instruction file:** `~/.claude/CLAUDE.md` is 12,020 bytes, consistent with "12 KB" at L356.

### Sources examined

- **The change:** the study (whole), review.md (whole), and the GLOSSARY.md and docs/README.md diffs.
- **Rehearse code** (all under src):
  - claude.ts, session-attempt.ts, contracts.ts, run.ts
  - baseline-corpus.ts, compare-attempts.ts, confirmation.ts, confirmation-report.ts
  - comparison-quality-reading.ts, comparison-what-moved.ts
  - the budget-halt fixture
- **Sibling studies:** the promptfoo and typesafe study files and their review.md records.
- **livenerf** (/tmp/livenerf-study):
  - livenerf/: providers/claudecode.py, schedule.py, usage.py
  - docs/PILOT.md, docs/VALIDATION.md, PREREGISTRATION.md, README.md, CLAUDE.md
  - tests/test_provider.py
  - commit d4ff4d7
- **The CLI:** the 2.1.289 binary through Python string search, and this review's environment variable names and selected values.

### Material gaps

- This review's environment is a sub-agent of the session. That the author's probe shell had the same variables is inference.
- I did not check what effect each feature flag has.
- I ran no paid probes, so I could not settle whether json output carries an init event.
- I could not check Anthropic's documentation for the usage endpoint.
- I did not check whether a manifest comparison accepts identical arms.

## Final disposition

The verdict was proceed. Every finding is folded below and no further round ran,
because the gate allows one rerun.

- **A. Fixed.** P1 now drops every inherited `CLAUDE_CODE_*` variable except
  login and provider selection, plus `CLAUDECODE`, `CLAUDE_EFFORT`,
  `CLAUDE_AGENT_SDK_*`, `MAX_THINKING_TOKENS` and the model variables, and
  records the names of Claude and Anthropic variables still inherited. P1 and
  the summary name the built-in agent flags. Probe: a string search of the
  2.1.289 binary found `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS` in the
  function that returns the built-in agent set, found
  `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS`, `CLAUDE_CODE_SUBAGENT_MODEL`,
  `MAX_THINKING_TOKENS`, `CLAUDE_CODE_USE_BEDROCK` and `CLAUDE_CODE_USE_VERTEX`,
  and found no `DISABLE_MICROCOMPACT`, so the study does not claim that flag has
  an effect. `git grep` over `src` found no `CLAUDE_CODE_`, `CLAUDECODE` or
  `ANTHROPIC_` variable that Rehearse sets itself, so a prefix drop removes only
  inherited values.
- **B. Fixed.** Evidence states the probe shell's inherited flags, read with
  `env` from that shell, and says every probe ran with the advisor tool
  disabled. The table row now reads "seven other named variables, in five
  removals"; the transcript of the probe commands shows the messaging pair, the
  session-id pair, and three single removals, at 553 to 560 tokens.
- **C. Fixed.** Evidence names the separate `--output-format stream-json
--verbose` call as the source of the skills and auto-memory observations. P1
  says the json probes returned one result object with no init event, which is
  how every probe's output was parsed.
- **D. Fixed.** The table and What does not transfer describe the endpoint as
  the one behind Claude Code's `/usage` command, the wording of livenerf's
  `livenerf/usage.py`.
- **E. Fixed.** The summary lists all four parts of livenerf's fix and says its
  drop includes an inherited-variable effect.
- **F. Fixed.** P1's check says the default setting sources.
- **G. Fixed.** P5 says always-pass cases shrink the standard error but dilute
  the mean more, with the reviewer's example. Probe: Python on deltas
  [0.4, 0.2] gave z 3.0, and with eight zeros added, mean 0.06, SE 0.0427 and z
  1.41.
- **H. Fixed.** The pattern sentence above is limited to findings 1, 6 and 19,
  and Evidence now names the version search and the detectable-effect search.
  Probe: both searches, rerun at the new pin, returned what Evidence states.
- **I. Fixed.** The pin is `eafb19ef`. Probe: `git diff --stat e2f7e053 HEAD`
  listed only run-history, short-id, list-command and `docs/reference.md`
  changes, and the same diff restricted to every file the study cites printed
  nothing.
- **J. Noted.** Finding 3 of the first report cites
  `/tmp/livenerf-study/PILOT.md`. The file is `docs/PILOT.md` in the livenerf
  checkout. The verbatim report is left as written.
- **K. Fixed.** The hashed-file list names benchmark data.
- **L. Fixed in part.** Evidence now gives the exact command of one context
  probe and how the other rows differ from it. Evidence stays inline because
  this study has one set of probes, not the separate evidence base the
  Promptfoo and TypeSafe studies keep.
