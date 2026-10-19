import { describe, expect, it } from "bun:test";

import extendEveryComparisonArm from "./comparison-additional-groups-fixture";
import writeComparisonReport from "./comparison-command";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import { comparisonOutputDirectory } from "./comparison-output-fixtures";
import { parseComparisonReport } from "./comparison-record";

const FIRST_REPORTED_CASE_INDEX = 0;

const MULTIPLE_GROUP_COMPARISON_REPORT_VERSION = 6;

describe(loadComparisonEvidence.name, () => {
	const { fixture, temporaryDirectory } = comparisonLoaderTestFixture();

	it("reports an arm of two groups as one arm, each attempt numbered within it and naming its group", async () => {
		const expectedReps = 4;

		await extendEveryComparisonArm(fixture);
		const runsDirectory = await comparisonOutputDirectory({
			name: "grouped-output",
			root: temporaryDirectory,
		});

		const reportFile = await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});

		const report = parseComparisonReport(await Bun.file(reportFile).text());
		if (report.schemaVersion !== MULTIPLE_GROUP_COMPARISON_REPORT_VERSION) {
			throw new Error("Expected a version-6 report");
		}

		const source =
			report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.candidate.source;

		expect({
			groups: source?.groups.map(({ path }) => path),
			reps: report.reps,
		}).toEqual({
			groups: [
				"groups/case-1-candidate/group.json",
				"groups/case-1-candidate-more/group.json",
			],
			reps: expectedReps,
		});
		expect(
			source?.reps.map(({ repId, ordinal, group }) => ({
				group,
				ordinal,
				repId,
			})),
		).toEqual([
			{ group: 0, ordinal: 1, repId: "case-1-candidate-rep-1" },
			{ group: 0, ordinal: 2, repId: "case-1-candidate-rep-2" },
			{ group: 1, ordinal: 3, repId: "case-1-candidate-more-rep-1" },
			{ group: 1, ordinal: 4, repId: "case-1-candidate-more-rep-2" },
		]);
	});
});
