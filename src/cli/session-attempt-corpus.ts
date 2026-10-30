import type { SessionCase } from "#benchmark/case";
import type { CorpusRoot, ResolvedCorpusFile } from "#benchmark/corpus-file";
import {
	CorpusConfigurationError,
	hashCorpusFiles,
} from "#benchmark/corpus-file";
import type { CorpusSourceResolver } from "#benchmark/corpus-source";
import { resolveCorpusSource } from "#benchmark/corpus-source";
import type { SessionCorpusSnapshot } from "#benchmark/session-corpus";
import {
	freezeWholeSessionCorpus,
	snapshotSessionCorpus,
} from "#benchmark/session-corpus";
import { UsageError } from "#cli/command-usage";
import corpusRefusal from "#cli/corpus-failures";

interface AttemptCorpus {
	readonly source: CorpusRoot;
	readonly snapshot: SessionCorpusSnapshot;
	readonly files: readonly ResolvedCorpusFile[];
}

interface SessionCorpusRequest {
	readonly sessionCase: SessionCase;
	readonly snapshotDirectory: string;
}

async function resolveSessionCorpus(
	corpus: string | undefined,
	resolveCorpus: CorpusSourceResolver = resolveCorpusSource,
): ReturnType<CorpusSourceResolver> {
	try {
		return await resolveCorpus(corpus);
	} catch (error) {
		if (error instanceof CorpusConfigurationError) {
			const refusal = corpusRefusal(error);
			if (refusal !== undefined) {
				throw refusal;
			}
		}

		throw new UsageError(
			error instanceof Error ? error.message : String(error),
		);
	}
}

/**
 * A `--corpus` string the parser cannot turn into a corpus is an unparseable
 * flag value, which is a usage error; a corpus that resolves but holds no
 * declared file, or holds one the harness cannot deliver, is a declared input
 * the command cannot satisfy, which is a refused precondition. Both come before
 * the attempt runs, so neither is discovered after the session is paid for.
 */
async function requireCorpus(
	request: SessionCorpusRequest,
	source: CorpusRoot,
): Promise<AttemptCorpus> {
	try {
		const snapshotCorpus = request.sessionCase.isolated
			? snapshotSessionCorpus
			: freezeWholeSessionCorpus;
		const snapshot = await snapshotCorpus(
			source,
			request.snapshotDirectory,
			request.sessionCase.corpusFiles,
		);

		return {
			files: await hashCorpusFiles(snapshot, request.sessionCase.corpusFiles),
			snapshot,
			source,
		};
	} catch (error) {
		if (error instanceof Error) {
			const refusal = corpusRefusal(error);
			if (refusal !== undefined) {
				throw refusal;
			}
		}

		throw error;
	}
}

export { requireCorpus as default, resolveSessionCorpus };

export type { AttemptCorpus };
