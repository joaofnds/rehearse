import { describe, expect, it } from "bun:test";

import {
	INSIDE_NOISE,
	SUMMARY,
	card,
	renderSays,
} from "./pairing-card-test-fixtures";
import { WhatThePairingSays } from "./pairing-cards";

describe(WhatThePairingSays.name, () => {
	it(
		"reads candidate (after) against baseline (before) on the overall measure, with its attempt combinations",
		readsCandidateAfterAgainstBaselineBeforeOnTheOverallMeasureWithItsAttemptCombinations,
	);

	it(
		"reads each of baseline and candidate against the control arm",
		readsEachOfBaselineAndCandidateAgainstTheControlArm,
	);

	it(
		"reads a pipeline comparison on its final verdict alone",
		readsAPipelineComparisonOnItsFinalVerdictAlone,
	);

	it(
		"states candidate (after)'s reply length change against baseline (before)'s with its reading",
		statesCandidateAfterSReplyLengthChangeAgainstBaselineBeforeSWithItsReading,
	);

	it(
		"names the arm whose replies ran longer when the lengths separate",
		namesTheArmWhoseRepliesRanLongerWhenTheLengthsSeparate,
	);

	it(
		"says why the reply length reading is unavailable",
		saysWhyTheReplyLengthReadingIsUnavailable,
	);
});

function readsCandidateAfterAgainstBaselineBeforeOnTheOverallMeasureWithItsAttemptCombinations(): void {
	renderSays();

	expect(card("What the pairing says")).toHaveTextContent(
		"Candidate (after) against baseline (before) on build: inside rerun noise. Of 4 attempt combinations, 0 higher, 2 equal, 2 lower.",
	);
}

function readsEachOfBaselineAndCandidateAgainstTheControlArm(): void {
	renderSays();

	expect(card("What the pairing says")).toHaveTextContent(
		"Candidate (after) against the control arm on build: candidate (after) separates. Of 4 attempt combinations, 4 higher, 0 equal, 0 lower.",
	);
	expect(card("What the pairing says")).toHaveTextContent(
		"Baseline (before) against the control arm on build: unchanged, already clear. Attempt combinations not counted: no graded rep.",
	);
}

function readsAPipelineComparisonOnItsFinalVerdictAlone(): void {
	renderSays(
		{
			...SUMMARY,
			contrasts: {
				candidateMinusBaseline: { final: INSIDE_NOISE, review: INSIDE_NOISE },
			},
		},
		"pipeline",
	);

	expect(card("What the pairing says")).toHaveTextContent(
		"Candidate (after) against baseline (before) on final",
	);
	expect(card("What the pairing says")).not.toHaveTextContent("on review");
}

function statesCandidateAfterSReplyLengthChangeAgainstBaselineBeforeSWithItsReading(): void {
	renderSays();

	expect(card("What the pairing says")).toHaveTextContent(
		"Candidate (after)'s reply length against baseline (before)'s: -17%, inside rerun noise.",
	);
}

function namesTheArmWhoseRepliesRanLongerWhenTheLengthsSeparate(): void {
	renderSays({
		...SUMMARY,
		replyLength: {
			...SUMMARY.replyLength,
			change: "+34%",
			verdict: { arm: "candidate", kind: "higher" },
		},
	});

	expect(card("What the pairing says")).toHaveTextContent(
		"Candidate (after)'s reply length against baseline (before)'s: +34%, candidate (after) ran longer.",
	);
}

function saysWhyTheReplyLengthReadingIsUnavailable(): void {
	renderSays({
		...SUMMARY,
		replyLength: {
			change: undefined,
			interval: { minuend: undefined, subtrahend: undefined },
			verdict: { kind: "unavailable", reasons: ["no word count"] },
		},
	});

	expect(card("What the pairing says")).toHaveTextContent(
		"Candidate (after)'s reply length against baseline (before)'s is unavailable: no word count.",
	);
}
