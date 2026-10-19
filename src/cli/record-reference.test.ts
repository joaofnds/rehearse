import { describe, expect, it } from "bun:test";

import { UsageError } from "#cli/commands";
import type { ShortIdReference } from "#cli/record-id";
import { parseRecordId, parseRecordReference } from "#cli/record-id";
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

const readsSAsAShortIdExamplesAgain: [string, ShortIdReference][] = [
	[
		"audit-log/r12",
		{ caseId: "audit-log", kind: "short", number: 12, shortKind: "run" },
	],
	[
		"audit-log/g3",
		{ caseId: "audit-log", kind: "short", number: 3, shortKind: "group" },
	],
	[
		"audit-log/r12/s0",
		{
			caseId: "audit-log",
			kind: "short",
			number: 12,
			shortKind: "run",
			stage: 0,
		},
	],
	[
		"audit-log/r12/s2",
		{
			caseId: "audit-log",
			kind: "short",
			number: 12,
			shortKind: "run",
			stage: 2,
		},
	],
];

function whenAShortIdsCaseSegmentIsNotACaseIdCases(): void {
	it.each(["../x/r1", "../r1", "UPPER/r1", "/r1", "a b/r1"])(
		"refuses %s before any path is built",
		(text) => {
			expect(() => parseRecordReference(text)).toThrow(UsageError);
			expect(() => parseRecordReference(text)).toThrow(
				`Record id ${text} names no case: a case id is lowercase letters, digits, or dashes`,
			);
		},
	);
}

function whenAShortIdsNumberIsNotOneAClaimWritesCases(): void {
	it.each([
		"audit-log/r0",
		"audit-log/r01",
		"audit-log/x1",
		"audit-log/r",
		"audit-log/g1/s0",
		"audit-log/r1/s01",
		"audit-log/r1/s",
		"audit-log/r1/s0/extra",
	])("names the forms a short id takes for %s", (text) => {
		expect(() => parseRecordReference(text)).toThrow(UsageError);
		expect(() => parseRecordReference(text)).toThrow(
			/<case>\/r<n>.*<case>\/g<n>.*<case>\/r<n>\/s<k>/u,
		);
	});
}

function parseRecordReferenceCases(): void {
	it.each<[string, ShortIdReference]>(readsSAsAShortIdExamplesAgain)(
		"reads %s as a short id",
		(text, shortId) => {
			expect(parseRecordReference(text)).toEqual(shortId);
		},
	);
	it.each(EVERY_FORM)("reads %s as the Record ID it always was", (text) => {
		expect(parseRecordReference(text)).toEqual(parseRecordId(text));
	});
	describe(
		"when a short id's case segment is not a case id",
		whenAShortIdsCaseSegmentIsNotACaseIdCases,
	);
	describe(
		"when a short id's number is not one a claim writes",
		whenAShortIdsNumberIsNotOneAClaimWritesCases,
	);
}

describe(parseRecordReference.name, parseRecordReferenceCases);
