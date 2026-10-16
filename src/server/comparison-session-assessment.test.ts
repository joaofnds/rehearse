import { describe, expect, it } from "bun:test";
import type { CaseAttempts, ComparisonAttempt } from "./comparison-attempts";
import { comparisonSessionAssessment } from "./comparison-session-assessment";

function scored(passed: number, declared = 19): ComparisonAttempt {
	return {
		repId: "rep-1",
		ordinal: 1,
		outcomes: {
			state: "available",
			outcomes: [
				{ name: "checks", status: "JUDGED", grade: "A", successful: true },
			],
		},
		checks: { passed: 1, declared: 1, failing: [] },
		stateChecks: {
			passed,
			declared,
			failing:
				passed === declared
					? []
					: [{ name: "history-preserved", detail: "history changed" }],
		},
		blockersFired: { state: "unavailable", reason: "not applicable" },
		words: { state: "unavailable", reason: "not recorded" },
	};
}

function sixEach(): CaseAttempts {
	return {
		baseline: Array.from({ length: 6 }, () => scored(12)),
		candidate: Array.from({ length: 6 }, () => scored(19)),
		control: Array.from({ length: 6 }, () => scored(12)),
	};
}

describe(comparisonSessionAssessment.name, () => {
	it("reports when fewer candidate attempts pass saved state checks", () => {
		const attempts = {
			baseline: [scored(19), scored(19)],
			candidate: [scored(19), scored(12)],
			control: [scored(19), scored(19)],
		};

		const reading = comparisonSessionAssessment(attempts);

		expect(reading.title).toBe(
			"Candidate passed saved state checks less often in this sample",
		);
		expect(reading.basis).toBe("stateChecks");
	});

	it("leaves both layers unavailable when no check assessments were saved", () => {
		const missing = { ...scored(0), checks: undefined, stateChecks: undefined };

		const reading = comparisonSessionAssessment({
			baseline: [missing],
			candidate: [missing],
			control: [missing],
		});

		expect(reading.title).toBe("No recorded check assessments to compare");
		expect(reading.basis).toBe("unavailable");
		expect(reading.checks.baseline.passRate).toEqual({ state: "unavailable" });
	});
	it("separates saved state success from reply checks and preserves the recorded outcomes", () => {
		const attempts = sixEach();
		const recorded = JSON.stringify(attempts);

		const reading = comparisonSessionAssessment(attempts);

		expect(reading.title).toBe(
			"Candidate passed saved state checks more often in this sample",
		);
		expect(reading.basis).toBe("stateChecks");
		expect(reading.stateChecks.baseline).toMatchObject({
			passed: 0,
			assessed: 6,
			total: 6,
			missing: 0,
			undeclared: 0,
			declared: [19],
		});
		expect(reading.stateChecks.candidate).toMatchObject({
			passed: 6,
			assessed: 6,
			total: 6,
		});
		expect(reading.stateChecks.control).toMatchObject({
			passed: 0,
			assessed: 6,
			total: 6,
		});
		expect(reading.checks.baseline.passed).toBe(6);
		expect(reading.checks.candidate.passed).toBe(6);
		expect(reading.checks.control.passed).toBe(6);
		expect(JSON.stringify(attempts)).toBe(recorded);
	});

	it("projects observed rates and Wilson confidence bounds for the assessed attempts", () => {
		const attempts = sixEach();

		const reading = comparisonSessionAssessment(attempts);

		const baseline = reading.stateChecks.baseline.passRate;
		const candidate = reading.stateChecks.candidate.passRate;
		expect(baseline).toMatchObject({ state: "available", value: 0, low: 0 });
		expect(candidate).toMatchObject({
			state: "available",
			value: 100,
			high: 100,
		});
		if (baseline.state !== "available" || candidate.state !== "available") {
			throw new Error("the assessed attempts have no pass-rate bounds");
		}

		expect(baseline.high).toBeCloseTo(39.03343, 4);
		expect(candidate.low).toBeCloseTo(60.96657, 4);
	});

	it("keeps absent state measurements outside the assessed denominator", () => {
		const missing = { ...scored(0), stateChecks: undefined };
		const attempts = { ...sixEach(), candidate: [scored(19), missing] };

		const reading = comparisonSessionAssessment(attempts);

		expect(reading.title).toBe(
			"Saved state comparison has incomplete coverage",
		);
		expect(reading.stateChecks.candidate).toMatchObject({
			passed: 1,
			assessed: 1,
			total: 2,
			missing: 1,
			declared: [19],
		});
		expect(reading.stateChecks.candidate.passRate).toMatchObject({
			state: "available",
			value: 100,
		});
	});

	it("uses reply checks for its headline when no state checks were declared", () => {
		const attempts = {
			baseline: [scored(0, 0)],
			candidate: [scored(0, 0)],
			control: [scored(0, 0)],
		};

		const reading = comparisonSessionAssessment(attempts);

		expect(reading.title).toBe(
			"No observed difference in reply / transcript pass rates",
		);
		expect(reading.basis).toBe("checks");
		expect(reading.stateChecks.baseline).toEqual({
			passed: 0,
			assessed: 0,
			total: 1,
			missing: 0,
			undeclared: 1,
			declared: [],
			passRate: { state: "unavailable" },
		});
	});

	it("uses available reply checks while retaining missing state coverage", () => {
		const missing = { ...scored(0), stateChecks: undefined };
		const attempts = {
			baseline: [missing],
			candidate: [missing],
			control: [missing],
		};

		const reading = comparisonSessionAssessment(attempts);

		expect(reading.title).toBe(
			"No observed difference in reply / transcript pass rates",
		);
		expect(reading.stateChecks.baseline).toMatchObject({
			assessed: 0,
			total: 1,
			missing: 1,
			undeclared: 0,
			passRate: { state: "unavailable" },
		});
	});

	it("requires every declared check to pass with no recorded failures", () => {
		const inconsistent = {
			...scored(19),
			stateChecks: {
				passed: 19,
				declared: 19,
				failing: [{ name: "history-preserved", detail: "history changed" }],
			},
		};
		const attempts = { ...sixEach(), candidate: [inconsistent] };

		const reading = comparisonSessionAssessment(attempts);

		expect(reading.stateChecks.candidate).toMatchObject({
			passed: 0,
			assessed: 1,
		});
	});
});
