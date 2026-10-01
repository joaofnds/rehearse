import { describe, expect, it } from "bun:test";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { graded, notYet, runRow } from "#client/test-support/runs-in-flight";
import { rerunSpreadSentence } from "./rerun-spread";

type HistoryRow = RunHistoryResponse["rows"][number];

const RUN = "2026-10-01T10-00-00.000Z";
const VERSION = { kind: "version", digest: "a".repeat(64) } as const;
const OTHER_VERSION = { kind: "version", digest: "b".repeat(64) } as const;

function rerun(
	index: number,
	letter: string,
	props: Partial<Parameters<typeof runRow>[0]> = {},
): HistoryRow {
	return runRow({
		run: `2026-09-0${String(index)}T10-00-00.000Z`,
		status: "COMPLETED",
		corpusVersion: VERSION,
		grades: [graded("build", letter)],
		...props,
	});
}

function sentenceFor(reruns: readonly HistoryRow[]): string {
	return rerunSpreadSentence(
		[runRow({ run: RUN, corpusVersion: VERSION }), ...reruns],
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
		(letters, sentence) => {
			expect(
				sentenceFor(letters.map((letter, index) => rerun(index + 1, letter))),
			).toBe(sentence);
		},
	);

	it("says the spread is not known with fewer than two graded reruns", () => {
		expect(sentenceFor([rerun(1, "B")])).toBe(UNKNOWN);
	});

	describe("when a run is not an identical rerun", () => {
		it.each([
			["another case", { caseId: "billing" }],
			["another corpus version", { corpusVersion: OTHER_VERSION }],
			[
				"a corpus that changed during the run",
				{ corpusChangedDuringRun: true },
			],
			["no grade for this step", { grades: [notYet("build")] }],
		] as const)("leaves out a run with %s", (_reason, props) => {
			expect(sentenceFor([rerun(1, "A"), rerun(2, "F", props)])).toBe(UNKNOWN);
		});

		it("leaves out the run being watched", () => {
			const watched = runRow({
				run: RUN,
				corpusVersion: VERSION,
				grades: [graded("build", "F")],
			});

			expect(
				rerunSpreadSentence([watched, rerun(1, "A")], {
					run: RUN,
					stage: "build",
				}),
			).toBe(UNKNOWN);
		});

		it("knows no reruns of a run whose corpus version was not measured", () => {
			expect(
				rerunSpreadSentence(
					[
						runRow({ run: RUN }),
						rerun(1, "A", { corpusVersion: undefined }),
						rerun(2, "A", { corpusVersion: undefined }),
					],
					{ run: RUN, stage: "build" },
				),
			).toBe(UNKNOWN);
		});
	});
});
