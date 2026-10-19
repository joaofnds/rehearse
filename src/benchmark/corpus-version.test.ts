import { describe, expect, it } from "bun:test";
import { mkdir, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	corpusVersionLog,
	measureCorpusVersion,
	readCorpusVersionFile,
} from "./corpus-version";
import {
	OCTAL_RADIX,
	PERMISSION_DIGIT_SUFFIX_OFFSET,
	createVersionWorkspace,
	versionDigest,
} from "./corpus-version-test-fixtures";

const { recordsDirectory, scratch, source } = createVersionWorkspace();

async function logsTwoMeasuredStatesInTheOrderTheyWereMeasured(): Promise<void> {
	const first = versionDigest(
		await measureCorpusVersion(recordsDirectory, source),
	);
	await writeFile(join(source.root, "output-styles", "brief.md"), "edited\n");

	const second = versionDigest(
		await measureCorpusVersion(recordsDirectory, source),
	);

	expect(await corpusVersionLog(recordsDirectory, source)).toEqual([
		first,
		second,
	]);
}

async function keepsAVersionSFileBytesAfterTheSourceFileIsRewritten(): Promise<void> {
	const first = versionDigest(
		await measureCorpusVersion(recordsDirectory, source),
	);
	await writeFile(join(source.root, "output-styles", "brief.md"), "edited\n");

	const bytes = await readCorpusVersionFile(
		recordsDirectory,
		first,
		"output-styles/brief.md",
	);

	expect(new TextDecoder().decode(bytes)).toBe("brief\n");
}

async function addsNoEntryWhenTheSourceHasNotChangedSinceTheLatestOne(): Promise<void> {
	const first = versionDigest(
		await measureCorpusVersion(recordsDirectory, source),
	);

	await measureCorpusVersion(recordsDirectory, source);

	expect(await corpusVersionLog(recordsDirectory, source)).toEqual([first]);
}

async function logsARevertAsANewEntrySinceOrderIsPositionRatherThanIdentity(): Promise<void> {
	const first = versionDigest(
		await measureCorpusVersion(recordsDirectory, source),
	);
	await writeFile(join(source.root, "output-styles", "brief.md"), "edited\n");
	const second = versionDigest(
		await measureCorpusVersion(recordsDirectory, source),
	);
	await writeFile(join(source.root, "output-styles", "brief.md"), "brief\n");

	await measureCorpusVersion(recordsDirectory, source);

	expect(await corpusVersionLog(recordsDirectory, source)).toEqual([
		first,
		second,
		first,
	]);
}

async function addsOneEntryWhenSeveralProcessesMeasureOneNewStateAtOnce(): Promise<void> {
	const expectedMeasurementExitCode = 0;

	const expectedCorpusVersionLogCount = 1;

	const script = `
			import { measureCorpusVersion } from ${JSON.stringify(join(import.meta.dir, "corpus-version.ts"))};
			await measureCorpusVersion(${JSON.stringify(recordsDirectory)}, ${JSON.stringify(source)});
		`;

	const exits = await Promise.all(
		Array.from(
			{ length: 6 },
			async () =>
				await Bun.spawn(["bun", "-e", script], {
					env: { ...Bun.env },
				}).exited,
		),
	);

	expect(exits).toEqual([
		expectedMeasurementExitCode,
		expectedMeasurementExitCode,
		expectedMeasurementExitCode,
		expectedMeasurementExitCode,
		expectedMeasurementExitCode,
		expectedMeasurementExitCode,
	]);
	expect(await corpusVersionLog(recordsDirectory, source)).toHaveLength(
		expectedCorpusVersionLogCount,
	);
}

async function keepsLoggingNewStatesAfterAnEntryGoesMissing(): Promise<void> {
	const first = versionDigest(
		await measureCorpusVersion(recordsDirectory, source),
	);
	await writeFile(join(source.root, "output-styles", "brief.md"), "edited\n");
	const second = versionDigest(
		await measureCorpusVersion(recordsDirectory, source),
	);
	const logs = join(recordsDirectory, "corpus-versions", "logs");
	const [log] = await readdir(logs);
	await rm(join(logs, log ?? "", "1"));
	await writeFile(join(source.root, "output-styles", "brief.md"), "again\n");

	const third = versionDigest(
		await measureCorpusVersion(recordsDirectory, source),
	);

	expect(first).not.toBe(second);
	expect(await corpusVersionLog(recordsDirectory, source)).toEqual([
		second,
		third,
	]);
}

async function keepsTheStoredFileBodiesReadableByTheirOwnerOnly(): Promise<void> {
	await measureCorpusVersion(recordsDirectory, source);
	const blobs = join(recordsDirectory, "corpus-versions", "blobs");

	const names = await readdir(blobs);
	const modes = await Promise.all(
		names.map(async (blob) => {
			const found = await stat(join(blobs, blob));

			return found.mode
				.toString(OCTAL_RADIX)
				.slice(PERMISSION_DIGIT_SUFFIX_OFFSET);
		}),
	);

	expect(modes).toEqual(["600", "600"]);
}

async function logsASourceReachedThroughASymbolicLinkInTheLogOfTheDirectoryItNames(): Promise<void> {
	const alias = join(scratch, "alias");
	await symlink(source.root, alias);

	const digest = versionDigest(
		await measureCorpusVersion(recordsDirectory, {
			kind: "directory",
			root: alias,
		}),
	);

	expect(await corpusVersionLog(recordsDirectory, source)).toEqual([digest]);
}

async function namesTheSameTreeByTheDigestTheCorpusReportShowedForIt(): Promise<void> {
	const expectedDigestCount = 64;

	const root = join(scratch, "report-fixture");
	await mkdir(join(root, "skills", "build"), { recursive: true });
	await mkdir(join(root, "skills", "discuss"), { recursive: true });
	await writeFile(join(root, "CLAUDE.md"), "instructions\n");
	await writeFile(join(root, "skills", "build", "SKILL.md"), "build skill\n");
	await writeFile(
		join(root, "skills", "discuss", "SKILL.md"),
		"discuss skill\n",
	);

	const digest = versionDigest(
		await measureCorpusVersion(recordsDirectory, {
			kind: "directory",
			root,
		}),
	);

	expect(digest).toStartWith("4e196b");
	expect(digest).toHaveLength(expectedDigestCount);
}

async function yieldsTheRefusalAndLogsNoVersion(): Promise<void> {
	const outside = join(scratch, "outside.md");
	await writeFile(outside, "outside\n");
	await symlink(outside, join(source.root, "output-styles", "escape.md"));

	const measurement = await measureCorpusVersion(recordsDirectory, source);

	expect(measurement).toEqual({
		kind: "refused",
		refusal:
			"output-styles/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
	});
	expect(await corpusVersionLog(recordsDirectory, source)).toEqual([]);
}

describe(measureCorpusVersion.name, () => {
	it(
		"logs two measured states in the order they were measured",
		logsTwoMeasuredStatesInTheOrderTheyWereMeasured,
	);
	it(
		"keeps a version's file bytes after the source file is rewritten",
		keepsAVersionSFileBytesAfterTheSourceFileIsRewritten,
	);
	it(
		"adds no entry when the source has not changed since the latest one",
		addsNoEntryWhenTheSourceHasNotChangedSinceTheLatestOne,
	);
	it(
		"logs a revert as a new entry, since order is position rather than identity",
		logsARevertAsANewEntrySinceOrderIsPositionRatherThanIdentity,
	);
	it(
		"adds one entry when several processes measure one new state at once",
		addsOneEntryWhenSeveralProcessesMeasureOneNewStateAtOnce,
	);
	it(
		"keeps logging new states after an entry goes missing",
		keepsLoggingNewStatesAfterAnEntryGoesMissing,
	);
	it(
		"keeps the stored file bodies readable by their owner only",
		keepsTheStoredFileBodiesReadableByTheirOwnerOnly,
	);
	it(
		"logs a source reached through a symbolic link in the log of the directory it names",
		logsASourceReachedThroughASymbolicLinkInTheLogOfTheDirectoryItNames,
	);
	it(
		"names the same tree by the digest the corpus report showed for it",
		namesTheSameTreeByTheDigestTheCorpusReportShowedForIt,
	);

	describe("when a layout entry is refused", () => {
		it(
			"yields the refusal and logs no version",
			yieldsTheRefusalAndLogsNoVersion,
		);
	});
});
