import type { BenchmarkRunExecution } from "./run-execution-context";
import type { PreparedRunTask } from "./run-task";
import { createProductOwner } from "./workflow";
import type { ProductOwner } from "./workflow";

function createRunProductOwner(
	execution: BenchmarkRunExecution,
	task: PreparedRunTask,
): ProductOwner {
	const { inputs, lifetime, spendCeiling } = execution;
	return createProductOwner({
		directory: lifetime.resources.productOwnerDirectory,
		effort: inputs.config.effort,
		model: inputs.config.model,
		productBrief: task.productBrief,
		sessionBudgetUsd: inputs.config.sessionBudgetUsd,
		spendCeiling,
		task: task.task,
	});
}
export { createRunProductOwner as default };
