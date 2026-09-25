import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { HashedFile } from "./checkpoint";
import { canonicalFiles, hashedFileSchema } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import type { CorpusMeasurement } from "./corpus-measurement";
import { CORPUS_VERSION_LABEL } from "./corpus-version-label";
import { hashCorpusLayout } from "./corpus-layout";
import { readdirIfPresent, textIfPresent } from "./file-presence";
import { claimedNumbers } from "./numbered-claims";

const STORE_DIRECTORY = "corpus-versions";
const BLOBS_DIRECTORY = "blobs";
const VERSIONS_DIRECTORY = "versions";
const LOGS_DIRECTORY = "logs";

const versionManifestSchema = z.object({
	files: z.array(hashedFileSchema),
});

function sha256(bytes: string | Readonly<Uint8Array>): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The version a hashed layout is: the same canonical list the corpus report
 * has always hashed, in full, so a version's first six characters are the
 * digest that report showed for the same tree.
 */
export function corpusVersionDigest(files: readonly HashedFile[]): string {
	return sha256(JSON.stringify(canonicalFiles(files)));
}

function storeDirectory(recordsDirectory: string): string {
	return join(recordsDirectory, STORE_DIRECTORY);
}

function blobFile(recordsDirectory: string, sha: string): string {
	return join(storeDirectory(recordsDirectory), BLOBS_DIRECTORY, sha);
}

function versionFile(recordsDirectory: string, digest: string): string {
	return join(
		storeDirectory(recordsDirectory),
		VERSIONS_DIRECTORY,
		`${digest}.json`,
	);
}

/**
 * One log per corpus source root, named by a hash of the directory the root
 * resolves to, so a path never has to become a directory name and two paths
 * to one directory share its log.
 */
async function logDirectory(
	recordsDirectory: string,
	source: CorpusRoot,
): Promise<string> {
	const root = await realpath(source.root).catch(() => resolve(source.root));

	return join(storeDirectory(recordsDirectory), LOGS_DIRECTORY, sha256(root));
}

/**
 * Written beside the target and renamed over it, so a reader never sees a
 * torn body. Two writers of one content-addressed path write the same bytes,
 * so whichever rename lands last changes nothing.
 */
async function writeWhole(
	file: string,
	contents: string | Readonly<Uint8Array>,
): Promise<void> {
	const temporary = `${file}.${randomUUID()}.tmp`;
	await writeFile(temporary, contents, { mode: 0o600 });
	await rename(temporary, file);
}

async function storeFiles(
	recordsDirectory: string,
	source: CorpusRoot,
	paths: readonly string[],
): Promise<HashedFile[]> {
	await mkdir(join(storeDirectory(recordsDirectory), BLOBS_DIRECTORY), {
		recursive: true,
	});
	const stored: HashedFile[] = [];

	for (const path of paths) {
		const bytes = await Bun.file(join(source.root, path)).bytes();
		const sha = sha256(bytes);
		await writeWhole(blobFile(recordsDirectory, sha), bytes);
		stored.push({ path, sha256: sha });
	}

	return stored;
}

interface LogEntry {
	readonly position: number;
	readonly digest: string;
}

async function readLog(directory: string): Promise<LogEntry[]> {
	const entries: LogEntry[] = [];
	for (const position of claimedNumbers(
		(await readdirIfPresent(directory)) ?? [],
	)) {
		const text = await textIfPresent(join(directory, String(position)));
		if (text !== undefined) {
			entries.push({ position, digest: text.trim() });
		}
	}

	return entries;
}

/**
 * An entry is linked into place from a file already holding its digest, so
 * the create is exclusive and no reader sees an empty entry. A writer that
 * loses the race re-reads the log before trying again, which is what keeps
 * two measurements of one new state to one entry. The next position follows
 * the highest one present rather than the count, so a missing entry never
 * leaves a writer retrying a position that is already taken.
 */
async function appendToLog(directory: string, digest: string): Promise<void> {
	await mkdir(directory, { recursive: true });
	const temporary = join(directory, `${randomUUID()}.tmp`);
	await writeFile(temporary, `${digest}\n`);

	try {
		for (;;) {
			const log = await readLog(directory);
			const latest = log.at(-1);
			if (latest?.digest === digest) {
				return;
			}

			try {
				await link(
					temporary,
					join(directory, String((latest?.position ?? 0) + 1)),
				);

				return;
			} catch (error) {
				if (
					!(
						error instanceof Error &&
						"code" in error &&
						error.code === "EEXIST"
					)
				) {
					throw error;
				}
			}
		}
	} finally {
		await rm(temporary, { force: true });
	}
}

/**
 * Measures the whole corpus layout of one source, keeps every file body and
 * the version's manifest in the records directory, and adds the version to
 * the source's log when it differs from the latest entry there.
 */
export async function measureCorpusVersion(
	recordsDirectory: string,
	source: CorpusRoot,
): Promise<CorpusMeasurement> {
	const layout = await hashCorpusLayout(source);
	if (layout.refusals.length > 0) {
		return { kind: "refused", refusal: layout.refusals.join("; ") };
	}

	const files = await storeFiles(
		recordsDirectory,
		source,
		layout.files.map(({ path }) => path),
	);
	const digest = corpusVersionDigest(files);
	await mkdir(join(storeDirectory(recordsDirectory), VERSIONS_DIRECTORY), {
		recursive: true,
	});
	await writeWhole(
		versionFile(recordsDirectory, digest),
		`${JSON.stringify({ files: canonicalFiles(files) })}\n`,
	);
	await appendToLog(await logDirectory(recordsDirectory, source), digest);

	return { kind: "version", digest };
}

/** The versions one source has been measured at, oldest first. */
export async function corpusVersionLog(
	recordsDirectory: string,
	source: CorpusRoot,
): Promise<readonly string[]> {
	const entries = await readLog(await logDirectory(recordsDirectory, source));

	return entries.map(({ digest }) => digest);
}

export class CorpusVersionError extends Error {
	public override name = "CorpusVersionError";
}

const DIGEST = /^[0-9a-f]{64}$/u;

export async function readCorpusVersion(
	recordsDirectory: string,
	digest: string,
): Promise<readonly HashedFile[]> {
	if (!DIGEST.test(digest)) {
		throw new CorpusVersionError(`${digest} is not a corpus version digest`);
	}

	const text = await textIfPresent(versionFile(recordsDirectory, digest));
	if (text === undefined) {
		throw new CorpusVersionError(`No corpus version ${digest} is recorded`);
	}

	return versionManifestSchema.parse(JSON.parse(text)).files;
}

/** The files a measurement's version holds, none when it refused. */
export function measuredCorpusFiles(
	recordsDirectory: string,
	measurement: CorpusMeasurement,
): Promise<readonly HashedFile[]> {
	return measurement.kind === "version"
		? readCorpusVersion(recordsDirectory, measurement.digest)
		: Promise.resolve([]);
}

/**
 * A version's file is found through its manifest, never by a raw hash or a
 * path, so only bytes a version holds can be opened through it.
 */
export async function readCorpusVersionFile(
	recordsDirectory: string,
	digest: string,
	layoutPath: string,
): Promise<Uint8Array> {
	const files = await readCorpusVersion(recordsDirectory, digest);
	const file = files.find(({ path }) => path === layoutPath);
	if (file === undefined) {
		throw new CorpusVersionError(
			`Corpus version ${digest} holds no file ${layoutPath}`,
		);
	}

	return Bun.file(blobFile(recordsDirectory, file.sha256)).bytes();
}

export type FoundCorpusVersion =
	| { readonly kind: "found"; readonly digest: string }
	| { readonly kind: "ambiguous"; readonly candidates: readonly string[] }
	| { readonly kind: "missing" };

const MANIFEST_NAME = /^(?<digest>[0-9a-f]{64})\.json$/u;

/**
 * Versions are content, so a prefix is matched against every version this
 * records directory holds, whichever source measured it. The prefix is only
 * compared against listed names, never joined into a path.
 */
export async function findCorpusVersion(
	recordsDirectory: string,
	prefix: string,
): Promise<FoundCorpusVersion> {
	const wanted = prefix.startsWith(CORPUS_VERSION_LABEL)
		? prefix.slice(CORPUS_VERSION_LABEL.length)
		: prefix;
	if (wanted === "") {
		return { kind: "missing" };
	}

	const names =
		(await readdirIfPresent(
			join(storeDirectory(recordsDirectory), VERSIONS_DIRECTORY),
		)) ?? [];
	const candidates = names
		.map((name) => MANIFEST_NAME.exec(name)?.groups?.["digest"])
		.filter((digest) => digest !== undefined)
		.filter((digest) => digest.startsWith(wanted))
		.toSorted();

	const [only] = candidates;
	if (only === undefined) {
		return { kind: "missing" };
	}
	if (candidates.length > 1) {
		return { kind: "ambiguous", candidates };
	}

	return { kind: "found", digest: only };
}

/**
 * How many log positions a record's version sits behind the corpus under
 * test, or why that cannot be said. Stale or clean never comes from here.
 */
export type VersionDistance =
	| { readonly kind: "measured"; readonly versions: number }
	| { readonly kind: "not-recorded"; readonly reason: string };

export interface CorpusUnderTest {
	/**
	 * The log entry the last edit started from: the one before the corpus
	 * under test's position, undefined when the log holds none or the corpus
	 * under test refused.
	 */
	readonly previousVersion: string | undefined;
	readonly distanceOf: (
		measurement: CorpusMeasurement | undefined,
	) => VersionDistance;
}

function notRecorded(reason: string): VersionDistance {
	return { kind: "not-recorded", reason };
}

/**
 * The corpus under test, hashed but not measured, so reading a distance adds
 * no version to its log. Its position is the latest entry's when their
 * digests match and one past it otherwise, and a version is placed at the
 * latest position it holds, so a revert counts from where it came back.
 */
export async function readCorpusUnderTest(
	recordsDirectory: string,
	source: CorpusRoot,
): Promise<CorpusUnderTest> {
	const layout = await hashCorpusLayout(source);
	const log = await corpusVersionLog(recordsDirectory, source);
	const current =
		layout.refusals.length === 0
			? corpusVersionDigest(layout.files)
			: undefined;
	const livePosition = log.at(-1) === current ? log.length : log.length + 1;

	return {
		previousVersion:
			current === undefined || livePosition < 2
				? undefined
				: log[livePosition - 2],
		distanceOf(measurement) {
			if (measurement === undefined) {
				return notRecorded("recorded before corpus versions");
			}
			if (measurement.kind === "refused") {
				return notRecorded(
					`the attempt measured no version: ${measurement.refusal}`,
				);
			}
			if (current === undefined) {
				return notRecorded(
					`the corpus under test refused: ${layout.refusals.join("; ")}`,
				);
			}
			if (measurement.digest === current) {
				return { kind: "measured", versions: 0 };
			}

			const position = log.lastIndexOf(measurement.digest) + 1;
			if (position === 0) {
				return notRecorded(
					"its version is not in the log of the corpus under test",
				);
			}

			return { kind: "measured", versions: livePosition - position };
		},
	};
}
