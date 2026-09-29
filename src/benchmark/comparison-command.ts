import { randomUUID } from "node:crypto";
import { mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadComparisonEvidence } from "./comparison-loader";
import { buildComparisonReport } from "./comparison-report";
import {
	filterJudgeAgreementReport,
	loadJudgeAgreementReport,
} from "./judge-agreement";
import {
	COMPARISON_ARMS,
	serializeComparisonReport,
} from "./comparison-record";
import { RefusedPreconditionError } from "./exit-codes";
import type { ComparisonBaselineRecord } from "./comparison-baseline-record";
import { writeComparisonBaselineRecord } from "./comparison-baseline-record";
import { comparisonReportPaths } from "./run-layout";

export interface WriteComparisonReportRequest {
	readonly manifestPath: string;
	readonly runsDirectory: string;
	/** How `compare attempts` made the control group, written beside the report. */
	readonly baselineRecord?: ComparisonBaselineRecord | undefined;
}

async function canonicalExistingPath(
	path: string,
): Promise<string | undefined> {
	try {
		return await realpath(path);
	} catch {
		return undefined;
	}
}

async function assertReportDoesNotReplaceEvidence(
	reportFile: string,
	sourcePaths: readonly string[],
): Promise<void> {
	const absoluteReportFile = resolve(reportFile);
	const existingTarget = await canonicalExistingPath(absoluteReportFile);
	if (
		sourcePaths.includes(absoluteReportFile) ||
		(existingTarget !== undefined && sourcePaths.includes(existingTarget))
	) {
		throw new RefusedPreconditionError(
			`Comparison report destination overlaps source evidence: ${absoluteReportFile}`,
		);
	}
}

async function writeReportAtomically(
	path: string,
	content: string,
): Promise<void> {
	const temporaryPath = `${path}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporaryPath, content, { flag: "wx" });
		await rename(temporaryPath, path);
	} finally {
		await rm(temporaryPath, { force: true });
	}
}

export async function writeComparisonReport(
	request: Readonly<WriteComparisonReportRequest>,
): Promise<string> {
	const evidence = await loadComparisonEvidence(request.manifestPath);
	const judgeAgreement =
		evidence.contract.mode === "session"
			? { skippedCalibrations: 0, baselines: [] }
			: filterJudgeAgreementReport(
					await loadJudgeAgreementReport(request.runsDirectory),
					evidence.cases.flatMap((benchmarkCase) =>
						COMPARISON_ARMS.flatMap((arm) => {
							const { group } = benchmarkCase.arms[arm];
							const { inputs } = group.record;
							if (!("judgeModel" in inputs)) {
								return [];
							}
							const { judgeModel } = inputs;
							return judgeModel === undefined ? [] : [judgeModel];
						}),
					),
				);
	const report = buildComparisonReport(evidence, judgeAgreement);
	const paths = comparisonReportPaths(
		request.runsDirectory,
		evidence.manifest.sha256,
	);
	await assertReportDoesNotReplaceEvidence(
		paths.reportFile,
		evidence.sourcePaths,
	);

	await mkdir(paths.directory, { recursive: true });
	if (request.baselineRecord !== undefined) {
		await writeComparisonBaselineRecord(
			paths.directory,
			request.baselineRecord,
		);
	}
	await writeReportAtomically(
		paths.reportFile,
		serializeComparisonReport(report),
	);

	return paths.reportFile;
}
