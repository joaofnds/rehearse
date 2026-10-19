import type { SignalStopOutcome } from "./process-signals";
import type {
	RunAbortDependencies,
	RunAbortRequest,
} from "./run-abort-contracts";
import type RunAbortRecovery from "./run-abort-recovery";

const SIGHUP_EXIT_CODE = 129;

const SIGINT_EXIT_CODE = 130;

const SIGTERM_EXIT_CODE = 143;

const RUN_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

function signalExitCode(signal: NodeJS.Signals): number {
	if (signal === "SIGTERM") {
		return SIGTERM_EXIT_CODE;
	}

	if (signal === "SIGHUP") {
		return SIGHUP_EXIT_CODE;
	}

	return SIGINT_EXIT_CODE;
}

interface AbortSignalDependencies {
	readonly dependencies: RunAbortDependencies;
	readonly request: RunAbortRequest;
	readonly recovery: Readonly<RunAbortRecovery>;
}

class RunAbortSignals {
	private teardownStarted: Promise<void> | undefined = undefined;
	private signalAbortStarted = false;

	public constructor(private readonly props: AbortSignalDependencies) {}

	public register(): void {
		for (const signal of RUN_SIGNALS) {
			this.props.dependencies.registerSignal(signal, this.cleanUpOnSignal);
		}
	}

	public readonly release = (): void => {
		for (const signal of RUN_SIGNALS) {
			this.props.dependencies.releaseSignal(signal, this.cleanUpOnSignal);
		}
	};

	public readonly teardown = async (): Promise<void> => {
		this.teardownStarted ??= this.props.request.teardown();
		await this.teardownStarted;
	};

	private readonly attemptRecovery = async (
		recover: () => Promise<void>,
	): Promise<void> => {
		try {
			await recover();
		} catch (error) {
			this.props.dependencies.reportError(
				error instanceof Error ? error.message : String(error),
			);
		}
	};

	private async abortOnSignal(
		signal: NodeJS.Signals,
	): Promise<SignalStopOutcome> {
		if (this.teardownStarted === undefined) {
			await this.attemptRecovery(this.props.dependencies.killActiveCommands);
		}
		await this.props.recovery.markAborted(`run interrupted by ${signal}`, {
			signal,
		});
		await this.attemptRecovery(this.teardown);

		return { code: signalExitCode(signal), kind: "stopped" };
	}

	private readonly cleanUpOnSignal = async (
		signal: NodeJS.Signals,
	): Promise<SignalStopOutcome> => {
		this.props.dependencies.reportError(
			`\nReceived ${signal}; removing the run's checkout before exit.`,
		);

		if (this.signalAbortStarted) {
			return { kind: "ignored" };
		}

		this.signalAbortStarted = true;

		return await this.abortOnSignal(signal);
	};
}

export { RUN_SIGNALS, signalExitCode, RunAbortSignals };
