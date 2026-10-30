import { join } from "node:path";

import type { SessionCase } from "./case";
import type { SessionAttempt } from "./session-attempt";
import type {
	SessionConfirmationRepPlan,
	SessionConfirmationRequest,
} from "./session-confirmation";

const CLOCK_ORIGIN_MINUTE = 15;

const ATTEMPT_DURATION_MINUTES = 10;

const CLOCK_YEAR = 2026;

const CLOCK_MONTH_INDEX = 9;

const CLOCK_DAY_OF_MONTH = 8;

const CLOCK_HOUR = 10;

const DISTINCT_CONFIRMATION_INPUT_COUNT = 1;

const RETAINED_CONFIRMATION_REP_COUNT = 2;

const FIRST_RECORDED_STAGE_INDEX = 0;

const FIRST_RECORDED_CHECK_INDEX = 0;

const FIRST_REP_RECORD_FILE_INDEX = 0;

const TRACKED_GIT_PATH_COMPONENT_INDEX = 1;

const FIRST_REP_ORDINAL = 1;

const SECOND_REP_ORDINAL = 2;

const FOURTH_REP_ORDINAL = 4;

const THIRD_REP_ORDINAL = 3;

const PREFIX_START_INDEX = 0;

const PROVIDER_CALL_COUNT_INCREMENT = 1;

const CLOCK_TICK_MINUTES = 1;

const metrics = {
	cacheReadTokens: 3,
	cacheWriteTokens: 4,
	costUsd: 0.02,
	inputTokens: 10,
	outputTokens: 2,
	turns: 1,
};

const unavailableTranscriptDiagnostics = {
	prefixLinesExcluded: 0,
	state: "unavailable",
} as const;

function requiredPath(path: string | undefined): string {
	if (path === undefined) {
		throw new Error("Expected a frozen session path");
	}

	return path;
}

function simpleSessionCase(id = "outcomes"): SessionCase {
	return {
		agents: undefined,
		checks: [{ kind: "word-band", max: 1 }],
		corpusFiles: [],
		declaration: {
			checks: [{ kind: "word-band", max: 1 }],
			corpusFiles: [],
			id,
			kind: "session",
			projectFiles: [],
			prompt: "Reply.",
			title: "Outcomes",
			tools: [],
		},
		fixturePath: undefined,
		isolated: false,
		kind: "session",
		projectFiles: [],
		prompt: "Reply.",
		settings: undefined,
		tools: [],
		transcriptPath: undefined,
	};
}

function confirmationRequest(
	overrides: Partial<SessionConfirmationRequest> &
		Pick<
			SessionConfirmationRequest,
			"groupId" | "runsDirectory" | "sessionCase"
		>,
): SessionConfirmationRequest {
	return {
		approvalMethod: "yes",
		model: "sonnet",
		preflight: { call: { metrics }, status: "COMPLETE" },
		projectedCost: {
			perRepMaximumUsd: 0.2,
			preflightMaximumUsd: 0.1,
			reps: 2,
			totalMaximumUsd: 0.5,
		},
		reps: 2,
		sessionBudgetUsd: 0.2,
		spendCeilingUsd: 100,
		...overrides,
	};
}

async function recordedAttempt(
	plan: SessionConfirmationRepPlan,
): Promise<SessionAttempt> {
	const transcriptFile = join(plan.recordDirectory, "transcript.jsonl");
	await Bun.write(transcriptFile, `rep ${plan.ordinal}\n`);

	return {
		attemptDirectory: join(plan.recordDirectory, "execution"),
		checks: [{ detail: "1 word", kind: "word-band", status: "PASS" }],
		contextManifest: undefined,
		corpusDelivery: { liveReads: [], redirected: 0, rule: 1 },
		metrics,
		outcome: "SUCCESSFUL",
		reply: "OK",
		setup: { kind: "isolated" },
		transcriptDiagnostics: unavailableTranscriptDiagnostics,
		transcriptFile,
	};
}

function declaredCorpusCase(
	id: string,
	corpusFiles: readonly string[],
): SessionCase {
	const declared = simpleSessionCase(id);
	return {
		...declared,
		corpusFiles,
		declaration: { ...declared.declaration, corpusFiles },
	};
}

function frozenInputCase(
	fixturePath: string,
	transcriptPath: string,
): SessionCase {
	const transcriptSha = new Bun.CryptoHasher("sha256")
		.update("original transcript\n")
		.digest("hex");
	return {
		agents: undefined,
		checks: [{ kind: "word-band", max: 1 }],
		corpusFiles: ["output-styles/brief.md"],
		declaration: {
			checks: [{ kind: "word-band", max: 1 }],
			corpusFiles: ["output-styles/brief.md"],
			fixture: "fixture",
			id: "smoke",
			kind: "session",
			projectFiles: ["fixture.txt"],
			prompt: "Reply with OK.",
			title: "Smoke",
			tools: [],
			transcript: {
				cut: 1,
				file: "prefix.jsonl",
				sha256: transcriptSha,
				sourceSession: "source-session",
			},
		},
		fixturePath,
		isolated: false,
		kind: "session",
		projectFiles: ["fixture.txt"],
		prompt: "Reply with OK.",
		settings: undefined,
		tools: [],
		transcriptPath,
	};
}

export {
	CLOCK_ORIGIN_MINUTE,
	ATTEMPT_DURATION_MINUTES,
	CLOCK_YEAR,
	CLOCK_MONTH_INDEX,
	CLOCK_DAY_OF_MONTH,
	CLOCK_HOUR,
	DISTINCT_CONFIRMATION_INPUT_COUNT,
	RETAINED_CONFIRMATION_REP_COUNT,
	FIRST_RECORDED_STAGE_INDEX,
	FIRST_RECORDED_CHECK_INDEX,
	FIRST_REP_RECORD_FILE_INDEX,
	TRACKED_GIT_PATH_COMPONENT_INDEX,
	FIRST_REP_ORDINAL,
	SECOND_REP_ORDINAL,
	FOURTH_REP_ORDINAL,
	THIRD_REP_ORDINAL,
	PREFIX_START_INDEX,
	PROVIDER_CALL_COUNT_INCREMENT,
	CLOCK_TICK_MINUTES,
	metrics,
	unavailableTranscriptDiagnostics,
	requiredPath,
	simpleSessionCase,
	confirmationRequest,
	recordedAttempt,
	declaredCorpusCase,
	frozenInputCase,
};
