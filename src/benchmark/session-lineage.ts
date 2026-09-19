import { createHash } from "node:crypto";
import type { SessionCase } from "./case";
import { hashDirectory, lineageKey } from "./checkpoint";
import type { SessionSettings } from "./claude";
import type { ResolvedCorpusFile } from "./corpus-file";
import type { JsonValue } from "./json-value";
import { jsonArraySchema, jsonObjectSchema } from "./json-value";

/**
 * `lineageKey` hashes upstream, corpus files, model, effort, and a stage
 * checkpoint's settings file; nothing else may enter that object. A session
 * case has no settings file of its own — that surface is ACT-37's, for stage
 * checkpoints only — so it never sets that field and always hashes it as
 * absent. Everything else frozen about a session attempt that is not corpus
 * — the transcript digest, the fixture tree, the prompt, the tool and
 * settings overlays, and the declared project files — is hashed into the one
 * upstream string, so a corpus edit still invalidates through corpusFiles.
 * `projectFiles` names which of the fixture's own bytes the manifest checks
 * against, a fact the fixture's byte hash alone does not carry: two cases
 * sharing one fixture tree but declaring a different project file are
 * checked against a different contract and must not share a lineage.
 *
 * `stateCheck` is the grading definition for the files and git state a
 * session leaves. It is hashed here because nothing else covers it: the
 * fixture hash walks `fixturePath`, which is the fixture subdirectory and not
 * the case directory, so a scorer declared anywhere but inside the fixture
 * would be graded as the original definition after an edit. The key is left
 * out entirely when a case declares no scorer, so every case recorded before
 * state grading existed keeps the lineage it already has and stays comparable
 * with its own history.
 */
export async function sessionUpstreamDigest(
	sessionCase: SessionCase,
): Promise<string> {
	const { declaration, fixturePath } = sessionCase;

	const hashed = {
		transcript: declaration.transcript?.sha256 ?? null,
		fixture:
			fixturePath === undefined
				? null
				: await hashDirectory(fixturePath, "", { rootMayBeALink: false }),
		prompt: sessionCase.prompt,
		tools: sessionCase.tools,
		settings: canonicalSettings(sessionCase) ?? null,
		agents: sessionCase.agents ?? null,
		projectFiles: sessionCase.projectFiles,
	};

	return createHash("sha256")
		.update(
			JSON.stringify(
				sessionCase.stateCheck === undefined
					? hashed
					: { ...hashed, stateCheck: sessionCase.stateCheck },
			),
		)
		.digest("hex");
}

/**
 * A settings block written in another key order is the same settings, so the
 * digest must not change with it. Every nesting level is ordered, because a
 * permission grant sits at `permissions.allow` and an arm that may edit files
 * must not share an identity with one that may not. An array keeps its order,
 * since order is meaning there. `JsonValue` carries no discriminant, so which
 * member a value is comes from parsing it rather than from a `typeof` on its
 * representation.
 */
function orderedForHashing(value: JsonValue): JsonValue {
	const array = jsonArraySchema.safeParse(value);
	if (array.success) {
		return array.data.map((element) => orderedForHashing(element));
	}

	const object = jsonObjectSchema.safeParse(value);
	if (!object.success) {
		return value;
	}

	return Object.fromEntries(
		Object.entries(object.data)
			.toSorted(([left], [right]) => left.localeCompare(right))
			.map(([key, nested]) => [key, orderedForHashing(nested)]),
	);
}

/**
 * The identity of an arm's behavior settings, recorded beside the corpus
 * digests. `sessionUpstreamDigest` already folds the settings into lineage, so
 * two arms differing only here are already refused as incomparable; what that
 * digest cannot do is say *which* input differed, because it hashes the prompt,
 * tools, fixture and agents into one string. Settings are the one declared
 * input with no per-file digest of its own, so without this an operator reading
 * two records sees the lineage differ and nothing that names the reason.
 */
export function sessionSettingsDigest(
	sessionCase: SessionCase,
): string | undefined {
	const settings = canonicalSettings(sessionCase);

	return settings === undefined
		? undefined
		: createHash("sha256").update(JSON.stringify(settings)).digest("hex");
}

/**
 * The one reading of "the settings this case declared", so the lineage key and
 * the recorded digest cannot disagree about whether two arms are the same. They
 * did: lineage hashed the declaration order and the digest hashed the canonical
 * order, so two arms differing only in key order were refused as incomparable
 * while the digest naming the differing input reported them identical.
 */
function canonicalSettings(sessionCase: SessionCase): JsonValue | undefined {
	return sessionCase.settings === undefined
		? undefined
		: orderedForHashing(sessionCase.settings);
}

export async function sessionLineage(
	sessionCase: SessionCase,
	corpusFiles: readonly ResolvedCorpusFile[],
	settings: SessionSettings,
): Promise<string> {
	return lineageKey({
		upstream: await sessionUpstreamDigest(sessionCase),
		corpusFiles: corpusFiles.map(({ path, sha256 }) => ({ path, sha256 })),
		model: settings.model,
		effort: settings.effort,
	});
}
