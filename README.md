# Rehearse

Find out whether changing your coding agent's instructions actually helps.

Rehearse runs a fixed task through the real Claude Code CLI, records the
instructions and evidence, and grades the result. You can replay a workflow
stage after editing a skill, or repeat a session to see how much its results
vary. The goal is a debugger and regression suite for an engineer's instruction
corpus: project guidance, skills, output styles, and agent definitions.

For example, a shorter instruction might produce a better reply once. Rehearse
helps you inspect that attempt, repeat the task, and compare quality with cost
before deciding the instruction earned its place.

**Early development.** The CLI is usable, and a local browser UI reads recorded
evidence. Some workflows still depend on the maintainer's environment. Session
confirmation groups can feed comparisons alongside stage and pipeline groups,
over several cases or over repeated runs of a single one.
See [current state and priorities](docs/status.md) before planning an experiment.

## How it works

```text
Choose a case + instructions + model
                  |
          Run the real agent
                  |
       Grade and retain evidence
                  |
       Inspect → edit → run again
                  |
     Confirm with repeated trials
```

- **Session cases** run one prompt in a temporary directory, optionally with
  fixture files or a captured conversation prefix. Deterministic checks grade
  the reply and tool transcript.
- **Pipeline cases** run a declared sequence of skills against a target Git
  repository. A Product Owner answers questions, independent Judges grade each
  stage, and checkpoints let you replay a stage without rerunning its predecessors.
- **Confirmation runs** repeat frozen inputs and report reliability and resource
  usage. A single attempt is debugging evidence, not proof of improvement.

The current provider is Claude Code. This is a local tool using your credentials
and agent environment, with records under `.benchmark-runs/`.

## Start here

Install [mise](https://mise.jdx.dev/getting-started.html), then from a clone:

```sh
git clone https://github.com/joaofnds/rehearse.git
cd rehearse
mise install
mise exec -- bun install --frozen-lockfile
mise exec -- bun run rehearse --help
mise exec -- bun run rehearse case list
mise exec -- bun run rehearse case show smoke --json
```

These commands inspect the project without calling a model. The pinned
toolchain is in [mise.toml](mise.toml). Install and authenticate Claude Code
separately using its [quickstart](https://code.claude.com/docs/en/quickstart);
it is needed only when you run an experiment.

**To run your first experiment:** follow the [runbook](docs/runbook.md). It
provides the corpus file the smoke case needs, explains the spend limit, and
shows how to read the result. A bare `run` selects the `audit-log` pipeline, so
choose `--case smoke` explicitly when starting out.

**To browse the UI:** build and serve the client, then open
`http://localhost:4173`.

```sh
mise exec -- bun run build:client
mise exec -- bun run serve
```

A fresh clone has no run history. Available views cover run history, the live
corpus, saved comparisons, saved session-attempt history, and the design system.
The run history shows a run that is executing, with its stage, elapsed time, and
spend. Run launch, a full monitor screen, and several prototype screens are
still planned.
The server is intended for local use, binds to IPv4 loopback, and has no
authentication.

## Documentation

| I want to…                                         | Read                                                         |
| -------------------------------------------------- | ------------------------------------------------------------ |
| Understand the goals and long-term direction       | [Vision](docs/vision.md)                                     |
| Understand context visibility and efficiency plans | [Context assessment and roadmap](docs/context-visibility.md) |
| Know what works and what needs work                | [Current state and priorities](docs/status.md)               |
| Run an experiment and inspect its evidence         | [Runbook](docs/runbook.md)                                   |
| Configure cases, replay, grading, and comparisons  | [Harness reference](docs/reference.md)                       |
| Understand the implementation                      | [Architecture](docs/design.md)                               |
| Contribute code or keep the docs current           | [Contributing](CONTRIBUTING.md)                              |
| Look up a project term                             | [Glossary](GLOSSARY.md)                                      |
| Read the evaluation methodology                    | [Research](docs/research.md)                                 |

The [documentation index](docs/README.md) also explains the status of the UI
design and recovered historical material. Public project context lives in these
tracked documents; the maintainer's personal task board is outside this repository.

## License

Licensed under the [Apache License 2.0](LICENSE).
