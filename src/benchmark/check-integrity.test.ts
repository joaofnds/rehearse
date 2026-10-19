import { describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { captureCheckIntegrity, captureFileHashes } from "./checks";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

const captureFileHashesRejectsADeclaredIntegrityFileMissingAtBaseline =
	async (): Promise<void> => {
		const source = await testResources.createRepository();

		expect(
			captureFileHashes(source.directory, ["missing.json"]),
		).rejects.toThrow(/missing\.json/u);
	};

const captureCheckIntegrityPassesWhenDeclaredFilesAreUnchangedAndIgnoresUndeclaredFiles =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		await Bun.write(join(source.directory, "declared.json"), "declared\n");
		await Bun.write(join(source.directory, "undeclared.json"), "before\n");
		const baselineHashes = await captureFileHashes(source.directory, [
			"declared.json",
		]);
		await Bun.write(join(source.directory, "undeclared.json"), "after\n");

		const result = await captureCheckIntegrity(
			source.directory,
			baselineHashes,
		);

		const [observedFirstEvidence] = result.evidence;

		expect(result.status).toBe("PASS");
		expect(observedFirstEvidence?.path).toBe("declared.json");
	};

const captureCheckIntegrityFailsWithEveryChangedOrDeletedDeclaredPath =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		await Bun.write(join(source.directory, "package.json"), "");
		const baselineHashes = await captureFileHashes(source.directory, [
			"package.json",
			"base.txt",
		]);
		await rm(join(source.directory, "package.json"));
		await Bun.write(join(source.directory, "base.txt"), "changed\n");

		const result = await captureCheckIntegrity(
			source.directory,
			baselineHashes,
		);

		const [observedFirstEvidence] = result.evidence;

		expect(result.status).toBe("FAIL");
		expect(observedFirstEvidence?.claim).toContain("package.json, base.txt");
	};

const captureCheckIntegrityFailsWhenACandidateWeakensACheckDefinition =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const baselineHashes = await captureFileHashes(source.directory, [
			"package.json",
		]);
		await Bun.write(
			join(source.directory, "package.json"),
			'{"scripts":{"typecheck":"true","check":"true","test:unit":"true"}}\n',
		);

		const result = await captureCheckIntegrity(
			source.directory,
			baselineHashes,
		);

		const [observedFirstEvidence] = result.evidence;

		expect(result.status).toBe("FAIL");
		expect(observedFirstEvidence?.claim).toContain("package.json");
	};

describe(captureFileHashes.name, () => {
	it(
		"rejects a declared integrity file missing at baseline",
		captureFileHashesRejectsADeclaredIntegrityFileMissingAtBaseline,
	);
});

describe(captureCheckIntegrity.name, () => {
	it(
		"passes when declared files are unchanged and ignores undeclared files",
		captureCheckIntegrityPassesWhenDeclaredFilesAreUnchangedAndIgnoresUndeclaredFiles,
	);

	it(
		"fails with every changed or deleted declared path",
		captureCheckIntegrityFailsWithEveryChangedOrDeletedDeclaredPath,
	);

	it(
		"fails when a candidate weakens a check definition",
		captureCheckIntegrityFailsWhenACandidateWeakensACheckDefinition,
	);
});
