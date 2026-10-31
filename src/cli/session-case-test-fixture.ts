import type { SessionCase } from "#benchmark/case";
import type { SessionRunConfig } from "#benchmark/config";
import type { Immutable } from "#benchmark/contracts";
import ABSENT_HOME, {
	attemptsInFlight,
} from "#benchmark/session-setup-test-fixtures";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import type { SessionRunRequest } from "./session-run-contract";

const config: SessionRunConfig = {
	caseId: "smoke",
	effort: "low",
	judgeEffort: "low",
	judgeModel: "opus",
	model: "haiku",
	sessionBudgetUsd: 0.2,
};

class SessionCaseBuilder {
	public constructor(
		private readonly overrides: Immutable<Partial<SessionCase>> = {},
	) {}
	public build(): SessionCase {
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
			...this.overrides,
		};
	}
}

function resumingCase(transcriptPath: string): SessionCase {
	const base = new SessionCaseBuilder({ transcriptPath }).build();

	return {
		...base,
		declaration: {
			...base.declaration,
			transcript: {
				cut: 1,
				file: "prefix.jsonl",
				sha256: "a".repeat(SHA256_HEX_DIGITS),
				sourceSession: "11111111-1111-1111-1111-111111111111",
			},
		},
	};
}

/**
 * A debug run request whose every field a test does not vary takes a default,
 * so a new request field with a safe default changes this builder only.
 */
function runRequest(
	overrides: Immutable<Partial<SessionRunRequest>> &
		Pick<
			SessionRunRequest,
			"projectsDirectory" | "runClaude" | "runsDirectory"
		>,
): SessionRunRequest {
	return {
		config,
		environment: {},
		home: ABSENT_HOME,
		inFlight: attemptsInFlight(),
		sessionCase: new SessionCaseBuilder().build(),
		spendCeilingUsd: 100,
		...overrides,
	};
}

export { SessionCaseBuilder, config, resumingCase, runRequest };
