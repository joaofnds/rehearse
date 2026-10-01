import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeRunManifest } from "#benchmark/manifest";
import type { JudgeProgress, NewRunEvent } from "#benchmark/run-events";
import { openRunEventStore } from "#benchmark/run-events";
import {
	benchmarkRunPaths,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import {
	directorySource,
	fixedCorpusSource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { TEST_TARGET } from "#benchmark/test-support";
import { createApiApp } from "./api";
import type { StageJudge } from "./stage-judge";
import { readStageJudge } from "./stage-judge";

const RUN = "2026-10-01T10-00-00.000Z";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

async function queuedRun(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-stage-judge-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	await writeRunManifest(benchmarkRunPaths(runsDirectory, RUN).manifestFile, {
		caseId: "audit-log",
		timestamp: "2026-10-01T10:00:00.000Z",
		controlSha: "control-sha",
		sourceRoot: join(root, "source"),
		sourceSha: "source-sha",
		taskId: "TASK-1",
		taskSha: "task-sha",
		task: "Task text",
		productBrief: "Brief text",
		model: "sonnet",
		judgeModel: "opus",
		sessionBudgetUsd: 5,
		pipeline: {
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
			stages: [
				{
					name: "build",
					kind: "delivery",
					skill: "build",
					rubric: "rubrics/build.json",
				},
			],
		},
		pipelinePath: "pipelines/default.json",
	});

	return runsDirectory;
}

function stageEvent(
	kind: "stage-started" | "stage-judging",
	runSpentUsd?: number,
): NewRunEvent {
	return {
		runId: RUN,
		kind,
		stage: "build",
		spentUsd: 0,
		runSpentUsd,
		elapsedMs: 0,
	};
}

function progressEvent(
	judge: JudgeProgress,
	runSpentUsd?: number,
): NewRunEvent {
	return {
		runId: RUN,
		kind: "judge-progress",
		stage: "build",
		spentUsd: 0,
		runSpentUsd,
		elapsedMs: 0,
		judge,
	};
}

async function recordEvents(
	runsDirectory: string,
	events: readonly NewRunEvent[],
): Promise<void> {
	const store = await openRunEventStore(runEventsDatabaseFile(runsDirectory));
	for (const event of events) {
		store.append(event);
	}
	store.close();
}

function judgeOf(runsDirectory: string): Promise<StageJudge> {
	return readStageJudge({ runsDirectory, run: RUN, stage: "build" });
}

function appFor(runsDirectory: string): ReturnType<typeof createApiApp> {
	return createApiApp({
		runsDirectory,
		projectsDirectory: join(runsDirectory, "..", "projects"),
		liveness: nothingRunning,
		readCorpusSource: fixedCorpusSource(directorySource(runsDirectory)),
	});
}

const JUDGED_ITEMS = {
	hardBlockers: [
		{
			id: "HB-1",
			status: "FAIL",
			evidence: [
				{
					source: "transcript",
					path: "transcript",
					claim: "The agent chose a scope without asking",
					quote: "I'll take the small scope",
					locator: {
						kind: "exchange",
						exchange: 2,
						field: "message",
						start: 0,
						end: 25,
					},
				},
			],
		},
	],
	requirements: [
		{
			id: "R1",
			status: "PASS",
			evidence: [{ source: "artifact", path: "a.md", claim: "Holds it" }],
		},
	],
	dimensions: [
		{
			id: "clarity",
			grade: "B",
			evidence: [
				{
					source: "diff",
					path: "src/a.ts",
					claim: "Names the rule",
					quote: "const rule",
					locator: {
						kind: "lines",
						file: "src/a.ts",
						startLine: 3,
						endLine: 4,
						occurrences: 1,
					},
				},
			],
		},
	],
};

const JUDGED_ANSWER: StageJudge = {
	state: "judged",
	hardBlockers: [
		{
			id: "HB-1",
			status: "FAIL",
			evidence: [
				{
					source: "transcript",
					path: "transcript",
					claim: "The agent chose a scope without asking",
					quote: "I'll take the small scope",
					place: "exchange 3 message, characters 0-25",
				},
			],
		},
	],
	dimensions: [
		{
			id: "clarity",
			grade: "B",
			evidence: [
				{
					source: "diff",
					path: "src/a.ts",
					claim: "Names the rule",
					quote: "const rule",
					place: "src/a.ts:3-4",
				},
			],
		},
	],
};

const NOTHING_RETURNED: JudgeProgress = {
	state: "returning",
	attempt: 1,
	sections: {
		hardBlockers: { returned: 0, total: 2 },
		requirements: { returned: 0, total: 1 },
		dimensions: { returned: 0, total: 1 },
	},
};

describe(readStageJudge.name, () => {
	it("answers a stage whose judge has not started as waiting", async () => {
		const runsDirectory = await queuedRun();
		await recordEvents(runsDirectory, [stageEvent("stage-started", 1)]);

		const judge = await judgeOf(runsDirectory);

		expect(judge).toEqual({ state: "waiting" });
	});

	it("answers a judge still returning with its latest progress and what it has been charged so far", async () => {
		const runsDirectory = await queuedRun();
		const latest: JudgeProgress = {
			state: "returning",
			attempt: 2,
			sections: {
				hardBlockers: { returned: 1, total: 2 },
				requirements: { returned: 0, total: 1 },
				dimensions: { returned: 0, total: 1 },
			},
			items: {
				hardBlockers: [{ id: "HB-1", status: "FAIL" }, { id: "HB-2" }],
				dimensions: [{ id: "clarity" }],
			},
		};
		await recordEvents(runsDirectory, [
			stageEvent("stage-started", 1),
			stageEvent("stage-judging", 2),
			progressEvent(NOTHING_RETURNED, 2),
			progressEvent(
				{ state: "rejected", attempt: 1, reason: "Bad quote" },
				2.5,
			),
			progressEvent(latest, 2.5),
		]);

		const judge = await judgeOf(runsDirectory);

		expect(judge).toEqual({
			state: "returning",
			progress: latest,
			spentUsd: 0.5,
		});
	});

	it("answers from the stage's own events, whatever another stage's judge has recorded", async () => {
		const runsDirectory = await queuedRun();
		await recordEvents(runsDirectory, [
			{ ...stageEvent("stage-judging", 1), stage: "plan" },
			{ ...progressEvent(NOTHING_RETURNED, 1), stage: "plan" },
			stageEvent("stage-started", 2),
		]);

		const judge = await judgeOf(runsDirectory);

		expect(judge).toEqual({ state: "waiting" });
	});

	it("answers from the stage's latest judging when it was judged again", async () => {
		const runsDirectory = await queuedRun();
		await recordEvents(runsDirectory, [
			stageEvent("stage-judging", 1),
			progressEvent(NOTHING_RETURNED, 1.5),
			stageEvent("stage-judging", 3),
			progressEvent(NOTHING_RETURNED, 3.25),
		]);

		const judge = await judgeOf(runsDirectory);

		expect(judge).toEqual({
			state: "returning",
			progress: NOTHING_RETURNED,
			spentUsd: 0.25,
		});
	});

	it("answers each judged blocker and dimension with its result and evidence once the record holds the grade", async () => {
		const runsDirectory = await queuedRun();
		await recordEvents(runsDirectory, [stageEvent("stage-judging")]);
		await Bun.write(
			benchmarkRunPaths(runsDirectory, RUN).stageFile("build"),
			JSON.stringify({ stage: "build", grade: JUDGED_ITEMS }),
		);

		const judge = await judgeOf(runsDirectory);

		expect(judge).toEqual(JUDGED_ANSWER);
	});
});

describe(`${readStageJudge.name} when the record or the stream is older or partial`, () => {
	it("answers the judged items the record of the stage that stopped the run keeps", async () => {
		const runsDirectory = await queuedRun();
		await Bun.write(
			benchmarkRunPaths(runsDirectory, RUN).stageFile("build"),
			JSON.stringify({
				status: "STAGE_JUDGE_FAILED",
				stage: "build",
				error: "Stage build graded D below the minimum C",
				...JUDGED_ITEMS,
				grade: { grade: "D", verdict: "CONTINUE" },
			}),
		);

		const judge = await judgeOf(runsDirectory);

		expect(judge).toEqual(JUDGED_ANSWER);
	});

	it("answers a stop record the judge never graded as not judged", async () => {
		const runsDirectory = await queuedRun();
		await Bun.write(
			benchmarkRunPaths(runsDirectory, RUN).stageFile("build"),
			JSON.stringify({
				status: "STAGE_JUDGE_FAILED",
				stage: "build",
				error: "The ceiling refused the stage",
			}),
		);

		const judge = await judgeOf(runsDirectory);

		expect(judge).toEqual({ state: "not-judged" });
	});

	it("answers a stage whose record awaits its judge from the stream", async () => {
		const runsDirectory = await queuedRun();
		await recordEvents(runsDirectory, [
			stageEvent("stage-judging", 2),
			progressEvent(NOTHING_RETURNED, 2),
		]);
		await Bun.write(
			benchmarkRunPaths(runsDirectory, RUN).stageFile("build"),
			JSON.stringify({ status: "AWAITING_STAGE_JUDGE", stage: "build" }),
		);

		const judge = await judgeOf(runsDirectory);

		expect(judge).toEqual({
			state: "returning",
			progress: NOTHING_RETURNED,
			spentUsd: 0,
		});
	});

	it("answers progress recorded before per-item results as its counts alone", async () => {
		const runsDirectory = await queuedRun();
		await recordEvents(runsDirectory, [
			stageEvent("stage-judging"),
			progressEvent(NOTHING_RETURNED),
		]);

		const judge = await judgeOf(runsDirectory);

		expect(judge).toEqual({ state: "returning", progress: NOTHING_RETURNED });
	});

	it("answers no progress between a rejected attempt and the next one's first reading", async () => {
		const runsDirectory = await queuedRun();
		await recordEvents(runsDirectory, [
			stageEvent("stage-judging", 2),
			progressEvent(NOTHING_RETURNED, 2),
			progressEvent(
				{ state: "rejected", attempt: 1, reason: "Bad quote" },
				2.25,
			),
		]);

		const judge = await judgeOf(runsDirectory);

		expect(judge).toEqual({ state: "returning", spentUsd: 0.25 });
	});
});

describe("GET /api/runs/:run/stages/:stage/judge", () => {
	it("answers with the stage's judge as the reader shows it", async () => {
		const runsDirectory = await queuedRun();
		await recordEvents(runsDirectory, [stageEvent("stage-started")]);

		const response = await appFor(runsDirectory).request(
			`/api/runs/${RUN}/stages/build/judge`,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ state: "waiting" });
	});

	it("answers 404 for a stage the run's pipeline does not have", async () => {
		const runsDirectory = await queuedRun();

		const response = await appFor(runsDirectory).request(
			`/api/runs/${RUN}/stages/deploy/judge`,
		);

		expect(response.status).toBe(404);
	});
});
