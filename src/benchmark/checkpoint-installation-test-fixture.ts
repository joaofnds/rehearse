import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
	corpusRoots,
	installAgent,
	installSkill,
} from "./checkpoint-corpus-test-fixture";
import { temporaryDirectory } from "./checkpoint-filesystem-test-fixture";
import type { TestResources } from "./test-support";

interface InstallationFixture {
	readonly roots: readonly [string, string];
	readonly firstSnapshot: string;
	readonly secondSnapshot: string;
	readonly worktree: string;
	readonly secondWorktree: string;
}

async function installationFixture(
	resources: Readonly<TestResources>,
): Promise<InstallationFixture> {
	const roots = await corpusRoots(resources);
	const [, homeRoot] = roots;

	await installSkill({
		body: "doctrine skill",
		root: homeRoot,
		skill: "doctrine",
	});
	await installSkill({
		body: "discuss skill",
		root: homeRoot,
		skill: "discuss",
	});
	const parent = await temporaryDirectory(
		resources,
		"rehearse-corpus-snapshot-",
	);
	const worktree = join(parent, "first");
	const secondWorktree = join(parent, "second");

	await Promise.all([
		mkdir(worktree, { recursive: true }),
		mkdir(secondWorktree, { recursive: true }),
	]);

	return {
		firstSnapshot: join(parent, "first-snapshot"),
		roots,
		secondSnapshot: join(parent, "second-snapshot"),
		secondWorktree,
		worktree,
	};
}

async function installReviewedBuild(
	roots: readonly [string, string],
): Promise<void> {
	const [, homeRoot] = roots;

	await installSkill({ body: "build skill", root: homeRoot, skill: "build" });

	await installAgent({
		agent: "reviewer",
		body: "reviewer agent",
		root: homeRoot,
	});
}

export { installReviewedBuild, installationFixture };
