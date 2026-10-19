import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import comparedCheckpoint from "#server/comparison-provenance-checkpoint";
import type {
	AnyComparisonReport,
	ArmCorpusVersion,
	ArmGroups,
	ComparisonProvenance,
} from "#server/comparison-provenance-contract";
import readCaseGroups from "#server/comparison-provenance-records";

const SINGLE_ITEM_COUNT = 1;

/**
 * An arm reads as one version only when every group it holds ran that
 * version, so an arm extended on another corpus shows each reading instead.
 */
function armCorpusVersion(armGroups: ArmGroups): ArmCorpusVersion {
	if (armGroups.state === "unavailable") {
		return armGroups;
	}

	const measurements = armGroups.groups.map(
		({ corpusVersion }) => corpusVersion,
	);
	const [first] = measurements;
	if (
		first?.kind === "version" &&
		measurements.every(
			(measurement) =>
				measurement?.kind === "version" && measurement.digest === first.digest,
		)
	) {
		return { digest: first.digest, state: "available" };
	}
	const readings = [
		...new Set(
			measurements.map((measurement) => corpusMeasurementReading(measurement)),
		),
	];

	return {
		reasons:
			readings.length === SINGLE_ITEM_COUNT
				? readings
				: [`the arm's groups ran ${readings.join(", ")}`],
		state: "unavailable",
	};
}

async function comparisonProvenance(
	report: AnyComparisonReport,
	runsDirectory: string,
): Promise<ComparisonProvenance> {
	const cases = await Promise.all(
		report.cases.map(
			async (benchmarkCase) =>
				await readCaseGroups(runsDirectory, benchmarkCase),
		),
	);

	return {
		checkpoint: await comparedCheckpoint(runsDirectory, report, cases),
		corpusVersions: Object.fromEntries(
			cases.map(({ caseId, arms }) => [
				caseId,
				{
					baseline: armCorpusVersion(arms.baseline),
					candidate: armCorpusVersion(arms.candidate),
					control: armCorpusVersion(arms.control),
				},
			]),
		),
	};
}

export { comparisonProvenance as default };
export type {
	ArmCorpusVersion,
	ComparedCheckpoint,
	ComparisonProvenance,
} from "#server/comparison-provenance-contract";
