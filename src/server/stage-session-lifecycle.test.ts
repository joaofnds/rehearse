import { afterEach, describe, expect, it } from "bun:test";

import {
	RUN,
	clearStageSessionRoots,
	queuedStage,
	recordStart,
	startedStage,
} from "#server/stage-session-test-fixture";

import readStageSession from "./stage-session";

afterEach(clearStageSessionRoots);

async function verifyReadStageSessionNameAnswersAStartedStageWhoseTranscriptTheProviderHasNotWrittenYetAsRunningWithNoLines(): Promise<void> {
	const stage = await startedStage();

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toEqual({ lineCount: 0, lines: [], state: "running" });
}

async function verifyReadStageSessionNameAnswersAStageThatHasNotStartedYetAsNotStarted(): Promise<void> {
	const stage = await queuedStage();

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toEqual({ state: "not-started" });
}

async function verifyReadStageSessionNameAnswersAStageWhoseStartCarriesNoSessionIdAsUntracked(): Promise<void> {
	const stage = await queuedStage();
	await recordStart(stage.runsDirectory);

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toEqual({ state: "untracked" });
}

describe(readStageSession.name, () => {
	describe("when the provider has not written the started transcript", () => {
		it(
			"answers a started stage whose transcript the provider has not written yet as running with no lines",
			verifyReadStageSessionNameAnswersAStartedStageWhoseTranscriptTheProviderHasNotWrittenYetAsRunningWithNoLines,
		);
	});
});

describe(readStageSession.name, () => {
	describe("when the stage has not started", () => {
		it(
			"answers a stage that has not started yet as not started",
			verifyReadStageSessionNameAnswersAStageThatHasNotStartedYetAsNotStarted,
		);
	});
});

describe(readStageSession.name, () => {
	describe("when the stage started without a session identity", () => {
		it(
			"answers a stage whose start carries no session id as untracked",
			verifyReadStageSessionNameAnswersAStageWhoseStartCarriesNoSessionIdAsUntracked,
		);
	});
});
