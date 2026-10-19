import { dirname, relative, resolve } from "node:path";

import type { SessionCaseDeclaration } from "./case";
import type { DigestedComparisonRep, FrozenFile } from "./comparison-evidence";
import type { EvidenceFile, LoadArmRequest } from "./comparison-evidence-files";
import {
	descendantPath,
	evidenceError,
	readEvidenceFile,
} from "./comparison-evidence-files";
import { assertRepMatchesGroup } from "./comparison-rep-validation";
import type { SessionGroupRecord } from "./comparison-session-attempt-contract";
import loadSessionRep from "./comparison-session-rep";
import loadStageScorecards from "./comparison-stage-scorecards";
import type {
	ParsedConfirmationGroupRecord,
	ParsedConfirmationRepRecord,
} from "./confirmation-record";
import {
	SESSION_CONFIRMATION_SCHEMA_VERSION,
	parseConfirmationRepRecord,
} from "./confirmation-record";
import type { Immutable } from "./contracts";

interface GroupEvidence {
	readonly groupPath: string;
	readonly group: Immutable<ParsedConfirmationGroupRecord>;
}

interface SessionGroupInputs {
	readonly sessionCase: Immutable<SessionCaseDeclaration> | undefined;
	readonly frozenCorpus: readonly FrozenFile[];
}

interface ComparisonRepLocation {
	readonly request: Readonly<LoadArmRequest>;
	readonly group: Immutable<ParsedConfirmationGroupRecord>;
	readonly reference: Immutable<
		ParsedConfirmationGroupRecord["repRecords"][number]
	>;
	readonly index: number;
	readonly groupPath: string;
	readonly inputs: SessionGroupInputs;
}

interface LoadedRepRecord {
	readonly path: string;
	readonly field: string;
	readonly source: Readonly<EvidenceFile>;
	readonly record: Immutable<ParsedConfirmationRepRecord>;
}

async function loadRepRecords(
	request: Readonly<LoadArmRequest>,
	{ groupPath, group }: GroupEvidence,
	inputs: SessionGroupInputs,
): Promise<readonly DigestedComparisonRep[]> {
	const reps: DigestedComparisonRep[] = [];
	await Array.fromAsync(
		group.repRecords.entries(),
		async ([index, reference]) => {
			reps.push(
				await loadRepEvidence({
					group,
					groupPath,
					index,
					inputs,
					reference,
					request,
				}),
			);
		},
	);
	return reps;
}

function readConfirmationRep(
	request: Readonly<LoadArmRequest>,
	source: Readonly<EvidenceFile>,
	field: string,
): Immutable<ParsedConfirmationRepRecord> {
	try {
		return parseConfirmationRepRecord(source.text);
	} catch {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `${field}.record`,
			},
			"invalid confirmation rep record",
		);
	}
}

async function readRepEvidence(
	input: ComparisonRepLocation,
): Promise<LoadedRepRecord> {
	const { request, group, reference, index, groupPath } = input;
	const field = `repRecords[${index}]`;
	const path =
		group.mode === "session"
			? descendantPath(request, {
					field: `${field}.path`,
					path: reference.path,
					root: dirname(groupPath),
				})
			: resolve(dirname(groupPath), reference.path);
	const source = await readEvidenceFile({
		arm: request.role,
		caseId: request.caseId,
		field: `${field}.path`,
		path,
	});
	const record = readConfirmationRep(request, source, field);
	return { field, path, record, source };
}

async function loadSessionRepEvidence(
	input: ComparisonRepLocation,
	loaded: LoadedRepRecord,
): Promise<DigestedComparisonRep> {
	const {
		request,
		reference,
		inputs: { sessionCase, frozenCorpus },
	} = input;
	const { field, path, record, source } = loaded;
	const group = comparableSessionGroup(request, input.group, field);
	if (
		record.schemaVersion !== SESSION_CONFIRMATION_SCHEMA_VERSION ||
		record.mode !== "session"
	) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `${field}.mode`,
			},
			"session comparison requires a version-2 session rep",
		);
	}
	if (sessionCase === undefined) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `${field}.case`,
			},
			"session rep has no frozen session case declaration",
		);
	}
	return await loadSessionRep({
		field,
		frozenCorpus,
		group,
		path,
		record,
		reference,
		request,
		sessionCase,
		source,
	});
}

async function loadRepEvidence(
	input: ComparisonRepLocation,
): Promise<DigestedComparisonRep> {
	const { request, group, reference } = input;
	const loaded = await readRepEvidence(input);
	const { field, path, record, source } = loaded;
	if (group.mode === "session") {
		return await loadSessionRepEvidence(input, loaded);
	}
	assertRepMatchesGroup(
		{ arm: request.role, caseId: request.caseId, field },
		{ group, record, reference },
	);
	const digested = {
		canonicalPath: source.canonicalPath,
		path: relative(request.manifestDirectory, path),
		record,
		sha256: source.sha256,
	};
	return group.mode === "stage" || group.mode === "pipeline"
		? {
				...digested,
				scorecards: await loadStageScorecards(request, record, {
					field,
					repPath: path,
				}),
			}
		: digested;
}

function comparableSessionGroup(
	request: Readonly<LoadArmRequest>,
	group: Immutable<ParsedConfirmationGroupRecord>,
	field: string,
): Immutable<SessionGroupRecord> {
	if (group.schemaVersion !== SESSION_CONFIRMATION_SCHEMA_VERSION) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `${field}.mode`,
			},
			"legacy session confirmation groups are not comparable; rerun with session evidence",
		);
	}
	return group;
}

export { loadRepRecords as default };
