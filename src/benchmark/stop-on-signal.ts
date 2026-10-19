import { killActiveCommands } from "./command";
import processSignals from "./process-signals";
import type { SignalRegistration, SignalStopOutcome } from "./process-signals";
import { RUN_SIGNALS, signalExitCode } from "./run-abort";

interface SignalStopDiagnostics {
	readonly log: (message: string) => void;
	readonly flush: () => Promise<void>;
}

interface SignalStopDependencies extends SignalRegistration {
	readonly killActiveCommands: () => Promise<void>;
	readonly log: (message: string) => void;
}

interface SignalStopRequest {
	readonly dependencies: SignalStopDependencies;
	readonly cleanUp: () => Promise<void>;
	readonly recordStop: (signal: NodeJS.Signals) => Promise<void>;
	readonly signal: NodeJS.Signals;
}

async function stopAndCleanUp({
	dependencies,
	cleanUp,
	recordStop,
	signal,
}: SignalStopRequest): Promise<SignalStopOutcome> {
	dependencies.log(`Received ${signal}; stopping.`);
	try {
		await recordStop(signal);
	} catch (error) {
		dependencies.log(
			`Could not record the stop: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	await dependencies.killActiveCommands();
	try {
		await cleanUp();
	} catch (error) {
		dependencies.log(
			`Could not clean up after the stop: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return { code: signalExitCode(signal), kind: "stopped" };
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
function stopOnSignal(
	dependencies: SignalStopDependencies,
	cleanUp: () => Promise<void>,
	recordStop: (signal: NodeJS.Signals) => Promise<void> = async () => {
		await Promise.resolve();
	},
): () => void {
	let stopping = false;

	const handler = async (
		signal: NodeJS.Signals,
	): Promise<SignalStopOutcome> => {
		if (stopping) {
			return { kind: "ignored" };
		}

		stopping = true;
		return await stopAndCleanUp({
			cleanUp,
			dependencies,
			recordStop,
			signal,
		});
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

/** This process's signal listeners, active commands, and diagnostic output. */
function processSignalStop({
	log,
	flush,
}: SignalStopDiagnostics): SignalStopDependencies {
	return { ...processSignals(flush), killActiveCommands, log };
}

export { stopOnSignal, processSignalStop };
export type { SignalStopDependencies, SignalStopDiagnostics };
