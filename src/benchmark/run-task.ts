import { seedTaskBoard } from "./backlog";
import { validateRubricDefinition } from "./judge";
import type { BenchmarkRunExecution } from "./run-execution-context";

interface RunTaskDefinition {
	readonly task: string;
	readonly productBrief: string;
	readonly rubric: string;
}
interface PreparedRunTask extends RunTaskDefinition {
	readonly rubricIds: readonly string[];
	readonly taskId: string;
	readonly taskSha: string;
}
async function prepareRunTask(
	execution: BenchmarkRunExecution,
	definition: RunTaskDefinition,
): Promise<PreparedRunTask> {
	const rubricIds = validateRubricDefinition(definition.rubric);
	const { taskId, taskSha } = await seedTaskBoard(
		execution.source.root,
		definition.task,
		execution.pipeline.statuses,
	);
	return { ...definition, rubricIds, taskId, taskSha };
}
export { prepareRunTask as default };
export type { RunTaskDefinition, PreparedRunTask };
