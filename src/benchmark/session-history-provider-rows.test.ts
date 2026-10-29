import { describe, expect, it } from "bun:test";

import type { JsonValue } from "#benchmark/json-value";
import { sessionHistoryReport } from "#benchmark/session-history";
import type { SessionHistoryReport } from "#benchmark/session-history";

import { call, row } from "./session-history-event-test-fixtures";
import { sessionAttempt } from "./session-history-test-identities";

function readsAMixedProviderTranscriptComplete(): void {
	const transcript = [
		row({ message: { content: "Summarise the notes." }, type: "user" }),
		row({
			attachment: { content: "skills: review", type: "skill_listing" },
			type: "attachment",
		}),
		row({
			message: {
				content: [
					{ signature: "sig", thinking: "", type: "thinking" },
					{ text: "Done.", type: "text" },
				],
			},
			type: "assistant",
		}),
		row({ lastPrompt: "Summarise the notes.", type: "last-prompt" }),
		row({ operation: "enqueue", type: "queue-operation" }),
	].join("\n");

	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript,
	});

	expect(report.evidence).toEqual({ state: "complete" });
	expect(
		report.attemptEvents
			.map(({ label }) => label)
			.filter((label) => label.startsWith("Attachment")),
	).toEqual(["Attachment · skill_listing"]);
}

function knownBoundaryReport(rows: readonly string[]): SessionHistoryReport {
	return sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript: rows.join("\n"),
	});
}

function showsEachAttachmentOnceByKindWithItsSizeUnavailable(): void {
	const report = knownBoundaryReport([
		row({
			attachment: { content: "today is Thursday", type: "date" },
			type: "attachment",
		}),
	]);

	expect(report.attemptEvents).toEqual([
		expect.objectContaining({
			id: "1:1",
			kind: "unclassified",
			label: "Attachment · date",
			measurement: {
				reasons: [
					"the provider renders the attachment and the transcript does not record the delivered text",
				],
				state: "unavailable",
			},
		}),
	]);
	expect(report.sources).toEqual([
		expect.objectContaining({ observedDeliveryCount: 0 }),
	]);
}

function addsNoEventForABodilessProviderRow(): void {
	const report = knownBoundaryReport([
		row({ subtype: "stop_hook_summary", type: "system" }),
	]);

	expect(report.attemptEvents).toEqual([]);
}

function readsARequestBlobAsMetadata(): void {
	const report = knownBoundaryReport([
		row(call("bash-1", "Bash", { command: "pwd" })),
		row({
			message: { content: [{ text: "pwd", type: "text" }] },
			type: "api-request-blob",
		}),
	]);

	expect(report.attemptEvents.map(({ id }) => id)).toEqual(["1:1"]);
	expect(report.evidence).toEqual({ state: "complete" });
}

const NON_FILE_TOOL_RESULTS = [
	{ holding: "a string", toolUseResult: "Error: exit code 1" },
	{ holding: "a list", toolUseResult: [{ text: "out", type: "text" }] },
	{
		holding: "an image object",
		toolUseResult: {
			file: { base64: "iVBORw0K", type: "image/png" },
			type: "image",
		},
	},
] as const;

function readsAToolResultWhateverToolUseResultHolds({
	toolUseResult,
}: (typeof NON_FILE_TOOL_RESULTS)[number]): void {
	const report = knownBoundaryReport([
		row(call("bash-1", "Bash", { command: "false" })),
		row({
			message: {
				content: [
					{
						content: "Error: exit code 1",
						is_error: true,
						tool_use_id: "bash-1",
						type: "tool_result",
					},
				],
			},
			toolUseResult,
			type: "user",
		}),
	]);

	expect(
		report.attemptEvents.map(({ kind, state }) => ({ kind, state })),
	).toEqual([
		{ kind: "call", state: "invoked" },
		{ kind: "result", state: "failed" },
	]);
}

function assistantThinking(block: JsonValue): string {
	return row({ message: { content: [block] }, type: "assistant" });
}

function measuresThinkingFromItsText(): void {
	const report = knownBoundaryReport([
		assistantThinking({ signature: "sig", thinking: "plan", type: "thinking" }),
	]);

	expect(report.attemptEvents).toEqual([
		expect.objectContaining({
			label: "Thinking",
			measurement: { characters: 4, state: "complete" },
		}),
	]);
	expect(report.evidence).toEqual({ state: "complete" });
}

const UNRECORDED_THINKING = [
	{
		block: { signature: "sig", thinking: "", type: "thinking" },
		label: "Thinking",
	},
	{
		block: { data: "opaque", type: "redacted_thinking" },
		label: "Redacted thinking",
	},
] as const;

function reportsUnrecordedThinkingSizeUnavailable({
	block,
	label,
}: (typeof UNRECORDED_THINKING)[number]): void {
	const report = knownBoundaryReport([assistantThinking(block)]);

	expect(report.attemptEvents).toEqual([
		expect.objectContaining({
			label,
			measurement: {
				reasons: ["the provider did not record the thinking text"],
				state: "unavailable",
			},
		}),
	]);
	expect(report.evidence).toEqual({ state: "complete" });
}

const UNREADABLE_ROWS = [
	{ name: "an unparseable line", text: "not json" },
	{ name: "a row the row schema rejects", text: row({ cwd: 7, type: "user" }) },
	{
		name: "an attachment row without a string kind",
		text: row({ attachment: { type: 3 }, type: "attachment" }),
	},
	{
		name: "a non-turn row carrying a message",
		text: row({ message: { content: "loaded text" }, type: "future-kind" }),
	},
	{
		name: "a row without a type carrying a message",
		text: row({ message: { content: "loaded text" } }),
	},
	{
		name: "a row without a type or a message",
		text: row({ note: "loaded text" }),
	},
	{ name: "a turn without a message", text: row({ type: "user" }) },
	{
		name: "an attachment row with an empty kind",
		text: row({ attachment: { type: "" }, type: "attachment" }),
	},
	{
		name: "an attachment row carrying a message",
		text: row({
			attachment: { type: "date" },
			message: { content: "loaded text" },
			type: "attachment",
		}),
	},
	{
		name: "a content block of an unknown type",
		text: row({ message: { content: [{ type: "hologram" }] }, type: "user" }),
	},
] as const;

function namesTheRowItCannotRead({
	text,
}: (typeof UNREADABLE_ROWS)[number]): void {
	expect(knownBoundaryReport([text]).evidence).toEqual({
		reasons: ["unsupported content at 1:1"],
		state: "partial",
	});
}

describe(sessionHistoryReport.name, () => {
	it(
		"reads a mixed provider transcript complete",
		readsAMixedProviderTranscriptComplete,
	);
	it(
		"shows each attachment once by kind with its size unavailable",
		showsEachAttachmentOnceByKindWithItsSizeUnavailable,
	);
	it(
		"adds no event for a bodiless provider row",
		addsNoEventForABodilessProviderRow,
	);
	it("reads a request blob as metadata", readsARequestBlobAsMetadata);
	it("measures thinking from its text", measuresThinkingFromItsText);
	it.each([...UNRECORDED_THINKING])(
		"reports $label size unavailable when its text is not recorded",
		reportsUnrecordedThinkingSizeUnavailable,
	);

	describe("when toolUseResult is not a Read file", () => {
		it.each([...NON_FILE_TOOL_RESULTS])(
			"reads a failed tool result when it holds $holding",
			readsAToolResultWhateverToolUseResultHolds,
		);
	});

	describe("when a row cannot be read", () => {
		it.each([...UNREADABLE_ROWS])(
			"reads partial naming $name",
			namesTheRowItCannotRead,
		);
	});
});
