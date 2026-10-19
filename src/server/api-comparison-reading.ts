import { dirname } from "node:path";

import { readComparisonBaselineArm } from "#benchmark/comparison-baseline-record";
import recordedComparison from "#server/api-recorded-comparison";
import { comparisonArmDiff } from "#server/comparison-arm-diff";
import { comparisonAttemptHistoryLinks } from "#server/comparison-history-links";
import comparisonProvenance from "#server/comparison-provenance";
import comparisonReport from "#server/comparisons";

type ComparisonReading = ReturnType<typeof comparisonReport> &
	Awaited<ReturnType<typeof comparisonProvenance>> & {
		readonly baselineArm: Awaited<ReturnType<typeof readComparisonBaselineArm>>;
	};

interface ComparisonReadRequest {
	readonly digest: string;
	readonly runsDirectory: string;
}

async function comparisonReading({
	digest,
	runsDirectory,
}: ComparisonReadRequest): Promise<ComparisonReading> {
	const { file, report } = await recordedComparison(digest, runsDirectory);
	return {
		...comparisonReport(
			report,
			await comparisonAttemptHistoryLinks(report, runsDirectory),
		),
		...(await comparisonProvenance(report, runsDirectory)),
		baselineArm: await readComparisonBaselineArm(dirname(file)),
	};
}

async function comparisonDiff({
	digest,
	runsDirectory,
}: ComparisonReadRequest): Promise<
	Awaited<ReturnType<typeof comparisonArmDiff>>
> {
	const { report } = await recordedComparison(digest, runsDirectory);
	return await comparisonArmDiff(report, runsDirectory);
}

export { comparisonDiff, comparisonReading };
