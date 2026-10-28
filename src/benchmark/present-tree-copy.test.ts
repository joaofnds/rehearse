import { describe, expect, it } from "bun:test";
import { chmod, mkdir, readdir, rm, stat, symlink } from "node:fs/promises";
import { join } from "node:path";

import copyPresentTree from "#benchmark/present-tree-copy";
import { TestResources } from "#benchmark/test-support";

const EXECUTABLE_FILE_MODE = 0o755;
const OWNER_ONLY_DIRECTORY_MODE = 0o700;
const UNREADABLE_FILE_MODE = 0o000;
/** The permission bits are the mode's lowest nine, so this keeps only them. */
const PERMISSION_BITS_RANGE = 0o1000;

const resources = TestResources.forEachTest();

async function keepEverything(): Promise<boolean> {
	return await Promise.resolve(true);
}

async function copyDestination(): Promise<string> {
	return join(
		await resources.createTemporaryDirectory("rehearse-tree-record-"),
		"copy",
	);
}

async function permissions(path: string): Promise<number> {
	const entry = await stat(path);

	return entry.mode % PERMISSION_BITS_RANGE;
}

async function copiesNestedFilesWithTheirContents(): Promise<void> {
	const source = await resources.createTemporaryDirectory(
		"rehearse-tree-source-",
	);
	await Bun.write(join(source, "top.txt"), "top\n");
	await Bun.write(join(source, "nested", "deep", "leaf.txt"), "leaf\n");
	const destination = await copyDestination();

	await copyPresentTree(source, destination, keepEverything);

	expect(await Bun.file(join(destination, "top.txt")).text()).toBe("top\n");
	expect(
		await Bun.file(join(destination, "nested", "deep", "leaf.txt")).text(),
	).toBe("leaf\n");
}

async function keepsAnExecutableFilesMode(): Promise<void> {
	const source = await resources.createTemporaryDirectory(
		"rehearse-tree-source-",
	);
	await Bun.write(join(source, "run.sh"), "#!/bin/sh\n");
	await chmod(join(source, "run.sh"), EXECUTABLE_FILE_MODE);
	const destination = await copyDestination();

	await copyPresentTree(source, destination, keepEverything);

	expect(await permissions(join(destination, "run.sh"))).toBe(
		EXECUTABLE_FILE_MODE,
	);
}

async function keepsAnOwnerOnlyDirectorysMode(): Promise<void> {
	const source = await resources.createTemporaryDirectory(
		"rehearse-tree-source-",
	);
	await Bun.write(join(source, "private", "note.txt"), "mine\n");
	await chmod(join(source, "private"), OWNER_ONLY_DIRECTORY_MODE);
	const destination = await copyDestination();

	await copyPresentTree(source, destination, keepEverything);

	expect(await permissions(join(destination, "private"))).toBe(
		OWNER_ONLY_DIRECTORY_MODE,
	);
}

async function keepsAnEmptyDirectory(): Promise<void> {
	const source = await resources.createTemporaryDirectory(
		"rehearse-tree-source-",
	);
	await mkdir(join(source, "out"));
	const destination = await copyDestination();

	await copyPresentTree(source, destination, keepEverything);

	expect(await readdir(join(destination, "out"))).toEqual([]);
}

async function leavesOutWhatTheFilterRefuses(): Promise<void> {
	const source = await resources.createTemporaryDirectory(
		"rehearse-tree-source-",
	);
	await Bun.write(join(source, "kept.txt"), "kept\n");
	await Bun.write(join(source, "refused", "inner.txt"), "refused\n");
	const destination = await copyDestination();

	await copyPresentTree(
		source,
		destination,
		async (path) => await Promise.resolve(path !== join(source, "refused")),
	);

	expect(await readdir(destination)).toEqual(["kept.txt"]);
}

async function leavesOutASymlink(): Promise<void> {
	const source = await resources.createTemporaryDirectory(
		"rehearse-tree-source-",
	);
	await Bun.write(join(source, "kept.txt"), "kept\n");
	await symlink(join(source, "kept.txt"), join(source, "link.txt"));
	const destination = await copyDestination();

	await copyPresentTree(source, destination, keepEverything);

	expect(await readdir(destination)).toEqual(["kept.txt"]);
}

async function copiesTheRestWhenAnEntryVanishesMidCopy(): Promise<void> {
	const source = await resources.createTemporaryDirectory(
		"rehearse-tree-source-",
	);
	await Bun.write(join(source, "present.txt"), "present\n");
	await Bun.write(join(source, "vanishing.lock"), "held briefly\n");
	const destination = await copyDestination();

	await copyPresentTree(source, destination, async (path) => {
		if (path === join(source, "vanishing.lock")) {
			await rm(path);
		}

		return true;
	});

	expect(await readdir(destination)).toEqual(["present.txt"]);
}

async function refusesAMissingSourceTree(): Promise<void> {
	const parent = await resources.createTemporaryDirectory(
		"rehearse-tree-source-",
	);
	const destination = await copyDestination();

	const copy = copyPresentTree(
		join(parent, "missing"),
		destination,
		keepEverything,
	);

	expect(copy).rejects.toMatchObject({ code: "ENOENT" });
}

async function refusesAnEntryItCannotRead(): Promise<void> {
	const source = await resources.createTemporaryDirectory(
		"rehearse-tree-source-",
	);
	await Bun.write(join(source, "locked.txt"), "locked\n");
	await chmod(join(source, "locked.txt"), UNREADABLE_FILE_MODE);
	const destination = await copyDestination();

	const copy = copyPresentTree(source, destination, keepEverything);

	expect(copy).rejects.toMatchObject({ code: "EACCES" });
}

describe(copyPresentTree.name, () => {
	it(
		"copies nested files with their contents",
		copiesNestedFilesWithTheirContents,
	);
	it("keeps an executable file's mode", keepsAnExecutableFilesMode);
	it("keeps an owner-only directory's mode", keepsAnOwnerOnlyDirectorysMode);
	it("keeps an empty directory", keepsAnEmptyDirectory);
	it("leaves out what the filter refuses", leavesOutWhatTheFilterRefuses);
	it("leaves out a symlink", leavesOutASymlink);

	describe("when an entry vanishes mid-copy", () => {
		it("copies the rest", copiesTheRestWhenAnEntryVanishesMidCopy);
	});

	describe("when the source tree is missing", () => {
		it("refuses the copy", refusesAMissingSourceTree);
	});

	describe("when an entry cannot be read", () => {
		it("refuses the copy", refusesAnEntryItCannotRead);
	});
});
