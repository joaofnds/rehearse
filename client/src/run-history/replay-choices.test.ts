import { describe, expect, it } from "bun:test";
import {
	UNREAD_RUN_FIGURES,
	unversionedStaleness,
} from "#client/test-support/run-figures";
import type { PipelineRunRow } from "#server/run-history";
import { NO_REPLAYABLE_STEP_REASON, replayChoices } from "./replay-choices";

const STAGES = ["plan", "build", "review"] as const;

function pipelineRun(
	run: string,
	fields: Pick<PipelineRunRow, "status"> & {
		readonly recorded: readonly string[];
	},
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
		checkpoints: fields.recorded.map((stage) => ({
			stage,
			shortId: `r1/${stage}`,
		})),
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

describe(replayChoices.name, () => {
	it("offers each step whose starting checkpoint is recorded", () => {
		const rows = [
			pipelineRun("run-1", {
				status: "COMPLETE",
				recorded: ["initial", "plan"],
			}),
		];

		const choices = replayChoices(rows);

		expect(choices).toMatchObject({
			state: "available",
			runs: [{ run: "run-1", caseId: "audit-log", stages: ["plan", "build"] }],
		});
	});

	it("opens on the newest stopped run's stopped step", () => {
		const rows = [
			pipelineRun("newest", { status: "COMPLETE", recorded: ["initial"] }),
			pipelineRun("stopped", {
				status: "STOPPED:build",
				recorded: ["initial", "plan", "build"],
			}),
		];

		const choices = replayChoices(rows);

		expect(choices).toMatchObject({
			state: "available",
			opensOn: { run: "stopped", stage: "build" },
		});
	});

	it("chooses a run's last offered step when it is chosen", () => {
		const rows = [
			pipelineRun("run-1", {
				status: "COMPLETE",
				recorded: ["initial", "plan"],
			}),
		];

		const choices = replayChoices(rows);

		expect(choices).toMatchObject({
			state: "available",
			runs: [{ run: "run-1", opensOn: "build" }],
		});
	});

	describe("when no stopped run offers its stopped step", () => {
		it("opens on the newest offering run's last offered step", () => {
			const rows = [
				pipelineRun("bare", { status: "COMPLETE", recorded: [] }),
				pipelineRun("newest", {
					status: "COMPLETE",
					recorded: ["initial", "plan"],
				}),
				pipelineRun("stopped", {
					status: "STOPPED:review",
					recorded: ["initial"],
				}),
			];

			const choices = replayChoices(rows);

			expect(choices).toMatchObject({
				state: "available",
				opensOn: { run: "newest", stage: "build" },
			});
		});
	});

	describe("when the initial checkpoint is not recorded", () => {
		it("offers no first step", () => {
			const rows = [
				pipelineRun("run-1", { status: "COMPLETE", recorded: ["plan"] }),
			];

			const choices = replayChoices(rows);

			expect(choices).toMatchObject({
				state: "available",
				runs: [{ run: "run-1", stages: ["build"] }],
			});
		});
	});

	describe("when no run offers a step", () => {
		it("names why nothing can be replayed", () => {
			const rows = [pipelineRun("bare", { status: "COMPLETE", recorded: [] })];

			expect(replayChoices(rows)).toEqual({
				state: "unavailable",
				reason: NO_REPLAYABLE_STEP_REASON,
			});
		});
	});
});
