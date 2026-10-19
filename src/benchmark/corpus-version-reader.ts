import { join } from "node:path";

import { z } from "zod";

import type { HashedFile } from "./checkpoint";
import { hashedFileSchema } from "./checkpoint";
import type { CorpusMeasurement } from "./corpus-measurement";
import { currentCorpusReadScope } from "./corpus-read-scope";
import { CORPUS_VERSION_LABEL } from "./corpus-version-label";
import {
	VERSIONS_DIRECTORY,
	blobFile,
	storeDirectory,
	versionFile,
} from "./corpus-version-storage";
import { readdirIfPresent, textIfPresent } from "./file-presence";

const SINGLE_ITEM_COUNT = 1;

const versionManifestSchema = z.object({
	files: z.array(hashedFileSchema),
});

class CorpusVersionError extends Error {
	public override name = "CorpusVersionError";
}

const DIGEST = /^[0-9a-f]{64}$/u;

async function readCorpusVersion(
	recordsDirectory: string,
	digest: string,
): Promise<readonly HashedFile[]> {
	const cache = currentCorpusReadScope()?.versions;
	const key = JSON.stringify([recordsDirectory, digest]);
	let pending = cache?.get(key);
	if (pending === undefined) {
		pending = readVersionManifest(recordsDirectory, digest);
		cache?.set(key, pending);
	}

	return await pending;
}

async function readVersionManifest(
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
async function measuredCorpusFiles(
	recordsDirectory: string,
	measurement: CorpusMeasurement,
): Promise<readonly HashedFile[]> {
	return await (measurement.kind === "version"
		? readCorpusVersion(recordsDirectory, measurement.digest)
		: Promise.resolve([]));
}

/**
 * A version's file is found through its manifest, never by a raw hash or a
 * path, so only bytes a version holds can be opened through it.
 */
async function readCorpusVersionFile(
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

	return await Bun.file(blobFile(recordsDirectory, file.sha256)).bytes();
}

type FoundCorpusVersion =
	| { readonly kind: "found"; readonly digest: string }
	| { readonly kind: "ambiguous"; readonly candidates: readonly string[] }
	| { readonly kind: "missing" };

const MANIFEST_NAME = /^(?<digest>[0-9a-f]{64})\.json$/u;

/**
 * Versions are content, so a prefix is matched against every version this
 * records directory holds, whichever source measured it. The prefix is only
 * compared against listed names, never joined into a path.
 */
async function findCorpusVersion(
	recordsDirectory: string,
	prefix: string,
): Promise<FoundCorpusVersion> {
	const wanted = prefix.startsWith(CORPUS_VERSION_LABEL)
		? prefix.slice(CORPUS_VERSION_LABEL.length)
		: prefix;
	if (wanted === "") {
		return { kind: "missing" };
	}

	const candidates = await matchingVersionDigests(recordsDirectory, wanted);

	const [only] = candidates;
	if (only === undefined) {
		return { kind: "missing" };
	}

	if (candidates.length > SINGLE_ITEM_COUNT) {
		return { candidates, kind: "ambiguous" };
	}

	return { digest: only, kind: "found" };
}

async function matchingVersionDigests(
	recordsDirectory: string,
	wanted: string,
): Promise<readonly string[]> {
	const names =
		(await readdirIfPresent(
			join(storeDirectory(recordsDirectory), VERSIONS_DIRECTORY),
		)) ?? [];
	return names
		.map((name) => MANIFEST_NAME.exec(name)?.groups?.["digest"])
		.filter((digest) => digest !== undefined)
		.filter((digest) => digest.startsWith(wanted))
		.toSorted();
}

export {
	CorpusVersionError,
	readCorpusVersion,
	measuredCorpusFiles,
	readCorpusVersionFile,
	findCorpusVersion,
};
export type { FoundCorpusVersion };
