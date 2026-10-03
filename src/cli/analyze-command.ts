import type { AnalysisInvoker } from "#benchmark/culprit-analysis";
import { analyzeRun } from "#benchmark/culprit-analysis";
import type { RunLiveness } from "#benchmark/run-liveness";
import { UsageError } from "#cli/commands";
import type { CommandOutput } from "#cli/output";
import { diagnosticWriter, writeRecord } from "#cli/output";
import { parseRunRecordId } from "#cli/record-id";

/** What one analysis may spend when the caller names no budget. */
const DEFAULT_BUDGET_USD = 1;

export interface AnalyzeRequest {
	readonly id: string | undefined;
	readonly runsDirectory: string;
	readonly model: string | undefined;
	readonly budgetUsd: string | undefined;
	readonly json: boolean;
}

export interface AnalyzeDependencies {
	readonly output: CommandOutput;
	readonly invokerFor: (model: string) => AnalysisInvoker;
	readonly now: () => Date;
	readonly liveness: RunLiveness;
	readonly requireSpendCeiling: (recordsDirectory: string) => Promise<number>;
}

/**
 * The `analyze` command: one sealed session reads an ended run and names the
 * corpus file its outcome traces to. It makes no model probe first, because
 * the probe is a paid call of its own and the analysis is meant to be the
 * one call the operator approved. An unavailable model ends in a failed
 * record instead.
 */
export async function runAnalyze(
	request: AnalyzeRequest,
	dependencies: AnalyzeDependencies,
): Promise<void> {
	if (request.id === undefined) {
		throw new UsageError("Provide the run: rehearse analyze <run>");
	}
	if (request.model === undefined) {
		throw new UsageError("Provide the model: --model <model>");
	}

	const { run } = parseRunRecordId(request.id);
	const { file, record } = await analyzeRun(
		{
			runsDirectory: request.runsDirectory,
			run,
			model: request.model,
			capUsd: budgetUsd(request.budgetUsd),
		},
		{
			invoke: dependencies.invokerFor(request.model),
			now: dependencies.now,
			liveness: dependencies.liveness,
			requireSpendCeiling: dependencies.requireSpendCeiling,
			progress: diagnosticWriter(dependencies.output),
		},
	);

	await writeRecord(dependencies.output, file, request.json);
	if (record.outcome === "failed") {
		throw new Error(`The culprit analysis failed: ${record.reason}`);
	}
}

/** Only a plain decimal above zero is a budget, so "0x10" is not read as 16. */
function budgetUsd(text: string | undefined): number {
	if (text === undefined) {
		return DEFAULT_BUDGET_USD;
	}
	if (!/^\d+(?:\.\d+)?$/u.test(text) || Number(text) <= 0) {
		throw new UsageError(
			`The budget is a positive number of USD, not ${JSON.stringify(text)}`,
		);
	}

	return Number(text);
}
