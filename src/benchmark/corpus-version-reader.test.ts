import { describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { withCorpusReadScope } from "./corpus-read-scope";
import {
	CorpusVersionError,
	measureCorpusVersion,
	measuredCorpusFiles,
	readCorpusVersion,
} from "./corpus-version";
import {
	createVersionWorkspace,
	versionDigest,
} from "./corpus-version-test-fixtures";

const { recordsDirectory, scratch, source } = createVersionWorkspace();

async function keepsDifferentSavedVersionsSeparateWithinOneReport(): Promise<void> {
	const first = versionDigest(
		await measureCorpusVersion(recordsDirectory, source),
	);
	await writeFile(
		join(source.root, "output-styles", "extra.md"),
		"extra style\n",
	);
	const second = versionDigest(
		await measureCorpusVersion(recordsDirectory, source),
	);

	const manifests = await withCorpusReadScope(
		async () =>
			await Promise.all([
				readCorpusVersion(recordsDirectory, first),
				readCorpusVersion(recordsDirectory, second),
			]),
	);

	expect(manifests.map((files) => files.map(({ path }) => path))).toEqual([
		["CLAUDE.md", "output-styles/brief.md"],
		["CLAUDE.md", "output-styles/brief.md", "output-styles/extra.md"],
	]);
}

async function reusesASavedVersionWithinAReportAndNoticesItsRemovalOnTheNextReport(): Promise<void> {
	const digest = versionDigest(
		await measureCorpusVersion(recordsDirectory, source),
	);

	const expected = await readCorpusVersion(recordsDirectory, digest);

	await withCorpusReadScope(async () => {
		await readCorpusVersion(recordsDirectory, digest);
		await rm(
			join(recordsDirectory, "corpus-versions", "versions", `${digest}.json`),
		);

		expect(await readCorpusVersion(recordsDirectory, digest)).toEqual(expected);
	});

	expect(
		withCorpusReadScope(
			async () => await readCorpusVersion(recordsDirectory, digest),
		),
	).rejects.toThrow(CorpusVersionError);
}

async function doesNotShareASavedVersionBetweenRecordsDirectories(): Promise<void> {
	const digest = versionDigest(
		await measureCorpusVersion(recordsDirectory, source),
	);

	await withCorpusReadScope(async () => {
		await readCorpusVersion(recordsDirectory, digest);

		expect(
			readCorpusVersion(join(scratch, "other-records"), digest),
		).rejects.toThrow(CorpusVersionError);
	});
}

async function refusesANameThatIsNotAFullVersionDigestBeforeReadingAnyFile(): Promise<void> {
	await mkdir(recordsDirectory, { recursive: true });
	await writeFile(
		join(recordsDirectory, "planted.json"),
		JSON.stringify({ files: [] }),
	);

	const reading = readCorpusVersion(recordsDirectory, "../../planted");

	expect(reading).rejects.toThrow(CorpusVersionError);
}

async function givesTheFilesAMeasuredVersionHoldsAsTheyWereMeasured(): Promise<void> {
	const measurement = await measureCorpusVersion(recordsDirectory, source);
	await writeFile(join(source.root, "output-styles", "brief.md"), "edited\n");

	const files = await measuredCorpusFiles(recordsDirectory, measurement);

	expect(files.map(({ path }) => path).toSorted()).toEqual([
		"CLAUDE.md",
		"output-styles/brief.md",
	]);
	expect(files.find(({ path }) => path === "output-styles/brief.md")).toEqual({
		path: "output-styles/brief.md",
		sha256: new Bun.CryptoHasher("sha256").update("brief\n").digest("hex"),
	});
}

async function givesNoFilesForAMeasurementThatRefused(): Promise<void> {
	const files = await measuredCorpusFiles(recordsDirectory, {
		kind: "refused",
		refusal: "skills is a symlink",
	});

	expect(files).toEqual([]);
}

describe(readCorpusVersion.name, () => {
	it(
		"keeps different saved versions separate within one report",
		keepsDifferentSavedVersionsSeparateWithinOneReport,
	);
	it(
		"reuses a saved version within a report and notices its removal on the next report",
		reusesASavedVersionWithinAReportAndNoticesItsRemovalOnTheNextReport,
	);
	it(
		"does not share a saved version between records directories",
		doesNotShareASavedVersionBetweenRecordsDirectories,
	);
	it(
		"refuses a name that is not a full version digest before reading any file",
		refusesANameThatIsNotAFullVersionDigestBeforeReadingAnyFile,
	);
});

describe(measuredCorpusFiles.name, () => {
	it(
		"gives the files a measured version holds as they were measured",
		givesTheFilesAMeasuredVersionHoldsAsTheyWereMeasured,
	);
	it(
		"gives no files for a measurement that refused",
		givesNoFilesForAMeasurementThatRefused,
	);
});
