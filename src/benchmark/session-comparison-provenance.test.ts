import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { writeManifest } from "./session-comparison-group-test-fixture";
import {
	expectedSessionSource,
	sourceProvenance,
} from "./session-comparison-provenance-fixture";
import { readMultiCaseSessionReport } from "./session-comparison-report-reader-fixture";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const root = comparisonSuiteRoot();

async function testRetainsEverySourcePathAndDigest(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readMultiCaseSessionReport(reportFile);
	const expectedSources = await Promise.all(
		["case-one", "case-two"].map(async (caseId) => {
			const directories = {
				manifestDirectory: dirname(manifestPath),
				runsDirectory,
			};
			return {
				arms: {
					baseline: await expectedSessionSource(
						directories,
						caseId,
						"baseline",
					),
					candidate: await expectedSessionSource(
						directories,
						caseId,
						"candidate",
					),
					control: await expectedSessionSource(directories, caseId, "control"),
				},
				caseId,
			};
		}),
	);

	expect(
		report.cases.map(({ caseId, arms }) => ({
			arms: {
				baseline: sourceProvenance(arms.baseline.source),
				candidate: sourceProvenance(arms.candidate.source),
				control: sourceProvenance(arms.control.source),
			},
			caseId,
		})),
	).toEqual(expectedSources);
}

describe("session comparison provenance", () => {
	it(
		"retains every source path and digest",
		testRetainsEverySourcePathAndDigest,
	);
});
