import { describe, expect, it } from "bun:test";

import { outputStyles, parseTranscript } from "#benchmark/transcript";

import { attachmentLine, line } from "./transcript-test-fixtures";

function returnsTheStyleNameOfEveryOutputStyleAttachmentInOrder(): void {
	const transcript = parseTranscript(
		[
			attachmentLine({ style: "brief", type: "output_style" }),
			attachmentLine({ names: ["verify"], type: "skill_listing" }),
			attachmentLine({ style: "concise", type: "output_style" }),
		].join("\n"),
	);

	expect(outputStyles(transcript)).toEqual(["brief", "concise"]);
}

function returnsNothingForATranscriptWithNoOutputStyleAttachment(): void {
	const styles = outputStyles(
		parseTranscript(attachmentLine({ type: "budget_usd" })),
	);
	expect(styles).toEqual([]);
}

function returnsNothingForARecordTypeItDoesNotRecognize(): void {
	const styles = outputStyles(
		parseTranscript(
			line({ payload: { anything: true }, type: "future-record-kind" }),
		),
	);
	expect(styles).toEqual([]);
}

describe(outputStyles.name, () => {
	it(
		"returns the style name of every output_style attachment in order",
		returnsTheStyleNameOfEveryOutputStyleAttachmentInOrder,
	);
	it(
		"returns nothing for a transcript with no output_style attachment",
		returnsNothingForATranscriptWithNoOutputStyleAttachment,
	);
	it(
		"returns nothing for a record type it does not recognize",
		returnsNothingForARecordTypeItDoesNotRecognize,
	);
});
