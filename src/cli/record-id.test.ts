import { describe, expect, it } from "bun:test";

import { UsageError } from "#cli/commands";
import { formatRecordId, parseRecordId } from "#cli/record-id";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

const EVERY_FORM = [
	"case:audit-log",
	"run:2026-09-03T00-00-00.000Z",
	"checkpoint:2026-09-03T00-00-00.000Z/build",
	"attempt:session:smoke/fa239c6c-6389-4999-b2f1-90708471af9d",
	"attempt:stage:cafe1234/2026-09-03T00-00-00.000Z",
	"group:group-1",
	"rep:stage:group-1/group-1-rep-2/build",
	"rep:session:group-1/group-1-rep-2",
	`comparison:${"a".repeat(SHA256_HEX_DIGITS)}`,
];

function readsACheckpointIdAsTheRunAndThe(): void {
	const id = parseRecordId("checkpoint:2026-09-03T00-00-00.000Z/build");

	expect(id).toEqual({
		kind: "checkpoint",
		run: "2026-09-03T00-00-00.000Z",
		stage: "build",
	});
}

function readsASessionAttemptIdAsTheCaseAnd(): void {
	const id = parseRecordId(
		"attempt:session:smoke/fa239c6c-6389-4999-b2f1-90708471af9d",
	);

	expect(id).toEqual({
		caseId: "smoke",
		kind: "attempt:session",
		uuid: "fa239c6c-6389-4999-b2f1-90708471af9d",
	});
}

function readsAStageAttemptIdAsTheLineageAnd(): void {
	const id = parseRecordId("attempt:stage:cafe1234/2026-09-03T00-00-00.000Z");

	expect(id).toEqual({
		kind: "attempt:stage",
		lineage: "cafe1234",
		timestamp: "2026-09-03T00-00-00.000Z",
	});
}

function readsARepStageIdAsTheGroupThe(): void {
	const id = parseRecordId("rep:stage:group-1/group-1-rep-2/build");

	expect(id).toEqual({
		groupId: "group-1",
		kind: "rep:stage",
		repId: "group-1-rep-2",
		stage: "build",
	});
}

function readsARepSessionIdAsTheGroupAnd(): void {
	const id = parseRecordId("rep:session:group-1/group-1-rep-2");

	expect(id).toEqual({
		groupId: "group-1",
		kind: "rep:session",
		repId: "group-1-rep-2",
	});
}

function refusesItAsAUsageErrorNamingEveryId(): void {
	expect(() => parseRecordId("nonsense")).toThrow(UsageError);
	expect(() => parseRecordId("nonsense")).toThrow(
		/case:<id>.*run:<name>.*checkpoint:<run>\/<stage>/u,
	);
}

function acceptsTheCaseIdsThisRepositoryDeclares(): void {
	expect(parseRecordId("case:audit-log")).toEqual({
		caseId: "audit-log",
		kind: "case",
	});
}

function namesTheFormThatPrefixTakes(): void {
	expect(() => parseRecordId("checkpoint:only-one-part")).toThrow(
		/checkpoint:<run>\/<stage>/u,
	);
}

function refusesAnAttemptIdThatNamesNoAttemptKind(): void {
	expect(() => parseRecordId("attempt:cafe1234/2026-09-03")).toThrow(
		/attempt:session:<case>\/<uuid>/u,
	);
}

function refusesARepIdThatNamesNoRepKind(): void {
	expect(() => parseRecordId("rep:group-1/group-1-rep-2")).toThrow(
		/rep:stage:<group-id>\/<rep-id>\/<stage>/u,
	);
}

function namesTheThreeSegmentsARepStageIdTakes(): void {
	expect(() => parseRecordId("rep:stage:group-1/group-1-rep-2")).toThrow(
		/rep:stage:<group-id>\/<rep-id>\/<stage>/u,
	);
}

function refusesAPrefixWithAnEmptyBody(): void {
	expect(() => parseRecordId("run:")).toThrow(/run:<name>/u);
}

const refusesSAsAUsageErrorExamples = [
	"run:../../../etc/passwd",
	"group:../../../../etc/passwd",
	"case:../audit-log",
	"comparison:..",
	"checkpoint:../run/build",
	"checkpoint:run/../build",
	"attempt:session:../smoke/uuid",
	"attempt:stage:lineage/..",
	"rep:stage:../rep/build",
	"rep:stage:group/../build",
	"rep:stage:group/rep/..",
	"rep:session:group/..",
];

function whenTheRecordIdIsWellformedCases(): void {
	it(
		"reads a checkpoint id as the run and the stage it names",
		readsACheckpointIdAsTheRunAndThe,
	);
	it(
		"reads a session attempt id as the case and the uuid it names",
		readsASessionAttemptIdAsTheCaseAnd,
	);
	it(
		"reads a stage attempt id as the lineage and the timestamp it names",
		readsAStageAttemptIdAsTheLineageAnd,
	);
	it(
		"reads a rep stage id as the group, the rep and the stage it names",
		readsARepStageIdAsTheGroupThe,
	);
	it(
		"reads a rep session id as the group and the rep it names",
		readsARepSessionIdAsTheGroupAnd,
	);
	it.each(EVERY_FORM)("round-trips %s through its parsed value", (text) => {
		expect(formatRecordId(parseRecordId(text))).toBe(text);
	});
	it(
		"accepts the case ids this repository declares",
		acceptsTheCaseIdsThisRepositoryDeclares,
	);
}

function whenTheTextNamesNoKnownPrefixCases(): void {
	it(
		"refuses it as a usage error naming every id form",
		refusesItAsAUsageErrorNamingEveryId,
	);
}

function whenASegmentWouldNameAPathOutsideTheRunsDirectoryCases(): void {
	it.each(refusesSAsAUsageErrorExamples)(
		"refuses %s as a usage error",
		(text) => {
			expect(() => parseRecordId(text)).toThrow(UsageError);
		},
	);
	it.each([
		"run:../../etc/passwd",
		"checkpoint:a/..",
		"attempt:session:smoke/..",
	])("reports %s as the user typed it", (text) => {
		expect(() => parseRecordId(text)).toThrow(
			`Record id ${text} names a path outside the runs directory`,
		);
	});
}

function whenACaseIdIsNotACaseIdCases(): void {
	it.each(["case:Some Weird Name", "case:UPPER", "case:-leading-dash"])(
		"refuses %s the way case show refuses the same mistake",
		(text) => {
			expect(() => parseRecordId(text)).toThrow(UsageError);
			expect(() => parseRecordId(text)).toThrow(
				/lowercase letters, digits, or dashes/u,
			);
		},
	);
}

function whenAKnownPrefixCarriesTheWrongBodyCases(): void {
	it("names the form that prefix takes", namesTheFormThatPrefixTakes);
	it(
		"refuses an attempt id that names no attempt kind",
		refusesAnAttemptIdThatNamesNoAttemptKind,
	);
	it(
		"refuses a rep id that names no rep kind",
		refusesARepIdThatNamesNoRepKind,
	);
	it(
		"names the three segments a rep stage id takes",
		namesTheThreeSegmentsARepStageIdTakes,
	);
	it("refuses a prefix with an empty body", refusesAPrefixWithAnEmptyBody);
}

function parseRecordIdCases(): void {
	describe(
		"when the record id is well-formed",
		whenTheRecordIdIsWellformedCases,
	);
	describe(
		"when the text names no known prefix",
		whenTheTextNamesNoKnownPrefixCases,
	);
	describe(
		"when a segment would name a path outside the runs directory",
		whenASegmentWouldNameAPathOutsideTheRunsDirectoryCases,
	);
	describe("when a case id is not a case id", whenACaseIdIsNotACaseIdCases);
	describe(
		"when a known prefix carries the wrong body",
		whenAKnownPrefixCarriesTheWrongBodyCases,
	);
}

describe(parseRecordId.name, parseRecordIdCases);
