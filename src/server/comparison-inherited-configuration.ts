import inheritedConfigurationFindings from "#benchmark/comparison-inherited-configuration";
import type {
	InheritedConfigurationFinding,
	RecordedConfiguration,
} from "#benchmark/comparison-inherited-configuration";
import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import type {
	AnyComparisonReport,
	ArmSource,
	ReportCase,
} from "#server/comparison-provenance-contract";
import { groupPaths } from "#server/comparison-provenance-records";

import { redactAbsolutePaths } from "./redact-path";
import type { Reading } from "./run-record";
import { readRecordedEvidenceFile } from "./session-history-reader";

type CaseInheritedConfiguration = Reading<{
	readonly findings: readonly InheritedConfigurationFinding[];
}>;

async function recordText(
	runsDirectory: string,
	path: string,
): Promise<string> {
	const { text } = await readRecordedEvidenceFile(runsDirectory, path);

	return text;
}

async function attemptConfiguration(
	runsDirectory: string,
	path: string,
): Promise<RecordedConfiguration> {
	const attempt = parseSessionAttemptRecord(
		await recordText(runsDirectory, path),
	);

	return attempt.setup?.inheritedConfiguration;
}

async function sessionArmRecords(
	runsDirectory: string,
	source: ArmSource,
): Promise<readonly RecordedConfiguration[]> {
	return await Promise.all(
		source.reps.map(async ({ attempt }) =>
			attempt === undefined
				? undefined
				: await attemptConfiguration(runsDirectory, attempt.path),
		),
	);
}

async function groupArmRecords(
	runsDirectory: string,
	source: ArmSource,
): Promise<readonly RecordedConfiguration[]> {
	return await Promise.all(
		groupPaths(source).map(async (path) => {
			const group = parseConfirmationGroupRecord(
				await recordText(runsDirectory, path),
			);

			return group.mode === "session"
				? undefined
				: group.inputs.inheritedConfiguration;
		}),
	);
}

/** A session arm's sessions record it on their attempts, a stage arm's groups on the group. */
async function armRecords(
	runsDirectory: string,
	mode: AnyComparisonReport["mode"],
	source: ArmSource,
): Promise<readonly RecordedConfiguration[]> {
	return mode === "session"
		? await sessionArmRecords(runsDirectory, source)
		: await groupArmRecords(runsDirectory, source);
}

/** A record that cannot be read costs its case this reading, never the page. */
async function caseInheritedConfiguration(
	runsDirectory: string,
	mode: AnyComparisonReport["mode"],
	{ arms }: ReportCase,
): Promise<CaseInheritedConfiguration> {
	try {
		const findings = inheritedConfigurationFindings({
			baseline: await armRecords(runsDirectory, mode, arms.baseline.source),
			candidate: await armRecords(runsDirectory, mode, arms.candidate.source),
			control: await armRecords(runsDirectory, mode, arms.control.source),
		});

		return { findings, state: "available" };
	} catch (error) {
		const message =
			error instanceof Error
				? redactAbsolutePaths(error.message)
				: String(error);

		return {
			reasons: [`a record could not be read: ${message}`],
			state: "unavailable",
		};
	}
}

/**
 * Where each case's arms inherited different Claude Code configuration from
 * the shell that started them, read from the records the report names, since
 * the report itself does not carry it.
 */
async function comparisonInheritedConfiguration(
	report: AnyComparisonReport,
	runsDirectory: string,
): Promise<Readonly<Record<string, CaseInheritedConfiguration>>> {
	const readings = await Promise.all(
		report.cases.map(
			async (benchmarkCase) =>
				[
					benchmarkCase.caseId,
					await caseInheritedConfiguration(
						runsDirectory,
						report.mode,
						benchmarkCase,
					),
				] as const,
		),
	);

	return Object.fromEntries(readings);
}

export { comparisonInheritedConfiguration as default };
export type { CaseInheritedConfiguration };
