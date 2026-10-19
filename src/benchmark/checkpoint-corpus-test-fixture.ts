import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import {
	temporaryDirectory,
	writeFixtureFiles,
} from "./checkpoint-filesystem-test-fixture";
import type { CorpusRoot } from "./corpus-file";
import type { TestResources } from "./test-support";

interface SkillInstallation {
	readonly root: string;
	readonly skill: string;
	readonly body: string;
}

async function installSkill({
	root,
	skill,
	body,
}: SkillInstallation): Promise<void> {
	const directory = join(root, "skills", skill, "references");

	await mkdir(directory, { recursive: true });
	await Bun.write(join(root, "skills", skill, "SKILL.md"), body);
	await Bun.write(join(directory, "notes.md"), `${body} notes`);
}

interface AgentInstallation {
	readonly root: string;
	readonly agent: string;
	readonly body: string;
}

async function installAgent({
	root,
	agent,
	body,
}: AgentInstallation): Promise<void> {
	await mkdir(join(root, "agents"), { recursive: true });
	await Bun.write(join(root, "agents", `${agent}.md`), body);
}

interface RuleInstallation {
	readonly root: string;
	readonly rule: string;
	readonly body: string;
}

async function installRule({
	root,
	rule,
	body,
}: RuleInstallation): Promise<void> {
	await mkdir(join(root, "rulebook"), { recursive: true });
	await Bun.write(join(root, "rulebook", `${rule}.md`), body);
}

interface OutputStyleInstallation {
	readonly root: string;
	readonly style: string;
	readonly body: string;
}

async function installOutputStyle({
	root,
	style,
	body,
}: OutputStyleInstallation): Promise<void> {
	await mkdir(join(root, "output-styles"), { recursive: true });
	await Bun.write(join(root, "output-styles", `${style}.md`), body);
}

function corpusSources(roots: readonly string[]): readonly CorpusRoot[] {
	return roots.map((root) => ({ kind: "directory", root }));
}

async function corpusRoots(
	testResources: Readonly<TestResources>,
): Promise<readonly [targetRoot: string, homeRoot: string]> {
	const directory = await temporaryDirectory(testResources, "rehearse-corpus-");
	const roots: [string, string] = [
		join(directory, "target"),
		join(directory, "home"),
	];

	await Promise.all(
		roots.map(async (root) => await mkdir(root, { recursive: true })),
	);

	return roots;
}

interface EscapingSnapshotFixture {
	readonly snapshotDirectory: string;
	readonly worktree: string;
}

async function escapingSnapshotFixture(
	resources: Readonly<TestResources>,
): Promise<EscapingSnapshotFixture> {
	const parent = await temporaryDirectory(
		resources,
		"rehearse-corpus-snapshot-",
	);
	const outside = join(parent, "outside");
	const snapshotDirectory = join(parent, "snapshot");

	await writeFixtureFiles({
		files: [
			["outside/secret.md", "SECRET BYTES\n"],
			["snapshot/CLAUDE.md", "instructions\n"],
		],
		root: parent,
	});
	await Array.fromAsync(
		["skills", "agents", "output-styles", "rulebook"],
		async (kind) => {
			await mkdir(join(snapshotDirectory, kind), { recursive: true });
		},
	);
	await symlink(
		join(outside, "secret.md"),
		join(snapshotDirectory, "agents", "leak.md"),
	);
	const worktree = join(parent, "worktree");

	await mkdir(worktree, { recursive: true });

	return { snapshotDirectory, worktree };
}

export {
	corpusRoots,
	corpusSources,
	escapingSnapshotFixture,
	installAgent,
	installOutputStyle,
	installRule,
	installSkill,
};
