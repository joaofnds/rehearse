import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { ReadManifestEntry } from "#benchmark/read-manifest";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import type { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { directorySource } from "#benchmark/run-records-test-support";
import type { CliTestWorkspace } from "#cli/cli-test-support";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";
import {
	INACCESSIBLE_PERMISSIONS,
	TEXT_FILE_PERMISSIONS,
} from "#server/file-permissions-test-support";

async function stageCorpus(
	workspace: Readonly<CliTestWorkspace>,
): Promise<string> {
	const corpus = await workspace.createDirectory("rehearse-show-corpus-");
	await mkdir(join(corpus, "skills", "build"), { recursive: true });
	await mkdir(join(corpus, "skills", "discuss"), { recursive: true });
	await Bun.write(join(corpus, "CLAUDE.md"), "the instructions\n");
	await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "build\n");
	await Bun.write(join(corpus, "skills", "discuss", "SKILL.md"), "discuss\n");

	return corpus;
}

const BUILD_SKILL_SHA256 = new Bun.CryptoHasher("sha256")
	.update("build\n")
	.digest("hex");

const BUILD_SKILL_READ: ReadManifestEntry = {
	evidence: "declared",
	half: "corpus",
	path: "skills/build/SKILL.md",
	role: "stage skill",
	sha256: BUILD_SKILL_SHA256,
};

async function fixtureWithRepRead(
	workspace: Readonly<CliTestWorkspace>,
): Promise<RecordedRunsFixture> {
	const fixture = await workspace.writtenRecords();
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [BUILD_SKILL_READ],
		repId: `${fixture.groupId}-rep-1`,
		stage: "build",
	});

	return fixture;
}
interface ReadOnlyRecordsFixture {
	readonly fixture: RecordedRunsFixture;
	readonly repId: string;
}
async function writtenReadOnlyFixture(
	workspace: Readonly<CliTestWorkspace>,
	corpus: string,
): Promise<ReadOnlyRecordsFixture> {
	const fixture = await workspace.writtenRecords();
	await fixture.confirmations.corpus.recordGroupFrom(directorySource(corpus));
	const repId = `${fixture.groupId}-rep-1`;
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [
			{
				evidence: "declared",
				half: "corpus",
				path: "skills/build/SKILL.md",
				role: "stage skill",
				sha256: "b".repeat(SHA256_HEX_DIGITS),
			},
		],
		repId,
		stage: "build",
	});
	return { fixture, repId };
}

interface InaccessibleRepStage {
	readonly fixture: RecordedRunsFixture;
	readonly repId: string;
	readonly stageFile: string;
	readonly makeReadable: () => Promise<void>;
}
async function inaccessibleRepStage(
	workspace: Readonly<CliTestWorkspace>,
): Promise<InaccessibleRepStage> {
	const fixture = await workspace.recordFixtureUnderControl(
		"rehearse-show-test-",
	);
	await fixture.write();
	const repId = `${fixture.groupId}-rep-1`;
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [BUILD_SKILL_READ],
		repId,
		stage: "build",
	});
	const stageFile = confirmationGroupPaths(
		fixture.runsDirectory,
		fixture.groupId,
	)
		.rep(repId)
		.stageFile("build");
	await chmod(stageFile, INACCESSIBLE_PERMISSIONS);
	return {
		fixture,
		makeReadable: async () => {
			await chmod(stageFile, TEXT_FILE_PERMISSIONS);
		},
		repId,
		stageFile,
	};
}

export {
	BUILD_SKILL_READ,
	BUILD_SKILL_SHA256,
	fixtureWithRepRead,
	inaccessibleRepStage,
	stageCorpus,
	writtenReadOnlyFixture,
};
