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
 * The stage a snapshot freezes for: its skill, which the install holds whether
 * or not the snapshot carries it, and the citation map it delivers against.
 */
interface StageCorpusInstallation {
	readonly citations: HomePathCitationMap;
	readonly skill: string;
}

/**
 * What a snapshot stands for: one stage's freeze, which holds its own skill
 * only, or a whole corpus directory, which holds every layout directory.
 */
type CorpusHolding = { readonly skill: string } | "whole";

/**
 * Installs the snapshot under the target's `.claude` and redirects the
 * home-path citations its text makes of what the install holds, so the stage
 * reads this snapshot's copy of each. The snapshot keeps its authored bytes.
 */
async function installCorpusSnapshot(
	snapshotDirectory: string,
	targetDirectory: string,
	delivery: {
		readonly citations: HomePathCitationMap;
		readonly holding: CorpusHolding;
	},
): Promise<CorpusDelivery> {
	const snapshot = await readStageSnapshot(snapshotDirectory);
	const destination = join(targetDirectory, ".claude");

	await replaceInstalledLayout(destination);

	await copyCorpusFiles({ ...snapshot, destination });
	const paths = snapshot.files.map(({ file }) => file.path);
	await writeInstalledCorpusIgnore(destination, paths);

	return await deliverInstalledCorpus(
		destination,
		stageCorpusInstall(snapshot, delivery.holding),
		delivery.citations,
	);
}

/**
 * Installs one stage's frozen snapshot, which holds its own skill only, so a
 * control arm frozen without that skill reads its absence rather than the
 * live copy.
 */
async function installStageCorpusSnapshot(
	snapshotDirectory: string,
	targetDirectory: string,
	{ citations, skill }: StageCorpusInstallation,
): Promise<CorpusDelivery> {
	return await installCorpusSnapshot(snapshotDirectory, targetDirectory, {
		citations,
		holding: { skill },
	});
}

/**
 * Installs a whole corpus directory, which holds every layout directory, so a
 * citation of a skill the directory lacks reaches the missing copy.
 */
async function installCorpusDirectory(
	corpusDirectory: string,
	targetDirectory: string,
	citations: HomePathCitationMap,
): Promise<CorpusDelivery> {
	return await installCorpusSnapshot(corpusDirectory, targetDirectory, {
		citations,
		holding: "whole",
	});
}

/**
 * Copies the snapshot as the install would read it, so a run can install and
 * hash a copy that later edits to the snapshot do not reach.
 */
async function freezeStageSnapshot(
	snapshotDirectory: string,
	destination: string,
): Promise<void> {
	const snapshot = await readStageSnapshot(snapshotDirectory);

	await copyCorpusFiles({ ...snapshot, destination });
}

/**
 * A stage holds its instructions, every agent, output style and rule whole,
 * since it freezes those kinds whole, and its own skill, present or not. A
 * whole directory holds every skill too, the ones it lacks included.
 */
function stageCorpusInstall(
	snapshot: Pick<CorpusCopy, "files">,
	holding: CorpusHolding,
): CorpusInstall {
	const files = ["CLAUDE.md", ...snapshot.files.map(({ file }) => file.path)];
	const held =
		holding === "whole"
			? ["CLAUDE.md", ...CORPUS_LAYOUT_DIRECTORIES]
			: ["CLAUDE.md", ...LAYOUT_DIRECTORY_KINDS, `skills/${holding.skill}`];

	return { files, held: held.toSorted() };
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
	{ citations, skill }: StageCorpusInstallation,
): Promise<StageCorpusDelivery> {
	const install = stageCorpusInstall(
		await readStageSnapshot(snapshotDirectory),
		{ skill },
	);

	return {
		delivery: await countCorpusDelivery(snapshotDirectory, install, citations),
		held: install.held,
	};
}

export {
	freezeStageSnapshot,
	installCorpusDirectory,
	installStageCorpusSnapshot as default,
	planStageCorpusDelivery,
};
export type { StageCorpusDelivery, StageCorpusInstallation };
