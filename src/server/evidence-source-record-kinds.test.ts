import { afterEach, describe, expect, it } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { harnessResult } from "#benchmark/test-support";
import {
	RUN,
	STAGE_RECORD,
	clearEvidenceRoots,
	marked,
	recordedRuns,
	stageSource,
} from "#server/evidence-source-records-test-fixture";

import { readEvidenceSource } from "./evidence-source";

afterEach(clearEvidenceRoots);

describe(readEvidenceSource.name, () => {
	describe("when the cited source is absent", () => {
		it("says a cited source is absent", verifySaysACitedSourceIsAbsent);
	});

	describe("when the record predates quoted spans", () => {
		it(
			"says an item was recorded before quoted spans",
			verifySaysAnItemWasRecordedBeforeQuotedSpans,
		);
	});

	describe("when the stage stopped the run", () => {
		it(
			"returns the evidence the record of the stage that stopped the run keeps beside its status",
			verifyReturnsTheEvidenceTheRecordOfTheStageThat,
		);
	});

	describe("when the final judge retained evidence", () => {
		it(
			"returns the final judge's evidence from the run record",
			verifyReturnsTheFinalJudgeSEvidenceFromTheRun,
		);
	});
});

async function verifySaysACitedSourceIsAbsent(): Promise<void> {
	const source = await stageSource("dimensions", "clarity", "2");

	expect(source.view).toEqual({ kind: "absent" });
}

async function verifySaysAnItemWasRecordedBeforeQuotedSpans(): Promise<void> {
	const source = await stageSource("dimensions", "clarity", "3");

	expect(source.view).toEqual({ kind: "before-quoted-spans" });
}

async function verifyReturnsTheEvidenceTheRecordOfTheStageThat(): Promise<void> {
	const runsDirectory = await recordedRuns();
	const {
		grade: { grade: letter, verdict, ...judged },
		...unjudged
	} = STAGE_RECORD;
	await writeFile(
		join(runsDirectory, `${RUN}.build.json`),
		JSON.stringify({
			...unjudged,
			...judged,
			error: "Stage build graded D below the minimum C",
			grade: { grade: letter, verdict },
			status: "STAGE_JUDGE_FAILED",
		}),
	);

	const source = await readEvidenceSource({
		index: "0",
		item: "clarity",
		judge: { kind: "stage", stage: "build" },
		run: RUN,
		runsDirectory,
		section: "dimensions",
	});

	expect(marked(source)).toBe("keep deletes");
}

async function verifyReturnsTheFinalJudgeSEvidenceFromTheRun(): Promise<void> {
	const runsDirectory = await recordedRuns();
	const request = {
		judge: { kind: "final" },
		run: RUN,
		runsDirectory,
		section: "requirements",
	} as const;

	const quoted = await readEvidenceSource({
		...request,
		index: "0",
		item: "tests",
	});
	const harness = await readEvidenceSource({
		...request,
		index: "0",
		item: "check-integrity",
	});

	expect(quoted.record.endsWith(`${RUN}.json`)).toBe(true);
	expect(marked(quoted)).toBe("+export const audit = true;");
	expect(harness.view).toEqual({
		kind: "harness",
		recorded: true,
		result: "checkIntegrity",
		value: harnessResult("PASS", "checks match"),
	});
}
