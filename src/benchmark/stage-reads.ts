import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { basename, relative } from "node:path";
import type { HashedFile, StageTranscriptSource } from "./checkpoint";
import { stageTranscriptFile } from "./checkpoint";
import {
	isCorpusLoad,
	loadedFiles,
	observedManifest,
	projectEntries,
} from "./context-manifest";
import type { ContextManifest } from "./context-manifest";
import type { ReadManifestEntry } from "./read-manifest";
import { PROJECT_INSTRUCTION_FILES, stageReadManifest } from "./read-manifest";
import { runCommand } from "./command";
import type { Immutable } from "./contracts";
import type { TranscriptLine } from "./transcript";
import { parseTranscriptFile } from "./transcript";

function targetPath(
	path: string,
	targetRoots: readonly string[],
): string | undefined {
	for (const root of targetRoots) {
		const inside = relative(root, path);
		if (inside !== "" && !inside.startsWith("..") && !inside.startsWith("/")) {
			return inside;
		}
	}

	return undefined;
}

/**
 * Project instructions the stage loaded from the target, by their path in it.
 * The provider may record the target under a link-resolved path, so both
 * spellings of its root are tried.
 */
async function loadedProjectInstructions(
	lines: Immutable<readonly TranscriptLine[]>,
	targetDir: string,
): Promise<readonly string[]> {
	const roots = [...new Set([targetDir, await realpath(targetDir)])];
	const paths: string[] = [];
	for (const path of loadedFiles(lines)) {
		if (
			isCorpusLoad(path) ||
			!PROJECT_INSTRUCTION_FILES.includes(basename(path))
		) {
			continue;
		}

		const inside = targetPath(path, roots);
		if (inside !== undefined) {
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
	readonly corpusFiles: readonly HashedFile[];
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
	const projectPaths = await loadedProjectInstructions(
		lines,
		request.targetDir,
	);
	const observed: ContextManifest = {
		paths: [...observedManifest(lines).paths, ...projectEntries(projectPaths)],
	};

	return stageReadManifest({
		skill: request.skill,
		corpusFiles: request.corpusFiles,
		targetFiles: await hashesAtStart(
			request.targetDir,
			request.startSha,
			projectPaths,
		),
		rubric: request.rubric,
		observed,
	});
}
