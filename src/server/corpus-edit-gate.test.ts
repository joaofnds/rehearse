import { describe, expect, it } from "bun:test";
import { CorpusEditBusyError } from "./corpus-edit-busy-error";
import { CorpusEditGate } from "./corpus-edit-gate";

interface HeldWork {
	readonly reached: Promise<undefined>;
	readonly release: () => void;
	readonly work: () => Promise<string>;
}

function held(): HeldWork {
	const reached = Promise.withResolvers<undefined>();
	const released = Promise.withResolvers<undefined>();

	return {
		reached: reached.promise,
		release: () => {
			released.resolve(undefined);
		},
		work: async () => {
			reached.resolve(undefined);
			await released.promise;

			return "done";
		},
	};
}

const now = (): Promise<string> => Promise.resolve("done");

describe(CorpusEditGate.name, () => {
	it("lets launches start together", async () => {
		const gate = new CorpusEditGate();
		const first = held();
		const starting = gate.starting(first.work);
		await first.reached;

		const second = await gate.starting(now);

		first.release();
		expect(second).toBe("done");
		expect(await starting).toBe("done");
	});

	describe("when an edit is applying", () => {
		it("refuses a launch start", async () => {
			const gate = new CorpusEditGate();
			const apply = held();
			const applying = gate.applying(apply.work);
			await apply.reached;

			expect(gate.starting(now)).rejects.toBeInstanceOf(CorpusEditBusyError);

			apply.release();
			await applying;
		});

		it("refuses a second apply", async () => {
			const gate = new CorpusEditGate();
			const apply = held();
			const applying = gate.applying(apply.work);
			await apply.reached;

			expect(gate.applying(now)).rejects.toBeInstanceOf(CorpusEditBusyError);

			apply.release();
			await applying;
		});
	});

	describe("when an edit has applied", () => {
		it("lets a launch start", async () => {
			const gate = new CorpusEditGate();
			const apply = held();
			const applying = gate.applying(apply.work);
			await apply.reached;
			apply.release();
			await applying;

			expect(await gate.starting(now)).toBe("done");
		});
	});

	describe("when a launch is starting", () => {
		it("refuses an apply", async () => {
			const gate = new CorpusEditGate();
			const start = held();
			const starting = gate.starting(start.work);
			await start.reached;

			expect(gate.applying(now)).rejects.toBeInstanceOf(CorpusEditBusyError);

			start.release();
			await starting;
		});

		it("refuses an apply until the last of several starts has started", async () => {
			const gate = new CorpusEditGate();
			const first = held();
			const second = held();
			const starting = [gate.starting(first.work), gate.starting(second.work)];
			await Promise.all([first.reached, second.reached]);
			first.release();
			await starting[0];

			expect(gate.applying(now)).rejects.toBeInstanceOf(CorpusEditBusyError);

			second.release();
			await starting[1];
		});
	});

	describe("when a launch has started", () => {
		it("lets an apply run", async () => {
			const gate = new CorpusEditGate();
			const start = held();
			const starting = gate.starting(start.work);
			await start.reached;
			start.release();
			await starting;

			expect(await gate.applying(now)).toBe("done");
		});
	});

	describe("when an apply failed", () => {
		it("passes its failure on", () => {
			const gate = new CorpusEditGate();
			const failure = new Error("failed");

			expect(gate.applying(() => Promise.reject(failure))).rejects.toBe(
				failure,
			);
		});

		it("lets a launch start", async () => {
			const gate = new CorpusEditGate();
			const failed = gate.applying(() => Promise.reject(new Error("failed")));
			await failed.catch(() => undefined);

			expect(await gate.starting(now)).toBe("done");
		});
	});
});
