import type {
	AnalysisInvoker,
	AnalysisResult,
	SignalStopInstaller,
} from "#benchmark/root-cause-analysis";
import {
	DEFAULT_ANALYSIS_BUDGET_USD,
	analyzeRun,
} from "#benchmark/root-cause-analysis";
import type { RunLiveness } from "#benchmark/run-liveness";
import { visibleControlCharacters } from "#benchmark/visible-control-characters";
import { UsageError } from "#cli/command-usage";
import type { CommandOutput } from "#cli/output";
import { diagnosticWriter, writeRecord } from "#cli/output";
import { parseRunRecordId } from "#cli/record-id";

const POSITIVE_SPENDING_BOUNDARY_USD = 0;

interface DiagnoseRequest {
	readonly id: string | undefined;
	readonly runsDirectory: string;
	readonly model: string | undefined;
	readonly budgetUsd: string | undefined;
	readonly json: boolean;
}

interface DiagnoseDependencies {
	readonly output: CommandOutput;
	readonly invokerFor: (model: string) => AnalysisInvoker;
	readonly now: () => Date;
	readonly liveness: RunLiveness;
	readonly requireSpendCeiling: (recordsDirectory: string) => Promise<number>;
	readonly stopOnSignal: SignalStopInstaller;
}

/**
 * The `diagnose` command: one sealed session reads an ended run and names the
 * corpus file its outcome traces to. It makes no model probe first, because
 * the probe is a paid call of its own and the analysis is meant to be the
 * one call the operator approved. An unavailable model ends in a failed
 * record instead.
 */
async function runDiagnose(
	request: DiagnoseRequest,
	dependencies: DiagnoseDependencies,
): Promise<void> {
	if (request.id === undefined) {
		throw new UsageError("Provide the run: rehearse diagnose <run>");
	}
	if (request.model === undefined) {
		throw new UsageError("Provide the model: --model <model>");
	}

	const { file, record, stopped } = await analyze(
		{ ...request, id: request.id, model: request.model },
		dependencies,
	);
	// The stop that recorded itself ends the process with the signal's exit
	// code, which an error thrown here would race.
	if (stopped) {
		return;
	}

	await writeRecord(dependencies.output, file, request.json);
	if (record.outcome === "failed") {
		throw new Error(
			`The root-cause analysis failed: ${visibleControlCharacters(record.reason)}`,
		);
	}
}

async function analyze(
	request: DiagnoseRequest & { readonly id: string; readonly model: string },
	dependencies: DiagnoseDependencies,
): Promise<AnalysisResult> {
	return await analyzeRun(
		{
			capUsd: budgetUsd(request.budgetUsd),
			model: request.model,
			run: parseRunRecordId(request.id).run,
			runsDirectory: request.runsDirectory,
		},
		{
			invoke: dependencies.invokerFor(request.model),
			liveness: dependencies.liveness,
			now: dependencies.now,
			progress: diagnosticWriter(dependencies.output),
			requireSpendCeiling: dependencies.requireSpendCeiling,
			stopOnSignal: dependencies.stopOnSignal,
		},
	);
}

/**
 * Only a decimal above zero is a budget, so "0x10" is not read as 16. The
 * exponent form is the one a launch from the browser prints a tiny cap in.
 */
function budgetUsd(text: string | undefined): number {
	if (text === undefined) {
		return DEFAULT_ANALYSIS_BUDGET_USD;
	}
	if (
		!/^\d+(?:\.\d+)?(?:e-?\d+)?$/u.test(text) ||
		Number(text) <= POSITIVE_SPENDING_BOUNDARY_USD
	) {
		throw new UsageError(
			`The budget is a positive number of USD, not ${JSON.stringify(text)}`,
		);
	}

	return Number(text);
}

export { runDiagnose as default };
export type { DiagnoseDependencies, DiagnoseRequest };
