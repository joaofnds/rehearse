import { unhandled } from "#benchmark/contracts";
import type { Immutable } from "#benchmark/contracts";
import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import type {
	ConfirmationMode,
	ParsedConfirmationGroupRecord,
	ParsedConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import type { CorpusRoot } from "#benchmark/corpus-file";
import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import { loadRunManifest } from "#benchmark/manifest";
import type { SessionAttemptId, StageAttemptId } from "#benchmark/run-layout";
import {
	benchmarkRunPaths,
	checkpointRecorded,
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
import type { RunEventStore } from "#benchmark/run-events";
import { openRunEventStore } from "#benchmark/run-events";
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
	checkpointStaleness,
	groupStaleness,
	replayAttemptStaleness,
	sessionAttemptStaleness,
} from "#benchmark/staleness-report";
import type { RecordStaleness } from "#benchmark/staleness-report";
import type { RunLiveness } from "#benchmark/run-liveness";
import { checkpointAttempts, repAttemptId } from "./checkpoint-attempts";
import type { AttemptPosition } from "./checkpoint-attempts";
import {
	finalOutcomeTally,
	groupCost,
	stageSummaries,
	UNRECORDED_REP_REASON,
} from "./confirmation-group-summary";
import type {
	GroupStageSummary,
	RepCounts,
	UnreadRep,
} from "./confirmation-group-summary";
import { redactAbsolutePaths } from "./redact-path";
import { readRunRecord, wallTime } from "./run-record";
import type {
	CostReading,
	FinalOutcome,
	Reading,
	RunRecord,
	RunRecordStage,
	WallTimeReading,
} from "./run-record";
import {
	checkpointlessStageRecorded,
	latestCheckpointStage,
	sourceCaseId,
	statusAndCaseId,
} from "./run-status";
import type { ContextLink, RunProgress } from "./run-status";

export type { ContextLink, RunProgress } from "./run-status";

/**
 * Whether a row's record still measures the corpus under test: what makes it
 * stale, the files it read that changed, and how many versions back it was
 * recorded. A record the report could not judge says why rather than reading
 * as clean.
 */
export type RowStaleness = Reading<Omit<RecordStaleness, "id">>;

export const UNJUDGED_REASON =
	"no recorded checkpoint or attempt to judge against the corpus under test";

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
	/** The version its latest checkpoint measured; undefined when none recorded one. */
	readonly corpusVersion: CorpusMeasurement | undefined;
	/** Whether its checkpoints measured more than one corpus version. */
	readonly corpusChangedDuringRun: boolean;
	readonly staleness: RowStaleness;
	readonly progress: RunProgress;
	readonly links: readonly ContextLink[];
	readonly stageGrades: Reading<{
		readonly grades: readonly ListedStageGrade[];
	}>;
	/** The final judge's outcome, the design's task grade, with its note. */
	readonly finalOutcome: Reading<FinalOutcome>;
	readonly cost: CostReading;
	readonly wallTime: WallTimeReading;
}

export const NOT_RUN_REASON = "the run never reached this stage";
export const REPLAY_FINAL_OUTCOME_REASON =
	"a replay runs one stage, and only a whole run reaches the final judge";
export const REPLAY_WALL_TIME_REASON =
	"the replay record predates its elapsed time";
export const SESSION_COST_REASON = "the attempt recorded no call metrics";
export const NO_MANIFEST_REASON =
	"the run wrote no manifest, which names its stages";

/** A stage's grade as the run's step grades column shows it. */
export interface ListedStageGrade {
	readonly stage: string;
	readonly status: RunRecordStage["status"] | "not-run";
	readonly grade: RunRecordStage["grade"];
}

/**
 * A stage with no record is one the run never reached when it comes after the
 * stage the run ended or is running in. A run that finished reached every
 * stage, and a stage before the one it ended in ran and left no record.
 */
function stageGrades(record: RunRecord): readonly ListedStageGrade[] {
	const { finalOutcome } = record;
	const reachedIndex =
		finalOutcome.status === "NOT_REACHED" || finalOutcome.status === "PENDING"
			? record.stages.findIndex(({ stage }) => stage === finalOutcome.stage)
			: -1;

	return record.stages.map(({ stage, status, grade }, index) =>
		status === "no-record" && reachedIndex !== -1 && index > reachedIndex
			? {
					stage,
					status: "not-run",
					grade: { state: "unavailable", reasons: [NOT_RUN_REASON] },
				}
			: { stage, status, grade },
	);
}

export interface SessionAttemptRow {
	readonly kind: "session-attempt";
	readonly caseId: string;
	readonly uuid: string;
	readonly shortId: string | undefined;
	readonly status: SessionAttemptRecord["outcome"];
	readonly corpusVersion: CorpusMeasurement | undefined;
	readonly staleness: RowStaleness;
	readonly links: readonly ContextLink[];
	readonly cost: CostReading;
	readonly wallTime: WallTimeReading;
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
	readonly corpusVersion: CorpusMeasurement | undefined;
	readonly staleness: RowStaleness;
	readonly links: readonly ContextLink[];
	readonly cost: CostReading;
	readonly finalOutcome: NotApplicable;
	readonly wallTime: WallTimeReading;
}

/** A figure that has no meaning for a row's kind, rather than one not recorded. */
export interface NotApplicable {
	readonly state: "available";
	readonly status: "NOT_APPLICABLE";
	readonly reason: string;
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
	readonly corpusVersion: CorpusMeasurement | undefined;
	readonly staleness: RowStaleness;
	readonly repAttempts: readonly RepAttempt[];
	readonly links: readonly ContextLink[];
	readonly stageSummaries: readonly GroupStageSummary[];
	readonly finalOutcomes: RepCounts;
	/** Of `reps` requested, how many the group recorded as successful. */
	readonly successful: number;
	/** Each rep the server could not read, which no other figure counts. */
	readonly unreadReps: readonly UnreadRep[];
	readonly cost: CostReading;
	readonly wallTime: WallTimeReading;
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
			(checkpointed.has(stage) && (await checkpointRecorded(paths, stage))) ||
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
		if (number !== undefined && (await checkpointRecorded(paths, stage))) {
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

/**
 * A run's version is its latest stage's, whether that stage saved a
 * checkpoint or stopped. The corpus changed during the run when its stages
 * measured more than one version. A refusal is not a version, and a record
 * older than versions measured none, so neither counts toward a change.
 */
function runCorpus(
	record: RunRecord,
): Pick<PipelineRunRow, "corpusVersion" | "corpusChangedDuringRun"> {
	const measured = record.stages
		.map(({ corpusVersion }) => corpusVersion)
		.filter((corpusVersion) => corpusVersion !== undefined);
	const digests = new Set(
		measured.flatMap((corpusVersion) =>
			corpusVersion.kind === "version" ? [corpusVersion.digest] : [],
		),
	);

	return {
		corpusVersion: measured.at(-1),
		corpusChangedDuringRun: digests.size > 1,
	};
}

interface RunFigures {
	readonly stageGrades: PipelineRunRow["stageGrades"];
	readonly finalOutcome: PipelineRunRow["finalOutcome"];
	readonly cost: PipelineRunRow["cost"];
	readonly wallTime: PipelineRunRow["wallTime"];
	readonly corpusVersion: PipelineRunRow["corpusVersion"];
	readonly corpusChangedDuringRun: boolean;
}

/**
 * The figures a run's row shares with its run record, read through the same
 * projection. A record that cannot be read leaves the row listed, with each
 * figure unavailable for that reason.
 */
async function runFigures(
	runsDirectory: string,
	run: string,
	liveness: RunLiveness,
): Promise<RunFigures> {
	const { manifestFile } = benchmarkRunPaths(runsDirectory, run);
	if (!(await Bun.file(manifestFile).exists())) {
		return unavailableFigures([NO_MANIFEST_REASON]);
	}

	try {
		const record = await readRunRecord(runsDirectory, run, liveness);

		return {
			stageGrades: {
				state: "available",
				grades: stageGrades(record),
			},
			finalOutcome: { state: "available", ...record.finalOutcome },
			cost: record.totals.cost,
			wallTime: record.totals.wallTime,
			...runCorpus(record),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return unavailableFigures([redactAbsolutePaths(message)]);
	}
}

function unavailableFigures(reasons: readonly string[]): RunFigures {
	return {
		stageGrades: { state: "unavailable", reasons },
		finalOutcome: { state: "unavailable", reasons },
		cost: { state: "unavailable", reasons },
		wallTime: { state: "unavailable", reasons },
		corpusVersion: undefined,
		corpusChangedDuringRun: false,
	};
}

async function rowFor(
	runsDirectory: string,
	run: string,
	shortId: string | undefined,
	staleness: Staleness,
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
	const figures = await runFigures(runsDirectory, run, liveness);
	const stage = await latestCheckpointStage(runsDirectory, run);
	if (stage === undefined) {
		return {
			kind: "run",
			run,
			shortId,
			checkpoints,
			status,
			caseId,
			stage: undefined,
			grade: undefined,
			staleness: staleness.of(`checkpoint:${run}/initial`),
			progress,
			links,
			...figures,
		};
	}

	return {
		kind: "run",
		run,
		shortId,
		checkpoints,
		status,
		caseId,
		stage,
		grade: gradeByStage.get(stage),
		staleness: staleness.of(`checkpoint:${run}/${stage}`),
		progress,
		links,
		...figures,
	};
}

async function sessionAttemptRow(
	runsDirectory: string,
	attempt: SessionAttemptId,
	shortId: string | undefined,
	staleness: Staleness,
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
		corpusVersion: record.corpusVersion,
		staleness: staleness.of(
			formatRecordId({ kind: "attempt:session", ...attempt }),
		),
		links: [
			{
				state: "available",
				label: "context",
				href: `/attempts/session/${encodeURIComponent(attempt.caseId)}/${encodeURIComponent(attempt.uuid)}`,
			},
		],
		cost:
			record.metrics === undefined
				? { state: "unavailable", reasons: [SESSION_COST_REASON] }
				: {
						state: "available",
						usd: record.metrics.costUsd,
						parts: [{ part: "session", usd: record.metrics.costUsd }],
						missing: [],
					},
		wallTime: { state: "available", ms: record.elapsedMs },
	};
}

async function replayRow(
	runsDirectory: string,
	attempt: StageAttemptId,
	shortId: string | undefined,
	shortIds: ReadonlyMap<string, string>,
	attempts: ReadonlyMap<string, AttemptPosition>,
	staleness: Staleness,
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
		corpusVersion: record.corpusVersion,
		staleness: staleness.of(
			formatRecordId({ kind: "attempt:stage", ...attempt }),
		),
		links: [replayLink(attempt, record.consumed.lineage, caseId)],
		cost: replayCost(record),
		finalOutcome: {
			state: "available",
			status: "NOT_APPLICABLE",
			reason: REPLAY_FINAL_OUTCOME_REASON,
		},
		wallTime: wallTime(record.elapsedMs, REPLAY_WALL_TIME_REASON),
	};
}

/** A replay records each spend, so its sum lacks no part. */
function replayCost(
	record: Pick<
		ReplayRecord,
		"stage" | "stageCostUsd" | "productOwnerCostUsd" | "judgeCostUsd"
	>,
): CostReading {
	const parts = [
		{ part: `${record.stage} session`, usd: record.stageCostUsd },
		{ part: "Product Owner", usd: record.productOwnerCostUsd },
		{ part: `${record.stage} judge`, usd: record.judgeCostUsd },
	];

	return {
		state: "available",
		usd: parts.reduce((sum, { usd }) => sum + usd, 0),
		parts,
		missing: [],
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

type GroupRep = ParsedConfirmationRepRecord | UnreadRep;

/**
 * Each rep the group lists, in its order: the record it wrote, or why that
 * record could not be read. One unreadable rep never hides the others.
 */
function groupReps(
	runsDirectory: string,
	record: Immutable<ParsedConfirmationGroupRecord>,
): Promise<readonly GroupRep[]> {
	const paths = confirmationGroupPaths(runsDirectory, record.groupId);

	return Promise.all(
		record.repRecords.map(async ({ repId }): Promise<GroupRep> => {
			const file = Bun.file(paths.rep(repId).recordFile);
			if (!(await file.exists())) {
				return { repId, reason: UNRECORDED_REP_REASON };
			}

			try {
				return parseConfirmationRepRecord(await file.text());
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				return { repId, reason: redactAbsolutePaths(message) };
			}
		}),
	);
}

async function groupRow(
	runsDirectory: string,
	groupId: string,
	shortId: string | undefined,
	attempts: ReadonlyMap<string, AttemptPosition>,
	staleness: Staleness,
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
	const reps = await groupReps(runsDirectory, record);
	const recorded = reps.filter((rep) => "metrics" in rep);

	return {
		kind: "group",
		groupId,
		shortId,
		caseId: record.caseId,
		mode: record.mode,
		reps: record.reps,
		corpusVersion: record.inputs.corpusVersion,
		staleness: staleness.of(formatRecordId({ kind: "group", groupId })),
		repAttempts: repAttempts(record, attempts),
		links,
		stageSummaries: stageSummaries(
			record.mode,
			record.declaredStages,
			recorded,
		),
		finalOutcomes: finalOutcomeTally(recorded),
		successful: recorded.filter(({ outcome }) => outcome === "SUCCESSFUL")
			.length,
		unreadReps: reps.filter((rep) => "reason" in rep),
		cost: groupCost(record, reps),
		wallTime: { state: "available", ms: record.makespanMs },
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

interface Staleness {
	readonly of: (recordId: string) => RowStaleness;
}

/**
 * Every record's staleness by its Record ID, judged with the knobs each record
 * was recorded with: the run history compares a record against the corpus
 * under test, not against a replay about to run. A record the report named as
 * unreadable is unavailable for its reason, and a record the report never
 * reached, a run with no manifest or an attempt of a case no longer declared,
 * is unavailable too, since reading it as clean would claim a judgment nobody
 * made.
 */
async function recordStaleness(
	runsDirectory: string,
	source: CorpusRoot,
): Promise<Staleness> {
	const checkpoints = await checkpointStaleness(runsDirectory, source);
	const reports = [
		await sessionAttemptStaleness(runsDirectory, source),
		await replayAttemptStaleness(runsDirectory, source),
		await groupStaleness(runsDirectory, source),
	];
	const byId = new Map<string, RowStaleness>();
	for (const { id, ...judged } of [
		...checkpoints,
		...reports.flatMap(({ records }) => records),
	]) {
		byId.set(id, { state: "available", ...judged });
	}
	for (const { id, reason } of reports.flatMap(
		({ unreadable }) => unreadable,
	)) {
		byId.set(id, { state: "unavailable", reasons: [reason] });
	}

	return {
		of: (recordId) =>
			byId.get(recordId) ?? {
				state: "unavailable",
				reasons: [UNJUDGED_REASON],
			},
	};
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
	const staleness = await recordStaleness(runsDirectory, source);

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
				rowFor(runsDirectory, run, shortId, staleness, runEvents, liveness),
		);
		await collect(
			"session-attempt",
			await sessionAttemptIds(runsDirectory),
			(attempt) => formatRecordId({ kind: "attempt:session", ...attempt }),
			(attempt, shortId) =>
				sessionAttemptRow(runsDirectory, attempt, shortId, staleness),
		);
		await collect(
			"replay",
			await replayAttemptIds(runsDirectory),
			(attempt) => formatRecordId({ kind: "attempt:stage", ...attempt }),
			(attempt, shortId) =>
				replayRow(
					runsDirectory,
					attempt,
					shortId,
					shortIds,
					attempts,
					staleness,
				),
		);
		await collect(
			"group",
			await confirmationGroupIds(runsDirectory),
			(groupId) => formatRecordId({ kind: "group", groupId }),
			(groupId, shortId) =>
				groupRow(runsDirectory, groupId, shortId, attempts, staleness),
		);

		return { rows: newestFirst(rows), unreadable };
	} finally {
		runEvents.close();
	}
}
