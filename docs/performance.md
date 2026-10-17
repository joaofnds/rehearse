# Local loading performance

Rehearse's initial data load was dominated by repeated filesystem work in the
run-history staleness and corpus reports. Both now reuse file hashes, stage
captures and layout walks within a report. Each subsequent report starts with an
empty scope and checks the filesystem again.

## Measurements

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
concurrent requests differ from isolated endpoint readings. The sidebar requests
the corpus report on every destination, so this work also affects opening pages
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

## Cause and implementation

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

The command prints JSON with first, median, nearest-rank p95 and individual
samples, plus response sizes and the initial concurrent batches. It makes GET
requests and no provider calls. An API path returning the HTML fallback is an
error, so an unavailable route cannot silently appear fast. Requests have a
60-second deadline. This is an opt-in benchmark, not a timing assertion in the
ordinary test suite.

To include a particular saved-record route, supply endpoint paths after the
repetition count. These replace the sequential endpoint list; the initial API
batches still run:

```sh
mise exec -- bun tools/benchmark-loading.ts http://localhost:4173 5 /api/runs /api/corpus
```

Use the same records, corpus, built client and background workload for both
comparison arms. Do not compare an empty fixture with a populated install. Keep
private response bodies and transcripts out of published benchmark results.

## Remaining cost

Reports still scan saved evidence, and corpus invalidation still materializes and
judges the previous version. Their cost grows with the history. The API requests
for run history and corpus are independent and repeat some evidence work. The
client still refreshes reports when their queries remount, and polling retains
its existing cadence. No cross-request cache or client freshness delay was added.

The initial JavaScript payload was about 932 KB in this build; its local transfer
took about 4 ms in the original browser reading. Splitting that bundle was not
needed to address the reproduced delay. Very large histories, individual long
transcripts and every historical detail route were not exhaustively benchmarked.
