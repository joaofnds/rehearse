import { randomUUID } from "node:crypto";

import type { HashedFile } from "#benchmark/checkpoint";
import type { SessionSettings } from "#benchmark/claude";
import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import type { SessionAttemptPaths } from "#benchmark/session-attempt-layout";
import { sessionAttemptPaths } from "#benchmark/session-attempt-layout";
import { claimShortId } from "#benchmark/short-id";

import type { AttemptCorpus } from "./session-attempt-corpus";
import requireCorpus from "./session-attempt-corpus";
import { lineageOf, settingsOf } from "./session-attempt-lineage";
import measureAttemptCorpus from "./session-attempt-version-files";
import type { SessionRunRequest } from "./session-run-contract";

interface PreparedSessionDebugAttempt {
	readonly attemptPaths: SessionAttemptPaths;
	readonly corpus: AttemptCorpus;
	readonly corpusVersion: CorpusMeasurement;
	readonly lineage: string;
	readonly settings: SessionSettings;
	readonly versionFiles: readonly HashedFile[];
}

async function prepareSessionDebugAttempt(
	request: SessionRunRequest,
): Promise<PreparedSessionDebugAttempt> {
	const { sessionCase, config } = request;
	const settings = settingsOf(config);
	const attemptId = { caseId: sessionCase.declaration.id, uuid: randomUUID() };
	const attemptPaths = sessionAttemptPaths(request.runsDirectory, attemptId);

	const corpus = await requireCorpus(
		{
			corpus: config.corpus,
			sessionCase,
			snapshotDirectory: attemptPaths.corpusDirectory,
		},
		request.resolveCorpus,
	);

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
