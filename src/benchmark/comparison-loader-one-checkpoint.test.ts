import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { ComparisonEvidenceFixture } from "./comparison-evidence-test-support";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import { comparisonOutputDirectory } from "./comparison-output-fixtures";
import { parseComparisonReport } from "./comparison-record";

describe(loadComparisonEvidence.name, () => {
	const { temporaryDirectory } = comparisonLoaderTestFixture();

	it("writes a one-checkpoint stage comparison that estimates over reps", async () => {
		const oneCheckpointRoot = join(temporaryDirectory, "one-checkpoint");
		await mkdir(oneCheckpointRoot);
		const oneCheckpoint = new ComparisonEvidenceFixture(oneCheckpointRoot, [
			"build-checkpoint",
		]);
		await oneCheckpoint.write();
		const runsDirectory = await comparisonOutputDirectory({
			name: "one-checkpoint-output",
			root: temporaryDirectory,
		});

		const reportFile = await writeComparisonReport({
			manifestPath: oneCheckpoint.manifestFile,
			runsDirectory,
		});

		const report = parseComparisonReport(await Bun.file(reportFile).text());
		expect(report.mode).toBe("stage");
		expect(report.cases.map(({ caseId }) => caseId)).toEqual([
			"build-checkpoint",
		]);
		expect("samplingUnit" in report && report.samplingUnit).toBe("rep");
	});
});
