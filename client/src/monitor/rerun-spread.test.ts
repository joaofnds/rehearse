import { describe, expect, it } from "bun:test";

import type { Immutable } from "#benchmark/contracts";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import ListedStageGradeBuilder from "#client/test-support/listed-stage-grade-test-builder";
import type { PipelineRunRow } from "#server/run-history";

import rerunSpreadSentence from "./rerun-spread";

const EARLIER_RERUN_DAY_OF_MONTH = 1;
const LATER_RERUN_DAY_OF_MONTH = 2;

const ORDINAL_BASE = 1;

type HistoryRow = RunHistoryResponse["rows"][number];

const RUN = "2026-10-01T10-00-00.000Z";
const VERSION = {
	digest: "a".repeat(SHA256_HEX_CHARACTERS),
	kind: "version",
} as const;
const OTHER_VERSION = {
	digest: "b".repeat(SHA256_HEX_CHARACTERS),
	kind: "version",
} as const;

const EARLIER_A_RERUN = new PipelineRunRowBuilder({
	corpusVersion: VERSION,
	run: `2026-09-0${String(EARLIER_RERUN_DAY_OF_MONTH)}T10-00-00.000Z`,
	stageGrades: {
		grades: [
			new ListedStageGradeBuilder({ stage: "build" })
				.graded({ letter: "A" })
				.build(),
		],
		state: "available",
	},
	status: "COMPLETED",
})
	.withExecutionProgress()
	.build();
const EARLIER_B_RERUN = new PipelineRunRowBuilder({
	corpusVersion: VERSION,
	run: `2026-09-0${String(EARLIER_RERUN_DAY_OF_MONTH)}T10-00-00.000Z`,
	stageGrades: {
		grades: [
			new ListedStageGradeBuilder({ stage: "build" })
				.graded({ letter: "B" })
				.build(),
		],
		state: "available",
	},
	status: "COMPLETED",
})
	.withExecutionProgress()
	.build();
const LATER_F_RERUN = new PipelineRunRowBuilder({
	corpusVersion: VERSION,
	run: `2026-09-0${String(LATER_RERUN_DAY_OF_MONTH)}T10-00-00.000Z`,
	stageGrades: {
		grades: [
			new ListedStageGradeBuilder({ stage: "build" })
				.graded({ letter: "F" })
				.build(),
		],
		state: "available",
	},
	status: "COMPLETED",
})
	.withExecutionProgress()
	.build();

function sentenceFor(reruns: readonly HistoryRow[]): string {
	return rerunSpreadSentence(
		[
			new PipelineRunRowBuilder({ corpusVersion: VERSION, run: RUN })
				.withExecutionProgress()
				.build(),
			...reruns,
		],
		{ run: RUN, stage: "build" },
	);
}

const UNKNOWN =
	"Fewer than two identical reruns of this case have graded this step, so how far its grade varies here is not known yet.";

describe(rerunSpreadSentence.name, () => {
	it.each([
		[["B", "B"], "Identical reruns of this case have not varied here."],
		[
			["B", "C"],
			"Identical reruns of this case have varied by one letter step here.",
		],
		[
			["A", "B", "C"],
			"Identical reruns of this case have varied by two letter steps here.",
		],
		[
			["A", "F"],
			"Identical reruns of this case have varied by four letter steps here.",
		],
	] as const)(
		"reads the spread of grades %p in letter steps",
		readsRecordedGradeSpread,
	);

	it(
		"says the spread is not known with fewer than two graded reruns",
		saysTheSpreadIsNotKnownWithFewerThanTwoGradedReruns,
	);

	describe("when a run is not an identical rerun", nonIdenticalReruns);
});

function saysTheSpreadIsNotKnownWithFewerThanTwoGradedReruns(): void {
	expect(sentenceFor([EARLIER_B_RERUN])).toBe(UNKNOWN);
}

function leavesOutTheRunBeingWatched(): void {
	const watched = new PipelineRunRowBuilder({
		corpusVersion: VERSION,
		run: RUN,
		stageGrades: {
			grades: [
				new ListedStageGradeBuilder({ stage: "build" })
					.graded({ letter: "F" })
					.build(),
			],
			state: "available",
		},
	})
		.withExecutionProgress()
		.build();

	expect(
		rerunSpreadSentence([watched, EARLIER_A_RERUN], {
			run: RUN,
			stage: "build",
		}),
	).toBe(UNKNOWN);
}

function knowsNoRerunsOfARunWhoseCorpusVersionWasNotMeasured(): void {
	expect(
		rerunSpreadSentence(
			[
				new PipelineRunRowBuilder({ run: RUN }).withExecutionProgress().build(),
				new PipelineRunRowBuilder({
					...EARLIER_A_RERUN,
					corpusVersion: undefined,
				}).build(),
				new PipelineRunRowBuilder({
					...LATER_F_RERUN,
					corpusVersion: undefined,
					stageGrades: EARLIER_A_RERUN.stageGrades,
				}).build(),
			],
			{ run: RUN, stage: "build" },
		),
	).toBe(UNKNOWN);
}

function readsRecordedGradeSpread(
	letters: readonly string[],
	sentence: string,
): void {
	expect(
		sentenceFor(
			letters.map((letter, index) =>
				new PipelineRunRowBuilder({
					corpusVersion: VERSION,
					run: `2026-09-0${String(index + ORDINAL_BASE)}T10-00-00.000Z`,
					stageGrades: {
						grades: [
							new ListedStageGradeBuilder({ stage: "build" })
								.graded({ letter })
								.build(),
						],
						state: "available",
					},
					status: "COMPLETED",
				})
					.withExecutionProgress()
					.build(),
			),
		),
	).toBe(sentence);
}

function excludesDifferentRerun(
	_reason: string,
	props: Immutable<Partial<PipelineRunRow>>,
): void {
	expect(
		sentenceFor([
			EARLIER_A_RERUN,
			new PipelineRunRowBuilder({ ...LATER_F_RERUN, ...props }).build(),
		]),
	).toBe(UNKNOWN);
}

function nonIdenticalReruns(): void {
	it.each([
		["another case", { caseId: "billing" }],
		["another corpus version", { corpusVersion: OTHER_VERSION }],
		["a corpus that changed during the run", { corpusChangedDuringRun: true }],
		[
			"no grade for this step",
			{
				stageGrades: {
					grades: [new ListedStageGradeBuilder({ stage: "build" }).build()],
					state: "available",
				},
			},
		],
	] as const)("leaves out a run with %s", excludesDifferentRerun);

	it("leaves out the run being watched", leavesOutTheRunBeingWatched);

	it(
		"knows no reruns of a run whose corpus version was not measured",
		knowsNoRerunsOfARunWhoseCorpusVersionWasNotMeasured,
	);
}
