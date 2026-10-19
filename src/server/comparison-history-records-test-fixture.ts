import {
	sessionConfirmationGroupRecordSchema,
	sessionConfirmationRepRecordSchema,
} from "#benchmark/confirmation-record";
import SessionConfirmationGroupBuilder from "#benchmark/session-confirmation-group-test-builder";
import SessionConfirmationRepBuilder from "#benchmark/session-confirmation-rep-test-builder";
import { sessionAttemptRecordSchema } from "#benchmark/session-record";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";
import SavedSessionRecordBuilder from "#server/saved-session-record-test-builder";

const groupRecord = new SessionConfirmationGroupBuilder({
	approval: { approved: true, method: "yes" },
	caseId: "case-a",
	declaredStages: ["checks"],
	groupId: "group-a",
	inputs: {
		files: [
			{
				kind: "case",
				path: "inputs/case.json",
				sha256: "a".repeat(SHA256_HEX_DIGITS),
			},
		],
		lineage: { kind: "SESSION", lineage: "lineage-a" },
		model: "sonnet",
		sessionBudgetUsd: 1,
	},
	makespanMs: 1,
	mode: "session",
	preflight: { missing: "metrics unavailable", status: "MISSING" },
	projectedCost: {
		perRepMaximumUsd: 1,
		preflightMaximumUsd: 0,
		reps: 2,
		totalMaximumUsd: 2,
	},
	repRecords: [{ ordinal: 1 }, { ordinal: 2 }].map(({ ordinal }) => ({
		ordinal,
		path: `reps/group-a-rep-${ordinal}/rep.json`,
		repId: `group-a-rep-${ordinal}`,
	})),
	reportFile: "report.json",
	reps: 2,
	schemaVersion: 2,
}).build();
const groupText = `${JSON.stringify(sessionConfirmationGroupRecordSchema.parse(groupRecord))}\n`;

const repRecord = new SessionConfirmationRepBuilder({
	caseId: "case-a",
	elapsedMs: 1,
	finalOutcome: { status: "NOT_APPLICABLE" },
	groupId: "group-a",
	lineage: { kind: "SESSION", lineage: "lineage-a" },
	metrics: { calls: [], missing: ["metrics"], status: "MISSING" },
	mode: "session",
	ordinal: 1,
	outcome: "UNSUCCESSFUL",
	repId: "group-a-rep-1",
	schemaVersion: 2,
	stages: [
		{
			evidence: { recordFile: "attempt.json" },
			reason: "not reached",
			stage: "checks",
			status: "NOT_REACHED",
		},
	],
	workerTrajectorySteps: 0,
}).build();
const repText = `${JSON.stringify(sessionConfirmationRepRecordSchema.parse(repRecord))}\n`;

const attemptRecord = new SavedSessionRecordBuilder({
	caseId: "case-a",
	checks: [{ detail: "pass", kind: "word-band", status: "PASS" }],
	corpusFiles: [],
	elapsedMs: 1,
	lineage: "lineage-a",
	model: "sonnet",
	outcome: "SUCCESSFUL",
	prompt: "inspect",
	reply: "done",
	schemaVersion: 1,
	sessionBudgetUsd: 1,
	transcriptDiagnostics: undefined,
	transcriptFile: "ignored",
}).build();
const attemptText = `${JSON.stringify(sessionAttemptRecordSchema.parse(attemptRecord))}\n`;

export { groupText, repText, attemptText };
