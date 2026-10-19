import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { basename, dirname } from "node:path";

import { extendComparison } from "./compare-attempts";
import {
	RESOURCE_DRAIN_START_INDEX,
	approveAny,
	savedComparison,
	temporaryDirectories,
} from "./compare-attempts-test-fixture";
import { listedComparisonDigests } from "./comparison-baseline-record";

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(RESOURCE_DRAIN_START_INDEX)
			.map(async (directory) => {
				await rm(directory, { force: true, recursive: true });
			}),
	);
});

describe(listedComparisonDigests.name, () => {
	it(
		"lists an extension in place of the comparison it extends",
		listsAnExtensionInPlaceOfTheComparisonItExtends,
	);

	it(
		"keeps listing a comparison an extension that wrote no report names",
		keepsListingAComparisonAnExtensionThatWroteNoReportNames,
	);

	it(
		"lists a saved comparison nothing extends",
		listsASavedComparisonNothingExtends,
	);
});

async function listsAnExtensionInPlaceOfTheComparisonItExtends(): Promise<void> {
	const { arms, comparison } = await savedComparison();

	const { reportFile } = await extendComparison(
		{ attemptsPerArm: 2, comparison, runsDirectory: arms.runsDirectory },
		{ approve: approveAny, runArmGroup: arms.runMoreGroup },
	);

	expect(await listedComparisonDigests(arms.runsDirectory)).toEqual([
		basename(dirname(reportFile)),
	]);
}

async function keepsListingAComparisonAnExtensionThatWroteNoReportNames(): Promise<void> {
	const { arms, comparison } = await savedComparison();
	const { reportFile } = await extendComparison(
		{ attemptsPerArm: 2, comparison, runsDirectory: arms.runsDirectory },
		{ approve: approveAny, runArmGroup: arms.runMoreGroup },
	);
	await rm(reportFile);

	const listed = await listedComparisonDigests(arms.runsDirectory);

	expect(listed).toContain(comparison);
}

async function listsASavedComparisonNothingExtends(): Promise<void> {
	const { arms, comparison } = await savedComparison();

	expect(await listedComparisonDigests(arms.runsDirectory)).toEqual([
		comparison,
	]);
}
