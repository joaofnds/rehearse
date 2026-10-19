import { describe, expect, it } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import { resolveCorpusSource } from "#benchmark/corpus-source";
import {
	SessionCorpusError,
	freezeSessionCorpus,
} from "#benchmark/session-corpus";
import { failureOf } from "#cli/cli-test-support";

import {
	directoryCorpus,
	nestedForeignCorpus,
	resources,
} from "./session-corpus-test-fixtures";

resources.registerCleanup();

async function copiesADeclaredSkillDirectorySoASessionReadsTheFrozenBytes(): Promise<void> {
	const root = await directoryCorpus({
		"skills/verify/SKILL.md": "FROZEN_SKILL\n",
	});
	const destination = await resources.createControlDirectory();

	const snapshot = await freezeSessionCorpus(
		await resolveCorpusSource(root),
		join(destination, "corpus"),
		["skills/verify/SKILL.md"],
	);

	expect(
		await Bun.file(join(snapshot.root, "skills/verify/SKILL.md")).text(),
	).toBe("FROZEN_SKILL\n");
}

async function snapshotsADeclaredNestedRulebookFileWithoutTheFilesBesideIt(): Promise<void> {
	const root = await directoryCorpus({
		"rulebook/coding-style/core.md": "CORE\n",
		"rulebook/coding-style/go.md": "GO\n",
	});
	const destination = await resources.createControlDirectory();

	const snapshot = await freezeSessionCorpus(
		await resolveCorpusSource(root),
		join(destination, "corpus"),
		["rulebook/coding-style/core.md"],
	);

	expect(
		await Bun.file(join(snapshot.root, "rulebook/coding-style/core.md")).text(),
	).toBe("CORE\n");
	expect(
		await Bun.file(join(snapshot.root, "rulebook/coding-style/go.md")).exists(),
	).toBe(false);
}

async function materializesSymlinkBackedLiveEntriesAsImmutableGroupBytes(): Promise<void> {
	const outside = await directoryCorpus({
		"agents/reviewer.md": "original live agent\n",
	});
	const liveRoot = await resources.createControlDirectory();
	await symlink(join(outside, "agents"), join(liveRoot, "agents"));
	const destination = await resources.createControlDirectory();

	const snapshot = await freezeSessionCorpus(
		{ backingRoot: outside, kind: "live", root: liveRoot },
		join(destination, "corpus"),
		["agents/reviewer.md"],
	);
	await Bun.write(
		join(outside, "agents", "reviewer.md"),
		"mutated live agent\n",
	);

	expect(
		await Bun.file(join(snapshot.root, "agents", "reviewer.md")).text(),
	).toBe("original live agent\n");
	expect(snapshot).toMatchObject({
		kind: "directory",
		origin: { kind: "live" },
	});
}

async function refusesALiveDeclaredFileOutsideTheInstallAndBackingTreeBeforeCopyingIt(): Promise<void> {
	const outside = await directoryCorpus({
		"output-styles/foreign.md": "FOREIGN STYLE\n",
	});
	const liveRoot = await resources.createControlDirectory();
	const backingRoot = await resources.createControlDirectory();
	await mkdir(join(liveRoot, "output-styles"), { recursive: true });
	await symlink(
		join(outside, "output-styles", "foreign.md"),
		join(liveRoot, "output-styles", "foreign.md"),
	);
	const destination = join(await resources.createControlDirectory(), "corpus");

	const failure = await failureOf(
		freezeSessionCorpus(
			{ backingRoot, kind: "live", root: liveRoot },
			destination,
			["output-styles/foreign.md"],
		),
	);

	expect(failure).toBeInstanceOf(SessionCorpusError);
	expect(failure.message).toContain("output-styles/foreign.md");
	expect(
		await Bun.file(join(destination, "output-styles", "foreign.md")).exists(),
	).toBe(false);
}

async function refusesAForeignLinkNestedUnderAnAllowedLiveDirectoryBeforeCopyingIt(): Promise<void> {
	const { source, destination } = await nestedForeignCorpus();

	const failure = await failureOf(
		freezeSessionCorpus(source, destination, [
			"output-styles/declared/nested/leak.md",
		]),
	);

	expect(failure).toBeInstanceOf(SessionCorpusError);
	expect(failure.message).toContain("output-styles/declared/nested/leak.md");
	expect(
		await Bun.file(
			join(destination, "output-styles", "declared", "nested", "leak.md"),
		).exists(),
	).toBe(false);
}

describe(freezeSessionCorpus.name, () => {
	it(
		"copies a declared skill directory so a session reads the frozen bytes",
		copiesADeclaredSkillDirectorySoASessionReadsTheFrozenBytes,
	);

	it(
		"snapshots a declared nested rulebook file without the files beside it",
		snapshotsADeclaredNestedRulebookFileWithoutTheFilesBesideIt,
	);

	it(
		"materializes symlink-backed live entries as immutable group bytes",
		materializesSymlinkBackedLiveEntriesAsImmutableGroupBytes,
	);

	it(
		"refuses a live declared file outside the install and backing tree before copying it",
		refusesALiveDeclaredFileOutsideTheInstallAndBackingTreeBeforeCopyingIt,
	);

	it(
		"refuses a foreign link nested under an allowed live directory before copying it",
		refusesAForeignLinkNestedUnderAnAllowedLiveDirectoryBeforeCopyingIt,
	);
});
