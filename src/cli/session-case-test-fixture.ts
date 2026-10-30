import type { SessionCase } from "#benchmark/case";
import type { SessionRunConfig } from "#benchmark/config";
import type { Immutable } from "#benchmark/contracts";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

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
export { SessionCaseBuilder, config, resumingCase };
export { default as ABSENT_HOME } from "#benchmark/session-setup-test-fixtures";
