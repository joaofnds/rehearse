# What Rehearse should learn from Promptfoo

Study date: **2026-09-16**. Status: **research and proposals; no vision or roadmap
change is accepted by this document**. Promptfoo was studied at
`e299e30c27d4da9c68c4a4e375ccfc332e78808a` (package version `0.123.0`); Rehearse at
`a8936af582b8ff5cdec660f9160b692f254f0451`, initially clean. The
[evidence record](promptfoo-study/evidence.md) describes source provenance,
working-tree state, execution, coverage and remaining gaps.

## Decision summary

Rehearse should borrow Promptfoo's accessible test authoring, connected result
inspection, explicit provider lifecycle handling, and automation formats.
Its most valuable opportunity is to make a realistic instruction experiment
easier to finish: reproduce a failure, preserve the agent's work, test a focused
instruction change, and explain what the comparison supports.

Keep Rehearse's baseline/candidate/minimal-control design, frozen inputs,
checkpoint replay, retained failed attempts, and distinction between debugging
and confirmation. These are product advantages for its intended question.
Promptfoo's generic prompt/provider/test matrix addresses a broader set of
systems, but does not by itself establish the effect of an instruction change.
The [architecture account](promptfoo-study/architecture.md) explains the
mechanisms and limits behind this conclusion.

Rehearse's own evidence standard also needs work. Its current small-sample
reliability formulas can look overconfident; its session grades cannot yet prove
produced-code correctness; its confirmation runner launches all repetitions at
once. Improving those boundaries has higher expected value than adding a large
provider catalog or copying Promptfoo's security dashboard.

The recommended sequence is:

1. Complete the **already accepted realistic-session loop**, including isolated
   skill delivery, retained artifacts, outcome grading and a public example.
2. Extend comparisons with **claim scope and uncertainty guidance**, and add
   **bounded execution with explicit environment evidence**.
3. Finish the accepted context work as a **failure-to-hypothesis-to-comparison
   workflow**, using common saved evidence across browser and CLI.
4. Add portable regression reports; investigate paid CI, a second agent runtime,
   and stronger isolation only after the relevant evidence contracts hold.

The [proposal catalog](promptfoo-study/proposals.md) specifies user problems,
evidence, adaptations, costs, dependencies, validation, and rejected options.
No numerical product benefit is claimed without a real experiment.

## What Promptfoo is good at

Promptfoo turns a suite of prompts, providers and cases into an inspectable
matrix. Assertions can combine direct checks, custom scorers, model Judges and
trace checks. Its CLI, library, browser and integrations surround the same
execution machinery. Developers can start with a small example and extend it
into CI; security users can generate adversarial tests and inspect attack
reports. Open-source local capabilities and commercial collaboration are
separate parts of that product. [Product and architecture](promptfoo-study/architecture.md#product-and-first-use).

This breadth is useful when the tested system is an API, a RAG application or an
agent behind a provider adapter. It also puts responsibility on the author to
choose valid cases, meaningful grades, state reset, cache policy, controls and
an appropriate decision rule. Rehearse can offer a narrower, stronger contract
for an engineer deciding whether to keep an instruction.

Promptfoo is also more relevant to coding agents than a superficial “prompt
comparison tool” description suggests. Its Claude Agent SDK, Codex SDK and Codex
app-server adapters expose real tools, sessions, metadata, usage and traces.
Their treatment of reused threads, aborts and protocol timeouts is useful
engineering material. A provider call still does not restore a repository and
workflow checkpoint for a controlled rerun.
[Agent runtime comparison](promptfoo-study/architecture.md#running-coding-agents).

## Comparison against Rehearse's actual position

Rehearse's [current state](status.md) is the feature inventory. Its
[context roadmap](context-visibility.md#accepted-roadmap) and
[context-analyzer follow-on](context-visibility.md#integration-and-artifact-investigation)
are accepted direction. The design prototype and longer-term vision are not
implemented behavior. The following table uses those distinctions rather than
marking every roadmap item as absent.

| Capability or question                  | Promptfoo at the pinned revision                                                                         | Rehearse implemented                                                                                                | Accepted or aspirational Rehearse work; implication                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| First useful test                       | Example/interactive CLI/browser setup; declarative matrix                                                | Public narrow session recipe; some pipeline cases depend on private setup                                           | Public pipeline inputs and realistic session loop are priorities; package a coding outcome example                          |
| Configuration and datasets              | Inline/files/scripts, defaults, scenarios, variables and external sources                                | Typed cases, fixtures, transcript prefixes, corpus layout and checkpoints                                           | Richer session grading planned; freeze resolved inputs before expanding imports                                             |
| Deterministic and semantic grades       | Broad assertions, component/named scores, model rubrics; aggregate thresholds can compensate for failure | Reply/tool session checks; sealed pipeline Judges, deterministic overrides, citation checks and calibration         | Artifact and command scorers, saved regrading planned; retain hard gates                                                    |
| Repetition and controls                 | Separate repeated rows with cache namespaces; generic conditions and pass-rate gates                     | Frozen groups, baseline/candidate/control arms, paired case estimates, unsuccessful reps retained                   | Claim guidance and small-sample decision policy need shaping; do not import generic pass-rate winner semantics              |
| Coding environment                      | Real agent adapters, configurable SDK policies; caller owns workspace reset                              | Temp session directories; pipeline restoration; confirmation/replay worktrees                                       | Isolated skill delivery and retained session state planned; worktrees remain host execution                                 |
| Replay and recovery                     | Session resume, evaluation resume, cache reuse, retry of errors in place                                 | Checkpoint lineage and stage replay; original attempt/group records                                                 | Preserve distinction between conversational continuation, batch recovery and experimental replay                            |
| Trajectory and grading inspection       | Result detail joins prompt/output/grades/metadata/traces; OTEL and media support                         | Saved session source/event/request views; linked comparison evidence                                                | Unified index, pipeline/reviewer capture, artifact previews and integration breakdown already accepted                      |
| Instruction, token and cost attribution | Skill metadata, tool/turn spans, aggregate/model usage; some cost reported, some estimated               | Declared/observed distinctions; transcript request timeline; frozen-rate normalization seam                         | Direct/descendant accounting and richer collection accepted; neither invocation nor a span proves marginal instruction cost |
| Automation and extensibility            | Library, custom providers/hooks, MCP, CI gates and exports                                               | Scriptable CLI and local read API; pipeline JSON output had a progress-mixing limitation, resolved since this study | Shared bounded queries/read-only MCP and aggregate export accepted; CI is a proposal                                        |
| Security and team operations            | OSS adversarial testing; hosted/on-prem team/RBAC offerings documented separately                        | Local unauthenticated loopback UI; coding correctness/integrity focus                                               | Adapt adversarial fixtures; general security/compliance/hosting product deferred                                            |

Promptfoo evidence is detailed and linked in the
[architecture account](promptfoo-study/architecture.md); Rehearse code locations
and execution results are indexed in the [evidence record](promptfoo-study/evidence.md).

## Do the results justify the conclusion?

The relevant comparison is the chain from input to claim, not the number of
metrics on the screen.

**An observed failure can justify investigation.** A trajectory showing repeated
large tool outputs is enough to ask whether a review instruction causes excess
work. It is not enough to delete that instruction: the extra work may catch a
rare defect. Promptfoo's result/trace navigation helps locate the observation;
Rehearse's accepted source and request views can support the same step.

**A grade must measure the intended outcome.** Calling `bun test` does not prove
the tests passed, that they were unchanged, or that they test the requirement.
Likewise, a model Judge can satisfy its JSON schema while misunderstanding the
artifact. Rehearse needs preserved outputs and verifier integrity for session
cases, then calibration against human-reviewed defects where semantic judgment
is unavoidable. The deterministic threshold probe in Promptfoo demonstrates why
hard gates must remain distinct from compensating scores.
[Grading findings](promptfoo-study/architecture.md#grading-and-the-meaning-of-a-score).

**A better run is not yet a better instruction.** Freeze task, fixture, project
instructions, corpus variants, model/effort, grading and upstream artifacts.
Record uncontrolled environment and service state. Repeat fresh executions and
compare cases, keeping failures and unknown measurements visible. Promptfoo's
repeat caches avoid duplicate samples within a repeated batch, but subsequent
cached evaluations are not new behavioral trials. Rehearse already enforces
many comparability conditions; its estimates need stronger claim guidance.
[Validity findings](promptfoo-study/architecture.md#repeated-trials-regressions-and-reproducibility),
[P2](promptfoo-study/proposals.md#p2-make-the-supported-claim-part-of-the-comparison).

**Attribution and optimization require different evidence.** Recorded request
usage can support accounting for a child agent's work, while the savings caused
by changing its instructions require a controlled comparison. Preserve that
distinction across tokens and dollars. A lower cost accompanied by inconclusive
quality is not evidence that quality was preserved. A candidate selected from
many edits needs confirmation outside the cases used to select it.

For example, an engineer suspects a review skill repeatedly reloads whole files.
The completed product should let them locate those deliveries, preserve a task
with known defects, propose a smaller-evidence review variant, grade detection
and verifier integrity, compare baseline/variant/minimal control, and retain the
result even if it shows no benefit. The accepted review-efficiency benchmark
already provides this product test. P4 joins that work rather than creating a
new generic tracing initiative.

## Challenges to the current vision

These proposed revisions should be decided explicitly before changing
[vision.md](vision.md). They preserve the current hypothesis where it remains
useful and name what would justify extending it.

| Current premise                                              | Challenge and proposed revision                                                                             | Why / decision gate                                                                                                                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intended user maintains “their own corpus”                   | Consider “engineers maintaining coding-agent instructions for themselves or a team”                         | Promptfoo shows a coherent path from local tests to reviewable reports. Rehearse already has corpus identities and saved evidence. Validate team report review before building accounts or collaboration |
| Use the real agent CLI on the engineer's machine             | Preserve real-runtime fidelity, while allowing explicit host or isolated execution profiles                 | Host state and external services can confound results; adversarial fixtures need stronger boundaries. Require a fidelity/capability study before a sandbox promise                                       |
| Repeated runs and displayed uncertainty support confirmation | Add a declared claim, task population, acceptance rule, stopping plan and discovery/confirmation separation | Current formulas and small suites can produce deceptively precise readings. Shape P2 before broad improvement claims                                                                                     |
| Instruction corpus is the unit being improved                | Treat the instruction change as the treatment within a recorded environment and verifier contract           | Project instructions, tools, permissions, graders and task state affect outcomes. Widen the recorded condition without becoming a general agent benchmark                                                |
| Context inspection explains cost                             | State separately what was observed, what is allocated, and what changed under intervention                  | Existing vision already makes much of this distinction. Make it a report contract rather than promise exact causal dollars per instruction                                                               |

The strongest alternative is to use Promptfoo directly for general model/API
selection and keep Rehearse specialized in instruction changes, frozen coding
artifacts and explanation. There is not enough evidence here to pivot Rehearse
into a general LLM evaluation or security platform. There is also no reason to
preserve “personal use only” or “host execution only” as permanent constraints
if focused investigations demonstrate better outcomes.

## Decisions this study enables

- Choose the realistic session outcome loop as the first product demonstration,
  reusing accepted plans rather than duplicating them.
- Shape claim guidance and bounded execution as concrete extensions to the
  existing measurement system.
- Make saved evidence lead into an instruction hypothesis and comparison;
  retain the accepted saved-before-live order.
- Adopt reporting and lifecycle patterns selectively; defer engine replacement,
  autonomous optimization, a broad provider catalog and commercial-platform parity.
- Decide whether to investigate the proposed audience/runtime revisions without
  treating them as accepted direction.

The study establishes mechanisms and failure modes through source inspection,
two provider-free CLI probes and focused tests. It does **not** establish real
agent performance, sandbox fidelity, grader validity on Rehearse tasks,
commercial feature behavior, UI usability, numerical savings or product demand.
The [investigation table](promptfoo-study/proposals.md#investigations-before-implementation-commitments)
names the evidence needed to resolve those uncertainties.
