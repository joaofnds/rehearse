import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pairedRerun } from "./paired-rerun";

describe("pairedRerun", () => {
	const directories: string[] = [];

	afterEach(async () => {
		await Promise.all(
			directories
				.splice(0)
				.map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	describe("when an invalidated row's records cannot be read", () => {
		it("offers none and names the row", async () => {
			const runsDirectory = await mkdtemp(join(tmpdir(), "rehearse-rerun-"));
			directories.push(runsDirectory);
			const row = "2026-09-05T00-00-00.000Z";

			const rerun = await pairedRerun(runsDirectory, [row], "CLAUDE.md");

			expect(rerun.kind).toBe("none");
			expect(rerun.kind === "none" ? rerun.reason : "").toContain(
				`, and these could not be read: ${row}: `,
			);
		});
	});
});
