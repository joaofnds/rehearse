# UI design reference

[SPEC.md](SPEC.md) and [prototype.html](prototype.html) are the design handoff
produced on 2026-09-04 from the [original brief](../ui-design-prompt.md). They
describe intended visual structure and interactions beyond the implemented app.
Use [current state](../status.md#browser-ui) to find what is available today.
The approved [desktop run workspace](../run-workspace.md) supersedes the original
separate history, monitor and detail navigation; the archived files remain unchanged.
The [connected desktop prototype](../../prototypes/ux-comparison/README.md) extends
that workspace with the implemented information and investigation layout. The
[desktop UX review](../ux-review.md) records the original follow-up proposals for results,
attempt inspection, context and comparison workflows. The [workspace description](../run-workspace.md) records the implemented behavior;
the review and frozen captures remain historical references.
Where SPEC.md and prototype.html differ, SPEC.md wins: SPEC.md has been amended
since the handoff, such as the monitor's output summary and graph footer, and
prototype.html has not. That prototype keeps the handoff's names: culprit where
SPEC.md says root cause, primary culprit, contributing and not implicated for
the roles SPEC.md calls root cause, contributing factor and not a factor, and
contribution phrase for what SPEC.md calls the output summary.

Open the prototype from a local checkout to inspect the intended appearance.
[support.js](support.js) expands the design environment's custom markup. It is
reference infrastructure, not application code, and must not be imported into
the client.

The approved [color and readability study](../../prototypes/color-study/README.md)
extends the original palette with separate action, link and evidence roles and a
larger reading scale. The client design system describes its production use.

Read the specification as the original visual reference and the [architecture](../design.md)
for implementation boundaries. Implement screens with the existing components
and tokens under `client/src/system/`. The [client design system](../../client/src/system/README.md) documents the implemented component contracts, semantic colors, measurement rules and safe saved-text reader. Prototype version labels, example grades,
prices, identifiers, and controls are illustrative rather than release data.

The design calls a pipeline a **task**, a stage a **step**, and a confirmation
run a **group**. Code and records keep the harness terms; the [glossary](../../GLOSSARY.md)
records their meaning. The current feature inventory defines which actions are
available. Do not infer an API or
record field merely because the prototype displays one.
