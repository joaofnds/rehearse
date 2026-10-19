import type {
	BenchmarkRunInputs,
	BenchmarkRunInteraction,
} from "./benchmark-run-request";
import type { PipelineDefinition } from "./pipeline";
import type { RunSource } from "./run-artifact";
import type { RunIdentity } from "./run-identity";
import type { RunLifetime } from "./run-lifetime";
import type RunOutput from "./run-output";
import type { PreparedBenchmarkRun } from "./run-preparation-contract";
import type { SpendCeiling } from "./spend-ceiling";

interface BenchmarkRunExecution {
	readonly inputs: BenchmarkRunInputs;
	readonly interaction: BenchmarkRunInteraction;
	readonly pipeline: PipelineDefinition;
	readonly source: RunSource;
	readonly identity: RunIdentity;
	readonly lifetime: Readonly<RunLifetime>;
	readonly output: RunOutput;
	readonly spendCeiling: SpendCeiling;
}
interface PreparedRunExecution {
	readonly execution: BenchmarkRunExecution;
	readonly prepared: PreparedBenchmarkRun;
}
export type { BenchmarkRunExecution, PreparedRunExecution };
