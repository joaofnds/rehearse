import { afterEach, describe, expect, it } from "bun:test";

import { measureCorpusVersion } from "#benchmark/corpus-version";
import { directorySource } from "#benchmark/run-records-test-support";
import {
	clearCorpusReportRoots,
	fullCorpusDirectory,
	runsDirectory,
} from "#server/corpus-report-workspace-test-fixture";

import { corpusReport } from "./corpus-report";

afterEach(clearCorpusReportRoots);

describe(corpusReport.name, () => {
	it(
		"identifies a fixed tree by the same digest on every machine",
		verifyIdentifiesAFixedTreeByTheSameDigestOn,
	);

	it(
		"names the live tree by the version a measurement of it records",
		verifyNamesTheLiveTreeByTheVersionAMeasurement,
	);
});

async function verifyIdentifiesAFixedTreeByTheSameDigestOn(): Promise<void> {
	const root = await fullCorpusDirectory();

	const report = await corpusReport(
		directorySource(root),
		await runsDirectory(),
	);

	expect(report.digest).toStartWith("4e196b");
}

async function verifyNamesTheLiveTreeByTheVersionAMeasurement(): Promise<void> {
	const root = await fullCorpusDirectory();
	const measured = await measureCorpusVersion(
		await runsDirectory(),
		directorySource(root),
	);

	const report = await corpusReport(
		directorySource(root),
		await runsDirectory(),
	);

	expect(measured.kind === "version" ? measured.digest : "refused").toBe(
		report.digest ?? "withheld",
	);
}
