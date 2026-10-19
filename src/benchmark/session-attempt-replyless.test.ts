import { describe, expect, it } from "bun:test";

import { runSessionAttempt } from "#benchmark/session-attempt";

import {
	contextEvidenceSource,
	request,
	sessionCase,
} from "./session-attempt-case-test-fixtures";
import {
	FakeClaude,
	claudeWriting,
	replylessClaude,
} from "./session-attempt-provider-test-fixtures";
import {
	bashToolUseLine,
	toolResultLine,
} from "./session-attempt-transcript-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function recordsAnEnvelopeWithNoResultAsNoReplyRatherThanAsAPassingEmptyOne(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: replylessClaude(claude.run),
			sessionCase: sessionCase({
				checks: [
					{ kind: "word-band", max: 1 },
					{ kind: "tool-calls", max: 0 },
				],
			}),
		}),
	);

	expect(attempt.outcome).toBe("NO_REPLY");
	expect(attempt.transcriptDiagnostics.state).toBe("complete");
}

async function preservesSuppliedContextEvidenceWhenTheProviderReturnsNoReply(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");
	const source = await contextEvidenceSource();

	const attempt = await runSessionAttempt(
		request({
			contextEvidenceSource: source,
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: replylessClaude(claude.run),
		}),
	);

	expect(attempt.outcome).toBe("NO_REPLY");
	expect(attempt.contextEvidence?.source).toEqual(source);
}

async function evaluatesNoCheckWhenTheSessionProducedNoReply(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: replylessClaude(claude.run),
		}),
	);

	expect(attempt.checks).toEqual([]);
}

async function retainsNonzeroToolDiagnosticsWhenTheSessionProducedNoReply(): Promise<void> {
	const projects = await projectsRoot();
	const run = claudeWriting(
		projects,
		(sessionId) => [
			bashToolUseLine(sessionId, "bash-1", "pwd"),
			toolResultLine("bash-1"),
		],
		"OK",
	);

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: replylessClaude(run),
		}),
	);

	expect(attempt).toMatchObject({
		outcome: "NO_REPLY",
		transcriptDiagnostics: {
			state: "complete",
			toolUseOccurrences: {
				byName: [{ count: 1, name: "Bash" }],
				total: 1,
			},
		},
	});
}

async function recordsNoContextManifestWhenTheSessionProducedNoReply(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: replylessClaude(claude.run),
		}),
	);

	expect(attempt.contextManifest).toBeUndefined();
}
describe(runSessionAttempt.name, () => {
	it(
		"records an envelope with no result as no reply rather than as a passing empty one",
		recordsAnEnvelopeWithNoResultAsNoReplyRatherThanAsAPassingEmptyOne,
	);
	it(
		"preserves supplied context evidence when the provider returns no reply",
		preservesSuppliedContextEvidenceWhenTheProviderReturnsNoReply,
	);
	it(
		"evaluates no check when the session produced no reply",
		evaluatesNoCheckWhenTheSessionProducedNoReply,
	);
	it(
		"retains nonzero tool diagnostics when the session produced no reply",
		retainsNonzeroToolDiagnosticsWhenTheSessionProducedNoReply,
	);
	it(
		"records no context manifest when the session produced no reply",
		recordsNoContextManifestWhenTheSessionProducedNoReply,
	);
});
