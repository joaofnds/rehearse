import { basename } from "node:path";

import { z } from "zod";

import type { HashedFile } from "./checkpoint";
import type { ContextManifest, ManifestEntry } from "./context-manifest";
import type { Immutable } from "./contracts";

const READ_ROLES = [
	"global instructions",
	"project instructions",
	"stage skill",
	"judge rubric",
	"read for context",
] as const;

type ReadRole = (typeof READ_ROLES)[number];

type ReadEvidence = ReadManifestEntry["evidence"];

const readManifestEntrySchema = z
	.object({
		evidence: z.enum(["declared", "observed", "declared and observed"]),
		half: z.enum(["corpus", "project", "rubric"]),
		path: z.string().nonempty(),
		role: z.enum(READ_ROLES),
		sha256: z
			.string()
			.regex(/^[0-9a-f]{64}$/u)
			.optional(),
	})
	.strict();

const readManifestSchema = z.array(readManifestEntrySchema);

type ReadManifestEntry = Immutable<z.infer<typeof readManifestEntrySchema>>;

const PROJECT_INSTRUCTION_FILES: readonly string[] = ["CLAUDE.md", "AGENTS.md"];

function stageSkillPath(skill: string): string {
	return `skills/${skill}/SKILL.md`;
}

function role(entry: ManifestEntry, skill: string | undefined): ReadRole {
	if (entry.half === "project") {
		return PROJECT_INSTRUCTION_FILES.includes(basename(entry.path))
			? "project instructions"
			: "read for context";
	}
	if (entry.path === "CLAUDE.md") {
		return "global instructions";
	}
	if (skill !== undefined && entry.path === stageSkillPath(skill)) {
		return "stage skill";
	}

	return "read for context";
}

function hashOf(
	files: readonly HashedFile[],
	path: string,
): { readonly sha256?: string } {
	const file = files.find((candidate) => candidate.path === path);

	return file === undefined ? {} : { sha256: file.sha256 };
}

interface ReadManifestInputs {
	/** The stage skill, when the record ran one. */
	readonly skill: string | undefined;
	/** Corpus files as the record's corpus resolved them at its start. */
	readonly corpusFiles: readonly HashedFile[];
	/**
	 * The corpus version measured at the record's start, which hashes a corpus
	 * file the record loaded beyond `corpusFiles`. Empty when that measurement
	 * refused, so such a file carries no hash.
	 */
	readonly versionFiles: readonly HashedFile[];
	/** Target files as the record's starting checkpoint held them. */
	readonly targetFiles: readonly HashedFile[];
	/** Corpus files the record declares it reads, beside the stage skill. */
	readonly declared: readonly ManifestEntry[];
	readonly rubric: HashedFile | undefined;
	readonly observed: ContextManifest;
}

function manifestEntryKey(entry: ManifestEntry): string {
	return `${entry.half}:${entry.path}`;
}

/**
 * What one record declared and was observed to read. A load the transcript
 * does not show is not proof the record never read the file (GLOSSARY Context
 * manifest), so an entry only ever adds a file, never rules one out.
 */
function readManifest(
	inputs: ReadManifestInputs,
): readonly ReadManifestEntry[] {
	const observed = new Set(inputs.observed.paths.map(manifestEntryKey));
	const declared = new Set(inputs.declared.map(manifestEntryKey));

	const entry = (
		manifestEntry: ManifestEntry,
		evidence: ReadEvidence,
	): ReadManifestEntry => ({
		evidence,
		half: manifestEntry.half,
		path: manifestEntry.path,
		role: role(manifestEntry, inputs.skill),
		...hashOf(
			manifestEntry.half === "corpus"
				? [...inputs.corpusFiles, ...inputs.versionFiles]
				: inputs.targetFiles,
			manifestEntry.path,
		),
	});

	const rubric: readonly ReadManifestEntry[] =
		inputs.rubric === undefined
			? []
			: [
					{
						evidence: "declared",
						half: "rubric",
						path: inputs.rubric.path,
						role: "judge rubric",
						sha256: inputs.rubric.sha256,
					},
				];

	return [
		...inputs.declared.map((declaredEntry) =>
			entry(
				declaredEntry,
				observed.has(manifestEntryKey(declaredEntry))
					? "declared and observed"
					: "declared",
			),
		),
		...rubric,
		...inputs.observed.paths
			.filter((observedEntry) => !declared.has(manifestEntryKey(observedEntry)))
			.map((observedEntry) => entry(observedEntry, "observed")),
	];
}

interface StageReadManifestInputs {
	/** The stage's own skill, absent for a stage that ran without it. */
	readonly skill: string | undefined;
	readonly corpusFiles: readonly HashedFile[];
	readonly versionFiles: readonly HashedFile[];
	readonly targetFiles: readonly HashedFile[];
	readonly rubric: HashedFile | undefined;
	readonly observed: ContextManifest;
}

/** A pipeline stage or replay declares its global instructions and its skill. */
function stageReadManifest(
	inputs: StageReadManifestInputs,
): readonly ReadManifestEntry[] {
	const declared: ManifestEntry[] = [{ half: "corpus", path: "CLAUDE.md" }];
	if (inputs.skill !== undefined) {
		declared.push({ half: "corpus", path: stageSkillPath(inputs.skill) });
	}

	return readManifest({ ...inputs, declared });
}

export {
	READ_ROLES,
	readManifestSchema,
	PROJECT_INSTRUCTION_FILES,
	stageSkillPath,
	readManifest,
	stageReadManifest,
};
export type {
	ReadRole,
	ReadEvidence,
	ReadManifestEntry,
	ReadManifestInputs,
	StageReadManifestInputs,
};
