import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failureOf } from "#cli/cli-test-support";
import { RefusedPreconditionError } from "./exit-codes";
import {
	readSettings,
	requireSpendCeiling,
	storeSpendCeiling,
} from "./settings";

let recordsDirectory: string;

beforeEach(async () => {
	recordsDirectory = await mkdtemp(join(tmpdir(), "rehearse-settings-"));
});

afterEach(async () => {
	await rm(recordsDirectory, { force: true, recursive: true });
});

describe(readSettings.name, () => {
	it("reads back a stored spend ceiling", async () => {
		await storeSpendCeiling(recordsDirectory, 2.5);

		const settings = await readSettings(recordsDirectory);

		expect(settings).toEqual({ spendCeilingUsd: 2.5 });
	});

	it("reads no spend ceiling from records that never stored one", async () => {
		const settings = await readSettings(recordsDirectory);

		expect(settings).toEqual({});
	});
});

describe(storeSpendCeiling.name, () => {
	it("replaces the ceiling stored before it", async () => {
		await storeSpendCeiling(recordsDirectory, 2.5);

		await storeSpendCeiling(recordsDirectory, 4);

		expect(await readSettings(recordsDirectory)).toEqual({
			spendCeilingUsd: 4,
		});
	});

	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
		"refuses %p as a ceiling",
		async (ceilingUsd) => {
			const error = await failureOf(
				storeSpendCeiling(recordsDirectory, ceilingUsd),
			);

			expect(error).toBeInstanceOf(RangeError);
			expect(await readSettings(recordsDirectory)).toEqual({});
		},
	);
});

describe(requireSpendCeiling.name, () => {
	it("returns the stored ceiling", async () => {
		await storeSpendCeiling(recordsDirectory, 2.5);

		expect(await requireSpendCeiling(recordsDirectory)).toBe(2.5);
	});

	describe("when no ceiling is stored", () => {
		it("refuses, naming the command that sets one", async () => {
			const error = await failureOf(requireSpendCeiling(recordsDirectory));

			expect(error).toBeInstanceOf(RefusedPreconditionError);
			expect(error.message).toContain("rehearse settings --spend-ceiling-usd");
		});
	});
});
