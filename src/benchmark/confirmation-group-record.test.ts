import { describe, expect, it } from "bun:test";

import ConfirmationGroupBuilder from "./confirmation-group-test-builder";
import type { ConfirmationGroupRecord } from "./confirmation-record";
import { parseConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import SessionConfirmationGroupBuilder from "./session-confirmation-group-test-builder";

const OMITTED_INITIAL_REP_COUNT = 1;

const parseConfirmationGroupRecordAcceptsOneFrozenGroupEnvelopeWithEveryRepReference =
	(): void => {
		const record = new ConfirmationGroupBuilder().build();

		expect(parseConfirmationGroupRecord(JSON.stringify(record))).toEqual(
			record,
		);
	};
const parseConfirmationGroupRecordReadsAGroupRecordWithoutACaseIdAsTheAuditlogCase =
	(): void => {
		const { caseId: _caseId, ...legacy } =
			new ConfirmationGroupBuilder().build();

		expect(parseConfirmationGroupRecord(JSON.stringify(legacy)).caseId).toBe(
			"audit-log",
		);
	};
const parseConfirmationGroupRecordKeepsSchemaVersion1WhileCarryingTheCase =
	(): void => {
		const expectedSchemaVersion = 1;

		const parsed = parseConfirmationGroupRecord(
			JSON.stringify(new ConfirmationGroupBuilder().build()),
		);

		expect(parsed.schemaVersion).toBe(expectedSchemaVersion);
	};
const parseConfirmationGroupRecordAcceptsASessionGroupAtSchemaVersion1WithChecksAsItsOneStage =
	(): void => {
		const record: Immutable<ConfirmationGroupRecord> = {
			...new ConfirmationGroupBuilder().build(),
			caseId: "smoke",
			declaredStages: ["checks"],
			mode: "session",
			projectedCost: { perRepMaximumUsd: 0.2, reps: 2, totalMaximumUsd: 0.4 },
		};

		expect(parseConfirmationGroupRecord(JSON.stringify(record))).toEqual(
			record,
		);
	};
const parseConfirmationGroupRecordKeepsAV1StageGroupParsingUnchangedBesideTheSessionMode =
	(): void => {
		const record = new ConfirmationGroupBuilder().build();

		expect(parseConfirmationGroupRecord(JSON.stringify(record))).toEqual(
			record,
		);
	};
const parseConfirmationGroupRecordRejectsAGroupMissingARequestedRepRecord =
	(): void => {
		const record = {
			...new ConfirmationGroupBuilder().build(),
			repRecords: new ConfirmationGroupBuilder()
				.build()
				.repRecords.slice(OMITTED_INITIAL_REP_COUNT),
		};

		expect(() => parseConfirmationGroupRecord(JSON.stringify(record))).toThrow(
			"Group must reference every requested rep exactly once",
		);
	};
const parseConfirmationGroupRecordRejectsAV2SessionProjectionWhoseTotalOmitsPartOfTheCommand =
	(): void => {
		const record = new SessionConfirmationGroupBuilder().build();

		expect(() =>
			parseConfirmationGroupRecord(
				JSON.stringify({
					...record,
					projectedCost: { ...record.projectedCost, totalMaximumUsd: 0.4 },
				}),
			),
		).toThrow(
			"Session projected total must equal preflight plus every rep maximum",
		);
	};
function acceptsGroupApprovalMethod(
	method: ConfirmationGroupRecord["approval"]["method"],
): void {
	const pipeline = {
		...new ConfirmationGroupBuilder().build(),
		approval: { approved: true, method },
	};
	const session = {
		...new SessionConfirmationGroupBuilder().build(),
		approval: { approved: true, method },
	};

	expect(
		parseConfirmationGroupRecord(JSON.stringify(pipeline)).approval.method,
	).toBe(method);
	expect(
		parseConfirmationGroupRecord(JSON.stringify(session)).approval.method,
	).toBe(method);
}
describe(parseConfirmationGroupRecord.name, () => {
	describe("when reading group records", () => {
		it(
			"accepts one frozen group envelope with every rep reference",
			parseConfirmationGroupRecordAcceptsOneFrozenGroupEnvelopeWithEveryRepReference,
		);
		it.each(["interactive", "yes", "browser"] as const)(
			"accepts a group approved by the %s method",
			acceptsGroupApprovalMethod,
		);
		it(
			"reads a group record without a caseId as the audit-log case",
			parseConfirmationGroupRecordReadsAGroupRecordWithoutACaseIdAsTheAuditlogCase,
		);
		it(
			"keeps schema version 1 while carrying the case",
			parseConfirmationGroupRecordKeepsSchemaVersion1WhileCarryingTheCase,
		);
		it(
			"accepts a session group at schema version 1, with checks as its one stage",
			parseConfirmationGroupRecordAcceptsASessionGroupAtSchemaVersion1WithChecksAsItsOneStage,
		);
		it(
			"keeps a v1 stage group parsing unchanged beside the session mode",
			parseConfirmationGroupRecordKeepsAV1StageGroupParsingUnchangedBesideTheSessionMode,
		);
		describe("when record evidence is invalid", () => {
			it(
				"rejects a group missing a requested rep record",
				parseConfirmationGroupRecordRejectsAGroupMissingARequestedRepRecord,
			);
			it(
				"rejects a v2 session projection whose total omits part of the command",
				parseConfirmationGroupRecordRejectsAV2SessionProjectionWhoseTotalOmitsPartOfTheCommand,
			);
		});
	});
});
