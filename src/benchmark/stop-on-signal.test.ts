import { describe, expect, it } from "bun:test";

import type { SignalStopHandler } from "./process-signals";
import type { SignalStopDependencies } from "./stop-on-signal";
import { stopOnSignal } from "./stop-on-signal";

const EXPECTED_SIGTERM_EXIT_CODE = 143;

class FakeProcess implements SignalStopDependencies {
	public readonly events: string[] = [];
	public readonly exits: number[] = [];
	private readonly handlers = new Map<NodeJS.Signals, SignalStopHandler>();

	public readonly killActiveCommands = async (): Promise<void> => {
		this.events.push("killed commands");

		await Promise.resolve();
	};

	public readonly registerSignal = (
		signal: NodeJS.Signals,
		handler: SignalStopHandler,
	): void => {
		this.handlers.set(signal, handler);
	};

	public readonly releaseSignal = (signal: NodeJS.Signals): void => {
		this.handlers.delete(signal);
	};

	public readonly log = (message: string): void => {
		this.events.push(message);
	};

	public cleanup(): () => Promise<void> {
		return async () => {
			this.events.push("cleaned up");

			await Promise.resolve();
		};
	}

	public handles(signal: NodeJS.Signals): boolean {
		return this.handlers.has(signal);
	}

	public async receive(signal: NodeJS.Signals): Promise<void> {
		const outcome = await this.handlers.get(signal)?.(signal);
		if (outcome?.kind === "stopped") {
			this.exits.push(outcome.code);
		}
	}
}

const stopOnSignalKillsTheCommandsCleansUpThenExitsWithTheSignalsCode =
	async (): Promise<void> => {
		const system = new FakeProcess();

		stopOnSignal(system, system.cleanup());

		await system.receive("SIGTERM");

		expect(system.events).toEqual([
			"Received SIGTERM; stopping.",
			"killed commands",
			"cleaned up",
		]);
		expect(system.exits).toEqual([EXPECTED_SIGTERM_EXIT_CODE]);
	};

const stopOnSignalRecordsTheStopBeforeItKillsTheCommands =
	async (): Promise<void> => {
		const system = new FakeProcess();

		stopOnSignal(system, system.cleanup(), async (signal) => {
			system.events.push(`recorded ${signal}`);

			await Promise.resolve();
		});

		await system.receive("SIGTERM");

		expect(system.events).toEqual([
			"Received SIGTERM; stopping.",
			"recorded SIGTERM",
			"killed commands",
			"cleaned up",
		]);
	};

const stopOnSignalWhenTheSignalComesAgainDuringTheStopStopsOnce =
	async (): Promise<void> => {
		const system = new FakeProcess();

		stopOnSignal(system, system.cleanup());

		await Promise.all([system.receive("SIGTERM"), system.receive("SIGINT")]);

		expect(system.exits).toEqual([EXPECTED_SIGTERM_EXIT_CODE]);
	};

const stopOnSignalWhenRecordingTheStopFailsStillKillsTheCommandsAndExitsWithTheSignalsCode =
	async (): Promise<void> => {
		const system = new FakeProcess();

		stopOnSignal(system, system.cleanup(), async () => {
			await Promise.reject(new Error("disk full"));
		});

		await system.receive("SIGTERM");

		expect(system.events).toEqual([
			"Received SIGTERM; stopping.",
			"Could not record the stop: disk full",
			"killed commands",
			"cleaned up",
		]);
		expect(system.exits).toEqual([EXPECTED_SIGTERM_EXIT_CODE]);
	};

const stopOnSignalWhenTheCleanupFailsStillExitsWithTheSignalsCode =
	async (): Promise<void> => {
		const system = new FakeProcess();

		stopOnSignal(system, async () => {
			await Promise.reject(new Error("worktree busy"));
		});

		await system.receive("SIGTERM");

		expect(system.events).toContain(
			"Could not clean up after the stop: worktree busy",
		);
		expect(system.exits).toEqual([EXPECTED_SIGTERM_EXIT_CODE]);
	};

const stopOnSignalWhenItIsReleasedWhileTheStopIsCleaningUpKeepsTheSignalsUntilThe =
	async (): Promise<void> => {
		const system = new FakeProcess();
		const cleanup = Promise.withResolvers<undefined>();

		const release = stopOnSignal(system, async () => {
			await cleanup.promise;
		});
		const stopped = system.receive("SIGTERM");

		release();

		expect(system.handles("SIGTERM")).toBe(true);
		cleanup.resolve();
		await stopped;
	};

const stopOnSignalWhenItIsReleasedLeavesTheSignalToTheProcesssDefault =
	async (): Promise<void> => {
		const system = new FakeProcess();

		const release = stopOnSignal(system, system.cleanup());

		release();
		await system.receive("SIGTERM");

		expect(system.exits).toEqual([]);
	};

const signalExitCases = (
	[
		{ code: 130, signal: "SIGINT" },
		{ code: 129, signal: "SIGHUP" },
	] as const
).map(({ signal, code }) => [signal, code] as const);
const exitsWithSignalCode = async (
	signal: NodeJS.Signals,
	code: number,
): Promise<void> => {
	const system = new FakeProcess();

	stopOnSignal(system, system.cleanup());

	await system.receive(signal);

	expect(system.exits).toEqual([code]);
};

describe(stopOnSignal.name, () => {
	it(
		"kills the commands, cleans up, then exits with the signal's code",
		stopOnSignalKillsTheCommandsCleansUpThenExitsWithTheSignalsCode,
	);

	it(
		"records the stop before it kills the commands",
		stopOnSignalRecordsTheStopBeforeItKillsTheCommands,
	);

	it.each(signalExitCases)("exits %s with code %d", exitsWithSignalCode);

	describe("when the signal comes again during the stop", () => {
		it("stops once", stopOnSignalWhenTheSignalComesAgainDuringTheStopStopsOnce);
	});

	describe("when recording the stop fails", () => {
		it(
			"still kills the commands and exits with the signal's code",
			stopOnSignalWhenRecordingTheStopFailsStillKillsTheCommandsAndExitsWithTheSignalsCode,
		);
	});

	describe("when the cleanup fails", () => {
		it(
			"still exits with the signal's code",
			stopOnSignalWhenTheCleanupFailsStillExitsWithTheSignalsCode,
		);
	});

	describe("when it is released while the stop is cleaning up", () => {
		it(
			"keeps the signals until the stop exits",
			stopOnSignalWhenItIsReleasedWhileTheStopIsCleaningUpKeepsTheSignalsUntilThe,
		);
	});

	describe("when it is released", () => {
		it(
			"leaves the signal to the process's default",
			stopOnSignalWhenItIsReleasedLeavesTheSignalToTheProcesssDefault,
		);
	});
});
