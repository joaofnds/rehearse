import { describe, expect, it } from "bun:test";
import { realpath, rm, symlink } from "node:fs/promises";
import { join } from "node:path";

import type { CorpusRoot } from "./corpus-file";
import { corpusVersionLog, measureCorpusVersion } from "./corpus-version";
import {
	createVersionWorkspace,
	versionDigest,
} from "./corpus-version-test-fixtures";

const { recordsDirectory, scratch, source } = createVersionWorkspace();

describe(corpusVersionLog.name, () => {
	describe("when a measured source has been removed", () => {
		it("retains its recorded history", async () => {
			const canonicalSource = { ...source, root: await realpath(source.root) };
			const digest = versionDigest(
				await measureCorpusVersion(recordsDirectory, canonicalSource),
			);

			await rm(source.root, { recursive: true });

			expect(await corpusVersionLog(recordsDirectory, canonicalSource)).toEqual(
				[digest],
			);
		});
	});
	describe("when a source has never existed", () => {
		it("returns no history", async () => {
			const missingSource: CorpusRoot = {
				kind: "directory",
				root: join(scratch, "missing"),
			};

			expect(await corpusVersionLog(recordsDirectory, missingSource)).toEqual(
				[],
			);
		});
	});
	describe("when a source root is a symbolic link loop", () => {
		it("propagates the filesystem refusal", async () => {
			const root = join(scratch, "loop");
			await symlink(root, root);

			const reading = corpusVersionLog(recordsDirectory, {
				kind: "directory",
				root,
			});

			expect(reading).rejects.toMatchObject({ code: "ELOOP" });
		});
	});
});
