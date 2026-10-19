import { describe, expect, it } from "bun:test";
import { chmod, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import {
	CorpusConfigurationError,
	hashCorpusFiles,
	readCorpusInstructions,
} from "#benchmark/corpus-file";
import { SymlinkedEntryError } from "#benchmark/file-presence";
import { failureOf } from "#cli/cli-test-support";

import {
	NO_ACCESS_MODE,
	OWNER_DIRECTORY_MODE,
	outsideFile,
	privateBackingCorpus,
	resources,
} from "./corpus-file-test-fixtures";

resources.registerCleanup();

async function refusesAnEscapingFileWhenTheConfiguredBackingTreeIsAbsent(): Promise<void> {
	const root = await resources.createControlDirectory();
	const backingRoot = join(root, "absent-backing");
	const secret = await outsideFile("SECRET BYTES\n");
	await symlink(secret, join(root, "CLAUDE.md"));

	const failure = await failureOf(
		readCorpusInstructions({ backingRoot, kind: "live", root }),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
}

async function rejectsAFileConfiguredAsTheBackingTreeBeforeReadingOutsideBytes(): Promise<void> {
	const root = await resources.createControlDirectory();
	const backingRoot = await outsideFile("not a tree\n");
	const secret = await outsideFile("SECRET BYTES\n");
	await symlink(secret, join(root, "CLAUDE.md"));

	const failure = await failureOf(
		readCorpusInstructions({ backingRoot, kind: "live", root }),
	);

	expect(failure).toBeInstanceOf(CorpusConfigurationError);
}

async function surfacesABackingTreeResolutionErrorBeforeReadingOutsideBytes(): Promise<void> {
	const root = await resources.createControlDirectory();
	const parent = await resources.createControlDirectory();
	const backingRoot = join(parent, "loop");
	const secret = await outsideFile("SECRET BYTES\n");
	await symlink(backingRoot, backingRoot);
	await symlink(secret, join(root, "CLAUDE.md"));

	const failure = await failureOf(
		readCorpusInstructions({ backingRoot, kind: "live", root }),
	);

	expect(failure).not.toBeInstanceOf(SymlinkedEntryError);
	expect("code" in failure ? failure.code : undefined).toBe("ELOOP");
}

async function surfacesAPermissionErrorWhenAuthorizationNeedsTheBackingTree(): Promise<void> {
	const { root, backingParent, backingRoot } = await privateBackingCorpus();
	const secret = await outsideFile("SECRET BYTES\n");
	await symlink(secret, join(root, "CLAUDE.md"));
	await chmod(join(backingParent, "private"), NO_ACCESS_MODE);

	try {
		const failure = await failureOf(
			readCorpusInstructions({ backingRoot, kind: "live", root }),
		);

		expect(failure).not.toBeInstanceOf(SymlinkedEntryError);
		expect("code" in failure ? failure.code : undefined).toBe("EACCES");
	} finally {
		await chmod(join(backingParent, "private"), OWNER_DIRECTORY_MODE);
	}
}

async function readsAnInstallFileWithoutConsultingAnUnreadableBackingTree(): Promise<void> {
	const root = await resources.createControlDirectory();
	const backingParent = await resources.createControlDirectory();
	const backingRoot = join(backingParent, "private", "backing");
	await mkdir(backingRoot, { recursive: true });
	await Bun.write(join(root, "CLAUDE.md"), "install bytes\n");
	await chmod(join(backingParent, "private"), NO_ACCESS_MODE);

	try {
		expect(
			await readCorpusInstructions({ backingRoot, kind: "live", root }),
		).toBe("install bytes\n");
	} finally {
		await chmod(join(backingParent, "private"), OWNER_DIRECTORY_MODE);
	}
}

async function refusesAFileReachedThroughAnIntermediateDirectoryOutsideTheLiveExtent(): Promise<void> {
	const root = await resources.createControlDirectory();
	const backingRoot = await resources.createControlDirectory();
	const outside = await resources.createControlDirectory();
	await Bun.write(join(outside, "build/SKILL.md"), "OUTSIDE SKILL\n");
	await Bun.write(join(root, "skills/inside/SKILL.md"), "inside skill\n");
	await symlink(join(outside, "build"), join(root, "skills/build"));

	const failure = await failureOf(
		hashCorpusFiles({ backingRoot, kind: "live", root }, [
			"skills/build/SKILL.md",
		]),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(failure.message).toContain("skills/build/SKILL.md");
}

async function refusesALiveLinkIntoAPrefixSiblingOfTheBackingTree(): Promise<void> {
	const parent = await resources.createControlDirectory();
	const root = join(parent, "install");
	const backingRoot = join(parent, "agents");
	const sibling = join(parent, "agents-other");
	await mkdir(root, { recursive: true });
	await Bun.write(join(backingRoot, "allowed.md"), "allowed\n");
	await Bun.write(join(sibling, "secret.md"), "SECRET BYTES\n");
	await symlink(join(sibling, "secret.md"), join(root, "CLAUDE.md"));

	const failure = await failureOf(
		readCorpusInstructions({ backingRoot, kind: "live", root }),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
}

describe("refusing a corpus file whose bytes are outside its root", () => {
	it(
		"refuses an escaping file when the configured backing tree is absent",
		refusesAnEscapingFileWhenTheConfiguredBackingTreeIsAbsent,
	);
	it(
		"rejects a file configured as the backing tree before reading outside bytes",
		rejectsAFileConfiguredAsTheBackingTreeBeforeReadingOutsideBytes,
	);
	it(
		"surfaces a backing-tree resolution error before reading outside bytes",
		surfacesABackingTreeResolutionErrorBeforeReadingOutsideBytes,
	);
	it(
		"surfaces a permission error when authorization needs the backing tree",
		surfacesAPermissionErrorWhenAuthorizationNeedsTheBackingTree,
	);
	it(
		"reads an install file without consulting an unreadable backing tree",
		readsAnInstallFileWithoutConsultingAnUnreadableBackingTree,
	);
	it(
		"refuses a file reached through an intermediate directory outside the live extent",
		refusesAFileReachedThroughAnIntermediateDirectoryOutsideTheLiveExtent,
	);
	it(
		"refuses a live link into a prefix sibling of the backing tree",
		refusesALiveLinkIntoAPrefixSiblingOfTheBackingTree,
	);
});
