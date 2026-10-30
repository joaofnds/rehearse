import { join } from "node:path";

import { z } from "zod";

import { groupIdFor } from "#benchmark/compare-attempts-test-support";
import type { RecordedConfiguration } from "#benchmark/comparison-inherited-configuration";
import type { ComparisonArm } from "#benchmark/comparison-record";
import {
	COMPARISON_ARMS,
	parseComparisonReport,
} from "#benchmark/comparison-record";
import {
	comparisonReportPaths,
	confirmationGroupPaths,
} from "#benchmark/run-layout";
import { buildSessionAttemptRecord } from "#benchmark/session-record";
import {
	recordInputs,
	smokeAttempt,
} from "#benchmark/session-record-test-fixtures";
import type { ComparisonResponse } from "#server/comparison-response-test-schema";
import type ComparisonHarness from "#server/comparison-test-harness";

type Configuration = NonNullable<RecordedConfiguration>;

const recordSchema = z.object({ inputs: z.object({}).loose() }).loose();

/** Rewrites the stage group `comparedArms` wrote for one arm to record `inheritedConfiguration`. */
async function recordGroupConfiguration(
	runsDirectory: string,
	role: ComparisonArm,
	inheritedConfiguration: Configuration,
): Promise<void> {
	const { groupFile } = confirmationGroupPaths(runsDirectory, groupIdFor(role));
	const group = recordSchema.parse(
		JSON.parse(await Bun.file(groupFile).text()),
	);

	await Bun.write(
		groupFile,
		`${JSON.stringify({ ...group, inputs: { ...group.inputs, inheritedConfiguration } })}\n`,
	);
}

/** Writes an attempt record at every attempt path a session comparison's report names. */
async function writeSessionAttempts(
	runsDirectory: string,
	digest: string,
	configurationOf: (role: ComparisonArm) => Configuration,
): Promise<void> {
	const { reportFile } = comparisonReportPaths(runsDirectory, digest);
	const report = parseComparisonReport(await Bun.file(reportFile).text());
	const attempts = report.cases.flatMap(({ arms }) =>
		COMPARISON_ARMS.flatMap((role) =>
			arms[role].source.reps.map((rep) => ({ rep, role })),
		),
	);

	await Array.fromAsync(attempts, async ({ rep, role }) => {
		const record = buildSessionAttemptRecord(
			recordInputs({
				attempt: {
					...smokeAttempt(),
					setup: {
						inheritedConfiguration: configurationOf(role),
						kind: "isolated",
					},
				},
			}),
		);
		const path = "attempt" in rep ? rep.attempt?.path : undefined;
		if (path !== undefined) {
			await Bun.write(join(runsDirectory, path), `${JSON.stringify(record)}\n`);
		}
	});
}

/** The inherited configuration reading the comparison endpoint serves for one case. */
async function caseInheritedConfiguration(
	harness: ComparisonHarness,
	digest: string,
	caseId: string,
): Promise<ComparisonResponse["inheritedConfiguration"][string] | undefined> {
	const { inheritedConfiguration } = await harness.driver.comparison(digest);

	return inheritedConfiguration[caseId];
}

export {
	caseInheritedConfiguration,
	recordGroupConfiguration,
	writeSessionAttempts,
};
