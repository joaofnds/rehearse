import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { replayArmGroup } from "#cli/compare-attempts-command";
import writeReplayableRunManifest from "#cli/replay-test-support";

import {
	ComparisonReplayAdapter,
	confirmationExecution,
} from "./comparison-replay-test-adapter";

const RESOURCE_DRAIN_START_INDEX = 0;

const STORED_SPEND_CEILING_USD = 100;

const RUN = "any-name-baseline";

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

async function replaysTheCheckpointAsAConfirmationGroupOnThe(): Promise<void> {
	manifests.push(await writeReplayableRunManifest(RUN));
	const replay = new ComparisonReplayAdapter({
		execute: confirmationExecution("baseline-group"),
		run: RUN,
	});
	const { stdout, stderr } = replay.recorder;

	const groupId = await replayArmGroup(
		{ approval: "browser", stdinIsTerminal: false },
		replay,
	)({
		corpusDirectory: "/runs/baseline-corpora/digest",
		effort: "high",
		judgeEffort: "high",
		judgeModel: "opus",
		model: "sonnet",
		reps: 3,
		role: "control",
		run: RUN,
		sessionBudgetUsd: 5,
		stage: "shape",
		withoutStageSkill: true,
	});

	expect(groupId).toBe("baseline-group");
	expect(replay.configs).toEqual([
		{
			confirmation: { approval: "browser", reps: 3 },
			corpus: "/runs/baseline-corpora/digest",
			effort: "high",
			judgeEffort: "high",
			judgeModel: "opus",
			minimumStageGrade: "B",
			model: "sonnet",
			runName: RUN,
			sessionBudgetUsd: 5,
			stage: "shape",
			stageSkill: "absent",
		},
	]);
	expect(stdout).toEqual([]);
	expect(stderr.join("")).toContain(
		"/runs/confirmations/baseline-group/report.json",
	);
}

async function replaysArmAOrArmBWithTheStage(): Promise<void> {
	manifests.push(await writeReplayableRunManifest(RUN));
	const replay = new ComparisonReplayAdapter({
		execute: confirmationExecution("arm-b-more"),
		run: RUN,
	});

	await replayArmGroup(
		{ approval: "yes", stdinIsTerminal: false },
		replay,
	)({
		corpusDirectory: "/runs/baseline-corpora/arm-b",
		effort: "high",
		judgeEffort: "high",
		judgeModel: "opus",
		model: "sonnet",
		reps: 2,
		role: "candidate",
		run: RUN,
		sessionBudgetUsd: 5,
		stage: "shape",
		withoutStageSkill: false,
	});

	expect(
		replay.configs.map(({ corpus, stageSkill, confirmation }) => ({
			confirmation,
			corpus,
			stageSkill,
		})),
	).toEqual([
		{
			confirmation: { approval: "yes", reps: 2 },
			corpus: "/runs/baseline-corpora/arm-b",
			stageSkill: "installed",
		},
	]);
}

async function refusesBeforeRunningARepWhenReplayWouldNot(): Promise<void> {
	manifests.push(await writeReplayableRunManifest(RUN));
	const { output } = recordOutput();
	let executed = false;

	const failure = await failureOf(
		replayArmGroup(
			{ approval: "yes", stdinIsTerminal: false },
			{
				execute: async () => {
					executed = true;

					return await Promise.reject(new Error("replay must not run"));
				},
				output,
				probeModel: async () => {
					await Promise.resolve();
				},
				requireSpendCeiling: async () =>
					await Promise.resolve(STORED_SPEND_CEILING_USD),
				resolveRunDirectory: async () => await Promise.resolve(`/runs/${RUN}`),
			},
		)({
			corpusDirectory: "/runs/baseline-corpora/digest",
			effort: "high",
			judgeEffort: undefined,
			judgeModel: "opus",
			model: "sonnet",
			reps: 3,
			role: "control",
			run: RUN,
			sessionBudgetUsd: 5,
			stage: "shape",
			withoutStageSkill: true,
		}),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toBe(
		"the baseline replay would run judgeEffort high where arm A recorded none, so its group could not be compared",
	);
	expect(executed).toBe(false);
}

async function refusesBeforeProbingTheModelWhenTheEnvironmentWould(): Promise<void> {
	manifests.push(await writeReplayableRunManifest(RUN));
	Bun.env["BENCHMARK_EFFORT"] = "low";
	const { output } = recordOutput();
	let probed = false;

	const failure = await failureOf(
		replayArmGroup(
			{ approval: "yes", stdinIsTerminal: false },
			{
				execute: async () =>
					await Promise.reject(new Error("replay must not run")),
				output,
				probeModel: async () => {
					probed = true;

					await Promise.resolve();
				},
				requireSpendCeiling: async () =>
					await Promise.resolve(STORED_SPEND_CEILING_USD),
				resolveRunDirectory: async () => await Promise.resolve(`/runs/${RUN}`),
			},
		)({
			corpusDirectory: "/runs/baseline-corpora/digest",
			effort: undefined,
			judgeEffort: undefined,
			judgeModel: "opus",
			model: "sonnet",
			reps: 3,
			role: "control",
			run: RUN,
			sessionBudgetUsd: 5,
			stage: "shape",
			withoutStageSkill: true,
		}),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toBe(
		"the baseline replay would run effort low where arm A recorded none, so its group could not be compared",
	);
	expect(probed).toBe(false);
}

function describeWhenRecordedInputsStillMatch(): void {
	it(
		"replays the checkpoint as a confirmation group on the baseline corpus without the stage's own skill and answers with its group id",
		replaysTheCheckpointAsAConfirmationGroupOnThe,
	);
	it(
		"replays arm A or arm B with the stage's own skill, which only the baseline goes without",
		replaysArmAOrArmBWithTheStage,
	);
}
function describeWhenCurrentInputsDisagreeWithArmA(): void {
	it(
		"refuses before running a rep when replay would not run arm A's inputs",
		refusesBeforeRunningARepWhenReplayWouldNot,
	);
	it(
		"refuses before probing the model when the environment would set an effort arm A ran without",
		refusesBeforeProbingTheModelWhenTheEnvironmentWould,
	);
}
describe(replayArmGroup.name, () => {
	describe(
		"when recorded inputs still match",
		describeWhenRecordedInputsStillMatch,
	);
	describe(
		"when current inputs disagree with arm A",
		describeWhenCurrentInputsDisagreeWithArmA,
	);
});
