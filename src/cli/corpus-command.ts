import type { CorpusRoot } from "#benchmark/corpus-file";
import type {
	CorpusInvalidation,
	LastEdit,
} from "#benchmark/corpus-invalidation";
import { corpusInvalidation } from "#benchmark/corpus-invalidation";
import type { HashedLayout } from "#benchmark/corpus-layout";
import hashCorpusLayout from "#benchmark/corpus-layout";
import type { CorpusSourceResolver } from "#benchmark/corpus-source";
import {
	CorpusSourceError,
	resolveCorpusSource,
} from "#benchmark/corpus-source";
import {
	CorpusVersionError,
	corpusVersionLog,
	findCorpusVersion,
	readCorpusVersion,
	readCorpusVersionFile,
} from "#benchmark/corpus-version";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { UsageError } from "#cli/command-usage";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import type { CommandOutput } from "#cli/output";

const SINGLE_ITEM_COUNT = 1;

const ORDINAL_BASE = 1;

const NO_RECORDED_READERS = 0;
const NO_INVALIDATED_RESULTS = 0;

interface NamedCorpusRequest {
	readonly corpus: string | undefined;
	readonly runsDirectory: string;
}

interface NamedCorpusDependencies {
	readonly output: CommandOutput;
	readonly resolveCorpus?: CorpusSourceResolver | undefined;
}

async function namedCorpus(
	request: NamedCorpusRequest,
	dependencies: NamedCorpusDependencies,
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
async function runCorpusVersions(
	request: NamedCorpusRequest,
	dependencies: NamedCorpusDependencies,
): Promise<void> {
	const source = await namedCorpus(request, dependencies);
	const log = await corpusVersionLog(request.runsDirectory, source);
	for (const [index, digest] of log.entries()) {
		dependencies.output.stdout(
			`${String(index + ORDINAL_BASE)}\t${corpusVersionLabel(digest)}\t${digest}\n`,
		);
	}
}

/**
 * Per corpus file, how many run-history rows read it and how many read the
 * previous version's bytes of it while it differs now, then the rows the
 * last edit invalidated, by id, for `/api/runs?ids=`.
 */
async function runCorpusInvalidation(
	request: NamedCorpusRequest,
	dependencies: NamedCorpusDependencies,
): Promise<void> {
	const source = await namedCorpus(request, dependencies);
	const layout = await hashCorpusLayout(source);
	const counts = await corpusInvalidation(request.runsDirectory, source);

	writeCorpusReadCounts(layout, counts, dependencies.output);

	writeLastCorpusEdit(counts.lastEdit, dependencies.output);
}

function writeCorpusReadCounts(
	layout: HashedLayout,
	counts: CorpusInvalidation,
	output: CommandOutput,
): void {
	for (const { path } of layout.files) {
		const readBy = counts.readBy.get(path) ?? NO_RECORDED_READERS;
		const invalidated = counts.invalidated.get(path) ?? NO_INVALIDATED_RESULTS;

		output.stdout(`${String(readBy)}\t${String(invalidated)}\t${path}\n`);
	}
}

function writeLastCorpusEdit(lastEdit: LastEdit, output: CommandOutput): void {
	if (lastEdit.kind === "not-recorded") {
		output.stdout(`last edit not recorded: ${lastEdit.reason}\n`);

		return;
	}

	const rows = lastEdit.count === SINGLE_ITEM_COUNT ? "row" : "rows";

	output.stdout(
		`last edit from ${corpusVersionLabel(lastEdit.previous)} invalidated ${String(lastEdit.count)} ${rows}\n`,
	);

	for (const id of lastEdit.rows) {
		output.stdout(`${id}\n`);
	}
}

interface CorpusShowRequest {
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
async function runCorpusShow(
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

	await writeCorpusVersionFile(
		{ digest, file: request.file, runsDirectory: request.runsDirectory },
		output,
	);
}

interface CorpusVersionFileRequest {
	readonly runsDirectory: string;
	readonly digest: string;
	readonly file: string;
}

async function writeCorpusVersionFile(
	request: CorpusVersionFileRequest,
	output: CommandOutput,
): Promise<void> {
	try {
		const bytes = await readCorpusVersionFile(
			request.runsDirectory,
			request.digest,
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

export { runCorpusInvalidation, runCorpusShow, runCorpusVersions };
export type { CorpusShowRequest, NamedCorpusDependencies, NamedCorpusRequest };
