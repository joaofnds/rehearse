import { basename } from "node:path";
import { z } from "zod";
import type { HashedFile } from "./checkpoint";
import type { ContextManifest, ManifestEntry } from "./context-manifest";
import type { Immutable } from "./contracts";

export const READ_ROLES = [
	"global instructions",
	"project instructions",
	"stage skill",
	"judge rubric",
	"read for context",
] as const;

export type ReadRole = (typeof READ_ROLES)[number];

export type ReadEvidence = ReadManifestEntry["evidence"];

const readManifestEntrySchema = z
	.object({
		path: z.string().min(1),
		half: z.enum(["corpus", "project", "rubric"]),
		role: z.enum(READ_ROLES),
		evidence: z.enum(["declared", "observed", "declared and observed"]),
		sha256: z
			.string()
			.regex(/^[0-9a-f]{64}$/u)
			.optional(),
	})
	.strict();

export const readManifestSchema = z.array(readManifestEntrySchema);

export type ReadManifestEntry = Immutable<
	z.infer<typeof readManifestEntrySchema>
>;

export const PROJECT_INSTRUCTION_FILES: readonly string[] = [
	"CLAUDE.md",
	"AGENTS.md",
];

export function stageSkillPath(skill: string): string {
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

export interface ReadManifestInputs {
	/** The stage skill, when the record ran one. */
	readonly skill: string | undefined;
	/** Corpus files as the record's corpus resolved them at its start. */
	readonly corpusFiles: readonly HashedFile[];
	/** Target files as the record's starting checkpoint held them. */
	readonly targetFiles: readonly HashedFile[];
	/** Corpus files the record declares it reads, beside the stage skill. */
	readonly declared: readonly ManifestEntry[];
	readonly rubric: HashedFile | undefined;
	readonly observed: ContextManifest;
}

/**
 * What one record declared and was observed to read. A load the transcript
 * does not show is not proof the record never read the file (GLOSSARY Context
 * manifest), so an entry only ever adds a file, never rules one out.
 */
export function readManifest(
	inputs: ReadManifestInputs,
): readonly ReadManifestEntry[] {
	const key = (entry: ManifestEntry): string => `${entry.half}:${entry.path}`;
	const observed = new Set(inputs.observed.paths.map(key));
	const declared = new Set(inputs.declared.map(key));

	const entry = (
		manifestEntry: ManifestEntry,
		evidence: ReadEvidence,
	): ReadManifestEntry => ({
		path: manifestEntry.path,
		half: manifestEntry.half,
		role: role(manifestEntry, inputs.skill),
		evidence,
		...hashOf(
			manifestEntry.half === "corpus" ? inputs.corpusFiles : inputs.targetFiles,
			manifestEntry.path,
		),
	});

	const rubric: readonly ReadManifestEntry[] =
		inputs.rubric === undefined
			? []
			: [
					{
						path: inputs.rubric.path,
						half: "rubric",
						role: "judge rubric",
						evidence: "declared",
						sha256: inputs.rubric.sha256,
					},
				];

	return [
		...inputs.declared.map((declaredEntry) =>
			entry(
				declaredEntry,
				observed.has(key(declaredEntry)) ? "declared and observed" : "declared",
			),
		),
		...rubric,
		...inputs.observed.paths
			.filter((observedEntry) => !declared.has(key(observedEntry)))
			.map((observedEntry) => entry(observedEntry, "observed")),
	];
}

export interface StageReadManifestInputs {
	readonly skill: string;
	readonly corpusFiles: readonly HashedFile[];
	readonly targetFiles: readonly HashedFile[];
	readonly rubric: HashedFile | undefined;
	readonly observed: ContextManifest;
}

/** A pipeline stage or replay declares its global instructions and its skill. */
export function stageReadManifest(
	inputs: StageReadManifestInputs,
): readonly ReadManifestEntry[] {
	return readManifest({
		...inputs,
		declared: [
			{ path: "CLAUDE.md", half: "corpus" },
			{ path: stageSkillPath(inputs.skill), half: "corpus" },
		],
	});
}
