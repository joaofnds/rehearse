import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { HashedFile } from "./checkpoint-lineage";
import { sha256 } from "./checkpoint-lineage";
import type { CorpusRoot } from "./corpus-file";
import { hashDirectory } from "./directory-tree-walk";
import type { CorpusDirectory, StageSkill } from "./stage-corpus-directories";
import { stageCorpusDirectories } from "./stage-corpus-directories";

interface CapturedCorpusFile {
	readonly source: CorpusRoot;
	readonly file: HashedFile;
}

async function captureDirectories(
	directories: readonly CorpusDirectory[],
): Promise<readonly CapturedCorpusFile[]> {
	const files: CapturedCorpusFile[] = [];

	await Array.fromAsync(directories, async ({ source, layoutPath }) => {
		const hashed = await hashDirectory(
			join(source.root, layoutPath),
			layoutPath,
			{ source },
		);
		files.push(...hashed.map((file) => ({ file, source })));
	});

	return files;
}

async function captureStageSkillCorpus(
	skill: StageSkill,
	instructions: string,
	roots: readonly CorpusRoot[],
): Promise<readonly HashedFile[]> {
	const files = await captureDirectories(
		await stageCorpusDirectories(skill, roots),
	);
	return [
		{ path: "CLAUDE.md", sha256: sha256(instructions) },
		...files.map(({ file }) => file),
	];
}

async function captureStageCorpus(
	skill: string,
	instructions: string,
	roots: readonly CorpusRoot[],
): Promise<readonly HashedFile[]> {
	return await captureStageSkillCorpus(
		{ name: skill, presence: "installed" },
		instructions,
		roots,
	);
}

async function captureStageCorpusWithoutSkill(
	skill: string,
	instructions: string,
	roots: readonly CorpusRoot[],
): Promise<readonly HashedFile[]> {
	return await captureStageSkillCorpus(
		{ name: skill, presence: "absent" },
		instructions,
		roots,
	);
}

interface CorpusCopy {
	readonly directories: readonly CorpusDirectory[];
	readonly files: readonly CapturedCorpusFile[];
	readonly instructions: string;
	readonly destination: string;
}

async function copyCorpusFiles(copy: CorpusCopy): Promise<void> {
	await Array.fromAsync(copy.directories, async ({ layoutPath }) => {
		await mkdir(join(copy.destination, layoutPath), { recursive: true });
	});

	await Bun.write(join(copy.destination, "CLAUDE.md"), copy.instructions);

	await Array.fromAsync(copy.files, async ({ source, file }) => {
		const target = join(copy.destination, file.path);

		await mkdir(dirname(target), { recursive: true });
		await cp(join(source.root, file.path), target, { dereference: true });
	});
}

interface StageSkillCorpusSelection {
	readonly skill: StageSkill;
	readonly instructions: string;
}

async function snapshotStageSkillCorpus(
	{ skill, instructions }: StageSkillCorpusSelection,
	roots: readonly CorpusRoot[],
	destination: string,
): Promise<readonly HashedFile[]> {
	const directories = await stageCorpusDirectories(skill, roots);
	const files = await captureDirectories(directories);

	await copyCorpusFiles({ destination, directories, files, instructions });

	return await captureStageSkillCorpus(skill, instructions, [
		{ kind: "directory", root: destination },
	]);
}

interface StageCorpusSelection {
	readonly skill: string;
	readonly instructions: string;
}

async function snapshotStageCorpus(
	{ skill, instructions }: StageCorpusSelection,
	roots: readonly CorpusRoot[],
	destination: string,
): Promise<readonly HashedFile[]> {
	return await snapshotStageSkillCorpus(
		{ instructions, skill: { name: skill, presence: "installed" } },
		roots,
		destination,
	);
}

async function snapshotStageCorpusWithoutSkill(
	{ skill, instructions }: StageCorpusSelection,
	roots: readonly CorpusRoot[],
	destination: string,
): Promise<readonly HashedFile[]> {
	return await snapshotStageSkillCorpus(
		{ instructions, skill: { name: skill, presence: "absent" } },
		roots,
		destination,
	);
}
export {
	captureStageCorpus,
	captureStageCorpusWithoutSkill,
	snapshotStageCorpus,
	snapshotStageCorpusWithoutSkill,
	captureDirectories,
	copyCorpusFiles,
};
