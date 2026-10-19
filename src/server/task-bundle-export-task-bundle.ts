import type { TaskBundle } from "#server/task-bundle-contract";
import readTaskBundle from "#server/task-bundle-read";

async function exportTaskBundle(
	casesRoot: string,
	caseId: string,
): Promise<TaskBundle> {
	const bundle = await readTaskBundle({ caseId, casesRoot });

	return { ...bundle, pipeline: bundle.pipeline.written };
}

export { exportTaskBundle as default };
