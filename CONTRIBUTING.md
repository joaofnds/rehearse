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

A preload named in `bunfig.toml` points `REHEARSE_RECORDS_DIR` at a temporary
directory for each test process, so code that resolves the records location
inside a test writes there rather than into `.benchmark-runs/`. A spawned CLI
sees the variable only when its `env` is derived from `Bun.env`, as
`{ ...Bun.env }` and `environmentWithoutKnobs()` are. A spawn with no `env`, or
with one built by hand, writes into the real records, and nothing enforces
this, so check each new spawning test against it. A test that runs a copied
control removes the variable, so the copy keeps its records under its own
`.benchmark-runs/`. Bun reads `bunfig.toml` from the working directory only, so
run `bun test` from the repository root. From a subdirectory neither preload
loads, and tests write into the real records.

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

Tailwind's theme names live in `client/src/system/theme.css`, and several bind to a
different value than the raw token spelled the same way. `bg-accent` is the subtle
hover surface shadcn expects while `--color-accent` is the brand purple, and
`border-border` resolves to `--color-border-2` rather than to `--color-border`.
Write `bg-primary` for the brand, and read `theme.css` before trusting a Tailwind
name to match the token it echoes.

`theme.css` maps colors, fonts, and radii, including the handoff's palette roles
that shadcn's names lack, such as `text-dim`, `text-pale`, and `border-divider`.
Spacing and type come from Tailwind's own scales. `globals.css` sets `html` to the
handoff's 13px base, so `text-base` is 13px and a spacing step is 3.25px.
`tokens.css` therefore holds no spacing, type size, or letter-spacing scale. It keeps
the handoff's whole colour palette; outside the palette, add a token only for a value
a utility or a base style reads.

Add a primitive with `bunx --bun shadcn@4.21.0 add <name>`, and read the generated
file before you commit it. Give its props a named type and add that name to the
`typescript/prefer-readonly-parameter-types` allow list, because React's DOM prop
types are not deeply readonly and that rule matches exact names.

`shadcn/no-unknown-classes` carries no allowance, so every class a component writes
must be one Tailwind generates, and a misspelled class name fails the lint.

Put a style value the component computes into a CSS custom property that a utility
reads, such as `w-(--bar-width)`, and keep a raw color out of it. The lint checks
neither the property's name nor a length it carries, so a misspelled name or a
hand-written pixel value passed this way goes unreported; keep the route for values
the component computes. Deleting
`client/src/react-css.d.ts` breaks every one of those, since it is what makes the
property names typecheck.

Regenerating a primitive brings back the arbitrary values the linter rejects. The
button's focus ring arrives as `ring-[3px]` and is written `ring-3` here, and its
variants carry the handoff's button chrome in place of shadcn's filled defaults.
Re-apply that kind of edit after every regeneration.

Keep to the one icon set `components.json` names.

Build a screen from the primitives in `client/src/system/ui/` and the components
under `client/src/system/components/` that the
[design handoff](docs/design-handoff/README.md) names, styled with Tailwind utilities.
Neither set is retired.

Keep provider calls behind injectable dependencies so behavior can be checked
without a paid run. Preserve record compatibility when changing schemas, and
distinguish missing evidence from a failed grade. Treat benchmark fixtures as
experimental inputs. Change them only when changing the case, since their bytes
affect what the experiment measures.

A fixture's `dot-git` directory becomes a working `.git` in the attempt
directory, so its bytes are configuration git acts on rather than inert data.
Seeding refuses the shapes that execute code or reach outside the attempt
directory, a `hooks/` directory among them, but `config` still carries entries
that change what a session sees. A diff touching `cases/*/fixture/dot-git/`
says in its message which config entries it changes, because a reviewer reading
the diff sees object files and cannot tell.

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
