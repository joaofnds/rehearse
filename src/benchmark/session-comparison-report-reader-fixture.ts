import type {
	ComparisonReport,
	MultiCaseComparisonReport,
	SingleCaseComparisonReport,
} from "./comparison-record";
import { parseComparisonReport } from "./comparison-record";
import { MULTIPLE_GROUP_COMPARISON_REPORT_VERSION } from "./session-comparison-test-contract";

type SessionComparisonReport = Extract<
	ComparisonReport,
	{ readonly mode: "session" }
>;

type MultiCaseSessionReport = Extract<
	MultiCaseComparisonReport,
	{ readonly mode: "session" }
>;

type SingleCaseSessionReport = Extract<
	SingleCaseComparisonReport,
	{ readonly mode: "session" }
>;

async function readSessionComparisonReport(
	file: string,
): Promise<SessionComparisonReport> {
	const report = parseComparisonReport(await Bun.file(file).text());
	if (
		report.schemaVersion !== MULTIPLE_GROUP_COMPARISON_REPORT_VERSION ||
		report.mode !== "session"
	) {
		throw new Error("expected a version-6 session comparison report");
	}

	return report;
}

async function readMultiCaseSessionReport(
	file: string,
): Promise<MultiCaseSessionReport> {
	const report = await readSessionComparisonReport(file);
	if ("samplingUnit" in report) {
		throw new Error("expected a multi-case version-6 session report");
	}

	return report;
}

async function readSingleCaseSessionReport(
	file: string,
): Promise<SingleCaseSessionReport> {
	const report = await readSessionComparisonReport(file);
	if (!("samplingUnit" in report)) {
		throw new Error("expected a single-case version-6 session report");
	}

	return report;
}

export {
	readMultiCaseSessionReport,
	readSessionComparisonReport,
	readSingleCaseSessionReport,
};

export type { SessionComparisonReport };
