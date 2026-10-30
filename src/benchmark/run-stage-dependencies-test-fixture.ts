import { createHash } from "node:crypto";

import { recordCheckpoint } from "./checkpoint";
import type { StageJudgeInput, StageScorecard } from "./contracts";
import type { CorpusMeasurement } from "./corpus-measurement";
import type { StageContext, StageDependencies } from "./run";
import { StageContextBuilder } from "./run-stage-context-test-fixture";
import { stageJudgeOutput } from "./run-stage-judge-test-fixtures";
import { parseStageRubric } from "./stage-rubric";
import { harnessResult } from "./test-support";

interface StageHarness {
	readonly scorecardFor: (
		input: StageJudgeInput,
		verdict: "CONTINUE" | "STOP",
	) => StageScorecard;
	readonly dependencies: StageDependencies;
	readonly judged: StageJudgeInput[];
	readonly executed: string[];
	readonly rubricsUsed: string[];
	readonly settingsOverlays: (string | undefined)[];
	readonly setups: (string | undefined)[];
}

const SHA256_HEX_DIGITS = 64;
const scorecardFor = (
	input: StageJudgeInput,
	verdict: "CONTINUE" | "STOP",
): StageScorecard => ({
	attempts: [],
	costUsd: 0,
	grade: {
		...stageJudgeOutput("PASS", "PASS", verdict === "CONTINUE" ? "B" : "F"),
		grade: verdict === "CONTINUE" ? "B" : "F",
		verdict,
	},
	input,
	prompt: "prompt",
	rubric: parseStageRubric(
		JSON.stringify({
			dimensions: [
				{
					description: "Clear output",
					excellent: "Precise",
					good: "Concrete",
					id: "clarity",
				},
			],
			hardBlockers: [
				{ description: "Valid delivery", id: "invalid-stage-delivery" },
				{ description: "Checks intact", id: "false-test-safety" },
				{ description: "Checks pass", id: "unfinished-delivery" },
			],
			requirements: [{ description: "Scope is explicit", id: "scope" }],
			stage: input.stage,
		}),
		input.kind,
	),
	rubricPath: `${input.stage}.json`,
	stage: input.stage,
});
const DEFAULT_STAGE_DEPENDENCIES = {
	assertBuildCommitted: async () =>
		await Promise.resolve({
			commitSubjects: ["build commit"],
			diff: "the-diff",
			resultSha: "result-sha",
		}),
	assertPlanningStageCompleted: async ({ baselineSha }, { stage }) =>
		await Promise.resolve({
			artifact: {
				content: `${stage.name} artifact`,
				path: `backlog/docs/${stage.name}.md`,
			},
			changedPaths: [],
			diff: "",
			resultSha: baselineSha,
			taskState: `${stage.name}-state`,
		}),
	captureBuildCandidate: async () =>
		await Promise.resolve({
			changedPaths: ["src/example.ts"],
			diff: "candidate-diff",
			resultSha: "candidate-sha",
		}),
	captureCheckIntegrity: async () =>
		await Promise.resolve(harnessResult("PASS", "checks match")),
	captureStageCorpus: async (skill: string) =>
		await Promise.resolve([
			{
				path: `skills/${skill}/SKILL.md`,
				sha256: createHash("sha256").update(skill).digest("hex"),
			},
		]),
	captureTreatmentChecks: async () =>
		await Promise.resolve(harnessResult("PASS", "all green")),
	changedPathsBetween: async () => await Promise.resolve(["src/example.ts"]),
	corpusVersionFiles: async () => await Promise.resolve([]),
	measureCorpus: async () =>
		await Promise.resolve<CorpusMeasurement>({
			digest: "c".repeat(SHA256_HEX_DIGITS),
			kind: "version",
		}),
	readTaskCard: async () => await Promise.resolve("the task card"),
	readTaskOutput: async () =>
		await Promise.resolve(
			JSON.stringify({
				task: { acceptanceCriteria: ["done"], documentation: [] },
			}),
		),
	recordCheckpoint,
	resolveSkillDirectory: async (skill: string) =>
		await Promise.resolve(`/skills/${skill}`),
	snapshotCheckout: async () => await Promise.resolve("snapshot-sha"),
} satisfies Omit<StageDependencies, "runStageJudge" | "runWorkflowStage">;

function fakeStageDependencies(): StageHarness {
	const judged: StageJudgeInput[] = [];
	const executed: string[] = [];
	const rubricsUsed: string[] = [];
	const settingsOverlays: (string | undefined)[] = [];
	const setups: (string | undefined)[] = [];

	return {
		dependencies: {
			...DEFAULT_STAGE_DEPENDENCIES,
			runStageJudge: async (_execution, { input, source }) => {
				judged.push(input);
				rubricsUsed.push(source.rubricPath);

				return await Promise.resolve(scorecardFor(input, "CONTINUE"));
			},
			runWorkflowStage: async ({ stage, skill, settingsOverlay, setup }) => {
				executed.push(skill);
				settingsOverlays.push(settingsOverlay);
				setups.push(setup);

				return await Promise.resolve({
					costUsd: 0,
					exchanges: [],
					providerCalls: [],
					sessionId: "session",
					stage,
				});
			},
		},
		executed,
		judged,
		rubricsUsed,
		scorecardFor,
		settingsOverlays,
		setups,
	};
}

function stoppedStageDependencies(): StageHarness {
	const harness = fakeStageDependencies();
	return {
		...harness,
		dependencies: {
			...harness.dependencies,
			runStageJudge: async (_execution, { input }) =>
				await Promise.resolve(harness.scorecardFor(input, "STOP")),
		},
	};
}

async function stageFixture(): Promise<
	StageHarness & { readonly context: StageContext }
> {
	const harness = fakeStageDependencies();
	return { ...harness, context: await new StageContextBuilder().build() };
}
function committingStageDependencies(): StageHarness & {
	readonly buildBaselines: string[];
} {
	const harness = fakeStageDependencies();
	const buildBaselines: string[] = [];

	return {
		...harness,
		buildBaselines,
		dependencies: {
			...harness.dependencies,
			assertBuildCommitted: async ({ taskSha: baselineSha }) => {
				buildBaselines.push(baselineSha);

				return await Promise.resolve({
					commitSubjects: ["build commit"],
					diff: "the-diff",
					resultSha: "result-sha",
				});
			},
			assertPlanningStageCompleted: async (_baseline, { stage }) =>
				await Promise.resolve({
					artifact: {
						content: `${stage.name} artifact`,
						path: `backlog/docs/${stage.name}.md`,
					},
					changedPaths: ["GLOSSARY.md"],
					commitSubjects: [`${stage.name} commit`],
					diff: "glossary-diff",
					resultSha: `${stage.name}-sha`,
					taskState: `${stage.name}-state`,
				}),
		},
	};
}

async function stoppedStageFixture(
	overrides: Partial<StageContext> = {},
): Promise<StageHarness & { readonly context: StageContext }> {
	const harness = stoppedStageDependencies();
	return {
		...harness,
		context: { ...(await new StageContextBuilder().build()), ...overrides },
	};
}
export {
	stoppedStageFixture,
	committingStageDependencies,
	stageFixture,
	stoppedStageDependencies,
	SHA256_HEX_DIGITS,
	fakeStageDependencies,
};
export type { StageHarness };
