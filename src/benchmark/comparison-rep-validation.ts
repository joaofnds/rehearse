import type { EvidenceLocation } from "./comparison-evidence-files";
import { evidenceError } from "./comparison-evidence-files";
import type {
	ParsedConfirmationGroupRecord,
	ParsedConfirmationRepRecord,
} from "./confirmation-record";
import type { Immutable } from "./contracts";

interface RepGroupEvidence {
	readonly reference: ParsedConfirmationGroupRecord["repRecords"][number];
	readonly record: Immutable<ParsedConfirmationRepRecord>;
	readonly group: Immutable<ParsedConfirmationGroupRecord>;
}

function sameValue<Value>(left: Value, right: Value): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function assertRepMatchesGroup(
	location: Readonly<EvidenceLocation>,
	evidence: RepGroupEvidence,
): void {
	assertRepIdentity(location, evidence);
	assertRepStageContract(location, evidence);
}

function assertRepIdentity(
	location: Readonly<EvidenceLocation>,
	{ reference, record, group }: RepGroupEvidence,
): void {
	if (record.groupId !== group.groupId) {
		throw evidenceError(
			{ ...location, field: `${location.field}.groupId` },
			"rep group ID disagrees with its source group",
		);
	}
	if (record.repId !== reference.repId) {
		throw evidenceError(
			{ ...location, field: `${location.field}.repId` },
			"rep ID disagrees with its source group reference",
		);
	}
	if (record.ordinal !== reference.ordinal) {
		throw evidenceError(
			{ ...location, field: `${location.field}.ordinal` },
			"rep ordinal disagrees with its source group reference",
		);
	}
}

function assertRepStageContract(
	location: Readonly<EvidenceLocation>,
	evidence: RepGroupEvidence,
): void {
	assertRepLineage(location, evidence);
	assertRepStages(location, evidence);
}

function assertRepLineage(
	location: Readonly<EvidenceLocation>,
	{ record, group }: RepGroupEvidence,
): void {
	if (record.mode !== group.mode) {
		throw evidenceError(
			{ ...location, field: `${location.field}.mode` },
			"rep mode disagrees with its source group",
		);
	}
	if (!sameValue(record.lineage, group.inputs.lineage)) {
		throw evidenceError(
			{ ...location, field: `${location.field}.lineage` },
			"rep lineage disagrees with its source group",
		);
	}
}

function assertRepStages(
	location: Readonly<EvidenceLocation>,
	{ record, group }: RepGroupEvidence,
): void {
	const repStages = record.stages.map(({ stage }) => stage);
	if (!sameValue(repStages, group.declaredStages)) {
		throw evidenceError(
			{ ...location, field: `${location.field}.stages` },
			"rep stages disagree with its source group",
		);
	}
	if (
		(group.mode === "stage" || group.mode === "session") &&
		record.finalOutcome.status !== "NOT_APPLICABLE"
	) {
		throw evidenceError(
			{ ...location, field: `${location.field}.finalOutcome` },
			`${group.mode} rep final outcome must be not applicable`,
		);
	}
	if (
		group.mode === "pipeline" &&
		record.finalOutcome.status === "NOT_APPLICABLE"
	) {
		throw evidenceError(
			{ ...location, field: `${location.field}.finalOutcome` },
			"pipeline rep final outcome cannot be not applicable",
		);
	}
}

export { assertRepMatchesGroup, sameValue };
