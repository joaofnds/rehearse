# Connected desktop prototype

The prototype must let an engineer find a run, inspect its outcome and supporting
evidence, follow related attempts, and test an instruction change. The visual
review alone cannot establish whether those paths are understandable.

The accepted navy/violet palette, Inter/JetBrains Mono typography and current
spacing remain. The work is an interaction pass. Production code, provider calls,
real corpora and saved experiment records remain outside the prototype.

## Approach

Leaving isolated screens in place fails the request: Runs must list runs and the
navigation must be usable. Wiring only their sidebar would still leave the run
views and experiment path disconnected. The original workspace prototype already
models those interactions with synthetic data. Its interaction model is the base
for a connected revision with the newer Results, Context and Comparison layouts.
The original stays available for comparison. The connected revision replaces
`after.html` at <http://localhost:4493/after.html>; opening it without a run link
starts at Runs. The matched standalone examples move to `saved-example.html`.
The newer screen spacing, rather than the original compact layout, is the visual
baseline. The matched saved-record captures remain separately available as historical visual
references.

The connected revision uses labeled synthetic records throughout. It does not mix
real measurements with invented transcripts or pretend that a demo action changed
the application. A small set of coherent cases and related runs makes the
information architecture testable. Every enabled control changes demo state,
navigates to a relevant view, or opens actual demo evidence. Unsupported file or
provider operations are explicitly unavailable.

## Acceptance observations

The user specifically named the missing Runs list, unclear search/navigation and
inability to judge information placement. Desktop scope and deferring density
changes are settled constraints. The journeys below are implementation decisions
that make those concerns observable. Global search is a proposed shortcut across
existing destinations, not an additional global destination. Its usefulness is
part of what this prototype lets the user assess.

- Opening the connected prototype shows a populated Runs list. Runs in the sidebar
  always returns to that list.
- Run search and filters return matching records and an understandable empty state;
  returning from a run preserves the query/filter.
- Global search finds runs, cases, instructions and comparisons and opens the
  relevant destination. Keyboard search and Escape work.
- Running entries open Activity; ended entries open Results. Results, Activity and
  Context & cost retain the run and selected step. Browser back/forward, direct
  links and breadcrumbs return to the expected context.
- Results leads with the independent final outcome and findings, then selected
  step evidence, grade, artifacts, human review and replay/edit actions. Missing
  evidence remains distinct from failure.
- Context & cost supports switching agents, sources and requests, with readable
  request usage, source text and measurement limits. Selection changes the detail.
- Comparisons has a list and detail view; each arm opens its group and each group
  opens its attempts. Returning to the comparison is straightforward. Individual
  attempt outcomes, cost spread, input identity and interpretation limits remain.
- The demo edit path preserves its source run/step/input through edit, diff, apply,
  replay launch, live progress, completion and comparison with source.
- Cases opens definitions, related runs and launch; Corpus opens and edits files;
  Settings changes demo budget and reaches judge review. Each global destination
  is a distinct usable view.
- A new demo run appears in history; advancing/finishing/stopping changes its state
  and retains evidence. No action calls a provider or writes product records.
- The connected revision retains the accepted visual direction and is inspected at
  1440×900 and 1280×800. The old prototype and matched visual gallery remain reachable.

## Verification

Exercise complete browser journeys rather than only opening pages or checking
that buttons produce dialogs. Start with Runs → search → ended run → step → Context
→ request/source → Results → instruction edit → apply → replay → finish → compare
→ source. Separately follow comparison → group → attempt → comparison, and a live
run through advance/stop. Inspect console and network failures while doing so.

No new domain terms are introduced. The prototype remains a disposable design
instrument; it does not establish production measurement semantics.

The inline demo interaction model is outside the project's typecheck and lint
scope and has no automated interaction tests. After changing it, rerun the browser
journeys in this section and the README, including Back/Forward and Reset demo,
and inspect the console for errors.
