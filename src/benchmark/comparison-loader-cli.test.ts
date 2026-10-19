import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { runCommand } from "./command";
import comparisonExternalCallTraps from "./comparison-external-call-traps-fixture";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import { comparisonReportLocation } from "./comparison-output-fixtures";
import { parseComparisonReport } from "./comparison-record";
import directoryDigests from "./comparison-source-digests";
import { CONTROL_DIR, recordsDirectory } from "./config";

const EXPECTED_CASE_COUNT = 2;

describe(loadComparisonEvidence.name, () => {
	const { fixture, temporaryDirectory, trackReportFile } =
		comparisonLoaderTestFixture();

	it("writes one read-only comparison report without external execution", async () => {
		const { manifestSha, reportFile: expectedReportFile } =
			await comparisonReportLocation({
				manifestFile: fixture.manifestFile,
				runsDirectory: recordsDirectory(),
			});
		const { externalCallMarker, trapsDirectory } =
			await comparisonExternalCallTraps(temporaryDirectory);
		const before = await directoryDigests(temporaryDirectory);

		const output = await runCommand(
			[
				process.execPath,
				"run",
				join(CONTROL_DIR, "rehearse.ts"),
				"compare",
				fixture.manifestFile,
			],
			CONTROL_DIR,
			{
				env: {
					EXTERNAL_CALL_MARKER: externalCallMarker,
					PATH: `${trapsDirectory}:${Bun.env["PATH"] ?? ""}`,
				},
			},
		);
		trackReportFile(expectedReportFile);
		const after = await directoryDigests(temporaryDirectory);
		const report = parseComparisonReport(
			await Bun.file(expectedReportFile).text(),
		);

		expect({
			caseCount: report.cases.length,
			manifestSha: report.manifest.sha256,
			output,
		}).toEqual({
			caseCount: EXPECTED_CASE_COUNT,
			manifestSha,
			output: `${expectedReportFile}\n`,
		});
		expect(after).toEqual(before);
		expect(await Bun.file(externalCallMarker).exists()).toBe(false);
	});
});
