import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StageLetterGrade } from "#benchmark/contracts";
import type { OperatorGrade } from "#benchmark/operator-grade";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import { createCalibrationApp } from "./calibration";

const RUBRIC = {
	hardBlockers: [
		{
			id: "invalid-stage-delivery",
			description: "The stage left no valid task state.",
		},
	],
	requirements: [
		{ id: "goal-stated", description: "The task states its goal." },
	],
	dimensions: [
		{
			id: "clarity",
			description: "How clearly the task reads.",
			good: "B reads clearly.",
			excellent: "A reads at a glance.",
		},
		{
			id: "decision-quality",
			description: "How well decisions are framed.",
			good: "B frames each decision.",
			excellent: "A orders them by consequence.",
		},
	],
};

const INPUT = {
	kind: "planning",
	stage: "shape",
	task: "Implement the audit log",
	productBrief: "An audit log for every write",
	transcript: "the stage's transcript",
};

const JUDGE_SUMMARY = "Judge summary: clarity and decision quality both read";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

async function recordsDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-calibration-"));
	roots.push(root);

	return join(root, ".benchmark-runs");
}

interface JudgedStage {
	readonly run: string;
	readonly stage?: string;
	readonly judgeModel?: string;
	readonly dimensions: readonly [StageLetterGrade, StageLetterGrade];
}

/** A pipeline stage's scorecard as the harness writes it once its Judge graded every criterion PASS. */
async function writeJudgedStage(
	runsDirectory: string,
	judged: JudgedStage,
): Promise<void> {
	const stage = judged.stage ?? "shape";
	const paths = benchmarkRunPaths(runsDirectory, judged.run);
	await mkdir(paths.checkpointsDirectory, { recursive: true });
	const [clarity, decisionQuality] = judged.dimensions;
	const worst = clarity > decisionQuality ? clarity : decisionQuality;
	await Bun.write(
		paths.stageFile(stage),
		JSON.stringify({
			stage,
			judgeModel: judged.judgeModel ?? "opus",
			rubric: RUBRIC,
			input: { ...INPUT, stage },
			grade: {
				hardBlockers: [
					{
						id: "invalid-stage-delivery",
						status: "PASS",
						evidence: [
							{ source: "task-state", path: "task", claim: "Judge claim" },
						],
					},
				],
				requirements: [{ id: "goal-stated", status: "PASS", evidence: [] }],
				dimensions: [
					{ id: "clarity", grade: clarity, evidence: [] },
					{ id: "decision-quality", grade: decisionQuality, evidence: [] },
				],
				summary: JUDGE_SUMMARY,
				grade: worst,
				verdict: "CONTINUE",
			},
		}),
	);
}

function operatorGrade(
	dimensions: readonly [StageLetterGrade, StageLetterGrade],
): OperatorGrade {
	return {
		hardBlockers: [{ id: "invalid-stage-delivery", status: "PASS" }],
		requirements: [{ id: "goal-stated", status: "PASS" }],
		dimensions: [
			{ id: "clarity", grade: dimensions[0] },
			{ id: "decision-quality", grade: dimensions[1] },
		],
	};
}

function appFor(
	runsDirectory: string,
): ReturnType<typeof createCalibrationApp> {
	return createCalibrationApp({ runsDirectory });
}

/** Posts the request body as written, so a test can send one no client would build. */
function postGrade(
	runsDirectory: string,
	path: string,
	body: string,
): Promise<Response> {
	return Promise.resolve(
		appFor(runsDirectory).request(`${path}/grade`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body,
		}),
	);
}

const FIRST_RUN = "2026-10-01T10-00-00.000Z";
const SECOND_RUN = "2026-10-02T10-00-00.000Z";

describe("/api/calibration", () => {
	it("reports each graded stage's agreement, the header figures and each dimension's drift", async () => {
		const runsDirectory = await recordsDirectory();
		await writeJudgedStage(runsDirectory, {
			run: FIRST_RUN,
			dimensions: ["B", "B"],
		});
		await writeJudgedStage(runsDirectory, {
			run: SECOND_RUN,
			dimensions: ["D", "D"],
		});
		await postGrade(
			runsDirectory,
			`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
			JSON.stringify(operatorGrade(["B", "B"])),
		);
		await postGrade(
			runsDirectory,
			`/api/calibration/runs/${SECOND_RUN}/stages/shape`,
			JSON.stringify(operatorGrade(["B", "B"])),
		);

		const response = await appFor(runsDirectory).request("/api/calibration");

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			reviews: 2,
			withinOneStep: 1,
			rows: [
				{
					stage: { kind: "run", run: FIRST_RUN, stage: "shape" },
					judgeGrade: "B",
					operatorGrade: "B",
					stepsApart: 0,
				},
				{
					stage: { kind: "run", run: SECOND_RUN, stage: "shape" },
					judgeGrade: "D",
					operatorGrade: "B",
					stepsApart: 2,
				},
			],
			groups: [
				{
					judgeModel: "opus",
					stage: "shape",
					drift: [
						{ dimension: "clarity", steps: -1 },
						{ dimension: "decision-quality", steps: -1 },
					],
				},
			],
		});
	});
});
