import {
	LineageMismatchError,
	loadAttempts,
	presentAttempts,
} from "#benchmark/attempts";
import type { ReplayCliConfig } from "#benchmark/config";
import type { BenchmarkRunPaths } from "#benchmark/run-layout";
import type { CommandOutput } from "#cli/output";
import { writeRecord } from "#cli/output";

import type {
	ReplayCommandOutcome,
	ReplayEvidence,
	ReplayOutcomeContext,
} from "./replay-command-contracts";

async function reportOutcome(
	{ request, config, paths }: ReplayOutcomeContext,
	outcome: ReplayCommandOutcome,
	output: CommandOutput,
): Promise<void> {
	if (outcome.kind === "confirmation") {
		output.stderr(`Confirmation group: ${outcome.evidence.groupRecordFile}\n`);
		for (const recordFile of outcome.evidence.repRecordFiles) {
			output.stderr(`Confirmation rep: ${recordFile}\n`);
		}
		await writeRecord(output, outcome.evidence.reportFile, request.json);

		return;
	}

	output.stderr(await attemptComparison(config, paths, outcome.evidence));
	await writeRecord(output, outcome.evidence.recordPath, request.json);
}

/**
 * The replay is already recorded and paid for, so a refusal to compare its
 * attempts is reported rather than thrown away with the command.
 */
async function attemptComparison(
	config: ReplayCliConfig,
	paths: BenchmarkRunPaths,
	evidence: ReplayEvidence,
): Promise<string> {
	try {
		return `${await presentAttempts(
			evidence.lineage,
			await loadAttempts(paths, config.stage, evidence.lineage),
		)}\n`;
	} catch (error) {
		if (!(error instanceof LineageMismatchError)) {
			throw error;
		}

		return `${error.message}\n`;
	}
}

export { reportOutcome as default };
