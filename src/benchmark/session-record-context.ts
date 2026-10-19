import type { SessionCase } from "./case";
import { contextEvidenceSchema } from "./context-evidence";
import {
	corpusEntries,
	projectEntries,
	reconcileManifest,
} from "./context-manifest";
import type { ReadManifestEntry } from "./read-manifest";
import { readManifest } from "./read-manifest";
import type {
	MutableSessionAttemptRecord,
	SessionAttemptRecordInputs,
} from "./session-record-builder-contract";
import { contextManifestSchema } from "./session-record-context-schema";

function declaredSessionContext(
	sessionCase: SessionCase,
): ReturnType<typeof corpusEntries> {
	return [
		...corpusEntries(sessionCase.corpusFiles),
		...projectEntries(sessionCase.projectFiles),
	];
}

function recordedReadManifest(
	inputs: Readonly<SessionAttemptRecordInputs>,
	declared: Readonly<ReturnType<typeof declaredSessionContext>>,
): ReadManifestEntry[] {
	const { attempt } = inputs;
	return [
		...readManifest({
			corpusFiles: inputs.corpusFiles,
			declared,
			observed: {
				paths: [
					...(attempt.contextManifest?.paths ?? []),
					...projectEntries(attempt.loadedProjectInstructions ?? []),
				],
			},
			rubric: undefined,
			skill: undefined,
			targetFiles: attempt.startingProjectFiles ?? [],
			versionFiles: inputs.versionFiles,
		}),
	];
}

function recordContext(
	inputs: Readonly<SessionAttemptRecordInputs>,
	declared: Readonly<ReturnType<typeof declaredSessionContext>>,
): Pick<
	MutableSessionAttemptRecord,
	"contextEvidence" | "contextManifest" | "divergences"
> {
	const { attempt } = inputs;
	const record: Pick<
		MutableSessionAttemptRecord,
		"contextEvidence" | "contextManifest" | "divergences"
	> = {};

	if (attempt.contextEvidence !== undefined) {
		record.contextEvidence = contextEvidenceSchema.parse(
			attempt.contextEvidence,
		);
	}
	if (attempt.contextManifest !== undefined) {
		const manifest = contextManifestSchema.parse(attempt.contextManifest);
		record.contextManifest = {
			paths: manifest.paths.map((entry) => ({ ...entry })),
		};
		record.divergences = reconcileManifest(manifest, declared);
	}

	return record;
}

export { declaredSessionContext, recordedReadManifest, recordContext };
