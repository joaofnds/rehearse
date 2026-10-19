import type {
	ComparisonArmEvidence,
	ComparisonEvidence,
} from "./comparison-evidence";
import { SHA256_HEX_CHARACTERS } from "./comparison-evidence-record-test-fixtures";
import type { ComparisonArm } from "./comparison-record";
import { ORDINAL_BASE } from "./comparison-test-fixtures";
import type {
	SessionConfirmationGroupRecord,
	SessionConfirmationRepRecord,
} from "./confirmation-record";
import {
	sessionConfirmationGroupRecordSchema,
	sessionConfirmationRepRecordSchema,
} from "./confirmation-record";
import type { Immutable } from "./contracts";
import type { SessionAttemptRecordV3 } from "./session-record";
import { sessionAttemptRecordV3Schema } from "./session-record";

interface SessionRepMeasurements {
	readonly costUsd: number;
	readonly elapsedMs: number;
}

interface SessionRepIdentity {
	readonly caseId: string;
	readonly role: ComparisonArm;
	readonly ordinal: number;
}

function sessionAttempt(
	caseId: string,
	role: ComparisonArm,
	rep: Immutable<SessionConfirmationRepRecord>,
): SessionAttemptRecordV3 {
	return sessionAttemptRecordV3Schema.parse({
		caseId,
		checks: [{ detail: "1 word", kind: "word-band", status: "PASS" }],
		corpusFiles: [],
		elapsedMs: rep.elapsedMs,
		lineage: `lineage-${role}`,
		model: "sonnet",
		outcome: "SUCCESSFUL",
		prompt: "reply OK",
		reply: "OK",
		schemaVersion: 3,
		sessionBudgetUsd: 1,
		transcriptFile: `reps/${rep.repId}/transcript.jsonl`,
	});
}

function sessionGroupRecord(
	{ caseId, role }: Omit<SessionRepIdentity, "ordinal">,
	corpus: ComparisonArmEvidence["executedCorpus"][number],
	reps: readonly Immutable<SessionConfirmationRepRecord>[],
): SessionConfirmationGroupRecord {
	const groupId = `${caseId}-${role}`;
	return sessionConfirmationGroupRecordSchema.parse({
		approval: { approved: true, method: "yes" },
		caseId,
		declaredStages: ["checks"],
		groupId,
		inputs: {
			files: [
				corpus,
				{
					kind: "case",
					path: "inputs/case.json",
					sha256: "4".repeat(SHA256_HEX_CHARACTERS),
				},
			],
			lineage: { kind: "SESSION", lineage: `lineage-${role}` },
			model: "sonnet",
			sessionBudgetUsd: 1,
		},
		makespanMs: 1,
		mode: "session",
		preflight: { missing: "preflight call metrics", status: "MISSING" },
		projectedCost: {
			perRepMaximumUsd: 1,
			preflightMaximumUsd: 0,
			reps: reps.length,
			totalMaximumUsd: reps.length,
		},
		repRecords: reps.map((rep) => ({
			ordinal: rep.ordinal,
			path: `reps/${rep.repId}/rep.json`,
			repId: rep.repId,
		})),
		reportFile: "report.json",
		reps: reps.length,
		schemaVersion: 2,
	});
}

function sessionRep(
	{ caseId, role, ordinal }: SessionRepIdentity,
	measurements: Readonly<SessionRepMeasurements>,
): SessionConfirmationRepRecord {
	const groupId = `${caseId}-${role}`;

	return sessionConfirmationRepRecordSchema.parse({
		caseId,
		elapsedMs: measurements.elapsedMs,
		finalOutcome: { status: "NOT_APPLICABLE" },
		groupId,
		lineage: { kind: "SESSION", lineage: `lineage-${role}` },
		metrics: {
			calls: [
				{
					metrics: {
						cacheReadTokens: 3,
						cacheWriteTokens: 4,
						costUsd: measurements.costUsd,
						inputTokens: 10,
						outputTokens: 2,
						turns: 1,
					},
					role: "worker",
				},
			],
			status: "COMPLETE",
		},
		mode: "session",
		ordinal,
		outcome: "SUCCESSFUL",
		repId: `${groupId}-rep-${ordinal}`,
		schemaVersion: 2,
		stages: [
			{
				elapsedMs: measurements.elapsedMs,
				evidence: { recordFile: "attempt.json" },
				grade: "A",
				stage: "checks",
				status: "JUDGED",
				verdict: "CONTINUE",
			},
		],
		workerTrajectorySteps: 1,
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
		sha256: { baseline: "1", candidate: "2", control: "3" }[role].repeat(
			SHA256_HEX_CHARACTERS,
		),
	};
	const record = sessionGroupRecord({ caseId, role }, corpus, reps);

	const group = {
		path: `groups/${groupId}/group.json`,
		record,
		sha256: "6".repeat(SHA256_HEX_CHARACTERS),
	};

	return {
		controlledFiles: record.inputs.files.filter(
			({ kind }) => kind !== "corpus",
		),
		declaredCaseId: record.caseId,
		executedCorpus: [corpus],
		group,
		groups: [group],
		reps: reps.map((rep) => ({
			attempt: {
				path: `groups/${groupId}/reps/${rep.repId}/attempt.json`,
				record: sessionAttempt(caseId, role, rep),
				sha256: "9".repeat(SHA256_HEX_CHARACTERS),
			},
			path: `groups/${groupId}/reps/${rep.repId}/rep.json`,
			record: rep,
			sha256: "7".repeat(SHA256_HEX_CHARACTERS),
		})),
		role,
		sourcePaths: [],
	};
}

function withMissingSessionMetrics(
	record: Immutable<SessionConfirmationRepRecord>,
	missing: string,
): SessionConfirmationRepRecord {
	return sessionConfirmationRepRecordSchema.parse({
		...record,
		metrics: { calls: [], missing: [missing], status: "MISSING" },
		outcome: "UNSUCCESSFUL",
		stages: [
			{
				error: missing,
				evidence: { recordFile: "attempt.json" },
				stage: "checks",
				status: "METRICS_MISSING",
			},
		],
		workerTrajectorySteps: 0,
	});
}

/**
 * One session case whose arms are given their cost and elapsed time directly,
 * so an arm can be built slower than another at identical spend. Deriving both
 * from the rep ordinal, as the pipeline fixture does, makes that pair
 * unconstructible.
 */
function singleCaseSessionEvidenceFixture(
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
				sessionRep({ caseId, ordinal: index + ORDINAL_BASE, role }, rep),
			),
		);

	return {
		cases: [
			{
				arms: {
					baseline: arm("baseline"),
					candidate: arm("candidate"),
					control: arm("control"),
				},
				caseId,
			},
		],
		contract: {
			declaredStages: ["checks"],
			mode: "session",
			reps: measurements.baseline.length,
		},
		manifest: {
			path: "/tmp/comparison.json",
			sha256: "8".repeat(SHA256_HEX_CHARACTERS),
		},
		sourcePaths: [],
	};
}

export {
	singleCaseSessionEvidenceFixture,
	withMissingSessionMetrics,
	type SessionRepMeasurements,
};
