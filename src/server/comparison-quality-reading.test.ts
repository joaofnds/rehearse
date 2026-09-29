import { describe, expect, it } from "bun:test";
import type { ReliabilitySummary } from "#benchmark/confirmation-report";
import { qualityReading } from "./comparison-quality-reading";

function stageSummary(
	gradeDistribution: Readonly<Record<string, number>>,
	successful: number,
	requested: number,
): ReliabilitySummary {
	return {
		name: "build",
		requested,
		attempted: requested,
		notReached: 0,
		failed: requested - successful,
		successful,
		gradeDistribution,
		successRate: successful / requested,
		standardError: 0,
		passK: 0,
	};
}

function finalSummary(
	gradeDistribution: Readonly<Record<string, number>>,
	successful: number,
	requested: number,
): ReliabilitySummary {
	return {
		...stageSummary(gradeDistribution, successful, requested),
		name: "final",
	};
}

function sessionSummary(
	successful: number,
	requested: number,
): ReliabilitySummary {
	return {
		...stageSummary(
			Object.fromEntries([
				["A", successful],
				["F", requested - successful],
			]),
			successful,
			requested,
		),
		name: "checks",
	};
}

describe(qualityReading.name, () => {
	describe("on a session's pass rate", () => {
		it("names the arm that succeeds more often when the success-rate intervals are separated", () => {
			const reading = qualityReading({
				minuend: sessionSummary(11, 12),
				subtrahend: sessionSummary(1, 12),
				minuendArm: "candidate",
				subtrahendArm: "baseline",
				scale: "successRate",
			});

			expect(reading.verdict).toEqual({ kind: "separated", arm: "candidate" });
		});

		it("reads inside rerun noise when the success-rate intervals overlap", () => {
			const reading = qualityReading({
				minuend: sessionSummary(5, 6),
				subtrahend: sessionSummary(1, 6),
				minuendArm: "candidate",
				subtrahendArm: "baseline",
				scale: "successRate",
			});

			expect(reading.verdict).toEqual({ kind: "insideRerunNoise" });
		});

		it("reports each arm's 95% success-rate interval", () => {
			const reading = qualityReading({
				minuend: sessionSummary(11, 12),
				subtrahend: sessionSummary(1, 12),
				minuendArm: "candidate",
				subtrahendArm: "baseline",
				scale: "successRate",
			});

			expect(reading.interval).toEqual({
				minuend: { low: "65%", high: "99%" },
				subtrahend: { low: "1%", high: "35%" },
			});
		});

		it("counts a rep that never reached the measure as a failed attempt", () => {
			const reading = qualityReading({
				minuend: { ...sessionSummary(2, 4), attempted: 2, notReached: 2 },
				subtrahend: sessionSummary(0, 4),
				minuendArm: "candidate",
				subtrahendArm: "baseline",
				scale: "successRate",
			});

			expect(reading.interval.minuend).toEqual({ low: "15%", high: "85%" });
		});
	});

	it("reads inside rerun noise when a declared-stage measure's grade spans overlap", () => {
		const minuend = stageSummary(
			Object.fromEntries([
				["B", 3],
				["C", 1],
			]),
			3,
			4,
		);
		const subtrahend = stageSummary(
			Object.fromEntries([
				["B", 1],
				["C", 3],
			]),
			1,
			4,
		);

		const reading = qualityReading({
			minuend,
			subtrahend,
			minuendArm: "candidate",
			subtrahendArm: "baseline",
			scale: "letters",
		});

		expect(reading).toEqual({
			interval: {
				minuend: { low: "B", high: "C" },
				subtrahend: { low: "B", high: "C" },
			},
			verdict: { kind: "insideRerunNoise" },
		});
	});

	it("reads unchanged already clear when both arms have every rep successful", () => {
		const minuend = stageSummary(Object.fromEntries([["A", 4]]), 4, 4);
		const subtrahend = stageSummary(
			Object.fromEntries([
				["A", 2],
				["B", 2],
			]),
			4,
			4,
		);

		const reading = qualityReading({
			minuend,
			subtrahend,
			minuendArm: "candidate",
			subtrahendArm: "baseline",
			scale: "letters",
		});

		expect(reading.verdict).toEqual({ kind: "unchangedAlreadyClear" });
	});

	it("names the arm with the higher successful-of-requested count when grade spans do not overlap and neither arm is at ceiling", () => {
		const minuend = stageSummary(Object.fromEntries([["A", 4]]), 4, 4);
		const subtrahend = stageSummary(Object.fromEntries([["D", 4]]), 0, 4);

		const reading = qualityReading({
			minuend,
			subtrahend,
			minuendArm: "candidate",
			subtrahendArm: "baseline",
			scale: "letters",
		});

		expect(reading.verdict).toEqual({ kind: "separated", arm: "candidate" });
	});

	it("reads inside rerun noise, not a directional verdict, when neither arm is at ceiling and the two arms tie on successful-of-requested", () => {
		const minuend = stageSummary(Object.fromEntries([["C", 4]]), 0, 4);
		const subtrahend = stageSummary(Object.fromEntries([["F", 4]]), 0, 4);

		const reading = qualityReading({
			minuend,
			subtrahend,
			minuendArm: "candidate",
			subtrahendArm: "baseline",
			scale: "letters",
		});

		expect(reading.verdict).toEqual({ kind: "insideRerunNoise" });
	});

	it("names the subtrahend arm when it succeeds more often", () => {
		const minuend = stageSummary(Object.fromEntries([["D", 4]]), 0, 4);
		const subtrahend = stageSummary(Object.fromEntries([["A", 4]]), 4, 4);

		const reading = qualityReading({
			minuend,
			subtrahend,
			minuendArm: "candidate",
			subtrahendArm: "baseline",
			scale: "letters",
		});

		expect(reading.verdict).toEqual({ kind: "separated", arm: "baseline" });
	});

	it("reads the binomial 0/n edge as inside rerun noise when both arms fail every rep with overlapping grades", () => {
		const minuend = stageSummary(Object.fromEntries([["F", 4]]), 0, 4);
		const subtrahend = stageSummary(
			Object.fromEntries([
				["D", 2],
				["F", 2],
			]),
			0,
			4,
		);

		const reading = qualityReading({
			minuend,
			subtrahend,
			minuendArm: "candidate",
			subtrahendArm: "baseline",
			scale: "letters",
		});

		expect(reading.verdict).toEqual({ kind: "insideRerunNoise" });
	});

	it("reads the binomial n/n edge as unchanged already clear when both arms succeed every rep", () => {
		const minuend = stageSummary(Object.fromEntries([["A", 4]]), 4, 4);
		const subtrahend = stageSummary(Object.fromEntries([["B", 4]]), 4, 4);

		const reading = qualityReading({
			minuend,
			subtrahend,
			minuendArm: "candidate",
			subtrahendArm: "baseline",
			scale: "letters",
		});

		expect(reading.verdict).toEqual({ kind: "unchangedAlreadyClear" });
	});

	it("reads the final row's pass rate instead of the five-letter scale", () => {
		const minuend = finalSummary(
			Object.fromEntries([
				["PASS", 3],
				["FAIL", 1],
			]),
			3,
			4,
		);
		const subtrahend = finalSummary(
			Object.fromEntries([
				["PASS", 1],
				["FAIL", 3],
			]),
			1,
			4,
		);

		const reading = qualityReading({
			minuend,
			subtrahend,
			minuendArm: "candidate",
			subtrahendArm: "baseline",
			scale: "successRate",
		});

		expect(reading).toEqual({
			interval: {
				minuend: { low: "30%", high: "95%" },
				subtrahend: { low: "5%", high: "70%" },
			},
			verdict: { kind: "insideRerunNoise" },
		});
	});

	it("names the higher-succeeding arm on the final row's pass rate when the intervals are separated", () => {
		const minuend = finalSummary(Object.fromEntries([["PASS", 8]]), 8, 8);
		const subtrahend = finalSummary(Object.fromEntries([["FAIL", 8]]), 0, 8);

		const reading = qualityReading({
			minuend,
			subtrahend,
			minuendArm: "candidate",
			subtrahendArm: "baseline",
			scale: "successRate",
		});

		expect(reading.verdict).toEqual({ kind: "separated", arm: "candidate" });
	});

	it("reads inside rerun noise with no interval for an arm that never reached the measure", () => {
		const minuend = stageSummary({}, 0, 4);
		const subtrahend = stageSummary(Object.fromEntries([["A", 4]]), 4, 4);

		const reading = qualityReading({
			minuend,
			subtrahend,
			minuendArm: "candidate",
			subtrahendArm: "baseline",
			scale: "letters",
		});

		expect(reading).toEqual({
			interval: {
				minuend: undefined,
				subtrahend: { low: "A", high: "A" },
			},
			verdict: { kind: "insideRerunNoise" },
		});
	});

	it("reads inside rerun noise with no interval on either side when neither arm ever reached the measure", () => {
		const minuend = stageSummary({}, 0, 4);
		const subtrahend = stageSummary({}, 0, 4);

		const reading = qualityReading({
			minuend,
			subtrahend,
			minuendArm: "candidate",
			subtrahendArm: "baseline",
			scale: "letters",
		});

		expect(reading).toEqual({
			interval: { minuend: undefined, subtrahend: undefined },
			verdict: { kind: "insideRerunNoise" },
		});
	});
});
