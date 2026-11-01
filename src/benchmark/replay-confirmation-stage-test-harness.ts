import { createHash } from "node:crypto";

import type { CorpusMeasurement } from "#benchmark/corpus-measurement";

import type { StageJudgeInput, StageScorecard } from "./contracts";
import type { CorpusRoot } from "./corpus-file";
import { JudgeOutputValidationError } from "./judge-attempt";
import { STAGE_JUDGE_CONTRACT_SHA256 } from "./judge-contract";
import type { TargetCheck } from "./pipeline";
import type { ReplayDependencies } from "./replay";
import type { ServiceEnvironment } from "./target-services";
import { harnessResult } from "./test-support";

const SHA256_HEX_DIGITS = 64;
class ReplayStageSessionHarness {
	public readonly stageDirs: string[] = [];
	public readonly branchExpectations: (string | null | undefined)[] = [];
	public readonly sessionEnvironments: (ServiceEnvironment | undefined)[] = [];
	public readonly targetChecks: (readonly TargetCheck[])[] = [];
	public readonly judged: StageJudgeInput[] = [];
	public readonly corpusCaptures: {
		readonly skill: string;
		readonly instructions: string;
		readonly roots: readonly CorpusRoot[];
	}[] = [];
	public readonly stageSetups: (string | undefined)[] = [];
	public readonly settingsOverlays: (string | undefined)[] = [];
	public readonly stageSession: ReplayDependencies["stageSession"] = {
		assertBuildCommitted: async ({ targetDir }, expectedBranch) => {
			this.stageDirs.push(targetDir);
			this.branchExpectations.push(expectedBranch);

			return await Promise.resolve({
				commitSubjects: ["replayed commit"],
				diff: "the-diff",
				resultSha: "result-sha",
			});
		},
		assertPlanningStageCompleted: async (
			{ targetDir, baselineSha },
			{ stage, expectedBranch },
		) => {
			this.stageDirs.push(targetDir);
			this.branchExpectations.push(expectedBranch);

			return await Promise.resolve({
				artifact: {
					content: `${stage.name} artifact`,
					path: `backlog/docs/${stage.name}.md`,
				},
				changedPaths: [],
				diff: "",
				resultSha: baselineSha,
				taskState: `${stage.name}-state`,
			});
		},
		captureBuildCandidate: async (targetDir) => {
			this.stageDirs.push(targetDir);

			return await Promise.resolve({
				changedPaths: [],
				diff: "diff",
				resultSha: "candidate-sha",
			});
		},
		captureCheckIntegrity: async (targetDir) => {
			this.stageDirs.push(targetDir);

			return await Promise.resolve(harnessResult("PASS", "checks match"));
		},
		captureStageCorpus: async (skill, instructions, roots) => {
			this.corpusCaptures.push({ instructions, roots, skill });

			return await Promise.resolve([
				{
					path: `skills/${skill}/SKILL.md`,
					sha256: createHash("sha256").update(skill).digest("hex"),
				},
			]);
		},
		captureTreatmentChecks: async (targetDir, checks) => {
			this.stageDirs.push(targetDir);
			this.targetChecks.push(checks);

			return await Promise.resolve(harnessResult("PASS", "all green"));
		},
		changedPathsBetween: async (targetDir) => {
			this.stageDirs.push(targetDir);

			return await Promise.resolve(["src/example.ts"]);
		},
		corpusVersionFiles: async () => await Promise.resolve([]),
		measureCorpus: async () =>
			await Promise.resolve<CorpusMeasurement>({
				digest: "c".repeat(SHA256_HEX_DIGITS),
				kind: "version",
			}),
		readTaskCard: async () => await Promise.resolve("the task card"),
		readTaskOutput: async (targetDir) => {
			this.stageDirs.push(targetDir);

			return await Promise.resolve(
				JSON.stringify({
					task: { acceptanceCriteria: ["done"], documentation: [] },
				}),
			);
		},
		runWorkflowStage: async ({
			targetDir,
			stage,
			setup,
			settingsOverlay,
			environment,
		}) => {
			this.stageDirs.push(targetDir);
			this.stageSetups.push(setup);
			this.settingsOverlays.push(settingsOverlay);
			this.sessionEnvironments.push(environment);

			return await Promise.resolve({
				costUsd: 1.25,
				exchanges: [],
				providerCalls: [],
				sessionId: "session",
				stage,
			});
		},
	};
	public static readonly rejectsJudgeOutput: ReplayDependencies["runStageJudge"] =
		() => {
			throw new JudgeOutputValidationError({
				attempts: [
					{
						costUsd: 0,
						error: "invalid output",
						outcome: "REJECTED",
						payload: { summary: "completed" },
					},
				],
				costUsd: 0,
				message: "Judge rejected both attempts",
				prompt: "prompt",
			});
		};
}
function replayScorecard(
	input: StageJudgeInput,
	verdict: "CONTINUE" | "STOP" = "CONTINUE",
): StageScorecard {
	return {
		attempts: [],
		costUsd: 0.5,
		grade: {
			dimensions: [],
			grade: verdict === "CONTINUE" ? "B" : "F",
			hardBlockers: [],
			requirements: [],
			summary: "graded",
			verdict,
		},
		input,
		judgeContractSha256: STAGE_JUDGE_CONTRACT_SHA256,
		prompt: "prompt",
		rubric: {
			dimensions: [
				{ description: "Clear", excellent: "e", good: "g", id: "clarity" },
			],
			hardBlockers: [],
			requirements: [{ description: "Scope is explicit", id: "scope" }],
		},
		rubricPath: "rubrics/stage.json",
		stage: input.stage,
	};
}
export { ReplayStageSessionHarness as default, replayScorecard };
