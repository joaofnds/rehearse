import { afterEach, describe, expect, it } from "bun:test";

import { parseCheckpointRecord } from "./checkpoint";
import { parseComparisonReport } from "./comparison-record";
import { parseConfirmationGroupRecord } from "./confirmation-record";
import { loadRunManifest } from "./manifest";
import RecordedRunsTestResources from "./recorded-runs-fixture-test-resources";
import {
	benchmarkRunPaths,
	checkpointRecordFile,
	comparisonReportPaths,
	confirmationGroupPaths,
} from "./run-layout";
import { RecordedRunsFixture } from "./run-records-test-support";
import { parseSessionAttemptRecord } from "./session-record";
import { DEFAULT_STAGE_SETTINGS_FILE } from "./stage-settings";

const resources = new RecordedRunsTestResources();

const SHA256_HEX_DIGITS = 64;

async function recordsConstructedSettings(): Promise<void> {
	const settingsFile = {
		path: "stage-settings.json",
		sha256: "b".repeat(SHA256_HEX_DIGITS),
	};
	const fixture = await resources.fixture({ settingsFile });

	await fixture.write();

	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun);
	const recordText = await Bun.file(
		checkpointRecordFile(paths.checkpointDirectory("build")),
	).text();
	const record = parseCheckpointRecord(recordText);
	expect(record.settingsFile).toEqual(settingsFile);
}

async function recordsProductionSettings(): Promise<void> {
	const settingsFile = await RecordedRunsTestResources.productionSettings();
	const fixture = await resources.fixture({
		settingsFile,
	});

	await fixture.write();

	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun);
	const recordText = await Bun.file(
		checkpointRecordFile(paths.checkpointDirectory("build")),
	).text();
	const record = parseCheckpointRecord(recordText);
	expect(record.settingsFile).toEqual({
		path: DEFAULT_STAGE_SETTINGS_FILE,
		sha256: "11bda72f64c6c59c496abb5b31235a06ec175263636d6cfae134256c99fc365d",
	});
}

async function writesReadableManifest(): Promise<void> {
	const fixture = await resources.fixture();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun);

	await fixture.write();

	const manifest = await loadRunManifest(paths.manifestFile);

	expect(manifest.caseId).toBe("audit-log");
	expect(manifest.pipeline.stages.map(({ name }) => name)).toEqual([
		"discuss",
		"build",
	]);
}

async function writesReadableCheckpoint(): Promise<void> {
	const expectedCorpusFileCount = 1;

	const fixture = await resources.fixture();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun);

	await fixture.write();

	const recordText = await Bun.file(
		checkpointRecordFile(paths.checkpointDirectory("build")),
	).text();
	const record = parseCheckpointRecord(recordText);

	expect(record.stage).toBe("build");
	expect(record.corpusFiles).toHaveLength(expectedCorpusFileCount);
}

async function writesRunArtifact(): Promise<void> {
	const fixture = await resources.fixture();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun);

	await fixture.write();

	const artifact: unknown = JSON.parse(
		await Bun.file(paths.artifactFile).text(),
	);

	expect(artifact).toMatchObject({
		caseId: "audit-log",
		stageScorecards: [{ stage: "discuss" }, { stage: "build" }],
		status: "COMPLETE",
	});
}

async function writesUnreplayableRun(): Promise<void> {
	const fixture = await resources.fixture();
	const paths = benchmarkRunPaths(
		fixture.runsDirectory,
		fixture.unreplayableRun,
	);

	await fixture.write();

	expect(await Bun.file(paths.manifestFile).exists()).toBe(false);
	expect(await Bun.file(paths.artifactFile).exists()).toBe(true);
}

async function writesReadableGroup(): Promise<void> {
	const fixture = await resources.fixture();
	const paths = confirmationGroupPaths(fixture.runsDirectory, fixture.groupId);

	await fixture.write();

	const record = parseConfirmationGroupRecord(
		await Bun.file(paths.groupFile).text(),
	);

	expect(record.caseId).toBe("audit-log");
	expect(record.reps).toBe(record.repRecords.length);
}

async function writesReadableComparison(): Promise<void> {
	const expectedCaseCount = 2;

	const fixture = await resources.fixture();
	const paths = comparisonReportPaths(
		fixture.runsDirectory,
		fixture.comparisonDigest,
	);

	await fixture.write();

	const report = parseComparisonReport(await Bun.file(paths.reportFile).text());

	expect(report.cases).toHaveLength(expectedCaseCount);
}

async function writesReadableSessionAttempt(): Promise<void> {
	const fixture = await resources.fixture();

	await fixture.write();

	const record = parseSessionAttemptRecord(
		await Bun.file(fixture.sessionAttemptFile).text(),
	);

	expect(record.caseId).toBe(fixture.sessionAttempt.caseId);
	expect(record.outcome).toBe("SUCCESSFUL");
}

describe(RecordedRunsFixture.name, () => {
	afterEach(resources.cleanup);
	it(
		"records the settings evidence it was constructed with on an ordinary checkpoint",
		recordsConstructedSettings,
	);
	it(
		"records the production default selection and digest on an ordinary checkpoint",
		recordsProductionSettings,
	);
	it(
		"writes a run manifest the manifest loader parses",
		writesReadableManifest,
	);
	it(
		"writes each checkpoint where the checkpoint parser reads it",
		writesReadableCheckpoint,
	);
	it(
		"writes a run artifact holding one scorecard per declared stage",
		writesRunArtifact,
	);
	it(
		"writes a run directory with no manifest as the unreplayable run",
		writesUnreplayableRun,
	);
	it(
		"writes a confirmation group the group parser reads at its layout path",
		writesReadableGroup,
	);
	it(
		"writes a comparison report the report parser reads at its digest path",
		writesReadableComparison,
	);
	it(
		"writes a session attempt the attempt parser reads under its case and uuid",
		writesReadableSessionAttempt,
	);
});
