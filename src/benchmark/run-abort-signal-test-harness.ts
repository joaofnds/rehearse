import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SignalStopHandler, SignalStopOutcome } from "./process-signals";
import type { RunAbort } from "./run-abort";
import RunAbortBuilder from "./run-abort-test-builder";
import type { TestResources } from "./test-support";

const NO_RECOVERY_CALLS = 0;

interface SignalScenario {
	readonly artifactFile: string;
	readonly holdCancellation: boolean;
	readonly failCancellation: boolean;
	readonly inspectStageAtTeardown: boolean;
}

interface SignalHarnessRequest {
	readonly directory: string;
	readonly scenario: Partial<SignalScenario>;
}

class RunAbortSignalHarness {
	public readonly diagnostics: string[] = [];
	public readonly effects: string[] = [];
	public readonly abort: RunAbort;
	public readonly stageFile: string;
	public readonly artifactFile: string;
	public readonly operatorStopFile: string;
	public cancellationCalls = NO_RECOVERY_CALLS;
	public teardownCalls = NO_RECOVERY_CALLS;
	public evidencePresentAtTeardown = false;
	private readonly handlers = new Map<NodeJS.Signals, SignalStopHandler>();
	private readonly cancellation = Promise.withResolvers<undefined>();

	private readonly props: Partial<SignalScenario>;
	public constructor({ directory, scenario }: SignalHarnessRequest) {
		this.props = scenario;
		this.stageFile = join(directory, "shape.json");
		this.artifactFile = scenario.artifactFile ?? join(directory, "run.json");
		this.operatorStopFile = join(directory, "operator-stop.json");
		if (scenario.holdCancellation !== true) {
			this.cancellation.resolve();
		}
		this.abort = new RunAbortBuilder({
			dependencies: {
				killActiveCommands: this.cancel,
				registerSignal: (signal, handler) => {
					this.handlers.set(signal, handler);
				},
				releaseSignal: (signal) => {
					this.handlers.delete(signal);
				},
				reportError: (message) => {
					this.diagnostics.push(message);
				},
			},
			request: {
				artifactFile: this.artifactFile,
				operatorStopFile: this.operatorStopFile,
				teardown: this.teardown,
			},
		}).build();
	}

	public readonly releaseCancellation = (): void => {
		this.cancellation.resolve();
	};

	public async emit(
		signal: NodeJS.Signals,
	): Promise<SignalStopOutcome | undefined> {
		return await this.handlers.get(signal)?.(signal);
	}

	private readonly cancel = async (): Promise<void> => {
		this.cancellationCalls += 1;
		this.effects.push("kill");

		if (this.props.failCancellation === true) {
			throw new Error("kill failed");
		}

		await this.cancellation.promise;
	};

	private readonly teardown = async (): Promise<void> => {
		this.teardownCalls += 1;
		if (this.props.inspectStageAtTeardown === true) {
			this.evidencePresentAtTeardown = await Bun.file(this.stageFile).exists();
		} else {
			await Promise.resolve();
		}
		this.effects.push("teardown");
	};
}

async function openSignalHarness(
	resources: Pick<TestResources, "track">,
	props: Partial<SignalScenario> = {},
): Promise<RunAbortSignalHarness> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-run-signal-"));

	resources.track(directory);

	return new RunAbortSignalHarness({ directory, scenario: props });
}

export { RunAbortSignalHarness, openSignalHarness };
