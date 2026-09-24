import type {
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import { parseComparisonReport } from "#benchmark/comparison-record";
import {
	comparisonDigests,
	comparisonReportPaths,
} from "#benchmark/run-layout";
import { ZodError } from "zod";
import { redactAbsolutePaths } from "./redact-path";

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

// The report schema is a union of every version, so a schema error lists each
// version's mismatches, thousands of lines no operator can read.
const UNRECOGNIZED_REPORT = "report.json matches no known comparison report";

/**
 * One unreadable comparison must not hide the others, the precedent
 * `runHistoryReport` follows from the CLI's `list` command. A missing
 * report.json fails with the file's absolute path in its message, so every
 * reason is redacted before it reaches a browser.
 */
export async function comparisonIndex(
	runsDirectory: string,
): Promise<ComparisonIndex> {
	const comparisons: ComparisonIndexEntry[] = [];
	const unreadable: UnreadableComparison[] = [];

	for (const digest of await comparisonDigests(runsDirectory)) {
		try {
			comparisons.push(await indexEntry(runsDirectory, digest));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push({
				id: digest,
				reason:
					error instanceof ZodError
						? UNRECOGNIZED_REPORT
						: redactAbsolutePaths(message),
			});
		}
	}

	return { comparisons, unreadable };
}
