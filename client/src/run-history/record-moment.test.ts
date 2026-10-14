import { describe, expect, it } from "bun:test";
import { recordMoment } from "./record-moment";

const NOW = new Date(2026, 9, 14, 9, 30).getTime();

describe(recordMoment.name, () => {
	it("reads a moment earlier today as today and its time", () => {
		expect(recordMoment(new Date(2026, 9, 14, 8, 5).getTime(), NOW)).toBe(
			"today 08:05",
		);
	});

	it("reads a moment yesterday as yest and its time", () => {
		expect(recordMoment(new Date(2026, 9, 13, 18, 52).getTime(), NOW)).toBe(
			"yest 18:52",
		);
	});

	it("reads an older moment as its day, month and time", () => {
		expect(recordMoment(new Date(2026, 9, 2, 11, 0).getTime(), NOW)).toBe(
			"Oct 2 11:00",
		);
	});
});
