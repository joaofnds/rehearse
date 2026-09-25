# Context visibility and instruction efficiency

Assessed on **2026-09-11**, against implementation commit
`abc6855a6860efe5e390d5c7a55db5e2bcb6049b`, maintained documentation, the design
handoff, and the maintainer's roadmap. The product direction and delivery
sequence are accepted. Implementation details still require shaping; the
capabilities in that baseline remain an assessment of that revision. For current
implementation, use [status](status.md). The accepted delivery map below also
records the **2026-09-14** follow-on outcomes from the
[context-analyzer study](context-analyzer-study.md).

## Product conclusion

Rehearse already aims to compare quality with cost. It has useful foundations
for inspecting context, but neither its implementation nor its existing plans
cover an extensive account of context growth. The missing capability connects
three questions: what entered an agent's context, what work and resource use
followed, and whether changing the instructions preserves the outcome.

The motivating case is a review procedure that produces valuable results but
consumes too much context. Success means retaining its ability to find problems
while spending fewer tokens. A shorter instruction file, a smaller final reply,
or a lower dollar total alone would not establish that success.

Context inspection belongs in the debug loop now. Quality and reliability
remain the standard for accepting the resulting edits in the confirmation loop.
This extends the [vision](vision.md) rather than replacing its evaluation focus.

## What exists, what is planned, and what is missing

| Question                                   | Implemented evidence                                                                                                                      | Existing intention                                                                                          | Gap for this use case                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Which inputs defined the experiment?       | Corpus digests, case inputs, checkpoints, lineage, and supported frozen confirmation inputs                                               | Broader isolated session skill delivery                                                                     | Hashing a file does not establish when its contents entered context                                                  |
| Which instructions or files were observed? | Session manifests recognize Skill calls, certain Read paths, and the last output-style attachment; entries distinguish corpus and project | Pipeline transcript capture, file-use roles, and an instruction list per step                               | No general file inventory, load history, successful-result check, repeated-load count, or source-content attribution |
| How did context grow?                      | Retained session JSONL can be inspected manually; the parser extracts tool uses and output styles                                         | Live monitor with aggregate token readings and progress                                                     | No per-request context series, opening-context baseline, compaction history, or content breakdown                    |
| Where were tokens spent?                   | Provider envelope metrics and comparison resources include input, output, cache reads/writes, and cost; reports separate harness roles    | Tool errors/repeated-command diagnostics and elapsed-time comparisons                                       | No linked per-request usage, instruction-load contribution, or nested reviewer accounting                            |
| Can the operator inspect this visually?    | Run history, corpus inventory, and saved comparison views                                                                                 | Live monitor, run detail, instruction lists, openable Judge citations                                       | No context timeline, source explorer, agent lanes, or context comparison                                             |
| Did a cheaper review retain its quality?   | Deterministic session checks, pipeline Judges, repeated trials, and multi-case comparisons                                                | Frozen session skills, preserved post-session state, richer scoring, regrading, and single-case comparisons | No demonstrated review-efficiency benchmark connecting diagnostic changes to retained review quality                 |

Sources: [session execution](../src/benchmark/session-attempt.ts),
[manifest construction](../src/benchmark/context-manifest.ts),
[transcript parser](../src/benchmark/transcript.ts),
[provider metrics](../src/benchmark/claude.ts),
[comparison resources](../src/benchmark/comparison-resources.ts),
[run events](../src/benchmark/run-events.ts), and
[client routes](../client/src/router.tsx). The
[design reference](design-handoff/SPEC.md) describes intended screens, not
evidence that those screens or their backing data exist.

### Limits that affect interpretation

The session manifest is a deduplicated set of names. It loses repeated reads
and their timing, keeps only the last output style, and recognizes project
reads only when they match declared project paths. Its project matcher uses
path suffixes rather than the attempt's root boundary. Other file paths,
shell-based reads, and automatic instruction injection are not comprehensively
represented. A Read or Skill invocation is an observed request; the manifest
does not join it to a successful tool result. Its `unloaded-file` label means
no recognized observation, not proof that the file was absent from context.

Observed entries carry path and corpus/project half, without the bytes read or
a hash. Declared corpus hashes are separate evidence. Reading today's file
cannot recover the version, excerpt, or truncated result seen earlier. The
corpus screen's `readBy` count also comes from recorded corpus inventories,
those of checkpoints, stopped stages, session attempts, replays and confirmation
groups, not
observed session reads
([invalidation counts](../src/benchmark/corpus-invalidation.ts)).

Session attempts preserve the main transcript before normal cleanup, including
handled execution failures. An absent transcript is currently saved as an empty
file. The parser also treats absent input as empty and ignores unsupported
records. Failed and no-reply attempts do not receive a context manifest. These
boundaries must remain visible when deriving diagnostics from old records.

Session checks and manifests exclude a resumed prefix. A context view needs
that prefix as inherited starting context while excluding its historical work
from the new attempt's activity and spend. Content already present can still be
processed and charged on requests made during the new attempt.

Pipeline stages and replays retain structured exchanges and harness provider
call evidence, not a captured raw transcript tree. Harness roles distinguish
the worker, Product Owner, stage Judge, and final Judge. They do not identify
reviewers launched inside a worker. An aggregate CLI invocation can contain
many model requests; it is not a point-in-time context measurement.

The event API has no token or instruction-load fields and is best effort. Its
spend scope also varies: worker turns report the current stage's worker spend,
stage completion includes its Judge, and run completion reports the whole run.
Those values cannot be graphed as a continuous run-wide cumulative series
without normalization ([workflow](../src/benchmark/workflow.ts),
[lifecycle recording](../src/benchmark/run-abort.ts)). SQLite progress history
cannot be the sole durable source for a context report.

## Measurements to keep distinct

| Reading                          | What it answers                                                                                                       | Required qualification                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Content introduced               | How much instruction text, source material, tool output, conversation, or other content entered this agent's history? | Prefer actual delivered results, including partial reads and truncation; label token estimates and their method                   |
| Context at a request             | How much context did this agent carry into this model request?                                                        | Use supported request measurements or an explicitly labeled reconstruction; preserve unknown components and compaction boundaries |
| Tokens processed across requests | How much input, output, cache-read, and cache-write usage did the task incur?                                         | Reused context can count on multiple requests; retain provider field meanings and deduplicate request evidence                    |
| Cost and elapsed time            | What did the experiment cost, and how long did it take?                                                               | Keep provider-reported cost, token categories, elapsed time, and concurrent execution distinct                                    |
| Outcome quality                  | Did the review still find important problems and avoid unsupported findings?                                          | Hold grading fixed and use repeated trials appropriate to the decision                                                            |

Cached context still occupies context. Reading a file once can contribute to
later request usage without another file read. Reading it twice can append
duplicate content. Compaction can reduce active context while cumulative usage
continues to increase. These require separate visual readings.
Claude Code's [prompt caching documentation](https://code.claude.com/docs/en/prompt-caching)
describes repeated context submission and separate cache accounting; it does
not provide a causal dollar price for each instruction file.

Distinguish an instruction being available in a catalog, declared as an input,
delivered by the harness, invoked, and observed entering context. None proves
that the model followed it. Work occurring after a review instruction loads
does not establish that the instruction caused all that work. A report can
identify an expensive interval or a pruning hypothesis; controlled reruns must
establish the effect of the edit.

## Cost attribution from the same usage evidence

Token and cost attribution belong in the same investigation. Selecting a skill
invocation, subagent, step, or task should show its attributable token usage and
corresponding cost together, with the executing model attached to each request.
Mixed-model work must be priced request by request before aggregation.

For known billing categories, the token charge is the sum of each category's
tokens multiplied by its applicable per-token rate. Input, output, cache reads,
and cache writes can have different rates; the provider and execution mode can
also affect pricing. Retain the rate source and effective version with the
calculation so later price changes do not silently reprice historical work.
These distinctions follow the provider's
[pricing documentation](https://platform.claude.com/docs/en/about-claude/pricing).

Keep provider-reported cost and calculated token cost identifiable. Show any
unexplained difference or missing rates, and separate additional non-token
charges where available. A calculation using public API rates is an estimate
under those rates, not necessarily the user's subscription or negotiated bill.

Attribute requests to observable execution boundaries. For a skill that launches
reviewers, show its own execution cost and its cost including descendants.
Shared requests or overlapping skills need an explicit allocation rule or an
unattributed remainder. Summing parent totals that include children together
with those same children would count their cost twice. A file's estimated token
size remains useful evidence of content introduced; pricing that size once is
not the cost of executing the skill or the savings from removing it.

The roadmap carries these observable requirements:

- Selecting a skill invocation or subagent shows tokens and cost for the same
  scope, with request/model provenance and a visible attribution basis.
- A skill's own and descendant-inclusive totals are distinguishable; the task
  total counts each request once and exposes shared or unattributed usage.
- A mixed-model, mixed-cache fixture is priced with each request's applicable
  rates, and a later rate-table change leaves its recorded calculation intact.
- Missing attribution, rates, or usage produces incomplete or unavailable
  readings. Provider-reported and calculated totals remain distinguishable.
- Comparing variants shows token and cost deltas beside the unchanged quality
  criteria, allowing the same evidence to explain both resource effects.

## The visual investigation

The entry point should be an attempt's context history, reachable from a run,
case result, or comparison. Keep the existing UI vocabulary: task for pipeline
and step for stage. Each repetition is an inspectable attempt, not an averaged
trajectory.

1. **A context timeline.** Show context at request boundaries with a separate
   cumulative usage view. Overlay instruction loads, file/tool results, errors,
   compactions, resumes, stage changes, and agent starts/finishes. Selecting a
   growth point opens the events and evidence that account for it. Use event
   order when timestamps are absent; do not invent a time scale or interpolate
   through missing measurements.
2. **Separate agent lanes.** Show the worker, its reviewers, the Product Owner,
   and evaluation Judges with their own histories and parent links. Distinguish
   fresh, resumed, and inherited context where observable. A review can reduce
   the parent's context while increasing total usage across agents. Concurrent
   agents have separate windows; their sum is not one context window.
3. **A source explorer.** Show an instruction or file's recorded version or
   unavailable state, first observation, subsequent reads, receiving agents,
   delivered excerpts, and observed trigger or parent event. Rank sources by
   introduced content and repeated delivery where supported. Include ordinary
   files, tool output, and an explicit unclassified remainder, so an instruction
   filter cannot hide the largest source of growth.
4. **A comparison view.** Put quality and reliability beside context peaks,
   token categories, cost, duration, and repeated deliveries. Drill into a pair
   of attempts and align by meaningful stage or event boundaries; different
   trajectories need not have matching turn numbers. Show distributions and
   missing evidence rather than suggesting one cheaper attempt settled it.

Charts and tabular evidence should share selection and filters. Keyboard
navigation, readable unknown states, and source links matter as much as the
chart. Live monitoring should consume the same interpretation as saved reports,
so reopening a run does not change the meaning of its measurements.

## Collection approach and feasibility

Leaving this to manual transcript reading would avoid a new subsystem, but
would not satisfy visual diagnosis across attempts and agents. Plotting only
current aggregate metrics would be cheaper and still could not explain context
growth. The recommended approach is incremental collection and deterministic
derivation from saved evidence, adding provider signals where necessary.

Start with existing JSONL and immutable experiment inputs. Preserve source
locators, request/tool identifiers, session and parent identity, ordering,
provider version, and collection coverage before deriving charts. Content
estimates must carry their method; unsupported system content, tool definitions,
images, or hidden provider work remain explicit unknowns. A load hook followed
by a filesystem hash is still not proof of the exact bytes loaded if the file
changed in between.

Current official provider documentation offers plausible additional sources:

- [InstructionsLoaded hooks](https://code.claude.com/docs/en/hooks#instructionsloaded)
  describe paths, load reasons, and triggering/include relationships for
  supported instruction files. This is a candidate for automatic loads invisible
  to the Read/Skill parser, not a promise to observe all skills or file contents.
- [Usage telemetry](https://code.claude.com/docs/en/monitoring-usage#api-request-event)
  describes request timestamps, identifiers, usage categories, and request
  origin. It is a candidate for joining usage to the transcript and separating
  requests within one CLI invocation.
- [Subagent transcripts](https://code.claude.com/docs/en/sub-agents#resume-subagents)
  are documented separately from the main transcript, with compaction evidence
  and differing fresh/forked context behavior. Capturing only the main file
  cannot be assumed to cover a review tree.

These are documented possibilities, not locally validated integrations. No
`claude` executable was discoverable on this assessment's PATH. The collection
investigation must check the actual CLI version and execution modes, available
fields, identifier joins, dropped/duplicate events, resumed counter semantics,
and whether parent usage already includes children. Never add child totals to
a parent aggregate until that accounting boundary is established.

Instrumentation can change an experiment. Record its configuration, keep it
consistent across arms, and measure its overhead. Prefer collection that does
not inject prompts or call another model. Keep raw evidence local, define
retention and redacted export behavior, and make missing capture visible.
Preserve compatibility with older records; analysis must not rewrite their
historical observations.

## Accepted roadmap

The product direction follows the requirement to explain context use while
preserving quality. This sequence has independently useful
exits. Exact schemas, tokenizer choice, provider integration, UI design, and
statistical acceptance thresholds remain work for the relevant shaping tasks.

Cost attribution is part of these slices: request pricing accompanies the
measured timeline, skill and subagent totals accompany the review tree, and
cost deltas accompany efficiency comparisons. It is not a separate later phase.

| Slice                                    | Operator-visible exit                                                                                                                 | Existing work to reuse                                                                            | New scope                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved-session inspection                 | Open ordered Read/Skill calls, results, repetitions, errors, and source locations; prefix and missing-evidence boundaries are visible | Session transcripts and planned transcript diagnostics                                            | General observed file coverage, result/locator identity, repeat history, and the first browser context view                                               |
| Measured context timeline                | Select a request and see supported context/usage readings and nearby loads; compacted, missing, and estimated readings are distinct   | Provider metrics and record architecture                                                          | Validate collection, retain per-request usage and automatic loads, preserve initial context, and derive the timeline                                      |
| Complete task and review tree            | Follow a pipeline step or replay into its reviewers and inspect each agent's evidence, including failed attempts                      | Planned pipeline raw capture and file roles                                                       | Pipeline observed manifests after capture, child transcript retention/lineage, per-agent compactions, role separation, and totals without double counting |
| Quality-preserving efficiency comparison | Compare original review, smaller variant, and control; inspect resource changes with fixed quality criteria and uncertainty           | Confirmation, comparisons, isolated skill delivery, richer outcome grading, and elapsed reporting | Review benchmark, context metrics/distributions, and linked trajectory comparison                                                                         |
| Live investigation                       | Watch evidence develop and reopen it afterward with matching interpretation                                                           | Planned live monitor and existing event transport                                                 | Fine-grained live context events, consistent spend scopes, reconnection/late-evidence behavior, and persistent access to the context view                 |

Begin saved-session inspection alongside remaining comparison work. The basic
view can use retained evidence without provider spend, full run detail, or
completed pipeline capture. Validate collection early, before designing charts
whose precision the provider cannot support. Do not defer the whole capability
until all prototype screens are complete.

Pipeline capture now has a concrete consumer: investigating a review inside a
step. Reconsider its prior deferral when selecting that slice. Continue the
existing work on reliable comparisons and isolated skills, since an explanation
of token use alone cannot show that a proposed reduction preserves quality.
The first completed-run view need not wait for live streaming.

The maintainer board holds related work. These identifiers are cross-references;
the outcomes above are understandable without board access:

Milestone **m-8: Explain context and cost while preserving quality** groups the
original eight delivery outcomes and their supporting work. Each slice can ship
independently. Raw pipeline capture and shared transcript parsing now have an
explicit home in this milestone; other prerequisites retain their milestone
placement. Board dates express queue order, not delivery deadlines.

| Delivery card | Accepted outcome                                                              |
| ------------- | ----------------------------------------------------------------------------- |
| ACT-155       | Saved instruction/file inspector, consuming ACT-148 diagnostics               |
| ACT-155.1     | Shared transcript parsing for diagnostics and saved history                   |
| ACT-156       | Bounded verification of provider collection signals and accounting boundaries |
| ACT-157.1     | Provider-evidence normalization and optional attempt persistence              |
| ACT-157       | Per-request total input tokens, usage, and model-priced cost timeline         |
| ACT-158       | Pipeline-step and replay context inspection, after ACT-123 capture            |
| ACT-159       | Reviewer trees and direct/descendant skill and subagent costs                 |
| ACT-160       | Review-efficiency benchmark and linked quality/resource comparisons           |
| ACT-161       | Live context and cost views, coordinated with ACT-154 monitor shaping         |
| ACT-162       | Saved pipeline/replay reviewer-tree integration, before live monitoring       |
| ACT-123       | Raw pipeline transcript capture with explicit unavailable evidence            |

The saved inspector, provider investigation, and normalization/persistence seam
have landed. The next saved-view work uses retained transcript request usage,
including the transcript-only normalization correction, first-observed request
order, source locators, and inherited-context boundaries. Its series is labeled
total input tokens; it does not measure the provider's active context window.
Richer hook and child collection remains later work where transcripts do not
supply the required evidence. See [current limits](status.md).

ACT-123 retains its deferral until the pipeline slice is selected. ACT-162 joins
pipeline inspection and session reviewer trees; ACT-161 follows that saved
integration so it can reuse the same interpretation live. Experiment spending
requires its own recorded scope and budget; organizing this stream adds none.

Existing scope reused by these cards:

- ACT-59 and ACT-61 delivered the limited session manifest. ACT-123 owns
  pipeline raw capture, but does not include its downstream manifest or UI.
- ACT-96 covers file-use roles; ACT-97 covers openable Judge evidence. Reuse
  their provenance and locator decisions without conflating loads with use.
- ACT-148 covers tool errors and repeated commands and explicitly excludes
  phase/token attribution. Add separate context work instead of treating that
  card as sufficient.
- ACT-154 is a scoped investigation of the missing monitor, not approval to
  build a complete live context screen. Coordinate its evidence inventory with
  this stream.
- ACT-143–147 cover the realistic session experiment loop; ACT-105/149 cover
  durations. ACT-151 supplies existing multi-case session comparison support.
  These are foundations for the review benchmark, not context visualizations.

This roadmap adds a visible product stream without changing existing
card statuses, milestone order, or treating older Done cards as unfinished.
Independent import of ordinary sessions outside Rehearse may later make
diagnosis more convenient; imported traces remain observational evidence until
frozen into a reproducible case.

### Integration and artifact investigation

The context-analyzer study adds a follow-on stream under **m-9: Investigate task
context through integrations and recorded artifacts**. The operator should be
able to find any supported saved attempt, identify which integrations supplied
its context, inspect the artifacts and diagnostic evidence, and query the same
analysis from scripts or an agent. These outcomes were accepted for shaping on
2026-09-14; their inclusion here does not claim implementation.

| Card    | Accepted outcome                                                                                                                   | Required existing result                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| ACT-169 | One browser index into standalone attempts, confirmation repetitions, pipeline steps, and replays                                  | Saved session and pipeline/replay context views      |
| ACT-170 | Integration breakdown for observed tools, MCP server/functions, skills, and agent calls, linked to exact deliveries                | Request timeline and saved task/reviewer identity    |
| ACT-171 | Retained image/offload artifacts with bounded previews and separate full-file, delivered-preview, and subsequent-read observations | Saved history, pipeline capture, and child capture   |
| ACT-172 | Rule-versioned diagnostic findings, content fingerprints, and observational cross-attempt charts with openable evidence            | Request measurements and task/reviewer evidence      |
| ACT-173 | Common bounded context queries through browser/API and CLI, with matching units, provenance, and evidence states                   | Saved task/request projections and diagnostic report |
| ACT-174 | Read-only MCP tools that expose the common queries without independent calculations                                                | Common query interface                               |
| ACT-175 | Offline screening of a specified output transformation, preserving candidate identity and measurement assumptions                  | Diagnostic evidence and request measurements         |
| ACT-176 | Explicit aggregate export excluding content, paths, and execution identities while retaining uncertainty                           | Common query interface                               |

These cards have separate acceptance criteria and can deliver useful results
independently of milestone completion. Discovery, integration/artifact views,
and diagnostic findings provide the operator-facing exit; common queries and
MCP provide the agent-facing exit; screening and aggregate export support a
shareable hypothesis. m-9 follows m-8 in the existing queue order and does not
reorder earlier milestones. Its lower-priority adapters and screening/export
work do not block the first context timeline.

Reuse the existing event/source workbench, verified readers, request pricing,
and comparison resources. Content fingerprints must record their representation
and method consistently across diagnostics, artifacts, and transformations.
Derived indexes remain rebuildable from retained source evidence, with source
and derivation-version changes invalidating cached results. Summaries and
explicit detail retrieval share one interpretation across interfaces.

Diagnostics produce hypotheses, not verdicts of wasted context. A repeated path
can contain a different excerpt or version; a cache rebuild does not prove
compaction; an absent keyword does not prove an instruction had no effect.
Offline reductions remain modeled opportunity, including uncertainty about
request exposure and cache effects. ACT-160 continues to own the controlled
quality comparison, and ACT-175 is an optional source of candidates rather than
a prerequisite to it.

Global hook installation, automatic instruction pruning, inferred exact system
prefixes, runtime nudges during collection, and a second-provider dependency
are not adopted by this stream. The study's per-mechanism decisions retain the
reasons and reconsideration conditions. Ordinary-session import and broad
public protocol guarantees remain separate future choices.

## First proof using the review workflow

Use a fixed review task with important defects and known clean material. Record
which important defects are found, whether findings have valid supporting
evidence, false positives, and completion. Include final artifact correctness
when the review also makes fixes. Freeze grading separately from the review
instructions under treatment.

Inspect an original attempt to choose one hypothesis: a repeated instruction
load, unnecessary evidence copied into each reviewer, or oversized tool results.
These are examples to test, not diagnoses of the current review corpus. Change
one factor while keeping required review coverage. Run baseline, candidate,
and minimal-corpus control with fixed inputs, model, and effort, then repeat
across representative tasks. Declare acceptable quality loss and uncertainty
before drawing a savings conclusion; a nonsignificant quality difference does
not establish equivalence.

The exit is a comparison where the operator can trace a resource reduction to
changed execution and assess whether quality held within that declared
tolerance. If the candidate is cheaper but misses an important defect, show the
regression. If the evidence is insufficient, report an inconclusive result.
A success rate, dollar total, or context chart alone cannot supply the verdict.

## Evidence and first validation targets

The following provider-free checks passed on 2026-09-11: **99 tests, 0 failures**.
They verify existing behavior, not delivery of the planned capabilities.

```sh
mise exec -- bun test src/benchmark/context-manifest.test.ts \
  src/benchmark/transcript.test.ts src/benchmark/session-attempt.test.ts \
  src/benchmark/comparison-resources.test.ts src/benchmark/run-events.test.ts
```

First test for saved-session inspection: a retained synthetic transcript with
one inherited read, two new reads of the same instruction, a failed read, a
large tool result, and source identifiers. Observe separate events and
inspectable results; exclude the prefix from new activity while showing
inherited context. An absent transcript must yield unavailable evidence, not
zero loads.

Extend that fixture for collection with request usage, a child agent, a
compaction, duplicate event delivery, and missing measurements. Verify that
events are counted once, agent contexts stay separate, cumulative usage does
not reset at compaction, and unsupported context values remain unknown. Then
validate the adapter with a small version-recorded real capture before
promising its coverage. This assessment ran no provider experiment and does
not quantify the current review corpus's waste or achievable savings.
