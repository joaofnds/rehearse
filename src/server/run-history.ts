import { unhandled } from "#benchmark/contracts";
import type { Immutable } from "#benchmark/contracts";
import { readCheckpointRecord } from "#benchmark/checkpoint";
import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import type {
	ConfirmationMode,
	ParsedConfirmationGroupRecord,
} from "#benchmark/confirmation-record";
import type { CorpusRoot } from "#benchmark/corpus-file";
import { loadRunManifest } from "#benchmark/manifest";
import type {
	BenchmarkRunPaths,
	SessionAttemptId,
	StageAttemptId,
} from "#benchmark/run-layout";
import {
	benchmarkRunPaths,
	checkpointRecordFile,
	checkpointStageNames,
	confirmationGroupIds,
	confirmationGroupPaths,
	recordedRunNames,
	replayAttemptIds,
	replayRecordFile,
	runEventsDatabaseFile,
	sessionAttemptIds,
	sessionAttemptPaths,
} from "#benchmark/run-layout";
import type {
	NonTerminalRunEventKind,
	RunEvent,
	RunEventStore,
} from "#benchmark/run-events";
import {
	isTerminalRunEventKind,
	openRunEventStore,
} from "#benchmark/run-events";
import { parseRunSummaryRecord } from "#benchmark/record-summary";
import { readReplayRecord } from "#benchmark/replay";
import type { ReplayRecord } from "#benchmark/replay";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import { formatRecordId } from "#cli/record-id";
import {
	checkpointShortId,
	frozenStages,
	shortIdsOf,
} from "#cli/short-id-column";
import {
	checkpointStageNumber,
	formatCheckpointShortId,
	readAllShortIds,
} from "#benchmark/short-id";
import type { ShortIdEntry } from "#benchmark/short-id";
import {
	awaitingJudgeStageRecordSchema,
	stoppedStage,
	stoppedStageRecordSchema,
} from "#benchmark/run-outcome";
import { staleCheckpoints } from "#benchmark/staleness-report";
import { stoppedStatus } from "#benchmark/stopped-status";
import type { RunLiveness } from "#benchmark/run-liveness";
import { checkpointAttempts, repAttemptId } from "./checkpoint-attempts";
import type { AttemptPosition } from "./checkpoint-attempts";
import { corpusDigest } from "./corpus-digest";
import { redactAbsolutePaths } from "./redact-path";

/**
 * What a run's `spentUsd` covers, in words, decided by the event kind that
 * produced the figure. Every kind reports a different scope and none of them
 * is the run total: a display that called them all "spent this run" would
 * show a number that falls when a stage begins judging. The words are chosen
 * here rather than in the client because which scope a kind carries is the
 * emitter's knowledge, verified at the four emission sites in `run.ts`,
 * `workflow.ts` and `run-abort.ts`.
 */
const SPEND_SCOPE = {
	"stage-started": "the stages finished before this one",
	"turn-completed": "this stage's session so far",
	"stage-judging": "this stage's session",
	"stage-completed": "this stage's session and its judge",
} as const satisfies Record<NonTerminalRunEventKind, string>;

type SpendScope = (typeof SPEND_SCOPE)[keyof typeof SPEND_SCOPE];

/**
 * A run's live readings, present together or not at all. A finished run has
 * none of them, and a running one has all of them, so they sit behind one
 * discriminant rather than as separate fields a reader could find half-filled.
 * The executing stage is here rather than on the row's own `stage`, which
 * means the last checkpoint recorded and drives the grade, digest, and
 * staleness readings: the stage now executing has written no checkpoint yet.
 *
 * `elapsedMs` is the figure the run itself measured, and `measuredAt` says
 * when. A run emits an event once per agent turn, minutes apart, so a reader
 * rendering `elapsedMs` alone would show a clock that stops between turns.
 * The pair lets it keep running without this reader inventing a number the
 * run never recorded.
 */
export type RunProgress =
	| { readonly state: "recorded" }
	| {
			readonly state: "running";
			readonly stage: string;
			readonly elapsedMs: number;
			readonly measuredAt: string;
			readonly spentUsd: number;
			readonly spendScope: SpendScope;
	  };

/**
 * Where a row's saved context opens, or why it cannot. A link is built only
 * from the record's own recorded identity, never derived, so it cannot open a
 * sibling's evidence; a record whose context has no page says so instead of
 * linking to one that would fail.
 */
export type ContextLink =
	| {
			readonly state: "available";
			readonly label: string;
			readonly href: string;
	  }
	| {
			readonly state: "unavailable";
			readonly label: string;
			readonly reason: string;
	  };

/**
 * One pipeline run's row, in decision-5's code vocabulary (`run`, `caseId`,
 * `stage`), never the design's task/step labels. `caseId` is undefined only
 * for a run whose status comes from its events and whose manifest was never
 * written: the event table has no case column.
 */
export interface PipelineRunRow {
	readonly kind: "run";
	readonly run: string;
	readonly shortId: string | undefined;
	/** The short id of each checkpoint the run recorded, earliest first. */
	readonly checkpoints: readonly CheckpointShortId[];
	readonly caseId: string | undefined;
	readonly status: string;
	readonly stage: string | undefined;
	readonly grade: string | undefined;
	readonly corpus: { readonly digest: string } | undefined;
	readonly stale: boolean;
	readonly staleCauses: readonly string[];
	readonly progress: RunProgress;
	readonly links: readonly ContextLink[];
}

export interface SessionAttemptRow {
	readonly kind: "session-attempt";
	readonly caseId: string;
	readonly uuid: string;
	readonly shortId: string | undefined;
	readonly status: SessionAttemptRecord["outcome"];
	readonly links: readonly ContextLink[];
}

/**
 * One stage replayed from a checkpoint. Its case is the source run's, read
 * from that run's manifest, and is undefined when the manifest is gone. Its
 * context opens only under the lineage it consumed, the one identity the
 * replay history reader accepts for it.
 */
export interface ReplayRow {
	readonly kind: "replay";
	readonly lineage: string;
	readonly timestamp: string;
	readonly shortId: string | undefined;
	/** The short id of the checkpoint the replay started from. */
	readonly checkpointShortId: string | undefined;
	readonly attempt: AttemptPosition | undefined;
	readonly caseId: string | undefined;
	readonly stage: string;
	readonly grade: string;
	readonly status: ReplayRecord["scorecard"]["grade"]["verdict"];
	readonly links: readonly ContextLink[];
}

/**
 * One confirmation group, listed once rather than once per rep: its reps are
 * links, since a rep is evidence of the group rather than a run of its own.
 */
export interface ConfirmationGroupRow {
	readonly kind: "group";
	readonly groupId: string;
	readonly shortId: string | undefined;
	readonly caseId: string;
	readonly mode: ConfirmationMode;
	readonly reps: number;
	readonly repAttempts: readonly RepAttempt[];
	readonly links: readonly ContextLink[];
}

export interface RepAttempt {
	readonly repId: string;
	readonly attempt: AttemptPosition;
}

/**
 * One run-history row, one per saved record an operator can open. This is
 * the single place that owns the read API's response shape for a run-history
 * row: no other card owns it.
 */
export type RunHistoryRow =
	| PipelineRunRow
	| SessionAttemptRow
	| ReplayRow
	| ConfirmationGroupRow;

/**
 * The last checkpoint a run recorded, in pipeline order rather than
 * alphabetical: `checkpointStageNames` sorts by name, which is not the order
 * stages run in, so "latest" is read off the manifest's own stage sequence
 * intersected with what the run actually recorded.
 */
async function latestCheckpointStage(
	runsDirectory: string,
	run: string,
): Promise<string | undefined> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const manifestFile = Bun.file(paths.manifestFile);
	if (!(await manifestFile.exists())) {
		return undefined;
	}

	const manifest = await loadRunManifest(paths.manifestFile);
	const recorded = new Set(await checkpointStageNames(runsDirectory, run));
	const ordered = manifest.pipeline.stages
		.map(({ name }) => name)
		.filter((name) => recorded.has(name));

	return ordered.at(-1);
}

interface RunIdentity {
	readonly status: string;
	readonly caseId: string | undefined;
	readonly gradeByStage: ReadonlyMap<string, string>;
	readonly progress: RunProgress;
	readonly links: readonly ContextLink[];
}

const RECORDED: RunProgress = { state: "recorded" };

/**
 * A run known only from its manifest (no graded artifact): the STOPPED and
 * RUNNING statuses read the case ID from there, and refuse a run whose
 * manifest never got written rather than reporting it with no case ID.
 */
async function manifestBackedIdentity(
	paths: BenchmarkRunPaths,
	status: string,
	progress: RunProgress = RECORDED,
): Promise<RunIdentity> {
	if (!(await Bun.file(paths.manifestFile).exists())) {
		throw new Error(`incomplete: no manifest.json at ${paths.manifestFile}`);
	}

	const manifest = await loadRunManifest(paths.manifestFile);

	return {
		status,
		caseId: manifest.caseId,
		gradeByStage: new Map(),
		progress,
		links: [],
	};
}

/**
 * A run whose status comes from its event stream. The stream is the record
 * it ran, so a missing manifest costs the row its case, not its place in the
 * list.
 */
async function eventBackedIdentity(
	paths: BenchmarkRunPaths,
	status: string,
	links: readonly ContextLink[],
): Promise<RunIdentity> {
	const caseId = (await Bun.file(paths.manifestFile).exists())
		? await sourceCaseId(paths.manifestFile)
		: undefined;

	return { status, caseId, gradeByStage: new Map(), progress: RECORDED, links };
}

/**
 * The readings a non-terminal event carries, or undefined when the run's
 * stream says it has already finished. A terminal kind here is not a run in
 * flight even with a live marker on its target: a signal abort with no pending
 * artifact records `run-failed` and writes no artifact file, leaving a
 * finished run whose target still holds the claim it never restored.
 */
function runningProgress(
	latest: RunEvent | undefined,
): RunProgress | undefined {
	if (latest === undefined || isTerminalRunEventKind(latest.kind)) {
		return undefined;
	}

	const spendScope = SPEND_SCOPE[latest.kind];

	return {
		state: "running",
		stage: latest.stage,
		elapsedMs: latest.elapsedMs,
		measuredAt: latest.recordedAt,
		spentUsd: latest.spentUsd,
		spendScope,
	};
}

/**
 * Whether the target this run claimed is still held by a live process. The pid
 * is what keeps the badge honest: reconciliation runs only at server startup,
 * so without this probe a run killed while the server stayed up would read as
 * RUNNING forever.
 *
 * Every way of failing to reach an answer is "not running". Reading the marker
 * shells out to git in the target, so a target that was deleted or is no
 * longer a checkout throws rather than returning nothing. Letting that throw
 * escape would move the run from silently absent, which is where it sat before
 * this branch existed, to an unreadable entry blaming git on every page load,
 * for a run that is simply not executing.
 */
async function claimsLiveTarget(
	manifestFile: string,
	liveness: RunLiveness,
): Promise<boolean> {
	if (!(await Bun.file(manifestFile).exists())) {
		return false;
	}

	const manifest = await loadRunManifest(manifestFile);
	const marker = await liveness
		.readMarker(manifest.sourceRoot)
		.catch(() => undefined);

	return marker !== undefined && liveness.isAlive(marker.pid);
}

/**
 * The stage a failed run failed in. A failure caught outside any stage the
 * runner tracks records `run-failed` with no stage, so the last stage the run
 * started stands in, and a run that started none names no stage.
 */
function failedStage(
	runEvents: RunEventStore,
	run: string,
): string | undefined {
	return runEvents
		.eventsSince(run, 0)
		.map(({ stage }) => stage)
		.findLast((stage) => stage !== "");
}

async function statusAndCaseId(
	runsDirectory: string,
	run: string,
	runEvents: RunEventStore,
	liveness: RunLiveness,
): Promise<RunIdentity | undefined> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	if (await Bun.file(paths.artifactFile).exists()) {
		const record = parseRunSummaryRecord(
			await Bun.file(paths.artifactFile).text(),
		);

		return {
			status: record.status,
			caseId: record.caseId,
			progress: RECORDED,
			links: [],
			gradeByStage: new Map(
				record.stageScorecards.map((scorecard) => [
					scorecard.stage,
					scorecard.grade.grade,
				]),
			),
		};
	}

	const stopped = await stoppedStage(runsDirectory, run);
	if (stopped !== undefined) {
		return manifestBackedIdentity(paths, stoppedStatus(stopped.stage));
	}

	const latest = runEvents.latestEvent(run);

	/**
	 * A kill -9 leaves no artifact and no STAGE_JUDGE_FAILED file: nothing
	 * runs to write one. The reconciliation pass is the only thing that ever
	 * marks such a run, in the event stream rather than on disk, so this is
	 * the one status this reader derives from SQLite instead of a file.
	 */
	if (latest?.kind === "run-interrupted") {
		return eventBackedIdentity(paths, "INTERRUPTED", []);
	}

	/**
	 * A signal abort, or a failure before the stage wrote its record, leaves
	 * `run-failed` and nothing on disk for the stage it failed in, so the row
	 * says so instead of linking to a page with no record.
	 */
	if (latest?.kind === "run-failed") {
		const stage = failedStage(runEvents, run);

		return eventBackedIdentity(
			paths,
			"FAILED",
			stage === undefined
				? []
				: [
						{
							state: "unavailable",
							label: stage,
							reason: "failed before saving its context",
						},
					],
		);
	}

	if (latest === undefined) {
		throw new Error(
			(await Bun.file(paths.manifestFile).exists())
				? "no record: no stage record and no run events"
				: "no manifest recorded",
		);
	}

	const progress = runningProgress(latest);
	if (
		progress !== undefined &&
		(await claimsLiveTarget(paths.manifestFile, liveness))
	) {
		return manifestBackedIdentity(paths, "RUNNING", progress);
	}

	return undefined;
}

/**
 * Whether a stage's own record file is one the stage page renders without a
 * checkpoint: a stop record, or a record left awaiting judgment, naming this
 * stage.
 */
async function checkpointlessStageRecorded(
	paths: BenchmarkRunPaths,
	stage: string,
): Promise<boolean> {
	const file = Bun.file(paths.stageFile(stage));
	if (!(await file.exists())) {
		return false;
	}

	const contents: unknown = JSON.parse(await file.text());
	const recorded =
		stoppedStageRecordSchema.safeParse(contents).data?.stage ??
		awaitingJudgeStageRecordSchema.safeParse(contents).data?.stage;

	return recorded === stage;
}

/**
 * A link to every stage whose context page renders a report, in pipeline
 * order: a stage that saved a checkpoint, the stage that stopped the run, and
 * a stage left awaiting judgment. `initial` is not a pipeline stage, so
 * reading the stage list off the manifest leaves it out, and a run with no
 * manifest has no page for any stage.
 */
async function stageLinks(
	runsDirectory: string,
	run: string,
): Promise<readonly ContextLink[]> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	if (!(await Bun.file(paths.manifestFile).exists())) {
		return [];
	}

	const manifest = await loadRunManifest(paths.manifestFile);
	const checkpointed = new Set(await checkpointStageNames(runsDirectory, run));
	const links: ContextLink[] = [];
	for (const { name: stage } of manifest.pipeline.stages) {
		if (
			(checkpointed.has(stage) &&
				(await Bun.file(
					checkpointRecordFile(paths.checkpointDirectory(stage)),
				).exists())) ||
			(await checkpointlessStageRecorded(paths, stage))
		) {
			links.push({
				state: "available",
				label: stage,
				href: `/runs/${encodeURIComponent(run)}/stages/${encodeURIComponent(stage)}`,
			});
		}
	}

	return links;
}

export interface CheckpointShortId {
	readonly stage: string;
	readonly shortId: string;
}

/**
 * A claimed run's recorded checkpoints by short id, numbered by the stages
 * its manifest froze, none for a run with no short id or no readable manifest.
 */
async function checkpointShortIds(
	runsDirectory: string,
	run: string,
	shortId: string | undefined,
): Promise<readonly CheckpointShortId[]> {
	const stages =
		shortId === undefined ? undefined : await frozenStages(runsDirectory, run);
	if (shortId === undefined || stages === undefined) {
		return [];
	}

	const paths = benchmarkRunPaths(runsDirectory, run);
	const numbered: { stage: string; number: number }[] = [];
	for (const stage of await checkpointStageNames(runsDirectory, run)) {
		const number = checkpointStageNumber(stages, stage);
		if (
			number !== undefined &&
			(await Bun.file(
				checkpointRecordFile(paths.checkpointDirectory(stage)),
			).exists())
		) {
			numbered.push({ stage, number });
		}
	}

	return numbered
		.toSorted((left, right) => left.number - right.number)
		.map(({ stage, number }) => ({
			stage,
			shortId: formatCheckpointShortId(shortId, number),
		}));
}

async function rowFor(
	runsDirectory: string,
	run: string,
	shortId: string | undefined,
	staleByCheckpointId: ReadonlyMap<string, readonly string[]>,
	runEvents: RunEventStore,
	liveness: RunLiveness,
): Promise<PipelineRunRow | undefined> {
	const identity = await statusAndCaseId(
		runsDirectory,
		run,
		runEvents,
		liveness,
	);
	if (identity === undefined) {
		return undefined;
	}

	const { status, caseId, gradeByStage, progress } = identity;
	const available = await stageLinks(runsDirectory, run);
	const links = [
		...available,
		...identity.links.filter(
			({ label }) => !available.some((link) => link.label === label),
		),
	];
	const checkpoints = await checkpointShortIds(runsDirectory, run, shortId);
	const stage = await latestCheckpointStage(runsDirectory, run);
	if (stage === undefined) {
		const causes = staleByCheckpointId.get(`checkpoint:${run}/initial`) ?? [];

		return {
			kind: "run",
			run,
			shortId,
			checkpoints,
			status,
			caseId,
			stage: undefined,
			grade: undefined,
			corpus: undefined,
			stale: causes.length > 0,
			staleCauses: causes,
			progress,
			links,
		};
	}

	const paths = benchmarkRunPaths(runsDirectory, run);
	const checkpoint = await readCheckpointRecord(
		paths.checkpointDirectory(stage),
	);
	const causes = staleByCheckpointId.get(`checkpoint:${run}/${stage}`) ?? [];

	return {
		kind: "run",
		run,
		shortId,
		checkpoints,
		status,
		caseId,
		stage,
		grade: gradeByStage.get(stage),
		corpus: { digest: corpusDigest(checkpoint.corpusFiles) },
		stale: causes.length > 0,
		staleCauses: causes,
		progress,
		links,
	};
}

async function sessionAttemptRow(
	runsDirectory: string,
	attempt: SessionAttemptId,
	shortId: string | undefined,
): Promise<SessionAttemptRow> {
	const { recordFile } = sessionAttemptPaths(runsDirectory, attempt);
	if (!(await Bun.file(recordFile).exists())) {
		throw new Error("incomplete: no attempt.json recorded");
	}

	const record = parseSessionAttemptRecord(await Bun.file(recordFile).text());

	return {
		kind: "session-attempt",
		caseId: attempt.caseId,
		uuid: attempt.uuid,
		shortId,
		status: record.outcome,
		links: [
			{
				state: "available",
				label: "context",
				href: `/attempts/session/${encodeURIComponent(attempt.caseId)}/${encodeURIComponent(attempt.uuid)}`,
			},
		],
	};
}

async function sourceCaseId(manifestFile: string): Promise<string> {
	const manifest = await loadRunManifest(manifestFile);

	return manifest.caseId;
}

async function replayRow(
	runsDirectory: string,
	attempt: StageAttemptId,
	shortId: string | undefined,
	shortIds: ReadonlyMap<string, string>,
	attempts: ReadonlyMap<string, AttemptPosition>,
): Promise<ReplayRow> {
	const record = await readReplayRecord(
		replayRecordFile(runsDirectory, attempt.lineage, attempt.timestamp),
	);
	const { manifestFile } = benchmarkRunPaths(runsDirectory, record.runName);
	const caseId = (await Bun.file(manifestFile).exists())
		? await sourceCaseId(manifestFile)
		: undefined;

	return {
		kind: "replay",
		lineage: attempt.lineage,
		timestamp: attempt.timestamp,
		shortId,
		checkpointShortId: await checkpointShortId(
			runsDirectory,
			shortIds,
			record.runName,
			record.consumed.stage,
		),
		attempt: attempts.get(
			formatRecordId({ kind: "attempt:stage", ...attempt }),
		),
		caseId,
		stage: record.stage,
		grade: record.scorecard.grade.grade,
		status: record.scorecard.grade.verdict,
		links: [replayLink(attempt, record.consumed.lineage, caseId)],
	};
}

/**
 * The replay page reads the source run's manifest, so a replay whose source
 * manifest is gone has no page that renders.
 */
function replayLink(
	attempt: StageAttemptId,
	consumedLineage: string,
	caseId: string | undefined,
): ContextLink {
	if (consumedLineage !== attempt.lineage) {
		return {
			state: "unavailable",
			label: "context",
			reason: "filed under a lineage it did not consume",
		};
	}
	if (caseId === undefined) {
		return {
			state: "unavailable",
			label: "context",
			reason: "source run manifest not recorded",
		};
	}
	return {
		state: "available",
		label: "context",
		href: `/replays/${encodeURIComponent(attempt.lineage)}/${encodeURIComponent(attempt.timestamp)}`,
	};
}

/**
 * A rep's context opens only for a session group whose rep recorded both its
 * rep record and its attempt, the files the confirmation history reader
 * refuses to open without.
 */
async function repLink(
	runsDirectory: string,
	groupId: string,
	mode: ConfirmationMode,
	reference: { readonly repId: string; readonly ordinal: number },
): Promise<ContextLink> {
	const label = `rep ${String(reference.ordinal)}`;
	if (mode !== "session") {
		return {
			state: "unavailable",
			label,
			reason: `a ${mode} group has no session context`,
		};
	}

	const rep = confirmationGroupPaths(runsDirectory, groupId).rep(
		reference.repId,
	);
	const recorded =
		(await Bun.file(rep.recordFile).exists()) &&
		(await Bun.file(rep.attemptFile).exists());
	if (!recorded) {
		return {
			state: "unavailable",
			label,
			reason: `no attempt recorded for ${reference.repId}`,
		};
	}

	return {
		state: "available",
		label,
		href: `/groups/${encodeURIComponent(groupId)}/reps/${encodeURIComponent(reference.repId)}/attempt`,
	};
}

/**
 * A session-mode rep has no checkpoint, so its attempt is its position in its
 * group. A stage-mode rep's is its attempt at the checkpoint it ran from, and
 * one that recorded no result, or whose group cannot be placed, has none.
 */
function repAttempts(
	record: Immutable<ParsedConfirmationGroupRecord>,
	attempts: ReadonlyMap<string, AttemptPosition>,
): readonly RepAttempt[] {
	return record.repRecords.flatMap(({ repId, ordinal }) => {
		const attempt =
			record.mode === "session"
				? { position: ordinal, count: record.reps }
				: attempts.get(repAttemptId(record.groupId, repId));

		return attempt === undefined ? [] : [{ repId, attempt }];
	});
}

async function groupRow(
	runsDirectory: string,
	groupId: string,
	shortId: string | undefined,
	attempts: ReadonlyMap<string, AttemptPosition>,
): Promise<ConfirmationGroupRow> {
	const { groupFile } = confirmationGroupPaths(runsDirectory, groupId);
	if (!(await Bun.file(groupFile).exists())) {
		throw new Error("incomplete: no group.json recorded");
	}

	const record = parseConfirmationGroupRecord(await Bun.file(groupFile).text());
	const links = await Promise.all(
		record.repRecords.map((reference) =>
			repLink(runsDirectory, groupId, record.mode, reference),
		),
	);

	return {
		kind: "group",
		groupId,
		shortId,
		caseId: record.caseId,
		mode: record.mode,
		reps: record.reps,
		repAttempts: repAttempts(record, attempts),
		links,
	};
}

/**
 * The time a row's own identity records, or undefined when its record holds
 * none. A run name and a replay file name are both the run's timestamp with
 * colons replaced, so they sort as text.
 */
function recordedTime(row: RunHistoryRow): string | undefined {
	switch (row.kind) {
		case "run": {
			return row.run;
		}
		case "replay": {
			return row.timestamp;
		}
		case "session-attempt":
		case "group": {
			return undefined;
		}
		default: {
			return unhandled(row, "run history row kind");
		}
	}
}

/**
 * Newest first where a record says when it ran, then every row whose record
 * does not, in listing order. Placing those by file time would claim an order
 * the records never held: most attempt files share one modification second.
 */
function newestFirst(rows: readonly RunHistoryRow[]): RunHistoryRow[] {
	const timed = rows.filter((row) => recordedTime(row) !== undefined);
	const untimed = rows.filter((row) => recordedTime(row) === undefined);

	return [
		...timed.toSorted((left, right) =>
			(recordedTime(right) ?? "").localeCompare(recordedTime(left) ?? ""),
		),
		...untimed,
	];
}

/**
 * A saved record that failed to read, with the row kind it would have been,
 * or the short id registry, whose failure leaves every row unnamed.
 */
export interface UnreadableRecord {
	readonly kind: RunHistoryRow["kind"] | "short-ids";
	readonly id: string;
	readonly reason: string;
}

export interface RunHistoryReport {
	readonly rows: readonly RunHistoryRow[];
	readonly unreadable: readonly UnreadableRecord[];
}

/**
 * The registry names rows and nothing else, so a failure to read it leaves
 * every row listed under its Record ID and is reported beside the rows.
 */
async function registryEntries(runsDirectory: string): Promise<{
	readonly entries: readonly ShortIdEntry[];
	readonly unreadable: readonly UnreadableRecord[];
}> {
	try {
		return { entries: await readAllShortIds(runsDirectory), unreadable: [] };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return {
			entries: [],
			unreadable: [
				{
					kind: "short-ids",
					id: "short-ids",
					reason: redactAbsolutePaths(message),
				},
			],
		};
	}
}

/**
 * Every recorded run rendered as a run-history row, staleness recomputed
 * against `source` on every call rather than cached: a stale badge that is
 * silently wrong is worse than the cost of hashing the corpus.
 *
 * One run's failure to read, a malformed artifact, a missing manifest, a
 * corpus file `staleCheckpoints` cannot resolve, is collected rather than
 * thrown: the `list runs` precedent (`src/cli/list-command.ts`'s `collect`)
 * is what this follows, so a single bad run cannot blank the whole response
 * the way an uncaught throw would. The reason is redacted the same way,
 * since a filesystem error can name a path under the corpus root or the
 * target repository, neither of which lives under `CONTROL_DIR`.
 */
export async function runHistoryReport(
	runsDirectory: string,
	source: CorpusRoot,
	liveness: RunLiveness,
): Promise<RunHistoryReport> {
	const stale = await staleCheckpoints(runsDirectory, source);
	const staleByCheckpointId = new Map(
		stale.map((record) => [record.id, record.causes]),
	);

	const runEvents = await openRunEventStore(
		runEventsDatabaseFile(runsDirectory),
	);
	try {
		const rows: RunHistoryRow[] = [];
		const unreadable: UnreadableRecord[] = [];
		const registry = await registryEntries(runsDirectory);
		unreadable.push(...registry.unreadable);
		const shortIdEntries = registry.entries;
		const shortIds = shortIdsOf(shortIdEntries);
		const attempts = await checkpointAttempts(runsDirectory, shortIdEntries);
		const collect = async <Named>(
			kind: RunHistoryRow["kind"],
			named: readonly Named[],
			idOf: (name: Named) => string,
			read: (
				name: Named,
				shortId: string | undefined,
			) => Promise<RunHistoryRow | undefined>,
		): Promise<void> => {
			for (const name of named) {
				try {
					const row = await read(name, shortIds.get(idOf(name)));
					if (row !== undefined) {
						rows.push(row);
					}
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					unreadable.push({
						kind,
						id: idOf(name),
						reason: redactAbsolutePaths(message),
					});
				}
			}
		};

		const runs = new Set([
			...(await recordedRunNames(runsDirectory)),
			...runEvents.runIds(),
		]);
		await collect(
			"run",
			[...runs],
			(run) => formatRecordId({ kind: "run", run }),
			(run, shortId) =>
				rowFor(
					runsDirectory,
					run,
					shortId,
					staleByCheckpointId,
					runEvents,
					liveness,
				),
		);
		await collect(
			"session-attempt",
			await sessionAttemptIds(runsDirectory),
			(attempt) => formatRecordId({ kind: "attempt:session", ...attempt }),
			(attempt, shortId) => sessionAttemptRow(runsDirectory, attempt, shortId),
		);
		await collect(
			"replay",
			await replayAttemptIds(runsDirectory),
			(attempt) => formatRecordId({ kind: "attempt:stage", ...attempt }),
			(attempt, shortId) =>
				replayRow(runsDirectory, attempt, shortId, shortIds, attempts),
		);
		await collect(
			"group",
			await confirmationGroupIds(runsDirectory),
			(groupId) => formatRecordId({ kind: "group", groupId }),
			(groupId, shortId) => groupRow(runsDirectory, groupId, shortId, attempts),
		);

		return { rows: newestFirst(rows), unreadable };
	} finally {
		runEvents.close();
	}
}
