import { afterEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { directorySource } from "./run-records-test-support";
import {
	STYLE,
	styleEntry,
	withStyle,
} from "./staleness-loaded-file-test-fixtures";
import ReadManifestFixtures from "./staleness-manifest-test-fixtures";
import { checkpointStaleness } from "./staleness-report";
import {
	discussManifest,
	planningRubricNow,
} from "./staleness-rubric-test-fixtures";

const SECOND_RUN_STALENESS_INDEX = 1;

const fixtures = new ReadManifestFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function stalesACheckpointWhoseLoadedFileBeyondItsCapturedFilesChangedAndItsDownstreamStages(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	await withStyle(corpus, "style\n");
	await fixture.corpus.recordReadManifest("discuss", [
		...discussManifest(await planningRubricNow()),
		styleEntry("style\n"),
	]);
	await Bun.write(join(corpus, STYLE), "edited\n");

	const report = await checkpointStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	const run = report.records.filter(({ id }) =>
		id.startsWith(`checkpoint:${fixture.replayableRun}/`),
	);
	expect(run).toMatchObject([
		{ stale: false },
		{
			causes: [`${STYLE} changed`],
			changedFiles: [{ change: "changed", path: STYLE }],
			onlyCorpusFiles: true,
			stale: true,
		},
		{
			causes: ["upstream stage discuss is stale"],
			changedFiles: [],
			stale: true,
		},
	]);
	expect(
		run[SECOND_RUN_STALENESS_INDEX]?.readManifest.find(
			({ path }) => path === STYLE,
		)?.state,
	).toBe("changed");
	expect(
		run[SECOND_RUN_STALENESS_INDEX]?.readFiles.map(({ path }) => path),
	).toContain(STYLE);
}

async function keepsACheckpointFreshWhileItsLoadedFileBeyondItsCapturedFilesHashesAsRecorded(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	await withStyle(corpus, "style\n");
	await fixture.corpus.recordReadManifest("discuss", [
		...discussManifest(await planningRubricNow()),
		styleEntry("style\n"),
	]);

	const report = await checkpointStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	const discuss = report.records.find(
		({ id }) => id === `checkpoint:${fixture.replayableRun}/discuss`,
	);
	expect(discuss).toMatchObject({ causes: [], stale: false });
	expect(discuss?.readManifest.find(({ path }) => path === STYLE)?.state).toBe(
		"unchanged",
	);
}

async function judgesALoadedFileBeyondTheCapturedFilesOnceTheStageCapturesItNow(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	const extra = "skills/discuss/references/extra.md";
	await mkdir(join(corpus, "skills", "discuss", "references"), {
		recursive: true,
	});
	await Bun.write(join(corpus, extra), "extra\n");
	await fixture.corpus.recordReadManifest("discuss", [
		...discussManifest(await planningRubricNow()),
		{ ...styleEntry("extra\n"), path: extra },
	]);

	const report = await checkpointStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.unreadable).toEqual([]);
	expect(
		report.records.find(
			({ id }) => id === `checkpoint:${fixture.replayableRun}/discuss`,
		),
	).toMatchObject({ causes: [], stale: false });
}

async function namesALoadedFileBeyondTheCapturedFilesTheCorpusNoLongerHoldsAsRemoved(): Promise<void> {
	const { fixture, corpus } = await fixtures.recordedFixture();
	await fixture.corpus.recordReadManifest("discuss", [
		...discussManifest(await planningRubricNow()),
		styleEntry("style\n"),
	]);

	const report = await checkpointStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(
		report.records.find(
			({ id }) => id === `checkpoint:${fixture.replayableRun}/discuss`,
		),
	).toMatchObject({ causes: [`${STYLE} removed`], stale: true });
}

async function stalesACheckpointWhoseLoadedFileBeyondItsCapturedFilesNowLinksOutOfTheCorpusNamingNoAbsolutePath(): Promise<void> {
	const { fixture, corpus, outside } = await fixtures.escapedStyleFixture();

	const report = await checkpointStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	const discuss = report.records.find(
		({ id }) => id === `checkpoint:${fixture.replayableRun}/discuss`,
	);
	expect(discuss?.stale).toBe(true);
	expect(discuss?.onlyCorpusFiles).toBe(false);
	expect(discuss?.causes.join("\n")).toContain(STYLE);
	expect(discuss?.causes.join("\n")).not.toContain(corpus);
	expect(discuss?.causes.join("\n")).not.toContain(outside);
}

describe("staleness over read manifests", () => {
	it(
		"stales a checkpoint whose loaded file beyond its captured files changed, and its downstream stages",
		stalesACheckpointWhoseLoadedFileBeyondItsCapturedFilesChangedAndItsDownstreamStages,
	);
	it(
		"keeps a checkpoint fresh while its loaded file beyond its captured files hashes as recorded",
		keepsACheckpointFreshWhileItsLoadedFileBeyondItsCapturedFilesHashesAsRecorded,
	);
	it(
		"judges a loaded file beyond the captured files once the stage captures it now",
		judgesALoadedFileBeyondTheCapturedFilesOnceTheStageCapturesItNow,
	);
	it(
		"names a loaded file beyond the captured files the corpus no longer holds as removed",
		namesALoadedFileBeyondTheCapturedFilesTheCorpusNoLongerHoldsAsRemoved,
	);
	it(
		"stales a checkpoint whose loaded file beyond its captured files now links out of the corpus, naming no absolute path",
		stalesACheckpointWhoseLoadedFileBeyondItsCapturedFilesNowLinksOutOfTheCorpusNamingNoAbsolutePath,
	);
});
