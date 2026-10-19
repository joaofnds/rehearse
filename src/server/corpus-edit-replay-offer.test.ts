import { afterEach, describe, expect, it } from "bun:test";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { directorySource } from "#benchmark/run-records-test-support";
import { applyReviewedEdit } from "#server/corpus-edit-test-driver";
import {
	clearCorpusEditRoots,
	serving,
} from "#server/corpus-edit-workspace-test-fixture";

afterEach(clearCorpusEditRoots);

async function verifyApiCorpusEditsThePairedRerunItOffersReplaysTheFirstStageInPipelineOrderOfTheInvalidatedRunThatReadTheEditedFile(): Promise<void> {
	const served = await serving();

	const { rerun } = await applyReviewedEdit(served, {
		path: "CLAUDE.md",
		text: "instructions, edited\n",
	});

	expect(rerun).toEqual({
		kind: "offered",
		run: served.fixture.replayableRun,
		stage: "discuss",
	});
}

async function verifyApiCorpusEditsThePairedRerunItOffersReplaysTheStageWhoseSkillWasEdited(): Promise<void> {
	const served = await serving();

	const { rerun } = await applyReviewedEdit(served, {
		path: "skills/build/SKILL.md",
		text: "build skill, edited\n",
	});

	expect(rerun).toEqual({
		kind: "offered",
		run: served.fixture.replayableRun,
		stage: "build",
	});
}

async function verifyApiCorpusEditsThePairedRerunItOffersReplaysTheStageOfTheNewestInvalidatedResultAStageReplayRecordedAfterItsRun(): Promise<void> {
	const served = await serving();
	await served.fixture.corpus.recordReplayFrom(directorySource(served.corpus));

	const { rerun } = await applyReviewedEdit(served, {
		path: "CLAUDE.md",
		text: "instructions, edited\n",
	});

	expect(rerun).toEqual({
		kind: "offered",
		run: served.fixture.replayableRun,
		stage: "build",
	});
}

async function verifyApiCorpusEditsThePairedRerunItOffersReplaysTheStageANewerRunStoppedAtReadFromItsStopRecord(): Promise<void> {
	const served = await serving();
	await served.fixture.corpus.recordReplayFrom(directorySource(served.corpus));
	await served.fixture.stopped.writeStoppedRun();
	await served.fixture.corpus.recordStoppedStageFrom(
		directorySource(served.corpus),
	);
	await cp(
		join(
			served.runsDirectory,
			`${served.fixture.stoppedRun}.checkpoints`,
			"initial",
		),
		join(
			served.runsDirectory,
			`${served.fixture.stoppedRun}.checkpoints`,
			"discuss",
		),
		{ recursive: true },
	);

	const { rerun } = await applyReviewedEdit(served, {
		path: "CLAUDE.md",
		text: "instructions, edited\n",
	});

	expect(rerun).toEqual({
		kind: "offered",
		run: served.fixture.stoppedRun,
		stage: "build",
	});
}

async function verifyApiCorpusEditsThePairedRerunItOffersStartsNothingLeavingTheReplayToThePersonWhoApplied(): Promise<void> {
	const served = await serving();

	await applyReviewedEdit(served, {
		path: "CLAUDE.md",
		text: "instructions, edited\n",
	});

	expect(served.launcher.launches).toEqual([]);
}

async function verifyApiCorpusEditsThePairedRerunItOffersWhenTheEditMarksNoRecordedResultStaleOffersNoneAndSaysWhy(): Promise<void> {
	const served = await serving();
	await mkdir(join(served.corpus, "skills", "unused"));
	await writeFile(
		join(served.corpus, "skills", "unused", "SKILL.md"),
		"unused\n",
	);

	const { rerun } = await applyReviewedEdit(served, {
		path: "skills/unused/SKILL.md",
		text: "unused, edited\n",
	});

	expect(rerun).toEqual({
		kind: "none",
		reason:
			"The edit marked no recorded result stale, so no replay can show what it changed",
	});
}

async function verifyApiCorpusEditsThePairedRerunItOffersWhenTheCheckpointTheStageWouldReplayFromIsGoneOffersNone(): Promise<void> {
	const expectedInvalidated = 1;

	const served = await serving();
	await rm(
		join(
			served.runsDirectory,
			`${served.fixture.replayableRun}.checkpoints`,
			"initial",
		),
		{ recursive: true },
	);

	const { invalidated, rerun } = await applyReviewedEdit(served, {
		path: "CLAUDE.md",
		text: "instructions, edited\n",
	});

	expect(invalidated).toBe(expectedInvalidated);
	expect(rerun).toEqual({
		kind: "none",
		reason:
			"No result this edit marked stale holds a recorded checkpoint to replay a stage that read CLAUDE.md from",
	});
}

describe("/api/corpus/edits", () => {
	describe("the paired rerun it offers", () => {
		it(
			"replays the first stage, in pipeline order, of the invalidated run that read the edited file",
			verifyApiCorpusEditsThePairedRerunItOffersReplaysTheFirstStageInPipelineOrderOfTheInvalidatedRunThatReadTheEditedFile,
		);

		it(
			"replays the stage whose skill was edited",
			verifyApiCorpusEditsThePairedRerunItOffersReplaysTheStageWhoseSkillWasEdited,
		);

		it(
			"replays the stage of the newest invalidated result, a stage replay recorded after its run",
			verifyApiCorpusEditsThePairedRerunItOffersReplaysTheStageOfTheNewestInvalidatedResultAStageReplayRecordedAfterItsRun,
		);

		it(
			"replays the stage a newer run stopped at, read from its stop record",
			verifyApiCorpusEditsThePairedRerunItOffersReplaysTheStageANewerRunStoppedAtReadFromItsStopRecord,
		);

		it(
			"starts nothing, leaving the replay to the person who applied",
			verifyApiCorpusEditsThePairedRerunItOffersStartsNothingLeavingTheReplayToThePersonWhoApplied,
		);

		it.each([
			["CLAUDE.md", true],
			["skills/build/SKILL.md", false],
		] as const)(
			"says whether a browser comparison of an edit to %s needs a comparison manifest",
			async (path, needed) => {
				const served = await serving();

				const { needsComparisonManifest } = await applyReviewedEdit(served, {
					path,
					text: "edited\n",
				});

				expect(needsComparisonManifest).toBe(needed);
			},
		);
	});
});

describe("/api/corpus/edits", () => {
	describe("the paired rerun it offers", () => {
		describe(
			"when the edit marks no recorded result stale",
			registerNoInvalidatedResults,
		);
		describe(
			"when the checkpoint the stage would replay from is gone",
			registerMissingReplayCheckpoint,
		);
	});
});
function registerNoInvalidatedResults(): void {
	it(
		"offers none and says why",
		verifyApiCorpusEditsThePairedRerunItOffersWhenTheEditMarksNoRecordedResultStaleOffersNoneAndSaysWhy,
	);
}
function registerMissingReplayCheckpoint(): void {
	it(
		"offers none",
		verifyApiCorpusEditsThePairedRerunItOffersWhenTheCheckpointTheStageWouldReplayFromIsGoneOffersNone,
	);
}
