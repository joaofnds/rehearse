import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { PASS } from "#benchmark/comparison-test-fixtures";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	freezeDeliveryPipeline,
	freezePipeline,
} from "#server/history-figures-record-test-fixture";
import {
	clearFigureRoots,
	emptyFixture,
	onlyRowOfKind,
} from "#server/history-figures-workspace-test-fixture";

import {
	NO_FROZEN_PIPELINE_REASON,
	SESSION_PIPELINE_REASON,
	UNLISTED_STAGE_REASON,
	UNREADABLE_FROZEN_PIPELINE_REASON,
} from "./run-history";

afterEach(clearFigureRoots);

const SINGLE_SESSION_REP_COUNT = 1;

describe("/api/runs", () => {
	describe("GET", () => {
		describe("a confirmation group row", () => {
			it(
				"carries a pipeline group's declared stages as its pipeline's stages",
				verifyCarriesAPipelineGroupSDeclaredStagesAsIts,
			);

			it(
				"carries a stage group's stages from the pipeline it froze",
				verifyCarriesAStageGroupSStagesFromThePipeline,
			);

			it(
				"carries a stage group's stages as unavailable when it froze no pipeline",
				verifyCarriesAStageGroupSStagesAsUnavailableWhen,
			);

			it(
				"carries a stage group's stages as unavailable when the pipeline it froze does not list its stage",
				verifyCarriesAStageGroupSStagesAsUnavailableWhenThe,
			);

			it(
				"carries a stage group's stages as unavailable when the pipeline it froze is missing",
				verifyCarriesAStageGroupSStagesAsUnavailableWhenThePipeline,
			);

			it(
				"carries a stage group's stages as unavailable when the pipeline it froze does not parse",
				verifyCarriesAStageGroupSStagesAsUnavailableWhenThePipelineIt,
			);

			it(
				"carries a session group's pipeline stages as unavailable, since it runs none",
				verifyCarriesASessionGroupSPipelineStagesAsUnavailable,
			);
		});
	});
});

async function verifyCarriesAPipelineGroupSDeclaredStagesAsIts(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writePipelineGroup("pipeline-group", [
		PASS,
		PASS,
	]);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		pipelineStages: { stages: ["discuss", "build"], state: "available" },
	});
}

async function verifyCarriesAStageGroupSStagesFromThePipeline(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writeStageGroupWithReps("stage-group");
	await freezeDeliveryPipeline({
		fixture,
		groupId: "stage-group",
		stageNames: ["discuss", "build", "verify"],
	});

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		pipelineStages: {
			stages: ["discuss", "build", "verify"],
			state: "available",
		},
	});
}

async function verifyCarriesAStageGroupSStagesAsUnavailableWhen(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writeStageGroupWithReps("stage-group");

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		pipelineStages: {
			reasons: [NO_FROZEN_PIPELINE_REASON],
			state: "unavailable",
		},
	});
}

async function verifyCarriesAStageGroupSStagesAsUnavailableWhenThe(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writeStageGroupWithReps("stage-group");
	await freezeDeliveryPipeline({
		fixture,
		groupId: "stage-group",
		stageNames: ["discuss"],
	});

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		pipelineStages: {
			reasons: [UNLISTED_STAGE_REASON],
			state: "unavailable",
		},
	});
}

async function verifyCarriesAStageGroupSStagesAsUnavailableWhenThePipeline(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writeStageGroupWithReps("stage-group");
	await freezeDeliveryPipeline({
		fixture,
		groupId: "stage-group",
		stageNames: ["build"],
	});
	const { inputsDirectory } = confirmationGroupPaths(
		fixture.runsDirectory,
		"stage-group",
	);
	await rm(join(inputsDirectory, "pipeline.json"));

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		pipelineStages: {
			reasons: [UNREADABLE_FROZEN_PIPELINE_REASON],
			state: "unavailable",
		},
	});
}

async function verifyCarriesAStageGroupSStagesAsUnavailableWhenThePipelineIt(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writeStageGroupWithReps("stage-group");
	await freezePipeline({
		content: '{"stages":[{"name":1}]}',
		fixture,
		groupId: "stage-group",
	});

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		pipelineStages: {
			reasons: [UNREADABLE_FROZEN_PIPELINE_REASON],
			state: "unavailable",
		},
	});
}

async function verifyCarriesASessionGroupSPipelineStagesAsUnavailable(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writeSessionGroup(
		"session-group",
		SINGLE_SESSION_REP_COUNT,
	);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		pipelineStages: {
			reasons: [SESSION_PIPELINE_REASON],
			state: "unavailable",
		},
	});
}
