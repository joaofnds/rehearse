import { ZodError } from "zod";

import { listedComparisonDigests } from "#benchmark/comparison-baseline-record";
import type {
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import { parseComparisonReport } from "#benchmark/comparison-record";
import concurrentMap from "#benchmark/concurrent-map";
import { comparisonReportPaths } from "#benchmark/run-layout";

import { comparisonAttribution } from "./comparison-attribution";
import comparisonProvenance from "./comparison-provenance";
import type { ComparisonProvenance } from "./comparison-provenance";
import { redactAbsolutePaths } from "./redact-path";

interface ComparisonIndexEntry {
	readonly digest: string;
	readonly mode: (ComparisonReport | LegacyComparisonReport)["mode"];
	readonly caseIds: readonly string[];
	readonly reps: number;
	readonly details?: readonly {
		readonly caseId: string;
		readonly changedPaths: readonly string[];
		readonly corpusVersions: ComparisonProvenance["corpusVersions"][string];
	}[];
}

interface UnreadableComparison {
	readonly id: string;
	readonly reason: string;
}

interface ComparisonIndex {
	readonly comparisons: readonly ComparisonIndexEntry[];
	readonly unreadable: readonly UnreadableComparison[];
}

async function indexEntry(
	runsDirectory: string,
	digest: string,
): Promise<ComparisonIndexEntry> {
	const { reportFile } = comparisonReportPaths(runsDirectory, digest);
	const report = parseComparisonReport(await Bun.file(reportFile).text());
	const provenance = await comparisonProvenance(report, runsDirectory);

	return {
		caseIds: report.cases.map(({ caseId }) => caseId),
		details: report.cases.map((benchmarkCase) => {
			const attribution = comparisonAttribution(
				benchmarkCase.arms.candidate.executedCorpus,
				benchmarkCase.arms.baseline.executedCorpus,
				report.mode,
			);
			return {
				caseId: benchmarkCase.caseId,
				changedPaths:
					attribution.claim === "identical" ? [] : attribution.differingPaths,
				corpusVersions: provenance.corpusVersions[benchmarkCase.caseId] ?? {
					baseline: { reasons: ["Version not recorded"], state: "unavailable" },
					candidate: {
						reasons: ["Version not recorded"],
						state: "unavailable",
					},
					control: { reasons: ["Version not recorded"], state: "unavailable" },
				},
			};
		}),
		digest,
		mode: report.mode,
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
async function comparisonIndex(
	runsDirectory: string,
): Promise<ComparisonIndex> {
	const readings = await concurrentMap(
		await listedComparisonDigests(runsDirectory),
		async (digest) => {
			try {
				return { entry: await indexEntry(runsDirectory, digest) };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					failure: {
						id: digest,
						reason:
							error instanceof ZodError
								? UNRECOGNIZED_REPORT
								: redactAbsolutePaths(message),
					},
				};
			}
		},
	);
	const comparisons: ComparisonIndexEntry[] = [];
	const unreadable: UnreadableComparison[] = [];
	for (const reading of readings) {
		if (reading.entry === undefined) {
			unreadable.push(reading.failure);
		} else {
			comparisons.push(reading.entry);
		}
	}

	return { comparisons, unreadable };
}

export { comparisonIndex as default };
export type { ComparisonIndexEntry, UnreadableComparison, ComparisonIndex };
