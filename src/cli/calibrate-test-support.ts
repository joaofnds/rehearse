import { join } from "node:path";

import type { Effort } from "#benchmark/config";
import type { StageJudgeRecord, StageScorecard } from "#benchmark/contracts";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { CliTestWorkspace } from "#cli/cli-test-support";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import StageScorecardBuilder, {
	stageRubricText,
} from "./calibration-stage-scorecard-test-builder";

const RUN_NAME = "2026-09-03T00-00-00.000Z";

const FINAL_RUBRIC = [
	"1. `worker`: The worker persists metadata.",
	"2. `check-integrity`: The declared integrity files are unchanged.",
	"3. `local-checks`: The target's checks pass.",
	"",
].join("\n");

interface RunFixture {
	readonly runsDirectory: string;
	readonly stageRubricPath: string;
	readonly artifactFile: string;
	readonly reviewFile: string;
	readonly stageFile: string;
}

interface RunFixtureOptions {
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
async function writeRunFixture(
	workspace: Readonly<CliTestWorkspace>,
	options: RunFixtureOptions = {},
): Promise<RunFixture> {
	const runsDirectory = await workspace.createDirectory("rehearse-runs-");
	const stageRubricPath = join(runsDirectory, "discuss.json");
	await Bun.write(stageRubricPath, stageRubricText("Scope is explicit"));
	const paths = benchmarkRunPaths(runsDirectory, RUN_NAME);
	const scorecard = new StageScorecardBuilder({ rubricPath: stageRubricPath })
		.withScopeResult({ status: options.stageScopeStatus ?? "PASS" })
		.build();
	await Bun.write(
		paths.artifactFile,
		runArtifactBytes(options, scorecard, paths.reviewFile),
	);

	return {
		artifactFile: paths.artifactFile,
		reviewFile: paths.reviewFile,
		runsDirectory,
		stageFile: paths.stageFile("discuss"),
		stageRubricPath,
	};
}

const PASSING_FINAL_GRADE = {
	requirements: [
		{
			evidence: [
				{
					claim: "worker evidence",
					path: "src/audit/worker.ts",
					source: "diff",
				},
			],
			id: "worker",
			status: "PASS",
		},
	],
	summary: "complete",
	verdict: "PASS",
} as const;

function runArtifactBytes(
	options: RunFixtureOptions,
	scorecard: StageScorecard,
	reviewFile: string,
): string {
	return JSON.stringify({
		baselineContext: [],
		caseId: options.caseId ?? "audit-log",
		changedPaths: ["src/audit/worker.ts"],
		checkIntegrity: {
			evidence: [{ claim: "intact", path: "checks", source: "local-checks" }],
			status: "PASS",
		},
		diff: "the diff",
		grade: PASSING_FINAL_GRADE,
		instructions: options.instructions ?? "Instructions",
		judgeModel: "sonnet",
		localChecks: {
			evidence: [{ claim: "green", path: "checks", source: "local-checks" }],
			status: "PASS",
		},
		resultSha: "candidate-sha",
		reviewFile,
		rubric: FINAL_RUBRIC,
		rubricIds: ["worker"],
		sessionBudgetUsd: 5,
		sourceRoot: "/tmp/target",
		sourceSha: "source-sha",
		stageScorecards: [scorecard],
		status: options.status ?? "AWAITING_HUMAN_REVIEW",
		timestamp: "2026-09-03T00:00:00.000Z",
	});
}

/**
 * How the Judge ran, as the stage record carries it. A record written before
 * the effort and the budget were recorded carries only the model, so a test
 * that means to read one passes those knobs alone.
 */
interface StageJudgeKnobs {
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd?: number | undefined;
}

const RECORDED_JUDGE_KNOBS: StageJudgeKnobs = {
	judgeEffort: "medium",
	judgeModel: "sonnet",
	sessionBudgetUsd: 5,
};

/**
 * A run that stopped at a stage: no artifact, only the stage's own record,
 * written by `writeStageProgress` with the scorecard's STOP verdict and no
 * calibration. `calibrate` picks the record it completes from what the run
 * left on disk, so this fixture is what makes it pick the stage.
 */
async function writeStoppedStageFixture(
	workspace: Readonly<CliTestWorkspace>,
	judgeKnobs: Readonly<StageJudgeKnobs> = RECORDED_JUDGE_KNOBS,
): Promise<RunFixture> {
	const runsDirectory = await workspace.createDirectory("rehearse-runs-");
	const stageRubricPath = join(runsDirectory, "discuss.json");
	await Bun.write(stageRubricPath, stageRubricText("Scope is explicit"));
	const paths = benchmarkRunPaths(runsDirectory, RUN_NAME);
	const scorecard = new StageScorecardBuilder({ rubricPath: stageRubricPath })
		.withScopeResult({ status: "PASS", verdict: "STOP" })
		.build();
	await Bun.write(
		paths.stageFile("discuss"),
		// JSON.stringify drops an absent budget, which is the pre-card shape.
		JSON.stringify({
			...scorecard,
			corpusFiles: [],
			corpusVersion: { digest: "c".repeat(SHA256_HEX_DIGITS), kind: "version" },
			effort: "medium",
			model: "sonnet",
			...judgeKnobs,
		} satisfies Omit<StageJudgeRecord, "sessionBudgetUsd" | "readManifest"> &
			StageJudgeKnobs),
	);

	return {
		artifactFile: paths.artifactFile,
		reviewFile: paths.reviewFile,
		runsDirectory,
		stageFile: paths.stageFile("discuss"),
		stageRubricPath,
	};
}

async function writeReview(
	reviewFile: string,
	findings: readonly unknown[],
	verdict: "ACCEPT" | "REJECT" = "REJECT",
): Promise<number> {
	return await Bun.write(
		reviewFile,
		JSON.stringify({ findings, summary: "The Judge missed it.", verdict }),
	);
}

export {
	FINAL_RUBRIC,
	RECORDED_JUDGE_KNOBS,
	RUN_NAME,
	writeReview,
	writeRunFixture,
	writeStoppedStageFixture,
};
export type { RunFixture, RunFixtureOptions, StageJudgeKnobs };

export { stageRubricText } from "./calibration-stage-scorecard-test-builder";
