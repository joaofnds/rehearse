import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Effort } from "#benchmark/config";
import type { StageJudgeRecord, StageScorecard } from "#benchmark/contracts";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import { parseStageRubric } from "#benchmark/stage-grading";

export const RUN_NAME = "2026-09-03T00-00-00.000Z";

export const FINAL_RUBRIC = [
	"1. `worker`: The worker persists metadata.",
	"2. `check-integrity`: The declared integrity files are unchanged.",
	"3. `local-checks`: The target's checks pass.",
	"",
].join("\n");

const STAGE_RUBRIC = {
	stage: "discuss",
	hardBlockers: [
		{ id: "invalid-stage-delivery", description: "Valid delivery" },
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
};

export function stageRubricText(scopeDescription: string): string {
	return JSON.stringify({
		...STAGE_RUBRIC,
		requirements: [{ id: "scope", description: scopeDescription }],
	});
}

function stageEvidence(): readonly {
	source: "artifact";
	path: string;
	claim: string;
}[] {
	return [
		{ source: "artifact", path: "backlog/docs/spec.md", claim: "evidence" },
	];
}

export function stageScorecard(
	rubricPath: string,
	scopeStatus: "PASS" | "FAIL",
	verdict: "CONTINUE" | "STOP" = scopeStatus === "PASS" ? "CONTINUE" : "STOP",
): StageScorecard {
	const rubric = parseStageRubric(stageRubricText("Scope is explicit"));

	return {
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
			hardBlockers: [
				{
					id: "invalid-stage-delivery",
					status: "PASS",
					evidence: stageEvidence(),
				},
				{ id: "contradiction", status: "PASS", evidence: stageEvidence() },
			],
			requirements: [
				{ id: "scope", status: scopeStatus, evidence: stageEvidence() },
			],
			dimensions: [{ id: "clarity", grade: "B", evidence: stageEvidence() }],
			summary: "stage grade",
			grade: verdict === "CONTINUE" ? "B" : "F",
			verdict,
		},
	};
}

export interface RunFixture {
	readonly runsDirectory: string;
	readonly stageRubricPath: string;
	readonly artifactFile: string;
	readonly reviewFile: string;
	readonly stageFile: string;
}

export interface RunFixtureOptions {
	readonly instructions?: string | undefined;
	readonly stageScopeStatus?: "PASS" | "FAIL" | undefined;
	readonly status?: "AWAITING_HUMAN_REVIEW" | "COMPLETE" | undefined;
	readonly caseId?: string | undefined;
}

/**
 * A run artifact in a temporary runs directory, with its stage rubric beside
 * it so a test can edit the file the scorecard recorded the path of. Every
 * calibrate observation builds one: no run artifact exists anywhere on a fresh
 * machine, and the repository's own runs directory is never written to.
 */
export async function writeRunFixture(
	options: RunFixtureOptions = {},
): Promise<RunFixture> {
	const runsDirectory = await mkdtemp(join(tmpdir(), "rehearse-runs-"));
	const stageRubricPath = join(runsDirectory, "discuss.json");
	await Bun.write(stageRubricPath, stageRubricText("Scope is explicit"));
	const paths = benchmarkRunPaths(runsDirectory, RUN_NAME);
	const scorecard = stageScorecard(
		stageRubricPath,
		options.stageScopeStatus ?? "PASS",
	);
	await Bun.write(
		paths.artifactFile,
		JSON.stringify({
			status: options.status ?? "AWAITING_HUMAN_REVIEW",
			caseId: options.caseId ?? "audit-log",
			timestamp: "2026-09-03T00:00:00.000Z",
			sourceRoot: "/tmp/target",
			sourceSha: "source-sha",
			resultSha: "candidate-sha",
			judgeModel: "sonnet",
			sessionBudgetUsd: 5,
			instructions: options.instructions ?? "Instructions",
			rubric: FINAL_RUBRIC,
			rubricIds: ["worker"],
			grade: {
				requirements: [
					{
						id: "worker",
						status: "PASS",
						evidence: [
							{
								source: "diff",
								path: "src/audit/worker.ts",
								claim: "worker evidence",
							},
						],
					},
				],
				verdict: "PASS",
				summary: "complete",
			},
			baselineContext: [],
			diff: "the diff",
			changedPaths: ["src/audit/worker.ts"],
			checkIntegrity: {
				status: "PASS",
				evidence: [{ source: "local-checks", path: "checks", claim: "intact" }],
			},
			localChecks: {
				status: "PASS",
				evidence: [{ source: "local-checks", path: "checks", claim: "green" }],
			},
			stageScorecards: [scorecard],
			reviewFile: paths.reviewFile,
		}),
	);

	return {
		runsDirectory,
		stageRubricPath,
		artifactFile: paths.artifactFile,
		reviewFile: paths.reviewFile,
		stageFile: paths.stageFile("discuss"),
	};
}

/**
 * How the Judge ran, as the stage record carries it. A record written before
 * the effort and the budget were recorded carries only the model, so a test
 * that means to read one passes those knobs alone.
 */
export interface StageJudgeKnobs {
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd?: number | undefined;
}

export const RECORDED_JUDGE_KNOBS: StageJudgeKnobs = {
	judgeModel: "sonnet",
	judgeEffort: "medium",
	sessionBudgetUsd: 5,
};

/**
 * A run that stopped at a stage: no artifact, only the stage's own record,
 * written by `writeStageProgress` with the scorecard's STOP verdict and no
 * calibration. `calibrate` picks the record it completes from what the run
 * left on disk, so this fixture is what makes it pick the stage.
 */
export async function writeStoppedStageFixture(
	judgeKnobs: Readonly<StageJudgeKnobs> = RECORDED_JUDGE_KNOBS,
): Promise<RunFixture> {
	const runsDirectory = await mkdtemp(join(tmpdir(), "rehearse-runs-"));
	const stageRubricPath = join(runsDirectory, "discuss.json");
	await Bun.write(stageRubricPath, stageRubricText("Scope is explicit"));
	const paths = benchmarkRunPaths(runsDirectory, RUN_NAME);
	const scorecard = stageScorecard(stageRubricPath, "PASS", "STOP");
	await Bun.write(
		paths.stageFile("discuss"),
		// JSON.stringify drops an absent budget, which is the pre-card shape.
		JSON.stringify({
			...scorecard,
			corpusFiles: [],
			corpusVersion: { kind: "version", digest: "c".repeat(64) },
			model: "sonnet",
			effort: "medium",
			...judgeKnobs,
		} satisfies Omit<StageJudgeRecord, "sessionBudgetUsd"> & StageJudgeKnobs),
	);

	return {
		runsDirectory,
		stageRubricPath,
		artifactFile: paths.artifactFile,
		reviewFile: paths.reviewFile,
		stageFile: paths.stageFile("discuss"),
	};
}

export function writeReview(
	reviewFile: string,
	findings: readonly unknown[],
	verdict: "ACCEPT" | "REJECT" = "REJECT",
): Promise<number> {
	return Bun.write(
		reviewFile,
		JSON.stringify({ verdict, summary: "The Judge missed it.", findings }),
	);
}
