import type { Stats } from "node:fs";
import { join } from "node:path";

import type { StageSkillPresence } from "./config";
import type { CorpusRoot, LiveCorpusRoot } from "./corpus-file";
import { resolvesOutsideCorpus } from "./corpus-file";
import { refusedEntry, symlinkedEntry } from "./directory-entry-probe";
import { refusedEntryReason, statIfExists } from "./file-presence";
import serialMap from "./serial-map";

/**
 * A layout root holds `skills/`, `agents/`, and `output-styles/` as siblings,
 * the shape a `.claude` directory has whether it belongs to a project or a
 * user. Project level is searched before user level, so a stage session
 * reads the frozen bytes a worktree's project-level `.claude` carries before
 * falling back to whatever is live at user level.
 */
function corpusLayoutRoots(
	targetDir: string,
	source: LiveCorpusRoot,
): readonly CorpusRoot[] {
	return [{ kind: "directory", root: join(targetDir, ".claude") }, source];
}

/**
 * Where a stage's corpus lives for one corpus source, so `stale` and `replay`
 * cannot disagree about whether the same checkpoint is stale. The live
 * install is the pair `corpusLayoutRoots` already searches against the
 * target under test, project level first; a resolved directory or render is
 * the whole corpus, so nothing outside it may shadow what it holds.
 */
function stageCorpusRoots(
	source: CorpusRoot,
	targetRoot: string,
): readonly CorpusRoot[] {
	return source.kind === "live"
		? corpusLayoutRoots(targetRoot, source)
		: [source];
}

interface CorpusDirectory {
	readonly source: CorpusRoot;
	readonly layoutPath: string;
}

/**
 * A layout directory that loops or cannot be read is refused by name, as an
 * entry escaping the tree is, so a staleness reader can judge against it.
 */
async function layoutDirectoryStats(
	directory: string,
	layoutPath: string,
): Promise<Stats | undefined> {
	try {
		return await statIfExists(directory);
	} catch (error) {
		const reason =
			error instanceof Error ? refusedEntryReason(error, directory) : undefined;
		if (reason === undefined) {
			throw error;
		}

		throw refusedEntry(layoutPath, reason);
	}
}

async function resolveLayoutDirectory(
	layoutPath: string,
	roots: readonly CorpusRoot[],
): Promise<CorpusDirectory | undefined> {
	for await (const inspection of serialMap(roots.values(), async (source) => {
		const directory = join(source.root, layoutPath);
		return {
			directory,
			directoryStats: await layoutDirectoryStats(directory, layoutPath),
			source,
		};
	})) {
		const { source, directory, directoryStats } = inspection;
		if (directoryStats?.isDirectory() === true) {
			if (await resolvesOutsideCorpus(source, directory)) {
				throw symlinkedEntry(layoutPath);
			}

			return { layoutPath, source };
		}
	}

	return undefined;
}

async function resolveSkill(
	skill: string,
	roots: readonly CorpusRoot[],
): Promise<CorpusDirectory> {
	const directory = await resolveLayoutDirectory(join("skills", skill), roots);
	if (directory !== undefined) {
		return directory;
	}

	throw new Error(
		`The ${skill} skill is not installed; searched ${roots.map(({ root }) => root).join(", ")}`,
	);
}

async function resolveSkillDirectory(
	skill: string,
	roots: readonly CorpusRoot[],
): Promise<string> {
	const { source, layoutPath } = await resolveSkill(skill, roots);
	return join(source.root, layoutPath);
}

/**
 * Skills every stage reads regardless of which skill it invokes, so an edit
 * to one changes every stage's corpus. A declared list: adding another global
 * skill later is one entry here. The doctrine left this list when it became a
 * rules file, which `rulebook` now carries whole.
 */
const GLOBAL_SKILLS: readonly string[] = [];

/**
 * The whole-directory corpus kinds a stage's corpus carries beside its skills:
 * every agent, every output style, and every rule, whichever root supplies
 * them, because a stage session can read any of them and all must be frozen
 * the same way a skill is. Rules are a directory of files rather than a named
 * unit like a skill, so a stage reads them by path and the whole tree is
 * frozen.
 */
const LAYOUT_DIRECTORY_KINDS: readonly string[] = [
	"agents",
	"output-styles",
	"rulebook",
];

/**
 * Corpus file paths are recorded relative to the corpus, not the machine, so
 * the same skill bytes produce the same lineage wherever they are installed.
 * The global skills join every stage's corpus beside the installed
 * instructions, because every stage reads them. Agents and output styles join
 * it too, whole, from the first root that has them: a stage session's skill
 * can invoke either, and both must be frozen along with the skill it invokes.
 */
async function stageCorpusDirectories(
	skill: StageSkill,
	roots: readonly CorpusRoot[],
): Promise<readonly CorpusDirectory[]> {
	const directories: CorpusDirectory[] = [];

	await Array.fromAsync(LAYOUT_DIRECTORY_KINDS, async (kind) => {
		const directory = await resolveLayoutDirectory(kind, roots);
		if (directory !== undefined) {
			directories.push(directory);
		}
	});

	if (skill.presence === "absent") {
		await refuseInstalledSkill(skill.name, roots);
	}
	const skills = new Set(GLOBAL_SKILLS);
	if (skill.presence === "installed") {
		skills.add(skill.name);
	}
	await Array.fromAsync(skills, async (name) => {
		directories.push(await resolveSkill(name, roots));
	});

	return directories;
}

/**
 * A stage's own skill, installed as a run needs it, or absent for a
 * comparison's baseline arm, which replays the stage without the skill under
 * test (ACT-271.4).
 */
interface StageSkill {
	readonly name: string;
	readonly presence: StageSkillPresence;
}

/**
 * A baseline arm whose corpus still holds the skill would read it while its
 * record says it ran without it.
 */
async function refuseInstalledSkill(
	skill: string,
	roots: readonly CorpusRoot[],
): Promise<void> {
	const directory = await resolveLayoutDirectory(join("skills", skill), roots);
	if (directory !== undefined) {
		throw new Error(
			`The ${skill} skill is installed in ${directory.source.root}, but this stage runs without it`,
		);
	}
}
export {
	corpusLayoutRoots,
	stageCorpusRoots,
	resolveSkillDirectory,
	GLOBAL_SKILLS,
	stageCorpusDirectories,
	resolveLayoutDirectory,
};
export type { CorpusDirectory, StageSkill };
