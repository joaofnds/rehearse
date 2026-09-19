# Contributing

Read the [vision](docs/vision.md) and [current priorities](docs/status.md) before
choosing work. Changes that make a public clone usable, preserve trustworthy
experiment evidence, or make that evidence easier to read are especially useful.

Use an issue or pull request in this repository to describe the problem and the
observable result you want. Include reproduction steps for a defect. The
maintainer's personal Backlog.md board is outside the repository; contributing
does not require access to it. A local `backlog` symlink is personal workspace
state and must not become a public documentation dependency.

## Development setup

```sh
mise install
mise exec -- bun install --frozen-lockfile
```

[mise.toml](mise.toml) pins Bun and Backlog.md. Install and authenticate Claude
Code separately for real experiments. Provider calls cost money; ordinary
development checks use fakes and local filesystem fixtures.

Run these from the repository root. A test run started under a Bun other than
the pinned one stops on its first file with `Use Bun 1.4.0; current version is
<yours>`. Prefix the command with `mise exec --` to get the pinned Bun, or
activate mise in your shell so `bun` resolves to it. The other checks here run
oxlint, tsc, oxfmt, stylelint, and Vite as child processes, so they pass under
any Bun and report no mismatch.

```sh
bun run typecheck
bun run lint
bun run lint:css
bun run fmt:check
bun run test
bun run build:client
```

`bun run test` runs the backend suite and then the client's DOM suite. A bare
`bun test` omits the client tests. If the first half fails, the second half does
not run; execute it separately when checking client work:

```sh
bun test --path-ignore-patterns "**/node_modules/**" \
  --preload ./client/test-setup.ts ./client
```

For an integrated browser check, run `mise exec -- bun run build:client`, then
`mise exec -- bun run serve`. The `dev:client` script runs Vite alone; its current
configuration has no API proxy. Use the built client with the server when
checking real records.

## Working conventions

The harness and CLI use TypeScript on Bun. The client uses React and shared
design tokens. Use the configured formatter, linters, and test runners. Do not
add competing tools. Use Zod for validation. Do not add class-validator or
class-transformer. Read [architecture](docs/design.md)
for the component boundaries and [design handoff](docs/design-handoff/README.md)
before implementing a new screen.

Keep provider calls behind injectable dependencies so behavior can be checked
without a paid run. Preserve record compatibility when changing schemas, and
distinguish missing evidence from a failed grade. Treat benchmark fixtures as
experimental inputs. Change them only when changing the case, since their bytes
affect what the experiment measures.

A fixture's `dot-git` directory becomes a working `.git` in the attempt
directory, so its bytes are executable configuration rather than inert data.
A diff touching `cases/*/fixture/dot-git/` says in its message which hooks and
which config entries it changes, because a reviewer reading the diff sees
object files and cannot tell.

Use Conventional Commits with a lowercase imperative subject, such as
`docs: explain session confirmation limits`. Use commit bodies to explain why
the change is needed. A pull request should explain the
problem, the resulting behavior, and what was checked. Include any remaining
limitation that affects use of the change.

## Keep the documentation current

Update the relevant document in the same change that alters behavior. Use this
map to find its home:

| Change                                                           | Documentation to check                               |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| Purpose, audience, or first-use path                             | `README.md`, `docs/runbook.md`                       |
| Available feature or resolved limitation                         | `docs/status.md`                                     |
| CLI behavior, case inputs, records, corpus delivery, or recovery | `docs/reference.md`, affected runbook recipe         |
| Component boundary or execution model                            | `docs/design.md`                                     |
| Product direction or evidence standard                           | `docs/vision.md`                                     |
| Domain meaning or UI vocabulary                                  | `GLOSSARY.md`                                        |
| Toolchain, checks, or contributor workflow                       | `CONTRIBUTING.md`                                    |
| Agent-specific project convention                                | `CLAUDE.md`, `tools/orchestration/worker-agent.json` |

CLI flag definitions in `src/cli/commands.ts`, scripts in `package.json`, and
schemas in `src/benchmark/` are the sources for their respective contracts.
Keep representative recipes in prose and use command help for the complete flag
inventory. Avoid copying counts, personal absolute paths, or temporary prices
into onboarding instructions.

Check relative links from the document's own directory. When adding or changing
a command example, run its provider-free commands in a clean checkout and check
its inputs against the current parsers. Label paid recipes that were not
exercised. Move a feature out of the planned list only when its user-facing path exists; a schema or prototype
alone is not that evidence. Keep the status date and its source links current
when changing the feature inventory.

Preserve the archived design and recovered sources as references. Explain their
relationship to the current product in their index files instead of silently
rewriting historical evidence. Never put private transcripts or run artifacts
in a pull request without reviewing their contents for publication.

Publishing a transcript prefix means adding a `.gitignore` negation that names
it, and that edit is where the review above is owed. Read the prefix record by
record, not by scanning for host paths: conversation records carry the capturing
machine's `cwd`, and a rendered skill invocation opens with that skill's
absolute base directory, so those paths are what the format is rather than what
the review is looking for. What the review is looking for is content the prefix
carries from the machine that captured it: the bodies of instruction files the
session loaded, file contents it read, anything a tool result returned, and the
records the harness attaches on its own, which include an inventory of every
skill installed on that machine. Publish the prefix only once each of those is
content you would publish on its own. A prefix that fails the review stays
unnegated, and `docs/reference.md` describes what a withheld prefix does to a
clone.
