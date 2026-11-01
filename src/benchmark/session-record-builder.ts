import { sessionSettingsDigest } from "./session-lineage";
import type {
	MutableSessionAttemptRecord,
	SessionAttemptRecordInputs,
} from "./session-record-builder-contract";
import {
	declaredSessionContext,
	recordContext,
	recordedReadManifest,
} from "./session-record-context";
import {
	EXECUTION_FAILURE_SESSION_SCHEMA_VERSION,
	STATE_GRADING_SESSION_SCHEMA_VERSION,
} from "./session-record-context-schema";
import { writableSessionAttemptRecordSchema } from "./session-record-schema";
import type { SessionAttemptRecord } from "./session-record-schema";
import { transcriptDiagnosticsSchema } from "./transcript";

function buildSessionAttemptRecord(
	inputs: Readonly<SessionAttemptRecordInputs>,
): SessionAttemptRecord {
	const declared = declaredSessionContext(inputs.sessionCase);
	return writableSessionAttemptRecordSchema.parse({
		...sessionRecordBase(inputs, declared),
		...recordSettings(inputs),
		...recordResponse(inputs),
		...recordState(inputs),
		...recordContext(inputs, declared),
	});
}

function sessionRecordBase(
	inputs: Readonly<SessionAttemptRecordInputs>,
	declared: Readonly<ReturnType<typeof declaredSessionContext>>,
): MutableSessionAttemptRecord {
	const { attempt, sessionCase, settings } = inputs;
	return {
		caseId: sessionCase.declaration.id,
		checks: attempt.checks.map((check) => ({ ...check })),
		corpusDelivery: attempt.corpusDelivery,
		corpusFiles: inputs.corpusFiles.map((file) => ({ ...file })),
		corpusOrigin: inputs.corpusOrigin,
		corpusVersion: { ...inputs.corpusVersion },
		elapsedMs: inputs.elapsedMs,
		judge: attempt.judge,
		lineage: inputs.lineage,
		model: settings.model,
		outcome: attempt.outcome,
		prompt: sessionCase.prompt,
		readManifest: recordedReadManifest(inputs, declared),
		schemaVersion:
			attempt.outcome === "EXECUTION_FAILED"
				? EXECUTION_FAILURE_SESSION_SCHEMA_VERSION
				: STATE_GRADING_SESSION_SCHEMA_VERSION,
		sessionBudgetUsd: settings.budgetUsd,
		setup: attempt.setup,
		spendCeilingUsd: inputs.spendCeilingUsd,
		startedAt: inputs.startedAt,
		transcriptDiagnostics: transcriptDiagnosticsSchema.parse(
			attempt.transcriptDiagnostics,
		),
		transcriptFile: attempt.transcriptFile,
	};
}

function recordSettings(
	inputs: Readonly<SessionAttemptRecordInputs>,
): Pick<MutableSessionAttemptRecord, "settingsDigest" | "effort"> {
	const { sessionCase, settings } = inputs;
	const record: Pick<MutableSessionAttemptRecord, "settingsDigest" | "effort"> =
		{};

	const settingsDigest = sessionSettingsDigest(sessionCase);
	if (settingsDigest !== undefined) {
		record.settingsDigest = settingsDigest;
	}
	if (settings.effort !== undefined) {
		record.effort = settings.effort;
	}

	return record;
}

function recordResponse(
	inputs: Readonly<SessionAttemptRecordInputs>,
): Pick<MutableSessionAttemptRecord, "reply" | "error" | "metrics"> {
	const { attempt } = inputs;
	const record: Pick<
		MutableSessionAttemptRecord,
		"reply" | "error" | "metrics"
	> = {};

	if (attempt.reply !== undefined) {
		record.reply = attempt.reply;
	}
	if (inputs.error !== undefined) {
		record.error = inputs.error;
	}
	if (attempt.metrics !== undefined) {
		record.metrics = { ...attempt.metrics };
	}

	return record;
}

function recordState(
	inputs: Readonly<SessionAttemptRecordInputs>,
): Pick<
	MutableSessionAttemptRecord,
	"stateResults" | "unavailableSubagents" | "stateGradingError"
> {
	const { attempt } = inputs;
	const record: Pick<
		MutableSessionAttemptRecord,
		"stateResults" | "unavailableSubagents" | "stateGradingError"
	> = {};

	if (attempt.stateResults !== undefined) {
		record.stateResults = attempt.stateResults.map((result) => ({ ...result }));
	}
	if (attempt.unavailableSubagents !== undefined) {
		record.unavailableSubagents = [...attempt.unavailableSubagents];
	}
	if (attempt.stateGradingError !== undefined) {
		record.stateGradingError = attempt.stateGradingError;
	}

	return record;
}

export { buildSessionAttemptRecord as default };
