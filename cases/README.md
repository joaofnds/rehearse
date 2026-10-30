# Corpus evaluation cases

The active selection covers these behaviors:

| Case                   | What to judge                                                                                                                                                                                      | Inputs needed                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `own-work-build`       | Deliver the feature, fix defects encountered during the work, keep fixes in their own commits, improve the test command, and leave a clean tree. Its state scorer reports each outcome separately. | Installed corpus files declared by the case, Python 3, and Backlog.md.                                                                                           |
| `triage-inbox-cut`     | Remove speculative captures while preserving supported work, settled priorities, approvals, and history. Its state scorer checks the resulting board and priority document.                        | Installed corpus files declared by the case, Python 3, and Backlog.md.                                                                                           |
| `brief-reply-02f0f204` | Report several defects concisely. Checks enforce the 154-word ceiling, no em dash, and no tool calls. Read the reply to judge whether it preserves the useful findings.                            | The private transcript prefix named in the declaration and `output-styles/brief.md`.                                                                             |
| `audit-log`            | Carry a feature through `shape → build`, with stage rubrics and a final product rubric. Use it when an edit affects the complete workflow.                                                         | A prepared NestJS target, Docker services, and the installed workflow corpus. See the [pipeline recipe](../docs/runbook.md#use-a-pipeline-on-a-prepared-target). |

The build and triage cases share a small ledger application but start from
different tasks and measure different behavior. Neither replaces the other.
The brief-reply case is a focused style check; passing its mechanical checks
alone does not establish that the reply is useful. The audit-log workflow needs
more setup and spend than the session cases.

## Running an evaluation

Inspect the selection without calling a provider:

```sh
mise exec -- bun run rehearse case list
mise exec -- bun run rehearse case show own-work-build --json
```

After configuring a spend ceiling and the required corpus inputs, a session run
uses the linked corpus directory, or the live install when none is linked.
An explicit `--corpus` selects a directory for that run. This paid example has
not been validated against the provider:

```sh
mise exec -- bun run rehearse run --case own-work-build --model sonnet
```

Use the same case, model, effort, and fixture for both sides of an instruction
comparison. Change the corpus between arms, rather than copying the case into
another version. The [repetition recipe](../docs/runbook.md#repeat-with-frozen-inputs)
explains how to freeze inputs and measure rerun variation. Inspect the individual
state outcomes and saved artifacts alongside cost; a tool-call count alone is
not a quality grade.

## Archived cases

Archived declarations retain their IDs, fixtures, and grading definitions.
They leave the normal case list, browser Cases page, and New run choices.
Saved runs, comparisons, and freshness checks still use their evidence. An
explicit `case show`, `run --case`, or `regrade` can still address them. Remove
`"archived": true` from a declaration to restore it to the active selection.

| Archived group                                                                         | Reason                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brief-reply-40878d26`, `brief-reply-92b2e8b0`, `brief-reply-e3dea673`                 | Additional captured turns using the same style checks. Keep the multi-defect report as the routine representative; these remain available for a wider style comparison. The suffixes identify source turns, not revisions of one case. |
| `doctrine-ab-with`, `doctrine-ab-without`                                              | A past experiment that changes project fixture instructions between arms and checks only a tool-call ceiling. It cannot establish implementation quality or isolate a corpus edit.                                                     |
| `citation-probe`, `history-probe`, `manifest-probe`, `permission-probe`, `state-probe` | Harness diagnostics for home-path citation delivery, fixture history, context manifests, permissions, and state capture. Their fixtures still support development tests.                                                               |
| `smoke`                                                                                | Provider/setup diagnostic retained for the public first-run recipe. It measures no meaningful corpus behavior.                                                                                                                         |

List archived declarations with:

```sh
mise exec -- bun run rehearse case list --all --json
```

Local experiments excluded from Git can appear in that inventory too. Saved
attempts are historical evidence and do not create extra workflow definitions.
The bundled workflow remains `audit-log/pipelines/default.json`.
