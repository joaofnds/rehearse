import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import {
	hashCorpusFiles,
	readCorpusInstructions,
} from "#benchmark/corpus-file";
import { SymlinkedEntryError } from "#benchmark/file-presence";
import { failureOf } from "#cli/cli-test-support";

import { outsideFile, resources } from "./corpus-file-test-fixtures";

resources.registerCleanup();

async function refusesACLAUDEMdThatIsASymlinkToAFileOutsideTheRoot(): Promise<void> {
	const root = await resources.createControlDirectory();
	const secret = await outsideFile("SECRET BYTES\n");
	await symlink(secret, join(root, "CLAUDE.md"));

	const failure = await failureOf(
		hashCorpusFiles({ kind: "directory", root }, ["CLAUDE.md"]),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
}

async function refusesADeclaredLayoutFileThatIsASymlinkOutsideTheRoot(): Promise<void> {
	const root = await resources.createControlDirectory();
	const secret = await outsideFile("SECRET BYTES\n");
	await mkdir(join(root, "skills/build"), { recursive: true });
	await symlink(secret, join(root, "skills/build/LINKED.md"));

	const failure = await failureOf(
		hashCorpusFiles({ kind: "directory", root }, ["skills/build/LINKED.md"]),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
}

async function refusesAFileReachedThroughALayoutDirectoryThatIsItselfASymlinkOutsideTheRoot(): Promise<void> {
	const root = await resources.createControlDirectory();
	const outside = await resources.createControlDirectory();
	await mkdir(join(outside, "build"), { recursive: true });
	await Bun.write(join(outside, "build/SKILL.md"), "OUTSIDE SKILL\n");
	await mkdir(join(root, "skills"), { recursive: true });
	await symlink(join(outside, "build"), join(root, "skills/build"));

	const failure = await failureOf(
		hashCorpusFiles({ kind: "directory", root }, ["skills/build/SKILL.md"]),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
}

async function refusesARelativeSymlinkOutOfTheRootTheSameWayAnAbsoluteOneIsRefused(): Promise<void> {
	const root = await resources.createControlDirectory();
	const secret = await outsideFile("SECRET BYTES\n");
	await symlink(relative(root, secret), join(root, "CLAUDE.md"));

	const failure = await failureOf(
		hashCorpusFiles({ kind: "directory", root }, ["CLAUDE.md"]),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
}

async function namesTheOffendingFileByItsLayoutPathCarryingNeitherTheTargetSPathNorItsBytes(): Promise<void> {
	const root = await resources.createControlDirectory();
	const secret = await outsideFile("SECRET BYTES\n");
	await symlink(secret, join(root, "CLAUDE.md"));

	const failure = await failureOf(
		hashCorpusFiles({ kind: "directory", root }, ["CLAUDE.md"]),
	);

	expect(failure.message).toContain("CLAUDE.md");
	expect(failure.message).not.toContain(secret);
	expect(failure.message).not.toContain("SECRET BYTES");
}

async function refusesReadingInstructionsThroughASymlinkedCLAUDEMd(): Promise<void> {
	const root = await resources.createControlDirectory();
	const secret = await outsideFile("SECRET BYTES\n");
	await symlink(secret, join(root, "CLAUDE.md"));

	const failure = await failureOf(
		readCorpusInstructions({ kind: "directory", root }),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
}

async function followsASymlinkThatResolvesBackInsideTheRoot(): Promise<void> {
	const root = await resources.createControlDirectory();
	await Bun.write(join(root, "real.md"), "inside bytes\n");
	await symlink(join(root, "real.md"), join(root, "CLAUDE.md"));

	expect(await readCorpusInstructions({ kind: "directory", root })).toBe(
		"inside bytes\n",
	);
}

async function refusesALinkIntoASiblingDirectoryWhoseNameExtendsTheRootS(): Promise<void> {
	const parent = await resources.createControlDirectory();
	const root = join(parent, "corpus");
	await Bun.write(join(root, "real.md"), "inside bytes\n");
	await Bun.write(join(parent, "corpus-evil/secret.md"), "SECRET BYTES\n");
	await symlink(join(parent, "corpus-evil/secret.md"), join(root, "CLAUDE.md"));

	const failure = await failureOf(
		hashCorpusFiles({ kind: "directory", root }, ["CLAUDE.md"]),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
}

async function readsARootReachedThroughASymlinkedParentDirectoryWhichResolvesTheRootDifferentlyFromTheWayItWasNamed(): Promise<void> {
	const parent = await mkdtemp(join(tmpdir(), "rehearse-corpus-parent-"));
	resources.track(parent);
	const root = join(parent, "corpus");
	await Bun.write(join(root, "CLAUDE.md"), "instructions\n");
	const linkedParent = join(await resources.createControlDirectory(), "link");
	await symlink(parent, linkedParent);

	expect(
		await readCorpusInstructions({
			kind: "directory",
			root: join(linkedParent, "corpus"),
		}),
	).toBe("instructions\n");
}

describe("refusing a corpus file whose bytes are outside its root", () => {
	it(
		"refuses a CLAUDE.md that is a symlink to a file outside the root",
		refusesACLAUDEMdThatIsASymlinkToAFileOutsideTheRoot,
	);

	it(
		"refuses a declared layout file that is a symlink outside the root",
		refusesADeclaredLayoutFileThatIsASymlinkOutsideTheRoot,
	);

	it(
		"refuses a file reached through a layout directory that is itself a symlink outside the root",
		refusesAFileReachedThroughALayoutDirectoryThatIsItselfASymlinkOutsideTheRoot,
	);

	it(
		"refuses a relative symlink out of the root the same way an absolute one is refused",
		refusesARelativeSymlinkOutOfTheRootTheSameWayAnAbsoluteOneIsRefused,
	);

	it(
		"names the offending file by its layout path, carrying neither the target's path nor its bytes",
		namesTheOffendingFileByItsLayoutPathCarryingNeitherTheTargetSPathNorItsBytes,
	);

	it(
		"refuses reading instructions through a symlinked CLAUDE.md",
		refusesReadingInstructionsThroughASymlinkedCLAUDEMd,
	);

	it(
		"follows a symlink that resolves back inside the root",
		followsASymlinkThatResolvesBackInsideTheRoot,
	);

	it(
		"refuses a link into a sibling directory whose name extends the root's",
		refusesALinkIntoASiblingDirectoryWhoseNameExtendsTheRootS,
	);

	it(
		"reads a root reached through a symlinked parent directory, which resolves the root differently from the way it was named",
		readsARootReachedThroughASymlinkedParentDirectoryWhichResolvesTheRootDifferentlyFromTheWayItWasNamed,
	);
});
