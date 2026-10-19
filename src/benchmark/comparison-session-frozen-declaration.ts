import type { SessionCaseDeclaration } from "./case";
import type { LoadedFrozenFile } from "./comparison-evidence";
import type { LoadArmRequest } from "./comparison-evidence-files";
import { evidenceError } from "./comparison-evidence-files";
import sessionFrozenPath from "./comparison-session-frozen-paths";
import type { ParsedConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import { deliversCorpusFile } from "./session-corpus";

function assertSessionCorpusFiles(
	request: Readonly<LoadArmRequest>,
	sessionCase: Immutable<SessionCaseDeclaration>,
	files: readonly LoadedFrozenFile[],
): readonly LoadedFrozenFile[] {
	const corpusFiles = files.filter(({ record }) => record.kind === "corpus");
	const frozenCorpusPaths = corpusFiles.map(({ record }) =>
		sessionFrozenPath(request, record),
	);
	const declaredMissing = sessionCase.corpusFiles.some(
		(path) => !frozenCorpusPaths.includes(path),
	);
	const undelivered = frozenCorpusPaths.some(
		(path) => !deliversCorpusFile(sessionCase.corpusFiles, path),
	);
	const duplicated =
		new Set(frozenCorpusPaths).size !== frozenCorpusPaths.length;
	if (declaredMissing || undelivered || duplicated) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: "inputs.files.corpus",
			},
			"frozen corpus paths disagree with the session case declaration",
		);
	}
	return corpusFiles;
}

function assertSessionGroupExecution(
	request: Readonly<LoadArmRequest>,
	sessionCase: Immutable<SessionCaseDeclaration>,
	group: Immutable<ParsedConfirmationGroupRecord>,
): void {
	if (
		sessionCase.model !== undefined &&
		group.inputs.model !== sessionCase.model
	) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: "inputs.model" },
			`recorded ${group.inputs.model} but the session case declares ${sessionCase.model}`,
		);
	}
	if (
		sessionCase.sessionBudgetUsd !== undefined &&
		group.inputs.sessionBudgetUsd !== sessionCase.sessionBudgetUsd
	) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: "inputs.sessionBudgetUsd",
			},
			"group budget disagrees with the session case declaration",
		);
	}
}

export { assertSessionCorpusFiles, assertSessionGroupExecution };
