import { dirname, relative } from "node:path";

import type { SessionCaseDeclaration } from "./case";
import type { DigestedComparisonRep, FrozenFile } from "./comparison-evidence";
import type { EvidenceFile, LoadArmRequest } from "./comparison-evidence-files";
import {
	descendantPath,
	evidenceError,
	readEvidenceFile,
} from "./comparison-evidence-files";
import { assertRepMatchesGroup } from "./comparison-rep-validation";
import type {
	SessionGroupRecord,
	SessionRepRecord,
} from "./comparison-session-attempt-contract";
import assertSessionAttempt from "./comparison-session-attempt-validation";
import type { Immutable } from "./contracts";
import type { SessionAttemptRecord } from "./session-record";
import { parseSessionAttemptRecord } from "./session-record";

const SESSION_ONLY_STAGE_INDEX = 0;

interface LoadSessionRepRequest {
	readonly request: Readonly<LoadArmRequest>;
	readonly group: Immutable<SessionGroupRecord>;
	readonly reference: Immutable<SessionGroupRecord["repRecords"][number]>;
	readonly record: Immutable<SessionRepRecord>;
	readonly source: Readonly<EvidenceFile>;
	readonly sessionCase: Immutable<SessionCaseDeclaration>;
	readonly frozenCorpus: readonly FrozenFile[];
	readonly field: string;
	readonly path: string;
}

async function loadSessionRep(
	input: Readonly<LoadSessionRepRequest>,
): Promise<DigestedComparisonRep> {
	const { request, group, reference, record, source, field, path } = input;
	assertRepMatchesGroup(
		{ arm: request.role, caseId: request.caseId, field },
		{ group, record, reference },
	);
	const attempt = await loadSessionAttempt(input);
	return {
		attempt,
		canonicalPath: source.canonicalPath,
		path: relative(request.manifestDirectory, path),
		record,
		sha256: source.sha256,
	};
}

function readSessionAttempt(
	request: Readonly<LoadArmRequest>,
	attemptSource: Readonly<EvidenceFile>,
	field: string,
): Immutable<SessionAttemptRecord> {
	try {
		return parseSessionAttemptRecord(attemptSource.text);
	} catch {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `${field}.attempt.record`,
			},
			"invalid session attempt record",
		);
	}
}

async function loadSessionAttempt(
	input: Readonly<LoadSessionRepRequest>,
): Promise<NonNullable<DigestedComparisonRep["attempt"]>> {
	const { request, record, field } = input;
	const attemptPath = sessionAttemptPath(input);
	const attemptSource = await readEvidenceFile({
		arm: request.role,
		caseId: request.caseId,
		field: `${field}.attempt.path`,
		path: attemptPath,
	});
	const attempt = readSessionAttempt(request, attemptSource, field);
	assertSessionAttempt(
		request,
		{ attempt, group: input.group, rep: record },
		{ field, frozenCorpus: input.frozenCorpus, sessionCase: input.sessionCase },
	);
	return {
		canonicalPath: attemptSource.canonicalPath,
		path: relative(request.manifestDirectory, attemptPath),
		record: attempt,
		sha256: attemptSource.sha256,
	};
}

function sessionAttemptPath(input: Readonly<LoadSessionRepRequest>): string {
	const { request, record, path, field } = input;
	const evidence = record.stages[SESSION_ONLY_STAGE_INDEX]?.evidence;
	if (evidence === undefined) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `${field}.evidence`,
			},
			"session rep has no attempt evidence",
		);
	}
	if (evidence.recordFile !== "attempt.json") {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `${field}.attempt.path`,
			},
			"session attempt evidence must be the producer's attempt.json file",
		);
	}
	return descendantPath(request, {
		field: `${field}.attempt.path`,
		path: evidence.recordFile,
		root: dirname(path),
	});
}

export { loadSessionRep as default };
