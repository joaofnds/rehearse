import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { readClaudeEnvelope } from "./claude";
import type {
	StageJudgeOutput,
	StageJudgeResponse,
	StageScorecard,
} from "./contracts";
import type { JudgeProgress } from "./run-events";
import { StageValidationError } from "./contracts";
import {
	applyAuthoritativeStageResults,
	captureStageJudgeInput,
	deriveStageGrade,
	parseStageRubric,
	runStageJudge,
	validateStageJudgeEvidence,
} from "./stage-grading";
import {
	AUDIT_LOG_RUBRICS_PATH,
	harnessResult,
	PROJECT_ROOT,
} from "./test-support";

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

function stageJudgeInput(
	stage: string,
	overrides: Partial<StageScorecard["input"]> = {},
): StageScorecard["input"] {
	return {
		stage,
		kind: stage === "build" ? "delivery" : "planning",
		task: "Task",
		productBrief: "Brief",
		instructions: "Instructions",
		baselineContext: [],
		taskState: "State",
		transcript: {
			stage,
			sessionId: "session",
			costUsd: 1,
			providerCalls: [],
			exchanges: [],
		},
		priorArtifacts: [],
		...overrides,
	};
}

function passingStageOutput(
	rubric: ReturnType<typeof parseStageRubric>,
): StageJudgeOutput {
	return {
		hardBlockers: rubric.hardBlockers.map(({ id }) => ({
			id,
			status: "PASS" as const,
			evidence: [stageEvidence("task", "backlog-seed.md")],
		})),
		requirements: rubric.requirements.map(({ id }) => ({
			id,
			status: "PASS" as const,
			evidence: [stageEvidence("task", "backlog-seed.md")],
		})),
		dimensions: rubric.dimensions.map(({ id }) => ({
			id,
			grade: "A" as const,
			evidence: [stageEvidence("task", "backlog-seed.md")],
		})),
		summary: "pass",
	};
}

function stageEvidence(
	source: StageJudgeOutput["requirements"][number]["evidence"][number]["source"],
	path: string,
): StageJudgeOutput["requirements"][number]["evidence"][number] {
	return { source, path, claim: "evidence" };
}

describe(deriveStageGrade.name, () => {
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
			requirements: [{ id: "scope", description: "Scope is explicit" }],
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

	it("continues when every requirement passes and quality is B", () => {
		const grade = deriveStageGrade(
			stageJudgeOutput("PASS", "PASS", "B"),
			rubric,
		);

		expect(grade.grade).toBe("B");
		expect(grade.verdict).toBe("CONTINUE");
	});

	it("stops with F when a hard blocker is triggered", () => {
		const grade = deriveStageGrade(
			stageJudgeOutput("FAIL", "PASS", "A"),
			rubric,
		);

		expect(grade.grade).toBe("F");
		expect(grade.verdict).toBe("STOP");
	});

	it("caps a missing requirement below B", () => {
		const grade = deriveStageGrade(
			stageJudgeOutput("PASS", "FAIL", "A"),
			rubric,
		);

		expect(grade.grade).toBe("C");
		expect(grade.verdict).toBe("STOP");
	});

	it("uses the worst quality dimension without averaging", () => {
		const grade = deriveStageGrade(
			stageJudgeOutput("PASS", "PASS", "C"),
			rubric,
		);

		expect(grade.grade).toBe("C");
		expect(grade.verdict).toBe("STOP");
	});

	it("rejects IDs reused across rubric sections", () => {
		expect(() =>
			parseStageRubric(
				JSON.stringify({
					stage: "discuss",
					hardBlockers: [
						{
							id: "invalid-stage-delivery",
							description: "Valid delivery",
						},
						{ id: "same", description: "Blocker" },
					],
					requirements: [{ id: "same", description: "Requirement" }],
					dimensions: [
						{
							id: "quality",
							description: "Quality",
							good: "Good",
							excellent: "Excellent",
						},
					],
				}),
			),
		).toThrow("IDs must be unique");
	});

	it("parses a rubric a stage adopts under any name", () => {
		const parsed = parseStageRubric(
			JSON.stringify({
				hardBlockers: [
					{ id: "invalid-stage-delivery", description: "Valid delivery" },
				],
				requirements: [{ id: "sources", description: "Cites sources" }],
				dimensions: [
					{
						id: "clarity",
						description: "Clarity",
						good: "Good",
						excellent: "Excellent",
					},
				],
			}),
		);

		expect(parsed.requirements.map(({ id }) => id)).toEqual(["sources"]);
	});

	it("requires delivery-only blockers of a delivery stage under any name", () => {
		expect(() =>
			parseStageRubric(
				JSON.stringify({
					hardBlockers: [
						{ id: "invalid-stage-delivery", description: "Valid delivery" },
					],
					requirements: [{ id: "scope", description: "Scope" }],
					dimensions: [
						{
							id: "clarity",
							description: "Clarity",
							good: "Good",
							excellent: "Excellent",
						},
					],
				}),
				"delivery",
			),
		).toThrow("false-test-safety");
	});

	it("rejects removal of a harness-owned blocker", () => {
		expect(() =>
			parseStageRubric(
				JSON.stringify({
					stage: "discuss",
					hardBlockers: [],
					requirements: [{ id: "scope", description: "Scope" }],
					dimensions: [
						{
							id: "clarity",
							description: "Clarity",
							good: "Good",
							excellent: "Excellent",
						},
					],
				}),
			),
		).toThrow("must retain harness blockers");
	});
});

describe(applyAuthoritativeStageResults.name, () => {
	it("forces a delivery stage under any name to F when local checks fail", async () => {
		const rubric = parseStageRubric(
			await Bun.file(
				join(PROJECT_ROOT, AUDIT_LOG_RUBRICS_PATH, "build.json"),
			).text(),
			"delivery",
		);
		const input = {
			...stageJudgeInput("build", {
				localChecks: harnessResult("FAIL", "unit tests exited 1"),
				checkIntegrity: harnessResult("PASS", "check definitions match"),
			}),
			stage: "ship",
			kind: "delivery" as const,
		};

		const grade = deriveStageGrade(
			applyAuthoritativeStageResults(passingStageOutput(rubric), input),
			rubric,
		);

		expect(grade.grade).toBe("F");
		expect(
			grade.hardBlockers.find(({ id }) => id === "unfinished-delivery")?.status,
		).toBe("FAIL");
	});

	it("forces Build to F when local checks fail", async () => {
		const rubric = parseStageRubric(
			await Bun.file(
				join(PROJECT_ROOT, AUDIT_LOG_RUBRICS_PATH, "build.json"),
			).text(),
		);
		const output = passingStageOutput(rubric);
		const input = stageJudgeInput("build", {
			localChecks: harnessResult("FAIL", "unit tests exited 1"),
			checkIntegrity: harnessResult("PASS", "check definitions match"),
		});

		const grade = deriveStageGrade(
			applyAuthoritativeStageResults(output, input),
			rubric,
		);

		expect(grade.grade).toBe("F");
		expect(
			grade.hardBlockers.find(({ id }) => id === "unfinished-delivery")?.status,
		).toBe("FAIL");
	});

	it("forces Build to F when check definitions change", async () => {
		const rubric = parseStageRubric(
			await Bun.file(
				join(PROJECT_ROOT, AUDIT_LOG_RUBRICS_PATH, "build.json"),
			).text(),
		);
		const output = passingStageOutput(rubric);
		const input = stageJudgeInput("build", {
			localChecks: harnessResult("PASS", "unit tests passed"),
			checkIntegrity: harnessResult("FAIL", "package.json changed"),
		});

		const grade = deriveStageGrade(
			applyAuthoritativeStageResults(output, input),
			rubric,
		);

		expect(grade.grade).toBe("F");
		expect(
			grade.hardBlockers.find(({ id }) => id === "false-test-safety")?.status,
		).toBe("FAIL");
	});

	it("forces a malformed stage delivery to F", async () => {
		const rubric = parseStageRubric(
			await Bun.file(
				join(PROJECT_ROOT, AUDIT_LOG_RUBRICS_PATH, "shape.json"),
			).text(),
		);
		const output = passingStageOutput(rubric);
		const input = stageJudgeInput("discuss", {
			harnessFailure: "Discuss completed without its durable spec document",
		});

		const grade = deriveStageGrade(
			applyAuthoritativeStageResults(output, input),
			rubric,
		);

		expect(grade.grade).toBe("F");
		expect(
			grade.hardBlockers.find(({ id }) => id === "invalid-stage-delivery")
				?.status,
		).toBe("FAIL");
	});
});

describe(captureStageJudgeInput.name, () => {
	it("turns invalid stage delivery into Judge evidence", async () => {
		const fallback = stageJudgeInput("discuss");

		const input = await captureStageJudgeInput(fallback, () =>
			Promise.reject(
				new StageValidationError(
					"Discuss completed without its durable spec document",
				),
			),
		);

		expect(input.harnessFailure).toBe(
			"Discuss completed without its durable spec document",
		);
		expect(input).toEqual({
			...fallback,
			harnessFailure: "Discuss completed without its durable spec document",
		});
	});

	it("propagates infrastructure failures", () => {
		const result = captureStageJudgeInput(stageJudgeInput("discuss"), () =>
			Promise.reject(new Error("git executable unavailable")),
		);

		expect(result).rejects.toThrow("git executable unavailable");
	});
});

describe(validateStageJudgeEvidence.name, () => {
	it("accepts a fragment within a frozen JSON source", () => {
		const rubric = parseStageRubric(
			JSON.stringify({
				stage: "discuss",
				hardBlockers: [
					{
						id: "invalid-stage-delivery",
						description: "Valid delivery",
					},
				],
				requirements: [{ id: "scope", description: "Scope" }],
				dimensions: [
					{
						id: "clarity",
						description: "Clarity",
						good: "Good",
						excellent: "Excellent",
					},
				],
			}),
		);
		const base = passingStageOutput(rubric);
		const output: StageJudgeOutput = {
			...base,
			requirements: [
				{
					id: "scope",
					status: "PASS",
					evidence: [
						stageEvidence("transcript", "discuss.transcript.json#exchanges"),
					],
				},
				...base.requirements.slice(1),
			],
		};

		expect(() => {
			validateStageJudgeEvidence(output, stageJudgeInput("discuss"));
		}).not.toThrow();
	});

	it("accepts a citation naming its whole source", () => {
		const rubric = parseStageRubric(
			JSON.stringify({
				hardBlockers: [
					{ id: "invalid-stage-delivery", description: "Valid delivery" },
				],
				requirements: [{ id: "scope", description: "Scope" }],
				dimensions: [
					{
						id: "clarity",
						description: "Clarity",
						good: "Good",
						excellent: "Excellent",
					},
				],
			}),
		);
		const base = passingStageOutput(rubric);
		const output: StageJudgeOutput = {
			...base,
			requirements: [
				{
					id: "scope",
					status: "PASS",
					evidence: [stageEvidence("diff", "diff")],
				},
				...base.requirements.slice(1),
			],
		};

		expect(() => {
			validateStageJudgeEvidence(output, {
				...stageJudgeInput("build"),
				diff: "d",
				changedPaths: ["src/a.ts"],
			});
		}).not.toThrow();
	});

	it("accepts a whole-source citation in the input's own field spelling", () => {
		const rubric = parseStageRubric(
			JSON.stringify({
				hardBlockers: [
					{ id: "invalid-stage-delivery", description: "Valid delivery" },
				],
				requirements: [{ id: "scope", description: "Scope" }],
				dimensions: [
					{
						id: "clarity",
						description: "Clarity",
						good: "Good",
						excellent: "Excellent",
					},
				],
			}),
		);
		const base = passingStageOutput(rubric);
		const output: StageJudgeOutput = {
			...base,
			requirements: [
				{
					id: "scope",
					status: "PASS",
					evidence: [stageEvidence("baseline-context", "baselineContext")],
				},
				...base.requirements.slice(1),
			],
		};

		expect(() => {
			validateStageJudgeEvidence(output, stageJudgeInput("shape"));
		}).not.toThrow();
	});

	it("accepts a whole-source citation carrying a fragment", () => {
		const rubric = parseStageRubric(
			JSON.stringify({
				hardBlockers: [
					{ id: "invalid-stage-delivery", description: "Valid delivery" },
				],
				requirements: [{ id: "scope", description: "Scope" }],
				dimensions: [
					{
						id: "clarity",
						description: "Clarity",
						good: "Good",
						excellent: "Excellent",
					},
				],
			}),
		);
		const base = passingStageOutput(rubric);
		const output: StageJudgeOutput = {
			...base,
			requirements: [
				{
					id: "scope",
					status: "PASS",
					evidence: [stageEvidence("product-brief", "product-brief#details")],
				},
				...base.requirements.slice(1),
			],
		};

		expect(() => {
			validateStageJudgeEvidence(output, stageJudgeInput("build"));
		}).not.toThrow();
	});

	it("rejects citations outside the frozen stage input", () => {
		const rubric = parseStageRubric(
			JSON.stringify({
				stage: "discuss",
				hardBlockers: [
					{
						id: "invalid-stage-delivery",
						description: "Valid delivery",
					},
				],
				requirements: [{ id: "scope", description: "Scope" }],
				dimensions: [
					{
						id: "clarity",
						description: "Clarity",
						good: "Good",
						excellent: "Excellent",
					},
				],
			}),
		);
		const base = passingStageOutput(rubric);
		const output: StageJudgeOutput = {
			...base,
			requirements: [
				{
					id: "scope",
					status: "PASS",
					evidence: [stageEvidence("artifact", "backlog/docs/missing-spec.md")],
				},
				...base.requirements.slice(1),
			],
		};

		expect(() => {
			validateStageJudgeEvidence(output, stageJudgeInput("discuss"));
		}).toThrow("cited unavailable evidence");
	});
});

describe(runStageJudge.name, () => {
	function judgeResponse(
		evidencePath: string,
		evidenceSource: StageJudgeOutput["requirements"][number]["evidence"][number]["source"] = "task",
		quote = "Task",
	): string {
		return quotedResponse([
			{ source: evidenceSource, path: evidencePath, claim: "grounded", quote },
		]);
	}

	const rubricSource = {
		rubricPath: "rubrics/shape.json",
		content: "{}",
		rubric: {
			hardBlockers: [
				{ id: "invalid-stage-delivery", description: "Valid delivery" },
			],
			requirements: [{ id: "scope", description: "Scope" }],
			dimensions: [
				{ id: "clarity", description: "Clear", good: "g", excellent: "e" },
			],
		},
	};

	function quotedResponse(
		evidence: readonly (StageJudgeOutput["requirements"][number]["evidence"][number] & {
			readonly quote: string;
		})[],
	): string {
		return JSON.stringify({
			session_id: "judge-session",
			total_cost_usd: 0.1,
			structured_output: {
				hardBlockers: [
					{ id: "invalid-stage-delivery", status: "PASS", evidence },
				],
				requirements: [{ id: "scope", status: "PASS", evidence }],
				dimensions: [{ id: "clarity", grade: "A", evidence }],
				summary: "graded",
			},
		});
	}

	function quotedResponseFor(blockerIds: readonly string[]): string {
		const evidence = [
			{
				source: "task",
				path: "backlog-seed.md",
				claim: "grounded",
				quote: "Task",
			},
		];

		return JSON.stringify({
			session_id: "judge-session",
			total_cost_usd: 0.1,
			structured_output: {
				hardBlockers: blockerIds.map((id) => ({
					id,
					status: "PASS",
					evidence,
				})),
				requirements: [{ id: "scope", status: "PASS", evidence }],
				dimensions: [{ id: "clarity", grade: "A", evidence }],
				summary: "graded",
			},
		});
	}

	function judgedOnce(
		input: StageScorecard["input"],
		response: string,
	): Promise<StageScorecard> {
		return runStageJudge("sonnet", undefined, 5, input, rubricSource, () =>
			Promise.resolve(response),
		);
	}

	describe("quoted spans", () => {
		it("locates a quote from the task state by its line range", async () => {
			const input = stageJudgeInput("shape", {
				taskState: '{\n  "status": "Done",\n  "title": "Audit log"\n}',
			});

			const scorecard = await judgedOnce(
				input,
				quotedResponse([
					{
						source: "task-state",
						path: "backlog/task.json",
						claim: "the task is done",
						quote: '"status": "Done",',
					},
				]),
			);

			expect(scorecard.grade.requirements[0]?.evidence).toEqual([
				{
					source: "task-state",
					path: "backlog/task.json",
					claim: "the task is done",
					quote: '"status": "Done",',
					locator: {
						kind: "lines",
						file: "backlog/task.json",
						startLine: 2,
						endLine: 2,
						occurrences: 1,
					},
				},
			]);
		});

		it("locates a quote from a whole-source diff citation by its file and hunk", async () => {
			const input = stageJudgeInput("build", {
				diff: [
					"--- a/src/a.ts",
					"+++ b/src/a.ts",
					"@@ -1 +1,2 @@",
					" export {};",
					"+export const audit = true;",
				].join("\n"),
				changedPaths: ["src/a.ts"],
			});

			const scorecard = await judgedOnce(
				input,
				quotedResponse([
					{
						source: "diff",
						path: "diff",
						claim: "the audit flag is exported",
						quote: "export const audit = true;",
					},
				]),
			);

			expect(scorecard.grade.requirements[0]?.evidence[0]?.locator).toEqual({
				kind: "hunk",
				file: "src/a.ts",
				hunk: "@@ -1 +1,2 @@",
				occurrences: 1,
			});
		});

		it("asks the judge to quote every source but the harness sources", async () => {
			let prompt = "";

			await runStageJudge(
				"sonnet",
				undefined,
				5,
				stageJudgeInput("shape"),
				rubricSource,
				(judgePrompt) => {
					prompt = judgePrompt;

					return Promise.resolve(judgeResponse("backlog-seed.md"));
				},
			);

			expect(prompt).toContain(
				"Every evidence entry must also carry quote: a span copied character for character from the cited source's supplied text, one to five lines, that supports the claim. Leave quote empty for check-integrity, local-checks and harness-failure.",
			);
		});

		it("rejects a quote its cited source does not hold and records the retry", async () => {
			const responses = [
				judgeResponse("backlog-seed.md", "task", "Brief"),
				judgeResponse("backlog-seed.md", "task", "Task"),
			];

			const scorecard = await runStageJudge(
				"sonnet",
				undefined,
				5,
				stageJudgeInput("shape"),
				rubricSource,
				() => Promise.resolve(responses.shift() ?? ""),
			);

			expect(scorecard.attempts.map(({ outcome }) => outcome)).toEqual([
				"REJECTED",
				"ACCEPTED",
			]);
			expect(scorecard.attempts[0]).toMatchObject({
				error:
					"Stage Judge quoted text its cited source does not hold for invalid-stage-delivery: task:backlog-seed.md",
			});
			expect(scorecard.grade.requirements[0]?.evidence[0]).toMatchObject({
				quote: "Task",
				locator: { kind: "lines", file: "backlog-seed.md", startLine: 1 },
			});
		});

		it("drops the quote on a harness citation and names the harness result", async () => {
			const input = stageJudgeInput("build", {
				checkIntegrity: harnessResult("PASS", "check definitions match"),
			});

			const scorecard = await judgedOnce(
				input,
				quotedResponse([
					{
						source: "check-integrity",
						path: "harness",
						claim: "checks are intact",
						quote: '{"status":"PASS"}',
					},
					{
						source: "local-checks",
						path: "harness",
						claim: "no check results were recorded",
						quote: "",
					},
				]),
			);

			expect(scorecard.grade.requirements[0]?.evidence).toEqual([
				{
					source: "check-integrity",
					path: "harness",
					claim: "checks are intact",
					locator: {
						kind: "harness",
						result: "checkIntegrity",
						recorded: true,
					},
				},
				{
					source: "local-checks",
					path: "harness",
					claim: "no check results were recorded",
					locator: { kind: "harness", result: "localChecks", recorded: false },
				},
			]);
		});

		it("says a cited commit history the stage lacks is absent", async () => {
			const scorecard = await judgedOnce(
				stageJudgeInput("build"),
				judgeResponse("commitSubjects", "commit-subjects", "add audit event"),
			);

			expect(scorecard.grade.requirements[0]?.evidence).toEqual([
				{
					source: "commit-subjects",
					path: "commitSubjects",
					claim: "grounded",
					locator: { kind: "absent" },
				},
			]);
		});

		it("names the harness result on a blocker the harness failed", async () => {
			const scorecard = await runStageJudge(
				"sonnet",
				undefined,
				5,
				stageJudgeInput("build", {
					kind: "delivery",
					localChecks: harnessResult("FAIL", "unit tests exited 1"),
				}),
				{
					...rubricSource,
					rubric: {
						...rubricSource.rubric,
						hardBlockers: [
							...rubricSource.rubric.hardBlockers,
							{ id: "unfinished-delivery", description: "Finished" },
						],
					},
				},
				() =>
					Promise.resolve(
						quotedResponseFor([
							"invalid-stage-delivery",
							"unfinished-delivery",
						]),
					),
			);

			expect(
				scorecard.grade.hardBlockers.find(
					({ id }) => id === "unfinished-delivery",
				)?.evidence,
			).toEqual([
				{
					source: "local-checks",
					path: "harness",
					claim: "unit tests exited 1",
					locator: { kind: "harness", result: "localChecks", recorded: true },
				},
			]);
		});
	});

	it("accepts commit subjects as citable stage evidence", async () => {
		let prompt = "";
		const input = stageJudgeInput("build", {
			commitSubjects: ["add audit event"],
		});

		const scorecard = await runStageJudge(
			"sonnet",
			undefined,
			5,
			input,
			rubricSource,
			(judgePrompt) => {
				prompt = judgePrompt;

				return Promise.resolve(
					judgeResponse("commitSubjects", "commit-subjects", "audit event"),
				);
			},
		);

		expect(scorecard.grade.grade).toBe("A");
		expect(prompt).toContain(
			"commitSubjects (or commit-subjects) as the whole-source path for commit-subjects",
		);
		expect(() => {
			validateStageJudgeEvidence(
				{
					...scorecard.grade,
					requirements: [
						{
							id: "scope",
							status: "PASS",
							evidence: [stageEvidence("commit-subjects", "commit-subjects")],
						},
					],
				},
				input,
			);
		}).not.toThrow();
	});

	it("retries once with the rejection quoted and sums the costs", async () => {
		const prompts: string[] = [];
		const responses = [
			judgeResponse("not-a-path"),
			judgeResponse("backlog-seed.md"),
		];
		const payloads = responses.map(
			(response) => readClaudeEnvelope(response).structured_output,
		);
		const scorecard = await runStageJudge(
			"sonnet",
			undefined,
			5,
			stageJudgeInput("shape"),
			rubricSource,
			(prompt) => {
				prompts.push(prompt);
				const next = responses.shift();
				if (next === undefined) {
					throw new Error("no scripted response left");
				}
				return Promise.resolve(next);
			},
		);

		expect(prompts).toHaveLength(2);
		expect(prompts[1]).toContain("Your previous response was rejected");
		expect(prompts[1]).toContain("not-a-path");
		expect(scorecard.attempts).toEqual([
			{
				payload: payloads[0],
				costUsd: 0.1,
				outcome: "REJECTED",
				error:
					"Stage Judge cited unavailable evidence for invalid-stage-delivery: task:not-a-path",
			},
			{
				payload: payloads[1],
				costUsd: 0.1,
				outcome: "ACCEPTED",
			},
		]);
		expect(scorecard.costUsd).toBeCloseTo(0.2);
		expect(scorecard.grade.grade).toBe("A");
	});

	it("fails with both rejected attempts after the second invalid response", () => {
		let calls = 0;
		const response = judgeResponse("not-a-path");
		const payload = readClaudeEnvelope(response).structured_output;

		expect(
			runStageJudge(
				"sonnet",
				undefined,
				5,
				stageJudgeInput("shape"),
				rubricSource,
				() => {
					calls += 1;

					return Promise.resolve(response);
				},
			),
		).rejects.toMatchObject({
			name: "JudgeOutputValidationError",
			costUsd: 0.2,
			attempts: [
				{
					payload,
					costUsd: 0.1,
					outcome: "REJECTED",
					error:
						"Stage Judge cited unavailable evidence for invalid-stage-delivery: task:not-a-path",
				},
				{
					payload,
					costUsd: 0.1,
					outcome: "REJECTED",
					error:
						"Stage Judge cited unavailable evidence for invalid-stage-delivery: task:not-a-path",
				},
			],
		});
		expect(calls).toBe(2);
	});

	it("does not retry an invocation failure", () => {
		let calls = 0;
		const failure = new Error("Stage Judge command timed out");

		expect(
			runStageJudge(
				"sonnet",
				undefined,
				5,
				stageJudgeInput("shape"),
				rubricSource,
				() => {
					calls += 1;

					return Promise.reject(failure);
				},
			),
		).rejects.toMatchObject({
			name: "JudgeExecutionError",
			cause: failure,
			attempts: [],
			providerCalls: [{}],
			costUsd: 0,
		});
		expect(calls).toBe(1);
	});

	it("does not retry a Claude error envelope", () => {
		let calls = 0;

		expect(
			runStageJudge(
				"sonnet",
				undefined,
				5,
				stageJudgeInput("shape"),
				rubricSource,
				() => {
					calls += 1;

					return Promise.resolve(
						JSON.stringify({
							session_id: "judge-session",
							is_error: true,
							result: "Claude session failed",
						}),
					);
				},
			),
		).rejects.toThrow("Claude session failed");
		expect(calls).toBe(1);
	});

	describe("judge progress", () => {
		const progressRubric = {
			rubricPath: "rubrics/build.json",
			content: "{}",
			rubric: {
				hardBlockers: [
					{ id: "b1", description: "Blocker one" },
					{ id: "b2", description: "Blocker two" },
				],
				requirements: [{ id: "r1", description: "Requirement" }],
				dimensions: [
					{ id: "d1", description: "One", good: "g", excellent: "e" },
					{ id: "d2", description: "Two", good: "g", excellent: "e" },
					{ id: "d3", description: "Three", good: "g", excellent: "e" },
				],
			},
		};
		const cited: StageJudgeResponse["dimensions"][number]["evidence"][number] =
			{
				source: "task",
				path: "backlog-seed.md",
				claim: "grounded",
				quote: "Task",
			};
		const grounded = [cited];
		const pass = (id: string): StageJudgeResponse["hardBlockers"][number] => ({
			id,
			status: "PASS",
			evidence: grounded,
		});
		const graded = (id: string): StageJudgeResponse["dimensions"][number] => ({
			id,
			grade: "A",
			evidence: grounded,
		});

		function streamed(output: Partial<StageJudgeResponse>): string[] {
			const json = JSON.stringify(output);
			const deltas: string[] = [];
			for (let start = 0; start < json.length; start += 5) {
				deltas.push(
					JSON.stringify({
						type: "stream_event",
						event: {
							type: "content_block_delta",
							index: 0,
							delta: {
								type: "input_json_delta",
								partial_json: json.slice(start, start + 5),
							},
						},
					}),
				);
			}

			return [
				JSON.stringify({
					type: "stream_event",
					event: {
						type: "content_block_start",
						index: 0,
						content_block: {
							type: "tool_use",
							name: "StructuredOutput",
							input: {},
						},
					},
				}),
				...deltas,
			];
		}

		function envelope(output: Partial<StageJudgeResponse>): string {
			return JSON.stringify({
				type: "result",
				session_id: "judge-session",
				total_cost_usd: 0.1,
				structured_output: output,
			});
		}

		const complete = {
			dimensions: [graded("d1"), graded("d2"), graded("d3")],
			hardBlockers: [pass("b1"), pass("b2")],
			requirements: [pass("r1")],
			summary: "graded",
		};

		it("counts each item as it closes, per rubric section, before any grade exists", async () => {
			const progress: JudgeProgress[] = [];
			let beforeGrade: JudgeProgress | undefined;

			const scorecard = await runStageJudge(
				"sonnet",
				undefined,
				5,
				stageJudgeInput("build"),
				progressRubric,
				(_prompt, onLine) => {
					const partial = {
						dimensions: [graded("d1"), graded("d2")],
						hardBlockers: [pass("b1")],
					};
					for (const line of streamed(partial)) {
						onLine(line);
					}
					beforeGrade = progress.at(-1);

					return Promise.resolve(envelope(complete));
				},
				(reading) => {
					progress.push(reading);
				},
			);

			expect(progress[0]).toEqual({
				state: "returning",
				attempt: 1,
				sections: {
					hardBlockers: { returned: 0, total: 2 },
					requirements: { returned: 0, total: 1 },
					dimensions: { returned: 0, total: 3 },
				},
			});
			expect(beforeGrade).toEqual({
				state: "returning",
				attempt: 1,
				sections: {
					hardBlockers: { returned: 1, total: 2 },
					requirements: { returned: 0, total: 1 },
					dimensions: { returned: 2, total: 3 },
				},
			});
			expect(scorecard.grade.grade).toBe("A");
		});

		it("does not count an item that fails its own checks", async () => {
			const progress: JudgeProgress[] = [];

			await runStageJudge(
				"sonnet",
				undefined,
				5,
				stageJudgeInput("build"),
				progressRubric,
				(_prompt, onLine) => {
					for (const line of streamed({
						dimensions: [
							graded("unknown"),
							{
								...graded("d1"),
								evidence: [{ ...cited, path: "nowhere.md" }],
							},
							{
								...graded("d2"),
								evidence: [{ ...cited, quote: "absent" }],
							},
							graded("d3"),
							graded("d3"),
						],
					})) {
						onLine(line);
					}

					return Promise.resolve(envelope(complete));
				},
				(reading) => {
					progress.push(reading);
				},
			);

			expect(progress.at(-1)).toMatchObject({
				sections: { dimensions: { returned: 1, total: 3 } },
			});
		});

		it("grades the stage when every progress report fails", async () => {
			const scorecard = await runStageJudge(
				"sonnet",
				undefined,
				5,
				stageJudgeInput("build"),
				progressRubric,
				(_prompt, onLine) => {
					for (const line of streamed(complete)) {
						onLine(line);
					}

					return Promise.resolve(envelope(complete));
				},
				() => {
					throw new Error("run event store closed");
				},
			);

			expect(scorecard.grade.grade).toBe("A");
		});

		it("withdraws a rejected attempt's progress and counts the next attempt from none", async () => {
			const progress: JudgeProgress[] = [];
			const outputs = [
				{ ...complete, dimensions: [graded("d1"), graded("d2")] },
				complete,
			];

			const scorecard = await runStageJudge(
				"sonnet",
				undefined,
				5,
				stageJudgeInput("build"),
				progressRubric,
				(_prompt, onLine) => {
					const output = outputs.shift() ?? complete;
					for (const line of streamed(output)) {
						onLine(line);
					}

					return Promise.resolve(envelope(output));
				},
				(reading) => {
					progress.push(reading);
				},
			);

			const rejected = progress.findIndex(({ state }) => state === "rejected");
			expect(progress[rejected]).toEqual({
				state: "rejected",
				attempt: 1,
				reason:
					"Stage Judge must return every quality dimensions item exactly once",
			});
			expect(progress[rejected - 1]).toMatchObject({
				attempt: 1,
				sections: { dimensions: { returned: 2, total: 3 } },
			});
			expect(progress[rejected + 1]).toMatchObject({
				state: "returning",
				attempt: 2,
				sections: { dimensions: { returned: 0, total: 3 } },
			});
			expect(progress.at(-1)).toMatchObject({
				attempt: 2,
				sections: { dimensions: { returned: 3, total: 3 } },
			});
			expect(scorecard.attempts.map(({ outcome }) => outcome)).toEqual([
				"REJECTED",
				"ACCEPTED",
			]);
		});
	});
});
