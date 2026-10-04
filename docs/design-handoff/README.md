# UI design reference

[SPEC.md](SPEC.md) and [prototype.html](prototype.html) are the design handoff
produced on 2026-09-04 from the [original brief](../ui-design-prompt.md). They
describe intended visual structure and interactions beyond the implemented app.
Use [current state](../status.md#browser-ui) to find what is available today.

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
records their meaning. Features such as instruction editing and several
complete screens remain planned. Do not infer an API or
record field merely because the prototype displays one.
