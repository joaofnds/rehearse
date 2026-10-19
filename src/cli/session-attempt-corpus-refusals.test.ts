import { describe, expect, it } from "bun:test";

import { CorpusConfigurationError } from "#benchmark/corpus-file";
import type { ResolvedCorpusSource } from "#benchmark/corpus-source";
import { failureOf } from "#cli/cli-test-support";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import { runSessionDebugAttempt } from "#cli/session-run-command";

import SessionAttemptTestFiles from "./session-attempt-test-files";
import { SessionCaseBuilder, config } from "./session-case-test-fixture";

const PROVIDER_CALL_COUNT_INCREMENT = 1;

const files = SessionAttemptTestFiles.forEachTest();

async function refusesAnOutOfExtentLiveCorpusFileBeforeAnyProviderCall(): Promise<void> {
	const expectedProviderCalls = 0;

	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");
	const { root, backingRoot } = await files.outOfExtentCorpus();
	let providerCalls = 0;

	const failure = await failureOf(
		runSessionDebugAttempt({
			config,
			projectsDirectory: projects,
			resolveCorpus: async () =>
				await Promise.resolve<ResolvedCorpusSource>({
					backingRoot,
					kind: "live",
					root,
				}),
			runClaude: async () => {
				providerCalls += PROVIDER_CALL_COUNT_INCREMENT;
				return await Promise.reject(
					new Error("a provider call must not happen"),
				);
			},
			runsDirectory: runs,
			sessionCase: new SessionCaseBuilder({
				corpusFiles: ["output-styles/foreign.md"],
			}).build(),
			spendCeilingUsd: 100,
		}),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("live corpus extent");
	expect(providerCalls).toBe(expectedProviderCalls);
}

async function reportsAnInvalidNeededLiveBackingTreeAsARefusedPrecondition(): Promise<void> {
	const expectedProviderCalls = 0;

	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");
	const { root, backingRoot } = await files.invalidBackingCorpus();
	let providerCalls = 0;

	const failure = await failureOf(
		runSessionDebugAttempt({
			config,
			projectsDirectory: projects,
			resolveCorpus: async () =>
				await Promise.resolve<ResolvedCorpusSource>({
					backingRoot,
					kind: "live",
					root,
				}),
			runClaude: async () => {
				providerCalls += PROVIDER_CALL_COUNT_INCREMENT;
				return await Promise.reject(
					new Error("a provider call must not happen"),
				);
			},
			runsDirectory: runs,
			sessionCase: new SessionCaseBuilder({
				corpusFiles: ["output-styles/foreign.md"],
			}).build(),
			spendCeilingUsd: 100,
		}),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("not a directory");
	expect(providerCalls).toBe(expectedProviderCalls);
}

async function reportsInvalidLiveCorpusConfigurationAsARefusedPrecondition(): Promise<void> {
	const failure = await failureOf(
		runSessionDebugAttempt({
			config,
			projectsDirectory: await files.temporary("rehearse-projects-"),
			resolveCorpus: async () =>
				await Promise.reject(
					new CorpusConfigurationError("invalid backing root"),
				),
			runClaude: async () =>
				await Promise.reject(new Error("a provider call must not happen")),
			runsDirectory: await files.temporary("rehearse-runs-"),
			sessionCase: new SessionCaseBuilder().build(),
			spendCeilingUsd: 100,
		}),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("invalid backing root");
}

describe(runSessionDebugAttempt.name, () => {
	it(
		"refuses an out-of-extent live corpus file before any provider call",
		refusesAnOutOfExtentLiveCorpusFileBeforeAnyProviderCall,
	);
	it(
		"reports an invalid needed live backing tree as a refused precondition",
		reportsAnInvalidNeededLiveBackingTreeAsARefusedPrecondition,
	);
	it(
		"reports invalid live corpus configuration as a refused precondition",
		reportsInvalidLiveCorpusConfigurationAsARefusedPrecondition,
	);
});
