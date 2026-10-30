import type { SessionCase } from "#benchmark/case";
import { contextEvidenceSourceSchema } from "#benchmark/context-evidence";
import type { ContextEvidenceSource } from "#benchmark/context-evidence";
import type { Immutable } from "#benchmark/contracts";
import type { SessionAttemptRequest } from "#benchmark/session-attempt";

import type { SessionCaseOptions } from "./session-attempt-invocation";
import ABSENT_HOME from "./session-setup-test-fixtures";

const SHA256_HEX_CHARACTERS = 64;

const SOURCE_SESSION = "11111111-1111-1111-1111-111111111111";

const WRITTEN_SESSION = "99999999-9999-9999-9999-999999999999";

async function contextEvidenceSource(): Promise<ContextEvidenceSource> {
	return contextEvidenceSourceSchema.parse(
		await Bun.file(
			new URL("__fixtures__/context-evidence-source.json", import.meta.url),
		).json(),
	);
}

function sessionCase(
	overrides: Immutable<Partial<SessionCase>> = {},
): SessionCase {
	return {
		agents: undefined,
		checks: [{ kind: "word-band", max: 1 }],
		corpusFiles: [],
		declaration: {
			checks: [{ kind: "word-band", max: 1 }],
			corpusFiles: [],
			id: "probe",
			kind: "session",
			projectFiles: [],
			prompt: "Reply with the single word OK.",
			title: "Probe",
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
		...overrides,
	};
}

function request(
	overrides: Immutable<Partial<SessionAttemptRequest>> & {
		readonly projectsDirectory: string;
		readonly recordDirectory: string;
		readonly runClaude: SessionAttemptRequest["runClaude"];
	},
): SessionAttemptRequest {
	return {
		environment: {},
		home: ABSENT_HOME,
		liveCitations: { home: ABSENT_HOME, roots: [] },
		sessionCase: sessionCase(),
		settings: { budgetUsd: 0.2, effort: "low", model: "haiku" },
		...overrides,
	};
}

const settings = { budgetUsd: 0.2, effort: "low", model: "haiku" } as const;

function sessionCaseOptions(resume?: string): SessionCaseOptions {
	return {
		session:
			resume === undefined
				? { resumed: false, sessionId: WRITTEN_SESSION }
				: { resumed: true, sessionId: resume },
		settings,
		setup: { kind: "isolated" },
	};
}

const actualSetup = {
	kind: "actual",
	mcpConfigFiles: ["/home/user/.claude.json"],
	pluginDirectories: ["/home/user/.claude/plugins/synced/bucket"],
	settingsFile: "/tmp/rehearse-setup/settings.json",
} as const;

function actualSetupOptions(): SessionCaseOptions {
	return { ...sessionCaseOptions(), setup: actualSetup };
}

export {
	SOURCE_SESSION,
	WRITTEN_SESSION,
	SHA256_HEX_CHARACTERS,
	contextEvidenceSource,
	sessionCase,
	request,
	settings,
	sessionCaseOptions,
	actualSetup,
	actualSetupOptions,
};
