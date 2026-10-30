import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { CommandError } from "#benchmark/command";
import { runSessionAttempt } from "#benchmark/session-attempt";
import SessionInvocationError from "#benchmark/session-invocation-error";
import { failureOf } from "#cli/cli-test-support";

import {
	contextEvidenceSource,
	request,
} from "./session-attempt-case-test-fixtures";
import {
	FakeClaude,
	budgetErrorEnvelope,
	namedSession,
} from "./session-attempt-provider-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";
import verboseOutput from "./session-output-test-fixtures";

resources.registerCleanup();

async function keepsASchemaInvalidProviderEnvelopeOutsideTypedInvocationFailures(): Promise<void> {
	const projects = await projectsRoot();
	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: async () =>
			await Promise.resolve(
				verboseOutput(
					JSON.stringify({
						is_error: "yes",
						result: "not valid",
						session_id: "session-1",
						type: "result",
					}),
				),
			),
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toBeInstanceOf(Error);
	expect(failure).not.toBeInstanceOf(SessionInvocationError);
}

async function preservesARejectedProviderCommandAsATypedFailedInvocation(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");
	const records = await recordDirectory();

	const failure = await failureOf(
		runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: records,
				runClaude: async (command, cwd) => {
					await claude.run(command, cwd);

					throw new Error("claude exited 1");
				},
			}),
		),
	);

	expect(failure).toBeInstanceOf(SessionInvocationError);
	expect(failure).toMatchObject({
		attempt: {
			checks: [],
			outcome: "EXECUTION_FAILED",
			reply: undefined,
			transcriptDiagnostics: { state: "complete" },
		},
		message: "claude exited 1",
	});
	expect(await Bun.file(join(records, "transcript.jsonl")).text()).toContain(
		"OK",
	);
}

async function preservesSuppliedContextEvidenceWhenTheProviderRunnerThrows(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");
	const source = await contextEvidenceSource();

	const attemptRequest = request({
		contextEvidenceSource: source,
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: async (command, cwd) => {
			await claude.run(command, cwd);
			throw new Error("provider unavailable");
		},
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toMatchObject({
		attempt: {
			contextEvidence: { source },
			outcome: "EXECUTION_FAILED",
		},
	});
}

async function retainsMetricsFromARejectedCommandSValidProviderEnvelope(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "partial reply");
	const records = await recordDirectory();

	const failure = await failureOf(
		runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: records,
				runClaude: async (command, cwd) => {
					await claude.run(command, cwd);
					const halted = budgetErrorEnvelope(namedSession(command));
					throw new CommandError(command, {
						exitCode: 1,
						stderr: "",
						stdout: halted,
					});
				},
			}),
		),
	);

	expect(failure).toBeInstanceOf(SessionInvocationError);
	expect(failure).toMatchObject({
		attempt: {
			metrics: { costUsd: 0.0012, turns: 2 },
			outcome: "EXECUTION_FAILED",
		},
		message: "session exhausted its budget (spent $0.0012)",
	});
}

async function preservesAValidProviderErrorEnvelopeAsATypedFailedInvocation(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "partial reply");
	const records = await recordDirectory();
	const source = await contextEvidenceSource();

	const failure = await failureOf(
		runSessionAttempt(
			request({
				contextEvidenceSource: source,
				projectsDirectory: projects,
				recordDirectory: records,
				runClaude: async (command, cwd) => {
					await claude.run(command, cwd);

					return budgetErrorEnvelope(namedSession(command));
				},
			}),
		),
	);

	expect(failure).toBeInstanceOf(SessionInvocationError);
	expect(failure).toMatchObject({
		attempt: {
			contextEvidence: {
				schemaVersion: 1,
				source,
			},
			metrics: { costUsd: 0.0012, turns: 2 },
			outcome: "EXECUTION_FAILED",
		},
		message: "session exhausted its budget (spent $0.0012)",
	});
	expect(await Bun.file(join(records, "transcript.jsonl")).text()).toContain(
		"partial reply",
	);
}

async function givesABlankProviderErrorResultARecordableDiagnostic(): Promise<void> {
	const projects = await projectsRoot();
	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: async () =>
			await Promise.resolve(
				verboseOutput(
					JSON.stringify({
						is_error: true,
						result: "",
						session_id: "session-1",
						type: "result",
					}),
				),
			),
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toBeInstanceOf(SessionInvocationError);
	expect(failure.message).toBe("Claude session failed");
	expect(failure).toMatchObject({
		attempt: {
			transcriptDiagnostics: {
				prefixLinesExcluded: 0,
				state: "unavailable",
			},
		},
	});
}
describe(runSessionAttempt.name, () => {
	it(
		"keeps a schema-invalid provider envelope outside typed invocation failures",
		keepsASchemaInvalidProviderEnvelopeOutsideTypedInvocationFailures,
	);
	it(
		"preserves a rejected provider command as a typed failed invocation",
		preservesARejectedProviderCommandAsATypedFailedInvocation,
	);
	it(
		"preserves supplied context evidence when the provider runner throws",
		preservesSuppliedContextEvidenceWhenTheProviderRunnerThrows,
	);
	it(
		"retains metrics from a rejected command's valid provider envelope",
		retainsMetricsFromARejectedCommandSValidProviderEnvelope,
	);
	it(
		"preserves a valid provider error envelope as a typed failed invocation",
		preservesAValidProviderErrorEnvelopeAsATypedFailedInvocation,
	);
	it(
		"gives a blank provider error result a recordable diagnostic",
		givesABlankProviderErrorResultARecordableDiagnostic,
	);
});
