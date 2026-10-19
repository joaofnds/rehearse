import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import writeComparisonReport from "#benchmark/comparison-command";
import {
	SHA256_HEX_CHARACTERS,
	digest as sha256Of,
} from "#benchmark/comparison-evidence-record-test-fixtures";
import { ComparisonEvidenceFixture } from "#benchmark/comparison-evidence-test-support";
import { comparisonReportPaths } from "#benchmark/run-layout";
import { RecordedRunsFixture } from "#benchmark/run-records-test-support";

const RESOURCE_DRAIN_START_INDEX = 0;

const roots: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	roots.push(root);

	return root;
}

async function writtenFixture(
	runsDirectory: string,
): Promise<RecordedRunsFixture> {
	const fixture = new RecordedRunsFixture(runsDirectory);

	await fixture.write();

	return fixture;
}

const corruptDigest = "a".repeat(SHA256_HEX_CHARACTERS);

const missingReportDigest = "b".repeat(SHA256_HEX_CHARACTERS);

const unrecognizedReportDigest = "d".repeat(SHA256_HEX_CHARACTERS);

async function fixtureWithUnreadableComparisons(
	runsDirectory: string,
): Promise<RecordedRunsFixture> {
	const fixture = await writtenFixture(runsDirectory);
	const corrupt = comparisonReportPaths(fixture.runsDirectory, corruptDigest);
	await mkdir(corrupt.directory, { recursive: true });
	await Bun.write(corrupt.reportFile, "{ not json");
	await mkdir(
		comparisonReportPaths(fixture.runsDirectory, missingReportDigest).directory,
		{ recursive: true },
	);
	const unrecognizedReport = comparisonReportPaths(
		fixture.runsDirectory,
		unrecognizedReportDigest,
	);
	await mkdir(unrecognizedReport.directory, { recursive: true });
	await Bun.write(unrecognizedReport.reportFile, '{ "mode": "session" }');

	return fixture;
}

async function oneCheckpointComparison(
	runsDirectory: string,
	change?: (fixture: ComparisonEvidenceFixture) => Promise<void>,
): Promise<string> {
	const root = await temporaryDirectory("rehearse-what-moved-");
	const fixture = new ComparisonEvidenceFixture(root, ["build-checkpoint"]);

	await fixture.write();
	await change?.(fixture);
	await writeComparisonReport({
		manifestPath: fixture.manifestFile,
		runsDirectory,
	});

	return sha256Of(await Bun.file(fixture.manifestFile).text());
}

async function oneCheckpointReportText(): Promise<string> {
	const root = await temporaryDirectory("rehearse-attempts-");
	const fixture = new ComparisonEvidenceFixture(root, ["build-checkpoint"]);
	await fixture.write();
	const runsDirectory = join(root, "runs");
	await mkdir(runsDirectory);
	const reportFile = await writeComparisonReport({
		manifestPath: fixture.manifestFile,
		runsDirectory,
	});

	return await Bun.file(reportFile).text();
}

async function clearComparisonRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

export {
	temporaryDirectory,
	writtenFixture,
	corruptDigest,
	missingReportDigest,
	unrecognizedReportDigest,
	fixtureWithUnreadableComparisons,
	oneCheckpointComparison,
	oneCheckpointReportText,
	clearComparisonRoots,
};
