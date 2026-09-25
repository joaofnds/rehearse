import { corpusInvalidation } from "#benchmark/corpus-invalidation";
import type { CorpusRoot } from "#benchmark/corpus-file";
import { hashCorpusLayout } from "#benchmark/corpus-layout";
import type { CorpusSourceResolver } from "#benchmark/corpus-source";
import {
	CorpusSourceError,
	resolveCorpusSource,
} from "#benchmark/corpus-source";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import {
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

async function namedCorpus(
	request: CorpusVersionsRequest,
	dependencies: CorpusVersionsDependencies,
): Promise<CorpusRoot> {
	try {
		return await (dependencies.resolveCorpus ?? resolveCorpusSource)(
			request.corpus,
		);
	} catch (error) {
		if (error instanceof CorpusSourceError) {
			throw new RefusedPreconditionError(error.message);
		}

		throw error;
	}
}

/**
 * The log of the corpus the caller names, the live install when none is
 * named, as `stale` judges against the same corpus.
 */
export async function runCorpusVersions(
	request: CorpusVersionsRequest,
	dependencies: CorpusVersionsDependencies,
): Promise<void> {
	const source = await namedCorpus(request, dependencies);
	const log = await corpusVersionLog(request.runsDirectory, source);
	for (const [index, digest] of log.entries()) {
		dependencies.output.stdout(
			`${String(index + 1)}\t${corpusVersionLabel(digest)}\t${digest}\n`,
		);
	}
}

/**
 * Per corpus file, how many run-history rows read it and how many read the
 * previous version's bytes of it while it differs now, then the rows the
 * last edit invalidated, by id, for `/api/runs?ids=`.
 */
export async function runCorpusInvalidation(
	request: CorpusVersionsRequest,
	dependencies: CorpusVersionsDependencies,
): Promise<void> {
	const source = await namedCorpus(request, dependencies);
	const layout = await hashCorpusLayout(source);
	const counts = await corpusInvalidation(request.runsDirectory, source);
	for (const { path } of layout.files) {
		const readBy = counts.readBy.get(path) ?? 0;
		const invalidated = counts.invalidated.get(path) ?? 0;
		dependencies.output.stdout(
			`${String(readBy)}\t${String(invalidated)}\t${path}\n`,
		);
	}

	const { lastEdit } = counts;
	if (lastEdit.kind === "not-recorded") {
		dependencies.output.stdout(`last edit not recorded: ${lastEdit.reason}\n`);

		return;
	}

	const rows = lastEdit.count === 1 ? "row" : "rows";
	dependencies.output.stdout(
		`last edit from ${corpusVersionLabel(lastEdit.previous)} invalidated ${String(lastEdit.count)} ${rows}\n`,
	);
	for (const id of lastEdit.rows) {
		dependencies.output.stdout(`${id}\n`);
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
