import { describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";

import { hashCorpusFiles } from "#benchmark/corpus-file";
import { resolveCorpusSource } from "#benchmark/corpus-source";
import {
	installSessionCorpusSnapshot,
	snapshotSessionCorpus,
} from "#benchmark/session-corpus";

import {
	directoryCorpus,
	noCitations,
	resources,
	sha256Of,
} from "./session-corpus-test-fixtures";

resources.registerCleanup();

async function copiesTheSourceSCorpusKindsIntoTheSnapshotDirectory(): Promise<void> {
	const root = await directoryCorpus({
		"CLAUDE.md": "variant instructions\n",
		"agents/reviewer.md": "variant reviewer\n",
		"output-styles/brief.md": "variant brief\n",
	});
	const destination = await resources.createControlDirectory();

	const snapshot = await snapshotSessionCorpus(
		await resolveCorpusSource(root),
		join(destination, "corpus"),
		["output-styles/brief.md", "agents/reviewer.md", "CLAUDE.md"],
	);

	expect(
		await Bun.file(join(snapshot.root, "output-styles/brief.md")).text(),
	).toBe("variant brief\n");
	expect(await Bun.file(join(snapshot.root, "agents/reviewer.md")).text()).toBe(
		"variant reviewer\n",
	);
	expect(await Bun.file(join(snapshot.root, "CLAUDE.md")).text()).toBe(
		"variant instructions\n",
	);
}

async function isTheSinglePlaceBytesAreReadFromMutatingTheSourceAfterTheSnapshotLeavesTheDigestsUnchanged(): Promise<void> {
	const root = await directoryCorpus({
		"output-styles/brief.md": "variant brief\n",
	});
	const destination = await resources.createControlDirectory();

	const snapshot = await snapshotSessionCorpus(
		await resolveCorpusSource(root),
		join(destination, "corpus"),
		["output-styles/brief.md"],
	);

	const before = await hashCorpusFiles(snapshot, ["output-styles/brief.md"]);
	await Bun.write(join(root, "output-styles/brief.md"), "edited after\n");
	const after = await hashCorpusFiles(snapshot, ["output-styles/brief.md"]);

	const [observedFirstAfter] = after;
	const [observedFirstBefore] = before;

	expect(observedFirstAfter?.sha256).toBe(observedFirstBefore?.sha256 ?? "");
	expect(observedFirstAfter?.sha256).toBe(sha256Of("variant brief\n"));
}

/**
 * A live install reaches its corpus through a link into a backing tree, which
 * is the ordinary shape of a chezmoi-managed install rather than an attack.
 * Copying such an entry is permitted; the bytes that land are the ones the
 * link resolved to at capture time.
 */
async function copiesALiveSourceSDeclaredFileThroughALinkIntoItsBackingTree(): Promise<void> {
	const backingRoot = await directoryCorpus({
		"output-styles/brief.md": "backing style\n",
	});
	const root = await resources.createControlDirectory();
	await symlink(
		join(backingRoot, "output-styles"),
		join(root, "output-styles"),
	);
	const destination = join(await resources.createControlDirectory(), "corpus");

	const snapshot = await snapshotSessionCorpus(
		{ backingRoot, kind: "live", root },
		destination,
		["output-styles/brief.md"],
	);

	const [hashed] = await hashCorpusFiles(snapshot, ["output-styles/brief.md"]);

	expect(snapshot).toMatchObject({
		kind: "directory",
		origin: { kind: "live" },
		root: destination,
	});
	expect(hashed?.sha256).toBe(sha256Of("backing style\n"));
}

/**
 * A live source declaring nothing has nothing to deliver, so it keeps the
 * pointer: copying would change the resolved paths every record captured
 * before `--corpus` carries, for bytes no attempt installs.
 */
async function keepsALiveSourceSPointerWhenTheCaseDeclaresNoCorpusFile(): Promise<void> {
	const root = await directoryCorpus({
		"output-styles/brief.md": "installed style\n",
	});
	const backingRoot = await resources.createControlDirectory();

	const snapshot = await snapshotSessionCorpus(
		{ backingRoot, kind: "live", root },
		join(await resources.createControlDirectory(), "unused"),
		[],
	);

	expect(snapshot).toMatchObject({ backingRoot, kind: "live", root });
}

async function copiesADeclaredSkillDirectoryAndOverlaysItUnderTheAttempt(): Promise<void> {
	const root = await directoryCorpus({
		"skills/style/SKILL.md": "FROZEN_STYLE_SKILL\n",
	});
	const destination = await resources.createControlDirectory();

	const snapshot = await snapshotSessionCorpus(
		await resolveCorpusSource(root),
		join(destination, "corpus"),
		["skills/style/SKILL.md"],
	);
	const attemptDirectory = await resources.createControlDirectory();
	await installSessionCorpusSnapshot(snapshot, attemptDirectory, noCitations);

	expect(
		await Bun.file(
			join(attemptDirectory, ".claude/skills/style/SKILL.md"),
		).text(),
	).toBe("FROZEN_STYLE_SKILL\n");
}

/**
 * A corpus source carries every skill in the corpus, and refusing on their
 * presence would make a source unusable for the styles and agents the harness
 * can deliver. What must not happen is reporting a skill result, and a skill
 * the case does not declare is never reported.
 */
async function carriesASkillTheCaseDoesNotDeclareWithoutRefusingAndInstallsNoneOfIt(): Promise<void> {
	const root = await directoryCorpus({
		"output-styles/brief.md": "variant brief\n",
		"skills/style/SKILL.md": "a skill nothing declares\n",
	});
	const destination = await resources.createControlDirectory();

	const snapshot = await snapshotSessionCorpus(
		await resolveCorpusSource(root),
		join(destination, "corpus"),
		["output-styles/brief.md"],
	);
	const attemptDirectory = await resources.createControlDirectory();
	await installSessionCorpusSnapshot(snapshot, attemptDirectory, noCitations);

	expect(
		await Bun.file(join(attemptDirectory, ".claude/skills")).exists(),
	).toBe(false);
}

describe(snapshotSessionCorpus.name, () => {
	it(
		"copies the source's corpus kinds into the snapshot directory",
		copiesTheSourceSCorpusKindsIntoTheSnapshotDirectory,
	);

	it(
		"is the single place bytes are read from: mutating the source after the snapshot leaves the digests unchanged",
		isTheSinglePlaceBytesAreReadFromMutatingTheSourceAfterTheSnapshotLeavesTheDigestsUnchanged,
	);

	it(
		"copies a live source's declared file through a link into its backing tree",
		copiesALiveSourceSDeclaredFileThroughALinkIntoItsBackingTree,
	);

	it(
		"keeps a live source's pointer when the case declares no corpus file",
		keepsALiveSourceSPointerWhenTheCaseDeclaresNoCorpusFile,
	);

	it(
		"copies a declared skill directory and overlays it under the attempt",
		copiesADeclaredSkillDirectoryAndOverlaysItUnderTheAttempt,
	);

	it(
		"carries a skill the case does not declare without refusing, and installs none of it",
		carriesASkillTheCaseDoesNotDeclareWithoutRefusingAndInstallsNoneOfIt,
	);
});
