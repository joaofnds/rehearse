import type { BenchmarkRunExecution } from "./run-execution-context";
import prepareInitialRunEvidence from "./run-initial-evidence";
import type { PreparedBenchmarkRun } from "./run-preparation-contract";
import prepareRunTarget from "./run-target-preparation";

async function prepareBenchmarkRun(
	execution: BenchmarkRunExecution,
): Promise<PreparedBenchmarkRun> {
	const target = await prepareRunTarget(execution);
	const evidence = await prepareInitialRunEvidence(execution, target);
	return { evidence, target };
}
export { prepareBenchmarkRun as default };
