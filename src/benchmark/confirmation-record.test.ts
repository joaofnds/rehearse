import { describe, expect, it } from "bun:test";

import type { ConfirmationRepRecord } from "./confirmation-record";
import { parseConfirmationRepRecord } from "./confirmation-record";
import ConfirmationRepBuilder from "./confirmation-rep-test-builder";
import type { Immutable } from "./contracts";

const GIT_SHA_HEX_CHARACTERS = 40;
const parseConfirmationRepRecordAcceptsCompleteRoleattributedEvidence =
	(): void => {
		const record = new ConfirmationRepBuilder().build();

		expect(parseConfirmationRepRecord(JSON.stringify(record))).toEqual(record);
	};
const parseConfirmationRepRecordReadsARepRecordWithoutACaseIdAsTheAuditlogCase =
	(): void => {
		const { caseId: _caseId, ...legacy } = new ConfirmationRepBuilder().build();

		expect(parseConfirmationRepRecord(JSON.stringify(legacy)).caseId).toBe(
			"audit-log",
		);
	};
const parseConfirmationRepRecordKeepsSchemaVersion1WhileCarryingTheCase =
	(): void => {
		const expectedSchemaVersion = 1;

		const parsed = parseConfirmationRepRecord(
			JSON.stringify(new ConfirmationRepBuilder().build()),
		);

		expect(parsed.schemaVersion).toBe(expectedSchemaVersion);
	};
const parseConfirmationRepRecordRejectsUnknownFields = (): void => {
	const record = { ...new ConfirmationRepBuilder().build(), extra: true };

	expect(() => parseConfirmationRepRecord(JSON.stringify(record))).toThrow();
};
const parseConfirmationRepRecordAcceptsRetainedEvidenceForAFailedFinalJudge =
	(): void => {
		const record = {
			...new ConfirmationRepBuilder().build(),
			finalOutcome: {
				error: "Judge rejected both attempts",
				evidence: {
					recordFile: "final.json",
					resultSha: "a".repeat(GIT_SHA_HEX_CHARACTERS),
				},
				status: "EXECUTION_FAILED" as const,
			},
			outcome: "UNSUCCESSFUL" as const,
		};

		expect(parseConfirmationRepRecord(JSON.stringify(record))).toEqual(record);
	};
const parseConfirmationRepRecordRejectsSuccessWhenRequiredProviderMetricsAreMissing =
	(): void => {
		const record = {
			...new ConfirmationRepBuilder().build(),
			metrics: {
				calls: [],
				missing: ["worker.inputTokens"],
				status: "MISSING",
			},
		};

		expect(() => parseConfirmationRepRecord(JSON.stringify(record))).toThrow(
			"Missing provider metrics cannot produce a successful rep",
		);
	};
const parseConfirmationRepRecordKeepsAV1StageRepParsingUnchangedBesideTheSessionMode =
	(): void => {
		const record: Immutable<ConfirmationRepRecord> = {
			...new ConfirmationRepBuilder().build(),
			finalOutcome: { status: "NOT_APPLICABLE" },
			mode: "stage",
		};

		expect(parseConfirmationRepRecord(JSON.stringify(record))).toEqual(record);
	};
const parseConfirmationRepRecordRejectsATrajectoryCountThatDiffersFromWorkerTurns =
	(): void => {
		const record = {
			...new ConfirmationRepBuilder().build(),
			workerTrajectorySteps: 4,
		};

		expect(() => parseConfirmationRepRecord(JSON.stringify(record))).toThrow(
			"Worker trajectory steps must equal provider-reported worker turns",
		);
	};
describe(parseConfirmationRepRecord.name, () => {
	describe("when reading legacy repetition records", () => {
		it(
			"accepts complete role-attributed evidence",
			parseConfirmationRepRecordAcceptsCompleteRoleattributedEvidence,
		);
		it(
			"reads a rep record without a caseId as the audit-log case",
			parseConfirmationRepRecordReadsARepRecordWithoutACaseIdAsTheAuditlogCase,
		);
		it(
			"keeps schema version 1 while carrying the case",
			parseConfirmationRepRecordKeepsSchemaVersion1WhileCarryingTheCase,
		);
		it(
			"accepts retained evidence for a failed final Judge",
			parseConfirmationRepRecordAcceptsRetainedEvidenceForAFailedFinalJudge,
		);
		it(
			"keeps a v1 stage rep parsing unchanged beside the session mode",
			parseConfirmationRepRecordKeepsAV1StageRepParsingUnchangedBesideTheSessionMode,
		);
		describe("when record evidence is invalid", () => {
			it(
				"rejects unknown fields",
				parseConfirmationRepRecordRejectsUnknownFields,
			);
			it(
				"rejects success when required provider metrics are missing",
				parseConfirmationRepRecordRejectsSuccessWhenRequiredProviderMetricsAreMissing,
			);
			it(
				"rejects a trajectory count that differs from worker turns",
				parseConfirmationRepRecordRejectsATrajectoryCountThatDiffersFromWorkerTurns,
			);
		});
	});
});
