import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { CONTROL_DIR } from "#benchmark/config";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { readControlSources } from "#cli/calibrate-command";
import { failureOf } from "#cli/cli-test-support";

async function readsTheFinalRubricTheCaseDeclares(): Promise<void> {
	const sources = await readControlSources("audit-log", "the frozen rubric");

	expect(sources.finalRubric).toBe(
		await Bun.file(join(CONTROL_DIR, "cases/audit-log/rubric.md")).text(),
	);
}

async function readsTheFrozenRubricForARunThatRecorded(): Promise<void> {
	const sources = await readControlSources(undefined, "the frozen rubric");

	expect(sources.finalRubric).toBe("the frozen rubric");
}

async function refusesACaseThatIsNotThere(): Promise<void> {
	const failure = await failureOf(
		readControlSources("no-such-case", "the frozen rubric"),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure?.message).toContain("no-such-case");
}

async function refusesACaseThatDeclaresNoFinalRubric(): Promise<void> {
	const failure = await failureOf(
		readControlSources("smoke", "the frozen rubric"),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure?.message).toContain("smoke");
}

describe(readControlSources.name, () => {
	it(
		"reads the final rubric the case declares",
		readsTheFinalRubricTheCaseDeclares,
	);

	it(
		"reads the frozen rubric for a run that recorded no case",
		readsTheFrozenRubricForARunThatRecorded,
	);

	describe("when the recorded case does not exist", () => {
		it("refuses a case that is not there", refusesACaseThatIsNotThere);
	});

	describe("when the case declares no final rubric", () => {
		it(
			"refuses a case that declares no final rubric",
			refusesACaseThatDeclaresNoFinalRubric,
		);
	});
});
