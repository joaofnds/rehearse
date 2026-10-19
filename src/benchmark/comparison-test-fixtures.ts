import type { ComparisonArm } from "./comparison-record";
import type { ConfirmationRepRecord } from "./confirmation-record";
import { confirmationRepRecordSchema } from "./confirmation-record";
import type { Immutable, StageLetterGrade } from "./contracts";

const ORDINAL_BASE = 1;

const IDENTITY_METRIC_SCALE = 1;

const REP_CACHE_READ_TOKEN_UNIT = 3;

const REP_CACHE_WRITE_TOKEN_UNIT = 4;

const REP_ELAPSED_MS_UNIT = 100;

const REP_INPUT_TOKEN_UNIT = 10;

const REP_OUTPUT_TOKEN_UNIT = 2;

const GIT_SHA_HEX_CHARACTERS = 40;

type StageFixtureOutcome =
	| StageLetterGrade
	| "pass"
	| "fail"
	| "error"
	| "metrics-missing"
	| "not-reached";

type FinalFixtureOutcome =
	| "pass"
	| "fail"
	| "error"
	| "metrics-missing"
	| "not-reached";

interface RepFixtureOutcomes {
	readonly discussion: StageFixtureOutcome;
	readonly build: StageFixtureOutcome;
	readonly final: FinalFixtureOutcome;
}

interface RepFixtureMeasurements {
	readonly metricScale?: number;
	readonly elapsedMs?: number;
}

interface ComparisonRepResult {
	readonly outcomes: Readonly<RepFixtureOutcomes>;
	readonly measurements?: Readonly<RepFixtureMeasurements> | undefined;
}

const PASS: RepFixtureOutcomes = {
	build: "pass",
	discussion: "pass",
	final: "pass",
};

const FAIL: RepFixtureOutcomes = {
	build: "fail",
	discussion: "fail",
	final: "fail",
};

interface ComparisonRepResults {
	readonly outcomes: readonly RepFixtureOutcomes[];
	readonly measurements?: Readonly<RepFixtureMeasurements> | undefined;
}

function stageOutcome(
	stage: string,
	outcome: StageFixtureOutcome,
): ConfirmationRepRecord["stages"][number] {
	if (outcome === "not-reached") {
		return { reason: "upstream stopped", stage, status: "NOT_REACHED" };
	}
	if (outcome === "error") {
		return { error: "execution failed", stage, status: "EXECUTION_FAILED" };
	}
	if (outcome === "metrics-missing") {
		return { error: "metrics missing", stage, status: "METRICS_MISSING" };
	}

	if (outcome === "pass" || outcome === "fail") {
		return judgedStage(stage, outcome === "pass" ? "A" : "D", outcome);
	}

	return judgedStage(stage, outcome, "pass");
}

function judgedStage(
	stage: string,
	grade: StageLetterGrade,
	outcome: "pass" | "fail",
): ConfirmationRepRecord["stages"][number] {
	return {
		elapsedMs: 10,
		evidence: {
			recordFile: `stages/${stage}.json`,
			resultSha: "e".repeat(GIT_SHA_HEX_CHARACTERS),
		},
		grade,
		stage,
		status: "JUDGED",
		verdict: outcome === "pass" ? "CONTINUE" : "STOP",
	};
}

function finalOutcome(
	outcome: FinalFixtureOutcome,
): ConfirmationRepRecord["finalOutcome"] {
	if (outcome === "not-reached") {
		return { reason: "upstream stopped", status: "NOT_REACHED" };
	}
	if (outcome === "error") {
		return { error: "execution failed", status: "EXECUTION_FAILED" };
	}
	if (outcome === "metrics-missing") {
		return { error: "metrics missing", status: "METRICS_MISSING" };
	}

	return {
		evidence: {
			recordFile: "final.json",
			resultSha: "e".repeat(GIT_SHA_HEX_CHARACTERS),
		},
		status: "JUDGED",
		verdict: outcome === "pass" ? "PASS" : "FAIL",
	};
}

function comparisonRep(
	groupId: string,
	ordinal: number,
	{ outcomes, measurements = {} }: ComparisonRepResult,
): ConfirmationRepRecord {
	const metricScale = measurements.metricScale ?? IDENTITY_METRIC_SCALE;
	const elapsedMs = measurements.elapsedMs ?? ordinal * REP_ELAPSED_MS_UNIT;
	const successful =
		outcomes.discussion === "pass" &&
		outcomes.build === "pass" &&
		outcomes.final === "pass";

	return confirmationRepRecordSchema.parse({
		elapsedMs,
		finalOutcome: finalOutcome(outcomes.final),
		groupId,
		lineage: { kind: "SOURCE", sha: "a".repeat(GIT_SHA_HEX_CHARACTERS) },
		metrics: {
			calls: [
				{
					metrics: {
						cacheReadTokens: ordinal * REP_CACHE_READ_TOKEN_UNIT * metricScale,
						cacheWriteTokens:
							ordinal * REP_CACHE_WRITE_TOKEN_UNIT * metricScale,
						costUsd: ordinal * metricScale,
						inputTokens: ordinal * REP_INPUT_TOKEN_UNIT * metricScale,
						outputTokens: ordinal * REP_OUTPUT_TOKEN_UNIT * metricScale,
						turns: ordinal * metricScale,
					},
					role: "worker",
				},
			],
			status: "COMPLETE",
		},
		mode: "pipeline",
		ordinal,
		outcome: successful ? "SUCCESSFUL" : "UNSUCCESSFUL",
		repId: `${groupId}-rep-${ordinal}`,
		schemaVersion: 1,
		stages: [
			stageOutcome("discuss", outcomes.discussion),
			stageOutcome("build", outcomes.build),
		],
		workerTrajectorySteps: ordinal * metricScale,
		worktreePath: `/worktrees/${groupId}-rep-${ordinal}`,
	});
}

function comparisonReps(
	caseId: string,
	role: ComparisonArm,
	{ outcomes, measurements = {} }: ComparisonRepResults,
): readonly ConfirmationRepRecord[] {
	return outcomes.map((outcome, index) =>
		comparisonRep(`${caseId}-${role}`, index + ORDINAL_BASE, {
			measurements,
			outcomes: outcome,
		}),
	);
}

function withMissingMetrics(
	record: Immutable<ConfirmationRepRecord>,
	missing: string,
): ConfirmationRepRecord {
	return confirmationRepRecordSchema.parse({
		...record,
		metrics: { calls: [], missing: [missing], status: "MISSING" },
		outcome: "UNSUCCESSFUL",
		workerTrajectorySteps: 0,
	});
}

export {
	comparisonRep,
	comparisonReps,
	FAIL,
	finalOutcome,
	GIT_SHA_HEX_CHARACTERS,
	ORDINAL_BASE,
	PASS,
	withMissingMetrics,
	type ComparisonRepResults,
	type RepFixtureMeasurements,
	type RepFixtureOutcomes,
};
