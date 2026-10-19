import type { LoadArmRequest } from "./comparison-evidence-files";
import { evidenceError } from "./comparison-evidence-files";
import { sameValue } from "./comparison-rep-validation";
import type {
	SessionAttemptDefinition,
	SessionAttemptEvidence,
} from "./comparison-session-attempt-contract";
import sessionFrozenPath from "./comparison-session-frozen-paths";

function assertSessionAttemptInputs(
	request: Readonly<LoadArmRequest>,
	evidence: SessionAttemptEvidence,
	definition: SessionAttemptDefinition,
): void {
	assertSessionAttemptIdentity(request, evidence, definition);
	assertSessionAttemptExecution(request, evidence, definition);
	assertSessionAttemptCorpus(request, evidence, definition);
}

function assertSessionAttemptIdentity(
	request: Readonly<LoadArmRequest>,
	{ group, rep, attempt }: SessionAttemptEvidence,
	{ sessionCase, field }: SessionAttemptDefinition,
): void {
	if (rep.caseId !== sessionCase.id) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.caseId` },
			"rep case ID disagrees with the frozen session case",
		);
	}
	if (attempt.caseId !== sessionCase.id) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.caseId` },
			"attempt case ID disagrees with the frozen session case",
		);
	}
	if (
		attempt.lineage !== rep.lineage.lineage ||
		attempt.lineage !== group.inputs.lineage.lineage
	) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.lineage` },
			"attempt lineage disagrees with its rep and source group",
		);
	}
}

function assertSessionAttemptExecution(
	request: Readonly<LoadArmRequest>,
	{ group, attempt }: SessionAttemptEvidence,
	{ sessionCase, field }: SessionAttemptDefinition,
): void {
	if (attempt.model !== group.inputs.model) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.model` },
			"attempt model disagrees with the frozen session inputs",
		);
	}
	if (sessionCase.model !== undefined && attempt.model !== sessionCase.model) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.model` },
			"attempt model disagrees with the frozen session case",
		);
	}
	if (attempt.effort !== group.inputs.effort) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.effort` },
			"attempt effort disagrees with the frozen session inputs",
		);
	}
	if (attempt.sessionBudgetUsd !== group.inputs.sessionBudgetUsd) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `${field}.sessionBudgetUsd`,
			},
			"attempt budget disagrees with the frozen session inputs",
		);
	}
	if (attempt.prompt !== sessionCase.prompt) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.prompt` },
			"attempt prompt disagrees with the frozen session case",
		);
	}
}

function assertSessionAttemptCorpus(
	request: Readonly<LoadArmRequest>,
	{ attempt }: SessionAttemptEvidence,
	{ sessionCase, frozenCorpus, field }: SessionAttemptDefinition,
): void {
	const expectedCorpus = frozenCorpus
		.map((file) => ({
			path: sessionFrozenPath(request, file),
			sha256: file.sha256,
		}))
		.filter(({ path }) => sessionCase.corpusFiles.includes(path))
		.toSorted((left, right) => left.path.localeCompare(right.path));
	const actualCorpus = attempt.corpusFiles
		.map(({ path: corpusPath, sha256: fileSha256 }) => ({
			path: corpusPath,
			sha256: fileSha256,
		}))
		.toSorted((left, right) => left.path.localeCompare(right.path));
	if (!sameValue(expectedCorpus, actualCorpus)) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `${field}.corpusFiles`,
			},
			"attempt corpus files disagree with the frozen session inputs",
		);
	}
}

export { assertSessionAttemptInputs as default };
