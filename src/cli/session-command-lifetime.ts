import { randomUUID } from "node:crypto";

import { refuseCommands } from "#benchmark/command";
import type { SessionRunConfig } from "#benchmark/config";
import { operatorStopRecord } from "#benchmark/operator-stop";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import SessionAttemptsInFlight from "#benchmark/session-attempts-in-flight";
import { processSignalStop, stopOnSignal } from "#benchmark/stop-on-signal";
import type { CommandOutput } from "#cli/output";
import { signalDiagnostics } from "#cli/output";
import type { TerminalQuestioner } from "#cli/questioner";
import terminalQuestioner from "#cli/questioner";

import type { SessionRunExecutionDependencies } from "./run-command-contracts";

// Three SIGTERM stops of a real smoke attempt each exited 18 ms after the
// signal with the record written. The bound only binds a hung attempt.
const STOP_SETTLE_BOUND_MS = 5000;

interface SessionCommandLifetimeRequest {
	readonly config: Pick<SessionRunConfig, "confirmation">;
	readonly output: CommandOutput;
	readonly runsDirectory: string;
	readonly boundary: Pick<
		SessionRunExecutionDependencies,
		"refuseCommands" | "stopOnSignal"
	>;
}
class SessionCommandLifetime {
	public readonly questioner: TerminalQuestioner;
	public readonly groupId: string;
	public readonly inFlight = new SessionAttemptsInFlight();
	private readonly release: () => void;
	public constructor({
		config,
		output,
		runsDirectory,
		boundary,
	}: SessionCommandLifetimeRequest) {
		this.questioner = terminalQuestioner(signalDiagnostics(output).flush);
		this.groupId = randomUUID();
		// A group records the stop in its directory here, and a single attempt
		// in its own as it settles, from the signal it closed with. Attempts
		// and commands close before the stop kills the commands, so none starts
		// after the kill.
		this.release = (
			boundary.stopOnSignal ??
			((cleanUp, recordStop) =>
				stopOnSignal(
					processSignalStop(signalDiagnostics(output)),
					cleanUp,
					recordStop,
				))
		)(
			async () => {
				await this.inFlight.settled(STOP_SETTLE_BOUND_MS);
			},
			async (signal) => {
				this.inFlight.close(signal);
				(boundary.refuseCommands ?? refuseCommands)();
				if (config.confirmation !== undefined) {
					await Bun.write(
						confirmationGroupPaths(runsDirectory, this.groupId)
							.operatorStopFile,
						operatorStopRecord(signal),
					);
				}
			},
		);
	}
	public readonly prompt = async (message: string): Promise<string> =>
		await this.questioner.question(message);
	public close(): void {
		const { release } = this;

		this.questioner.close();
		release();
	}
}
export { SessionCommandLifetime as default };
