import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readRecordedEvidenceFile } from "#server/session-history-reader";
import {
	clearSessionHistoryRoots,
	roots,
} from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

async function runsWithGroupFile(): Promise<{
	readonly root: string;
	readonly runsDirectory: string;
}> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-recorded-evidence-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	await Bun.write(
		join(runsDirectory, "confirmations", "group-a", "group.json"),
		"group",
	);

	return { root, runsDirectory };
}

describe(readRecordedEvidenceFile.name, () => {
	describe("when recorded paths contain parent segments", () => {
		it(
			"reads a manifest-relative path whose parents lead back into the runs directory",
			verifyReadsAManifestRelativePathWhoseParentsLeadBack,
		);

		it(
			"resolves parents past the runs directory inside it, never outside",
			verifyResolvesParentsPastTheRunsDirectoryInsideItNever,
		);

		it.each([
			["parents alone", "../.."],
			[
				"a parent after a name",
				"../confirmations/group-a/../group-a/group.json",
			],
		])("refuses %s", async (_name, recordedPath) => {
			const { runsDirectory } = await runsWithGroupFile();

			expect(
				readRecordedEvidenceFile(runsDirectory, recordedPath),
			).rejects.toMatchObject({ kind: "refused" });
		});
	});
});

async function verifyReadsAManifestRelativePathWhoseParentsLeadBack(): Promise<void> {
	const { runsDirectory } = await runsWithGroupFile();

	const evidence = await readRecordedEvidenceFile(
		runsDirectory,
		"../../confirmations/group-a/group.json",
	);

	expect(evidence.text).toBe("group");
}

async function verifyResolvesParentsPastTheRunsDirectoryInsideItNever(): Promise<void> {
	const { root, runsDirectory } = await runsWithGroupFile();
	await Bun.write(join(root, "outside.json"), "outside");
	await Bun.write(join(runsDirectory, "outside.json"), "inside");

	const evidence = await readRecordedEvidenceFile(
		runsDirectory,
		"../../outside.json",
	);

	expect(evidence.text).toBe("inside");
}
