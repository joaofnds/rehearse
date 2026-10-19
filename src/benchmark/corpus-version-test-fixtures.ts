import { afterEach, beforeEach } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CorpusRoot } from "./corpus-file";
import { measureCorpusVersion } from "./corpus-version";

const OCTAL_RADIX = 8;

const PERMISSION_DIGIT_SUFFIX_OFFSET = -3;

const CORPUS_VERSION_PREVIEW_CHARACTERS = 6;

const COLLIDING_VERSION_PREFIX_CHARACTERS = 1;

const PREFIX_START_INDEX = 0;

const SHA256_HEX_DIGITS = 64;

function versionDigest(
	measurement: Awaited<ReturnType<typeof measureCorpusVersion>>,
): string {
	if (measurement.kind !== "version") {
		throw new Error(`expected a version, got ${measurement.refusal}`);
	}

	return measurement.digest;
}
interface VersionWorkspace {
	readonly scratch: string;
	readonly recordsDirectory: string;
	readonly source: CorpusRoot;
	readonly measureWith: (contents: string) => Promise<string>;
}
function createVersionWorkspace(): VersionWorkspace {
	const scratch = join(tmpdir(), `rehearse-corpus-version-${randomUUID()}`);
	const recordsDirectory = join(scratch, "records");
	const source: CorpusRoot = {
		kind: "directory",
		root: join(scratch, "corpus"),
	};
	beforeEach(async () => {
		await mkdir(scratch, { recursive: true });
		await mkdir(join(source.root, "output-styles"), { recursive: true });
		await writeFile(join(source.root, "CLAUDE.md"), "instructions\n");
		await writeFile(join(source.root, "output-styles", "brief.md"), "brief\n");
	});
	afterEach(async () => {
		await rm(scratch, { force: true, recursive: true });
	});
	async function measureWith(contents: string): Promise<string> {
		await writeFile(join(source.root, "output-styles", "brief.md"), contents);

		return versionDigest(await measureCorpusVersion(recordsDirectory, source));
	}

	return { measureWith, recordsDirectory, scratch, source };
}
export {
	OCTAL_RADIX,
	PERMISSION_DIGIT_SUFFIX_OFFSET,
	CORPUS_VERSION_PREVIEW_CHARACTERS,
	COLLIDING_VERSION_PREFIX_CHARACTERS,
	PREFIX_START_INDEX,
	SHA256_HEX_DIGITS,
	versionDigest,
	createVersionWorkspace,
};
