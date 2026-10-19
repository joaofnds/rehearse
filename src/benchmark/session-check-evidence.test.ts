import { describe, expect, it } from "bun:test";

import type { Check, CheckEvidence } from "#benchmark/session-check";
import { evaluateChecks } from "#benchmark/session-check";
import { evaluateFilesRead } from "#benchmark/session-check-files-read";
import { evaluateToolCalls } from "#benchmark/session-check-tool-calls";
import type { ToolUse } from "#benchmark/transcript";

import type { Immutable } from "./contracts";

const RETAINED_PASSING_CHECK_COUNT = 4;

const PREFIX_START_INDEX = 0;
function read(path: string): ToolUse {
	return { input: { file_path: path }, name: "Read", type: "tool_use" };
}
function call(name: string): ToolUse {
	return { input: {}, name, type: "tool_use" };
}
class CheckEvidenceBuilder {
	readonly #values: Immutable<Partial<CheckEvidence>>;
	public constructor(values: Immutable<Partial<CheckEvidence>> = {}) {
		this.#values = values;
	}
	public build(): Immutable<CheckEvidence> {
		return {
			reply: this.#values.reply ?? "OK",
			toolUses: [...(this.#values.toolUses ?? [])],
		};
	}
}
const evaluateToolCallsPassesATranscriptWithNoToolCallsAgainstMax0 =
	(): void => {
		expect(evaluateToolCalls({ kind: "tool-calls", max: 0 }, [])).toEqual({
			detail: "0 tool calls",
			kind: "tool-calls",
			status: "PASS",
		});
	};
const evaluateToolCallsFailsACountAboveMaxNamingTheCountAndTheBound =
	(): void => {
		const result = evaluateToolCalls({ kind: "tool-calls", max: 1 }, [
			call("Read"),
			call("Bash"),
		]);

		expect(result).toEqual({
			detail: "2 tool calls, more than 1",
			kind: "tool-calls",
			status: "FAIL",
		});
	};
const evaluateToolCallsFailsACountBelowMinNamingTheCountAndTheBound =
	(): void => {
		const result = evaluateToolCalls({ kind: "tool-calls", min: 2 }, [
			call("Read"),
		]);

		expect(result).toEqual({
			detail: "1 tool calls, fewer than 2",
			kind: "tool-calls",
			status: "FAIL",
		});
	};
const evaluateToolCallsFailsACallNamingAToolOutsideTheDeclaredNamesNamingIt =
	(): void => {
		const result = evaluateToolCalls({ kind: "tool-calls", names: ["Read"] }, [
			call("Read"),
			call("Bash"),
		]);

		expect(result).toEqual({
			detail: "undeclared tool called: Bash",
			kind: "tool-calls",
			status: "FAIL",
		});
	};
describe(evaluateToolCalls.name, () => {
	it(
		"passes a transcript with no tool calls against max 0",
		evaluateToolCallsPassesATranscriptWithNoToolCallsAgainstMax0,
	);

	it(
		"fails a count above max, naming the count and the bound",
		evaluateToolCallsFailsACountAboveMaxNamingTheCountAndTheBound,
	);

	it(
		"fails a count below min, naming the count and the bound",
		evaluateToolCallsFailsACountBelowMinNamingTheCountAndTheBound,
	);

	it(
		"fails a call naming a tool outside the declared names, naming it",
		evaluateToolCallsFailsACallNamingAToolOutsideTheDeclaredNamesNamingIt,
	);
});
describe(evaluateFilesRead.name, () => {
	const check = { kind: "files-read", paths: ["/a.md", "/b.md"] } as const;

	it("passes when every declared path is the file_path of a Read call", () => {
		expect(
			evaluateFilesRead(check, [read("/a.md"), call("Bash"), read("/b.md")]),
		).toEqual({
			detail: "read /a.md, /b.md",
			kind: "files-read",
			status: "PASS",
		});
	});

	it("fails naming each declared path that was never read", () => {
		expect(evaluateFilesRead(check, [read("/a.md")])).toEqual({
			detail: "never read /b.md",
			kind: "files-read",
			status: "FAIL",
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
		const result = evaluateChecks(
			passing.slice(PREFIX_START_INDEX, RETAINED_PASSING_CHECK_COUNT),
			new CheckEvidenceBuilder({ reply: "OK" }).build(),
		);

		expect(result.outcome).toBe("SUCCESSFUL");
		expect(result.failed).toEqual([]);
	});

	it("reports the attempt unsuccessful and names the one failing check", () => {
		const expectedResultCount = 5;

		const result = evaluateChecks(
			passing,
			new CheckEvidenceBuilder({ reply: "OK" }).build(),
		);

		expect(result.outcome).toBe("UNSUCCESSFUL");
		expect(result.results).toHaveLength(expectedResultCount);
		expect(result.failed).toEqual([
			{ detail: "never read /a.md", kind: "files-read", status: "FAIL" },
		]);
	});
});
