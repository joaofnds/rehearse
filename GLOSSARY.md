# Glossary

Terms describe the harness unless explicitly marked as UI design concepts.
See [current state](docs/status.md) for implementation coverage and
[the reference](docs/reference.md) for command and delivery contracts.

- **Accepted band** — the observed word range of accepted rewrites used to
  design the brief-reply cases. Their `word-band` checks declare a ceiling
  rather than a minimum. This is case-specific evidence, not a general rule for
  reply length.
- **Artifact** — durable output of a stage: a spec or plan document, a backlog
  card update, or commits.
- **Assessment** — the record one regrade writes: the attempt it read, the
  digest of each evidence body it read, the grading definition digest that
  produced it, one result per declared check, and a state grade where the case
  declares a scorer. It carries an overall outcome only when every declared
  check was graded, because a verdict over the checks that had evidence would
  read as a verdict over the whole definition. It is filed beside the attempt
  and never rewrites the attempt record.
- **Attempt** — one execution of a case's unit of work: a stage at a checkpoint
  (the original run's stage result or any replay) or one session of a session
  case. The unit a comparison presents.
- **Attempt record** — the strict record a session attempt writes, including
  case, lineage, model, declared corpus digests, prompt, transcript evidence,
  checks, and provider metrics when available. A completed reply, no reply, and
  an invocation failure have distinct outcomes. The record may preserve a
  supplied provider context evidence bundle and its normalized projection.
  Older records may omit snapshot provenance and context evidence.
- **Attempt region** — the part of a resumed session's transcript the attempt
  itself produced: the 1-based physical lines after the prefix line count the
  attempt record carries. The lines at or before that count are the inherited
  starting context, and a transcript whose record carries no prefix count is
  boundary unknown throughout, the same three regions the context history
  projects (see [reference](docs/reference.md)). Only attempt-region requests
  count toward an attempt's totals: on a measured resumed attempt the region's
  two requests match the provider envelope in all four usage categories, while
  the whole transcript sums 90743 output tokens against the envelope's 151,
  because the rest belongs to the session that was resumed. A transcript whose
  boundary is unknown, and an attempt that saved no transcript, both report
  totals unavailable, since zero and a whole-transcript sum would each assert
  something the record does not settle.
- **Attempt directory** — the fresh temporary directory the harness creates and
  owns for one session attempt, seeded from the case's fixture tree when it
  declares one. A session attempt never runs in a live repository, and the
  directory's real path is what names the attempt's project slug.
- **Attempt state evidence** — the copy of the attempt directory preserved
  beside the transcript before cleanup removes it, holding the files and git
  state the session left: dirty tracked files, untracked files, ignored files,
  and the commit history, with `.git` stored as `dot-git` because git refuses
  to commit a nested repository. The corpus overlay is excluded, being an
  input the record already digests per file. It is what a state check reads,
  and each grade reads its own restored copy, so a grader that writes changes
  neither the evidence nor a later pass's input. An attempt whose provider
  call failed preserves none.
- **Attribution (comparison)** — the claim permitted by corpus differences
  between two named comparison arms after their recorded executed-corpus
  entries are normalized and deduplicated by corpus layout path. No differing
  path means the corpora are identical; exactly one means a movement can be
  attributed to that path; more than one refuses attribution and names every
  differing path.
- **Calibration** — the step that validates a Judge result against a human
  review and turns findings into rubric or instruction changes. It reads the
  frozen evidence a run recorded and the corpus files as they stand now, never
  the live target, so it can run long after the target was restored. It is one
  function of the review, the frozen evidence, and the current rubrics and
  instructions, whether a paused run calls it in a retry loop or the
  `calibrate` command calls it once.
- **Checkpoint** — frozen input state that can start a stage, containing target
  SHA, workflow state, artifacts, and lineage. A run records an initial
  checkpoint after task setup and further checkpoints after accepted stages.
- **Check-integrity file** — a target-relative file declared by the pipeline
  whose presence and bytes are frozen at baseline and compared after delivery.
- **Check kind** — one deterministic assertion a session case may declare, the
  discriminator of a check: `word-band` and `forbidden-text` read the reply,
  `tool-calls` and `files-read` read the transcript. A **state check** grades
  the files and git state the session left; it is declared beside the check
  list rather than inside it, and carries no kind of its own. A kind states what it
  needs and what it reports; the case supplies the values it compares against,
  so no literal a case could differ on lives in the check.
- **Check list** — the ordered deterministic checks a session case declares as
  its judge. It is evaluated over the reply and the transcript, needs no
  provider call, and its rep outcome is successful when and only when every
  check passes.
- **Confirmation run** — an explicitly requested group of at least two reps over
  one frozen input set, used by the outer loop to produce a score; defaults to
  five reps. The UI's design calls this a **group** and counts it in plural
  **attempts** (`group · 6 attempts`, the `×1/×3/×6/×12` replay control, the
  Cases screen's **Run group** action); the word in code, records, and this
  glossary stays confirmation run (see [UI vocabulary](docs/design-handoff/README.md)).
- **Command** — one named verb of the `rehearse` executable (`run`, `replay`,
  `compare`, `review`, `calibrate`, `list`, `show`, `stale`, `case list`,
  `case show`, `case capture`), declaring its own flags with their defaults, environment
  fallbacks, and help lines as data. A name is one or two
  tokens; the longer declared name wins over a prefix of it. The declaration is the single source of
  the flag's name in help, parsing, and documentation, and a command with no
  declared flag prints no flag section.
- **Command record** — the validated evidence a command writes. Depending on
  mode, `run` returns a run artifact, session attempt, or confirmation report.
  `--json` selects record bytes over the record path; stdout carries one or the
  other and no progress, which goes to stderr. `show --json` reads the selected
  record directly.
- **Comparison** — a deterministic report over completed stage, pipeline, or
  session confirmation evidence, each case carrying baseline, candidate, and
  control arms. Stage and pipeline comparisons need at least two benchmark
  cases; a session comparison may cover one. It starts no paid sessions. Session
  comparisons read the frozen case's checks and each recorded attempt, and do
  not synthesize a pipeline final outcome. A version-4 report keeps each source
  rep's ordered quality outcomes beside its identity, so a reader can associate
  an ordinal with its grades and non-judged statuses without reopening source
  records. Version-1 through version-3 reports remain readable with their
  original fields.
- **Comparison arm** — one role in a comparison: baseline, candidate, or the
  mandatory minimal-corpus control. An arm uses the same corpus snapshot across
  every benchmark case; a session control may have an empty declared corpus.
- **Quality reading (comparison)**: a per-case, per-arm-pair, per-measure
  interpretation of the observed spread across repeated attempts. It carries
  each arm's low-to-high grade or PASS/FAIL interval and one verdict: the spans
  overlap within rerun noise, both arms already succeed on every requested rep,
  or the spans are separated and the arm that succeeds more often is named. It
  is derived from each arm's recorded reliability summary, not from the paired
  estimate across cases.
- **Benchmark case** — one frozen task with its source or checkpoint and all
  non-corpus inputs. It is the sampling unit a multi-case comparison pairs its
  arms on; a single-case session comparison samples reps instead.
- **Sampling unit** — the observation a comparison's uncertainty is estimated
  over. A multi-case comparison pairs its arms case by case and reads variation
  between case means. A single-case session comparison samples the reps of one
  case, treats the arms as independent samples rather than paired, and prints
  the unit it used beside the estimate.
- **Case** (design usage) — the UI design's phrase for a task plus the
  corpus, judges, and thresholds it runs under. It overlaps with this
  glossary's benchmark case without matching field for field: the case
  declaration pins task, product brief, final rubric, per-stage rubrics,
  pipeline, and target, but has no case-level `corpus` field (corpus is
  chosen per run by `--corpus`) and no case-level threshold field (a minimum
  grade is a run setting, not part of the case declaration) (see [UI vocabulary](docs/design-handoff/README.md)).
- **Case declaration** — the committed `case.json` that states a benchmark case
  as data: its id, kind, title, and the case-relative inputs the kind needs. It
  is parsed at the boundary. Case input paths stay within the case directory,
  while a pipeline target may point to an external repository.
- **Case directory** — `cases/<id>/`, the one place a case's declaration and its
  input files live, transcript prefixes included. The directory name is the case
  id. Cases live in the control repository, never beside the corpus they grade.
- **Case kind** — which inputs a case declares and how an attempt at it is run:
  `pipeline`, today's stage graph against a target repository, or `session`, one
  Claude session. The kind is the discriminator of the case declaration, so a
  case cannot carry another kind's inputs.
- **Control repository** — this repository, containing the harness, case
  definitions, and rubrics, with local run artifacts under its ignored run
  directory. Its contributor instructions are separate from the corpus under
  evaluation.
- **Contribution** — one of the three run-detail UI layouts. It grades a run's
  outcome on its own, from recorded evidence, then has an agent (not a
  deterministic computation) name a likely culprit stage among those that
  ran. The agent's reading is disclosed as an opinion, never as a
  measurement, and is provisional until the run ends. It is not an ablation:
  ablation needs a rerun per node and is a separate planned feature
  (see [UI vocabulary](docs/design-handoff/README.md)).
- **Context manifest** — the transcript-observed instruction/context paths for
  a session attempt, classified as corpus or project inputs and reconciled
  against declarations. Observed entries are name-only; declared corpus hashes
  are separate evidence. An invocation does not prove successful delivery or
  that the instruction was followed, and missing observations do not prove
  absence from context. The manifest deduplicates paths rather than retaining
  a load history. Full pipeline context observation is not yet wired.
- **Context evidence** — an optional, versioned attempt-record field containing
  an unchanged provider capture and the harness's normalized projection. The
  projection joins request usage, model, provider cost, agent parentage,
  instruction loads, and compactions when documented identifiers support the
  join. Request identities are session-scoped, and client/server aliases are
  retained. The projection keeps missing identifiers and conflicts explicit.
  Malformed records from validated hook, OTel, raw-body-reference, and coverage
  shapes remain explicit. Calculated request cost retains the selected rate and
  its frozen catalog; omission of the field means no provider bundle was
  supplied.
- **Context half** — whether an instruction/context path or divergence is a
  corpus input, from the instruction files under evaluation (`corpus`), or a
  project input, from the case's fixture tree (`project`). Keeping the two
  halves distinct lets divergences name which side was expected without
  conflating a missing fixture file with a missing skill. A record written
  before entries carried a half has none, which means not recorded rather than
  corpus.
- **Context history** — the ordered, read-only browser projection of one saved
  session attempt's starting context, tool events, observed deliveries, results,
  and evidence gaps. It is derived from the colocated transcript and is not a
  measurement of the provider's active context window.
- **Corpus (instruction corpus)** — the instruction files under evaluation: the
  installed `CLAUDE.md`, the stage skills, the output styles, the agent
  definitions, and the rulebook. A case names the ones it reads in corpus
  layout paths (`CLAUDE.md`, `skills/<name>/...`, `output-styles/<name>.md`,
  `agents/<name>.md`, `rulebook/<name>.md`), which one resolver maps onto the
  install, so an edit to any of them can make a prior attempt stale.
- **`corpus@<hash>`** — run history's label for a run's corpus digest: what one
  stage's checkpoint actually read, computed over the checkpoint's own
  recorded corpus files. Distinct from `corpus root@<hash>`, which digests a
  different set of files.
- **`corpus root@<hash>`** — the corpus screen's label for a digest over every
  file in the live corpus tree, including files no stage has ever read. Two
  screens computing a digest over two different file sets is why the label
  differs from `corpus@<hash>` rather than reusing it.
- **Cut** — the 0-based line index of the first session-file record a transcript
  prefix drops. A cut of N keeps lines [0, N).
- **Corpus layout** — the directory shape a corpus takes once resolved, and the
  only shape the harness reads: `CLAUDE.md`, `skills/<name>/`,
  `output-styles/<name>.md`, `agents/<name>.md`, and `rulebook/<name>.md`
  under one root. A corpus layout path names a file within it. Every corpus
  source resolves to this layout, so the code that hashes and installs a
  corpus never learns where the bytes came from.
- **Corpus layout path** — how a case names a corpus file, independent of where
  the corpus is installed: `CLAUDE.md`, `output-styles/<name>.md`,
  `agents/<name>.md`, `rulebook/<name>.md`, or `skills/<name>/...`. One
  resolver maps a layout path onto the selected corpus root. Missing files are
  refused, although a debug command may already have paid for a model probe.
- **Corpus snapshot** — a recorded set of corpus inputs and their provenance.
  Confirmation and directory-backed session execution copy supported declared
  inputs. A live session debug snapshot points at installed files and does not
  freeze them. Stage snapshots capture the instructions and supporting files
  needed for replay. Hashing an input is distinct from delivering it to the
  provider.
- **Corpus overlay** — the declared styles, agent definitions, and rulebook
  files written under a session attempt's `.claude/` directory. This delivery
  path does not overlay global `CLAUDE.md` or skills. Stage replay uses a
  separate snapshot installation path. See the reference's corpus support
  matrix.
- **Corpus refusal** — a named statement that a corpus path selected for reading
  cannot supply the directory entries or file bytes its role claims, carrying the
  layout path and the reason: it resolves outside the permitted extent, its
  link target is missing, its link never resolves, it cannot be read, or it has
  the wrong file type. A refusal is data a report carries, not a failure of the
  report: the reading surface names the entry, omits its layout directory's
  files, and withholds the corpus digest, so an unidentifiable corpus is never
  served as an identified one.
- **Corpus snapshot origin** — where a snapshot's bytes were read from, recorded
  beside them and persisted in the attempt record: the live install, or the
  directory the source named. What produced that directory is not recorded,
  because the harness never learns it.
- **Corpus source** — where an attempt's corpus bytes come from, named by
  `--corpus`: a directory already in corpus layout, and nothing else. A corpus
  that lives somewhere else is rendered to a directory with whatever tool owns
  it, outside Rehearse, and that directory is passed. Absent `--corpus` the
  source is the live install. Whether bytes are copied and delivered depends on
  the execution mode, as described in the reference support matrix.
  The live source's permitted extent is its install root and one backing tree
  declared outside the corpus. A link may resolve within either tree; the
  corpus's own links cannot declare another permitted tree.
- **Corpus tier** — stage-local (a skill; testable in stage mode) or global
  (`CLAUDE.md`, doctrine; validated only end-to-end).
- **Corpus variant** — one corpus a comparison arm runs against, identified by
  the snapshot its source resolved to rather than by the source string, so two
  directories holding the same bytes are the same variant. It is the corpus half
  of a variant, which also fixes model and effort.
- **Delivery stage** — a stage whose artifact is committed code; its
  evidence is a diff, changed paths, check integrity, and local check results.
  Today, `build`.
- **End-to-end mode** — running the whole pipeline to evaluate its final
  committed output. Stage gates still judge intermediate artifacts and can stop
  execution before a final result exists.
- **Exit code** — what the executable returns, with one meaning each: `0` the
  command completed and wrote its record, whatever the grade; `2` a usage error
  (unknown flag, missing required flag, unparseable value); `3` a refused
  precondition (a needed approval whose flag is absent while stdin is not a
  TTY, a run that cannot be replayed); `1` an execution failure. A failing grade
  is evidence, not an error.
- **Grading definition digest** — the identity of the check list and state
  scorer that produced an assessment: a SHA-256 over the canonical form of
  `{checks, stateCheck}`. Lineage cannot serve, because it hashes the
  transcript, fixture, prompt, tools, settings, agents, project files and state
  scorer but not `checks`, so two cases differing only in a reply check share
  a lineage. Two assessments of one attempt carrying different digests is how
  an operator sees that the definition changed between them.
- **Fired reply** — the end-of-turn reply João answered with `/brief`. It is the
  reply the style produced and he rejected, not the one he wanted; the rewrite
  he accepted comes later in the same session. A cut is the fired reply's own
  index, so the prefix keeps everything that produced it and drops the reply
  itself, and the attempt writes its own reply in that place.
- **Fixture history** — the committed git history a session case's fixture
  carries, seeded into the attempt directory alongside the fixture tree so every
  arm starts from the same commits. It is stored as a `dot-git` directory,
  because git refuses to commit a nested `.git`, and the seeding renames it and
  recreates the empty `refs/heads` and `refs/tags` that the commit dropped.
  Without those, git declines to read the seeded directory as a repository and
  searches upward, so the session reads whatever history encloses the attempt
  directory, or none.
- **Fork** — copying a transcript prefix into the attempt directory's project
  slug under a fresh uuid, with every occurrence of the source session id
  rewritten, so a session can be resumed from it without its original working
  directory. On claude 2.1.258 the resumed session keeps that uuid and appends
  to the forked file rather than writing a new one.
- **Fresh checkpoint chain** — a replay's consumed checkpoint chain when none
  of its checkpoints is stale.
- **Human review** — the verdict, summary, and classified findings a reviewer
  records against a run's Judge result, in `<run>.review.json`. The reviewer is
  a person or the agent standing in for one; the name says whose judgment the
  record carries, not which hand typed it. `rehearse review` writes it from
  flags or from a file, and calibration reads it.
- **Interrupted run** — a run whose process ended (a `kill -9` or a crash)
  without writing a terminal artifact or stop record. It has no status of its
  own on disk; the server's startup reconciliation pass finds it by checking
  whether the pid the run's claimed target recorded is still alive, and if
  not, marks the run's event stream `run-interrupted`, distinct from `FAILED`,
  which a graceful signal handler still writes on its own.
- **Judge** — evaluator attached to a stage transition: deterministic check or
  rubric-scored LLM with rationale.
- **Judge agreement baseline** — accumulated binary Judge and human decisions
  for one exact Judge model and frozen rubric contract, summarized separately
  for each rubric criterion.
- **Judge attempt** — one Judge call against frozen evidence and a rubric,
  recording its returned payload, call cost, and whether harness validation
  accepted or rejected it.
- **Lineage** — hash of everything that produced a checkpoint: upstream
  checkpoint, corpus files feeding the stage, model, effort, and canonical
  stage settings.
- **Materialize** — write a checkpoint's frozen state into a directory,
  byte-faithfully, so a stage can run from it.
- **Model family** — a named Claude model line — Opus, Sonnet, or Haiku —
  recognized from either its native alias or a full model ID.
- **No reply** — the outcome of a session attempt whose envelope carried no
  result, the provider having stopped at its turn or budget limit. It is not a
  reply of zero words: no check is evaluated and none is recorded, so the
  attempt reads as a measurement that did not happen rather than one that
  passed.
- **Observed delivery** — saved transcript evidence that a Read result or Skill
  companion placed recorded text into session history. An invocation alone is
  not a delivery, and delivery does not show that the model followed the text.
- **Pause** — the interactive stop a run makes with the candidate still in the
  target, asking the reviewer to edit files and press Enter until the
  calibration validates. It is requested by `--pause` and needs a TTY, refused
  before any paid work without one. A run without `--pause` never stops: it
  writes the preliminary artifact, retains the candidate, restores the target,
  and exits, leaving the review and the calibration to their own commands.
- **Pipeline** — the ordered stages and their judge attachments, declared as
  data. The UI's design calls this a **task** (see [UI vocabulary](docs/design-handoff/README.md)); the word in code,
  records, and this glossary stays pipeline. Graded as a whole, a pipeline's
  grade is computed from its first input and its last artifact only, never by
  averaging stage grades, and a pipeline that stopped early is not gradable as
  a whole.
- **Pipeline definition** — the declared, user-authored data the harness reads
  to know which stages to run, in what order, and with what skill, expected
  artifact, and rubric.
- **Planning stage** — a stage that produces planning artifacts such as
  acceptance criteria, card updates, or an attached document. The declaration
  decides which outputs are required. The bundled pipeline's planning stage is
  `shape`.
- **Project instructions** — the instruction file a repository carries in its
  own tree for agents working in it (`CLAUDE.md` or `AGENTS.md`). A property of
  the repository, never installed by the harness. Distinct from the corpus's
  global `CLAUDE.md`, which is the file under evaluation.
- **Product Owner (PO)** — the dynamic agent that answers stage questions from
  the product brief; one session per run.
- **Provider call** — one invocation of the model provider by a worker, Product
  Owner, or Judge. Its evidence may include usage metrics; the call remains
  explicit when those metrics are absent.
- **Regrade** — one re-evaluation of a saved attempt's evidence against the
  case as it stands now, reaching no provider. It reads the recorded reply, the
  transcript beside the attempt, and the preserved state evidence, and writes
  an assessment. A check whose evidence the attempt does not hold is reported
  unavailable rather than graded, and the saved reply, transcript and state
  evidence are left byte-identical, so a corrected check costs no second paid
  session.
- **Record ID** — how a session names one recorded thing to the CLI and how
  the CLI names it back: a kind prefix and the identity that kind already has
  on disk, `case:<id>`, `run:<name>`, `checkpoint:<run>/<stage>`,
  `attempt:stage:<lineage>/<timestamp>`, `attempt:session:<case>/<uuid>`,
  `group:<group-id>`, `comparison:<manifest-digest>`. Every id `list` prints is
  one `show` accepts, and the prefix is parsed once at the boundary into the
  kind, so `show` never guesses which record a bare string named.
- **Record summary** — the short markdown a session pastes onto a card,
  computed as a pure function of one parsed record: for a run its stages,
  grades, verdict, and cost; for a group its reliability summary and cost; for
  a comparison its per-case paired deltas beside the control arm, or, for a
  single-case session comparison, its sampling unit, each arm's own interval,
  and the unpaired contrasts between them. It is never a second
  record shape: `--json` still prints the strict record's own bytes.
- **Rep** — one repetition of a run; scores are distributions over reps, never
  a single rep. The UI's design's singular **attempt** already matches this
  glossary's Attempt entry and needs no mapping; the design's plural
  **attempts** inside a group is this glossary's rep (see [UI vocabulary](docs/design-handoff/README.md)).
- **Rep outcome** — one binary reliability observation. A stage succeeds with
  Judge grade A or B, a final judgment succeeds with PASS, and a session
  succeeds when its declared checks pass with the required evidence. A stop, no
  reply, execution failure, or required missing metrics makes a confirmation rep
  unsuccessful. A comparison records this success value with the judged grade,
  or records `EXECUTION_FAILED`, `METRICS_MISSING`, or `NOT_REACHED` without a
  grade. Lowering a continuation threshold does not redefine success.
- **Replay** — re-running one stage from a checkpoint with the current corpus,
  in a fresh worktree.
- **Retained candidate** — the run's final result commit, pinned in the target
  repository under `refs/rehearse/<run>` before the target is restored, so the
  candidate outlives the run that produced it. Restoring makes the commit
  unreachable and only the ref keeps gc from pruning it;
  `show run:<name> --checkout <dir>` materializes it as a detached worktree.
  It is the same ref a checkpoint is pinned under, named by the run rather than
  by a stage.
- **Rubric** — the frozen grading contract a Judge applies; per-stage under the
  case's `rubrics/`, final in the case's `rubric.md`.
- **Rubric criterion** — one identified hard blocker, requirement, or quality
  dimension within a rubric, reduced to a binary pass/fail decision for
  calibration.
- **Score** — a statistical summary over a confirmation run's rep outcomes:
  their distribution, success rate with standard error, and pass^k. A
  single-rep Judge result is evidence, not a score.
- **Partial score** — how many of a rep's declared graded outcomes held, which
  separates a rep that missed one outcome from one that missed them all where a
  rep outcome alone cannot. A comparison report carries two such tallies per
  rep, one over the declared checks and one over the declared state results,
  each counting what passed against what was declared and listing what failed:
  a failing check by its declaration index and kind, a failing state result by
  its declared name. No field combines the two, `show` prints neither, and
  neither changes the rep outcome, which the live path takes from the checks
  alone.
- **Run artifact** — the recorded evidence of a run under `.benchmark-runs/`.
- **Run artifact transition** — one persistence operation that advances a run's
  main or stage record. Transitions are serialized; abort recording is terminal
  and cannot be overwritten by a later normal transition.
- **Run event** — a timestamped progress fact appended to
  `.benchmark-runs/run-events.sqlite`, keyed by run ID and streamed through the
  server's SSE endpoint. It is best-effort derived progress state. JSON
  artifacts remain authoritative for recorded conclusions; there is no
  event-history rebuild command.
- **Run in flight** — a run that is executing right now: its event stream's
  latest entry is non-terminal, no artifact or stop record has been written for
  it, and the process that claimed its target is still alive. The run-history
  report gives such a run the status `RUNNING`. The liveness check is what
  separates it from an interrupted run, whose stream also ends non-terminal. A
  target holds one claim at a time and that claim names no run, so the check
  answers for the target: a crashed run whose target a later run has claimed can
  still read as in flight.
- **Run spend** — what a whole run has paid, across worker sessions, Judges, and
  the Product Owner. Only a terminal run event carries it, `run-completed` or a
  `run-failed` with a persisted artifact. Distinct from stage spend and from the
  per-session limit the session knobs set.
- **Stage spend** — what one stage has cost. Every non-terminal run event
  carries a spend figure, and the event's kind decides which stage spend it is:
  `stage-started` reports the stages finished before this one, `turn-completed`
  this stage's session so far, `stage-judging` this stage's finished session,
  and `stage-completed` that session together with its Judge. None of them is
  run spend, which is why a reading of one is shown with the words for what it
  covers.
- **Unreadable run** — a recorded run whose own files the run-history report
  could not read into a row, carried by its record ID and a reason with
  absolute paths redacted. A malformed artifact, or a manifest missing from a
  run that stopped or was interrupted, produces one. An unreadable run is data
  the report carries, not a failure of the report, so one bad run does not
  blank the rest. Staleness is judged for every run before any of them is read,
  so a corpus the staleness pass cannot resolve does not produce an unreadable
  run: it produces a staleness cause, or no report at all. A staleness report
  carries its own unreadable list, keyed by case and attempt rather than by
  run; the two are the same idea applied to different records.
- **Project slug** — the name the provider gives the directory it writes a
  session file into: the working directory's real path with every `/` replaced
  by `-`. On macOS `/tmp/x` resolves through its real path first, so it is
  `-private-tmp-x`.
- **Sealed session** — a Claude session with safe mode and no tools, used for
  judges.

- **Session case** — a benchmark case whose unit of work is one Claude session.
  It declares a prompt, tools, corpus files, checks, and optional fixture,
  transcript prefix, settings, agents, project files, and state check. It runs once for
  debugging or as isolated confirmation reps. Current confirmation refuses
  declared global instructions and skills.
- **Session naming** — the uuid an attempt gives its own session before the
  call, as the fork's id when resuming and through `--session-id` otherwise. It
  is what lets the attempt name the one session file it owns under its slug, so
  cleanup deletes that file and never an entry it cannot account for, whether
  the call returned or threw. Seen from the other side, a transcript's records
  carry the id of the session that wrote them, whatever the file or directory
  holding it is called, and that is the identity a capture reads and a fork
  rewrites. A preserved attempt's transcript therefore names the session the
  provider ran, not the uuid of the directory it was saved under.
- **Session knobs** — the CLI and environment settings shared by run and replay
  that select the workflow and Judge models and efforts and set the per-session
  spend limit.
- **Stage** — one pipeline step: a skill invocation consuming upstream
  artifacts and emitting its own. The UI's design calls this a **step**
  (see [UI vocabulary](docs/design-handoff/README.md)); the word in code, records, and this glossary stays stage.
- **Stage commit history** — oldest-first subjects of the commits a stage added
  after its baseline; absent when the stage did not advance the target history.
- **Stage scorecard** — persisted Judge result for one stage: its frozen input
  and rubric, citations, grade, prompt, and Judge cost; a rejected scorecard
  also carries its calibration.
- **Stage settings** — the harness-owned JSON a stage session is started with,
  holding a permissions deny list and a fixed set of boolean feature switches.
  It is never a copy of the operator's live settings, and the schema refuses
  every other key, a hooks block included. A pipeline case may name its own
  file, and a case that names none gets the committed root
  `stage-settings.json`. A checkpoint records the file's canonical digest, the
  hash of the re-serialized JSON the session was given rather than of the file's
  raw bytes. Staleness compares that digest alone, while lineage folds in the
  recorded path beside it. See [the reference](docs/reference.md) for what a
  record stores and when an edit stales a run.
- **Stale case** — a session case whose most recent attempt recorded corpus
  file digests that the current corpus no longer matches. It is the session
  kind's counterpart to a stale checkpoint: the same "this measurement no
  longer describes the corpus" claim, keyed on the files the case declared
  rather than on the skill a stage invoked. A case with no attempt is not
  stale, because nothing was invalidated.
- **Stale checkpoint** — a checkpoint whose recorded inputs (corpus files,
  stage settings, model, effort, or an upstream checkpoint) no longer match
  the current state; still replayable for exploration, refused in comparisons.
- **State check** — the grading definition a session case declares for the
  files and git state its session leaves: a command to run and the outcome
  names it must report. It is declared inline in `case.json`, which is what
  folds it into the attempt's lineage, and it runs against a restored copy of
  the attempt state evidence rather than against a live tree. It reports one
  result per declared outcome, keyed by the name the case declared where a
  reply check's result is keyed by kind, and those results are recorded in
  their own field rather than in the check list, whose members are all
  evaluated against the reply and the transcript. Before the command runs, the
  case's own copy of every path it names is laid back over the restore, so a
  session that rewrote the scorer is still graded by the case's bytes.
- **State grading error** — the record a session attempt carries when its
  declared state check could not produce grades: the scorer would not run,
  exited non-zero, printed output the result schema rejects, or omitted a
  declared outcome. It is a distinct fact from a failed grade, because none of
  those says anything about the session's work.
- **Staleness cause** — one named statement of why a recorded result no longer
  describes the current state. A cause names the thing that moved, an upstream
  stage, the model, the effort, the stage settings file, or one corpus file
  that changed, was added, or was removed, or else it carries a corpus refusal
  verbatim, since a corpus that cannot be read cannot be shown to still match.
  A checkpoint carries its causes as a list: at most four that are not about
  corpus files, then one per corpus file that drifted, so the list has no bound
  but the corpus's size. Its length counts reasons and is not a distance
  between corpus versions.
- **Stage kind** — which validation and evidence strategy a stage uses:
  planning or delivery. Declared per stage, independent of the stage's name.
- **Stage mode** — running one stage against frozen upstream artifacts. This
  supports local debugging and repeated measurements, but an intermediate grade
  remains a proxy for the quality of the complete workflow.
- **Target repository (template project)** — the real application repository,
  kept at a stable baseline, that tasks run against.
- **Target check** — one command declared by the pipeline and run against the
  target repository both at baseline and after delivery.
- **Task graph** — the UI's horizontal chain of stage-node cards (grade,
  status, live tool call, checkpoint, contribution phrase, in/out counts of
  instruction files loaded and artifacts produced) shown on the live monitor
  and, in reduced form, as "the map" on the run-detail Contribution layout.
  A UI concept only; nothing in the harness computes or stores a graph
  (see [UI vocabulary](docs/design-handoff/README.md)).
- **Trajectory step** — one workflow-agent turn reported by the provider. PO and
  Judge turns are excluded so the measure tracks corpus-induced workflow
  behavior.
- **Transcript prefix** — a real session file truncated at a cut and used as
  frozen starting context. It lives in the case directory the declaration
  belongs to, is checked against the declared digest before an attempt resumes
  from it, and is carried in lineage. A prefix holding private material is kept
  out of the repository, so the case reaches another clone without its bytes.
- **Transcript diagnostics** — the compact projection saved on each new session
  attempt record from transcript records at and after its captured cut. It
  records source and measured line counts; raw tool-use occurrences; explicit
  `is_error: true` tool results; and exact repeated `Bash.input.command` values
  on distinct unique tool-use IDs. Locations use 1-based JSONL lines and content
  blocks in the whole retained transcript. Repeated commands keep a digest,
  character count, bounded preview, truncation flag, and ordered locations; the
  complete input stays in the raw transcript. `complete`, `partial`, and
  `unavailable` distinguish an observed zero from incomplete or missing
  evidence. Repetition does not mean waste and carries no phase, token, cost,
  or causal attribution. An absent field on a historical record means the
  projection was not recorded; readers do not reconstruct it from today's case
  declaration.
- **Total input tokens** — one model request's reported
  `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`. The
  three categories are disjoint in every saved transcript, so the sum
  double-counts nothing. The provider's prompt-caching documentation names this
  sum `total_input_tokens`; no saved record carries the sum as a field, so the
  harness computes it. It excludes the request's own output tokens, which rejoin
  the prompt on the next request. It is not the active context window: no saved
  record carries an occupancy figure to render it against, and the window limit
  it would be rendered against comes from the per-model usage block rather than
  from the transcript. The series across an attempt does not rise
  monotonically: a cache re-warm moves tokens from `cache_read_input_tokens` to
  `cache_creation_input_tokens` and lowers the sum, observed in 6 of 54 saved
  attempts, and rows recording no model request report every category zero.
- **Attempt cost reconciliation** — three separately stated readings of one
  attempt's cost, taken from its saved transcript and record rather than from a
  supplied context evidence bundle, whose own per-request pricing is described
  in [reference](docs/reference.md): the cost the provider reported on the
  attempt record, the sum of per-request calculated costs over attempt-region
  requests only, and the difference between them. They are never folded into
  one figure, because the gap between a provider charge and a catalog-derived
  sum is evidence about the catalog. Each reading is complete, incomplete, or
  unavailable with its reasons, and a reader takes the state before the figure:
  an incomplete reading still carries a number, and that number is a partial
  sum rather than a total. A request whose usage, model, cache-write TTL split
  or rate is missing or in conflict leaves the calculated reading incomplete
  and names why, rather than passing as a priced request costing zero.
- **Per-model usage block** — the provider's own account of one CLI call,
  broken down by the models the call used. It carries each model's input,
  output, cache-read and cache-creation tokens, the cost the provider charged
  for them, the model's context window and maximum output tokens, and the basis
  that cost was priced on. The harness retains it verbatim on an attempt's
  metrics. A call made by a CLI that reports no such block records its absence,
  which is not the same as a call that used no model.
- **Rate catalog** — the per-model, per-category prices a request's cost is
  calculated from, carrying the source and version they came from. A saved
  calculation persists the catalog that priced it, so a later catalog changes
  what new calculations cost and leaves the saved ones alone. A reading computed
  on demand persists nothing and prices from whatever catalog its caller
  supplies, reporting itself unavailable when none does. Each category
  records where its price came from, because the suite can only defend a rate
  the saved attempts re-derive. A category no saved attempt exercises is marked
  for what it does rest on, a price someone looked up or a figure computed from
  another category, and pricing that rests on either is weaker evidence than
  pricing the corpus measures.
- **Instruction load** — one instruction file an attempt loaded automatically,
  named by its path and the kind of memory it came from. Two sources record
  loads and they carry different detail. A hook capture also records why the
  file loaded, what triggered it and which file included it. A transcript
  records none of those three, so a load read from a transcript reports them
  unavailable rather than guessing. An attempt whose source records no loads at
  all is distinct from one that loaded none.
- **Cost basis** — what the provider priced a model's reported cost on. A cost
  basis of `list` is public per-token rates, so the cost can be re-derived from
  a rate catalog and checked. Any other basis is a discount or plan the catalog
  does not describe: the cost remains the spend the provider reported, and it is
  not evidence about rates.
- **Variant** — a named configuration: corpus snapshot, model, and effort.
- **Workflow state** — the `backlog/` and `.boris/` trees copied independently
  of Git to carry workflow artifacts across stage materialization and target
  restoration. A target's Backlog configuration determines where its board
  lives. These target artifacts are distinct from Rehearse's external personal
  board.
- **Attempt elapsed time** — the wall-clock duration of one attempt, from its
  start to its finish, including work outside provider calls. Recorded per rep,
  and carried into a comparison as each arm's per-attempt observations and
  their mean. It is not the sum of a call's provider durations, and summing it
  across attempts that ran concurrently does not give wall-clock time.
- **Provider duration** — the time spent inside provider calls. Distinct from
  attempt elapsed time, which also counts the work around those calls, and
  never its sum. Comparison reports do not carry it.
- **Group makespan** — the wall-clock duration of a confirmation group, from
  its first attempt starting to its last finishing. Smaller than the summed
  attempt elapsed time whenever attempts ran concurrently. Recorded on the
  group record and not carried into comparison reports, because it describes
  how the operator scheduled the reps rather than the treatment under test.
