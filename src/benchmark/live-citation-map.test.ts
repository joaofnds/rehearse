import { describe, expect, it } from "bun:test";
import { mkdir, realpath, symlink } from "node:fs/promises";
import { join } from "node:path";

import liveCitationMap from "#benchmark/live-citation-map";
import { liveCorpusSource } from "#benchmark/live-corpus-source";

import { resources } from "./session-corpus-test-fixtures";

resources.registerCleanup();

interface LinkedInstall {
	readonly home: string;
	readonly live: string;
	readonly backing: string;
	readonly elsewhere: string;
}

/**
 * The shape of an install whose layout entries link into a second tree: the
 * instruction file and rulebook link into the backing root, and one skill
 * inside a real skills directory links somewhere else again.
 */
async function linkedInstall(): Promise<LinkedInstall> {
	const home = await realpath(await resources.createControlDirectory());
	const live = join(home, ".claude");
	const backing = join(home, ".agents");
	const elsewhere = join(home, "code", "skills");
	await Bun.write(join(backing, "AGENTS.md"), "instructions\n");
	await Bun.write(join(backing, "rulebook", "ownership.md"), "rules\n");
	await Bun.write(join(elsewhere, "y", "SKILL.md"), "skill y\n");
	await linkInto({ backing, elsewhere, live });

	return { backing, elsewhere, home, live };
}

async function linkInto({
	backing,
	elsewhere,
	live,
}: Omit<LinkedInstall, "home">): Promise<void> {
	await mkdir(join(live, "skills", "x"), { recursive: true });
	await symlink(join(backing, "AGENTS.md"), join(live, "CLAUDE.md"));
	await symlink(join(backing, "rulebook"), join(live, "rulebook"));
	await symlink(join(elsewhere, "y"), join(live, "skills", "y"));
}

async function mapsEachLayoutEntryAndEveryLinkTargetUnderIt(): Promise<void> {
	const { backing, elsewhere, home, live } = await linkedInstall();

	const map = await liveCitationMap(
		liveCorpusSource({ backingRoot: backing, root: live }),
		home,
	);

	expect(map.home).toBe(home);
	expect(
		map.roots.toSorted((left, right) => left.path.localeCompare(right.path)),
	).toEqual([
		{ layoutPath: "CLAUDE.md", path: join(backing, "AGENTS.md") },
		{ layoutPath: "rulebook", path: join(backing, "rulebook") },
		{ layoutPath: "CLAUDE.md", path: join(live, "CLAUDE.md") },
		{ layoutPath: "rulebook", path: join(live, "rulebook") },
		{ layoutPath: "skills", path: join(live, "skills") },
		{ layoutPath: "skills/y", path: join(live, "skills", "y") },
		{ layoutPath: "skills/y", path: join(elsewhere, "y") },
	]);
}

async function mapsNothingForAnInstallWithNoLayout(): Promise<void> {
	const home = await resources.createControlDirectory();

	const map = await liveCitationMap(
		liveCorpusSource({
			backingRoot: join(home, ".agents"),
			root: join(home, ".claude"),
		}),
		home,
	);

	expect(map.roots).toEqual([]);
}

describe(liveCitationMap.name, () => {
	it(
		"maps each layout entry and every link target under it",
		mapsEachLayoutEntryAndEveryLinkTargetUnderIt,
	);

	it(
		"maps nothing for an install with no layout",
		mapsNothingForAnInstallWithNoLayout,
	);
});
