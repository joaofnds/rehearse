# Optional task worker

[worker-agent.json](worker-agent.json) defines a Claude Code worker for a
maintainer's externally orchestrated task. It is not the provider used by the
benchmark harness and is not needed to run the CLI or tests.

The orchestrator selects this repository as the working directory and supplies
the task, workflow stage, board location, installed skill file, decision policy,
and any authorized provider observation with its budget. The personal
task board and installed skills are separate resources. A public clone does not
provide those dispatch inputs.

The worker reads the project's contributor instructions and reports its evidence
back to the orchestrator. Its configured Opus model is the orchestration worker
model, separate from the model selected for a benchmark experiment.

Keep the worker's project guidance aligned with [AGENTS.md](../../AGENTS.md)
and [Contributing](../../CONTRIBUTING.md). The dispatch supplies task-specific paths
and decisions. Keep personal checkout paths out of the definition.
