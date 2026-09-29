import { killActiveCommands } from "./command";
import { RUN_SIGNALS, signalExitCode } from "./run-abort";

export interface SignalStopDependencies {
	readonly killActiveCommands: () => Promise<void>;
	readonly registerSignal: (
		signal: NodeJS.Signals,
		handler: (signal: NodeJS.Signals) => void,
	) => void;
	readonly releaseSignal: (
		signal: NodeJS.Signals,
		handler: (signal: NodeJS.Signals) => void,
	) => void;
	readonly exit: (code: number) => void;
	readonly log: (message: string) => void;
}

/**
 * Ends the process on a stop signal once the commands it started are killed
 * and what it leaves behind is cleaned up. Its commands run in process groups
 * of their own, so a process that exits without killing them leaves them
 * spending. Answers the release, which returns the signals to their default.
 */
export function stopOnSignal(
	dependencies: SignalStopDependencies,
	cleanUp: () => Promise<void>,
): () => void {
	let stopping = false;
	const stop = async (signal: NodeJS.Signals): Promise<void> => {
		dependencies.log(`Received ${signal}; stopping.`);
		await dependencies.killActiveCommands();
		try {
			await cleanUp();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			dependencies.log(`Could not clean up after the stop: ${message}`);
		}

		dependencies.exit(signalExitCode(signal));
	};
	const handler = (signal: NodeJS.Signals): void => {
		if (stopping) {
			return;
		}
		stopping = true;
		void stop(signal);
	};
	for (const signal of RUN_SIGNALS) {
		dependencies.registerSignal(signal, handler);
	}

	return () => {
		for (const signal of RUN_SIGNALS) {
			dependencies.releaseSignal(signal, handler);
		}
	};
}

/** This process's signals, its running commands, and its exit. */
export function processSignalStop(
	log: (message: string) => void,
): SignalStopDependencies {
	return {
		killActiveCommands,
		registerSignal: (signal, handler) => {
			process.on(signal, handler);
		},
		releaseSignal: (signal, handler) => {
			process.off(signal, handler);
		},
		exit: (code) => process.exit(code),
		log,
	};
}
