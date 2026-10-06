import { describe, expect, it } from "bun:test";
import {
	dimensionReading,
	firingsReading,
	meterReading,
} from "./comparison-what-moved";

const arms = { minuend: "candidate", subtrahend: "baseline" } as const;

describe(firingsReading.name, () => {
	it("names the arm that fires less often when the firing intervals are separated", () => {
		const reading = firingsReading(
			{ state: "available", fired: 0, of: 12 },
			{ state: "available", fired: 11, of: 12 },
			arms,
		);

		expect(reading.verdict).toEqual({ kind: "separated", arm: "candidate" });
	});

	it("reads unavailable, never inside rerun noise, with no interval for an arm no rep was graded on", () => {
		const reading = firingsReading(
			{ state: "unavailable", reasons: ["no rep"] },
			{ state: "available", fired: 1, of: 2 },
			arms,
		);

		expect(reading).toEqual({
			interval: { minuend: undefined, subtrahend: { low: "9%", high: "91%" } },
			verdict: { kind: "unavailable" },
		});
	});
});

describe(dimensionReading.name, () => {
	it("reads each arm's letter span from the bottom of the scale to the top", () => {
		const reading = dimensionReading(
			{ state: "available", median: "B", lowest: "C", highest: "A" },
			{ state: "available", median: "D", lowest: "F", highest: "D" },
			arms,
		);

		expect(reading.interval).toEqual({
			minuend: { low: "C", high: "A" },
			subtrahend: { low: "F", high: "D" },
		});
	});
});

describe(meterReading.name, () => {
	it("names the arm that ran higher and the change when four attempts an arm do not overlap", () => {
		const reading = meterReading(
			{ state: "available", mean: 134, low: 120, high: 150, counted: 4 },
			{ state: "available", mean: 100, low: 90, high: 110, counted: 4 },
			arms,
		);

		expect(reading).toEqual({
			interval: {
				minuend: { low: 120, high: 150 },
				subtrahend: { low: 90, high: 110 },
			},
			change: "+34%",
			verdict: { kind: "higher", arm: "candidate" },
		});
	});

	it("reads inside rerun noise when three attempts an arm do not overlap, since noise separates them one time in ten", () => {
		const reading = meterReading(
			{ state: "available", mean: 134, low: 120, high: 150, counted: 3 },
			{ state: "available", mean: 100, low: 90, high: 110, counted: 3 },
			arms,
		);

		expect(reading.verdict).toEqual({ kind: "insideRerunNoise" });
	});

	it("reads unavailable with the reason an arm recorded nothing to measure", () => {
		const reading = meterReading(
			{ state: "unavailable", reasons: ["no words"] },
			{ state: "available", mean: 100, low: 90, high: 110, counted: 4 },
			arms,
		);

		expect(reading.verdict).toEqual({
			kind: "unavailable",
			reasons: ["no words"],
		});
	});

	it("states a reason both arms share once", () => {
		const reading = meterReading(
			{ state: "unavailable", reasons: ["no words"] },
			{ state: "unavailable", reasons: ["no words"] },
			arms,
		);

		expect(reading.verdict).toEqual({
			kind: "unavailable",
			reasons: ["no words"],
		});
	});

	it("reads no change against a subtrahend that averaged zero", () => {
		const reading = meterReading(
			{ state: "available", mean: 1, low: 1, high: 1, counted: 1 },
			{ state: "available", mean: 0, low: 0, high: 0, counted: 1 },
			arms,
		);

		expect(reading.change).toBeUndefined();
	});
});
