import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { HashedFile } from "./checkpoint";
import { canonicalFiles, hashedFileSchema } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import type { CorpusMeasurement } from "./corpus-measurement";
import { hashCorpusLayout } from "./corpus-layout";
import { readdirIfPresent, textIfPresent } from "./file-presence";

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
 * The same canonical list the corpus report has always hashed, in full, so a
 * version's first six characters are the digest that report showed for the
 * same tree.
 */
function versionDigestOf(files: readonly HashedFile[]): string {
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
 * One log per corpus source root, named by a hash of the root so a path
 * never has to become a directory name.
 */
function logDirectory(recordsDirectory: string, source: CorpusRoot): string {
	return join(
		storeDirectory(recordsDirectory),
		LOGS_DIRECTORY,
		sha256(resolve(source.root)),
	);
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
	await writeFile(temporary, contents);
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

const POSITION_NAME = /^[1-9]\d*$/u;

function positions(names: readonly string[]): number[] {
	return names
		.filter((name) => POSITION_NAME.test(name))
		.map(Number)
		.toSorted((left, right) => left - right);
}

async function readLog(directory: string): Promise<string[]> {
	const digests: string[] = [];
	for (const position of positions((await readdirIfPresent(directory)) ?? [])) {
		const text = await textIfPresent(join(directory, String(position)));
		if (text !== undefined) {
			digests.push(text.trim());
		}
	}

	return digests;
}

/**
 * An entry is linked into place from a file already holding its digest, so
 * the create is exclusive and no reader sees an empty entry. A writer that
 * loses the race re-reads the log before trying again, which is what keeps
 * two measurements of one new state to one entry.
 */
async function appendToLog(directory: string, digest: string): Promise<void> {
	await mkdir(directory, { recursive: true });
	const temporary = join(directory, `${randomUUID()}.tmp`);
	await writeFile(temporary, `${digest}\n`);

	try {
		for (;;) {
			const log = await readLog(directory);
			if (log.at(-1) === digest) {
				return;
			}

			try {
				await link(temporary, join(directory, String(log.length + 1)));

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
	const digest = versionDigestOf(files);
	await mkdir(join(storeDirectory(recordsDirectory), VERSIONS_DIRECTORY), {
		recursive: true,
	});
	await writeWhole(
		versionFile(recordsDirectory, digest),
		`${JSON.stringify({ files: canonicalFiles(files) })}\n`,
	);
	await appendToLog(logDirectory(recordsDirectory, source), digest);

	return { kind: "version", digest };
}

/** The versions one source has been measured at, oldest first. */
export function corpusVersionLog(
	recordsDirectory: string,
	source: CorpusRoot,
): Promise<readonly string[]> {
	return readLog(logDirectory(recordsDirectory, source));
}

export class CorpusVersionError extends Error {
	public override name = "CorpusVersionError";
}

export async function readCorpusVersion(
	recordsDirectory: string,
	digest: string,
): Promise<readonly HashedFile[]> {
	const text = await textIfPresent(versionFile(recordsDirectory, digest));
	if (text === undefined) {
		throw new CorpusVersionError(`No corpus version ${digest} is recorded`);
	}

	return versionManifestSchema.parse(JSON.parse(text)).files;
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

export const CORPUS_VERSION_LABEL = "corpus@";
const VERSION_LABEL_LENGTH = 6;

/** How a version is named wherever it is shown: the label and six hex characters. */
export function corpusVersionLabel(digest: string): string {
	return `${CORPUS_VERSION_LABEL}${digest.slice(0, VERSION_LABEL_LENGTH)}`;
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
