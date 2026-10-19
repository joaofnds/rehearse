import { describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { CONTROL_DIR } from "#benchmark/config";
import {
	CorpusFileError,
	hashCorpusFiles,
	liveCorpusInstructions,
	liveCorpusRoot,
	liveCorpusSource,
	readCorpusInstructions,
	resolveCorpusFile,
} from "#benchmark/corpus-file";
import { resolveCorpusSource } from "#benchmark/corpus-source";
import { failureOf } from "#cli/cli-test-support";

import { live, resources } from "./corpus-file-test-fixtures";

resources.registerCleanup();

async function hashesEachDeclaredFileSBytesUnderItsLayoutPath(): Promise<void> {
	const root = await resources.createControlDirectory();
	await Bun.write(join(root, "CLAUDE.md"), "corpus instructions\n");

	const [only] = await hashCorpusFiles(await resolveCorpusSource(root), [
		"CLAUDE.md",
	]);

	expect(only?.path).toBe("CLAUDE.md");
	expect(only?.resolvedPath).toBe(join(root, "CLAUDE.md"));
	expect(only?.sha256).toBe(
		new Bun.CryptoHasher("sha256")
			.update("corpus instructions\n")
			.digest("hex"),
	);
}

async function refusesADeclaredFileThatDoesNotExistNamingTheResolvedPath(): Promise<void> {
	const failure = await failureOf(
		hashCorpusFiles(live, ["output-styles/no-such-style.md"]),
	);

	expect(failure).toBeInstanceOf(CorpusFileError);
	expect(failure.message).toContain(
		join(homedir(), ".claude/output-styles/no-such-style.md"),
	);
}

async function returnsTheDirectorySDigestsWhichDifferFromTheLiveInstallSForTheSameLayoutPath(): Promise<void> {
	const root = await resources.createControlDirectory();
	await Bun.write(
		join(root, "output-styles/brief.md"),
		"a brief the live install does not hold\n",
	);
	const source = await resolveCorpusSource(root);

	const [variant] = await hashCorpusFiles(source, ["output-styles/brief.md"]);
	const [installed] = await hashCorpusFiles(live, ["output-styles/brief.md"]);

	expect(variant?.resolvedPath).toBe(join(root, "output-styles/brief.md"));
	expect(variant?.sha256).toBe(
		new Bun.CryptoHasher("sha256")
			.update("a brief the live install does not hold\n")
			.digest("hex"),
	);
	expect(variant?.sha256).not.toBe(installed?.sha256 ?? "");
}

async function hashesADeclaredRulebookFileTheSameWayAnAgentsOrOutputStylesFileIsHashed(): Promise<void> {
	const root = await resources.createControlDirectory();
	await Bun.write(
		join(root, "rulebook/coding-style.md"),
		"a rulebook variant\n",
	);
	const source = await resolveCorpusSource(root);

	const [variant] = await hashCorpusFiles(source, ["rulebook/coding-style.md"]);

	expect(variant?.resolvedPath).toBe(join(root, "rulebook/coding-style.md"));
	expect(variant?.sha256).toBe(
		new Bun.CryptoHasher("sha256").update("a rulebook variant\n").digest("hex"),
	);
}

async function readsTheCorpusRootSCLAUDEMd(): Promise<void> {
	const root = await resources.createControlDirectory();
	await Bun.write(join(root, "CLAUDE.md"), "corpus instructions\n");

	expect(await readCorpusInstructions(await resolveCorpusSource(root))).toBe(
		"corpus instructions\n",
	);
}

async function refusesACorpusHoldingNoCLAUDEMdNamingTheResolvedPath(): Promise<void> {
	const root = await resources.createControlDirectory();
	await Bun.write(join(root, "output-styles/brief.md"), "a brief\n");

	const failure = await failureOf(
		readCorpusInstructions(await resolveCorpusSource(root)),
	);

	expect(failure).toBeInstanceOf(CorpusFileError);
	expect(failure.message).toContain(join(root, "CLAUDE.md"));
}

function resolvesUnderTheInstallRootNeverTheControlRepository(): void {
	expect(resolveCorpusFile(liveCorpusSource(), "CLAUDE.md")).toBe(
		join(liveCorpusRoot(), "CLAUDE.md"),
	);
	expect(resolveCorpusFile(liveCorpusSource(), "CLAUDE.md")).not.toBe(
		join(CONTROL_DIR, "CLAUDE.md"),
	);
}

describe(hashCorpusFiles.name, () => {
	it(
		"hashes each declared file's bytes under its layout path",
		hashesEachDeclaredFileSBytesUnderItsLayoutPath,
	);

	it(
		"refuses a declared file that does not exist, naming the resolved path",
		refusesADeclaredFileThatDoesNotExistNamingTheResolvedPath,
	);
});

describe("hashing a directory source's own bytes", () => {
	it(
		"returns the directory's digests, which differ from the live install's for the same layout path",
		returnsTheDirectorySDigestsWhichDifferFromTheLiveInstallSForTheSameLayoutPath,
	);

	it(
		"hashes a declared rulebook file the same way an agents or output-styles file is hashed",
		hashesADeclaredRulebookFileTheSameWayAnAgentsOrOutputStylesFileIsHashed,
	);
});

describe(readCorpusInstructions.name, () => {
	it("reads the corpus root's CLAUDE.md", readsTheCorpusRootSCLAUDEMd);

	it(
		"refuses a corpus holding no CLAUDE.md, naming the resolved path",
		refusesACorpusHoldingNoCLAUDEMdNamingTheResolvedPath,
	);
});

describe(liveCorpusInstructions.name, () => {
	it(
		"resolves under the install root, never the control repository",
		resolvesUnderTheInstallRootNeverTheControlRepository,
	);
});

async function followsASymlinkedCLAUDEMdWhenTheSourceIsTheLiveInstall(): Promise<void> {
	const root = await resources.createControlDirectory();
	const outside = await resources.createControlDirectory();
	await Bun.write(join(outside, "agents.md"), "the live corpus instructions\n");
	await symlink(join(outside, "agents.md"), join(root, "CLAUDE.md"));

	expect(
		await readCorpusInstructions({
			backingRoot: outside,
			kind: "live",
			root,
		}),
	).toBe("the live corpus instructions\n");
}

async function preservesABackingTreeFileSLexicalInstallIdentityWhenHashingIt(): Promise<void> {
	const root = await resources.createControlDirectory();
	const backingRoot = await resources.createControlDirectory();
	await Bun.write(join(backingRoot, "instructions.md"), "backing bytes\n");
	await symlink(join(backingRoot, "instructions.md"), join(root, "CLAUDE.md"));

	const [hashed] = await hashCorpusFiles({ backingRoot, kind: "live", root }, [
		"CLAUDE.md",
	]);

	expect(hashed?.resolvedPath).toBe(join(root, "CLAUDE.md"));
	expect(hashed?.sha256).toBe(
		new Bun.CryptoHasher("sha256").update("backing bytes\n").digest("hex"),
	);
}

async function readsAnInstallFileWithoutConsultingAnAbsentBackingTree(): Promise<void> {
	const root = await resources.createControlDirectory();
	const backingRoot = join(root, "absent-backing");
	await Bun.write(join(root, "CLAUDE.md"), "install bytes\n");

	expect(
		await readCorpusInstructions({ backingRoot, kind: "live", root }),
	).toBe("install bytes\n");
}

describe("refusing a corpus file whose bytes are outside its root", () => {
	it(
		"follows a symlinked CLAUDE.md when the source is the live install",
		followsASymlinkedCLAUDEMdWhenTheSourceIsTheLiveInstall,
	);
	it(
		"preserves a backing-tree file's lexical install identity when hashing it",
		preservesABackingTreeFileSLexicalInstallIdentityWhenHashingIt,
	);
	it(
		"reads an install file without consulting an absent backing tree",
		readsAnInstallFileWithoutConsultingAnAbsentBackingTree,
	);
});
