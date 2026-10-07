# UI design reference

[SPEC.md](SPEC.md) and [prototype.html](prototype.html) are the design handoff
produced on 2026-09-04 from the [original brief](../ui-design-prompt.md). They
describe intended visual structure and interactions beyond the implemented app.
Use [current state](../status.md#browser-ui) to find what is available today.
Where SPEC.md and the prototype differ, SPEC.md wins: SPEC.md has been amended
since the handoff, such as the monitor's output summary and graph footer, and
the prototype has not. The prototype keeps the handoff's names: culprit where
SPEC.md says root cause, primary culprit, contributing and not implicated for
the roles SPEC.md calls root cause, contributing factor and not a factor, and
contribution phrase for what SPEC.md calls the output summary.

Open the prototype from a local checkout to inspect the intended appearance.
[support.js](support.js) expands the design environment's custom markup. It is
reference infrastructure, not application code, and must not be imported into
the client.

Read the specification for visual direction and the [architecture](../design.md)
for implementation boundaries. Implement screens with the existing components
and tokens under `client/src/system/`. Prototype version labels, example grades,
prices, identifiers, and controls are illustrative rather than release data.

The design calls a pipeline a **task**, a stage a **step**, and a confirmation
run a **group**. Code and records keep the harness terms; the [glossary](../../GLOSSARY.md)
records their meaning. Features such as editing a task's steps and the
first-run setup screen remain planned. Do not infer an API or
record field merely because the prototype displays one.
