import { describe, expect, it } from "bun:test";

import {
	transcriptInstructionLoads,
	transcriptInstructionLoadsFromLines,
} from "#benchmark/transcript-instruction-loads";

function asLines(text: string): ReadableStream<string> {
	return new ReadableStream<string>({
		start(controller) {
			for (const line of text.split("\n")) {
				controller.enqueue(line);
			}
			controller.close();
		},
	});
}

function attachmentRow(files: readonly unknown[]): string {
	return JSON.stringify({
		attachment: { files, type: "instructions" },
		timestamp: "2026-09-14T00:00:01.000Z",
		type: "attachment",
	});
}

function carriesPathAndTypeFromTheInstructionsAttachment(): void {
	const loads = transcriptInstructionLoads(
		attachmentRow([
			{
				content: "# How work is done here",
				path: "/Users/someone/.claude/CLAUDE.md",
				type: "User",
			},
			{
				content: "# Working on it",
				path: "/tmp/project/CLAUDE.md",
				type: "Project",
			},
		]),
	);

	expect(loads).toEqual({
		loads: [
			{
				filePath: "/Users/someone/.claude/CLAUDE.md",
				loadReason: { state: "unavailable" },
				memoryType: "User",
				parentFilePath: { state: "unavailable" },
				triggerFilePath: { state: "unavailable" },
			},
			{
				filePath: "/tmp/project/CLAUDE.md",
				loadReason: { state: "unavailable" },
				memoryType: "Project",
				parentFilePath: { state: "unavailable" },
				triggerFilePath: { state: "unavailable" },
			},
		],
		state: "available",
	});
}

function reportsLoadsUnavailableWhenTheTranscriptCarriesNoInstructionsAttachment(): void {
	const loads = transcriptInstructionLoads(
		JSON.stringify({
			attachment: {
				files: [{ content: "x", path: "/tmp/other.md", type: "Project" }],
				type: "nested_memory",
			},
			type: "attachment",
		}),
	);

	expect(loads).toEqual({ state: "unavailable" });
}

function reportsAnAttachmentCarryingNoFilesAsAvailableWithNoLoads(): void {
	const loads = transcriptInstructionLoads(attachmentRow([]));

	expect(loads).toEqual({ loads: [], state: "available" });
}

function selectsOnTheAttachmentTypeRatherThanThePresenceOfFiles(): void {
	const loads = transcriptInstructionLoads(
		[
			JSON.stringify({
				attachment: {
					files: [{ content: "x", path: "/tmp/nested.md", type: "Project" }],
					type: "nested_memory",
				},
				type: "attachment",
			}),
			attachmentRow([{ content: "y", path: "/tmp/real.md", type: "Project" }]),
		].join("\n"),
	);

	expect(
		loads.state === "available" && loads.loads.map((load) => load.filePath),
	).toEqual(["/tmp/real.md"]);
}

async function readsTheSameLoadsFromStreamedLinesAsFromWholeText(): Promise<void> {
	const transcript = attachmentRow([
		{ content: "# it", path: "/tmp/project/CLAUDE.md", type: "Project" },
	]);

	const streamed = await transcriptInstructionLoadsFromLines(
		asLines(transcript),
	);

	expect(streamed).toEqual(transcriptInstructionLoads(transcript));
}

async function reportsLoadsUnavailableWhenNoStreamedLineCarriesTheAttachment(): Promise<void> {
	const streamed = await transcriptInstructionLoadsFromLines(
		asLines(JSON.stringify({ type: "assistant" })),
	);

	expect(streamed).toEqual({ state: "unavailable" });
}

describe(transcriptInstructionLoads.name, () => {
	it(
		"carries path and type from the instructions attachment",
		carriesPathAndTypeFromTheInstructionsAttachment,
	);
	it(
		"reports loads unavailable when the transcript carries no instructions attachment",
		reportsLoadsUnavailableWhenTheTranscriptCarriesNoInstructionsAttachment,
	);
	it(
		"reports an attachment carrying no files as available with no loads",
		reportsAnAttachmentCarryingNoFilesAsAvailableWithNoLoads,
	);
	it(
		"selects on the attachment type rather than the presence of files",
		selectsOnTheAttachmentTypeRatherThanThePresenceOfFiles,
	);
});
describe(transcriptInstructionLoadsFromLines.name, () => {
	it(
		"reads the same loads from streamed lines as from whole text",
		readsTheSameLoadsFromStreamedLinesAsFromWholeText,
	);
	it(
		"reports loads unavailable when no streamed line carries the attachment",
		reportsLoadsUnavailableWhenNoStreamedLineCarriesTheAttachment,
	);
});
