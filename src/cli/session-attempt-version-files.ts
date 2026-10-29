import type { HashedFile } from "#benchmark/checkpoint";
import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import {
	measureCorpusVersion,
	measuredCorpusFiles,
} from "#benchmark/corpus-version";
import { RefusedPreconditionError } from "#cli/interactive-stdin";

import type { AttemptCorpus } from "./session-attempt-corpus";
import type { SessionRunRequest } from "./session-run-contract";

interface AttemptCorpusVersion {
	readonly corpus: AttemptCorpus;
	readonly measurement: CorpusMeasurement;
	readonly runsDirectory: string;
}

async function matchingCorpusVersionFiles({
	corpus,
	measurement,
	runsDirectory,
}: AttemptCorpusVersion): Promise<readonly HashedFile[]> {
	const files = await measuredCorpusFiles(runsDirectory, measurement);
	if (measurement.kind === "version") {
		const changed = corpus.files.find(
			(declared) =>
				!files.some(
					(file) =>
						file.path === declared.path && file.sha256 === declared.sha256,
				),
		);
		if (changed !== undefined) {
			throw new RefusedPreconditionError(
				`Corpus entry ${changed.path} changed while preparing the attempt; retry with an unchanged corpus source`,
			);
		}
	}

	return files;
}

interface AttemptCorpusMeasurement {
	readonly corpusVersion: CorpusMeasurement;
	readonly versionFiles: readonly HashedFile[];
}

/**
 * The corpus version an attempt records, and the files that version holds,
 * refused when the snapshot no longer matches them.
 */
async function measureAttemptCorpus(
	request: SessionRunRequest,
	corpus: AttemptCorpus,
): Promise<AttemptCorpusMeasurement> {
	const corpusVersion = await (
		request.measureCorpusVersion ?? measureCorpusVersion
	)(request.runsDirectory, corpus.source);

	const versionFiles = await matchingCorpusVersionFiles({
		corpus,
		measurement: corpusVersion,
		runsDirectory: request.runsDirectory,
	});

	return { corpusVersion, versionFiles };
}

export { measureAttemptCorpus as default };

export type { AttemptCorpusMeasurement };
