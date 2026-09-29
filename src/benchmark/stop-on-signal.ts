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
 * Ends the process on a stop signal once the stop is recorded, the commands it
 * started are killed and what it leaves behind is cleaned up. The record comes
 * first because a killed command fails whatever awaited it, and that failure
 * would otherwise be written as the outcome. Its commands run in process
 * groups of their own, so a process that exits without killing them leaves
 * them spending. Answers the release, which returns the signals to their
 * default unless a stop has begun.
 */
export function stopOnSignal(
	dependencies: SignalStopDependencies,
	cleanUp: () => Promise<void>,
	recordStop: (signal: NodeJS.Signals) => Promise<void> = () =>
		Promise.resolve(),
): () => void {
	let stopping = false;
	const stop = async (signal: NodeJS.Signals): Promise<void> => {
		dependencies.log(`Received ${signal}; stopping.`);
		try {
			await recordStop(signal);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			dependencies.log(`Could not record the stop: ${message}`);
		}
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
		// A stop under way ends in exit, and a signal left to the default
		// during its cleanup would kill the process before the cleanup ends.
		if (stopping) {
			return;
		}
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
