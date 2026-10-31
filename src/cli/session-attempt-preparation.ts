import { randomUUID } from "node:crypto";

import type { SessionSettings } from "#benchmark/claude";
import { claimInFlight } from "#benchmark/in-flight-claim";
import type { SessionAttemptPaths } from "#benchmark/session-attempt-layout";
import { sessionAttemptPaths } from "#benchmark/session-attempt-layout";
import { claimShortId } from "#benchmark/short-id";

import type { AttemptCorpus } from "./session-attempt-corpus";
import requireCorpus, { resolveSessionCorpus } from "./session-attempt-corpus";
import { lineageOf, settingsOf } from "./session-attempt-lineage";
import measureAttemptCorpus from "./session-attempt-version-files";
import type { AttemptCorpusMeasurement } from "./session-attempt-version-files";
import type { SessionRunRequest } from "./session-run-contract";

interface PreparedSessionDebugAttempt extends AttemptCorpusMeasurement {
	readonly attemptPaths: SessionAttemptPaths;
	readonly corpus: AttemptCorpus;
	readonly lineage: string;
	readonly settings: SessionSettings;
}

/**
 * The attempt is claimed once its corpus resolves, so a corpus that does not
 * resolve leaves no attempt directory, and before its snapshot is written.
 * An operator stop records itself in a claimed attempt that has not settled,
 * however late it would settle.
 */
async function claimedCorpus(
	request: SessionRunRequest,
	attemptPaths: SessionAttemptPaths,
): Promise<AttemptCorpus> {
	const source = await resolveSessionCorpus(
		request.config.corpus,
		request.resolveCorpus,
	);

	await claimInFlight(attemptPaths.directory);
	await request.inFlight.claimRecord(attemptPaths.operatorStopFile);

	return await requireCorpus(
		{
			sessionCase: request.sessionCase,
			snapshotDirectory: attemptPaths.corpusDirectory,
		},
		source,
	);
}

async function prepareSessionDebugAttempt(
	request: SessionRunRequest,
): Promise<PreparedSessionDebugAttempt> {
	const { sessionCase, config } = request;
	const settings = settingsOf(config);
	const attemptId = { caseId: sessionCase.declaration.id, uuid: randomUUID() };
	const attemptPaths = sessionAttemptPaths(request.runsDirectory, attemptId);

	const corpus = await claimedCorpus(request, attemptPaths);

	const { corpusVersion, versionFiles } = await measureAttemptCorpus(
		request,
		corpus,
	);

	const lineage = await lineageOf(sessionCase, corpus.files, settings);

	await claimShortId(request.runsDirectory, attemptId.caseId, {
		kind: "attempt:session",
		...attemptId,
	});

	return {
		attemptPaths,
		corpus,
		corpusVersion,
		lineage,
		settings,
		versionFiles,
	};
}

export { prepareSessionDebugAttempt as default };

export type { PreparedSessionDebugAttempt };
