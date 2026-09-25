import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	captureStageCorpus,
	installStageCorpusSnapshot,
	materializeCheckpoint,
	recordCheckpoint,
} from "./checkpoint";
import { captureBaselineContext, captureFileHashes } from "./checks";
import { runCommand } from "./command";
import type {
	ClaudeCallMetrics,
	JudgeGrade,
	StageJudgeInput,
	StageRubric,
	StageScorecard,
} from "./contracts";
import type { PipelineDefinition } from "./pipeline";
import type {
	PipelineConfirmationDependencies,
	PipelineConfirmationRequest,
} from "./pipeline-confirmation";
import { runPipelineConfirmation } from "./pipeline-confirmation";
import {
	addWorktree,
	assertBuildCommitted,
	captureBuildCandidate,
	changedPathsBetween,
	currentSha,
	removeWorktree,
} from "./target";
import { createProductOwner } from "./workflow";
import { TEST_TARGET, commitAll, harnessResult } from "./test-support";

interface ConfirmationResources {
	readonly track: (directory: string) => void;
	readonly createRepository: () => Promise<{
		readonly directory: string;
		readonly sha: string;
	}>;
}

interface PipelineHarnessProps {
	readonly sourceRoot: string;
	readonly sourceSha: string;
	readonly runsDirectory: string;
	readonly corpusRoot: string;
}

export type PipelineDependencyOverride = (
	defaults: PipelineConfirmationDependencies,
) => PipelineConfirmationDependencies;

export const CONFIRMATION_METRIC: ClaudeCallMetrics = {
	costUsd: 0.25,
	inputTokens: 100,
	outputTokens: 20,
	cacheReadTokens: 30,
	cacheWriteTokens: 40,
	turns: 2,
};

export const CONFIRMATION_PIPELINE: PipelineDefinition = {
	statuses: ["To Do", "Done"],
	target: TEST_TARGET,
	stages: [
		{
			name: "discuss",
			kind: "planning",
			skill: "discuss",
			artifact: "spec",
			rubric: "rubrics/discuss.json",
			requiresAcceptanceCriteria: false,
		},
		{
			name: "build",
			kind: "delivery",
			skill: "build",
			rubric: "rubrics/build.json",
		},
	],
};

export const CONFIRMATION_STAGE_RUBRIC: StageRubric = {
	hardBlockers: [],
	requirements: [{ id: "scope", description: "Scope is explicit" }],
	dimensions: [
		{ id: "clarity", description: "Clear", good: "g", excellent: "e" },
	],
};

export class PipelineConfirmationHarness {
	public readonly sourceRoot: string;
	public readonly sourceSha: string;
	public readonly runsDirectory: string;
	public readonly corpusRoot: string;
	public readonly retained = new Map<string, string>();
	public readonly removed: string[] = [];
	public readonly logs: string[] = [];

	private constructor(props: PipelineHarnessProps) {
		this.sourceRoot = props.sourceRoot;
		this.sourceSha = props.sourceSha;
		this.runsDirectory = props.runsDirectory;
		this.corpusRoot = props.corpusRoot;
	}

	public static async setup(
		resources: ConfirmationResources,
	): Promise<PipelineConfirmationHarness> {
		const source = await resources.createRepository();
		const sourceHead = await runCommand(
			["git", "rev-parse", "HEAD"],
			source.directory,
		);
		const runsDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-pipeline-confirmation-"),
		);
		resources.track(runsDirectory);
		const corpusRoot = join(runsDirectory, "corpus");
		for (const skill of ["discuss", "build", "doctrine"]) {
			await mkdir(join(corpusRoot, "skills", skill), { recursive: true });
			await Bun.write(
				join(corpusRoot, "skills", skill, "SKILL.md"),
				`${skill} corpus\n`,
			);
		}

		return new PipelineConfirmationHarness({
			sourceRoot: source.directory,
			sourceSha: sourceHead.trim(),
			runsDirectory,
			corpusRoot,
		});
	}

	public run(
		requestOverrides: Partial<PipelineConfirmationRequest>,
		...overrides: readonly PipelineDependencyOverride[]
	): ReturnType<typeof runPipelineConfirmation> {
		let dependencies = this.defaultDependencies();
		for (const override of overrides) {
			dependencies = override(dependencies);
		}

		return runPipelineConfirmation(dependencies, {
			...this.defaultRequest(),
			...requestOverrides,
		});
	}

	private defaultDependencies(): PipelineConfirmationDependencies {
		return {
			createProductOwner,
			stageSession: {
				runWorkflowStage: async (request) => {
					if (request.stage === "discuss") {
						await mkdir(join(request.targetDir, "backlog", "docs"), {
							recursive: true,
						});
						await Bun.write(
							join(request.targetDir, "backlog", "docs", "DOC-1 - spec.md"),
							"confirmed spec\n",
						);
					} else {
						await Bun.write(join(request.targetDir, "change.txt"), "change\n");
						await commitAll(request.targetDir, "feat: implement change");
					}

					return {
						stage: request.stage,
						sessionId: request.stage,
						costUsd: CONFIRMATION_METRIC.costUsd,
						providerCalls: [{ metrics: CONFIRMATION_METRIC }],
						exchanges: [],
					};
				},
				readTaskOutput: () =>
					Promise.resolve(
						JSON.stringify({
							task: {
								acceptanceCriteria: ["done"],
								documentation: ["DOC-1 - spec.md"],
							},
						}),
					),
				readTaskCard: () => Promise.resolve("confirmed task card"),
				captureBuildCandidate,
				assertPlanningStageCompleted: async (
					targetDir,
					baselineSha,
					stage,
				) => ({
					taskState: `${stage.name}-state`,
					artifact: {
						path: "backlog/docs/DOC-1 - spec.md",
						content: await Bun.file(
							join(targetDir, "backlog", "docs", "DOC-1 - spec.md"),
						).text(),
					},
					resultSha: baselineSha,
					diff: "",
					changedPaths: [],
				}),
				assertBuildCommitted,
				changedPathsBetween,
				captureCheckIntegrity: () =>
					Promise.resolve(harnessResult("PASS", "checks match")),
				captureTreatmentChecks: () =>
					Promise.resolve(harnessResult("PASS", "all green")),
				captureStageCorpus,
				measureCorpus: () =>
					Promise.resolve({ kind: "version", digest: "c".repeat(64) }),
			},
			runStageJudge: (_model, _effort, _budget, input, source) =>
				Promise.resolve(pipelineStageScorecard(input, source)),
			runFinalJudge: () =>
				Promise.resolve({
					grade: completeFinalGrade("PASS"),
					prompt: "final prompt",
					attempts: [
						{
							payload: { summary: "pass" },
							costUsd: CONFIRMATION_METRIC.costUsd,
							metrics: CONFIRMATION_METRIC,
							outcome: "ACCEPTED",
						},
					],
					costUsd: CONFIRMATION_METRIC.costUsd,
				}),
			seedTaskBoard: async (targetDir) => ({
				taskId: "TASK-1",
				taskSha: await currentSha(targetDir),
			}),
			runChecks: () => Promise.resolve(),
			runSetup: () => Promise.resolve(),
			captureBaselineContext,
			captureFileHashes,
			addWorktree,
			removeWorktree: async (targetRoot, worktreePath) => {
				this.removed.push(worktreePath);
				await removeWorktree(targetRoot, worktreePath);
			},
			materializeCheckpoint,
			installStageCorpusSnapshot,
			recordCheckpoint,
			recordRetentionRef: (_targetRoot, runName, targetSha) => {
				this.retained.set(runName, targetSha);

				return Promise.resolve();
			},
			captureBuildCandidate,
			log: (message) => {
				this.logs.push(message);
			},
		};
	}

	private defaultRequest(): PipelineConfirmationRequest {
		return {
			caseId: "audit-log",
			runsDirectory: this.runsDirectory,
			groupId: "pipeline-confirmation-1",
			reps: 3,
			projectedCost: {
				reps: 3,
				perRepMaximumUsd: 45,
				totalMaximumUsd: 135,
			},
			approvalMethod: "yes",
			source: { root: this.sourceRoot, sha: this.sourceSha },
			controlSha: "a".repeat(40),
			pipelinePath: "pipelines/test.json",
			pipeline: CONFIRMATION_PIPELINE,
			task: "# Task\n\nImplement it.",
			productBrief: "Product brief",
			instructions: "Frozen instructions\n",
			finalRubric: "1. `final`: pass the candidate\n",
			stageRubrics: {
				discuss: {
					rubricPath: "rubrics/discuss.json",
					content: "{}\n",
					rubric: CONFIRMATION_STAGE_RUBRIC,
				},
				build: {
					rubricPath: "rubrics/build.json",
					content: "{}\n",
					rubric: CONFIRMATION_STAGE_RUBRIC,
				},
			},
			corpusRoots: [{ kind: "directory", root: this.corpusRoot }],
			model: "sonnet",
			effort: "high",
			judgeModel: "opus",
			judgeEffort: "high",
			sessionBudgetUsd: 5,
		};
	}
}

export function pipelineStageScorecard(
	input: StageJudgeInput,
	source: {
		readonly rubricPath: string;
		readonly rubric: StageRubric;
	},
): StageScorecard {
	return {
		stage: input.stage,
		rubricPath: source.rubricPath,
		rubric: source.rubric,
		input,
		prompt: "prompt",
		attempts: [
			{
				payload: { summary: "accepted" },
				costUsd: CONFIRMATION_METRIC.costUsd,
				metrics: CONFIRMATION_METRIC,
				outcome: "ACCEPTED",
			},
		],
		costUsd: CONFIRMATION_METRIC.costUsd,
		grade: {
			hardBlockers: [],
			requirements: [],
			dimensions: [],
			summary: "graded",
			grade: "A",
			verdict: "CONTINUE",
		},
	};
}

export function completeFinalGrade(verdict: "PASS" | "FAIL"): JudgeGrade {
	return {
		requirements: ["tests", "worker", "check-integrity", "local-checks"].map(
			(id) => ({
				id,
				status: verdict,
				evidence: [
					{
						source: "diff" as const,
						path: "src/audit/example.ts",
						claim: `${id} evidence`,
					},
				],
			}),
		),
		verdict,
		summary: "complete",
	};
}
