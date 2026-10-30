import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { HomePathCitationMap } from "./home-path-citation";
import type { StageCorpusInstaller } from "./live-stage-corpus-installer";
import installStageCorpusSnapshot from "./stage-corpus-install";
import type { TestResources } from "./test-support";

async function temporaryDirectory(
	resources: Readonly<TestResources>,
	prefix: string,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), prefix));

	resources.track(directory);

	return directory;
}

interface FixtureFiles {
	readonly root: string;
	readonly files: readonly (readonly [path: string, contents: string])[];
}

async function writeFixtureFiles({ root, files }: FixtureFiles): Promise<void> {
	await Array.fromAsync(files, async ([path, contents]) => {
		const destination = join(root, path);

		await mkdir(dirname(destination), { recursive: true });

		await Bun.write(destination, contents);
	});
}

/** A citation map that redirects nothing, for installs whose text cites no home path. */
const noCitations: HomePathCitationMap = { home: "/no-home", roots: [] };

/** The stage installer for a run whose live install cites nothing. */
const uncitedStageInstall: StageCorpusInstaller = async (
	snapshotDirectory,
	targetDirectory,
) =>
	await installStageCorpusSnapshot(
		snapshotDirectory,
		targetDirectory,
		noCitations,
	);

/**
 * Appends to a skill installed in the target, as a delivery that rewrote its
 * text would, so a record that hashed the install would show it.
 */
async function rewriteInstalledSkill(
	targetDirectory: string,
	skill: string,
): Promise<void> {
	const file = join(targetDirectory, ".claude/skills", skill, "SKILL.md");
	const text = await Bun.file(file).text();

	await Bun.write(file, `${text}delivered\n`);
}

export {
	noCitations,
	rewriteInstalledSkill,
	temporaryDirectory,
	uncitedStageInstall,
	writeFixtureFiles,
};
