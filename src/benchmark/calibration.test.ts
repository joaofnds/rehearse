import { describe, expect, it } from "bun:test";
import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	calibrate,
	CalibrationIncompleteError,
	collectCalibration,
	parseHumanReview,
	validateCalibration,
} from "./calibration";
import {
	AUDIT_LOG_CASE_DIR,
	AUDIT_LOG_RUBRICS_PATH,
	PROJECT_ROOT,
	TestResources,
} from "./test-support";
import { CommandError } from "./command";
import type {
	HumanReview,
	JudgeGrade,
	StageJudgeOutput,
	StageScorecard,
} from "./contracts";
import type { JudgeAttempt } from "./judge-attempt";
import { deriveStageGrade, parseStageRubric } from "./stage-grading";

const testResources = TestResources.forEachTest();

const ignoreLog = (): undefined => undefined;

function humanReview(
	verdict: HumanReview["verdict"],
	judgeAssessment: HumanReview["findings"][number]["judgeAssessment"],
	rubricId: string,
	stage = "final",
): HumanReview {
	return {
		verdict,
		summary: "Human review",
		findings: [
			{
				description: "Finding",
				paths: ["src/audit/example.ts"],
				stage,
				judgeAssessment,
				rubricId,
			},
		],
	};
}

function stageJudgeOutput(
	blocker: "PASS" | "FAIL",
	requirementStatus: "PASS" | "FAIL",
	dimensionGrade: "A" | "B" | "C" | "D" | "F",
): StageJudgeOutput {
	return {
		hardBlockers: [
			{
				id: "invalid-stage-delivery",
				status: "PASS",
				evidence: [stageEvidence("task", "backlog-seed.md")],
			},
			{
				id: "contradiction",
				status: blocker,
				evidence: [stageEvidence("artifact", "backlog/docs/spec.md")],
			},
		],
		requirements: [
			{
				id: "scope",
				status: requirementStatus,
				evidence: [stageEvidence("artifact", "backlog/docs/spec.md")],
			},
		],
		dimensions: [
			{
				id: "clarity",
				grade: dimensionGrade,
				evidence: [stageEvidence("artifact", "backlog/docs/spec.md")],
			},
		],
		summary: "stage grade",
	};
}

function requirement(
	id: string,
	status: "PASS" | "FAIL",
): JudgeGrade["requirements"][number] {
	return {
		id,
		status,
		evidence: [
			{
				source: "diff",
				path: "src/audit/example.ts",
				claim: `${id} evidence`,
			},
		],
	};
}

function stageScorecard(
	requirementStatus: "PASS" | "FAIL",
	requirementId = "scope",
): StageScorecard {
	const rubric = parseStageRubric(
		JSON.stringify({
			stage: "discuss",
			hardBlockers: [
				{
					id: "invalid-stage-delivery",
					description: "Valid delivery",
				},
				{ id: "contradiction", description: "No conflict" },
			],
			requirements: [{ id: requirementId, description: "Scope is explicit" }],
			dimensions: [
				{
					id: "clarity",
					description: "Clear output",
					good: "Concrete",
					excellent: "Precise",
				},
			],
		}),
	);

	return {
		stage: "discuss",
		rubricPath: "rubrics/discuss.json",
		rubric,
		input: {
			stage: "discuss",
			kind: "planning",
			task: "Task",
			productBrief: "Brief",
			instructions: "Instructions",
			baselineContext: [],
			taskState: "State",
			transcript: {
				stage: "discuss",
				sessionId: "session",
				costUsd: 1,
				providerCalls: [],
				exchanges: [],
			},
			priorArtifacts: [],
		},
		prompt: "prompt",
		attempts: [],
		costUsd: 1,
		grade: deriveStageGrade(
			{
				...stageJudgeOutput("PASS", requirementStatus, "B"),
				requirements: [
					{
						id: requirementId,
						status: requirementStatus,
						evidence: [stageEvidence("artifact", "backlog/docs/spec.md")],
					},
				],
			},
			rubric,
		),
	};
}

const RUBRIC_IDS = [
	"tests",
	"worker",
	"check-integrity",
	"local-checks",
] as const;

function completeGrade(verdict: "PASS" | "FAIL"): JudgeGrade {
	return {
		requirements: RUBRIC_IDS.map((id) => requirement(id, verdict)),
		verdict,
		summary: "complete",
	};
}

function withFailedFirstRequirement(id: string): JudgeGrade {
	return {
		...withFirstRequirement(completeGrade("PASS"), requirement(id, "FAIL")),
		verdict: "FAIL",
	};
}

function stageEvidence(
	source: StageJudgeOutput["requirements"][number]["evidence"][number]["source"],
	path: string,
): StageJudgeOutput["requirements"][number]["evidence"][number] {
	return { source, path, claim: "evidence" };
}

function withFirstRequirement(
	grade: JudgeGrade,
	first: JudgeGrade["requirements"][number],
): JudgeGrade {
	return { ...grade, requirements: [first, ...grade.requirements.slice(1)] };
}

describe(parseHumanReview.name, () => {
	it("parses a structured human review", () => {
		const review = parseHumanReview(
			JSON.stringify({
				verdict: "REJECT",
				summary: "The worker loses metadata.",
				findings: [
					{
						description: "The worker drops request metadata.",
						paths: ["src/audit/worker.ts"],
						judgeAssessment: "MISSED",
						rubricId: "worker-metadata",
					},
				],
			}),
		);

		expect(review.verdict).toBe("REJECT");
		expect(review.findings[0]?.rubricId).toBe("worker-metadata");
	});

	it("reports malformed review JSON as incomplete calibration", () => {
		expect(() => parseHumanReview("not json")).toThrow(
			CalibrationIncompleteError,
		);
	});

	it("requires a rubric ID for Judge-related findings", () => {
		expect(() =>
			parseHumanReview(
				JSON.stringify({
					verdict: "REJECT",
					summary: "The Judge missed a defect.",
					findings: [
						{
							description: "Missing worker behavior.",
							paths: [],
							judgeAssessment: "MISSED",
							rubricId: null,
						},
					],
				}),
			),
		).toThrow();
	});
});

describe(calibrate.name, () => {
	it("records a stage rubric change and its revised scorecard from values alone", async () => {
		const original = stageScorecard("PASS");
		const editedRubric = JSON.stringify({
			...original.rubric,
			requirements: [
				{ id: "scope", description: "Scope is explicit and observable" },
			],
		});
		const revised = {
			...stageScorecard("FAIL"),
			rubric: parseStageRubric(editedRubric),
		};

		const result = await calibrate(
			{
				instructions: "Instructions",
				finalRubric: "1. `old`: Old requirement.\n",
				stageScorecards: [original],
			},
			{
				instructions: "Instructions",
				finalRubric: "1. `old`: Old requirement.\n",
				stageRubrics: new Map([["discuss", editedRubric]]),
			},
			humanReview("REJECT", "MISSED", "scope", "discuss"),
			{ stageJudge: () => Promise.resolve(revised) },
		);

		expect(result.stageRubricsChanged).toEqual(["discuss"]);
		expect(result.revisedStageScorecards).toEqual([revised]);
		expect(result.instructionsChanged).toBe(false);
		expect(result.rubricChanged).toBe(false);
	});

	it("returns the same result for the same arguments", async () => {
		const frozen = {
			instructions: "Instructions",
			finalRubric: "1. `old`: Old requirement.\n",
			stageScorecards: [stageScorecard("PASS")],
		};
		const current = {
			instructions: "Edited instructions",
			finalRubric: "1. `old`: Old requirement.\n",
			stageRubrics: new Map<string, string>(),
		};
		const review = humanReview("REJECT", "NOT_PROMOTED", "scope", "discuss");
		const judges = {
			stageJudge: () => Promise.reject(new Error("no stage rejudge")),
		};

		const [first, second] = await Promise.all([
			calibrate(frozen, current, review, judges),
			calibrate(frozen, current, review, judges),
		]);

		expect(first).toEqual(second);
		expect(first.instructionsChanged).toBe(true);
		expect(first.updatedInstructions).toBe("Edited instructions");
		expect(first.rejudgeConfirmedByHuman).toBeUndefined();
	});
});

describe(collectCalibration.name, () => {
	it("keeps one live corpus permission while waiting for review", async () => {
		const reviewDirectory = await mkdtemp(join(tmpdir(), "rehearse-review-"));
		testResources.track(reviewDirectory);
		const installRoot = await mkdtemp(join(tmpdir(), "rehearse-install-"));
		testResources.track(installRoot);
		const firstBackingRoot = await mkdtemp(
			join(tmpdir(), "rehearse-backing-first-"),
		);
		testResources.track(firstBackingRoot);
		const secondBackingRoot = await mkdtemp(
			join(tmpdir(), "rehearse-backing-second-"),
		);
		testResources.track(secondBackingRoot);
		await Bun.write(
			join(firstBackingRoot, "CLAUDE.md"),
			"captured instructions\n",
		);
		await symlink(
			join(firstBackingRoot, "CLAUDE.md"),
			join(installRoot, "CLAUDE.md"),
		);
		const reviewFile = join(reviewDirectory, "review.json");
		let resolutions = 0;

		const result = await collectCalibration({
			log: ignoreLog,
			rl: {
				async question() {
					await Bun.write(
						reviewFile,
						`${JSON.stringify({ verdict: "REJECT", summary: "Reviewed.", findings: [] })}\n`,
					);

					return "";
				},
			},
			reviewFile,
			targetDir: reviewDirectory,
			originalInstructions: "captured instructions\n",
			originalRubric: await Bun.file(
				join(PROJECT_ROOT, AUDIT_LOG_CASE_DIR, "rubric.md"),
			).text(),
			finalRubricPath: join(PROJECT_ROOT, AUDIT_LOG_CASE_DIR, "rubric.md"),
			rubricsDirectory: join(PROJECT_ROOT, AUDIT_LOG_RUBRICS_PATH),
			stageScorecards: [],
			judgeModel: "sonnet",
			sessionBudgetUsd: 5,
			resolveCorpus: () => {
				resolutions += 1;

				return Promise.resolve({
					kind: "live",
					root: installRoot,
					backingRoot: resolutions === 1 ? firstBackingRoot : secondBackingRoot,
				});
			},
		});

		expect(resolutions).toBe(1);
		expect(result.instructionsChanged).toBe(false);
	});

	it("re-prompts after invalid review JSON and accepts the corrected review", async () => {
		const reviewDirectory = await mkdtemp(join(tmpdir(), "rehearse-review-"));
		testResources.track(reviewDirectory);
		const reviewFile = join(reviewDirectory, "review.json");
		const prompts: string[] = [];
		const rl = {
			async question(prompt: string) {
				prompts.push(prompt);
				await Bun.write(
					reviewFile,
					prompts.length === 1
						? "not json"
						: `${JSON.stringify({
								verdict: "REJECT",
								summary: "Stage failed.",
								findings: [],
							})}\n`,
				);
				return "";
			},
		};

		const result = await collectCalibration({
			log: ignoreLog,
			rl,
			reviewFile,
			targetDir: reviewDirectory,
			originalInstructions: "instructions\n",
			originalRubric: await Bun.file(
				join(PROJECT_ROOT, AUDIT_LOG_CASE_DIR, "rubric.md"),
			).text(),
			finalRubricPath: join(PROJECT_ROOT, AUDIT_LOG_CASE_DIR, "rubric.md"),
			rubricsDirectory: join(PROJECT_ROOT, AUDIT_LOG_RUBRICS_PATH),
			stageScorecards: [],
			judgeModel: "sonnet",
			sessionBudgetUsd: 5,
		});

		expect(prompts).toHaveLength(2);
		expect(result.humanReview.verdict).toBe("REJECT");
	});

	it("records a rubric.md edit during stage-failure calibration without a final rejudge", async () => {
		const reviewDirectory = await mkdtemp(join(tmpdir(), "rehearse-review-"));
		testResources.track(reviewDirectory);
		const reviewFile = join(reviewDirectory, "review.json");
		const rubricPath = join(reviewDirectory, "discuss.json");
		const rubricContent = JSON.stringify({
			stage: "discuss",
			hardBlockers: [
				{ id: "invalid-stage-delivery", description: "Valid delivery" },
			],
			requirements: [{ id: "scope", description: "Scope is explicit" }],
			dimensions: [
				{
					id: "clarity",
					description: "Clear output",
					good: "Concrete",
					excellent: "Precise",
				},
			],
		});
		await Bun.write(rubricPath, rubricContent);
		const rubric = parseStageRubric(rubricContent);
		const scorecard: StageScorecard = {
			stage: "discuss",
			rubricPath,
			rubric,
			input: {
				stage: "discuss",
				kind: "planning",
				task: "Task",
				productBrief: "Brief",
				instructions: "Instructions",
				baselineContext: [],
				taskState: "State",
				transcript: {
					stage: "discuss",
					sessionId: "session",
					costUsd: 1,
					providerCalls: [],
					exchanges: [],
				},
				priorArtifacts: [],
			},
			prompt: "prompt",
			attempts: [],
			costUsd: 1,
			grade: {
				...stageJudgeOutput("PASS", "FAIL", "F"),
				grade: "F",
				verdict: "STOP",
			},
		};
		const questions: string[] = [];
		const rl = {
			async question(prompt: string) {
				if (questions.length > 0) {
					throw new CommandError(["calibration"], 1, "", "re-prompted");
				}
				questions.push(prompt);
				await Bun.write(
					reviewFile,
					`${JSON.stringify({
						verdict: "REJECT",
						summary: "The discuss stage missed scope.",
						findings: [],
					})}\n`,
				);
				return "";
			},
		};

		const result = await collectCalibration({
			log: ignoreLog,
			rl,
			reviewFile,
			targetDir: reviewDirectory,
			originalInstructions: "instructions\n",
			originalRubric: "1. `old`: Old requirement.\n",
			finalRubricPath: join(PROJECT_ROOT, AUDIT_LOG_CASE_DIR, "rubric.md"),
			rubricsDirectory: join(PROJECT_ROOT, AUDIT_LOG_RUBRICS_PATH),
			stageScorecards: [scorecard],
			judgeModel: "sonnet",
			sessionBudgetUsd: 5,
		});

		expect(questions).toHaveLength(1);
		expect(questions[0]).not.toContain("rubric.md");
		expect(result.rubricChanged).toBe(true);
		expect(result.updatedRubric).toBeDefined();
		expect(result.revisedGrade).toBeUndefined();
	});

	it("retains Judge attempts from a stage rubric rejudge", async () => {
		const reviewDirectory = await mkdtemp(join(tmpdir(), "rehearse-review-"));
		testResources.track(reviewDirectory);
		const reviewFile = join(reviewDirectory, "review.json");
		const rubricPath = join(reviewDirectory, "discuss.json");
		const original = stageScorecard("FAIL");
		const updatedRubric = {
			...original.rubric,
			requirements: [
				{ id: "scope", description: "Scope is explicit and observable" },
			],
		};
		await Bun.write(rubricPath, JSON.stringify(updatedRubric));
		const attempts: readonly JudgeAttempt[] = [
			{
				payload: { summary: "rejudged" },
				costUsd: 0.4,
				outcome: "ACCEPTED",
			},
		];
		const revised = {
			...original,
			rubricPath,
			rubric: parseStageRubric(JSON.stringify(updatedRubric)),
			attempts,
			costUsd: 0.4,
		};
		let questions = 0;
		const rl = {
			async question() {
				questions += 1;
				if (questions === 1) {
					await Bun.write(
						reviewFile,
						`${JSON.stringify({
							verdict: "REJECT",
							summary: "The stage failed.",
							findings: [],
						})}\n`,
					);

					return "";
				}

				return "yes";
			},
		};

		const result = await collectCalibration({
			log: ignoreLog,
			rl,
			reviewFile,
			targetDir: reviewDirectory,
			originalInstructions: "instructions\n",
			originalRubric: await Bun.file(
				join(PROJECT_ROOT, AUDIT_LOG_CASE_DIR, "rubric.md"),
			).text(),
			finalRubricPath: join(PROJECT_ROOT, AUDIT_LOG_CASE_DIR, "rubric.md"),
			rubricsDirectory: join(PROJECT_ROOT, AUDIT_LOG_RUBRICS_PATH),
			stageScorecards: [{ ...original, rubricPath }],
			judgeModel: "sonnet",
			sessionBudgetUsd: 5,
			stageJudge: () => Promise.resolve(revised),
		});

		expect(result.revisedStageScorecards?.[0]?.attempts).toBe(attempts);
	});
});

describe(validateCalibration.name, () => {
	it("throws a calibration-incomplete error for inconsistent findings", () => {
		const review = humanReview("ACCEPT", "MISSED", "worker-metadata");

		expect(() => {
			validateCalibration(review, completeGrade("PASS"));
		}).toThrow(CalibrationIncompleteError);
	});

	it("accepts a missed defect caught by the revised rubric", () => {
		const original = completeGrade("PASS");
		const revisedBase = completeGrade("PASS");
		const revised: JudgeGrade = {
			...revisedBase,
			requirements: [
				...revisedBase.requirements,
				requirement("worker-metadata", "FAIL"),
			],
			verdict: "FAIL",
		};
		const review = humanReview("REJECT", "MISSED", "worker-metadata");

		expect(() => {
			validateCalibration(review, original, revised);
		}).not.toThrow();
	});

	it("rejects a missed defect that the revised rubric still passes", () => {
		const original = completeGrade("PASS");
		const revisedBase = completeGrade("PASS");
		const revised: JudgeGrade = {
			...revisedBase,
			requirements: [
				...revisedBase.requirements,
				requirement("worker-metadata", "PASS"),
			],
		};
		const review = humanReview("REJECT", "MISSED", "worker-metadata");

		expect(() => {
			validateCalibration(review, original, revised);
		}).toThrow("does not catch");
	});

	it("rejects a missed classification for a defect already caught", () => {
		const original = withFailedFirstRequirement(RUBRIC_IDS[0]);
		const revised = completeGrade("FAIL");
		const review = humanReview("REJECT", "MISSED", RUBRIC_IDS[0]);

		expect(() => {
			validateCalibration(review, original, revised);
		}).toThrow("already caught");
	});

	it("accepts a corrected false positive", () => {
		const original = withFailedFirstRequirement(RUBRIC_IDS[0]);
		const revised = completeGrade("PASS");
		const review = humanReview("ACCEPT", "FALSE_POSITIVE", RUBRIC_IDS[0]);

		expect(() => {
			validateCalibration(review, original, revised);
		}).not.toThrow();
	});

	it("rejects acceptance when a real defect was found", () => {
		const review = humanReview("ACCEPT", "CAUGHT", RUBRIC_IDS[0]);

		expect(() => {
			validateCalibration(review, completeGrade("FAIL"));
		}).toThrow("cannot accept");
	});

	it("validates a missed stage requirement against the revised stage rubric", () => {
		const review = humanReview("REJECT", "MISSED", "scope", "discuss");

		expect(() => {
			validateCalibration(
				review,
				undefined,
				undefined,
				[stageScorecard("PASS")],
				[stageScorecard("FAIL")],
			);
		}).not.toThrow();
	});

	it("accepts a missed stage defect added as a new rubric requirement", () => {
		const review = humanReview(
			"REJECT",
			"MISSED",
			"worker-metadata",
			"discuss",
		);

		expect(() => {
			validateCalibration(
				review,
				undefined,
				undefined,
				[stageScorecard("PASS")],
				[stageScorecard("FAIL", "worker-metadata")],
			);
		}).not.toThrow();
	});
});
