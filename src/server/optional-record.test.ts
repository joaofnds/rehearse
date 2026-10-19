import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadRunManifest } from "#benchmark/manifest";
import { parseRunSummaryRecord } from "#benchmark/record-summary";
import readOptionalRecord from "#server/optional-record";

const roots = new Set<string>();

afterEach(async () => {
	await Promise.all(
		[...roots].map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
	roots.clear();
});

describe("readOptionalRecord", () => {
	describe("when saved bytes cannot be parsed", () => {
		it.each(["{", "{}"])("treats %j as unavailable", async (text) => {
			const root = await mkdtemp(join(tmpdir(), "rehearse-optional-record-"));
			roots.add(root);
			const path = join(root, "record.json");
			await Bun.write(path, text);

			const reading = await readOptionalRecord(async () => {
				const contents = await Bun.file(path).text();
				return parseRunSummaryRecord(contents);
			});

			expect(reading).toBeUndefined();
		});
	});

	describe("when a record is missing", () => {
		it(
			"retains the manifest reader's explicit absence",
			readMissingManifestAsUnavailable,
		);

		it("retains the filesystem reader's absence", async () => {
			const root = await mkdtemp(join(tmpdir(), "rehearse-optional-record-"));
			roots.add(root);

			const reading = await readOptionalRecord(async () => {
				const text = await Bun.file(join(root, "record.json")).text();
				return text;
			});

			expect(reading).toBeUndefined();
		});
	});

	describe("when the reader has a programming error", () => {
		it("propagates the original failure", () => {
			const failure = new TypeError("record reader invariant failed");

			const reading = readOptionalRecord(async () => {
				await Promise.reject(failure);
			});

			expect(reading).rejects.toBe(failure);
		});
	});
});

async function readMissingManifestAsUnavailable(): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-optional-record-"));
	roots.add(root);

	const reading = await readOptionalRecord(
		async () => await loadRunManifest(join(root, "manifest.json")),
	);

	expect(reading).toBeUndefined();
}
