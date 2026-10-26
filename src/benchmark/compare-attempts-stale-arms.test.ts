import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import type { ArmGroupRequest } from "./compare-attempts";
import { compareAttempts } from "./compare-attempts";
import { useModel } from "./compare-attempts-evidence-test-fixtures";
import {
	RESOURCE_DRAIN_START_INDEX,
	armsDifferingInOneSkill,
	temporaryDirectories,
} from "./compare-attempts-test-fixture";

const MODEL_THE_CHECKPOINT_DID_NOT_RUN = "haiku";

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(RESOURCE_DRAIN_START_INDEX)
			.map(async (directory) => {
				await rm(directory, { force: true, recursive: true });
			}),
	);
});

describe(compareAttempts.name, () => {
	describe("when arms A and B replayed under a model their checkpoint did not run, which stales the chain they consumed", () => {
		it(
			"runs the baseline group under that model rather than refusing the arms",
			runsTheBaselineGroupUnderThatModelRatherThanRefusingTheArms,
		);
	});
});

async function runsTheBaselineGroupUnderThatModelRatherThanRefusingTheArms(): Promise<void> {
	const { arms, armA, armB } = await armsDifferingInOneSkill();
	await Array.fromAsync([armA, armB], async (groupId) => {
		await useModel({
			groupId,
			model: MODEL_THE_CHECKPOINT_DID_NOT_RUN,
			runsDirectory: arms.runsDirectory,
		});
	});

	const runBaselineGroupUnderTheRequestedModel = async (
		request: ArmGroupRequest,
	): Promise<string> => {
		const groupId = await arms.runBaselineGroup(request);
		await useModel({
			groupId,
			model: request.model,
			runsDirectory: arms.runsDirectory,
		});

		return groupId;
	};

	const { reportFile } = await compareAttempts(
		{ armA, armB, runsDirectory: arms.runsDirectory },
		{ runBaselineGroup: runBaselineGroupUnderTheRequestedModel },
	);

	expect(arms.baselineRequests.map(({ model }) => model)).toEqual([
		MODEL_THE_CHECKPOINT_DID_NOT_RUN,
	]);
	expect(await Bun.file(reportFile).exists()).toBe(true);
}
