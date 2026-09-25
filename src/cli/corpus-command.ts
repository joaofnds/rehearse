import type { CorpusSourceResolver } from "#benchmark/corpus-source";
import {
	CorpusSourceError,
	resolveCorpusSource,
} from "#benchmark/corpus-source";
import {
	corpusVersionLabel,
	corpusVersionLog,
	CorpusVersionError,
	findCorpusVersion,
	readCorpusVersion,
	readCorpusVersionFile,
} from "#benchmark/corpus-version";
import { UsageError } from "#cli/commands";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import type { CommandOutput } from "#cli/output";

export interface CorpusVersionsRequest {
	readonly corpus: string | undefined;
	readonly runsDirectory: string;
}

export interface CorpusVersionsDependencies {
	readonly output: CommandOutput;
	readonly resolveCorpus?: CorpusSourceResolver | undefined;
}

/**
 * The log of the corpus the caller names, the live install when none is
 * named, as `stale` judges against the same corpus.
 */
export async function runCorpusVersions(
	request: CorpusVersionsRequest,
	dependencies: CorpusVersionsDependencies,
): Promise<void> {
	let source;
	try {
		source = await (dependencies.resolveCorpus ?? resolveCorpusSource)(
			request.corpus,
		);
	} catch (error) {
		if (error instanceof CorpusSourceError) {
			throw new RefusedPreconditionError(error.message);
		}

		throw error;
	}

	const log = await corpusVersionLog(request.runsDirectory, source);
	for (const [index, digest] of log.entries()) {
		dependencies.output.stdout(
			`${String(index + 1)}\t${corpusVersionLabel(digest)}\t${digest}\n`,
		);
	}
}

export interface CorpusShowRequest {
	readonly version: string | undefined;
	readonly file: string | undefined;
	readonly runsDirectory: string;
}

async function foundDigest(
	runsDirectory: string,
	version: string,
): Promise<string> {
	const found = await findCorpusVersion(runsDirectory, version);
	if (found.kind === "missing") {
		throw new RefusedPreconditionError(`No corpus version matches ${version}`);
	}
	if (found.kind === "ambiguous") {
		throw new RefusedPreconditionError(
			`Corpus version ${version} is ambiguous; it matches ${found.candidates.join(", ")}`,
		);
	}

	return found.digest;
}

/**
 * Prints one file as the version held it, or the version's files and hashes
 * when no file is named.
 */
export async function runCorpusShow(
	request: CorpusShowRequest,
	output: CommandOutput,
): Promise<void> {
	if (request.version === undefined) {
		throw new UsageError("Provide the corpus version, such as corpus@1a2b3c");
	}
	const digest = await foundDigest(request.runsDirectory, request.version);

	if (request.file === undefined) {
		const files = await readCorpusVersion(request.runsDirectory, digest);
		output.stdout(
			files.map(({ path, sha256 }) => `${sha256}\t${path}\n`).join(""),
		);

		return;
	}

	try {
		const bytes = await readCorpusVersionFile(
			request.runsDirectory,
			digest,
			request.file,
		);
		output.stdout(new TextDecoder().decode(bytes));
	} catch (error) {
		if (error instanceof CorpusVersionError) {
			throw new RefusedPreconditionError(error.message);
		}

		throw error;
	}
}
