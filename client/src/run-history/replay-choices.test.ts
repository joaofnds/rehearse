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
		...UNREAD_RUN_FIGURES,
		stageGrades: {
			state: "available",
			grades: STAGES.map((stage) => ({
				stage,
				status: "graded",
				grade: { state: "unavailable", reasons: ["not read by this test"] },
			})),
		},
		launchId: undefined,
		shortId: "r1",
		checkpoints: [],
		replayableStages: fields.replayableStages,
		links: [],
		run,
		caseId: "audit-log",
		status: fields.status,
		stage: undefined,
		grade: undefined,
		corpusVersion: undefined,
		corpusChangedDuringRun: false,
		staleness: unversionedStaleness({ stale: false, causes: [] }),
		progress: { state: "recorded" },
	};
}

describe(replayOffer.name, () => {
	it("offers each run's replayable steps", () => {
		const rows = [
			pipelineRun("run-1", {
				status: "COMPLETE",
				replayableStages: ["plan", "build"],
			}),
		];

		const offer = replayOffer(rows);

		expect(offer).toMatchObject({
			state: "available",
			runs: [{ run: "run-1", caseId: "audit-log", stages: ["plan", "build"] }],
		});
	});

	it("opens on the newest stopped run's stopped step", () => {
		const rows = [
			pipelineRun("newest", { status: "COMPLETE", replayableStages: ["plan"] }),
			pipelineRun("stopped", {
				status: "STOPPED:build",
				replayableStages: ["plan", "build", "review"],
			}),
			pipelineRun("older-stopped", {
				status: "STOPPED:review",
				replayableStages: ["plan", "build", "review"],
			}),
		];

		const offer = replayOffer(rows);

		expect(offer).toMatchObject({
			state: "available",
			opensOn: { run: "stopped", stage: "build" },
		});
	});

	it("chooses a stopped run's stopped step when that run is chosen", () => {
		const rows = [
			pipelineRun("stopped", {
				status: "STOPPED:build",
				replayableStages: ["plan", "build", "review"],
			}),
		];

		const offer = replayOffer(rows);

		expect(offer).toMatchObject({
			state: "available",
			runs: [{ run: "stopped", openingStage: "build" }],
		});
	});

	describe("when the run did not stop", () => {
		it("chooses its last offered step when it is chosen", () => {
			const rows = [
				pipelineRun("run-1", {
					status: "COMPLETE",
					replayableStages: ["plan", "build"],
				}),
			];

			const offer = replayOffer(rows);

			expect(offer).toMatchObject({
				state: "available",
				runs: [{ run: "run-1", openingStage: "build" }],
			});
		});
	});

	describe("when the newest stopped run does not offer its stopped step", () => {
		it("opens on the newest offering run's last offered step", () => {
			const rows = [
				pipelineRun("bare", { status: "COMPLETE", replayableStages: [] }),
				pipelineRun("newest", {
					status: "COMPLETE",
					replayableStages: ["plan", "build"],
				}),
				pipelineRun("stopped", {
					status: "STOPPED:review",
					replayableStages: ["build"],
				}),
				pipelineRun("older-stopped", {
					status: "STOPPED:build",
					replayableStages: ["plan", "build"],
				}),
			];

			const offer = replayOffer(rows);

			expect(offer).toMatchObject({
				state: "available",
				opensOn: { run: "newest", stage: "build" },
			});
		});
	});

	describe("when no run offers a step", () => {
		it("names why nothing can be replayed", () => {
			const rows = [
				pipelineRun("bare", { status: "COMPLETE", replayableStages: [] }),
			];

			expect(replayOffer(rows)).toEqual({
				state: "unavailable",
				reason: NO_REPLAYABLE_STEP_REASON,
			});
		});
	});
});
