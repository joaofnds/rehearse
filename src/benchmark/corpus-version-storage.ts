import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { HashedFile } from "./checkpoint";
import { canonicalFiles } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";

const STORE_DIRECTORY = "corpus-versions";

const BLOBS_DIRECTORY = "blobs";

const VERSIONS_DIRECTORY = "versions";

const LOGS_DIRECTORY = "logs";

function sha256(bytes: string | Readonly<Uint8Array>): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The version a hashed layout is: the same canonical list the corpus report
 * has always hashed, in full, so a version's first six characters are the
 * digest that report showed for the same tree.
 */
function corpusVersionDigest(files: readonly HashedFile[]): string {
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
	let root = resolve(source.root);

	try {
		root = await realpath(source.root);
	} catch (error) {
		if (
			!(error instanceof Error && "code" in error && error.code === "ENOENT")
		) {
			throw error;
		}
	}

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

	await Array.fromAsync(paths, async (path) => {
		const bytes = await Bun.file(join(source.root, path)).bytes();
		const sha = sha256(bytes);
		await writeWhole(blobFile(recordsDirectory, sha), bytes);
		stored.push({ path, sha256: sha });
	});

	return stored;
}

export {
	VERSIONS_DIRECTORY,
	sha256,
	corpusVersionDigest,
	storeDirectory,
	blobFile,
	versionFile,
	logDirectory,
	writeWhole,
	storeFiles,
};
