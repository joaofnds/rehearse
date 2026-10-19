import { describe, expect, it } from "bun:test";

import CorpusEditBusyError from "./corpus-edit-busy-error";
import CorpusEditGate from "./corpus-edit-gate";

const FIRST_WAITING_LAUNCH_INDEX = 0;

const SECOND_WAITING_LAUNCH_INDEX = 1;

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
			released.resolve();
		},
		work: async () => {
			reached.resolve();
			await released.promise;

			return "done";
		},
	};
}

const now = async (): Promise<string> => await Promise.resolve("done");

describe(CorpusEditGate.name, () => {
	describe("when an edit is applying", () => {
		it(
			"refuses a launch start",
			verifyCorpusEditGateNameWhenAnEditIsApplyingRefusesALaunchStart,
		);
		it(
			"refuses a second apply",
			verifyCorpusEditGateNameWhenAnEditIsApplyingRefusesASecondApply,
		);
	});
	describe("when an edit has applied", () => {
		it(
			"lets a launch start",
			verifyCorpusEditGateNameWhenAnEditHasAppliedLetsALaunchStart,
		);
	});
	describe("when an apply failed", () => {
		it(
			"passes its failure on",
			verifyCorpusEditGateNameWhenAnApplyFailedPassesItsFailureOn,
		);
		it(
			"lets a launch start",
			verifyCorpusEditGateNameWhenAnApplyFailedLetsALaunchStart,
		);
	});
});

describe(CorpusEditGate.name, () => {
	it(
		"lets launches start together",
		verifyCorpusEditGateNameLetsLaunchesStartTogether,
	);
	describe("when a launch is starting", () => {
		it(
			"refuses an apply",
			verifyCorpusEditGateNameWhenALaunchIsStartingRefusesAnApply,
		);
		it(
			"refuses an apply until the last of several starts has started",
			verifyCorpusEditGateNameWhenALaunchIsStartingRefusesAnApplyUntilTheLastOfSeveralStartsHasStarted,
		);
	});
	describe("when a launch has started", () => {
		it(
			"lets an apply run",
			verifyCorpusEditGateNameWhenALaunchHasStartedLetsAnApplyRun,
		);
	});
});

async function verifyCorpusEditGateNameLetsLaunchesStartTogether(): Promise<void> {
	const gate = new CorpusEditGate();
	const first = held();
	const starting = gate.starting(first.work);
	await first.reached;

	const second = await gate.starting(now);

	first.release();
	expect(second).toBe("done");
	expect(await starting).toBe("done");
}

async function verifyCorpusEditGateNameWhenAnEditIsApplyingRefusesALaunchStart(): Promise<void> {
	const gate = new CorpusEditGate();
	const apply = held();
	const applying = gate.applying(apply.work);
	await apply.reached;

	expect(gate.starting(now)).rejects.toBeInstanceOf(CorpusEditBusyError);

	apply.release();
	await applying;
}

async function verifyCorpusEditGateNameWhenAnEditIsApplyingRefusesASecondApply(): Promise<void> {
	const gate = new CorpusEditGate();
	const apply = held();
	const applying = gate.applying(apply.work);
	await apply.reached;

	expect(gate.applying(now)).rejects.toBeInstanceOf(CorpusEditBusyError);

	apply.release();
	await applying;
}

async function verifyCorpusEditGateNameWhenAnEditHasAppliedLetsALaunchStart(): Promise<void> {
	const gate = new CorpusEditGate();
	const apply = held();
	const applying = gate.applying(apply.work);
	await apply.reached;
	apply.release();
	await applying;

	expect(await gate.starting(now)).toBe("done");
}

async function verifyCorpusEditGateNameWhenALaunchIsStartingRefusesAnApply(): Promise<void> {
	const gate = new CorpusEditGate();
	const start = held();
	const starting = gate.starting(start.work);
	await start.reached;

	expect(gate.applying(now)).rejects.toBeInstanceOf(CorpusEditBusyError);

	start.release();
	await starting;
}

async function verifyCorpusEditGateNameWhenALaunchIsStartingRefusesAnApplyUntilTheLastOfSeveralStartsHasStarted(): Promise<void> {
	const gate = new CorpusEditGate();
	const first = held();
	const second = held();
	const starting = [gate.starting(first.work), gate.starting(second.work)];
	await Promise.all([first.reached, second.reached]);
	first.release();
	await starting[FIRST_WAITING_LAUNCH_INDEX];

	expect(gate.applying(now)).rejects.toBeInstanceOf(CorpusEditBusyError);

	second.release();
	await starting[SECOND_WAITING_LAUNCH_INDEX];
}

async function verifyCorpusEditGateNameWhenALaunchHasStartedLetsAnApplyRun(): Promise<void> {
	const gate = new CorpusEditGate();
	const start = held();
	const starting = gate.starting(start.work);
	await start.reached;
	start.release();
	await starting;

	expect(await gate.applying(now)).toBe("done");
}

function verifyCorpusEditGateNameWhenAnApplyFailedPassesItsFailureOn(): void {
	const gate = new CorpusEditGate();
	const failure = new Error("failed");

	expect(gate.applying(async () => await Promise.reject(failure))).rejects.toBe(
		failure,
	);
}

async function verifyCorpusEditGateNameWhenAnApplyFailedLetsALaunchStart(): Promise<void> {
	const gate = new CorpusEditGate();
	const failed = gate.applying(
		async () => await Promise.reject(new Error("failed")),
	);
	expect(failed).rejects.toThrow("failed");
	await Promise.allSettled([failed]);

	expect(await gate.starting(now)).toBe("done");
}
