import { detachedStageDependencies } from "./replay";
import type { StageSessionDependencies } from "./stage-session-dependencies";

interface StageClock {
	readonly read: () => number | undefined;
	readonly start: () => void;
}

function createStageClock(now: () => number): StageClock {
	let startedAt: number | undefined = undefined;

	return {
		read: () => startedAt,
		start: () => {
			startedAt = now();
		},
	};
}

function measuredStageDependencies(
	dependencies: StageSessionDependencies,
	clock: StageClock,
): StageSessionDependencies {
	const detached = detachedStageDependencies(dependencies);

	return {
		...detached,
		runWorkflowStage: async (request) => {
			clock.start();

			return await detached.runWorkflowStage(request);
		},
	};
}
export { createStageClock, measuredStageDependencies };
export type { StageClock };
