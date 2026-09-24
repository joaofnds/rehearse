import type { BenchmarkRunPaths } from "#benchmark/run-layout";
import { benchmarkRunPaths, checkpointStageNames } from "#benchmark/run-layout";
import { loadRunManifest } from "#benchmark/manifest";
import type {
	NonTerminalRunEventKind,
	RunEvent,
	RunEventStore,
} from "#benchmark/run-events";
import { isTerminalRunEventKind } from "#benchmark/run-events";
import { parseRunSummaryRecord } from "#benchmark/record-summary";
import {
	awaitingJudgeStageRecordSchema,
	stoppedStage,
	stoppedStageRecordSchema,
} from "#benchmark/run-outcome";
import { stoppedStatus } from "#benchmark/stopped-status";
import type { RunLiveness } from "#benchmark/run-liveness";

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
export async function claimsLiveTarget(
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
export function failedStage(
	runEvents: RunEventStore,
	run: string,
): string | undefined {
	return runEvents
		.eventsSince(run, 0)
		.map(({ stage }) => stage)
		.findLast((stage) => stage !== "");
}

export async function statusAndCaseId(
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
