# Local loading performance

Runs now shows saved readings before calculating freshness. The initial list
rereads local records, reuses validation for identical bytes and shares repeated
reads within the request. Sidebar metadata starts after the list arrives.

## First-open result

The first two report optimizations below still left the initial screen waiting
about a second. A second investigation found repeated JSON/schema parsing,
SQLite initialization once per pipeline row, and a full history-wide corpus
invalidation report requested for the sidebar.

A fresh-process comparison on the same Apple M5 Pro, Bun 1.4.0, 189 readable
records and 137 corpus files alternated five baseline/candidate starts. The
baseline is `a2fc339a`, including the earlier performance changes. Both arms read
the same records, linked corpus and case definitions, including local cases.
The OS filesystem cache was warm. No tests or builds ran during measurement.

| Measurement                                     | Baseline median | Current median |
| ----------------------------------------------- | --------------: | -------------: |
| First list data after server readiness          |        893.2 ms |        85.5 ms |
| Initial API batch, excluding deferred freshness |      1,202.2 ms |       162.4 ms |
| Server process launch to accepting traffic      |         70.5 ms |       290.1 ms |
| Process launch to first list data               |        963.5 ms |       375.6 ms |

The current first list samples were 75.7–86.6 ms. The process-start cost includes
reconciliation and a listing read that fills the parsed-record cache before the
port opens. That initialization adds work before readiness; it is included in
the process-launch comparison. These five samples establish a local improvement,
not a latency guarantee or an OS-cold-disk result.

In one first navigation after a server restart, all 189 rows were observed at
211 ms, down from 870 ms in the earlier browser check. The list request took
77.4 ms and finished at 135.8 ms after navigation; application startup and
rendering account for the remaining visible delay. The observation waited two
animation frames after rows appeared. Freshness arrived at 415.9 ms. The data
request meets 100 ms in these readings; the complete visible screen does not.

The sidebar now requests `/api/corpus-summary`, which hashes the current corpus
and reads file edit times without computing history usage or invalidation. It
and the comparison badge wait for the initial listing to settle. Runs first
requests `/api/run-listing`, then `/api/run-staleness` for that listing read. Every
successful listing refresh starts a new freshness query, so replacement records
cannot inherit earlier judgments. Pending or failed freshness
is unavailable, including during a refresh of an earlier clean judgment; Current
corpus and Stale filters wait for a pending judgment. Full record and read-evidence
routes retain detailed manifests, omitted from list judgments.

Listing borrows one event store, reads independent rows with at most 16 workers,
and shares filesystem reads for that report. Session-group saved-state summaries
validate identity, version, outcome and saved-grade fields without parsing
unrelated context evidence. Full session readers retain their full schemas.
The server-owned parsed-record LRU keys successful results by schema identity and
SHA-256 of the exact input bytes, with recursively frozen output. It retains at
most 2,048 entries and 64 MiB of input text; that is not a bound on JavaScript heap
size. Every request rereads files and discovers paths, so external additions,
replacements and deletions remain visible. Freshness judgments are recomputed.

Sequential reads on the populated current server had medians of 68.7 ms for
listing, 26.9 ms for corpus summary, 183.4 ms for freshness, 236.5 ms for the full
run report and 379.1 ms for the full corpus report. Full evidence reports still
exceed 100 ms. They scan saved evidence and, for corpus invalidation, judge the
previous version. Freshness is deferred rather than described as free.

The [raw first-open measurements](performance/loading-2026-10-18-initial.json)
retain every sample, response size, startup cost and browser observation. Listing,
full run history, corpus and comparisons matched the baseline after omitting the
intentional detailed `readManifest` projection from list judgments. Canonical
response hashes are retained without private response bodies. Independent
[review findings and dispositions](performance/loading-2026-10-18-initial-review.json)
retain the correctness checks and their regression evidence.

## Registry read follow-up

The listing already reads every short-ID registry, but each pipeline row also
read its case's registry again. Each registry contains many small claim files.
Reports now reuse that complete registry within their existing read scope.
Cases also owns a read scope, so its run figures share those registry reads.
A later report reads the registry again, including additions, replacements,
removals and newly bound replays. No registry result survives between reports.

On the same Apple M5 Pro and Bun 1.4.0, with 189 readable records and 137 corpus
files, nine alternating HTTP pairs against `2a94fac3` gave these medians:

| Read        | Baseline |  Current | Reduction |
| ----------- | -------: | -------: | --------: |
| Run listing |  88.7 ms |  77.5 ms |       13% |
| Cases       | 210.4 ms | 115.6 ms |       45% |

Every paired response had identical bytes. Both server processes and the OS
filesystem cache were warm. Background machine load varied: a separate
seven-sample benchmark measured listing at 92.1 → 61.6 ms and Cases at
123.3 → 79.7 ms. These observations support the reduction, rather than a fixed
latency guarantee. Builds and tests for this change ran outside measurement.

Five alternating browser pairs used the same built JavaScript in both arms.
All 189 rows were observed after two animation frames at a median 175.9 →
168.2 ms; the list request took 91.7 → 80.0 ms. The complete visible screen
still exceeds 100 ms. These measure navigation against running servers, not
process launch or OS-cold storage.

The [before](performance/loading-2026-10-18-registry-before.json),
[after](performance/loading-2026-10-18-registry-after.json) and
[paired HTTP/browser readings](performance/loading-2026-10-18-registry-pairs.json)
retain the samples, response hashes and benchmark gate results. A local HTTP
fixture also verified the gate's failure path: adding 200 ms to listing while
keeping its JSON unchanged produced exit status 1.

## Earlier report measurements

Measured on 2026-10-18 on an Apple M5 Pro, arm64, with Bun 1.4.0, a built client,
189 readable saved records and 137 corpus files. Both servers read the same local
records and linked corpus. The original server ran the pre-change code; the
comparison server loaded the optimized code. Each endpoint was read five times in
sequence, followed by five batches of the concurrent API requests made when the
app opens. These are HTTP completion times, including reading the response body.

| Read                                     | Before median | After median | Reduction |
| ---------------------------------------- | ------------: | -----------: | --------: |
| Run history with staleness (`/api/runs`) |    2,579.9 ms |     573.2 ms |       78% |
| Corpus with invalidation (`/api/corpus`) |    4,121.7 ms |     660.9 ms |       84% |
| Initial concurrent API batch             |    5,609.7 ms |   1,300.1 ms |       77% |
| Run listing without staleness            |      380.6 ms |     277.9 ms |       27% |
| Cases                                    |      336.5 ms |     246.5 ms |       27% |
| Comparisons                              |       50.1 ms |      34.7 ms |       31% |
| Settings                                 |        0.4 ms |       0.2 ms |       50% |
| Records directory size                   |      113.4 ms |     115.9 ms |       -2% |
| Judge calibration                        |      110.8 ms |      60.8 ms |       45% |

The change targets the first two endpoints. Differences in unchanged readers,
especially sub-millisecond settings reads, reflect background load and sampling
variation. This was a developer machine under ordinary background load, with warm
filesystem caches, rather than an isolated CPU or cold-disk benchmark. Five
samples do not establish a tail-latency guarantee. Raw samples, response sizes and
per-request batch timings are retained in the [before](performance/loading-2026-10-18-before.json)
and [after](performance/loading-2026-10-18-after.json) results.

In the browser, the original initial navigation loaded HTML and JavaScript in
under 40 ms, then spent 2,660 ms on run history and 4,595 ms on corpus data.
An optimized initial navigation spent 1,044 ms and 1,240 ms respectively, with the
last initial API response arriving 1,287 ms after navigation. The browser's
concurrent requests differ from isolated endpoint readings. At that point, the sidebar requested
the corpus report on every destination, so this work also affected opening pages
other than Runs or Corpus.

A cached-navigation smoke check clicked Comparisons, Cases, Corpus, Settings and
Runs in that order. Content was visible after 16, 33, 33, 33 and 67 ms,
respectively, measured through two animation frames after the destination's
loaded content appeared. This is one cached pass, not a fresh-data latency
comparison; background revalidation remains separate from that visible content.
The [browser readings](performance/loading-2026-10-18-browser.json) retain these
observations.

These measurements cover opening the website against a running server. They do
not measure OS-cold reads or provider execution. Server-process startup performs
reconciliation before accepting traffic and is a separate path.

## Earlier cause and implementation

Staleness compares historical records with the corpus under test. Multiple runs
can read the same skill and the same additional instruction files. Previously,
each comparison repeated directory walks, containment checks and hashing of those
files. The corpus report also judges records against the previous stored corpus
version to determine which results the last edit invalidated, adding another
traversal of that evidence.

A switchable probe over one staleness report and one corpus report counted 123
stage captures for two skills. Reusing captures within each report reduced this
to six across the current and scratch sources, and their cumulative capture time
from about 1,753 ms to 93 ms. Reusing repeated individual file reads reduced the
probe's staleness report from 1,495 ms to 359 ms and its corpus report from 2,853 ms
to 738 ms. The probes were removed after confirming the cause.

[`corpus-read-scope.ts`](../src/benchmark/corpus-read-scope.ts) owns an
`AsyncLocalStorage` scope containing promises for these reads. A report creates
the scope; nested reports reuse it. File and layout keys include the complete
corpus source, including a live source's backing root. Stage keys also include
the skill and instruction text. The scratch root used to judge the previous
version remains a distinct source. Concurrent top-level reports have separate
scopes. Calls outside a scope retain their previous uncached behavior.

This avoids a cache lifetime between requests, a filesystem watcher, or a
persistent index. Dropping staleness or invalidation would remove information the
product promises. Keeping results between requests would require invalidating
all affected evidence after edits, external writes and source changes. Reusing
only the repeated work inside a report reduces the measured cost while retaining
fresh reads on the next request.

Parsed JSON responses before and after the change matched for run history,
corpus, run listing, cases, comparison index and a saved pipeline-run detail.
The [response comparison](performance/loading-2026-10-18-responses.json) retains
canonical response hashes and equality results without private response bodies.
The scope tests exercise nested reuse, concurrent isolation, separate sources,
and subsequent edits, removals, escaping symlinks and recovery. Existing corpus,
staleness and invalidation tests cover the reports' evidence semantics.

## Repeat the benchmark

Build and start the integrated server from the repository root:

```sh
mise exec -- bun run build:client
mise exec -- bun run serve
```

In a second terminal, collect five samples per endpoint and five initial API
batches:

```sh
mise exec -- bun tools/benchmark-loading.ts http://localhost:4173 5
```

The command first measures opening batches: listing and settings, followed by
sidebar metadata and freshness after listing completes. `listReadyMs` measures
the list; `ms` measures the initial batch excluding freshness; `freshness.readyMs`
measures the full judgment from batch start. It then prints endpoint first,
median, nearest-rank p95 and individual samples plus response sizes. An endpoint's
`firstMs` follows the opening batches and is not its first request in the process.
Restart the server before a one-repetition invocation to measure first requests;
process readiness and visible rendering require separate observations. It makes GET
requests and no provider calls. An API path returning the HTML fallback is an
error, so an unavailable route cannot silently appear fast. Requests have a
60-second deadline. This is an opt-in benchmark, not a timing assertion in the
ordinary test suite.

`mise exec -- bun run benchmark:loading` runs the same tool. It now exits with
status 1 when the median opening-list data request exceeds 100 ms. Override this
budget explicitly with `--max-list-ms`; it does not cover visible rendering or
server startup. Capture a baseline and compare a later run against the same
quiescent records, corpus, endpoints and machine:

```sh
mise exec -- bun run benchmark:loading http://localhost:4173 7 > /tmp/loading-baseline.json
mise exec -- bun run benchmark:loading http://localhost:4173 7 --baseline /tmp/loading-baseline.json
```

The comparison fails when any endpoint or opening-batch median exceeds its
baseline by more than 20% plus 5 ms. `--max-regression-percent` and
`--allowance-ms` set those limits. Both reports need at least five samples per
metric. Comparison also refuses changed Bun versions, OS families, CPU
architectures/models, endpoint sets and changed or unstable API response bytes.
SHA-256 hashes retain no response bodies. An intentional data or API change
requires a new baseline. Ordinary tests exercise the gate with fixed readings;
the opt-in command supplies the actual timing check.

To include a particular saved-record route, supply endpoint paths after the
repetition count. These replace the sequential endpoint list; the initial API
batches still run:

```sh
mise exec -- bun tools/benchmark-loading.ts http://localhost:4173 5 /api/runs /api/corpus
```

Use the same records, corpus, built client and background workload for both
comparison arms. Do not compare an empty fixture with a populated install. Keep
private response bodies and transcripts out of published benchmark results.

## Earlier follow-ups

Run-history listing and staleness now start together, since neither needs the
other's result. The report still waits for both before combining its rows. Saved
corpus-version manifests also share the report's read scope, so judging the
previous version opens and validates its index once rather than once per file.
The cache key includes the records directory and version digest. A subsequent
report checks the store again, including a manifest removed since the last read.

An alternating comparison against `d544666a`, which includes the first
optimization, used the same machine and records. Five endpoint pairs reversed
baseline/candidate order each round; three pairs measured the concurrent initial
API batch. All paired run-history and corpus JSON responses matched.

| Read                         | Baseline median | Follow-up median | Reduction |
| ---------------------------- | --------------: | ---------------: | --------: |
| Run history                  |        854.8 ms |         474.1 ms |       45% |
| Corpus                       |        776.6 ms |         569.5 ms |       27% |
| Initial concurrent API batch |      1,408.7 ms |       1,157.9 ms |       18% |

The [paired samples](performance/loading-2026-10-18-followups.json) retain the
measurements. Background load differed from the first benchmark, so these figures
should be compared within their pairs rather than with the earlier table. These
small samples establish a local improvement, not a tail-latency guarantee.

## Remaining cost

Reports still scan saved evidence, and corpus invalidation still materializes and
judges the previous version. Their cost grows with history. Polling retains its
active two-second and idle ten-second cadence. Corpus-dependent filters can pause
briefly during a freshness refresh. The parser cache avoids repeated validation,
but does not retain report results or replace filesystem discovery.

The initial JavaScript payload is about 936 KB. Browser startup and rendering
still put the first visible list above 100 ms in the observed navigation. Very
large histories, individual long transcripts and every historical detail route
were not exhaustively benchmarked.
