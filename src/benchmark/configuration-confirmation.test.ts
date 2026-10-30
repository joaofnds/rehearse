import { describe, expect, it } from "bun:test";

import { parseArgs, parseReplayArgs, parseReplayConfirmation } from "./config";
import type { ReplayCliConfig } from "./config";
import { CASE_DEFAULTS, SESSION_ARGS } from "./configuration-test-support";

const parse = (): ReplayCliConfig =>
	parseReplayArgs(
		[
			"--run",
			"run-1",
			"--stage",
			"build",
			"--model",
			"sonnet",
			"--effort",
			"medium",
			"--session-budget-usd",
			"5",
			"--without-stage-skill",
		],
		{},
	);
const rejectsInvalidConfirmationFlagsFlagsCases = [
	{ error: "only with --confirm", flags: ["--reps", "3"] },
	{ error: "only with --confirm", flags: ["--yes"] },
	{
		error: "--approved-in-browser only with --yes",
		flags: ["--confirm", "--approved-in-browser"],
	},
	{
		error: "integer of at least 2",
		flags: ["--confirm", "--reps", "1"],
	},
];
function selectsAFiveRepConfirmationExplicitly(): void {
	const config = parseArgs(
		["--target", "./target", ...SESSION_ARGS, "--confirm"],
		{},
		CASE_DEFAULTS,
	);

	expect(config.confirmation).toEqual({ approval: "interactive", reps: 5 });
}

function resolvesTheReplayKnobs(): void {
	const config = parseReplayArgs(
		[
			"--run",
			"2026-08-30T10-00-00.000Z",
			"--stage",
			"discuss",
			"--model",
			"sonnet",
			"--effort",
			"high",
			"--session-budget-usd",
			"5",
		],
		{},
	);

	expect(config).toEqual({
		effort: "high",
		judgeEffort: "high",
		judgeModel: "opus",
		minimumStageGrade: "B",
		model: "sonnet",
		runName: "2026-08-30T10-00-00.000Z",
		sessionBudgetUsd: 5,
		stage: "discuss",
		stageSkill: "installed",
	});
}

function replaysTheStageWithoutItsOwnSkillForAComparisonSBaselineArm(): void {
	const config = parseReplayArgs(
		[
			"--run",
			"run-1",
			"--stage",
			"build",
			...SESSION_ARGS,
			"--confirm",
			"--without-stage-skill",
		],
		{},
	);

	expect(config.stageSkill).toBe("absent");
}

function refusesToReplayWithoutTheStageSSkillOutsideAConfirmationGroup(): void {
	expect(parse).toThrow("Use --without-stage-skill only with --confirm");
}

function overridesConfirmationRepsAndAcceptsNoninteractiveApproval(): void {
	const config = parseReplayArgs(
		[
			"--run",
			"run-1",
			"--stage",
			"build",
			...SESSION_ARGS,
			"--confirm",
			"--reps",
			"7",
			"--yes",
		],
		{},
	);

	expect(config.confirmation).toEqual({ approval: "yes", reps: 7 });
}

function recordsAnApprovalGivenInTheBrowser(): void {
	const config = parseReplayArgs(
		[
			"--run",
			"run-1",
			"--stage",
			"build",
			...SESSION_ARGS,
			"--confirm",
			"--reps",
			"3",
			"--yes",
			"--approved-in-browser",
		],
		{},
	);

	expect(config.confirmation).toEqual({ approval: "browser", reps: 3 });
}

function readsAConfirmationRequestWithoutNeedingTheModelOrBudget(): void {
	expect(
		parseReplayConfirmation([
			"--run",
			"run-1",
			"--stage",
			"build",
			"--confirm",
		]),
	).toEqual({ approval: "interactive", reps: 5 });
}

function readsNoConfirmationWhenConfirmIsAbsent(): void {
	expect(
		parseReplayConfirmation(["--run", "run-1", "--stage", "build"]),
	).toBeUndefined();
}

function describeWhenConfirmationIsRequested(): void {
	it(
		"selects a five-rep confirmation explicitly",
		selectsAFiveRepConfirmationExplicitly,
	);
	it(
		"replays the stage without its own skill for a comparison's baseline arm",
		replaysTheStageWithoutItsOwnSkillForAComparisonSBaselineArm,
	);
	it(
		"overrides confirmation reps and accepts noninteractive approval",
		overridesConfirmationRepsAndAcceptsNoninteractiveApproval,
	);
	it(
		"records an approval given in the browser",
		recordsAnApprovalGivenInTheBrowser,
	);
}
function describeWhenConfirmationFlagsAreInconsistent(): void {
	it.each(rejectsInvalidConfirmationFlagsFlagsCases)(
		"rejects invalid confirmation flags: $flags",
		({ flags, error }) => {
			expect(() =>
				parseArgs(
					["--target", "./target", ...SESSION_ARGS, ...flags],
					{},
					CASE_DEFAULTS,
				),
			).toThrow(error);
		},
	);
	it(
		"refuses to replay without the stage's skill outside a confirmation group",
		refusesToReplayWithoutTheStageSSkillOutsideAConfirmationGroup,
	);
}
function describeWhenReplaySessionKnobsAreExplicit(): void {
	it("resolves the replay knobs", resolvesTheReplayKnobs);
}
function describeWhenReadingApprovalBeforeSessionSettings(): void {
	it(
		"reads a confirmation request without needing the model or budget",
		readsAConfirmationRequestWithoutNeedingTheModelOrBudget,
	);
}
function describeWhenConfirmationIsAbsent(): void {
	it(
		"reads no confirmation when --confirm is absent",
		readsNoConfirmationWhenConfirmIsAbsent,
	);
}
describe("confirmation configuration", () => {
	describe(
		"when confirmation is requested",
		describeWhenConfirmationIsRequested,
	);
	describe(
		"when confirmation flags are inconsistent",
		describeWhenConfirmationFlagsAreInconsistent,
	);
	describe(
		"when replay session knobs are explicit",
		describeWhenReplaySessionKnobsAreExplicit,
	);
	describe(
		"when reading approval before session settings",
		describeWhenReadingApprovalBeforeSessionSettings,
	);
	describe("when confirmation is absent", describeWhenConfirmationIsAbsent);
});
