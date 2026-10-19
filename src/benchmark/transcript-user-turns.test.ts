import { describe, expect, it } from "bun:test";

import { parseTranscript } from "#benchmark/transcript";

import { line, toolResult } from "./transcript-test-fixtures";

function readsWhatEachUserRowIs(): void {
	const transcript = parseTranscript(
		[
			line({ message: { content: "review it" }, type: "user" }),
			line({
				message: {
					content: [{ text: "[Request interrupted by user]", type: "text" }],
				},
				type: "user",
			}),
			line({
				isCompactSummary: true,
				message: { content: "This session is being continued." },
				type: "user",
			}),
			line({ message: { content: [toolResult("toolu_1")] }, type: "user" }),
			line({
				message: { content: "<task-notification>" },
				origin: { kind: "task-notification" },
				type: "user",
			}),
		].join("\n"),
	);

	expect(transcript.map(({ userTurn }) => userTurn)).toEqual([
		"prompt",
		"interruption",
		"compaction summary",
		undefined,
		"task notification",
	]);
}

describe(parseTranscript.name, () => {
	it("reads what each user row is", readsWhatEachUserRowIs);
});
