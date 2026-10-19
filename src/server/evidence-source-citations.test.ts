import { afterEach, describe, expect, it } from "bun:test";

import { harnessResult } from "#benchmark/test-support";
import {
	DIFF,
	RUN,
	clearEvidenceRoots,
	marked,
	stageSource,
} from "#server/evidence-source-records-test-fixture";

import { readEvidenceSource } from "./evidence-source";

afterEach(clearEvidenceRoots);

describe(readEvidenceSource.name, () => {
	describe("when a stage records located citations", () => {
		it(
			"returns the recorded diff with the quoted span marked and names the record file",
			verifyReturnsTheRecordedDiffWithTheQuotedSpanMarked,
		);

		it(
			"returns the recorded text file a lines locator names, with the span marked",
			verifyReturnsTheRecordedTextFileALinesLocatorNames,
		);

		it(
			"returns only the record's own bytes for an evidence path that climbs out of the records",
			verifyReturnsOnlyTheRecordSOwnBytesForAn,
		);

		it(
			"returns the exchange field a transcript locator names",
			verifyReturnsTheExchangeFieldATranscriptLocatorNames,
		);

		it(
			"returns the commit subjects with the cited subject's span marked",
			verifyReturnsTheCommitSubjectsWithTheCitedSubjectS,
		);

		it(
			"marks a quote that spans commit subjects from its first subject",
			verifyMarksAQuoteThatSpansCommitSubjectsFromIts,
		);

		it(
			"marks the cited subject's occurrence of a quote an earlier subject also holds",
			verifyMarksTheCitedSubjectSOccurrenceOfAQuote,
		);

		it(
			"returns the harness result a harness locator names",
			verifyReturnsTheHarnessResultAHarnessLocatorNames,
		);
	});
});

async function verifyReturnsTheRecordedDiffWithTheQuotedSpanMarked(): Promise<void> {
	const source = await stageSource("requirements", "scope", "0");

	expect(source).toMatchObject({
		claim: "diff claim",
		path: "src/app.ts",
		quote: "export {};\nexport const audit = true;",
		source: "diff",
		view: { kind: "text", label: "src/app.ts @@ -1 +1,2 @@", text: DIFF },
	});
	expect(source.record.endsWith(`${RUN}.build.json`)).toBe(true);
	expect(marked(source)).toBe("export {};\n+export const audit = true;");
}

async function verifyReturnsTheRecordedTextFileALinesLocatorNames(): Promise<void> {
	const source = await stageSource("requirements", "scope", "1");

	expect(source.view).toMatchObject({
		kind: "text",
		label: "backlog-seed.md",
		text: "# Task\nWe keep every change.\n",
	});
	expect(marked(source)).toBe("keep every change");
}

async function verifyReturnsOnlyTheRecordSOwnBytesForAn(): Promise<void> {
	const source = await stageSource("requirements", "scope", "2");

	expect(source.view).toEqual({
		kind: "text",
		label: "../../etc/passwd",
		span: { end: 14, start: 0 },
		text: "recorded bytes\n",
	});
}

async function verifyReturnsTheExchangeFieldATranscriptLocatorNames(): Promise<void> {
	const source = await stageSource("dimensions", "clarity", "0");

	expect(source.view).toMatchObject({
		kind: "text",
		label: "exchange 2 productOwnerAnswer",
		text: "Yes, keep deletes forever.",
	});
	expect(marked(source)).toBe("keep deletes");
}

async function verifyReturnsTheCommitSubjectsWithTheCitedSubjectS(): Promise<void> {
	const source = await stageSource("dimensions", "clarity", "1");

	expect(source.view).toMatchObject({
		kind: "text",
		label: "commit subject 2",
		text: "feat: add entity\nfeat: add persistence layer",
	});
	expect(marked(source)).toBe("persistence");
}

async function verifyMarksAQuoteThatSpansCommitSubjectsFromIts(): Promise<void> {
	const source = await stageSource("dimensions", "clarity", "4");

	expect(marked(source)).toBe("add entity\nfeat: add");
}

async function verifyMarksTheCitedSubjectSOccurrenceOfAQuote(): Promise<void> {
	const source = await stageSource("dimensions", "clarity", "5");

	expect(source.view).toMatchObject({ span: { end: 26, start: 17 } });
}

async function verifyReturnsTheHarnessResultAHarnessLocatorNames(): Promise<void> {
	const source = await stageSource("hardBlockers", "unfinished-delivery", "0");

	expect(source.view).toEqual({
		kind: "harness",
		recorded: true,
		result: "localChecks",
		value: harnessResult("PASS", "all green"),
	});
}
