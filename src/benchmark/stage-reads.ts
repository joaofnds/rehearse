import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { basename } from "node:path";
import type { HashedFile, StageTranscriptSource } from "./checkpoint";
import { stageTranscriptFile } from "./checkpoint";
import {
	isCorpusLoad,
	loadedFiles,
	observedManifest,
	pathInsideAny,
	projectEntries,
} from "./context-manifest";
import type { ContextManifest } from "./context-manifest";
import type { CorpusRoot } from "./corpus-file";
import type { ReadManifestEntry } from "./read-manifest";
import { PROJECT_INSTRUCTION_FILES, stageReadManifest } from "./read-manifest";
import { runCommand } from "./command";
import type { Immutable } from "./contracts";
import type { TranscriptLine } from "./transcript";
import { parseTranscriptFile } from "./transcript";

/**
 * Project instructions the stage loaded from the target, by their path in it.
 * The provider may record the target under a link-resolved path, so both
 * spellings of its root are tried.
 */
export async function loadedProjectInstructions(
	lines: Immutable<readonly TranscriptLine[]>,
	targetDir: string,
): Promise<readonly string[]> {
	const roots = await spellings([targetDir]);
	const paths: string[] = [];
	for (const path of loadedFiles(lines)) {
		if (
			isCorpusLoad(path) ||
			!PROJECT_INSTRUCTION_FILES.includes(basename(path))
		) {
			continue;
		}

		const inside = pathInsideAny(path, roots);
		if (inside !== undefined) {
			paths.push(inside);
		}
	}

	return [...new Set(paths)];
}

/**
 * The directories a corpus source reads from. A live install may resolve
 * into the tree backing it, so a load there is the corpus's too.
 */
export function corpusSourceDirectories(source: CorpusRoot): readonly string[] {
	return source.kind === "live"
		? [source.root, source.backingRoot]
		: [source.root];
}

/**
 * Each directory as given and as its links resolve, since the provider may
 * record a load under either. A directory that does not exist is kept as
 * given.
 */
export async function spellings(
	directories: readonly string[],
): Promise<readonly string[]> {
	const found: string[] = [];
	for (const directory of directories) {
		found.push(directory, await realpath(directory).catch(() => directory));
	}

	return [...new Set(found)];
}

/**
 * Files the stage loaded from the target's own `.claude` that no corpus root
 * holds, by their path in the target. They come from the repository, not the
 * corpus under test, so they are the target's and are hashed as its starting
 * commit held them.
 */
async function loadedTargetClaudeFiles(
	lines: Immutable<readonly TranscriptLine[]>,
	targetDir: string,
	corpusRoots: readonly string[],
): Promise<readonly string[]> {
	const targetRoots = await spellings([targetDir]);
	const paths: string[] = [];
	for (const path of loadedFiles(lines)) {
		const inside = pathInsideAny(path, targetRoots);
		if (
			pathInsideAny(path, corpusRoots) === undefined &&
			inside?.startsWith(".claude/") === true
		) {
			paths.push(inside);
		}
	}

	return [...new Set(paths)];
}

async function blobBytes(
	targetDir: string,
	objectId: string,
): Promise<Uint8Array> {
	const child = Bun.spawn(["git", "cat-file", "blob", objectId], {
		cwd: targetDir,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [bytes, exitCode] = await Promise.all([
		new Response(child.stdout).bytes(),
		child.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(`git cat-file blob ${objectId} exited ${exitCode}`);
	}

	return bytes;
}

/**
 * A stage can write an instruction file after reading it, so its hash is the
 * one the stage started from, and a file absent there carries none.
 */
async function hashesAtStart(
	targetDir: string,
	startSha: string,
	paths: readonly string[],
): Promise<readonly HashedFile[]> {
	const files: HashedFile[] = [];
	for (const path of paths) {
		const listing = await runCommand(
			["git", "ls-tree", "-z", startSha, "--", path],
			targetDir,
		);
		const objectId = /^\d+ blob (?<objectId>[0-9a-f]+)\t/u.exec(listing)
			?.groups?.["objectId"];
		if (objectId !== undefined) {
			files.push({
				path,
				sha256: createHash("sha256")
					.update(await blobBytes(targetDir, objectId))
					.digest("hex"),
			});
		}
	}

	return files;
}

export interface StageReadsRequest {
	readonly targetDir: string;
	readonly startSha: string;
	readonly transcript: StageTranscriptSource | undefined;
	readonly skill: string;
	/**
	 * The directories the stage's corpus resolved from. Only a load under one
	 * of them is a corpus entry.
	 */
	readonly corpusRoots: readonly string[];
	readonly corpusFiles: readonly HashedFile[];
	/** The corpus version measured at the stage's start. */
	readonly versionFiles: readonly HashedFile[];
	readonly rubric: HashedFile;
}

/** The read manifest of a stage session that has ended, from its transcript. */
export async function recordStageReads(
	request: StageReadsRequest,
): Promise<readonly ReadManifestEntry[]> {
	const lines =
		request.transcript === undefined
			? []
			: await parseTranscriptFile(
					stageTranscriptFile(request.targetDir, request.transcript),
				);
	const corpusRoots = await spellings(request.corpusRoots);
	const projectPaths = [
		...(await loadedProjectInstructions(lines, request.targetDir)),
		...(await loadedTargetClaudeFiles(lines, request.targetDir, corpusRoots)),
	];
	const observed: ContextManifest = {
		paths: [
			...observedManifest(lines, [], corpusRoots).paths,
			...projectEntries(projectPaths),
		],
	};

	return stageReadManifest({
		skill: request.skill,
		corpusFiles: request.corpusFiles,
		versionFiles: request.versionFiles,
		targetFiles: await hashesAtStart(
			request.targetDir,
			request.startSha,
			projectPaths,
		),
		rubric: request.rubric,
		observed,
	});
}
