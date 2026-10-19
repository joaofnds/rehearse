import { describe, expect, it } from "bun:test";

import {
	UNREAD_RUN_FIGURES,
	unversionedStaleness,
} from "#client/test-support/run-figures";
import type { PipelineRunRow } from "#server/run-history";

import { NO_REPLAYABLE_STEP_REASON, replayOffer } from "./replay-choices";

const STAGES = ["plan", "build", "review"] as const;

function pipelineRun(
	run: string,
	fields: Pick<PipelineRunRow, "status" | "replayableStages">,
): PipelineRunRow {
	return {
		kind: "run",
		recordId: `run:${run}`,
		...UNREAD_RUN_FIGURES,
		caseId: "audit-log",
		checkpoints: [],
		corpusChangedDuringRun: false,
		corpusVersion: undefined,
		grade: undefined,
		launchId: undefined,
		links: [],
		progress: { state: "recorded" },
		replayableStages: fields.replayableStages,
		run,
		shortId: "r1",
		stage: undefined,
		stageGrades: {
			grades: STAGES.map((stage) => ({
				grade: { reasons: ["not read by this test"], state: "unavailable" },
				stage,
				status: "graded",
			})),
			state: "available",
		},
		staleness: unversionedStaleness({ causes: [], stale: false }),
		status: fields.status,
	};
}

describe(replayOffer.name, () => {
	it("offers each run's replayable steps", offersEachRunSReplayableSteps);

	it(
		"opens on the newest stopped run's stopped step",
		opensOnTheNewestStoppedRunSStoppedStep,
	);

	it(
		"chooses a stopped run's stopped step when that run is chosen",
		choosesAStoppedRunSStoppedStepWhenThatRunIsChosen,
	);

	describe("when the run did not stop", () => {
		it(
			"chooses its last offered step when it is chosen",
			choosesItsLastOfferedStepWhenItIsChosen,
		);
	});

	describe("when the newest stopped run does not offer its stopped step", () => {
		it(
			"opens on the newest offering run's last offered step",
			opensOnTheNewestOfferingRunSLastOfferedStep,
		);
	});

	describe("when no run offers a step", () => {
		it("names why nothing can be replayed", namesWhyNothingCanBeReplayed);
	});
});

function offersEachRunSReplayableSteps(): void {
	const rows = [
		pipelineRun("run-1", {
			replayableStages: ["plan", "build"],
			status: "COMPLETE",
		}),
	];

	const offer = replayOffer(rows);

	expect(offer).toMatchObject({
		runs: [{ caseId: "audit-log", run: "run-1", stages: ["plan", "build"] }],
		state: "available",
	});
}

function opensOnTheNewestStoppedRunSStoppedStep(): void {
	const rows = [
		pipelineRun("newest", { replayableStages: ["plan"], status: "COMPLETE" }),
		pipelineRun("stopped", {
			replayableStages: ["plan", "build", "review"],
			status: "STOPPED:build",
		}),
		pipelineRun("older-stopped", {
			replayableStages: ["plan", "build", "review"],
			status: "STOPPED:review",
		}),
	];

	const offer = replayOffer(rows);

	expect(offer).toMatchObject({
		opensOn: { run: "stopped", stage: "build" },
		state: "available",
	});
}

function choosesAStoppedRunSStoppedStepWhenThatRunIsChosen(): void {
	const rows = [
		pipelineRun("stopped", {
			replayableStages: ["plan", "build", "review"],
			status: "STOPPED:build",
		}),
	];

	const offer = replayOffer(rows);

	expect(offer).toMatchObject({
		runs: [{ openingStage: "build", run: "stopped" }],
		state: "available",
	});
}

function choosesItsLastOfferedStepWhenItIsChosen(): void {
	const rows = [
		pipelineRun("run-1", {
			replayableStages: ["plan", "build"],
			status: "COMPLETE",
		}),
	];

	const offer = replayOffer(rows);

	expect(offer).toMatchObject({
		runs: [{ openingStage: "build", run: "run-1" }],
		state: "available",
	});
}

function opensOnTheNewestOfferingRunSLastOfferedStep(): void {
	const rows = [
		pipelineRun("bare", { replayableStages: [], status: "COMPLETE" }),
		pipelineRun("newest", {
			replayableStages: ["plan", "build"],
			status: "COMPLETE",
		}),
		pipelineRun("stopped", {
			replayableStages: ["build"],
			status: "STOPPED:review",
		}),
		pipelineRun("older-stopped", {
			replayableStages: ["plan", "build"],
			status: "STOPPED:build",
		}),
	];

	const offer = replayOffer(rows);

	expect(offer).toMatchObject({
		opensOn: { run: "newest", stage: "build" },
		state: "available",
	});
}

function namesWhyNothingCanBeReplayed(): void {
	const rows = [
		pipelineRun("bare", { replayableStages: [], status: "COMPLETE" }),
	];

	expect(replayOffer(rows)).toEqual({
		reason: NO_REPLAYABLE_STEP_REASON,
		state: "unavailable",
	});
}
