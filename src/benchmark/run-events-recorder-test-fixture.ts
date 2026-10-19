import type { RunEventStore } from "./run-events";
import { openRunEventStore } from "./run-events";
import type RunEventResources from "./run-events-test-resources";
import { createSpendCeiling } from "./spend-ceiling";
import type { SpendCeiling } from "./spend-ceiling";

interface RecorderContext {
	readonly store: RunEventStore;
	readonly ceiling: SpendCeiling;
}

async function recorderContext(
	resources: Pick<RunEventResources, "own">,
): Promise<RecorderContext> {
	const store = resources.own(await openRunEventStore(":memory:"));
	return { ceiling: createSpendCeiling({ ceilingUsd: 10 }), store };
}

export { recorderContext as default };
