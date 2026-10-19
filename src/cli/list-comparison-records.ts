import { listedComparisonDigests } from "#benchmark/comparison-baseline-record";
import { parseComparisonReport } from "#benchmark/comparison-record";
import { comparisonReportPaths } from "#benchmark/run-layout";

import type { RecordListing } from "./record-listing";
import { collect } from "./record-listing";

const SINGLE_ITEM_COUNT = 1;

async function listComparisons(runsDirectory: string): Promise<RecordListing> {
	const digests = await listedComparisonDigests(runsDirectory);

	return await collect(
		digests,
		(manifestDigest) => ({ kind: "comparison", manifestDigest }),
		async (manifestDigest) => {
			const paths = comparisonReportPaths(runsDirectory, manifestDigest);
			const report = parseComparisonReport(
				await Bun.file(paths.reportFile).text(),
			);

			return [
				`${String(report.cases.length)} ${report.cases.length === SINGLE_ITEM_COUNT ? "case" : "cases"}`,
				`${String(report.reps)} reps`,
			];
		},
	);
}

export { listComparisons as default };
