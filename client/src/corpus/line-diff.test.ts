import { describe, expect, it } from "bun:test";
import { lineDiff } from "./line-diff";

describe("lineDiff", () => {
	it("keeps unchanged lines and numbers them on both sides", () => {
		expect(lineDiff("a\nb\n", "a\nb\n")).toEqual([
			{ kind: "same", text: "a", before: 1, after: 1 },
			{ kind: "same", text: "b", before: 2, after: 2 },
		]);
	});

	it("shows a changed line as removed then added", () => {
		expect(lineDiff("a\nb\nc\n", "a\nB\nc\n")).toEqual([
			{ kind: "same", text: "a", before: 1, after: 1 },
			{ kind: "removed", text: "b", before: 2 },
			{ kind: "added", text: "B", after: 2 },
			{ kind: "same", text: "c", before: 3, after: 3 },
		]);
	});

	it("numbers lines after an insertion by their new position", () => {
		expect(lineDiff("a\nc\n", "a\nb\nc\n")).toEqual([
			{ kind: "same", text: "a", before: 1, after: 1 },
			{ kind: "added", text: "b", after: 2 },
			{ kind: "same", text: "c", before: 2, after: 3 },
		]);
	});

	it("shows a dropped final newline as a changed last line", () => {
		expect(lineDiff("a\n", "a")).toEqual([
			{ kind: "removed", text: "a", before: 1 },
			{ kind: "added", text: "a", after: 1, noNewline: true },
		]);
	});

	it("diffs an emptied file as every line removed", () => {
		expect(lineDiff("a\nb\n", "")).toEqual([
			{ kind: "removed", text: "a", before: 1 },
			{ kind: "removed", text: "b", before: 2 },
		]);
	});
});
