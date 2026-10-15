# Vision

Rehearse aims to give an engineer a debugger and regression suite for the
instructions they give their coding agent. The question is whether a particular
instruction makes the agent's work better, at an acceptable cost, on tasks the
engineer cares about.

An instruction corpus grows whenever something goes wrong. A rule is added, a
skill is expanded, an output style is tightened. Without repeated measurements,
it is hard to tell which changes helped, which only made the agent do more work,
and which became unnecessary after a model update.

Rehearse makes those choices testable. Removal is as valuable an outcome as a
better instruction. The intended user is an engineer maintaining their own
corpus and willing to inspect the evidence behind a result.

An instruction can also be effective and unnecessarily expensive. Rehearse
should help preserve its outcome while reducing the context and tokens needed
to achieve it. That requires explaining resource use, beyond reporting a total.

This document describes the direction. [Current state](status.md) separates
implemented capabilities from remaining work, and [architecture](design.md)
describes how the implementation works.

## Two loops with different evidence standards

The **debug loop** is short. Freeze a task or a stage's upstream artifacts, run
the agent, inspect its output and trajectory, change an instruction, and try
again. One attempt can reveal a failure and suggest a hypothesis.

The **confirmation loop** tests that hypothesis with repeated runs. Compare
quality, reliability, cost, and trajectory length against the previous corpus
and a minimal-corpus control. A good-looking single attempt does not establish
that the change helped. The number of repetitions must fit the variability and
the decision being made; a default is only a starting point.

## Sessions, stages, and complete workflows

A session case makes a narrow behavior cheap to test, such as whether an output
style keeps a reply concise or whether the agent reads a required file.

A staged workflow offers a second useful boundary. Each skill consumes durable
artifacts and produces new ones. Replaying one stage from the same checkpoint
holds its upstream work fixed, so you can investigate the stage's instructions
without paying for every preceding stage.

A better intermediate artifact is still a proxy for better final work. Confirm
changes that affect a whole workflow against its final output. Global
instructions can influence every stage, so a local replay alone cannot validate
their overall effect. Frozen inputs reduce confounding; repeated trials and
controls are still needed for attribution.

## Context visibility in the debug loop

The engineer should be able to follow context growth through a session, a
workflow step, and the agents it launches: when instructions and files enter
context, which agents receive them, what gets read again, and where large tool
results or compaction change the trajectory. A useful view connects each
observation to its recorded source and exposes gaps in collection.

The operator should be able to find that evidence from one index covering
standalone attempts, confirmation repetitions, workflow steps, and replays.
Within an attempt, group observed deliveries by tool, MCP integration, skill,
and receiving agent. Keep images and offloaded outputs inspectable alongside
text, distinguishing the full saved artifact from the preview or excerpt that
actually entered context.

Show content introduced, context at individual requests, cumulative token
usage, cache usage, cost, and elapsed time as distinct readings. Each agent has
its own context; a smaller parent session can still require more tokens across
its reviewers. Declared inputs, observed loads, and evidence that an instruction
was followed must also remain distinct.

Context and cost attribution should share the same evidence. An engineer should
be able to select a skill, subagent, step, or task and see both attributable
tokens and cost, priced for the models and usage categories involved. Show
direct work and work delegated to descendants without double counting, and
label estimated or unallocated costs where the evidence is incomplete.

The browser, command line, and read-only agent tools should query the same
recorded evidence and return the same measurements for the same scope. Bounded
summaries should lead to selected source details, so investigating an expensive
run does not require loading its entire transcript into another agent's context.

Diagnostics should identify observable investigation leads, such as identical
content delivered repeatedly, large results, explicit failures, or expensive
request intervals. Each finding should expose its evidence, measurement method,
and uncertainty. Age, repeated filenames, lexical matches, or a health score
alone cannot establish that content is useless or safe to remove.

These views should help form a testable edit, such as reducing repeated evidence
delivery in a review procedure. Confirm the edit against fixed quality criteria
and repeated trials. Lower resource use is an improvement only when the outcome
remains acceptable; an inconclusive quality comparison cannot establish that
quality was preserved.

An offline transformation of recorded output can screen a candidate before a
new experiment, provided its assumptions and unsupported request exposure are
visible. Its result is modeled opportunity, not measured savings. An explicit
aggregate export should let the engineer share supported findings and outcome
readings without sharing source content, paths, or execution identities.

The [context assessment and accepted roadmap](context-visibility.md) separates
existing evidence, prior plans, and the additional collection and visualization
work this direction requires.

## Principles

- Use the real agent CLI on the engineer's machine. Preserve the parts of its
  environment that the experiment intends to measure and record the boundaries
  of what was frozen.
- Prefer deterministic checks when the outcome can be checked directly. Use
  rubric-based model Judges for semantic quality, with cited evidence and human
  calibration.
- Keep task inputs stable across comparison arms. Include a minimal-corpus
  control and show resource use beside quality.
- Treat a model or effort change as a new experimental condition. Prior scores
  remain historical evidence, not validation of the new condition.
- Show the projected ceiling before repeated work. Preserve failed attempts
  and missing measurements so the report cannot hide their cost.
- Keep records inspectable and commands usable from scripts, so the tool can
  support both manual investigation and future automated experiments.

The browser debug loop supports editing and reviewing instructions while retaining the saved source step through its replay offer.

## Longer-term direction

Once the measurement loop is dependable, extend it to matrices of corpus
version, model, and effort. A migration workflow should run a frozen suite on a
new model, remove logical instruction blocks in controlled experiments, and
surface both pruning candidates and regressions.

The browser UI should make that evidence easy to navigate, from a run's spend
and context history to the instruction change and the comparison that justifies it.
Automated proposals must meet the same confirmation standard as manual edits.
