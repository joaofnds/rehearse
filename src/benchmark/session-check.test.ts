import { describe, expect, it } from "bun:test";
import type { Check, CheckEvidence } from "#benchmark/session-check";
import { evaluateChecks } from "#benchmark/session-check";
import { evaluateFilesRead } from "#benchmark/session-check-files-read";
import {
	evaluateForbiddenPattern,
	forbiddenPatternCheckSchema,
} from "#benchmark/session-check-forbidden-pattern";
import { evaluateForbiddenText } from "#benchmark/session-check-forbidden-text";
import { evaluateToolCalls } from "#benchmark/session-check-tool-calls";
import { evaluateWordBand } from "#benchmark/session-check-word-band";
import type { Immutable } from "#benchmark/contracts";
import type { ToolUse } from "#benchmark/transcript";

function read(path: string): ToolUse {
	return { type: "tool_use", name: "Read", input: { file_path: path } };
}

function call(name: string): ToolUse {
	return { type: "tool_use", name, input: {} };
}

function evidence(
	reply: string,
	uses: Immutable<readonly ToolUse[]> = [],
): CheckEvidence {
	return { reply, toolUses: [...uses] };
}

describe(evaluateWordBand.name, () => {
	it.each([
		["one two", 3, 5, "FAIL", "2 words outside 3 to 5"],
		["one two three", 3, 5, "PASS", "3 words within 3 to 5"],
		["one two three four five", 3, 5, "PASS", "5 words within 3 to 5"],
		["one two three four five six", 3, 5, "FAIL", "6 words outside 3 to 5"],
	] as const)(
		"reports %s against a band of %p to %p as %s",
		(reply, min, max, status, detail) => {
			expect(evaluateWordBand({ kind: "word-band", min, max }, reply)).toEqual({
				kind: "word-band",
				status,
				detail,
			});
		},
	);

	it("reports a band that declares only max against its count", () => {
		expect(evaluateWordBand({ kind: "word-band", max: 1 }, "OK")).toEqual({
			kind: "word-band",
			status: "PASS",
			detail: "1 words within at most 1",
		});
	});
});

describe(evaluateForbiddenText.name, () => {
	const check = { kind: "forbidden-text", strings: ["—", "`"] } as const;

	it("passes a reply that contains none of the declared strings", () => {
		expect(evaluateForbiddenText(check, "plain prose, no marks")).toEqual({
			kind: "forbidden-text",
			status: "PASS",
			detail: "none of 2 forbidden strings present",
		});
	});

	it("fails naming each declared string the reply contains", () => {
		const result = evaluateForbiddenText(check, "an em dash — and a `tick`");

		expect(result.status).toBe("FAIL");
		expect(result.detail).toBe('reply contains "—", "`"');
	});
});

describe(evaluateForbiddenPattern.name, () => {
	const check = {
		kind: "forbidden-pattern",
		patterns: [
			{
				name: "count opener",
				regex: "\\b(two|three|four|a few|one) things?\\b",
				flags: "i",
			},
			{
				name: "closing offer",
				regex: "\\b(want me to|let me know|should i)\\b",
				flags: "i",
			},
			{
				name: "label line",
				regex: "^[A-Z][a-z]+( [a-z]+){0,2}[:.]$",
				flags: "m",
			},
		],
	} as const;

	it("passes a reply that matches none of the declared patterns", () => {
		expect(evaluateForbiddenPattern(check, "The fix is committed.")).toEqual({
			kind: "forbidden-pattern",
			status: "PASS",
			detail: "none of 3 forbidden patterns match",
		});
	});

	it("fails naming the pattern that matches and the text it matched", () => {
		expect(evaluateForbiddenPattern(check, "Two things wait on you.")).toEqual({
			kind: "forbidden-pattern",
			status: "FAIL",
			detail: 'reply matches count opener ("Two things")',
		});
	});

	it("names every matching pattern in declaration order", () => {
		const result = evaluateForbiddenPattern(
			check,
			"Two things wait on you.\n\nThe email is drafted. Want me to send it?",
		);

		expect(result.detail).toBe(
			'reply matches count opener ("Two things"), closing offer ("Want me to")',
		);
	});

	it("applies each pattern's own flags", () => {
		expect(
			evaluateForbiddenPattern(
				check,
				"The fix is committed.\n\nOpen questions.\n\n1. Drop the column?",
			),
		).toEqual({
			kind: "forbidden-pattern",
			status: "FAIL",
			detail: 'reply matches label line ("Open questions.")',
		});
	});
});

describe("forbiddenPatternCheckSchema", () => {
	it("refuses a pattern that does not compile, carrying the engine's reason", () => {
		const parsed = forbiddenPatternCheckSchema.safeParse({
			kind: "forbidden-pattern",
			patterns: [{ name: "unclosed", regex: "(" }],
		});

		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[0]?.message).toMatch(
			/is a regular expression that compiles, and this one does not: ./u,
		);
	});

	it("refuses flags the engine rejects", () => {
		const parsed = forbiddenPatternCheckSchema.safeParse({
			kind: "forbidden-pattern",
			patterns: [{ name: "doubled", regex: "a", flags: "ii" }],
		});

		expect(parsed.success).toBe(false);
	});
});

describe(evaluateToolCalls.name, () => {
	it("passes a transcript with no tool calls against max 0", () => {
		expect(evaluateToolCalls({ kind: "tool-calls", max: 0 }, [])).toEqual({
			kind: "tool-calls",
			status: "PASS",
			detail: "0 tool calls",
		});
	});

	it("fails a count above max, naming the count and the bound", () => {
		const result = evaluateToolCalls({ kind: "tool-calls", max: 1 }, [
			call("Read"),
			call("Bash"),
		]);

		expect(result).toEqual({
			kind: "tool-calls",
			status: "FAIL",
			detail: "2 tool calls, more than 1",
		});
	});

	it("fails a count below min, naming the count and the bound", () => {
		const result = evaluateToolCalls({ kind: "tool-calls", min: 2 }, [
			call("Read"),
		]);

		expect(result).toEqual({
			kind: "tool-calls",
			status: "FAIL",
			detail: "1 tool calls, fewer than 2",
		});
	});

	it("fails a call naming a tool outside the declared names, naming it", () => {
		const result = evaluateToolCalls({ kind: "tool-calls", names: ["Read"] }, [
			call("Read"),
			call("Bash"),
		]);

		expect(result).toEqual({
			kind: "tool-calls",
			status: "FAIL",
			detail: "undeclared tool called: Bash",
		});
	});
});

describe(evaluateFilesRead.name, () => {
	const check = { kind: "files-read", paths: ["/a.md", "/b.md"] } as const;

	it("passes when every declared path is the file_path of a Read call", () => {
		expect(
			evaluateFilesRead(check, [read("/a.md"), call("Bash"), read("/b.md")]),
		).toEqual({
			kind: "files-read",
			status: "PASS",
			detail: "read /a.md, /b.md",
		});
	});

	it("fails naming each declared path that was never read", () => {
		expect(evaluateFilesRead(check, [read("/a.md")])).toEqual({
			kind: "files-read",
			status: "FAIL",
			detail: "never read /b.md",
		});
	});
});

describe(evaluateChecks.name, () => {
	const passing: readonly Check[] = [
		{ kind: "word-band", max: 5 },
		{ kind: "forbidden-text", strings: ["—"] },
		{
			kind: "forbidden-pattern",
			patterns: [{ name: "offer", regex: "want me" }],
		},
		{ kind: "tool-calls", max: 0 },
		{ kind: "files-read", paths: ["/a.md"] },
	];

	it("reports the attempt successful when every check passes", () => {
		const result = evaluateChecks(passing.slice(0, 4), evidence("OK"));

		expect(result.outcome).toBe("SUCCESSFUL");
		expect(result.failed).toEqual([]);
	});

	it("reports the attempt unsuccessful and names the one failing check", () => {
		const result = evaluateChecks(passing, evidence("OK"));

		expect(result.outcome).toBe("UNSUCCESSFUL");
		expect(result.results).toHaveLength(5);
		expect(result.failed).toEqual([
			{ kind: "files-read", status: "FAIL", detail: "never read /a.md" },
		]);
	});
});
