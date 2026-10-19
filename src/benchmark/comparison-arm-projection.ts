import { createHash } from "node:crypto";

import { parseCheckpointRecord } from "./checkpoint";
import type {
	ComparisonArmEvidence,
	FrozenFile,
	LoadedComparisonArmEvidence,
} from "./comparison-evidence";
import ComparisonEvidenceError from "./comparison-evidence";
import type { ParsedConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";

const CORPUS_ROOT_SEGMENT_COUNT = 1;

const EMPTY_COLLECTION_LENGTH = 0;

function sha256(bytes: Readonly<Uint8Array>): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function executedCorpusFiles(
	group: Immutable<ParsedConfirmationGroupRecord>,
): readonly FrozenFile[] {
	const corpus = group.inputs.files.filter(({ kind }) => kind === "corpus");
	if (group.mode === "pipeline" || group.mode === "session") {
		return corpus;
	}

	const [selectedStage] = group.declaredStages;

	return corpus.filter((file) => {
		const segments = file.path.replaceAll("\\", "/").split("/");
		const corpusIndex = segments.lastIndexOf("corpus");

		return segments[corpusIndex + CORPUS_ROOT_SEGMENT_COUNT] === selectedStage;
	});
}

function controlledCheckpointDigest(text: string): string {
	const checkpoint = parseCheckpointRecord(text);

	return sha256(
		new TextEncoder().encode(
			JSON.stringify({
				artifacts: checkpoint.artifacts,
				corpusFiles: checkpoint.corpusFiles,
				effort: checkpoint.effort,
				model: checkpoint.model,
				stage: checkpoint.stage,
				workflowState: checkpoint.workflowState,
			}),
		),
	);
}

function controlledSessionDigest(
	caseId: string,
	arm: Immutable<LoadedComparisonArmEvidence>,
	record: FrozenFile,
): string {
	if (arm.sessionCase === undefined) {
		throw new ComparisonEvidenceError(
			`case ${caseId} arm ${arm.role} field inputs.files[case:${record.path}]: missing parsed session case declaration`,
		);
	}
	const { corpusFiles: _corpusFiles, ...controlled } = arm.sessionCase;
	return sha256(new TextEncoder().encode(JSON.stringify(controlled)));
}

function normalizedControlledFile(
	caseId: string,
	arm: Immutable<LoadedComparisonArmEvidence>,
	file: LoadedComparisonArmEvidence["frozenFiles"][number],
): FrozenFile {
	const { record, text } = file;
	if (
		arm.group.record.mode === "pipeline" &&
		record.kind === "checkpoint" &&
		record.path.replaceAll("\\", "/").endsWith("/checkpoint.json")
	) {
		try {
			return { ...record, sha256: controlledCheckpointDigest(text) };
		} catch {
			throw new ComparisonEvidenceError(
				`case ${caseId} arm ${arm.role} field inputs.files[${record.kind}:${record.path}]: invalid pipeline checkpoint record`,
			);
		}
	}
	if (arm.group.record.mode === "session" && record.kind === "case") {
		return { ...record, sha256: controlledSessionDigest(caseId, arm, record) };
	}
	return { ...record, sha256: record.sha256 };
}

function projectArm(
	caseId: string,
	arm: Immutable<LoadedComparisonArmEvidence>,
): ComparisonArmEvidence {
	const controlledFiles = arm.frozenFiles.flatMap((file) =>
		file.record.kind === "corpus" || file.record.kind === "instructions"
			? []
			: [normalizedControlledFile(caseId, arm, file)],
	);
	const executedCorpus = executedCorpusFiles(arm.group.record);
	if (
		executedCorpus.length === EMPTY_COLLECTION_LENGTH &&
		arm.group.record.mode !== "session"
	) {
		throw new ComparisonEvidenceError(
			`case ${caseId} arm ${arm.role} field inputs.files.corpus: source group records no executed corpus`,
		);
	}
	const projected = {
		controlledFiles,
		declaredCaseId: arm.declaredCaseId,
		executedCorpus,
		group: arm.group,
		groups: [arm.group],
		reps: arm.reps,
		role: arm.role,
		sourcePaths: arm.sourcePaths,
	};
	if (arm.sessionCase === undefined) {
		return projected;
	}
	return { ...projected, sessionCase: arm.sessionCase };
}

export { EMPTY_COLLECTION_LENGTH, executedCorpusFiles, projectArm };
