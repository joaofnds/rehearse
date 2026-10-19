import { afterEach, describe, expect, it } from "bun:test";

import {
	RUN,
	RUNNING_TRANSCRIPT,
	clearStageSessionRoots,
	startedStage,
	transcriptOf,
} from "#server/stage-session-test-fixture";

import readStageSession from "./stage-session";

afterEach(clearStageSessionRoots);

const ORDINAL_BASE = 1;

const FIRST_TRANSCRIPT_LINE_INDEX = 0;

async function verifyReadStageSessionNameAnswersARunningStageWithItsTranscriptSRowsAndItsLatestToolCall(): Promise<void> {
	const stage = await startedStage();
	await Bun.write(stage.transcriptFile, transcriptOf(RUNNING_TRANSCRIPT));

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toEqual({
		latestToolCall: "Bash  bun test",
		lineCount: 5,
		lines: [
			{ kind: "user", line: 1, text: "Work TASK-1 with the build skill" },
			{ kind: "assistant", line: 2, text: "Reading the card." },
			{ kind: "tool", line: 3, text: "Read  src/auth/session.ts" },
			{ kind: "result", line: 4, text: "export function session() {}" },
			{ kind: "tool", line: 5, text: "Bash  bun test" },
		],
		state: "running",
	});
}

async function verifyReadStageSessionNameShowsOnlyTheTranscriptSLast200LinesWhileCountingEveryOne(): Promise<void> {
	const stage = await startedStage();
	await Bun.write(
		stage.transcriptFile,
		transcriptOf(
			Array.from({ length: 250 }, (_unused, index) => ({
				message: {
					content: [
						{ text: `step ${String(index + ORDINAL_BASE)}`, type: "text" },
					],
				},
				type: "assistant",
			})),
		),
	);

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toMatchObject({ lineCount: 250, state: "running" });
	expect(
		session.state === "running" &&
			session.lines.at(FIRST_TRANSCRIPT_LINE_INDEX),
	).toEqual({
		kind: "assistant",
		line: 51,
		text: "step 51",
	});
}

async function verifyReadStageSessionNameShowsNoRowForASkillBodyTheProviderMarksAsMeta(): Promise<void> {
	const stage = await startedStage();
	await Bun.write(
		stage.transcriptFile,
		transcriptOf([
			{
				isMeta: true,
				message: {
					content: [
						{
							text: "Base directory for this skill: /skills/build",
							type: "text",
						},
					],
				},
				type: "user",
			},
			{ attachment: { type: "output_style" }, type: "attachment" },
		]),
	);

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toEqual({ lineCount: 2, lines: [], state: "running" });
}

describe(readStageSession.name, () => {
	describe("when the provider transcript is growing", () => {
		it(
			"answers a running stage with its transcript's rows and its latest tool call",
			verifyReadStageSessionNameAnswersARunningStageWithItsTranscriptSRowsAndItsLatestToolCall,
		);
	});

	describe("when the transcript exceeds the visible line count", () => {
		it(
			"shows only the transcript's last 200 lines while counting every one",
			verifyReadStageSessionNameShowsOnlyTheTranscriptSLast200LinesWhileCountingEveryOne,
		);
	});

	describe("when transcript entries contain only metadata", () => {
		it(
			"shows no row for a skill body the provider marks as meta",
			verifyReadStageSessionNameShowsNoRowForASkillBodyTheProviderMarksAsMeta,
		);
	});
});
