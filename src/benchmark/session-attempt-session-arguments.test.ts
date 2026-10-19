import { describe, expect, it } from "bun:test";

import { sessionCaseArgs } from "#benchmark/session-attempt";

import {
	WRITTEN_SESSION,
	sessionCase,
	sessionCaseOptions,
} from "./session-attempt-case-test-fixtures";
import { valueAfter } from "./session-attempt-provider-test-fixtures";

const SESSION_EXAMPLES_16 = ["--no-session-persistence", "--json-schema"];

function resumesTheForkedSessionWhenATranscriptIsDeclared(): void {
	const flags = sessionCaseArgs(
		sessionCase({}),
		sessionCaseOptions("fresh-uuid"),
	);

	expect(valueAfter(flags, "--resume")).toBe("fresh-uuid");
}

function rerendersTheSystemPromptWhenResumingAForkedSession(): void {
	const flags = sessionCaseArgs(
		sessionCase({}),
		sessionCaseOptions("fresh-uuid"),
	);

	expect(valueAfter(flags, "--system-prompt-snapshot")).toBe("off");
}

function omitsResumeWhenNoTranscriptIsDeclared(): void {
	const flags = sessionCaseArgs(sessionCase(), sessionCaseOptions());

	expect(flags).not.toContain("--resume");
}

function doesNotConfigurePromptSnapshotsForAFreshSession(): void {
	const flags = sessionCaseArgs(sessionCase(), sessionCaseOptions());

	expect(flags).not.toContain("--system-prompt-snapshot");
}

function namesTheSessionItIsAboutToCreateWhenNoTranscriptIsDeclared(): void {
	const flags = sessionCaseArgs(sessionCase(), sessionCaseOptions());

	expect(valueAfter(flags, "--session-id")).toBe(WRITTEN_SESSION);
}

function omitsSessionIdWhenItResumesAForkedSessionInstead(): void {
	const flags = sessionCaseArgs(
		sessionCase({}),
		sessionCaseOptions("fresh-uuid"),
	);

	expect(flags).not.toContain("--session-id");
}

describe(sessionCaseArgs.name, () => {
	it(
		"resumes the forked session when a transcript is declared",
		resumesTheForkedSessionWhenATranscriptIsDeclared,
	);
	it(
		"rerenders the system prompt when resuming a forked session",
		rerendersTheSystemPromptWhenResumingAForkedSession,
	);
	it(
		"omits --resume when no transcript is declared",
		omitsResumeWhenNoTranscriptIsDeclared,
	);
	it(
		"does not configure prompt snapshots for a fresh session",
		doesNotConfigurePromptSnapshotsForAFreshSession,
	);
	it(
		"names the session it is about to create when no transcript is declared",
		namesTheSessionItIsAboutToCreateWhenNoTranscriptIsDeclared,
	);
	it(
		"omits --session-id when it resumes a forked session instead",
		omitsSessionIdWhenItResumesAForkedSessionInstead,
	);
	it.each(SESSION_EXAMPLES_16)(
		"never passes %s, which would discard the transcript or force a schema",
		(flag) => {
			const flags = sessionCaseArgs(
				sessionCase({ settings: { style: "brief" }, tools: ["Read"] }),
				sessionCaseOptions("uuid"),
			);

			expect(flags).not.toContain(flag);
		},
	);
});
