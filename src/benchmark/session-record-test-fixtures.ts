import type { SessionCase } from "#benchmark/case";
import type { Immutable } from "#benchmark/contracts";
import type { SessionAttempt } from "#benchmark/session-attempt";

import type { JsonObject } from "./json-value";
import type {
	LegacySessionAttemptRecord,
	SessionAttemptRecord,
	SessionAttemptRecordInputs,
} from "./session-record";

const SESSION_SCHEMA_VERSION = 2;

const FIRST_VALIDATION_ISSUE_INDEX = 0;

const FIRST_RECORDED_DIVERGENCE_INDEX = 0;

const FIRST_CONTEXT_MANIFEST_PATH_INDEX = 0;

const SECOND_CONTEXT_MANIFEST_PATH_INDEX = 1;

const EXECUTION_FAILURE_SESSION_RECORD_VERSION = 2;

const STATE_GRADING_SESSION_RECORD_VERSION = 3;

const LEGACY_SESSION_RECORD_VERSION = 1;

const SHA256_HEX_CHARACTERS = 64;

const GIT_SHA_HEX_CHARACTERS = 40;

const MEASURED_VERSION = {
	digest: "a".repeat(SHA256_HEX_CHARACTERS),
	kind: "version",
} as const;

const STARTED_AT = "2026-10-08T10:15:00.000Z";

function record(
	overrides: Immutable<Partial<LegacySessionAttemptRecord>> = {},
): Immutable<LegacySessionAttemptRecord> {
	return {
		caseId: "smoke",
		checks: [{ detail: "1 word", kind: "word-band", status: "PASS" }],
		corpusFiles: [],
		elapsedMs: 900,
		lineage: "a".repeat(SHA256_HEX_CHARACTERS),
		model: "haiku",
		outcome: "SUCCESSFUL",
		prompt: "Reply with the single word OK.",
		reply: "OK",
		schemaVersion: 1,
		sessionBudgetUsd: 0.2,
		transcriptFile: "/runs/transcript.jsonl",
		...overrides,
	};
}

function withoutReply(
	overrides: Immutable<Partial<LegacySessionAttemptRecord>> = {},
): Omit<Immutable<LegacySessionAttemptRecord>, "reply"> {
	const { reply: _dropped, ...rest } = record(overrides);

	return rest;
}

function smokeCase(): SessionCase {
	return {
		agents: undefined,
		checks: [{ kind: "word-band", max: 1 }],
		corpusFiles: [],
		declaration: {
			checks: [{ kind: "word-band", max: 1 }],
			corpusFiles: [],
			id: "smoke",
			kind: "session",
			projectFiles: [],
			prompt: "Reply with the single word OK.",
			title: "Smoke",
			tools: [],
		},
		fixturePath: undefined,
		isolated: false,
		kind: "session",
		projectFiles: [],
		prompt: "Reply with the single word OK.",
		settings: undefined,
		tools: [],
		transcriptPath: undefined,
	};
}

function smokeAttempt(): SessionAttempt {
	return {
		attemptDirectory: "/runs/attempt",
		checks: [{ detail: "1 word", kind: "word-band", status: "PASS" }],
		contextManifest: undefined,
		metrics: undefined,
		outcome: "SUCCESSFUL",
		reply: "OK",
		setup: { kind: "isolated" },
		transcriptDiagnostics: {
			issues: [],
			measuredLineCount: 1,
			prefixLinesExcluded: 0,
			repeatedBashCommands: [],
			sourceLineCount: 1,
			state: "complete",
			toolErrors: [],
			toolUseOccurrences: { byName: [], total: 0 },
		},
		transcriptFile: "/runs/transcript.jsonl",
	};
}

function recordInputs(
	overrides: Partial<SessionAttemptRecordInputs> = {},
): SessionAttemptRecordInputs {
	return {
		attempt: smokeAttempt(),
		corpusFiles: [],
		corpusOrigin: { kind: "live" },
		corpusVersion: MEASURED_VERSION,
		elapsedMs: 1,
		lineage: "b".repeat(SHA256_HEX_CHARACTERS),
		sessionCase: smokeCase(),
		settings: { budgetUsd: 0.2, model: "haiku" },
		spendCeilingUsd: 7.5,
		startedAt: STARTED_AT,
		versionFiles: [],
		...overrides,
	};
}

function sessionCaseWithContext(
	corpusFiles: readonly string[],
	projectFiles: readonly string[],
	prompt: string,
): SessionCase {
	const base = smokeCase();
	return {
		...base,
		corpusFiles,
		declaration: { ...base.declaration, corpusFiles, projectFiles, prompt },
		projectFiles,
		prompt,
	};
}

function failedRecord(): Immutable<
	Extract<
		SessionAttemptRecord,
		{ schemaVersion: typeof EXECUTION_FAILURE_SESSION_RECORD_VERSION }
	>
> {
	const {
		reply: _reply,
		contextManifest: _contextManifest,
		divergences: _divergences,
		...base
	} = record();

	return {
		...base,
		checks: [],
		error: "provider rejected the call",
		outcome: "EXECUTION_FAILED" as const,
		schemaVersion: SESSION_SCHEMA_VERSION,
	};
}

const savedAttempts: readonly {
	readonly name: string;
	readonly schemaVersion:
		| typeof LEGACY_SESSION_RECORD_VERSION
		| typeof STATE_GRADING_SESSION_RECORD_VERSION;
}[] = [
	{ name: "v1-successful.json", schemaVersion: 1 },
	{ name: "v1-successful-with-manifest.json", schemaVersion: 1 },
	{ name: "v1-unsuccessful.json", schemaVersion: 1 },
	{ name: "v1-unsuccessful-with-manifest.json", schemaVersion: 1 },
	{ name: "v3-successful-with-manifest.json", schemaVersion: 3 },
];

function startedAttemptInputs(
	attempt: Immutable<SessionAttempt>,
): SessionAttemptRecordInputs {
	return recordInputs({
		attempt,
		elapsedMs: 123,
		error:
			attempt.outcome === "EXECUTION_FAILED" ? "claude exited 1" : undefined,
		settings: { budgetUsd: 0.2, effort: "low", model: "haiku" },
		startedAt: "2026-10-08T10:15:00.000Z",
	});
}

function noReplyAttempt(
	grade: Immutable<Partial<SessionAttempt>>,
): SessionAttempt {
	return {
		...smokeAttempt(),
		checks: [],
		contextManifest: undefined,
		outcome: "NO_REPLY",
		reply: undefined,
		...grade,
	};
}

function stateAttemptInputs(
	grade: Immutable<Partial<SessionAttempt>>,
): SessionAttemptRecordInputs {
	return recordInputs({
		attempt: noReplyAttempt(grade),
		elapsedMs: 123,
		settings: { budgetUsd: 0.2, effort: "low", model: "haiku" },
	});
}

function subagentAttemptInputs(
	attempt: Immutable<Partial<SessionAttempt>>,
	error?: string,
): SessionAttemptRecordInputs {
	return recordInputs({
		attempt: { ...smokeAttempt(), ...attempt },
		elapsedMs: 123,
		error,
		settings: { budgetUsd: 0.2, effort: "low", model: "haiku" },
	});
}

function settingsRecordInputs(
	settings: Readonly<JsonObject>,
): SessionAttemptRecordInputs {
	return recordInputs({ sessionCase: { ...smokeCase(), settings } });
}

export {
	settingsRecordInputs,
	FIRST_VALIDATION_ISSUE_INDEX,
	FIRST_RECORDED_DIVERGENCE_INDEX,
	FIRST_CONTEXT_MANIFEST_PATH_INDEX,
	SECOND_CONTEXT_MANIFEST_PATH_INDEX,
	STATE_GRADING_SESSION_RECORD_VERSION,
	SHA256_HEX_CHARACTERS,
	GIT_SHA_HEX_CHARACTERS,
	record,
	withoutReply,
	smokeCase,
	smokeAttempt,
	recordInputs,
	sessionCaseWithContext,
	failedRecord,
	savedAttempts,
	startedAttemptInputs,
	stateAttemptInputs,
	subagentAttemptInputs,
};
