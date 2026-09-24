import { describe, expect, it } from "bun:test";
import { UsageError } from "#cli/commands";
import {
	formatRecordId,
	parseRecordId,
	parseRecordReference,
} from "#cli/record-id";
import type { ShortIdReference } from "#cli/record-id";

const EVERY_FORM = [
	"case:audit-log",
	"run:2026-09-03T00-00-00.000Z",
	"checkpoint:2026-09-03T00-00-00.000Z/build",
	"attempt:session:smoke/fa239c6c-6389-4999-b2f1-90708471af9d",
	"attempt:stage:cafe1234/2026-09-03T00-00-00.000Z",
	"group:group-1",
	`comparison:${"a".repeat(64)}`,
];

describe(parseRecordId.name, () => {
	it("reads a checkpoint id as the run and the stage it names", () => {
		const id = parseRecordId("checkpoint:2026-09-03T00-00-00.000Z/build");

		expect(id).toEqual({
			kind: "checkpoint",
			run: "2026-09-03T00-00-00.000Z",
			stage: "build",
		});
	});

	it("reads a session attempt id as the case and the uuid it names", () => {
		const id = parseRecordId(
			"attempt:session:smoke/fa239c6c-6389-4999-b2f1-90708471af9d",
		);

		expect(id).toEqual({
			kind: "attempt:session",
			caseId: "smoke",
			uuid: "fa239c6c-6389-4999-b2f1-90708471af9d",
		});
	});

	it("reads a stage attempt id as the lineage and the timestamp it names", () => {
		const id = parseRecordId("attempt:stage:cafe1234/2026-09-03T00-00-00.000Z");

		expect(id).toEqual({
			kind: "attempt:stage",
			lineage: "cafe1234",
			timestamp: "2026-09-03T00-00-00.000Z",
		});
	});

	it.each(EVERY_FORM)("round-trips %s through its parsed value", (text) => {
		expect(formatRecordId(parseRecordId(text))).toBe(text);
	});

	describe("when the text names no known prefix", () => {
		it("refuses it as a usage error naming every id form", () => {
			expect(() => parseRecordId("nonsense")).toThrow(UsageError);
			expect(() => parseRecordId("nonsense")).toThrow(
				/case:<id>.*run:<name>.*checkpoint:<run>\/<stage>/u,
			);
		});
	});

	describe("when a segment would name a path outside the runs directory", () => {
		it.each([
			"run:../../../etc/passwd",
			"group:../../../../etc/passwd",
			"case:../audit-log",
			"comparison:..",
			"checkpoint:../run/build",
			"checkpoint:run/../build",
			"attempt:session:../smoke/uuid",
			"attempt:stage:lineage/..",
		])("refuses %s as a usage error", (text) => {
			expect(() => parseRecordId(text)).toThrow(UsageError);
		});

		it.each([
			"run:../../etc/passwd",
			"checkpoint:a/..",
			"attempt:session:smoke/..",
		])("reports %s as the user typed it", (text) => {
			expect(() => parseRecordId(text)).toThrow(
				`Record id ${text} names a path outside the runs directory`,
			);
		});
	});

	describe("when a case id is not a case id", () => {
		it.each(["case:Some Weird Name", "case:UPPER", "case:-leading-dash"])(
			"refuses %s the way case show refuses the same mistake",
			(text) => {
				expect(() => parseRecordId(text)).toThrow(UsageError);
				expect(() => parseRecordId(text)).toThrow(
					/lowercase letters, digits, or dashes/u,
				);
			},
		);

		it("accepts the case ids this repository declares", () => {
			expect(parseRecordId("case:audit-log")).toEqual({
				kind: "case",
				caseId: "audit-log",
			});
		});
	});

	describe("when a known prefix carries the wrong body", () => {
		it("names the form that prefix takes", () => {
			expect(() => parseRecordId("checkpoint:only-one-part")).toThrow(
				/checkpoint:<run>\/<stage>/u,
			);
		});

		it("refuses an attempt id that names no attempt kind", () => {
			expect(() => parseRecordId("attempt:cafe1234/2026-09-03")).toThrow(
				/attempt:session:<case>\/<uuid>/u,
			);
		});

		it("refuses a prefix with an empty body", () => {
			expect(() => parseRecordId("run:")).toThrow(/run:<name>/u);
		});
	});
});

describe(parseRecordReference.name, () => {
	it.each<[string, ShortIdReference]>([
		[
			"audit-log/r12",
			{ kind: "short", caseId: "audit-log", shortKind: "run", number: 12 },
		],
		[
			"audit-log/g3",
			{ kind: "short", caseId: "audit-log", shortKind: "group", number: 3 },
		],
		[
			"audit-log/r12/s0",
			{
				kind: "short",
				caseId: "audit-log",
				shortKind: "run",
				number: 12,
				stage: 0,
			},
		],
		[
			"audit-log/r12/s2",
			{
				kind: "short",
				caseId: "audit-log",
				shortKind: "run",
				number: 12,
				stage: 2,
			},
		],
	])("reads %s as a short id", (text, shortId) => {
		expect(parseRecordReference(text)).toEqual(shortId);
	});

	it.each(EVERY_FORM)("reads %s as the Record ID it always was", (text) => {
		expect(parseRecordReference(text)).toEqual(parseRecordId(text));
	});

	describe("when a short id's case segment is not a case id", () => {
		it.each(["../x/r1", "../r1", "UPPER/r1", "/r1", "a b/r1"])(
			"refuses %s before any path is built",
			(text) => {
				expect(() => parseRecordReference(text)).toThrow(UsageError);
				expect(() => parseRecordReference(text)).toThrow(
					`Record id ${text} names no case: a case id is lowercase letters, digits, or dashes`,
				);
			},
		);
	});

	describe("when a short id's number is not one a claim writes", () => {
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
	});
});
