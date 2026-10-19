import { describe, expect, it } from "bun:test";

import lineDiff from "./line-diff";

describe("lineDiff", () => {
	it("keeps unchanged lines and numbers them on both sides", () => {
		expect(lineDiff("a\nb\n", "a\nb\n")).toEqual([
			{ after: 1, before: 1, kind: "same", text: "a" },
			{ after: 2, before: 2, kind: "same", text: "b" },
		]);
	});

	it("shows a changed line as removed then added", () => {
		expect(lineDiff("a\nb\nc\n", "a\nB\nc\n")).toEqual([
			{ after: 1, before: 1, kind: "same", text: "a" },
			{ before: 2, kind: "removed", text: "b" },
			{ after: 2, kind: "added", text: "B" },
			{ after: 3, before: 3, kind: "same", text: "c" },
		]);
	});

	it("numbers lines after an insertion by their new position", () => {
		expect(lineDiff("a\nc\n", "a\nb\nc\n")).toEqual([
			{ after: 1, before: 1, kind: "same", text: "a" },
			{ after: 2, kind: "added", text: "b" },
			{ after: 3, before: 2, kind: "same", text: "c" },
		]);
	});

	it("shows a dropped final newline as a changed last line", () => {
		expect(lineDiff("a\n", "a")).toEqual([
			{ before: 1, kind: "removed", text: "a" },
			{ after: 1, kind: "added", noNewline: true, text: "a" },
		]);
	});

	it("diffs an emptied file as every line removed", () => {
		expect(lineDiff("a\nb\n", "")).toEqual([
			{ before: 1, kind: "removed", text: "a" },
			{ before: 2, kind: "removed", text: "b" },
		]);
	});

	it("compares no texts holding more line pairs than it can hold", () => {
		const file = { line: "line\n", lineCount: 2001 };
		const text = file.line.repeat(file.lineCount);

		expect(lineDiff(text, text)).toBeUndefined();
	});
});
