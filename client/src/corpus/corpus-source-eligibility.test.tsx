import { afterEach, describe, expect, it } from "bun:test";

import { screen } from "@testing-library/react";

import { RUN } from "./corpus-edit-test-fixtures";
import { applySourceEdit } from "./corpus-editor-test-driver";
import CorpusPage from "./corpus-page";
import {
	FIRST_RECORDED_STAGE_INDEX,
	SECOND_RECORDED_STAGE_INDEX,
	servingSource,
	sourceRun,
} from "./corpus-source-test-fixtures";
import { originalFetch } from "./corpus-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(CorpusPage.name, () => {
	describe("when editing a file of a linked directory", () => {
		describe("when a recorded step is the source", () => {
			it(
				"withholds replay when the source step has no starting checkpoint",
				withholdsReplayWhenTheSourceStepHasNoStartingCheckpoint,
			);

			it(
				"withholds replay until the selected source step has ended",
				withholdsReplayUntilTheSelectedSourceStepHasEnded,
			);

			it(
				"withholds replay while the saved source run is still active",
				withholdsReplayWhileTheSavedSourceRunIsStillActive,
			);

			it(
				"withholds replay when the selected file is absent from that step's corpus reads",
				withholdsReplayWhenTheSelectedFileIsAbsentFromThatStepSCorpusReads,
			);

			it(
				"withholds replay when a first step's initial checkpoint is not retained",
				withholdsReplayWhenAFirstStepSInitialCheckpointIsNotRetained,
			);

			it(
				"offers replay of a retained initial checkpoint without a short ID",
				offersReplayOfARetainedInitialCheckpointWithoutAShortID,
			);
		});
	});
});

async function withholdsReplayWhenTheSourceStepHasNoStartingCheckpoint(): Promise<void> {
	const expectedMatchingElementsCount = 2;

	const saved = sourceRun();
	servingSource(
		new Map([
			[
				`GET /api/runs/${RUN}`,
				{
					body: {
						...saved,
						stages: [
							{
								...saved.stages[FIRST_RECORDED_STAGE_INDEX],
								checkpoint: "missing",
							},
							saved.stages[SECOND_RECORDED_STAGE_INDEX],
						],
					},
					status: 200,
				},
			],
		]),
	);

	await applySourceEdit();

	expect(
		screen.getAllByText("discuss has no checkpoint to replay from"),
	).toHaveLength(expectedMatchingElementsCount);
	expect(screen.queryByRole("button", { name: /Replay discuss/u })).toBeNull();
}

async function withholdsReplayUntilTheSelectedSourceStepHasEnded(): Promise<void> {
	const expectedMatchingElementsCount = 2;

	const saved = sourceRun();
	servingSource(
		new Map([
			[
				`GET /api/runs/${RUN}`,
				{
					body: {
						...saved,
						stages: [
							saved.stages[FIRST_RECORDED_STAGE_INDEX],
							{
								...saved.stages[SECOND_RECORDED_STAGE_INDEX],
								status: "running",
							},
						],
					},
					status: 200,
				},
			],
		]),
	);

	await applySourceEdit();

	expect(
		screen.getAllByText("discuss has no completed step record to replay"),
	).toHaveLength(expectedMatchingElementsCount);
	expect(screen.queryByRole("button", { name: /Replay discuss/u })).toBeNull();
}

async function withholdsReplayWhileTheSavedSourceRunIsStillActive(): Promise<void> {
	const expectedMatchingElementsCount = 2;

	const saved = sourceRun();
	servingSource(
		new Map([
			[
				`GET /api/runs/${RUN}`,
				{
					body: {
						...saved,
						finalOutcome: { stage: "discuss", status: "PENDING" },
					},
					status: 200,
				},
			],
		]),
	);

	await applySourceEdit();

	expect(
		screen.getAllByText(
			"Wait for the source run to end before replaying a step",
		),
	).toHaveLength(expectedMatchingElementsCount);
	expect(screen.queryByRole("button", { name: /Replay discuss/u })).toBeNull();
}

async function withholdsReplayWhenTheSelectedFileIsAbsentFromThatStepSCorpusReads(): Promise<void> {
	const expectedMatchingElementsCount = 2;

	const saved = sourceRun();
	servingSource(
		new Map([
			[
				`GET /api/runs/${RUN}`,
				{
					body: {
						...saved,
						stages: [
							saved.stages[FIRST_RECORDED_STAGE_INDEX],
							{
								...saved.stages[SECOND_RECORDED_STAGE_INDEX],
								readManifest: { entries: [], state: "available" },
							},
						],
					},
					status: 200,
				},
			],
		]),
	);

	await applySourceEdit();

	expect(
		screen.getAllByText(
			"CLAUDE.md is not recorded as read from the corpus by this step.",
		),
	).toHaveLength(expectedMatchingElementsCount);
	expect(screen.queryByRole("button", { name: /Replay discuss/u })).toBeNull();
}

async function withholdsReplayWhenAFirstStepSInitialCheckpointIsNotRetained(): Promise<void> {
	const expectedMatchingElementsCount = 2;

	const saved = sourceRun();
	servingSource(
		new Map([
			[
				`GET /api/runs/${RUN}`,
				{
					body: {
						...saved,
						stages: [saved.stages[SECOND_RECORDED_STAGE_INDEX]],
					},
					status: 200,
				},
			],
		]),
	);

	await applySourceEdit();

	expect(
		screen.getAllByText("The initial checkpoint is not retained for this step"),
	).toHaveLength(expectedMatchingElementsCount);
	expect(screen.queryByRole("button", { name: /Replay discuss/u })).toBeNull();
}

async function offersReplayOfARetainedInitialCheckpointWithoutAShortID(): Promise<void> {
	const saved = sourceRun();
	servingSource(
		new Map([
			[
				`GET /api/runs/${RUN}`,
				{
					body: {
						...saved,
						stages: [
							{
								...saved.stages[SECOND_RECORDED_STAGE_INDEX],
								artifactsIn: {
									entries: [
										{
											checkpointShortId: {
												reasons: ["older record"],
												state: "unavailable",
											},
											from: "upstream checkpoint",
											target: "acme-api",
											upstream: "initial",
										},
									],
									missing: [],
								},
							},
						],
					},
					status: 200,
				},
			],
		]),
	);

	await applySourceEdit();

	expect(
		screen.getByRole("button", { name: "Replay discuss · 3 attempts" }),
	).toBeInTheDocument();
}
