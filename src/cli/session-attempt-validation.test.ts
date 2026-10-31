import { describe, expect, it } from "bun:test";

import { readShortIds } from "#benchmark/short-id";
import { failureOf } from "#cli/cli-test-support";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import { runSessionDebugAttempt } from "#cli/session-run-command";

import SessionAttemptTestFiles from "./session-attempt-test-files";
import { SessionCaseBuilder } from "./session-case-test-fixture";
import { fakeClaude } from "./session-provider-test-fixture";
import SessionRunRequestBuilder from "./session-run-request-test-builder";

const files = SessionAttemptTestFiles.forEachTest();

async function reportsTheAttemptUnsuccessfulWhenACheckFails(): Promise<void> {
	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");

	const outcome = await runSessionDebugAttempt(
		new SessionRunRequestBuilder({
			projectsDirectory: projects,
			runClaude: fakeClaude(projects, "OK sure thing"),
			runsDirectory: runs,
		}).build(),
	);

	const [observedFirstCheck] = outcome.record.checks;

	expect(outcome.record.outcome).toBe("UNSUCCESSFUL");
	expect(observedFirstCheck?.status).toBe("FAIL");
}

async function refusesADeclaredCorpusFileThatDoesNotResolveBeforeAnyProviderCall(): Promise<void> {
	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");

	const request = new SessionRunRequestBuilder({
		projectsDirectory: projects,
		runClaude: async () =>
			await Promise.reject(new Error("a provider call must not happen")),
		runsDirectory: runs,
		sessionCase: new SessionCaseBuilder({
			corpusFiles: ["output-styles/no-such-style.md"],
		}).build(),
	}).build();

	const failure = await failureOf(runSessionDebugAttempt(request));

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("no-such-style.md");
	expect(await readShortIds(runs, "smoke")).toEqual([]);
}

describe(runSessionDebugAttempt.name, () => {
	it(
		"reports the attempt unsuccessful when a check fails",
		reportsTheAttemptUnsuccessfulWhenACheckFails,
	);
	it(
		"refuses a declared corpus file that does not resolve, before any provider call",
		refusesADeclaredCorpusFileThatDoesNotResolveBeforeAnyProviderCall,
	);
});
