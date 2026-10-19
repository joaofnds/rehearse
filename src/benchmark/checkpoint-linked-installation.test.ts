import { describe, expect, it } from "bun:test";
import {
	lstat,
	mkdir,
	readdir,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { captureStageCorpus, installStageCorpusSnapshot } from "./checkpoint";
import { writeFixtureFiles } from "./checkpoint-filesystem-test-fixture";
import { installedCorpus } from "./checkpoint-linked-corpus-test-fixture";
import { TestResources } from "./test-support";

const resources = TestResources.forEachTest();

async function fileContents(
	root: string,
): Promise<Readonly<Record<string, string>>> {
	const contents: Record<string, string> = {};
	await Array.fromAsync(
		await readdir(root, {
			recursive: true,
			withFileTypes: true,
		}),
		async (entry) => {
			if (entry.isFile()) {
				const path = join(entry.parentPath, entry.name);
				contents[relative(root, path)] = await Bun.file(path).text();
			}
		},
	);

	return contents;
}

async function linkedTarget(): Promise<{
	readonly snapshot: string;
	readonly linked: string;
	readonly target: string;
}> {
	const source = await installedCorpus(resources);
	await writeFile(join(source.root, "CLAUDE.md"), "stage instructions");
	const linked = join(dirname(source.root), "linked");
	await mkdir(join(linked, "skills", "precious"), { recursive: true });
	await writeFile(join(linked, "skills", "precious", "SKILL.md"), "kept");
	await writeFile(join(linked, "CLAUDE.md"), "live instructions");
	const target = join(dirname(source.root), "target");
	await mkdir(target);
	await symlink(linked, join(target, ".claude"));

	return { linked, snapshot: source.root, target };
}

async function testInstallsADirectoryVariantSAllowedLinksAsIndependentFiles(): Promise<void> {
	const source = await installedCorpus(resources);
	await writeFixtureFiles({
		files: [
			["CLAUDE.md", "instructions"],
			["shared/review.md", "review"],
		],
		root: source.root,
	});
	await symlink(join(source.root, "shared"), join(source.root, "agents"));
	const directory = { kind: "directory", root: source.root } as const;

	const captured = await captureStageCorpus("build", "instructions", [
		directory,
	]);
	const target = join(dirname(source.root), "target");

	await installStageCorpusSnapshot(source.root, target);
	await rm(source.root, { recursive: true });

	const installed = await captureStageCorpus("build", "instructions", [
		{ kind: "directory", root: join(target, ".claude") },
	]);

	expect(installed).toEqual(captured);
}

async function testLeavesEveryFileInTheLinkedDirectoryUnchanged(): Promise<void> {
	const { snapshot, linked, target } = await linkedTarget();
	const before = await fileContents(linked);

	await installStageCorpusSnapshot(snapshot, target);

	expect(await fileContents(linked)).toEqual(before);
}

async function testInstallsTheStageCorpusInADirectoryOfTheTargetSOwn(): Promise<void> {
	const { snapshot, target } = await linkedTarget();

	await installStageCorpusSnapshot(snapshot, target);

	const installed = await lstat(join(target, ".claude"));
	expect({
		instructions: await Bun.file(join(target, ".claude", "CLAUDE.md")).text(),
		link: installed.isSymbolicLink(),
	}).toEqual({ instructions: "stage instructions", link: false });
}

describe(installStageCorpusSnapshot.name, () => {
	it(
		"installs a directory variant's allowed links as independent files",
		testInstallsADirectoryVariantSAllowedLinksAsIndependentFiles,
	);
	describe("when the target's .claude links to another directory", () => {
		it(
			"leaves every file in the linked directory unchanged",
			testLeavesEveryFileInTheLinkedDirectoryUnchanged,
		);
		it(
			"installs the stage corpus in a directory of the target's own",
			testInstallsTheStageCorpusInADirectoryOfTheTargetSOwn,
		);
	});
});
