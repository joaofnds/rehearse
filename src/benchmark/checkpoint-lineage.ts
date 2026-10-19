import { createHash } from "node:crypto";

import { z } from "zod";

import type { Effort } from "./config";

const SORT_AFTER = 1;

const SORT_BEFORE = -1;

const SORT_EQUAL = 0;

interface HashedFile {
	readonly path: string;
	readonly sha256: string;
}

interface LineageInputs {
	readonly upstream: string;
	readonly corpusFiles: readonly HashedFile[];
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly settingsFile?: HashedFile | undefined;
}

interface RootLineageInputs {
	readonly taskSha: string;
	readonly task: string;
	readonly productBrief: string;
	readonly workflowFiles: readonly HashedFile[];
}

function sha256(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

// Codepoint order, never locale collation: the lineage key must hash the
// same bytes on every machine, and locale-aware sorting varies with the
// host's collation rules.
function canonicalFiles(files: readonly HashedFile[]): HashedFile[] {
	return files
		.toSorted((left, right) => {
			if (left.path < right.path) {
				return SORT_BEFORE;
			}
			if (left.path > right.path) {
				return SORT_AFTER;
			}

			return SORT_EQUAL;
		})
		.map((file) => ({ path: file.path, sha256: file.sha256 }));
}

/**
 * The key hashes exactly the inputs the design names — upstream checkpoint,
 * corpus files feeding the stage, model, effort — so a checkpoint is
 * invalidated when and only when one of them changes. Nothing else may enter
 * this object: an extra field would invalidate checkpoints spuriously.
 */
function lineageKey(inputs: LineageInputs): string {
	const payload = Object.fromEntries<
		string | readonly HashedFile[] | HashedFile | null
	>([
		["upstream", inputs.upstream],
		["corpusFiles", canonicalFiles(inputs.corpusFiles)],
		["model", inputs.model],
		["effort", inputs.effort ?? null],
		["settingsFile", inputs.settingsFile ?? null],
	]);
	return sha256(JSON.stringify(payload));
}

async function hashFile(path: string): Promise<string> {
	return createHash("sha256")
		.update(await Bun.file(path).bytes())
		.digest("hex");
}

/**
 * The first stage has no upstream checkpoint; its upstream is the initial
 * state the run created: the task commit, the task and brief texts that feed
 * every session, and the workflow files present before any stage ran.
 */
function rootLineage(inputs: RootLineageInputs): string {
	const payload = Object.fromEntries<string | readonly HashedFile[]>([
		["taskSha", inputs.taskSha],
		["task", sha256(inputs.task)],
		["productBrief", sha256(inputs.productBrief)],
		["workflowFiles", canonicalFiles(inputs.workflowFiles)],
	]);
	return sha256(JSON.stringify(payload));
}

function hashArtifacts(
	artifacts: readonly { readonly path: string; readonly content: string }[],
): readonly HashedFile[] {
	return artifacts.map(({ path, content }) => ({
		path,
		sha256: sha256(content),
	}));
}

const hashedFileSchema = z.object({
	path: z
		.string()
		.nonempty()
		.refine(
			(path) => !path.startsWith("/") && !path.split("/").includes(".."),
			"must be a relative path without traversal",
		),
	sha256: z.string().regex(/^[0-9a-f]{64}$/u),
});
export {
	canonicalFiles,
	lineageKey,
	hashFile,
	rootLineage,
	hashArtifacts,
	hashedFileSchema,
	sha256,
};
export type { HashedFile, LineageInputs, RootLineageInputs };
