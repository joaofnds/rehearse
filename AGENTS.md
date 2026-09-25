# Working on Rehearse

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing the project. It owns the
development checks and documentation maintenance map. Use [docs/status.md](docs/status.md)
for current limits and [GLOSSARY.md](GLOSSARY.md) for domain terms.

Keep this file as guidance for developing Rehearse. The corpus under evaluation
comes from the live agent install or an explicit corpus source. The target
repository owns its project instructions.

Treat explicit task and product-brief facts as settled constraints. Carry every
observable behavior into the current workflow artifact. Include those behaviors
in acceptance criteria when writing a specification. Do not reopen or defer
settled behavior.

When working from a Backlog.md card, store each acceptance criterion as a separate
acceptance-criteria item. Prose in the card's notes does not satisfy that contract.

Use `--model sonnet` when running or replaying a case so results remain comparable
with recorded runs. Keep model and effort fixed across comparison arms. Never
pass `--model fable`.

Commit every durable artifact the task creates before declaring it complete.
Resolve the task's open questions before claiming completion.
