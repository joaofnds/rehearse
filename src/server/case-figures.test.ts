import { describe, expect, it } from "bun:test";
import { caseFigures, medianVerdict } from "./case-figures";
import type { CaseRun } from "./case-figures";

const OLDER = "a".repeat(64);
const NEWER = "b".repeat(64);

function run(overrides: Partial<CaseRun> = {}): CaseRun {
	return {
		corpusDigest: NEWER,
		passed: true,
		costUsd: 1,
		...overrides,
	};
}

describe("caseFigures", () => {
	it("counts the runs at the latest corpus version and the ones it left out", () => {
		const figures = caseFigures([
			run(),
			run({ corpusDigest: NEWER, passed: false }),
			run({ corpusDigest: OLDER }),
			run({ corpusDigest: undefined }),
		]);

		expect(figures).toMatchObject({
			state: "measured",
			corpusVersion: NEWER,
			counted: 2,
			leftOut: 2,
			judged: 2,
			passed: 1,
		});
	});

	it("takes the mean cost over the counted runs whose cost is recorded", () => {
		const figures = caseFigures([
			run({ costUsd: 1 }),
			run({ costUsd: 2 }),
			run({ costUsd: undefined }),
			run({ corpusDigest: OLDER, costUsd: 50 }),
		]);

		expect(figures).toMatchObject({
			costPerRun: { meanUsd: 1.5, costed: 2, lacking: 1 },
		});
	});

	it("counts only the judged runs toward the passed figure", () => {
		const figures = caseFigures([run(), run({ passed: undefined })]);

		expect(figures).toMatchObject({ counted: 2, judged: 1, passed: 1 });
	});

	it("reads no runs rather than zero figures for a case that never ran", () => {
		expect(caseFigures([])).toEqual({ state: "no-runs" });
	});

	describe("when no counted run recorded its cost", () => {
		it("serves no mean", () => {
			expect(caseFigures([run({ costUsd: undefined })])).toMatchObject({
				costPerRun: { meanUsd: null, costed: 0, lacking: 1 },
			});
		});
	});

	describe("when no run recorded a corpus version", () => {
		it("counts every run under no version", () => {
			const figures = caseFigures([
				run({ corpusDigest: undefined }),
				run({ corpusDigest: undefined }),
			]);

			expect(figures).toMatchObject({
				corpusVersion: null,
				counted: 2,
				leftOut: 0,
			});
		});
	});
});

describe("medianVerdict", () => {
	it.each([
		{ passed: 3, judged: 4, median: "PASS" },
		{ passed: 2, judged: 4, median: "FAIL" },
		{ passed: 1, judged: 1, median: "PASS" },
		{ passed: 0, judged: 3, median: "FAIL" },
		{ passed: 2, judged: 3, median: "PASS" },
	] as const)(
		"reads $median for $passed of $judged passed, the lower middle on an even count",
		({ passed, judged, median }) => {
			expect(medianVerdict(passed, judged)).toBe(median);
		},
	);

	it("reads no verdict when nothing was judged", () => {
		expect(medianVerdict(0, 0)).toBeNull();
	});
});
