import { realpath } from "node:fs/promises";
import { basename, join } from "node:path";

import type { HashedFile, StageTranscriptSource } from "./checkpoint";
import { stageTranscriptFile } from "./checkpoint";
import {
	isCorpusLoad,
	isCorpusRead,
	loadedFiles,
	observedManifest,
	pathInsideAny,
	projectEntries,
} from "./context-manifest";
import type { ContextManifest, CorpusReadRoots } from "./context-manifest";
import type { Immutable } from "./contracts";
import type { CorpusRoot } from "./corpus-file";
import { statIfExists } from "./file-presence";
import type { ReadManifestEntry } from "./read-manifest";
import { PROJECT_INSTRUCTION_FILES, stageReadManifest } from "./read-manifest";
import hashesAtStart from "./stage-read-target-hashes";
import type { TranscriptLine } from "./transcript";
import { parseTranscriptFile } from "./transcript";

/**
 * Project instructions the stage loaded from the target, by their path in it.
 * The provider may record the target under a link-resolved path, so both
 * spellings of its root are tried.
 */
async function loadedProjectInstructions(
	lines: Immutable<readonly TranscriptLine[]>,
	targetDir: string,
): Promise<readonly string[]> {
	const roots = await spellings([targetDir]);
	const paths: string[] = [];
	for (const path of loadedFiles(lines)) {
		if (
			!isCorpusLoad(path) &&
			PROJECT_INSTRUCTION_FILES.includes(basename(path))
		) {
			const inside = pathInsideAny(path, roots);
			if (inside !== undefined) {
				paths.push(inside);
			}
		}
	}

	return [...new Set(paths)];
}

/**
 * The directories a corpus source reads from. A live install may resolve
 * into the tree backing it, so a load there is the corpus's too.
 */
function corpusSourceDirectories(source: CorpusRoot): readonly string[] {
	return source.kind === "live"
		? [source.root, source.backingRoot]
		: [source.root];
}

/**
 * Each directory as given and as its links resolve, since the provider may
 * record a load under either. A directory that does not exist is kept as
 * given.
 */
async function spellings(
	directories: readonly string[],
): Promise<readonly string[]> {
	const found: string[] = [];
	await Array.fromAsync(directories, async (directory) => {
		found.push(
			directory,
			(await statIfExists(directory)) === undefined
				? directory
				: await realpath(directory),
		);
	});

	return [...new Set(found)];
}

/**
 * Files the stage loaded from the target's own `.claude` that the corpus does
 * not account for, by their path in the target. They come from the
 * repository or the session, not the corpus under test, so they are the
 * target's and are hashed as its starting commit held them.
 */
function loadedTargetClaudeFiles(
	lines: Immutable<readonly TranscriptLine[]>,
	targetRoots: readonly string[],
	corpusRoots: CorpusReadRoots,
): readonly string[] {
	const paths: string[] = [];
	for (const path of loadedFiles(lines)) {
		const inside = pathInsideAny(path, targetRoots);
		if (
			inside?.startsWith(".claude/") === true &&
			!isCorpusRead(path, corpusRoots)
		) {
			paths.push(inside);
		}
	}

	return [...new Set(paths)];
}

interface StageReadsRequest {
	readonly targetDir: string;
	readonly startSha: string;
	readonly transcript: StageTranscriptSource | undefined;
	/** The stage's own skill, absent for a stage that ran without it. */
	readonly skill: string | undefined;
	/**
	 * The directories holding the whole corpus source the stage read past its
	 * own `.claude`. A stage whose corpus was installed into its worktree has
	 * none.
	 */
	readonly corpusSources: readonly string[];
	readonly corpusFiles: readonly HashedFile[];
	/** The corpus version measured at the stage's start. */
	readonly versionFiles: readonly HashedFile[];
	readonly rubric: HashedFile;
}

/** The read manifest of a stage session that has ended, from its transcript. */
async function recordStageReads(
	request: StageReadsRequest,
): Promise<readonly ReadManifestEntry[]> {
	const lines =
		request.transcript === undefined
			? []
			: await parseTranscriptFile(
					stageTranscriptFile(request.targetDir, request.transcript),
				);
	const targetRoots = await spellings([request.targetDir]);
	const corpusRoots: CorpusReadRoots = {
		shadow: targetRoots.map((root) => join(root, ".claude")),
		shadowed: request.corpusFiles.map((file) => file.path),
		sources: await spellings(request.corpusSources),
	};
	const projectPaths = [
		...(await loadedProjectInstructions(lines, request.targetDir)),
		...loadedTargetClaudeFiles(lines, targetRoots, corpusRoots),
	];
	const observed: ContextManifest = {
		paths: [
			...observedManifest(lines, [], corpusRoots).paths,
			...projectEntries(projectPaths),
		],
	};

	return stageReadManifest({
		corpusFiles: request.corpusFiles,
		observed,
		rubric: request.rubric,
		skill: request.skill,
		targetFiles: await hashesAtStart(
			request.targetDir,
			request.startSha,
			projectPaths,
		),
		versionFiles: request.versionFiles,
	});
}

export {
	loadedProjectInstructions,
	corpusSourceDirectories,
	spellings,
	recordStageReads,
};
export type { StageReadsRequest };
