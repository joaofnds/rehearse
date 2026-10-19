import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import {
	RUN,
	SESSION_ID,
	clearStageSessionRoots,
	startStageSessionApi,
	startedStage,
	transcriptOf,
} from "#server/stage-session-test-fixture";

afterEach(clearStageSessionRoots);

async function verifyGETApiRunsRunStagesStageSessionAnswersWithTheStageSSessionAsTheReaderShowsIt(): Promise<void> {
	const stage = await startedStage();
	await Bun.write(
		stage.transcriptFile,
		transcriptOf([
			{
				message: { content: [{ text: "Reading the card.", type: "text" }] },
				type: "assistant",
			},
		]),
	);
	const api = await startStageSessionApi(stage);

	const response = await api.savedEvidence.stageSession({
		run: RUN,
		stage: "build",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toEqual({
		lineCount: 1,
		lines: [{ kind: "assistant", line: 1, text: "Reading the card." }],
		state: "running",
	});
}

async function verifyGETApiRunsRunStagesStageSessionRefusalsRefusesARecordedSessionIdThatIsNotAUuid(): Promise<void> {
	const stage = await startedStage("not-a-uuid");
	await Bun.write(stage.transcriptFile, transcriptOf([]));
	const api = await startStageSessionApi(stage);

	const response = await api.savedEvidence.stageSession({
		run: RUN,
		stage: "build",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
}

async function verifyGETApiRunsRunStagesStageSessionRefusalsRefusesATranscriptThatLinksOutOfTheProjectsDirectory(): Promise<void> {
	const stage = await startedStage();
	const outside = join(stage.runsDirectory, "outside.jsonl");
	await Bun.write(outside, transcriptOf([]));
	await symlink(outside, stage.transcriptFile);
	const api = await startStageSessionApi(stage);

	const response = await api.savedEvidence.stageSession({
		run: RUN,
		stage: "build",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
}

async function verifyGETApiRunsRunStagesStageSessionRefusalsRefusesAProjectDirectoryThatLinksOutOfTheProjectsDirectory(): Promise<void> {
	const stage = await startedStage();
	const outside = join(stage.runsDirectory, "outside-project");
	await mkdir(outside);
	await Bun.write(join(outside, `${SESSION_ID}.jsonl`), transcriptOf([]));
	const projectDirectory = join(stage.transcriptFile, "..");
	await rm(projectDirectory, { recursive: true });
	await symlink(outside, projectDirectory);
	const api = await startStageSessionApi(stage);

	const response = await api.savedEvidence.stageSession({
		run: RUN,
		stage: "build",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
}

async function verifyGETApiRunsRunStagesStageSessionRefusalsAnswers404ForAStageTheRunSPipelineDoesNotHave(): Promise<void> {
	const stage = await startedStage();
	const api = await startStageSessionApi(stage);

	const response = await api.savedEvidence.stageSession({
		run: RUN,
		stage: "deploy",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
}

describe("/api/runs/:run/stages/:stage/session", () => {
	describe("GET", () => {
		describe("when the stage transcript is available", () => {
			it(
				"answers with the stage's session as the reader shows it",
				verifyGETApiRunsRunStagesStageSessionAnswersWithTheStageSSessionAsTheReaderShowsIt,
			);
		});

		describe("when the recorded session identity is malformed", () => {
			it(
				"refuses a recorded session id that is not a uuid",
				verifyGETApiRunsRunStagesStageSessionRefusalsRefusesARecordedSessionIdThatIsNotAUuid,
			);
		});

		describe("when the transcript links outside the projects directory", () => {
			it(
				"refuses a transcript that links out of the projects directory",
				verifyGETApiRunsRunStagesStageSessionRefusalsRefusesATranscriptThatLinksOutOfTheProjectsDirectory,
			);
		});

		describe("when the project directory links outside the projects directory", () => {
			it(
				"refuses a project directory that links out of the projects directory",
				verifyGETApiRunsRunStagesStageSessionRefusalsRefusesAProjectDirectoryThatLinksOutOfTheProjectsDirectory,
			);
		});

		describe("when the pipeline does not contain the stage", () => {
			it(
				"answers 404 for a stage the run's pipeline does not have",
				verifyGETApiRunsRunStagesStageSessionRefusalsAnswers404ForAStageTheRunSPipelineDoesNotHave,
			);
		});

		describe("when the run identity traverses directories", () => {
			it.each([
				["..%2F..%2Fetc", "../../etc"],
				["..%5C..%5Cetc", String.raw`..\..\etc`],
				[".hidden", ".hidden"],
			])("refuses the traversing run id %s", verifyTraversingRunIdentity);
		});
	});
});

async function verifyTraversingRunIdentity(
	_routeSegment: string,
	run: string,
): Promise<void> {
	const stage = await startedStage();

	const api = await startStageSessionApi(stage);

	const response = await api.savedEvidence.stageSession({
		run,
		stage: "build",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
}
