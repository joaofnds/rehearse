import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import {
	comparisonOutputDirectory,
	comparisonReportLocation,
} from "./comparison-output-fixtures";
import directoryDigests from "./comparison-source-digests";

describe(loadComparisonEvidence.name, () => {
	const { fixture, temporaryDirectory } = comparisonLoaderTestFixture();

	it("serializes a completed comparison fixture byte for byte", async () => {
		const runsDirectory = await comparisonOutputDirectory({
			name: "characterization-output",
			root: temporaryDirectory,
		});
		const { reportFile: expectedReportFile } = await comparisonReportLocation({
			manifestFile: fixture.manifestFile,
			runsDirectory,
		});
		const sourceBefore = await directoryDigests(
			join(temporaryDirectory, "groups"),
		);

		const reportFile = await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});
		const reportText = await Bun.file(reportFile).text();
		const sourceAfter = await directoryDigests(
			join(temporaryDirectory, "groups"),
		);

		expect(reportFile).toBe(expectedReportFile);
		expect(reportText).toMatchSnapshot();
		expect(reportText.endsWith("\n")).toBe(true);
		expect(sourceAfter).toEqual(sourceBefore);
	});
});
