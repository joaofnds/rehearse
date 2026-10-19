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

	it("names in the report the case the source groups recorded", async () => {
		const auditLogRoot = join(temporaryDirectory, "audit-log-cases");
		await mkdir(auditLogRoot);
		const auditLogFixture = new ComparisonEvidenceFixture(auditLogRoot, [
			"audit-log",
			"audit-log-follow-up",
		]);
		await auditLogFixture.write();
		const runsDirectory = await comparisonOutputDirectory({
			name: "audit-log-output",
			root: temporaryDirectory,
		});

		const reportFile = await writeComparisonReport({
			manifestPath: auditLogFixture.manifestFile,
			runsDirectory,
		});

		const report = parseComparisonReport(await Bun.file(reportFile).text());
		expect(report.cases.map(({ caseId }) => caseId)).toEqual([
			"audit-log",
			"audit-log-follow-up",
		]);
	});
});
