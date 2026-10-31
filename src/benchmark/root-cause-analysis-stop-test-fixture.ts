import type {
	AnalysisInvoker,
	SignalStopInstaller,
} from "./root-cause-analysis";

interface StopCallbacks {
	readonly cleanUp: () => Promise<void>;
	readonly recordStop: (signal: NodeJS.Signals) => Promise<void>;
}

/**
 * A paid call that runs until a stop kills it, and the stop callbacks the
 * analysis hands its signal handling, run in the order a real stop runs them:
 * record the stop, kill the call, then clean up.
 */
class StoppableAnalysisCall {
	private callbacks: StopCallbacks | undefined = undefined;
	private readonly called = Promise.withResolvers<undefined>();
	private readonly answer = Promise.withResolvers<string>();

	public readonly invoke: AnalysisInvoker = async () => {
		this.called.resolve();

		return await this.answer.promise;
	};

	public readonly stopOnSignal: SignalStopInstaller = (cleanUp, recordStop) => {
		this.callbacks = { cleanUp, recordStop };

		return () => {
			this.callbacks = undefined;
		};
	};

	public async stopDuringCall(signal: NodeJS.Signals): Promise<void> {
		await this.called.promise;
		const callbacks = this.installed();

		await callbacks.recordStop(signal);
		this.answer.reject(new Error("The call was killed"));
		await callbacks.cleanUp();
	}

	public installed(): StopCallbacks {
		if (this.callbacks === undefined) {
			throw new Error("The analysis has no signal handling installed");
		}

		return this.callbacks;
	}
}

export { StoppableAnalysisCall as default };
