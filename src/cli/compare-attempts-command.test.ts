import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
	RUN as ARMS_RUN,
	STAGE,
} from "#benchmark/compare-attempts-test-support";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";
import { runCompareAttemptsCommand } from "#cli/compare-attempts-command";
import writeReplayableRunManifest from "#cli/replay-test-support";

import {
	recordedComparisonArms,
	recordedGroupExecution,
} from "./comparison-recording-test-fixture";
import { ComparisonReplayAdapter } from "./comparison-replay-test-adapter";

const workspace = CliTestWorkspace.forEachTest();

const RESOURCE_DRAIN_START_INDEX = 0;

const REPLAY_KNOB_VARIABLES = [
	"BENCHMARK_MODEL",
	"BENCHMARK_EFFORT",
	"BENCHMARK_JUDGE_MODEL",
	"BENCHMARK_JUDGE_EFFORT",
	"BENCHMARK_SESSION_BUDGET_USD",
] as const;

const hostKnobs = new Map<string, string | undefined>();

beforeEach(() => {
	for (const name of REPLAY_KNOB_VARIABLES) {
		hostKnobs.set(name, Bun.env[name]);
		Reflect.deleteProperty(Bun.env, name);
	}
});

afterEach(() => {
	for (const [name, value] of hostKnobs) {
		if (value === undefined) {
			Reflect.deleteProperty(Bun.env, name);
		} else {
			Bun.env[name] = value;
		}
	}
});

const manifests: string[] = [];

afterEach(async () => {
	await Promise.all(
		manifests.splice(RESOURCE_DRAIN_START_INDEX).map(async (file) => {
			await rm(file, { force: true });
		}),
	);
});

const refusingReplay = {
	execute: async () => await Promise.reject(new Error("replay must not run")),
	probeModel: async () => await Promise.reject(new Error("must not probe")),
	requireSpendCeiling: async () =>
		await Promise.reject(new Error("must not read")),
	resolveRunDirectory: async () =>
		await Promise.reject(new Error("must not resolve")),
};

async function replaysTheBaselineGroupWithoutTheStageSOwn(): Promise<void> {
	manifests.push(await writeReplayableRunManifest(ARMS_RUN));
	const { arms, armA, armB } = await recordedComparisonArms(workspace);
	const replay = new ComparisonReplayAdapter({
		execute: recordedGroupExecution({
			roles: ["control"],
			runGroup: arms.runBaselineGroup,
			runsDirectory: arms.runsDirectory,
		}),
		run: ARMS_RUN,
	});
	const { stdout } = replay.recorder;

	await runCompareAttemptsCommand(
		{
			approvedInBrowser: false,
			armA,
			armB,
			json: false,
			runsDirectory: arms.runsDirectory,
			stdinIsTerminal: false,
			yes: true,
		},
		replay,
	);

	expect(
		replay.configs.map(({ stage, corpus, stageSkill }) => ({
			corpus,
			stage,
			stageSkill,
		})),
	).toEqual([
		{
			corpus: arms.baselineCorpusDirectory(),
			stage: STAGE,
			stageSkill: "absent",
		},
	]);
	expect(stdout.join("")).toStartWith(join(arms.runsDirectory, "comparisons"));
}

async function asksForBothArmsByGroupId(): Promise<void> {
	const { output } = recordOutput();

	const failure = await failureOf(
		runCompareAttemptsCommand(
			{
				approvedInBrowser: false,
				armA: "case-g1",
				armB: undefined,
				json: false,
				runsDirectory: "/runs",
				stdinIsTerminal: false,
				yes: true,
			},
			{ ...refusingReplay, output },
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
	expect(failure.message).toBe(
		"Provide both attempts' confirmation groups: rehearse compare attempts --arm-a <group-id> --arm-b <group-id>",
	);
}

async function takesABrowserApprovalOnlyWithYes(): Promise<void> {
	const { output } = recordOutput();

	const failure = await failureOf(
		runCompareAttemptsCommand(
			{
				approvedInBrowser: true,
				armA: "case-g1",
				armB: "case-g2",
				json: false,
				runsDirectory: "/runs",
				stdinIsTerminal: false,
				yes: false,
			},
			{ ...refusingReplay, output },
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
	expect(failure.message).toBe("Use --approved-in-browser only with --yes");
}

function describeWhenBothRecordedArmsAreNamed(): void {
	it(
		"replays the baseline group without the stage's own skill and prints the comparison's report",
		replaysTheBaselineGroupWithoutTheStageSOwn,
	);
}
function describeWhenAnArmGroupIsMissing(): void {
	it("asks for both arms by group id", asksForBothArmsByGroupId);
}
function describeWhenBrowserApprovalHasNoYes(): void {
	it(
		"takes a browser approval only with --yes",
		takesABrowserApprovalOnlyWithYes,
	);
}
describe(runCompareAttemptsCommand.name, () => {
	describe(
		"when both recorded arms are named",
		describeWhenBothRecordedArmsAreNamed,
	);
	describe("when an arm group is missing", describeWhenAnArmGroupIsMissing);
	describe(
		"when browser approval has no --yes",
		describeWhenBrowserApprovalHasNoYes,
	);
});
