import { describe, expect, it } from "bun:test";

import {
	evaluateForbiddenPattern,
	forbiddenPatternCheckSchema,
} from "#benchmark/session-check-forbidden-pattern";
import { evaluateForbiddenText } from "#benchmark/session-check-forbidden-text";
import { evaluateWordBand } from "#benchmark/session-check-word-band";

const FIRST_VALIDATION_ISSUE_INDEX = 0;

const wordBandExamples = [
	{
		detail: "2 words outside 3 to 5",
		max: 5,
		min: 3,
		reply: "one two",
		status: "FAIL",
	},
	{
		detail: "3 words within 3 to 5",
		max: 5,
		min: 3,
		reply: "one two three",
		status: "PASS",
	},
	{
		detail: "5 words within 3 to 5",
		max: 5,
		min: 3,
		reply: "one two three four five",
		status: "PASS",
	},
	{
		detail: "6 words outside 3 to 5",
		max: 5,
		min: 3,
		reply: "one two three four five six",
		status: "FAIL",
	},
] as const;
describe(evaluateWordBand.name, () => {
	it.each(
		wordBandExamples.map(
			({ reply, min, max, status, detail }) =>
				[reply, min, max, status, detail] as const,
		),
	)(
		"reports %s against a band of %p to %p as %s",
		(...[reply, min, max, status, detail]) => {
			expect(evaluateWordBand({ kind: "word-band", max, min }, reply)).toEqual({
				detail,
				kind: "word-band",
				status,
			});
		},
	);

	it("reports a band that declares only max against its count", () => {
		expect(evaluateWordBand({ kind: "word-band", max: 1 }, "OK")).toEqual({
			detail: "1 words within at most 1",
			kind: "word-band",
			status: "PASS",
		});
	});
});
const forbiddenTextRule = {
	kind: "forbidden-text",
	strings: ["—", "`"],
} as const;
describe(evaluateForbiddenText.name, () => {
	it("passes a reply that contains none of the declared strings", () => {
		expect(
			evaluateForbiddenText(forbiddenTextRule, "plain prose, no marks"),
		).toEqual({
			detail: "none of 2 forbidden strings present",
			kind: "forbidden-text",
			status: "PASS",
		});
	});

	it("fails naming each declared string the reply contains", () => {
		const result = evaluateForbiddenText(
			forbiddenTextRule,
			"an em dash — and a `tick`",
		);

		expect(result.status).toBe("FAIL");
		expect(result.detail).toBe('reply contains "—", "`"');
	});
});
const forbiddenPatternRule = {
	kind: "forbidden-pattern",
	patterns: [
		{
			flags: "i",
			name: "count opener",
			regex: "\\b(two|three|four|a few|one) things?\\b",
		},
		{
			flags: "i",
			name: "closing offer",
			regex: "\\b(want me to|let me know|should i)\\b",
		},
		{
			flags: "m",
			name: "label line",
			regex: "^[A-Z][a-z]+( [a-z]+){0,2}[:.]$",
		},
	],
} as const;
describe(evaluateForbiddenPattern.name, () => {
	it("passes a reply that matches none of the declared patterns", () => {
		expect(
			evaluateForbiddenPattern(forbiddenPatternRule, "The fix is committed."),
		).toEqual({
			detail: "none of 3 forbidden patterns match",
			kind: "forbidden-pattern",
			status: "PASS",
		});
	});

	it("fails naming the pattern that matches and the text it matched", () => {
		expect(
			evaluateForbiddenPattern(forbiddenPatternRule, "Two things wait on you."),
		).toEqual({
			detail: 'reply matches count opener ("Two things")',
			kind: "forbidden-pattern",
			status: "FAIL",
		});
	});

	it("names every matching pattern in declaration order", () => {
		const result = evaluateForbiddenPattern(
			forbiddenPatternRule,
			"Two things wait on you.\n\nThe email is drafted. Want me to send it?",
		);

		expect(result.detail).toBe(
			'reply matches count opener ("Two things"), closing offer ("Want me to")',
		);
	});

	it("applies each pattern's own flags", () => {
		expect(
			evaluateForbiddenPattern(
				forbiddenPatternRule,
				"The fix is committed.\n\nOpen questions.\n\n1. Drop the column?",
			),
		).toEqual({
			detail: 'reply matches label line ("Open questions.")',
			kind: "forbidden-pattern",
			status: "FAIL",
		});
	});
});

const forbiddenPatternCheckSchemaRefusesAPatternThatDoesNotCompileCarryingTheEnginesReason =
	(): void => {
		const parsed = forbiddenPatternCheckSchema.safeParse({
			kind: "forbidden-pattern",
			patterns: [{ name: "unclosed", regex: "(" }],
		});

		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[FIRST_VALIDATION_ISSUE_INDEX]?.message).toMatch(
			/is a regular expression that compiles, and this one does not: ./u,
		);
	};
const forbiddenPatternCheckSchemaRefusesFlagsTheEngineRejects = (): void => {
	const parsed = forbiddenPatternCheckSchema.safeParse({
		kind: "forbidden-pattern",
		patterns: [{ flags: "ii", name: "doubled", regex: "a" }],
	});

	expect(parsed.success).toBe(false);
};
describe("forbiddenPatternCheckSchema", () => {
	it(
		"refuses a pattern that does not compile, carrying the engine's reason",
		forbiddenPatternCheckSchemaRefusesAPatternThatDoesNotCompileCarryingTheEnginesReason,
	);

	it(
		"refuses flags the engine rejects",
		forbiddenPatternCheckSchemaRefusesFlagsTheEngineRejects,
	);
});
