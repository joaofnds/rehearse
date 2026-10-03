import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StageLetterGrade } from "#benchmark/contracts";
import type { JsonObject, JsonValue } from "#benchmark/json-value";
import type { OperatorGrade } from "#benchmark/operator-grade";
import {
	benchmarkRunPaths,
	confirmationGroupPaths,
	operatorGradesDirectory,
	replayRecordFile,
} from "#benchmark/run-layout";
import { loadJudgeAgreementReport } from "#benchmark/judge-agreement";
import { writeOperatorGrade } from "#benchmark/operator-grade";
import {
	directorySource,
	fixedCorpusSource,
	NO_PROVIDER_PROJECTS,
	nothingRunning,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import { createApiApp } from "./api";
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
const JUDGE_CLAIM = "Judge claim: the task state is valid";

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
	readonly input?: Readonly<Record<string, JsonValue>>;
}

/** A pipeline stage's scorecard as the harness writes it once its Judge graded every criterion PASS. */
async function writeJudgedStage(
	runsDirectory: string,
	judged: JudgedStage,
): Promise<void> {
	const stage = judged.stage ?? "shape";
	const paths = benchmarkRunPaths(runsDirectory, judged.run);
	await mkdir(paths.checkpointsDirectory, { recursive: true });
	await Bun.write(
		paths.stageFile(stage),
		JSON.stringify({
			stage,
			judgeModel: judged.judgeModel ?? "opus",
			...scorecard(stage, judged.dimensions),
			input: judged.input ?? { ...INPUT, stage },
		}),
	);
}

function scorecard(
	stage: string,
	dimensions: readonly [StageLetterGrade, StageLetterGrade],
): JsonObject {
	const [clarity, decisionQuality] = dimensions;

	return {
		rubric: RUBRIC,
		input: { ...INPUT, stage },
		grade: {
			...judgedItems(dimensions),
			summary: JUDGE_SUMMARY,
			grade: clarity > decisionQuality ? clarity : decisionQuality,
			verdict: "CONTINUE",
		},
	};
}

function judgedItems(
	dimensions: readonly [StageLetterGrade, StageLetterGrade],
): JsonObject {
	return {
		hardBlockers: [
			{
				id: "invalid-stage-delivery",
				status: "PASS",
				evidence: [{ source: "task-state", path: "task", claim: JUDGE_CLAIM }],
			},
		],
		requirements: [{ id: "goal-stated", status: "PASS", evidence: [] }],
		dimensions: [
			{ id: "clarity", grade: dimensions[0], evidence: [] },
			{ id: "decision-quality", grade: dimensions[1], evidence: [] },
		],
	};
}

/** Every file under the records directory with its sha256, so a test sees any byte a request changed. */
async function fileDigests(
	runsDirectory: string,
): Promise<Readonly<Record<string, string>>> {
	const files = await readdir(runsDirectory, {
		recursive: true,
		withFileTypes: true,
	});
	const digests: Record<string, string> = {};
	for (const file of files.filter((entry) => entry.isFile())) {
		const path = join(file.parentPath, file.name);
		digests[path] = createHash("sha256")
			.update(await readFile(path))
			.digest("hex");
	}

	return digests;
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

	it("carries the operator's note and each criterion they graded apart into the agreement row", async () => {
		const runsDirectory = await recordsDirectory();
		await writeJudgedStage(runsDirectory, {
			run: FIRST_RUN,
			dimensions: ["B", "D"],
		});
		await postGrade(
			runsDirectory,
			`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
			JSON.stringify({
				...operatorGrade(["B", "B"]),
				note: "judge accepted an unverified claim",
			}),
		);

		const response = await appFor(runsDirectory).request("/api/calibration");

		expect(await response.json()).toMatchObject({
			rows: [
				{
					note: "judge accepted an unverified claim",
					differences: [
						{ criterion: "decision-quality", judge: "D", operator: "B" },
					],
				},
			],
		});
	});

	it("serves the frozen input and the rubric before grading, and nothing the Judge returned", async () => {
		const runsDirectory = await recordsDirectory();
		await writeJudgedStage(runsDirectory, {
			run: FIRST_RUN,
			dimensions: ["B", "D"],
		});

		const response = await appFor(runsDirectory).request(
			`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
		);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(JSON.parse(body)).toEqual({
			stage: { kind: "run", run: FIRST_RUN, stage: "shape" },
			stageName: "shape",
			judgeModel: "opus",
			criteria: RUBRIC,
			input: INPUT,
		});
		expect(body).not.toContain(JUDGE_SUMMARY);
		expect(body).not.toContain(JUDGE_CLAIM);
		expect(body).not.toContain("PASS");
		expect(body).not.toContain('"D"');
	});

	it("serves each input field the Judge read as text, a structured one as indented JSON", async () => {
		const runsDirectory = await recordsDirectory();
		await writeJudgedStage(runsDirectory, {
			run: FIRST_RUN,
			dimensions: ["B", "D"],
			input: {
				task: "Implement the audit log",
				baselineContext: [{ path: "AGENTS.md" }],
			},
		});

		const response = await appFor(runsDirectory).request(
			`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
		);

		expect(await response.json()).toMatchObject({
			input: {
				task: "Implement the audit log",
				baselineContext: '[\n  {\n    "path": "AGENTS.md"\n  }\n]',
			},
		});
	});

	it("returns the Judge's grade for the same stage once the operator's is recorded", async () => {
		const runsDirectory = await recordsDirectory();
		await writeJudgedStage(runsDirectory, {
			run: FIRST_RUN,
			dimensions: ["B", "D"],
		});
		const path = `/api/calibration/runs/${FIRST_RUN}/stages/shape`;

		const recorded = await postGrade(
			runsDirectory,
			path,
			JSON.stringify(operatorGrade(["A", "B"])),
		);
		const review = await appFor(runsDirectory).request(path);

		expect(recorded.status).toBe(201);
		expect(await recorded.json()).toMatchObject({
			operatorGrade: { grade: "B" },
			judgeGrade: { grade: "D", summary: JUDGE_SUMMARY },
		});
		expect(await review.json()).toMatchObject({
			input: INPUT,
			operatorGrade: { grade: "B" },
			judgeGrade: {
				grade: "D",
				summary: JUDGE_SUMMARY,
				hardBlockers: [{ evidence: [{ claim: JUDGE_CLAIM }] }],
			},
		});
	});

	it.each([
		[
			"an unknown stage",
			`/api/calibration/runs/${FIRST_RUN}/stages/build`,
			404,
		],
		[
			"an unknown run",
			"/api/calibration/runs/2026-01-01T00-00-00.000Z/stages/shape",
			404,
		],
		[
			"a traversing segment, resolved away before any route matches",
			`/api/calibration/runs/${FIRST_RUN}/stages/..`,
			404,
		],
		[
			"an encoded slash",
			`/api/calibration/runs/${FIRST_RUN}/stages/a%2Fb`,
			400,
		],
		[
			"an encoded traversal, resolved away before any route matches",
			"/api/calibration/runs/%2E%2E/stages/shape",
			404,
		],
	])("refuses %s and writes nothing", async (_case, path, status) => {
		const runsDirectory = await recordsDirectory();
		await writeJudgedStage(runsDirectory, {
			run: FIRST_RUN,
			dimensions: ["B", "B"],
		});
		const before = await fileDigests(runsDirectory);

		const response = await postGrade(
			runsDirectory,
			path,
			JSON.stringify(operatorGrade(["B", "B"])),
		);

		expect(response.status).toBe(status);
		expect(await fileDigests(runsDirectory)).toEqual(before);
	});

	it.each([
		[
			"a letter outside A to F",
			{
				...operatorGrade(["B", "B"]),
				dimensions: [
					{ id: "clarity", grade: "E" },
					{ id: "decision-quality", grade: "B" },
				],
			},
		],
		[
			"a status outside PASS and FAIL",
			{
				...operatorGrade(["B", "B"]),
				requirements: [{ id: "goal-stated", status: "PARTIAL" }],
			},
		],
		[
			"a missing criterion",
			{
				...operatorGrade(["B", "B"]),
				dimensions: [{ id: "clarity", grade: "B" }],
			},
		],
		[
			"an extra criterion",
			{
				...operatorGrade(["B", "B"]),
				requirements: [
					{ id: "goal-stated", status: "PASS" },
					{ id: "tests-named", status: "PASS" },
				],
			},
		],
		[
			"a repeated criterion",
			{
				...operatorGrade(["B", "B"]),
				dimensions: [
					{ id: "clarity", grade: "B" },
					{ id: "clarity", grade: "B" },
				],
			},
		],
		[
			"a field the grade does not have",
			{ ...operatorGrade(["B", "B"]), grade: "A" },
		],
	])("refuses %s and writes nothing", async (_case, grade) => {
		const runsDirectory = await recordsDirectory();
		await writeJudgedStage(runsDirectory, {
			run: FIRST_RUN,
			dimensions: ["B", "B"],
		});
		const before = await fileDigests(runsDirectory);

		const response = await postGrade(
			runsDirectory,
			`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
			JSON.stringify(grade),
		);

		expect(response.status).toBe(400);
		expect(await fileDigests(runsDirectory)).toEqual(before);
	});

	it("refuses a second grade for a stage already graded and keeps the first", async () => {
		const runsDirectory = await recordsDirectory();
		await writeJudgedStage(runsDirectory, {
			run: FIRST_RUN,
			dimensions: ["B", "B"],
		});
		const path = `/api/calibration/runs/${FIRST_RUN}/stages/shape`;
		await postGrade(
			runsDirectory,
			path,
			JSON.stringify(operatorGrade(["B", "B"])),
		);
		const before = await fileDigests(runsDirectory);

		const second = await postGrade(
			runsDirectory,
			path,
			JSON.stringify(operatorGrade(["A", "A"])),
		);

		expect(second.status).toBe(409);
		expect(await fileDigests(runsDirectory)).toEqual(before);
	});

	it("refuses a run and stage split at another dot of the same record and writes nothing", async () => {
		const runsDirectory = await recordsDirectory();
		await writeJudgedStage(runsDirectory, {
			run: FIRST_RUN,
			dimensions: ["B", "B"],
		});
		const before = await fileDigests(runsDirectory);
		const [run, milliseconds] = FIRST_RUN.split(".");

		const response = await postGrade(
			runsDirectory,
			`/api/calibration/runs/${run}/stages/${milliseconds}.shape`,
			JSON.stringify(operatorGrade(["B", "B"])),
		);

		expect(response.status).toBe(404);
		expect(await fileDigests(runsDirectory)).toEqual(before);
	});

	it("derives the operator's letter by the Judge's rule: a failed requirement caps A, A at C", async () => {
		const runsDirectory = await recordsDirectory();
		await writeJudgedStage(runsDirectory, {
			run: FIRST_RUN,
			dimensions: ["A", "A"],
		});

		const response = await postGrade(
			runsDirectory,
			`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
			JSON.stringify({
				...operatorGrade(["A", "A"]),
				requirements: [{ id: "goal-stated", status: "FAIL" }],
			}),
		);

		expect(await response.json()).toMatchObject({
			operatorGrade: { grade: "C" },
		});
	});

	it("keeps each Judge model's drift apart", async () => {
		const runsDirectory = await recordsDirectory();
		await writeJudgedStage(runsDirectory, {
			run: FIRST_RUN,
			judgeModel: "opus",
			dimensions: ["A", "A"],
		});
		await writeJudgedStage(runsDirectory, {
			run: SECOND_RUN,
			judgeModel: "sonnet",
			dimensions: ["D", "D"],
		});
		for (const run of [FIRST_RUN, SECOND_RUN]) {
			await postGrade(
				runsDirectory,
				`/api/calibration/runs/${run}/stages/shape`,
				JSON.stringify(operatorGrade(["B", "B"])),
			);
		}

		const response = await appFor(runsDirectory).request("/api/calibration");

		expect(await response.json()).toMatchObject({
			groups: [
				{ judgeModel: "opus", drift: [{ steps: 1 }, { steps: 1 }] },
				{ judgeModel: "sonnet", drift: [{ steps: -2 }, { steps: -2 }] },
			],
		});
	});

	it("lists rep stages, replays and stopped stages as gradeable, oldest first, reps last", async () => {
		const runsDirectory = await recordsDirectory();
		const group = confirmationGroupPaths(runsDirectory, "group-1");
		await Bun.write(
			group.groupFile,
			JSON.stringify({ inputs: { judgeModel: "sonnet" } }),
		);
		await Bun.write(
			group.rep("rep-1").stageFile("shape"),
			JSON.stringify({ stage: "shape", ...scorecard("shape", ["C", "C"]) }),
		);
		await Bun.write(
			replayRecordFile(runsDirectory, "lineage-1", "2026-09-30T10:00:00.000Z"),
			JSON.stringify({
				judgeModel: "haiku",
				stage: "decompose",
				scorecard: scorecard("decompose", ["B", "C"]),
			}),
		);
		const run = benchmarkRunPaths(runsDirectory, FIRST_RUN);
		await mkdir(run.checkpointsDirectory, { recursive: true });
		await Bun.write(
			run.stageFile("shape"),
			JSON.stringify({
				stage: "shape",
				status: "STAGE_JUDGE_FAILED",
				judgeModel: "opus",
				input: INPUT,
				...judgedItems(["F", "B"]),
				summary: JUDGE_SUMMARY,
				grade: { grade: "F", verdict: "STOP" },
			}),
		);
		await Bun.write(run.stageFile("decompose"), "not json");

		const before = await appFor(runsDirectory).request("/api/calibration");
		const stopReview = await appFor(runsDirectory).request(
			`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
		);
		const repGrade = await postGrade(
			runsDirectory,
			"/api/calibration/groups/group-1/reps/rep-1/stages/shape",
			JSON.stringify(operatorGrade(["C", "C"])),
		);
		const replayGrade = await postGrade(
			runsDirectory,
			"/api/calibration/replays/lineage-1/2026-09-30T10-00-00.000Z",
			JSON.stringify(operatorGrade(["B", "C"])),
		);
		const after = await appFor(runsDirectory).request("/api/calibration");

		expect(await before.json()).toMatchObject({
			ungraded: 3,
			next: {
				kind: "replay",
				lineage: "lineage-1",
				timestamp: "2026-09-30T10-00-00.000Z",
			},
		});
		expect(await stopReview.json()).toMatchObject({
			criteria: {
				hardBlockers: [{ id: "invalid-stage-delivery" }],
				requirements: [{ id: "goal-stated" }],
				dimensions: [{ id: "clarity" }, { id: "decision-quality" }],
			},
		});
		expect(repGrade.status).toBe(201);
		expect(replayGrade.status).toBe(201);
		expect(await after.json()).toMatchObject({
			ungraded: 1,
			next: { kind: "run", run: FIRST_RUN, stage: "shape" },
			rows: [
				{ stageName: "decompose", judgeModel: "haiku", stepsApart: 0 },
				{ stageName: "shape", judgeModel: "sonnet", stepsApart: 0 },
			],
		});
	});

	it("leaves every record that existed byte-identical when a grade is recorded", async () => {
		const runsDirectory = await recordsDirectory();
		await writeJudgedStage(runsDirectory, {
			run: FIRST_RUN,
			dimensions: ["B", "D"],
		});
		const before = await fileDigests(runsDirectory);

		const response = await postGrade(
			runsDirectory,
			`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
			JSON.stringify(operatorGrade(["B", "B"])),
		);
		const after = await fileDigests(runsDirectory);

		expect(response.status).toBe(201);
		expect(Object.keys(before).length).toBeGreaterThan(0);
		for (const [path, digest] of Object.entries(before)) {
			expect(after[path]).toBe(digest);
		}
		expect(Object.keys(after).filter((path) => !(path in before))).toEqual([
			join(
				operatorGradesDirectory(runsDirectory),
				"run",
				FIRST_RUN,
				"shape.json",
			),
		]);
	});

	it("leaves run history, run detail and the judge agreement report as they were with grades on disk", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-calibration-"));
		roots.push(root);
		const fixture = new RecordedRunsFixture(root);
		await fixture.write();
		await fixture.writeGradedStoppedRun();
		const api = createApiApp({
			projectsDirectory: NO_PROVIDER_PROJECTS,
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(
				directorySource(fixture.runsDirectory),
			),
		});
		const paths = [
			"/api/runs",
			`/api/runs/${fixture.replayableRun}`,
			`/api/runs/${fixture.stoppedRun}`,
			`/api/runs/${fixture.replayableRun}/stages/discuss/judge`,
			`/api/runs/${fixture.stoppedRun}/stages/build/judge`,
		];
		function responses(): Promise<readonly string[]> {
			return Promise.all(
				paths.map(async (path) => {
					const response = await api.request(path);

					return `${response.status} ${await response.text()}`;
				}),
			);
		}
		const before = await responses();
		const agreementBefore = await loadJudgeAgreementReport(
			fixture.runsDirectory,
		);

		const grade = operatorGrade(["B", "B"]);
		await writeOperatorGrade(
			fixture.runsDirectory,
			{ kind: "run", run: fixture.stoppedRun, stage: "build" },
			grade,
		);
		await writeOperatorGrade(
			fixture.runsDirectory,
			{ kind: "run", run: fixture.replayableRun, stage: "discuss" },
			grade,
		);
		await writeOperatorGrade(
			fixture.runsDirectory,
			{
				kind: "rep",
				groupId: fixture.groupId,
				repId: "rep-1",
				stage: "discuss",
			},
			grade,
		);
		await writeOperatorGrade(
			fixture.runsDirectory,
			{ kind: "replay", ...fixture.stageAttempt },
			grade,
		);

		expect(before.map((response) => response.slice(0, 3))).toEqual([
			"200",
			"200",
			"200",
			"200",
			"200",
		]);
		expect(await responses()).toEqual(before);
		expect(await loadJudgeAgreementReport(fixture.runsDirectory)).toEqual(
			agreementBefore,
		);
	});
});
