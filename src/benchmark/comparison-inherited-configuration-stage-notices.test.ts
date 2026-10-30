import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import extendEveryComparisonArm from "./comparison-additional-groups-fixture";
import type { ComparisonEvidenceFixture } from "./comparison-evidence-test-support";
import {
	GATEWAY_A,
	GATEWAY_B,
	compareCollectingNotices,
	forgetEveryGroupConfiguration,
	recordEveryGroup,
} from "./comparison-inherited-configuration-test-fixture";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import { parseComparisonReport } from "./comparison-record";

const { fixture, temporaryDirectory } = comparisonLoaderTestFixture();

const runsDirectory = join(temporaryDirectory, "runs");

async function namesTheVariablesTwoArmsInheritedDifferently(
	stageFixture: ComparisonEvidenceFixture,
): Promise<void> {
	await recordEveryGroup(stageFixture, {
		configurationOf: (caseId, role) =>
			caseId === "case-1" && role === "candidate" ? GATEWAY_B : GATEWAY_A,
		suffix: "",
	});

	const { notices, reportFile } = await compareCollectingNotices(
		stageFixture.manifestFile,
		runsDirectory,
	);

	expect(notices).toEqual([
		"case case-1 arms candidate and baseline inherited different Claude Code configuration from the shell that started them: ANTHROPIC_BASE_URL (different values)",
		"case case-1 arms candidate and control inherited different Claude Code configuration from the shell that started them: ANTHROPIC_BASE_URL (different values)",
	]);
	expect(
		parseComparisonReport(await Bun.file(reportFile).text()).contrasts,
	).toHaveProperty("candidateMinusBaseline");
}

async function namesNothingWhenEveryArmInheritedTheSameConfiguration(
	stageFixture: ComparisonEvidenceFixture,
): Promise<void> {
	await recordEveryGroup(stageFixture, {
		configurationOf: () => GATEWAY_A,
		suffix: "",
	});

	const { notices } = await compareCollectingNotices(
		stageFixture.manifestFile,
		runsDirectory,
	);

	expect(notices).toEqual([]);
}

async function namesTheArmsWhoseGroupsPredateRecordingIt(
	stageFixture: ComparisonEvidenceFixture,
): Promise<void> {
	await forgetEveryGroupConfiguration(stageFixture);

	const { notices } = await compareCollectingNotices(
		stageFixture.manifestFile,
		runsDirectory,
	);

	expect(notices).toEqual([
		"case case-1 arms baseline, candidate and control recorded no Claude Code configuration inherited from the shell that started them, so whether every arm ran with the same configuration is unknown",
		"case case-2 arms baseline, candidate and control recorded no Claude Code configuration inherited from the shell that started them, so whether every arm ran with the same configuration is unknown",
	]);
}

async function showsAnArmAsMixedWhenItsGroupsInheritedDifferently(
	stageFixture: ComparisonEvidenceFixture,
): Promise<void> {
	await extendEveryComparisonArm(stageFixture);
	await recordEveryGroup(stageFixture, {
		configurationOf: () => GATEWAY_A,
		suffix: "",
	});
	await recordEveryGroup(stageFixture, {
		configurationOf: (caseId, role) =>
			caseId === "case-2" && role === "control" ? GATEWAY_B : GATEWAY_A,
		suffix: "-more",
	});

	const { notices } = await compareCollectingNotices(
		stageFixture.manifestFile,
		runsDirectory,
	);

	expect(notices).toEqual([
		"case case-2 arm control is mixed: its records inherited different Claude Code configuration from the shell that started them: ANTHROPIC_BASE_URL",
	]);
}

async function showsAnArmAsMixedWhenAnOlderGroupPredatesRecordingIt(
	stageFixture: ComparisonEvidenceFixture,
): Promise<void> {
	await extendEveryComparisonArm(stageFixture);
	await forgetEveryGroupConfiguration(stageFixture);
	await recordEveryGroup(stageFixture, {
		configurationOf: () => GATEWAY_A,
		suffix: "-more",
	});

	const { notices } = await compareCollectingNotices(
		stageFixture.manifestFile,
		runsDirectory,
	);

	expect(notices).toEqual(
		["case-1", "case-2"].flatMap((caseId) =>
			["baseline", "candidate", "control"].map(
				(arm) =>
					`case ${caseId} arm ${arm} is mixed: some of its records predate recording the Claude Code configuration inherited from the shell that started them`,
			),
		),
	);
}

describe("a stage comparison", () => {
	it("names the variables two arms inherited differently and still reports the contrast", async () => {
		await namesTheVariablesTwoArmsInheritedDifferently(fixture);
	});

	it("names nothing when every arm inherited the same configuration", async () => {
		await namesNothingWhenEveryArmInheritedTheSameConfiguration(fixture);
	});

	it("names the arms whose groups predate recording what they inherited", async () => {
		await namesTheArmsWhoseGroupsPredateRecordingIt(fixture);
	});

	it("shows an arm as mixed when its groups inherited different configuration", async () => {
		await showsAnArmAsMixedWhenItsGroupsInheritedDifferently(fixture);
	});

	it("shows an arm as mixed when it extends a group that predates recording what it inherited", async () => {
		await showsAnArmAsMixedWhenAnOlderGroupPredatesRecordingIt(fixture);
	});
});
