# Documentation

Start with the [project README](../README.md) for the purpose and first commands.

## Working with Rehearse

- [Runbook](runbook.md): setup, first experiment, repeated runs, and inspecting evidence.
- [Harness reference](reference.md): case inputs, corpus delivery, grading, records,
  replay, calibration, comparisons, and target restoration.
- [Current state and priorities](status.md): implemented features, known gaps,
  and useful contribution areas.
- [Contributing](../CONTRIBUTING.md): development checks and documentation upkeep.

## Understanding the project

- [Vision](vision.md): the problem, goals, evidence standards, and longer-term direction.
- [Context visibility](context-visibility.md): current evidence, gaps, and an accepted
  roadmap for understanding context growth and preserving quality at lower token use.
- [Context-analyzer study](context-analyzer-study.md): source-backed recommendations
  for request inspection, integration breakdowns, artifact capture, and analysis APIs.
- [Promptfoo study](promptfoo-study.md): comparative product and engineering evidence,
  prioritized proposals, and proposed challenges to Rehearse’s direction.
- [TypeSafe study](typesafe-study.md): feasibility, evidence limits, and a proposed
  evaluation of Jev for semantic judging.
- [livenerf study](livenerf-study.md): measurement safeguards from a model-drift
  series, probes of what a child session inherits, and proposals for comparisons.
- [Architecture](design.md): current components and execution boundaries.
- [Glossary](../GLOSSARY.md): domain terms, including the UI's vocabulary mapping.
- [Research](research.md): primary sources behind the evaluation methodology.

## Design and historical references

[Design handoff](design-handoff/README.md) explains how to read the UI specification
and prototype. They show intended behavior beyond the implemented client. The
[original design prompt](ui-design-prompt.md) is an archived brief, not a feature list.

[Recovered sources](recovered/README.md) are fragments of an abandoned application.
They are not compiled, served, or used as the current architecture.

The [optional orchestration worker](../tools/orchestration/README.md) is for
externally dispatched maintainer tasks and is not required for experiments.

Files under `cases/*/fixture/` are benchmark inputs, including their READMEs and
agent instructions. Their text affects the experiments; they are not contributor
guidance for Rehearse.
