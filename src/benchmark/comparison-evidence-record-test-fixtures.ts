import { createHash } from "node:crypto";

import type { ComparisonArm } from "./comparison-record";
import type { StageGradingRecord } from "./comparison-stage-grading";
import type {
	ConfirmationGroupRecord,
	ConfirmationRepRecord,
} from "./confirmation-record";
import {
	confirmationGroupRecordSchema,
	confirmationRepRecordSchema,
} from "./confirmation-record";
import type { Immutable } from "./contracts";

const SHA256_HEX_CHARACTERS = 64;

const FIRST_REP_ORDINAL = 1;

const REP_CACHE_READ_TOKEN_UNIT = 3;

const REP_CACHE_WRITE_TOKEN_UNIT = 4;

const REP_ELAPSED_MS_UNIT = 100;

const REP_INPUT_TOKEN_UNIT = 10;

const REP_OUTPUT_TOKEN_UNIT = 2;

const GIT_SHA_HEX_CHARACTERS = 40;

const ARTIFACT_PADDING = {
	baseline: 4,
	candidate: 0,
	control: 1,
} as const satisfies Readonly<Record<ComparisonArm, number>>;

interface StageGroupRecords {
	readonly caseId: string;
	readonly groupId: string;
	readonly files: ConfirmationGroupRecord["inputs"]["files"];
	readonly repRecords: ConfirmationGroupRecord["repRecords"];
}

function comparisonStageMetrics(
	ordinal: number,
): ConfirmationRepRecord["metrics"] {
	return {
		calls: [
			{
				metrics: {
					cacheReadTokens: ordinal * REP_CACHE_READ_TOKEN_UNIT,
					cacheWriteTokens: ordinal * REP_CACHE_WRITE_TOKEN_UNIT,
					costUsd: ordinal,
					inputTokens: ordinal * REP_INPUT_TOKEN_UNIT,
					outputTokens: ordinal * REP_OUTPUT_TOKEN_UNIT,
					turns: ordinal,
				},
				role: "worker",
			},
		],
		status: "COMPLETE",
	};
}

function lineage(caseId: string): ConfirmationGroupRecord["inputs"]["lineage"] {
	return {
		kind: "CHECKPOINT",
		lineage: `${caseId}-checkpoint`,
		targetSha: (caseId === "case-1" ? "a" : "b").repeat(GIT_SHA_HEX_CHARACTERS),
	};
}

/**
 * The build stage's scorecard: the baseline arm, stripped of the skill
 * under test, fires the scope blocker that the corpus arms clear. Its plan
 * runs longest, so a reading that mixed arms up would show.
 */
function comparisonBuildScorecard(
	role: ComparisonArm,
	ordinal: number,
): StageGradingRecord {
	const padding = " detail".repeat(
		ARTIFACT_PADDING[role] + ordinal - FIRST_REP_ORDINAL,
	);

	return {
		grade: {
			dimensions: [{ grade: role === "baseline" ? "C" : "A", id: "clarity" }],
			grade: "A",
			hardBlockers: [
				{
					id: "scope-declared",
					status: role === "baseline" ? "FAIL" : "PASS",
				},
			],
			verdict: "CONTINUE",
		},
		input: {
			artifact: { content: `${role} build plan${padding}`, path: "plan.md" },
		},
		judgeContractSha256: "a".repeat(SHA256_HEX_CHARACTERS),
		stage: "build",
	};
}

function repRecord(
	caseId: string,
	groupId: string,
	ordinal: number,
): ConfirmationRepRecord {
	const repId = `${groupId}-rep-${ordinal}`;
	const resultEvidence = {
		recordFile: "stages/build.json",
		resultSha: "e".repeat(GIT_SHA_HEX_CHARACTERS),
	};

	return confirmationRepRecordSchema.parse({
		caseId,
		elapsedMs: ordinal * REP_ELAPSED_MS_UNIT,
		finalOutcome: { status: "NOT_APPLICABLE" },
		groupId,
		lineage: lineage(caseId),
		metrics: comparisonStageMetrics(ordinal),
		mode: "stage",
		ordinal,
		outcome: "SUCCESSFUL",
		repId,
		schemaVersion: 1,
		stages: [
			{
				elapsedMs: 10,
				evidence: resultEvidence,
				grade: "A",
				judgeContractSha256: "a".repeat(SHA256_HEX_CHARACTERS),
				stage: "build",
				status: "JUDGED",
				verdict: "CONTINUE",
			},
		],
		workerTrajectorySteps: ordinal,
		worktreePath: `/worktrees/${repId}`,
	});
}

function digest(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function comparisonStageGroup({
	caseId,
	groupId,
	files,
	repRecords,
}: Immutable<StageGroupRecords>): ConfirmationGroupRecord {
	return confirmationGroupRecordSchema.parse({
		approval: { approved: true, method: "yes" },
		caseId,
		declaredStages: ["build"],
		groupId,
		inputs: {
			corpusDelivery: { redirected: 0, rule: 1 },
			effort: "medium",
			files,
			inheritedConfiguration: [],
			judgeContractSha256: "a".repeat(SHA256_HEX_CHARACTERS),
			judgeEffort: "medium",
			judgeModel: "opus",
			lineage: lineage(caseId),
			model: "sonnet",
			pipelinePath: "pipelines/default.json",
			sessionBudgetUsd: 5,
			setup: "actual",
		},
		makespanMs: 200,
		mode: "stage",
		projectedCost: {
			perRepMaximumUsd: 20,
			reps: 2,
			totalMaximumUsd: 40,
		},
		repRecords,
		reportFile: "report.json",
		reps: 2,
		schemaVersion: 1,
	});
}

export {
	comparisonBuildScorecard,
	comparisonStageGroup,
	digest,
	lineage,
	repRecord,
	SHA256_HEX_CHARACTERS,
};
