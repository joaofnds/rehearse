import type { BenchmarkRunPaths } from "#benchmark/run-layout";
import { benchmarkRunPaths, checkpointStageNames } from "#benchmark/run-layout";
import { loadRunManifest } from "#benchmark/manifest";
import type {
	JudgeProgress,
	NonTerminalRunEventKind,
	RunEvent,
	RunEventStore,
} from "#benchmark/run-events";
import type { InFlightEvent, RunEnding } from "#benchmark/run-ending";
import { runEnding } from "#benchmark/run-ending";
import { parseRunSummaryRecord } from "#benchmark/record-summary";
import {
	awaitingJudgeStageRecordSchema,
	stoppedStageRecordSchema,
} from "#benchmark/run-outcome";
import {
	OPERATOR_STOPPED,
	pausedStatus,
	stoppedStatus,
} from "#benchmark/stopped-status";
import type { RunLiveness } from "#benchmark/run-liveness";
import { unhandled } from "#benchmark/contracts";
import type { RunTokens } from "#benchmark/spend-ceiling";

/**
 * What a run's `spentUsd` covers, in words, decided by the event kind that
 * produced the figure. Every kind reports a different scope and none of them
 * is the run total: a display that called them all "spent this run" would
 * show a number that falls when a stage begins judging. The words are chosen
 * here rather than in the client because which scope a kind carries is the
 * emitter's knowledge, verified at each emission site in `run.ts`,
 * `workflow.ts` and `run-abort.ts`.
 */
const SPEND_SCOPE = {
	"stage-started": "the stages finished before this one",
	"turn-completed": "this stage's session so far",
	"stage-judging": "this stage's session",
	"judge-progress": "this stage's session",
	"stage-completed": "this stage's session and its judge",
} as const satisfies Record<NonTerminalRunEventKind, string>;

type SpendScope = (typeof SPEND_SCOPE)[keyof typeof SPEND_SCOPE];

/** Where the running stage is, in the design's words, by the latest event's kind. */
const STAGE_STATE = {
	"stage-started": "session running",
	"turn-completed": "session running",
	"stage-judging": "judge grading",
	"judge-progress": "judge grading",
	"stage-completed": "judged",
} as const satisfies Record<NonTerminalRunEventKind, string>;

type StageState = (typeof STAGE_STATE)[keyof typeof STAGE_STATE];

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
 * run never recorded. `stageElapsedMs` is the same figure measured from the
 * running stage's own start event, and undefined when the stream holds no
 * start for that stage.
 *
 * `judge` is the stage judge's latest progress reading, present only while
 * that reading is the run's latest event: how many of each rubric section's
 * items are back, or the attempt it rejected, before the stage grade exists.
 *
 * `runSpentUsd` is what the run's ceiling had charged at its latest event,
 * and `ceilingUsd` the ceiling its manifest says it started under, which a
 * later change to the stored ceiling does not move. `runTokens` is the
 * run's tokens in and out tallied with `runSpentUsd`. Each is undefined for a
 * run recorded before it existed.
 */
export type RunProgress =
	| { readonly state: "recorded" }
	| {
			readonly state: "running";
			readonly stage: string;
			readonly stageState: StageState;
			readonly elapsedMs: number;
			readonly stageElapsedMs: number | undefined;
			readonly measuredAt: string;
			readonly spentUsd: number;
			readonly spendScope: SpendScope;
			readonly runSpentUsd: number | undefined;
			readonly runTokens: RunTokens | undefined;
			readonly ceilingUsd: number | undefined;
			readonly judge?: JudgeProgress;
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
 * The last checkpoint a run recorded, in pipeline order rather than
 * alphabetical: `checkpointStageNames` sorts by name, which is not the order
 * stages run in, so "latest" is read off the manifest's own stage sequence
 * intersected with what the run actually recorded.
 */
export async function latestCheckpointStage(
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

/**
 * A run whose records on disk stop short of saying how it stands, so run
 * history lists it as unreadable. A failure to read the records at all is
 * not one of these.
 */
export class IncompleteRunRecordError extends Error {
	public override readonly name = "IncompleteRunRecordError";
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
		throw new IncompleteRunRecordError(
			`incomplete: no manifest.json at ${paths.manifestFile}`,
		);
	}

	const manifest = await loadRunManifest(paths.manifestFile);

	return {
		status,
		caseId: manifest.caseId,
		gradeByStage: new Map(),
		progress:
			progress.state === "running"
				? { ...progress, ceilingUsd: manifest.spendCeilingUsd }
				: progress,
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

/** The readings a run in flight carries at its latest event. */
function runningProgress({
	latest,
	stageStart,
}: {
	readonly latest: InFlightEvent;
	readonly stageStart: RunEvent | undefined;
}): RunProgress {
	const spendScope = SPEND_SCOPE[latest.kind];

	const progress: RunProgress = {
		state: "running",
		stage: latest.stage,
		stageState: STAGE_STATE[latest.kind],
		elapsedMs: latest.elapsedMs,
		stageElapsedMs:
			stageStart === undefined
				? undefined
				: latest.elapsedMs - stageStart.elapsedMs,
		measuredAt: latest.recordedAt,
		spentUsd: latest.spentUsd,
		spendScope,
		runSpentUsd: latest.runSpentUsd,
		runTokens: latest.runTokens,
		ceilingUsd: undefined,
	};
	if (latest.kind !== "judge-progress") {
		return progress;
	}

	return { ...progress, judge: latest.judge };
}

function artifactIdentity(artifact: string): RunIdentity {
	const record = parseRunSummaryRecord(artifact);

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

/**
 * A signal abort, or a failure before the stage wrote its record, leaves
 * `run-failed` and nothing on disk for the stage it failed in, so the row
 * says so instead of linking to a page with no record.
 */
function failedLinks(stage: string | undefined): readonly ContextLink[] {
	if (stage === undefined) {
		return [];
	}

	return [
		{
			state: "unavailable",
			label: stage,
			reason: "failed before saving its context",
		},
	];
}

export async function statusAndCaseId(
	runsDirectory: string,
	run: string,
	runEvents: RunEventStore,
	liveness: RunLiveness,
): Promise<RunIdentity | undefined> {
	return endingIdentity(
		runsDirectory,
		run,
		await runEnding(runsDirectory, run, runEvents, liveness),
		runEvents,
	);
}

/**
 * The status and case a run's history row shows for an ending already read,
 * undefined for a run the history lists no row for.
 */
export async function endingIdentity(
	runsDirectory: string,
	run: string,
	ending: RunEnding,
	runEvents: RunEventStore,
): Promise<RunIdentity | undefined> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	switch (ending.kind) {
		case "main-artifact": {
			return artifactIdentity(await Bun.file(paths.artifactFile).text());
		}
		case "stopped": {
			return manifestBackedIdentity(paths, stoppedStatus(ending.stage));
		}
		case "paused": {
			return manifestBackedIdentity(paths, pausedStatus(ending.stage));
		}
		case "operator-stopped": {
			return manifestBackedIdentity(paths, OPERATOR_STOPPED);
		}
		case "interrupted":
		case "awaiting-judgment": {
			return eventBackedIdentity(paths, "INTERRUPTED", []);
		}
		case "failed": {
			return eventBackedIdentity(paths, "FAILED", failedLinks(ending.stage));
		}
		case "running": {
			return manifestBackedIdentity(
				paths,
				"RUNNING",
				runningProgress({
					latest: ending.latest,
					stageStart: runEvents.latestStageStart({
						runId: run,
						stage: ending.latest.stage,
					}),
				}),
			);
		}
		case "unconfirmed": {
			return undefined;
		}
		case "completed-without-artifact": {
			throw new IncompleteRunRecordError(
				"incomplete: the run recorded run-completed but no artifact",
			);
		}
		case "no-events": {
			throw new IncompleteRunRecordError(
				(await Bun.file(paths.manifestFile).exists())
					? "no record: no stage record and no run events"
					: "no manifest recorded",
			);
		}
		default: {
			return unhandled(ending, "run ending");
		}
	}
}

/**
 * The status a run's history row shows, undefined for a run the history lists
 * no row for.
 */
export async function runStatus(
	runsDirectory: string,
	run: string,
	runEvents: RunEventStore,
	liveness: RunLiveness,
): Promise<string | undefined> {
	const identity = await statusAndCaseId(
		runsDirectory,
		run,
		runEvents,
		liveness,
	);

	return identity?.status;
}

/**
 * Whether a stage's own record file is one the stage page renders without a
 * checkpoint: a stop record, or a record left awaiting judgment, naming this
 * stage.
 */
export async function checkpointlessStageRecorded(
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

export async function sourceCaseId(manifestFile: string): Promise<string> {
	const manifest = await loadRunManifest(manifestFile);

	return manifest.caseId;
}
