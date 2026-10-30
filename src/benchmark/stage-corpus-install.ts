import { mkdir, readdir, rm, unlink } from "node:fs/promises";
import { join, relative } from "node:path";

import { countCorpusDelivery, deliverInstalledCorpus } from "./corpus-delivery";
import type { CorpusDelivery, CorpusInstall } from "./corpus-delivery";
import {
	CORPUS_LAYOUT_DIRECTORIES,
	CorpusFileError,
	readCorpusInstructions,
	resolvesOutside,
} from "./corpus-file";
import type { CorpusRoot } from "./corpus-file";
import { symlinkedEntry } from "./directory-entry-probe";
import { lstatIfPresent } from "./file-presence";
import type { HomePathCitationMap } from "./home-path-citation";
import type { CorpusDirectory } from "./stage-corpus-directories";
import {
	LAYOUT_DIRECTORY_KINDS,
	resolveLayoutDirectory,
} from "./stage-corpus-directories";
import { captureDirectories, copyCorpusFiles } from "./stage-corpus-snapshot";
import type { CorpusCopy } from "./stage-corpus-snapshot";

/**
 * `cp` dereferences, so an entry reached through a link installs bytes from
 * outside the snapshot into the worktree the session reads, while the record
 * says the session read the snapshot. Containment of the resolved path is what
 * answers it, because the link can be the entry or any directory above it.
 */
async function refuseUncontainedEntries(
	snapshotDirectory: string,
): Promise<void> {
	await Array.fromAsync(
		await readdir(snapshotDirectory, {
			recursive: true,
			withFileTypes: true,
		}),
		async (entry) => {
			const absolute = join(entry.parentPath, entry.name);
			if (await resolvesOutside(snapshotDirectory, absolute)) {
				throw symlinkedEntry(
					join(relative(snapshotDirectory, entry.parentPath), entry.name),
				);
			}
		},
	);
}

const INSTALLED_CORPUS_IGNORE = ".gitignore";

const SKILL_ROOT_START = 0;

const SKILL_ROOT_END = 2;

async function snapshotDirectories(
	source: CorpusRoot,
): Promise<readonly CorpusDirectory[]> {
	const directories: CorpusDirectory[] = [];

	await Array.fromAsync(CORPUS_LAYOUT_DIRECTORIES, async (kind) => {
		const directory = await resolveLayoutDirectory(kind, [source]);
		if (directory !== undefined) {
			directories.push(directory);
		}
	});

	return directories;
}

async function replaceInstalledLayout(destination: string): Promise<void> {
	const installed = await lstatIfPresent(destination);
	if (installed?.isSymbolicLink() === true) {
		await unlink(destination);
	}

	await mkdir(destination, { recursive: true });
	await Array.fromAsync(
		[...CORPUS_LAYOUT_DIRECTORIES, "CLAUDE.md", INSTALLED_CORPUS_IGNORE],
		async (kind) => {
			await rm(join(destination, kind), { force: true, recursive: true });
		},
	);
}

async function readStageSnapshot(
	snapshotDirectory: string,
): Promise<Omit<CorpusCopy, "destination">> {
	await refuseUncontainedEntries(snapshotDirectory);
	const source = { kind: "directory", root: snapshotDirectory } as const;
	const directories = await snapshotDirectories(source);

	return {
		directories,
		files: await captureDirectories(directories),
		instructions: await readCorpusInstructions(source),
	};
}

/**
 * Installs the snapshot under the target's `.claude` and redirects the
 * home-path citations its text makes of what the install holds, so the stage
 * reads this snapshot's copy of each. The snapshot keeps its authored bytes.
 */
async function installStageCorpusSnapshot(
	snapshotDirectory: string,
	targetDirectory: string,
	citations: HomePathCitationMap,
): Promise<CorpusDelivery> {
	const snapshot = await readStageSnapshot(snapshotDirectory);
	const destination = join(targetDirectory, ".claude");

	await replaceInstalledLayout(destination);

	await copyCorpusFiles({ ...snapshot, destination });
	const paths = snapshot.files.map(({ file }) => file.path);
	await writeInstalledCorpusIgnore(destination, paths);

	return await deliverInstalledCorpus(
		destination,
		stageCorpusInstall(snapshot),
		citations,
	);
}

/**
 * A stage holds its instructions, every agent, output style and rule whole,
 * since it freezes those kinds whole, and its own skill.
 */
function stageCorpusInstall(
	snapshot: Pick<CorpusCopy, "files">,
): CorpusInstall {
	const files = snapshot.files.map(({ file }) => file.path);
	const skills = files
		.filter((path) => path.startsWith("skills/"))
		.map((path) => path.split("/").slice(SKILL_ROOT_START, SKILL_ROOT_END))
		.map((steps) => steps.join("/"));

	return {
		files: ["CLAUDE.md", ...files],
		held: [
			...new Set(["CLAUDE.md", ...LAYOUT_DIRECTORY_KINDS, ...skills]),
		].toSorted(),
	};
}

/**
 * The installed layout is harness state, not stage output, so a target that
 * does not ignore `.claude` must not read as dirty once it is installed. The
 * ignore file lives in the worktree and names each installed file, so it goes
 * with the worktree and a file a stage writes under `.claude` still shows.
 */
function installedCorpusIgnore(paths: readonly string[]): string {
	const patterns = [INSTALLED_CORPUS_IGNORE, "CLAUDE.md", ...paths].map(
		(path) => {
			if (path.includes("\n")) {
				throw new CorpusFileError(
					`Corpus file ${path} must fit on one ignore line`,
				);
			}

			return `/${path.replaceAll(/[\\*?[\] ]/gu, String.raw`\$&`)}`;
		},
	);

	return `${patterns.join("\n")}\n`;
}
async function writeInstalledCorpusIgnore(
	destination: string,
	paths: readonly string[],
): Promise<void> {
	await Bun.write(
		join(destination, INSTALLED_CORPUS_IGNORE),
		installedCorpusIgnore(paths),
	);
}

/**
 * What a stage install of this snapshot delivers: the files and directories
 * it holds whole, by layout path, and what its rewrite redirects, read before
 * any install.
 */
interface StageCorpusDelivery {
	readonly held: readonly string[];
	readonly delivery: CorpusDelivery;
}

async function planStageCorpusDelivery(
	snapshotDirectory: string,
	citations: HomePathCitationMap,
): Promise<StageCorpusDelivery> {
	const install = stageCorpusInstall(
		await readStageSnapshot(snapshotDirectory),
	);

	return {
		delivery: await countCorpusDelivery(snapshotDirectory, install, citations),
		held: install.held,
	};
}

export { installStageCorpusSnapshot as default, planStageCorpusDelivery };
export type { StageCorpusDelivery };
