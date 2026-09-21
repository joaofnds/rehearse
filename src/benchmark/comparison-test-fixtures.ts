import type {
	ConfirmationGroupRecord,
	ConfirmationRepRecord,
	SessionConfirmationRepRecord,
} from "./confirmation-record";
import {
	confirmationGroupRecordSchema,
	confirmationRepRecordSchema,
	sessionConfirmationGroupRecordSchema,
	sessionConfirmationRepRecordSchema,
} from "./confirmation-record";
import type {
	ComparisonArmEvidence,
	ComparisonEvidence,
} from "./comparison-evidence";
import type {
	ComparisonArm,
	LegacyComparisonReport,
	MultiCaseComparisonReport,
} from "./comparison-record";
import { sessionAttemptRecordV3Schema } from "./session-record";
import type { Immutable } from "./contracts";

type StageFixtureOutcome =
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

export interface RepFixtureOutcomes {
	readonly discussion: StageFixtureOutcome;
	readonly build: StageFixtureOutcome;
	readonly final: FinalFixtureOutcome;
}

function stageOutcome(
	stage: string,
	outcome: StageFixtureOutcome,
): ConfirmationRepRecord["stages"][number] {
	if (outcome === "not-reached") {
		return { stage, status: "NOT_REACHED", reason: "upstream stopped" };
	}
	if (outcome === "error") {
		return { stage, status: "EXECUTION_FAILED", error: "execution failed" };
	}
	if (outcome === "metrics-missing") {
		return { stage, status: "METRICS_MISSING", error: "metrics missing" };
	}

	return {
		stage,
		status: "JUDGED",
		grade: outcome === "pass" ? "A" : "D",
		verdict: outcome === "pass" ? "CONTINUE" : "STOP",
		elapsedMs: 10,
		evidence: {
			resultSha: "e".repeat(40),
			recordFile: `stages/${stage}.json`,
		},
	};
}

function finalOutcome(
	outcome: FinalFixtureOutcome,
): ConfirmationRepRecord["finalOutcome"] {
	if (outcome === "not-reached") {
		return { status: "NOT_REACHED", reason: "upstream stopped" };
	}
	if (outcome === "error") {
		return { status: "EXECUTION_FAILED", error: "execution failed" };
	}
	if (outcome === "metrics-missing") {
		return { status: "METRICS_MISSING", error: "metrics missing" };
	}

	return {
		status: "JUDGED",
		verdict: outcome === "pass" ? "PASS" : "FAIL",
		evidence: {
			resultSha: "e".repeat(40),
			recordFile: "final.json",
		},
	};
}

export interface RepFixtureMeasurements {
	readonly metricScale?: number;
	readonly elapsedMs?: number;
}

export function comparisonRep(
	groupId: string,
	ordinal: number,
	outcomes: Readonly<RepFixtureOutcomes>,
	measurements: Readonly<RepFixtureMeasurements> = {},
): ConfirmationRepRecord {
	const metricScale = measurements.metricScale ?? 1;
	const elapsedMs = measurements.elapsedMs ?? ordinal * 100;
	const successful =
		outcomes.discussion === "pass" &&
		outcomes.build === "pass" &&
		outcomes.final === "pass";

	return confirmationRepRecordSchema.parse({
		schemaVersion: 1,
		groupId,
		repId: `${groupId}-rep-${ordinal}`,
		ordinal,
		mode: "pipeline",
		worktreePath: `/worktrees/${groupId}-rep-${ordinal}`,
		lineage: { kind: "SOURCE", sha: "a".repeat(40) },
		outcome: successful ? "SUCCESSFUL" : "UNSUCCESSFUL",
		stages: [
			stageOutcome("discuss", outcomes.discussion),
			stageOutcome("build", outcomes.build),
		],
		finalOutcome: finalOutcome(outcomes.final),
		metrics: {
			status: "COMPLETE",
			calls: [
				{
					role: "worker",
					metrics: {
						costUsd: ordinal * metricScale,
						inputTokens: ordinal * 10 * metricScale,
						outputTokens: ordinal * 2 * metricScale,
						cacheReadTokens: ordinal * 3 * metricScale,
						cacheWriteTokens: ordinal * 4 * metricScale,
						turns: ordinal * metricScale,
					},
				},
			],
		},
		workerTrajectorySteps: ordinal * metricScale,
		elapsedMs,
	});
}

export const PASS: RepFixtureOutcomes = {
	discussion: "pass",
	build: "pass",
	final: "pass",
};

export const FAIL: RepFixtureOutcomes = {
	discussion: "fail",
	build: "fail",
	final: "fail",
};

export function comparisonReps(
	caseId: string,
	role: ComparisonArm,
	outcomes: readonly RepFixtureOutcomes[],
	measurements: Readonly<RepFixtureMeasurements> = {},
): readonly ConfirmationRepRecord[] {
	return outcomes.map((outcome, index) =>
		comparisonRep(`${caseId}-${role}`, index + 1, outcome, measurements),
	);
}

export function withMissingMetrics(
	record: Immutable<ConfirmationRepRecord>,
	missing: string,
): ConfirmationRepRecord {
	return confirmationRepRecordSchema.parse({
		...record,
		outcome: "UNSUCCESSFUL",
		metrics: { status: "MISSING", calls: [], missing: [missing] },
		workerTrajectorySteps: 0,
	});
}

function reportArmEvidence(
	caseId: string,
	role: ComparisonArm,
	reps: readonly Immutable<ConfirmationRepRecord>[],
): ComparisonArmEvidence {
	const groupId = `${caseId}-${role}`;
	const corpus = {
		kind: "corpus" as const,
		path: "inputs/corpus/SKILL.md",
		sha256: { baseline: "1", candidate: "2", control: "3" }[role].repeat(64),
	};
	const record: ConfirmationGroupRecord = confirmationGroupRecordSchema.parse({
		schemaVersion: 1,
		caseId,
		groupId,
		mode: "pipeline",
		reps: 4,
		declaredStages: ["discuss", "build"],
		inputs: {
			lineage: { kind: "SOURCE", sha: "a".repeat(40) },
			files: [
				corpus,
				{
					kind: "task",
					path: "inputs/task.md",
					sha256: (caseId === "case-1" ? "4" : "5").repeat(64),
				},
			],
			model: "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
			pipelinePath: "pipelines/default.json",
		},
		projectedCost: {
			reps: 4,
			perRepMaximumUsd: 30,
			totalMaximumUsd: 120,
		},
		approval: { method: "yes", approved: true },
		repRecords: reps.map((rep) => ({
			repId: rep.repId,
			ordinal: rep.ordinal,
			path: `reps/${rep.repId}/rep.json`,
		})),
		reportFile: "report.json",
		makespanMs: 400,
	});

	return {
		role,
		declaredCaseId: record.caseId,
		group: {
			path: `groups/${groupId}/group.json`,
			sha256: "6".repeat(64),
			record,
		},
		reps: reps.map((rep) => ({
			path: `groups/${groupId}/reps/${rep.repId}/rep.json`,
			sha256: "7".repeat(64),
			record: rep,
		})),
		executedCorpus: [corpus],
		controlledFiles: record.inputs.files.filter(
			({ kind }) => kind !== "corpus" && kind !== "instructions",
		),
		sourcePaths: [],
	};
}

export function comparisonEvidenceFixture(): ComparisonEvidence {
	const cases = ["case-1", "case-2"].map((caseId) => {
		const baseline = comparisonReps(caseId, "baseline", [
			PASS,
			PASS,
			FAIL,
			FAIL,
		]);
		const candidate = comparisonReps(caseId, "candidate", [
			PASS,
			PASS,
			PASS,
			PASS,
		]);
		const control = comparisonReps(caseId, "control", [FAIL, FAIL, FAIL, FAIL]);

		return {
			caseId,
			arms: {
				baseline: reportArmEvidence(caseId, "baseline", baseline),
				candidate: reportArmEvidence(caseId, "candidate", candidate),
				control: reportArmEvidence(caseId, "control", control),
			},
		};
	});

	return {
		manifest: { path: "/tmp/comparison.json", sha256: "8".repeat(64) },
		cases,
		contract: {
			mode: "pipeline",
			declaredStages: ["discuss", "build"],
			reps: 4,
		},
		sourcePaths: [],
	};
}

export interface SessionRepMeasurements {
	readonly costUsd: number;
	readonly elapsedMs: number;
}

function sessionRep(
	caseId: string,
	role: ComparisonArm,
	ordinal: number,
	measurements: Readonly<SessionRepMeasurements>,
): SessionConfirmationRepRecord {
	const groupId = `${caseId}-${role}`;

	return sessionConfirmationRepRecordSchema.parse({
		schemaVersion: 2,
		caseId,
		groupId,
		repId: `${groupId}-rep-${ordinal}`,
		ordinal,
		mode: "session",
		lineage: { kind: "SESSION", lineage: `lineage-${role}` },
		outcome: "SUCCESSFUL",
		stages: [
			{
				stage: "checks",
				status: "JUDGED",
				grade: "A",
				verdict: "CONTINUE",
				elapsedMs: measurements.elapsedMs,
				evidence: { recordFile: "attempt.json" },
			},
		],
		finalOutcome: { status: "NOT_APPLICABLE" },
		metrics: {
			status: "COMPLETE",
			calls: [
				{
					role: "worker",
					metrics: {
						costUsd: measurements.costUsd,
						inputTokens: 10,
						outputTokens: 2,
						cacheReadTokens: 3,
						cacheWriteTokens: 4,
						turns: 1,
					},
				},
			],
		},
		workerTrajectorySteps: 1,
		elapsedMs: measurements.elapsedMs,
	});
}

function sessionArmEvidence(
	caseId: string,
	role: ComparisonArm,
	reps: readonly Immutable<SessionConfirmationRepRecord>[],
): ComparisonArmEvidence {
	const groupId = `${caseId}-${role}`;
	const corpus = {
		kind: "corpus" as const,
		path: "inputs/corpus/SKILL.md",
		sha256: { baseline: "1", candidate: "2", control: "3" }[role].repeat(64),
	};
	const record = sessionConfirmationGroupRecordSchema.parse({
		schemaVersion: 2,
		caseId,
		groupId,
		mode: "session",
		reps: reps.length,
		declaredStages: ["checks"],
		inputs: {
			lineage: { kind: "SESSION", lineage: `lineage-${role}` },
			files: [
				corpus,
				{ kind: "case", path: "inputs/case.json", sha256: "4".repeat(64) },
			],
			model: "sonnet",
			sessionBudgetUsd: 1,
		},
		projectedCost: {
			reps: reps.length,
			perRepMaximumUsd: 1,
			preflightMaximumUsd: 0,
			totalMaximumUsd: reps.length,
		},
		preflight: { status: "MISSING", missing: "preflight call metrics" },
		approval: { method: "yes", approved: true },
		repRecords: reps.map((rep) => ({
			repId: rep.repId,
			ordinal: rep.ordinal,
			path: `reps/${rep.repId}/rep.json`,
		})),
		reportFile: "report.json",
		makespanMs: 1,
	});

	return {
		role,
		declaredCaseId: record.caseId,
		group: {
			path: `groups/${groupId}/group.json`,
			sha256: "6".repeat(64),
			record,
		},
		reps: reps.map((rep) => ({
			path: `groups/${groupId}/reps/${rep.repId}/rep.json`,
			sha256: "7".repeat(64),
			record: rep,
			attempt: {
				path: `groups/${groupId}/reps/${rep.repId}/attempt.json`,
				sha256: "9".repeat(64),
				record: sessionAttemptRecordV3Schema.parse({
					schemaVersion: 3,
					caseId,
					lineage: `lineage-${role}`,
					model: "sonnet",
					sessionBudgetUsd: 1,
					corpusFiles: [],
					prompt: "reply OK",
					reply: "OK",
					transcriptFile: `reps/${rep.repId}/transcript.jsonl`,
					outcome: "SUCCESSFUL",
					checks: [{ kind: "word-band", status: "PASS", detail: "1 word" }],
					elapsedMs: rep.elapsedMs,
				}),
			},
		})),
		executedCorpus: [corpus],
		controlledFiles: record.inputs.files.filter(
			({ kind }) => kind !== "corpus",
		),
		sourcePaths: [],
	};
}

export function withMissingSessionMetrics(
	record: Immutable<SessionConfirmationRepRecord>,
	missing: string,
): SessionConfirmationRepRecord {
	return sessionConfirmationRepRecordSchema.parse({
		...record,
		outcome: "UNSUCCESSFUL",
		stages: [
			{
				stage: "checks",
				status: "METRICS_MISSING",
				error: missing,
				evidence: { recordFile: "attempt.json" },
			},
		],
		metrics: { status: "MISSING", calls: [], missing: [missing] },
		workerTrajectorySteps: 0,
	});
}

/**
 * One session case whose arms are given their cost and elapsed time directly,
 * so an arm can be built slower than another at identical spend. Deriving both
 * from the rep ordinal, as the pipeline fixture does, makes that pair
 * unconstructible.
 */
export function singleCaseSessionEvidenceFixture(
	measurements: Readonly<
		Record<ComparisonArm, readonly SessionRepMeasurements[]>
	>,
): ComparisonEvidence {
	const caseId = "case-one";
	const arm = (role: ComparisonArm): ComparisonArmEvidence =>
		sessionArmEvidence(
			caseId,
			role,
			measurements[role].map((rep, index) =>
				sessionRep(caseId, role, index + 1, rep),
			),
		);

	return {
		manifest: { path: "/tmp/comparison.json", sha256: "8".repeat(64) },
		cases: [
			{
				caseId,
				arms: {
					baseline: arm("baseline"),
					candidate: arm("candidate"),
					control: arm("control"),
				},
			},
		],
		contract: {
			mode: "session",
			declaredStages: ["checks"],
			reps: measurements.baseline.length,
		},
		sourcePaths: [],
	};
}

type CurrentArmResources =
	MultiCaseComparisonReport["cases"][number]["arms"]["baseline"]["resources"];
type CurrentContrastResources =
	MultiCaseComparisonReport["contrasts"]["candidateMinusBaseline"]["resources"];
type VersionFourReport = Extract<
	LegacyComparisonReport,
	{ readonly schemaVersion: 4; readonly mode: "pipeline" }
>;
type VersionFourArmResources =
	VersionFourReport["cases"][number]["arms"]["baseline"]["resources"];
type VersionFourContrastResources =
	VersionFourReport["contrasts"]["candidateMinusBaseline"]["resources"];

/**
 * What separates a version-4 report's resources from a current one's: the
 * elapsed measurement version 5 added. Tests that build an older report from a
 * current one go through here, so the next measurement to land has one place to
 * teach rather than one per test file.
 */
export function armResourcesWithoutElapsed(
	resources: Immutable<CurrentArmResources>,
): VersionFourArmResources {
	if (resources.status === "UNAVAILABLE") {
		return resources;
	}
	const { elapsedMs: _elapsedMs, ...withoutElapsed } = resources;

	return withoutElapsed;
}

export function contrastResourcesWithoutElapsed(
	resources: Immutable<CurrentContrastResources>,
): VersionFourContrastResources {
	if (resources.status === "UNAVAILABLE") {
		return resources;
	}
	const { elapsedMs: _elapsedMs, ...withoutElapsed } = resources;

	return withoutElapsed;
}

/**
 * Two cases where the candidate wins one and ties the other exactly. The tie
 * contributes a delta of exactly zero, the boundary the disagreement test turns
 * on: zero counts as agreement, so this reads blank rather than as a
 * disagreement, and relaxing the negative side of the test to `<=` reports it
 * as one.
 */
export function flatCaseComparisonEvidenceFixture(): ComparisonEvidence {
	const outcomes = {
		"case-1": {
			baseline: [PASS, PASS, FAIL, FAIL],
			candidate: [PASS, PASS, PASS, PASS],
		},
		"case-2": {
			baseline: [PASS, PASS, FAIL, FAIL],
			candidate: [PASS, PASS, FAIL, FAIL],
		},
	} as const;

	// The control arm outscores the candidate on case-1 and ties it on case-2,
	// so candidate - control carries a negative delta beside the same exact
	// zero. That row is the mirror of candidate - baseline: between them, a
	// zero meets a positive and a negative, which is what pins both sides of
	// the disagreement test.
	const controlOutcomes = {
		"case-1": [PASS, PASS, PASS, PASS],
		"case-2": [PASS, PASS, FAIL, FAIL],
	} as const;

	const cases = (["case-1", "case-2"] as const).map((caseId) => ({
		caseId,
		arms: {
			baseline: reportArmEvidence(
				caseId,
				"baseline",
				comparisonReps(caseId, "baseline", [...outcomes[caseId].baseline]),
			),
			candidate: reportArmEvidence(
				caseId,
				"candidate",
				comparisonReps(caseId, "candidate", [...outcomes[caseId].candidate]),
			),
			control: reportArmEvidence(
				caseId,
				"control",
				comparisonReps(caseId, "control", [...controlOutcomes[caseId]]),
			),
		},
	}));

	return {
		manifest: { path: "/tmp/comparison.json", sha256: "8".repeat(64) },
		cases,
		contract: {
			mode: "pipeline",
			declaredStages: ["discuss", "build"],
			reps: 4,
		},
		sourcePaths: [],
	};
}

/**
 * Two cases whose candidate-minus-baseline deltas cancel: the candidate wins
 * case-1 and loses case-2 by the same margin, so the mean is exactly zero while
 * neither case is null. A report built from this is the shape a mean alone
 * cannot describe.
 */
export function cancellingComparisonEvidenceFixture(): ComparisonEvidence {
	const outcomes = {
		"case-1": {
			baseline: [PASS, PASS, FAIL, FAIL],
			candidate: [PASS, PASS, PASS, PASS],
		},
		"case-2": {
			baseline: [PASS, PASS, PASS, PASS],
			candidate: [PASS, PASS, FAIL, FAIL],
		},
	} as const;

	// Distinct scales per case and arm, so the cost deltas differ between the
	// two cases and their standard error is not zero. A fixture whose arms cost
	// the same cannot tell a real spread from a constant.
	const scales = {
		"case-1": { baseline: 1, candidate: 3, control: 2 },
		"case-2": { baseline: 1, candidate: 2, control: 4 },
	} as const;

	const cases = (["case-1", "case-2"] as const).map((caseId) => {
		const baseline = comparisonReps(
			caseId,
			"baseline",
			[...outcomes[caseId].baseline],
			{ metricScale: scales[caseId].baseline },
		);
		const candidate = comparisonReps(
			caseId,
			"candidate",
			[...outcomes[caseId].candidate],
			{ metricScale: scales[caseId].candidate },
		);
		const control = comparisonReps(
			caseId,
			"control",
			[FAIL, FAIL, FAIL, FAIL],
			{ metricScale: scales[caseId].control },
		);

		return {
			caseId,
			arms: {
				baseline: reportArmEvidence(caseId, "baseline", baseline),
				candidate: reportArmEvidence(caseId, "candidate", candidate),
				control: reportArmEvidence(caseId, "control", control),
			},
		};
	});

	return {
		manifest: { path: "/tmp/comparison.json", sha256: "8".repeat(64) },
		cases,
		contract: {
			mode: "pipeline",
			declaredStages: ["discuss", "build"],
			reps: 4,
		},
		sourcePaths: [],
	};
}
