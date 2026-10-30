import { describe, expect, it } from "bun:test";

import runPipelineConfirmation from "./pipeline-confirmation";
import {
	readCheckpoints,
	readInitialCheckpoint,
} from "./pipeline-confirmation-record-test-reader";
import {
	CONFIRMATION_PIPELINE,
	PipelineConfirmationHarness,
} from "./pipeline-confirmation-test-support";
import { TestResources } from "./test-support";

const SHA256_HEX_DIGITS = 64;
const CONFIRMATION_REPETITIONS = 3;

const testResources = TestResources.forEachTest();

const declaredSettings = {
	hashed: {
		path: "stage-settings.json",
		sha256: "a".repeat(SHA256_HEX_DIGITS),
	},
	json: '{"disableAllHooks":true}',
};

async function hashesTheDeclaredSettingsFileSDigestIntoEveryCheckpointSOwnLineageField(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const expectedStages = CONFIRMATION_PIPELINE.stages
		.flatMap(({ name }) =>
			Array.from({ length: CONFIRMATION_REPETITIONS }, () => name),
		)
		.toSorted();

	const outcome = await harness.run({
		loadedSettings: declaredSettings,
		reps: CONFIRMATION_REPETITIONS,
	});
	const initialCheckpoint = await readInitialCheckpoint(outcome);
	const checkpoints = await readCheckpoints(outcome);

	expect(initialCheckpoint).toMatchObject({
		settingsFile: { sha256: declaredSettings.hashed.sha256 },
	});
	expect(checkpoints).toHaveLength(
		CONFIRMATION_REPETITIONS * CONFIRMATION_PIPELINE.stages.length,
	);
	expect(checkpoints.map(({ stage }) => stage).toSorted()).toEqual(
		expectedStages,
	);
	expect(checkpoints.map(({ settingsFile }) => settingsFile)).toEqual(
		checkpoints.map(() => declaredSettings.hashed),
	);
}

async function passesADeclaredSettingsOverlayToEveryStageSession(): Promise<void> {
	const lowerBoundForOverlaysCount = 0;

	const harness = await PipelineConfirmationHarness.setup(testResources);
	const overlays: (string | undefined)[] = [];

	await harness.run({ loadedSettings: declaredSettings }, (dependencies) => ({
		...dependencies,
		stageSession: {
			...dependencies.stageSession,
			runWorkflowStage: async (request) => {
				overlays.push(request.settingsOverlay);

				return await dependencies.stageSession.runWorkflowStage(request);
			},
		},
	}));

	expect(overlays.length).toBeGreaterThan(lowerBoundForOverlaysCount);
	expect(overlays.every((overlay) => overlay === declaredSettings.json)).toBe(
		true,
	);
}

async function runsEveryStageSessionWithTheUserSActualSetup(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const setups: (string | undefined)[] = [];

	await harness.run({ reps: CONFIRMATION_REPETITIONS }, (dependencies) => ({
		...dependencies,
		stageSession: {
			...dependencies.stageSession,
			runWorkflowStage: async (request) => {
				setups.push(request.setup);

				return await dependencies.stageSession.runWorkflowStage(request);
			},
		},
	}));

	expect(setups).toEqual(
		Array.from(
			{
				length: CONFIRMATION_REPETITIONS * CONFIRMATION_PIPELINE.stages.length,
			},
			() => "actual",
		),
	);
}

describe(runPipelineConfirmation.name, () => {
	it(
		"runs every stage session with the user's actual setup",
		runsEveryStageSessionWithTheUserSActualSetup,
	);
	describe("when declared settings are supplied", () => {
		it(
			"hashes the declared settings file's digest into every checkpoint's own lineage field",
			hashesTheDeclaredSettingsFileSDigestIntoEveryCheckpointSOwnLineageField,
		);
		it(
			"passes a declared settings overlay to every stage session",
			passesADeclaredSettingsOverlayToEveryStageSession,
		);
	});
});
