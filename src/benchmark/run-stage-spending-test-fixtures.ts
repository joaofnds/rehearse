import { expect } from "bun:test";

import type { StageContext } from "./run";
import { createRunAbort } from "./run-abort";
import ControlledRunArtifactPersistence from "./run-artifact-persistence-test-fixture";
import {
	StageContextBuilder,
	noCalibration,
} from "./run-stage-context-test-fixture";
import { fakeStageDependencies } from "./run-stage-dependencies-test-fixture";
import { createSpendCeiling } from "./spend-ceiling";
import { fakeRunAbortSignals } from "./test-support";
import type { ProductOwner } from "./workflow";

interface AbortAtCeiling {
	readonly persistence: ControlledRunArtifactPersistence;
	readonly abort: ReturnType<typeof createRunAbort>;
}

function atCeiling(): AbortAtCeiling {
	const persistence = new ControlledRunArtifactPersistence();
	const abort = createRunAbort(
		{
			killActiveCommands: async () => {
				await Promise.resolve();
			},
			...fakeRunAbortSignals(),
			persistence,
			reportError: (message) => {
				expect.unreachable(message);
			},
		},
		{
			artifactFile: "/runs/run.json",
			operatorStopFile: "/runs/operator-stop.json",
			teardown: async () => {
				await Promise.resolve();
			},
		},
	);

	return { abort, persistence };
}

async function ceilingContext(
	abort: ReturnType<typeof createRunAbort>,
): Promise<StageContext> {
	return {
		...(await new StageContextBuilder().build()),
		completeStage: abort.completeStage,
		spendCeiling: createSpendCeiling({ ceilingUsd: 1 }),
		stopAtCeiling: abort.stopAtCeiling,
		updatePendingStage: abort.updatePendingStage,
		writePendingStage: abort.writePendingStage,
		writeStageProgress: abort.writeStageProgress,
	};
}

const answeringProductOwner: ProductOwner = {
	ask: async () => await Promise.resolve("Use the small scope"),
	snapshot: () => ({
		providerCalls: [{}],
		sessionId: "po",
		spentUsd: 0.0115,
	}),
};

function stageFailureFixture(): ReturnType<typeof fakeStageDependencies> &
	AbortAtCeiling {
	const harness = fakeStageDependencies();
	return { ...harness, ...atCeiling() };
}
async function stoppedStageContext(
	abort: ReturnType<typeof createRunAbort>,
): Promise<StageContext> {
	return {
		...(await new StageContextBuilder().build()),
		calibrateStageFailure: noCalibration,
		completeStage: abort.completeStage,
		updatePendingStage: abort.updatePendingStage,
		writePendingStage: abort.writePendingStage,
		writeStageProgress: abort.writeStageProgress,
	};
}
export {
	stoppedStageContext,
	stageFailureFixture,
	answeringProductOwner,
	atCeiling,
	ceilingContext,
};
export type { AbortAtCeiling };
