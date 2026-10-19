import { expect } from "bun:test";

import { createRunAbort, fileRunArtifactPersistence } from "./run-abort";
import type {
	RunAbort,
	RunAbortDependencies,
	RunAbortRequest,
} from "./run-abort";
import { fakeRunAbortSignals } from "./test-support";

interface RunAbortFixture {
	readonly dependencies: Partial<RunAbortDependencies>;
	readonly request: Partial<RunAbortRequest>;
}

async function noOperation(): Promise<void> {
	await Promise.resolve();
}

class RunAbortBuilder {
	public constructor(private readonly props: Partial<RunAbortFixture> = {}) {}

	public build(): RunAbort {
		return createRunAbort(
			{
				killActiveCommands: noOperation,
				...fakeRunAbortSignals(),
				persistence: fileRunArtifactPersistence,
				reportError: (message) => {
					expect.unreachable(message);
				},
				...this.props.dependencies,
			},
			{
				artifactFile: "/runs/run.json",
				operatorStopFile: "/runs/operator-stop.json",
				teardown: noOperation,
				...this.props.request,
			},
		);
	}
}

export { RunAbortBuilder as default };

export type { RunAbortFixture };
