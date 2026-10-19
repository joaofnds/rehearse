import type { SessionCase } from "./case";
import type { SessionSettings } from "./claude";
import type { ResolvedCorpusFile } from "./corpus-file";
import type { ReadManifestEntry } from "./read-manifest";
import type { SessionAttempt } from "./session-attempt";
import type {
	CorpusSnapshotOrigin,
	SessionAttemptRecordInputs,
} from "./session-record";
import {
	SHA256_HEX_CHARACTERS,
	recordInputs,
	sessionCaseWithContext,
	smokeAttempt,
} from "./session-record-test-fixtures";

function manifestContextInputs(): SessionAttemptRecordInputs {
	const sampleCase: SessionCase = sessionCaseWithContext(
		["skills/verify/SKILL.md"],
		["NOTES.md"],
		"Reply with the single word OK.",
	);
	const sampleSettings: SessionSettings = {
		budgetUsd: 0.2,
		model: "haiku",
	};
	const sampleCorpusFiles: readonly ResolvedCorpusFile[] = [
		{
			path: "skills/verify/SKILL.md",
			resolvedPath: "/path/to/SKILL.md",
			sha256: "a".repeat(SHA256_HEX_CHARACTERS),
		},
	];
	const sampleOrigin: CorpusSnapshotOrigin = { kind: "live" };
	const sampleAttempt: SessionAttempt = {
		...smokeAttempt(),
		contextManifest: {
			paths: [
				{ half: "corpus", path: "skills/verify/SKILL.md" },
				{ half: "project", path: "NOTES.md" },
			],
		},
	};

	return recordInputs({
		attempt: sampleAttempt,
		corpusFiles: sampleCorpusFiles,
		corpusOrigin: sampleOrigin,
		elapsedMs: 123,
		sessionCase: sampleCase,
		settings: sampleSettings,
	});
}

function observedContextAttempt(): SessionAttempt {
	return {
		...smokeAttempt(),
		contextManifest: {
			paths: [
				{ half: "corpus", path: "skills/verify/SKILL.md" },
				{ half: "corpus", path: "rulebook/style.md" },
				{ half: "project", path: "AGENTS.md" },
			],
		},
		loadedProjectInstructions: ["AGENTS.md", "CLAUDE.md"],
		startingProjectFiles: [
			{ path: "AGENTS.md", sha256: "d".repeat(SHA256_HEX_CHARACTERS) },
			{ path: "CLAUDE.md", sha256: "e".repeat(SHA256_HEX_CHARACTERS) },
		],
	};
}

function observedContextInputs(): SessionAttemptRecordInputs {
	const sessionCase: SessionCase = sessionCaseWithContext(
		["CLAUDE.md"],
		["AGENTS.md", "NOTES.md"],
		"Reply OK.",
	);
	const attempt = observedContextAttempt();

	return recordInputs({
		attempt,
		corpusFiles: [
			{
				path: "CLAUDE.md",
				resolvedPath: "/live/CLAUDE.md",
				sha256: "a".repeat(SHA256_HEX_CHARACTERS),
			},
			{
				path: "skills/verify/SKILL.md",
				resolvedPath: "/live/skills/verify/SKILL.md",
				sha256: "c".repeat(SHA256_HEX_CHARACTERS),
			},
		],
		sessionCase,
		settings: { budgetUsd: 0.2, model: "sonnet" },
		versionFiles: [
			{
				path: "rulebook/style.md",
				sha256: "f".repeat(SHA256_HEX_CHARACTERS),
			},
		],
	});
}

const EXPECTED_CONTEXT_READS: ReadManifestEntry[] = [
	{
		evidence: "declared",
		half: "corpus",
		path: "CLAUDE.md",
		role: "global instructions",
		sha256: "a".repeat(SHA256_HEX_CHARACTERS),
	},
	{
		evidence: "declared and observed",
		half: "project",
		path: "AGENTS.md",
		role: "project instructions",
		sha256: "d".repeat(SHA256_HEX_CHARACTERS),
	},
	{
		evidence: "declared",
		half: "project",
		path: "NOTES.md",
		role: "read for context",
	},
	{
		evidence: "observed",
		half: "corpus",
		path: "skills/verify/SKILL.md",
		role: "read for context",
		sha256: "c".repeat(SHA256_HEX_CHARACTERS),
	},
	{
		evidence: "observed",
		half: "corpus",
		path: "rulebook/style.md",
		role: "read for context",
		sha256: "f".repeat(SHA256_HEX_CHARACTERS),
	},
	{
		evidence: "observed",
		half: "project",
		path: "CLAUDE.md",
		role: "project instructions",
		sha256: "e".repeat(SHA256_HEX_CHARACTERS),
	},
];
export { manifestContextInputs, observedContextInputs, EXPECTED_CONTEXT_READS };
