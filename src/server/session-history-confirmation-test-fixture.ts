import { mkdir } from "node:fs/promises";

import {
	sessionConfirmationGroupRecordSchema,
	sessionConfirmationRepRecordSchema,
} from "#benchmark/confirmation-record";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { sessionAttemptRecordSchema } from "#benchmark/session-record";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";
import { historyRunsDirectory } from "#server/session-history-workspace-test-fixture";

const FIRST_CONFIRMATION_REP = 1;

const SECOND_CONFIRMATION_REP = 2;

const CONFIRMATION_IDENTITY = { groupId: "group-a", repId: "group-a-rep-1" };

const GROUP_RECORD = sessionConfirmationGroupRecordSchema.parse({
	approval: { approved: true, method: "yes" },
	caseId: "case-a",
	declaredStages: ["checks"],
	groupId: CONFIRMATION_IDENTITY.groupId,
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
	repRecords: [FIRST_CONFIRMATION_REP, SECOND_CONFIRMATION_REP].map(
		(ordinal) => ({
			ordinal,
			path: `reps/group-a-rep-${String(ordinal)}/rep.json`,
			repId: `group-a-rep-${String(ordinal)}`,
		}),
	),
	reportFile: "report.json",
	reps: 2,
	schemaVersion: 2,
});

const REP_RECORD = sessionConfirmationRepRecordSchema.parse({
	caseId: "case-a",
	elapsedMs: 1,
	finalOutcome: { status: "NOT_APPLICABLE" },
	groupId: CONFIRMATION_IDENTITY.groupId,
	lineage: { kind: "SESSION", lineage: "lineage-a" },
	metrics: { calls: [], missing: ["metrics"], status: "MISSING" },
	mode: "session",
	ordinal: 1,
	outcome: "UNSUCCESSFUL",
	repId: CONFIRMATION_IDENTITY.repId,
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
});

const CONFIRMATION_ATTEMPT_RECORD = sessionAttemptRecordSchema.parse({
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
	transcriptFile: "/outside/must-not-be-read.jsonl",
});

async function writtenConfirmationAttempt(): Promise<{
	readonly runsDirectory: string;
	readonly groupId: string;
	readonly repId: string;
	readonly paths: ReturnType<typeof confirmationGroupPaths>;
}> {
	const runsDirectory = await historyRunsDirectory(
		"rehearse-confirmation-history-",
	);
	const { groupId, repId } = CONFIRMATION_IDENTITY;
	const paths = confirmationGroupPaths(runsDirectory, groupId);
	const repPaths = paths.rep(repId);
	await mkdir(repPaths.directory, { recursive: true });

	await Bun.write(paths.groupFile, `${JSON.stringify(GROUP_RECORD)}\n`);
	await Bun.write(repPaths.recordFile, `${JSON.stringify(REP_RECORD)}\n`);
	await Bun.write(
		repPaths.attemptFile,
		`${JSON.stringify(CONFIRMATION_ATTEMPT_RECORD)}\n`,
	);
	await Bun.write(
		repPaths.transcriptFile,
		`${JSON.stringify({ message: { content: "saved" }, type: "assistant" })}\n`,
	);

	return { groupId, paths, repId, runsDirectory };
}

export { writtenConfirmationAttempt as default };
