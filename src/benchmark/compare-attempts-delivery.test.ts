import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { compareAttempts } from "./compare-attempts";
import { forgetCorpusDelivery } from "./compare-attempts-evidence-test-fixtures";
import {
	RESOURCE_DRAIN_START_INDEX,
	armsDifferingInOneSkill,
	refusalOf,
	temporaryDirectories,
} from "./compare-attempts-test-fixture";

async function refusesBeforeRunningABaselineGroupWhenAnArmRecordsNoCorpusDelivery(): Promise<void> {
	const { arms, armA, armB } = await armsDifferingInOneSkill();
	await forgetCorpusDelivery({
		groupId: armB,
		runsDirectory: arms.runsDirectory,
	});

	const refusal = await refusalOf(
		compareAttempts(
			{ armA, armB, runsDirectory: arms.runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		),
	);

	expect({
		baselineRequests: arms.baselineRequests,
		message: refusal.message,
	}).toEqual({
		baselineRequests: [],
		message: `group ${armB} records no corpus delivery, so its home-path citations read the live install and it cannot be compared until it is run again`,
	});
}

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
	it(
		"refuses before running a baseline group when an arm records no corpus delivery",
		refusesBeforeRunningABaselineGroupWhenAnArmRecordsNoCorpusDelivery,
	);
});
