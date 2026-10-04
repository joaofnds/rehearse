/**
 * Records for run detail tests: a three-stage run that stopped at build, the
 * history row that lists it, and the culprit analysis an agent recorded of it.
 */
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import type { LiveReply } from "#client/test-support/live-reply";
import {
	renderAppAt,
	renderAppWithStub,
	SHELL_BASELINE,
} from "#client/test-support/render-app";
import { recordStage, runRecord } from "#client/test-support/run-record";
import { runRow } from "#client/test-support/runs-in-flight";
import type { AnalysisReading } from "#server/culprit-analyses";
import type { RunRecord } from "#server/run-record";

export type HistoryRow = RunHistoryResponse["rows"][number];

type PipelineRow = Extract<HistoryRow, { readonly kind: "run" }>;

export const RUN = "2026-09-28T10-03-07.498Z";

export const ANALYSES = `/api/runs/${RUN}/analyses`;

export const CORPUS = "a41c7e".padEnd(64, "0");

export function history(rows: readonly HistoryRow[]): RunHistoryResponse {
	return { rows: [...rows], launches: [], unreadable: [] };
}

const graded = (letter: string) =>
	({
		state: "available",
		letter,
		verdict: "CONTINUE",
		reachesMinimum: letter !== "D",
	}) as const;

/** A three-stage run that stopped at build, below its minimum of B. */
export function stoppedAtBuild(
	firstStepCheckpoint: "recorded" | "missing" = "recorded",
): RunRecord {
	return {
		...runRecord({
			run: RUN,
			running: "build",
			stages: [
				recordStage("shape", {
					status: "graded",
					grade: graded("A"),
					checkpoint: firstStepCheckpoint,
				}),
				recordStage("build", { status: "stopped", grade: graded("D") }),
				recordStage("verify"),
			],
		}),
		shortId: { state: "available", shortId: "r-0147" },
		status: { state: "available", status: "STOPPED:build" },
		minimumGrade: { state: "available", letter: "B" },
		finalOutcome: {
			status: "NOT_REACHED",
			stage: "verify",
			reason: "the run stopped before the final judge",
		},
	};
}

export function stoppedRow(): PipelineRow {
	return {
		...runRow({
			run: RUN,
			status: "STOPPED:build",
			corpusVersion: { kind: "version", digest: CORPUS },
		}),
		shortId: "r-0147",
	};
}

/** How the server judged a record against the corpus under test. */
export function judgedStaleness(stale: boolean): HistoryRow["staleness"] {
	return {
		state: "available",
		stale,
		causes: stale ? ["skills/implement.md changed"] : [],
		changedFiles: [],
		onlyCorpusFiles: stale,
		distance: { kind: "measured", versions: stale ? 1 : 0 },
		readManifest: [],
	};
}

/** An earlier run of the same case whose final judge returned a verdict. */
export function judgedRow(
	run: string,
	shortId: string,
	verdict: "PASS" | "FAIL",
	digest: string,
	staleness: HistoryRow["staleness"] = judgedStaleness(false),
): PipelineRow {
	return {
		...runRow({
			run,
			status: "COMPLETE",
			corpusVersion: { kind: "version", digest },
		}),
		shortId,
		finalOutcome: { state: "available", status: "JUDGED", verdict },
		staleness,
	};
}

export function renderRunDetail(
	extra: ReadonlyMap<string, unknown> = new Map(),
	otherRows: readonly HistoryRow[] = [],
): void {
	renderAppWithStub(
		`/runs/${RUN}`,
		new Map<string, unknown>([
			["/api/runs", history([stoppedRow(), ...otherRows])],
			[`/api/runs/${RUN}`, stoppedAtBuild()],
			[ANALYSES, noAnalysis()],
			...extra,
		]),
	);
}

/** An analysis that names build's scope block as the culprit. */
export function recordedAnalysis(): AnalysisReading {
	return {
		run: RUN,
		newest: {
			schemaVersion: 1,
			run: RUN,
			model: "sonnet",
			capUsd: 1,
			startedAt: "2026-09-28T10:48:00.000Z",
			durationMs: 41_000,
			bundleDigest: "b".repeat(64),
			bundleBytes: 1200,
			costUsd: 0.24,
			outcome: "recorded",
			culprit: {
				stage: "build",
				file: "skills/implement.md",
				lines: { start: 12, end: 30 },
			},
			narrative:
				"Build skipped the scope declaration the shape step asked for.",
			pairedRerun:
				"Replay step 2 with the scope-declaration block changed and nothing else.",
			stages: [
				{
					stage: "shape",
					role: "not implicated",
					note: "Shape named the scope.",
					contribution: "set up the scope the judge read",
				},
				{
					stage: "build",
					role: "primary culprit",
					note: "Build ignored the declared scope.",
					contribution: "dropped the declared scope",
				},
				{ stage: "verify", role: "never ran" },
			],
		},
		earlierCount: 1,
		unreadable: [],
		request: { model: "sonnet", capUsd: 1, refusal: null },
	};
}

/** No analysis recorded yet, with a request allowed up to a one-dollar cap. */
type RecordedAnalysis = Extract<
	NonNullable<AnalysisReading["newest"]>,
	{ readonly outcome: "recorded" }
>;

function recordedNewest(): RecordedAnalysis {
	const { newest } = recordedAnalysis();
	if (newest?.outcome !== "recorded") {
		throw new Error("the fixture records an analysis");
	}

	return newest;
}

/** The recorded analysis with some of its answer changed. */
export function recordedAnalysisWith(
	change: Partial<RecordedAnalysis>,
): AnalysisReading {
	return {
		...recordedAnalysis(),
		newest: { ...recordedNewest(), ...change },
	};
}

/** An analysis whose answer broke a rule, stored with its reason and payload. */
export function failedAnalysis(): AnalysisReading {
	const {
		schemaVersion,
		run,
		model,
		capUsd,
		startedAt,
		durationMs,
		bundleDigest,
		bundleBytes,
	} = recordedNewest();

	return {
		...recordedAnalysis(),
		newest: {
			schemaVersion,
			run,
			model,
			capUsd,
			startedAt,
			durationMs,
			bundleDigest,
			bundleBytes,
			outcome: "failed",
			reason: "the answer named a stage the run does not declare",
			payload: { culprit: { stage: "deploy" } },
		},
	};
}

const ONE_DOLLAR_REQUEST: AnalysisReading["request"] = {
	model: "sonnet",
	capUsd: 1,
	refusal: null,
};

export function noAnalysis(
	request: AnalysisReading["request"] = ONE_DOLLAR_REQUEST,
): AnalysisReading {
	return { run: RUN, newest: null, earlierCount: 0, unreadable: [], request };
}

/**
 * Serves run detail for the stopped run from a Fake that records what the
 * page posts, with `routes` added or replacing the defaults.
 */
export function serveRunDetail(
	routes: ReadonlyMap<string, Reply | LiveReply>,
	historyBody: RunHistoryResponse = history([stoppedRow()]),
): FakeServer {
	const server = new FakeServer(
		new Map<string, Reply | LiveReply>([
			...[...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
				`GET ${path}`,
				{ status: 200, body },
			]),
			["GET /api/runs", { status: 200, body: historyBody }],
			[`GET /api/runs/${RUN}`, { status: 200, body: stoppedAtBuild() }],
			[`GET ${ANALYSES}`, { status: 200, body: noAnalysis() }],
			...routes,
		]),
	);
	server.install();
	renderAppAt(`/runs/${RUN}`);

	return server;
}
