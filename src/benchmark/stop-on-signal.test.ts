import { describe, expect, it } from "bun:test";
import type { SignalStopDependencies } from "./stop-on-signal";
import { stopOnSignal } from "./stop-on-signal";

class FakeProcess implements SignalStopDependencies {
	public readonly events: string[] = [];
	public readonly exits: number[] = [];
	private readonly handlers = new Map<
		NodeJS.Signals,
		(signal: NodeJS.Signals) => void
	>();

	public readonly killActiveCommands = (): Promise<void> => {
		this.events.push("killed commands");

		return Promise.resolve();
	};

	public readonly registerSignal = (
		signal: NodeJS.Signals,
		handler: (signal: NodeJS.Signals) => void,
	): void => {
		this.handlers.set(signal, handler);
	};

	public readonly releaseSignal = (signal: NodeJS.Signals): void => {
		this.handlers.delete(signal);
	};

	public readonly exit = (code: number): void => {
		this.exits.push(code);
	};

	public readonly log = (message: string): void => {
		this.events.push(message);
	};

	public cleanup(): () => Promise<void> {
		return () => {
			this.events.push("cleaned up");

			return Promise.resolve();
		};
	}

	public async receive(signal: NodeJS.Signals): Promise<void> {
		this.handlers.get(signal)?.(signal);
		await Bun.sleep(0);
	}
}

describe(stopOnSignal.name, () => {
	it("kills the commands, cleans up, then exits with the signal's code", async () => {
		const system = new FakeProcess();
		stopOnSignal(system, system.cleanup());

		await system.receive("SIGTERM");

		expect(system.events).toEqual([
			"Received SIGTERM; stopping.",
			"killed commands",
			"cleaned up",
		]);
		expect(system.exits).toEqual([143]);
	});

	it.each([
		["SIGINT", 130],
		["SIGHUP", 129],
	] as const)("exits %s with code %d", async (signal, code) => {
		const system = new FakeProcess();
		stopOnSignal(system, system.cleanup());

		await system.receive(signal);

		expect(system.exits).toEqual([code]);
	});

	describe("when the signal comes again during the stop", () => {
		it("stops once", async () => {
			const system = new FakeProcess();
			stopOnSignal(system, system.cleanup());

			await Promise.all([system.receive("SIGTERM"), system.receive("SIGINT")]);

			expect(system.exits).toEqual([143]);
		});
	});

	describe("when the cleanup fails", () => {
		it("still exits with the signal's code", async () => {
			const system = new FakeProcess();
			stopOnSignal(system, () => Promise.reject(new Error("worktree busy")));

			await system.receive("SIGTERM");

			expect(system.events).toContain(
				"Could not clean up after the stop: worktree busy",
			);
			expect(system.exits).toEqual([143]);
		});
	});

	describe("when it is released", () => {
		it("leaves the signal to the process's default", async () => {
			const system = new FakeProcess();
			const release = stopOnSignal(system, system.cleanup());

			release();
			await system.receive("SIGTERM");

			expect(system.exits).toEqual([]);
		});
	});
});
