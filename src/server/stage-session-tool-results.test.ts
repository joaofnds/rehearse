import { afterEach, describe, expect, it } from "bun:test";

import {
	RUN,
	clearStageSessionRoots,
	startedStage,
	toolResultTranscript,
	transcriptOf,
} from "#server/stage-session-test-fixture";

import readStageSession from "./stage-session";

afterEach(clearStageSessionRoots);

const TEXT_PREVIEW_FIXTURE_OVERSIZED_CHARACTERS = 1001;

const TEXT_PREVIEW_FIXTURE_VISIBLE_CHARACTERS = 1000;

async function verifyReadStageSessionNameCutsARowSTextAfterItsFirst1000Characters(): Promise<void> {
	const stage = await startedStage();
	await Bun.write(
		stage.transcriptFile,
		transcriptOf([
			{
				message: {
					content: [
						{
							text: "a".repeat(TEXT_PREVIEW_FIXTURE_OVERSIZED_CHARACTERS),
							type: "text",
						},
					],
				},
				type: "assistant",
			},
		]),
	);

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toMatchObject({
		lines: [
			{ text: `${"a".repeat(TEXT_PREVIEW_FIXTURE_VISIBLE_CHARACTERS)}…` },
		],
		state: "running",
	});
}

async function verifyReadStageSessionNameShowsAToolResultWithoutTheTerminalSColorCodes(): Promise<void> {
	const stage = await startedStage();
	await Bun.write(
		stage.transcriptFile,
		toolResultTranscript("\u001B[31m[Nest] 75226  - \u001B[39mstarting tests"),
	);

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toMatchObject({
		lines: [{ text: "[Nest] 75226  - starting tests" }],
		state: "running",
	});
}

async function verifyReadStageSessionNameShowsTheFirstLineWithTextWhenColorCodesAloneLeadAToolResult(): Promise<void> {
	const stage = await startedStage();
	await Bun.write(
		stage.transcriptFile,
		toolResultTranscript("\u001B[31m\n[Nest] starting tests"),
	);

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toMatchObject({
		lines: [{ text: "[Nest] starting tests" }],
		state: "running",
	});
}

async function verifyReadStageSessionNameCountsOnlyTheCharactersARowShowsTowardIts1000CharacterCut(): Promise<void> {
	const stage = await startedStage();
	await Bun.write(
		stage.transcriptFile,
		toolResultTranscript(
			`\u001B[31m${"a".repeat(TEXT_PREVIEW_FIXTURE_VISIBLE_CHARACTERS)}`,
		),
	);

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toMatchObject({
		lines: [{ text: "a".repeat(TEXT_PREVIEW_FIXTURE_VISIBLE_CHARACTERS) }],
		state: "running",
	});
}

async function verifyReadStageSessionNameShowsNoRowForAToolResultOfColorCodesAlone(): Promise<void> {
	const stage = await startedStage();
	await Bun.write(stage.transcriptFile, toolResultTranscript("\u001B[39m"));

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toEqual({ lineCount: 1, lines: [], state: "running" });
}

async function verifyReadStageSessionNameReadsAToolResultTheProviderWritesAsBlocksByItsFirstText(): Promise<void> {
	const stage = await startedStage();
	await Bun.write(
		stage.transcriptFile,
		transcriptOf([
			{
				message: {
					content: [
						{
							content: [
								{ type: "image" },
								{ text: "3 files changed\nthe rest", type: "text" },
							],
							tool_use_id: "t1",
							type: "tool_result",
						},
					],
				},
				type: "user",
			},
		]),
	);

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toEqual({
		lineCount: 1,
		lines: [{ kind: "result", line: 1, text: "3 files changed" }],
		state: "running",
	});
}

describe(readStageSession.name, () => {
	describe("when row text exceeds the preview length", () => {
		it(
			"cuts a row's text after its first 1,000 characters",
			verifyReadStageSessionNameCutsARowSTextAfterItsFirst1000Characters,
		);
	});

	describe("when tool results contain terminal color codes", () => {
		it(
			"shows a tool result without the terminal's color codes",
			verifyReadStageSessionNameShowsAToolResultWithoutTheTerminalSColorCodes,
		);

		it(
			"shows the first line with text when color codes alone lead a tool result",
			verifyReadStageSessionNameShowsTheFirstLineWithTextWhenColorCodesAloneLeadAToolResult,
		);

		it(
			"counts only the characters a row shows toward its 1,000-character cut",
			verifyReadStageSessionNameCountsOnlyTheCharactersARowShowsTowardIts1000CharacterCut,
		);

		it(
			"shows no row for a tool result of color codes alone",
			verifyReadStageSessionNameShowsNoRowForAToolResultOfColorCodesAlone,
		);
	});

	describe("when the provider writes a tool result as blocks", () => {
		it(
			"reads a tool result the provider writes as blocks by its first text",
			verifyReadStageSessionNameReadsAToolResultTheProviderWritesAsBlocksByItsFirstText,
		);
	});
});
