import { mkdir } from "node:fs/promises";

import { writeComparisonBaselineRecord } from "./comparison-baseline-record";
import { serializeComparisonReport } from "./comparison-record";
import buildComparisonReport from "./comparison-report";
import { comparisonEvidenceFixture } from "./comparison-report-test-fixtures";
import type {
	RecordedRunsContext,
	RecordedRunsFixtureProps,
} from "./recorded-runs-fixture-context";
import { SHA256_HEX_DIGITS } from "./recorded-runs-fixture-readings";
import { comparisonReportPaths } from "./run-layout";

class ComparisonRecords {
	private readonly context: RecordedRunsContext;
	public constructor(props: RecordedRunsFixtureProps) {
		this.context = props.context;
	}

	public readonly recordExtension = async (): Promise<string> => {
		const digest = "e".repeat(SHA256_HEX_DIGITS);
		const extended = comparisonReportPaths(
			this.context.runsDirectory,
			this.context.comparisonDigest,
		);
		const extension = comparisonReportPaths(this.context.runsDirectory, digest);

		await mkdir(extension.directory, { recursive: true });

		await Bun.write(extension.reportFile, Bun.file(extended.reportFile));

		await writeComparisonBaselineRecord(extension.directory, {
			arms: {
				baseline: ["group-a", "group-a-more"],
				candidate: ["group-b", "group-b-more"],
				control: ["group-c", "group-c-more"],
			},
			controlCorpus: "c".repeat(SHA256_HEX_DIGITS),
			extends: this.context.comparisonDigest,
			kind: "derived",
			schemaVersion: 3,
			skillUnderTest: "skills/build/",
		});

		return digest;
	};

	public readonly writeComparison = async (): Promise<void> => {
		const paths = comparisonReportPaths(
			this.context.runsDirectory,
			this.context.comparisonDigest,
		);

		await mkdir(paths.directory, { recursive: true });

		const { reportFile } = paths;
		const report = buildComparisonReport(comparisonEvidenceFixture(), {
			baselines: [],
			skippedCalibrations: 0,
		});

		await Bun.write(reportFile, serializeComparisonReport(report));
	};
}

export { ComparisonRecords as default };
