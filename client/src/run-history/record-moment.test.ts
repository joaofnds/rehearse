import { describe, expect, it } from "bun:test";

import recordMoment from "./record-moment";

const CLOCK_DAY = 14;
const CLOCK_HOURS = 9;
const CLOCK_MINUTES = 30;
const CLOCK_MONTH_INDEX = 9;
const CLOCK_YEAR = 2026;
const NOW = new Date(
	CLOCK_YEAR,
	CLOCK_MONTH_INDEX,
	CLOCK_DAY,
	CLOCK_HOURS,
	CLOCK_MINUTES,
).getTime();

const moments = [
	{
		day: 14,
		description: "reads a moment earlier today as today and its time",
		expected: "today 08:05",
		hours: 8,
		minutes: 5,
		monthIndex: 9,
		year: 2026,
	},
	{
		day: 13,
		description: "reads a moment yesterday as yest and its time",
		expected: "yest 18:52",
		hours: 18,
		minutes: 52,
		monthIndex: 9,
		year: 2026,
	},
	{
		day: 2,
		description: "reads an older moment as its day, month and time",
		expected: "Oct 2 11:00",
		hours: 11,
		minutes: 0,
		monthIndex: 9,
		year: 2026,
	},
];

describe(recordMoment.name, () => {
	for (const moment of moments) {
		it(moment.description, () => {
			const instant = new Date(
				moment.year,
				moment.monthIndex,
				moment.day,
				moment.hours,
				moment.minutes,
			).getTime();
			expect(recordMoment(instant, NOW)).toBe(moment.expected);
		});
	}
});
