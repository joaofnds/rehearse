import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { RefusedPreconditionError } from "./exit-codes";
import {
	readSettings,
	requireSpendCeiling,
	storeLinkedCorpusDirectory,
	storeSpendCeiling,
} from "./settings";

const recordsDirectory = join(tmpdir(), `rehearse-settings-${randomUUID()}`);

beforeEach(async () => {
	await mkdir(recordsDirectory, { recursive: true });
});

afterEach(async () => {
	await rm(recordsDirectory, { force: true, recursive: true });
});

describe(readSettings.name, () => {
	it("reads back a stored spend ceiling", async () => {
		const storedCeilingUsd = 2.5;

		await storeSpendCeiling(recordsDirectory, storedCeilingUsd);

		const settings = await readSettings(recordsDirectory);

		expect(settings).toEqual({ spendCeilingUsd: 2.5 });
	});

	it("reads no spend ceiling from records that never stored one", async () => {
		const settings = await readSettings(recordsDirectory);

		expect(settings).toEqual({});
	});

	it("keeps settings it does not know when storing a ceiling", async () => {
		const storedCeilingUsd = 2.5;

		await Bun.write(
			join(recordsDirectory, "settings.json"),
			JSON.stringify({ laterSetting: "kept" }),
		);

		await storeSpendCeiling(recordsDirectory, storedCeilingUsd);

		expect(
			await Bun.file(join(recordsDirectory, "settings.json")).json(),
		).toEqual({ laterSetting: "kept", spendCeilingUsd: 2.5 });
	});

	describe.each([
		["not JSON", "not json"],
		["a ceiling that is not a number", '{"spendCeilingUsd":"5"}'],
	])("when the settings file holds %s", (_case, contents) => {
		it("refuses, naming the file to repair", async () => {
			const file = join(recordsDirectory, "settings.json");
			await Bun.write(file, contents);

			const error = await failureOf(readSettings(recordsDirectory));

			expect(error).toBeInstanceOf(RefusedPreconditionError);
			expect(error.message).toContain(file);
		});
	});
});

describe(storeSpendCeiling.name, () => {
	it("replaces the ceiling stored before it", async () => {
		const firstStoredCeilingUsd = 2.5;
		const secondStoredCeilingUsd = 4;

		await storeSpendCeiling(recordsDirectory, firstStoredCeilingUsd);

		await storeSpendCeiling(recordsDirectory, secondStoredCeilingUsd);

		expect(await readSettings(recordsDirectory)).toEqual({
			spendCeilingUsd: 4,
		});
	});

	it.each(
		(
			[
				{ ceilingUsd: 0 },
				{ ceilingUsd: -1 },
				{ ceilingUsd: Number.NaN },
				{ ceilingUsd: Number.POSITIVE_INFINITY },
			] as const
		).map(({ ceilingUsd }) => [ceilingUsd] as const),
	)("refuses %p as a ceiling", async (ceilingUsd) => {
		const error = await failureOf(
			storeSpendCeiling(recordsDirectory, ceilingUsd),
		);

		expect(error).toBeInstanceOf(RangeError);
		expect(await readSettings(recordsDirectory)).toEqual({});
	});
});

describe("storing two settings at once", () => {
	it("keeps both, since neither write reads settings the other is replacing", async () => {
		const storedCeilingUsd = 3;

		await Promise.all([
			storeSpendCeiling(recordsDirectory, storedCeilingUsd),
			storeLinkedCorpusDirectory(recordsDirectory, "/corpus"),
		]);

		expect(await readSettings(recordsDirectory)).toEqual({
			linkedCorpusDirectory: "/corpus",
			spendCeilingUsd: 3,
		});
	});
});

describe(requireSpendCeiling.name, () => {
	it("returns the stored ceiling", async () => {
		const storedCeilingUsd = 2.5;

		const expectedStoredCeilingUsd = 2.5;

		await storeSpendCeiling(recordsDirectory, storedCeilingUsd);

		expect(await requireSpendCeiling(recordsDirectory)).toBe(
			expectedStoredCeilingUsd,
		);
	});

	describe("when no ceiling is stored", () => {
		it("refuses, naming the command that sets one", async () => {
			const error = await failureOf(requireSpendCeiling(recordsDirectory));

			expect(error).toBeInstanceOf(RefusedPreconditionError);
			expect(error.message).toContain("rehearse settings --spend-ceiling-usd");
		});
	});
});
