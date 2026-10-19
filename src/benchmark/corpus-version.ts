import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { canonicalFiles } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import hashCorpusLayout from "./corpus-layout";
import type { CorpusMeasurement } from "./corpus-measurement";
import { appendToLog } from "./corpus-version-log";
import {
	VERSIONS_DIRECTORY,
	corpusVersionDigest,
	logDirectory,
	storeDirectory,
	storeFiles,
	versionFile,
	writeWhole,
} from "./corpus-version-storage";

const EMPTY_COLLECTION_LENGTH = 0;

/**
 * Measures the whole corpus layout of one source, keeps every file body and
 * the version's manifest in the records directory, and adds the version to
 * the source's log when it differs from the latest entry there.
 */
async function measureCorpusVersion(
	recordsDirectory: string,
	source: CorpusRoot,
): Promise<CorpusMeasurement> {
	const layout = await hashCorpusLayout(source);
	if (layout.refusals.length > EMPTY_COLLECTION_LENGTH) {
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

	return { digest, kind: "version" };
}

export { measureCorpusVersion };
export { corpusVersionDigest, writeWhole } from "./corpus-version-storage";
export { corpusVersionLog } from "./corpus-version-log";
export {
	CorpusVersionError,
	readCorpusVersion,
	measuredCorpusFiles,
	readCorpusVersionFile,
	findCorpusVersion,
} from "./corpus-version-reader";
export { default as readCorpusUnderTest } from "./corpus-version-distance";
export type { FoundCorpusVersion } from "./corpus-version-reader";
export type {
	VersionDistance,
	CorpusUnderTest,
} from "./corpus-version-distance";
