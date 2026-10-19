import { describe, expect, it } from "bun:test";

import SessionInvocationError from "#benchmark/session-invocation-error";
import { failureOf } from "#cli/cli-test-support";
import { runSessionDebugAttempt } from "#cli/session-run-command";

import {
	firstAttemptRecord,
	readAttemptRecord,
} from "./session-attempt-record-observation";
import SessionAttemptTestFiles from "./session-attempt-test-files";
import { SessionCaseBuilder, config } from "./session-case-test-fixture";
import {
	loadContextEvidenceSource,
	syntheticContextCatalog,
} from "./session-context-evidence-test-fixture";
import expectedTranscriptDiagnostics from "./session-diagnostic-expectation";
import { diagnosticClaude, fakeClaude } from "./session-provider-test-fixture";

const files = SessionAttemptTestFiles.forEachTest();

async function persistsExactToolDiagnosticsInTheParsedAttemptRecord(): Promise<void> {
	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");

	const outcome = await runSessionDebugAttempt({
		config,
		projectsDirectory: projects,
		runClaude: diagnosticClaude(projects),
		runsDirectory: runs,
		sessionCase: new SessionCaseBuilder().build(),
		spendCeilingUsd: 100,
	});
	const written = await readAttemptRecord(outcome.recordFile);

	expect(written.transcriptDiagnostics).toEqual(expectedTranscriptDiagnostics);
}

async function persistsRetainedDiagnosticsWhenADirectProviderAttemptFails(): Promise<void> {
	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");
	const writesTranscript = diagnosticClaude(projects);
	const providerDurationMs = 45_000;
	let elapsedMs = 0;

	const failure = await failureOf(
		runSessionDebugAttempt({
			config,
			now: () => elapsedMs,
			projectsDirectory: projects,
			runClaude: async (command, cwd) => {
				await writesTranscript(command, cwd);
				elapsedMs += providerDurationMs;
				throw new Error("provider rejected the session");
			},
			runsDirectory: runs,
			sessionCase: new SessionCaseBuilder().build(),
			spendCeilingUsd: 100,
		}),
	);
	const record = await firstAttemptRecord({
		caseId: "smoke",
		runsDirectory: runs,
	});

	expect(failure).toBeInstanceOf(SessionInvocationError);
	expect(record.elapsedMs).toBe(providerDurationMs);
	expect(record).toMatchObject({
		error: "provider rejected the session",
		outcome: "EXECUTION_FAILED",
		schemaVersion: 2,
		transcriptDiagnostics: {
			measuredLineCount: 9,
			prefixLinesExcluded: 0,
			repeatedBashCommands: [{ preview: "ls" }],
			sourceLineCount: 9,
			state: "complete",
			toolErrors: [{ toolUseId: "bash-2" }],
			toolUseOccurrences: { total: 4 },
		},
	});
}

async function persistsProviderContextEvidenceThroughTheSavedAttemptBoundary(): Promise<void> {
	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");
	const contextEvidenceSource = await loadContextEvidenceSource();
	const contextRateCatalog = syntheticContextCatalog();

	const outcome = await runSessionDebugAttempt({
		config,
		contextEvidenceSource,
		contextRateCatalog,
		projectsDirectory: projects,
		runClaude: fakeClaude(projects, "OK"),
		runsDirectory: runs,
		sessionCase: new SessionCaseBuilder().build(),
		spendCeilingUsd: 100,
	});
	const written = await readAttemptRecord(outcome.recordFile);

	expect(written.contextEvidence?.source).toEqual(contextEvidenceSource);
	expect(
		written.contextEvidence?.projection.requests.find(
			(request) => request.requestId === "req-child-1",
		)?.pricing,
	).toEqual({
		calculatedCostUsd: 0.005712,
		currency: "USD",
		rateSource: "synthetic-rate-card",
		rateVersion: "2026-09-13",
		selectedRate: {
			cacheReadUsdPerMillion: 0.3,
			cacheWrite1hUsdPerMillion: 6,
			cacheWrite5mUsdPerMillion: 3.75,
			inputUsdPerMillion: 3,
			model: "claude-sonnet-5",
			outputUsdPerMillion: 15,
		},
		state: "complete",
	});
	expect(written.contextEvidence?.rateCatalog).toEqual(contextRateCatalog);
}

describe(runSessionDebugAttempt.name, () => {
	it(
		"persists exact tool diagnostics in the parsed attempt record",
		persistsExactToolDiagnosticsInTheParsedAttemptRecord,
	);

	it(
		"persists retained diagnostics when a direct provider attempt fails",
		persistsRetainedDiagnosticsWhenADirectProviderAttemptFails,
	);

	it(
		"persists provider context evidence through the saved attempt boundary",
		persistsProviderContextEvidenceThroughTheSavedAttemptBoundary,
	);
});
