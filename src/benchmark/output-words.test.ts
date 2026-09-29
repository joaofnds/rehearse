import { describe, expect, it } from "bun:test";
import { replyWords, stageOutputWords } from "./output-words";

describe(replyWords.name, () => {
	it("counts the words of a recorded reply", () => {
		expect(replyWords("Done.\n\nThree files  changed")).toEqual({
			state: "available",
			words: 4,
		});
	});

	it("reads unavailable, not zero, when the attempt recorded no reply", () => {
		expect(replyWords(undefined)).toEqual({
			state: "unavailable",
			reason: "the attempt recorded no reply",
		});
	});
});

describe(stageOutputWords.name, () => {
	it("counts the words of the stage's artifact, the output its judge read", () => {
		expect(
			stageOutputWords({
				artifact: { content: "# Spec\nShip the export" },
				diff: "+ignored words here",
			}),
		).toEqual({ state: "available", words: 5 });
	});

	it("reads unavailable when a delivery stage's only output is a diff", () => {
		expect(stageOutputWords({ diff: "+one\n+two" })).toEqual({
			state: "unavailable",
			reason: "the stage's only output is a diff",
		});
	});

	it("reads unavailable when the stage recorded no output", () => {
		expect(stageOutputWords({})).toEqual({
			state: "unavailable",
			reason: "the stage recorded no output",
		});
	});
});
