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

/** What the work was refused or failed with, or undefined when it ran. */
async function refusal(work: Promise<string>): Promise<Error | undefined> {
	try {
		await work;

		return undefined;
	} catch (error) {
		if (error instanceof Error) {
			return error;
		}
		throw error;
	}
}

const now = (): Promise<string> => Promise.resolve("done");

describe("CorpusEditGate", () => {
	it("refuses a launch start while an edit is applying, and lets one start after", async () => {
		const gate = new CorpusEditGate();
		const apply = held();
		const applying = gate.applying(apply.work);
		await apply.reached;

		expect(await refusal(gate.starting(now))).toBeInstanceOf(
			CorpusEditBusyError,
		);
		apply.release();

		expect(await applying).toBe("done");
		expect(await gate.starting(now)).toBe("done");
	});

	it("refuses an apply while a launch is starting, and lets one apply after", async () => {
		const gate = new CorpusEditGate();
		const start = held();
		const starting = gate.starting(start.work);
		await start.reached;

		expect(await refusal(gate.applying(now))).toBeInstanceOf(
			CorpusEditBusyError,
		);
		start.release();

		expect(await starting).toBe("done");
		expect(await gate.applying(now)).toBe("done");
	});

	it("refuses a second apply while one is applying", async () => {
		const gate = new CorpusEditGate();
		const apply = held();
		const applying = gate.applying(apply.work);
		await apply.reached;

		expect(await refusal(gate.applying(now))).toBeInstanceOf(
			CorpusEditBusyError,
		);
		apply.release();

		expect(await applying).toBe("done");
	});

	it("lets launches start together, and opens once the last has started", async () => {
		const gate = new CorpusEditGate();
		const first = held();
		const second = held();
		const starting = [gate.starting(first.work), gate.starting(second.work)];
		await Promise.all([first.reached, second.reached]);
		first.release();
		await starting[0];

		expect(await refusal(gate.applying(now))).toBeInstanceOf(
			CorpusEditBusyError,
		);
		second.release();

		expect(await starting[1]).toBe("done");
		expect(await gate.applying(now)).toBe("done");
	});

	it("opens after work that failed", async () => {
		const gate = new CorpusEditGate();

		const failed = await refusal(
			gate.applying(() => Promise.reject(new Error("failed"))),
		);

		expect(failed).toEqual(new Error("failed"));
		expect(await gate.starting(now)).toBe("done");
	});
});
