import type {
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import { parseComparisonReport } from "#benchmark/comparison-record";
import {
	comparisonDigests,
	comparisonReportPaths,
} from "#benchmark/run-layout";

export interface ComparisonIndexEntry {
	readonly digest: string;
	readonly mode: (ComparisonReport | LegacyComparisonReport)["mode"];
	readonly caseIds: readonly string[];
	readonly reps: number;
}

export interface UnreadableComparison {
	readonly id: string;
	readonly reason: string;
}

export interface ComparisonIndex {
	readonly comparisons: readonly ComparisonIndexEntry[];
	readonly unreadable: readonly UnreadableComparison[];
}

async function indexEntry(
	runsDirectory: string,
	digest: string,
): Promise<ComparisonIndexEntry> {
	const { reportFile } = comparisonReportPaths(runsDirectory, digest);
	const report = parseComparisonReport(await Bun.file(reportFile).text());

	return {
		digest,
		mode: report.mode,
		caseIds: report.cases.map(({ caseId }) => caseId),
		reps: report.reps,
	};
}

export async function comparisonIndex(
	runsDirectory: string,
): Promise<ComparisonIndex> {
	const comparisons: ComparisonIndexEntry[] = [];

	for (const digest of await comparisonDigests(runsDirectory)) {
		comparisons.push(await indexEntry(runsDirectory, digest));
	}

	return { comparisons, unreadable: [] };
}
