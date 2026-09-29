import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { ReplayCliConfig } from "#benchmark/config";
import type { ReplayCommandDependencies } from "#cli/replay-command";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { UsageError } from "#cli/commands";
import {
	replayArmGroup,
	runCompareAttemptsCommand,
	runCompareExtendCommand,
} from "#cli/compare-attempts-command";
import { writeReplayableRunManifest } from "#cli/replay-test-support";
import {
	RecordedArms,
	RUN as ARMS_RUN,
	STAGE,
} from "#benchmark/compare-attempts-test-support";
import { compareAttempts } from "#benchmark/compare-attempts";
import { COMPARISON_ARMS } from "#benchmark/comparison-record";
import { confirmationGroupPaths } from "#benchmark/run-layout";

const RUN = "any-name-baseline";

/**
 * Replay fills a knob its flags leave out from these, so the host's values
 * would decide what a test's baseline replay resolves to.
 */
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
		manifests.splice(0).map((file) => rm(file, { force: true })),
	);
});

describe(replayArmGroup.name, () => {
	it("replays the checkpoint as a confirmation group on the baseline corpus without the stage's own skill and answers with its group id", async () => {
		manifests.push(await writeReplayableRunManifest(RUN));
		const configs: ReplayCliConfig[] = [];
		const { output, stdout, stderr } = recordOutput();

		const groupId = await replayArmGroup(
			{ approval: "browser", stdinIsTerminal: false },
			{
				output,
				resolveRunDirectory: () => Promise.resolve(`/runs/${RUN}`),
				requireSpendCeiling: () => Promise.resolve(100),
				probeModel: () => Promise.resolve(),
				execute: (config) => {
					configs.push(config);

					return Promise.resolve({
						kind: "confirmation" as const,
						evidence: {
							groupRecordFile: "/runs/confirmations/baseline-group/group.json",
							reportFile: "/runs/confirmations/baseline-group/report.json",
							repRecordFiles: [],
						},
					});
				},
			},
		)({
			run: RUN,
			stage: "shape",
			corpusDirectory: "/runs/baseline-corpora/digest",
			reps: 3,
			model: "sonnet",
			effort: "high",
			judgeModel: "opus",
			judgeEffort: "high",
			sessionBudgetUsd: 5,
			role: "control",
			withoutStageSkill: true,
		});

		expect(groupId).toBe("baseline-group");
		expect(
			configs.map((config) => ({
				runName: config.runName,
				stage: config.stage,
				corpus: config.corpus,
				model: config.model,
				effort: config.effort,
				judgeModel: config.judgeModel,
				judgeEffort: config.judgeEffort,
				sessionBudgetUsd: config.sessionBudgetUsd,
				confirmation: config.confirmation,
				stageSkill: config.stageSkill,
			})),
		).toEqual([
			{
				runName: RUN,
				stage: "shape",
				corpus: "/runs/baseline-corpora/digest",
				model: "sonnet",
				effort: "high",
				judgeModel: "opus",
				judgeEffort: "high",
				sessionBudgetUsd: 5,
				confirmation: { reps: 3, approval: "browser" },
				stageSkill: "absent",
			},
		]);
		expect(stdout).toEqual([]);
		expect(stderr.join("")).toContain(
			"/runs/confirmations/baseline-group/report.json",
		);
	});

	it("replays arm A or arm B with the stage's own skill, which only the baseline goes without", async () => {
		manifests.push(await writeReplayableRunManifest(RUN));
		const configs: ReplayCliConfig[] = [];
		const { output } = recordOutput();

		await replayArmGroup(
			{ approval: "yes", stdinIsTerminal: false },
			{
				output,
				resolveRunDirectory: () => Promise.resolve(`/runs/${RUN}`),
				requireSpendCeiling: () => Promise.resolve(100),
				probeModel: () => Promise.resolve(),
				execute: (config) => {
					configs.push(config);

					return Promise.resolve({
						kind: "confirmation" as const,
						evidence: {
							groupRecordFile: "/runs/confirmations/arm-b-more/group.json",
							reportFile: "/runs/confirmations/arm-b-more/report.json",
							repRecordFiles: [],
						},
					});
				},
			},
		)({
			run: RUN,
			stage: "shape",
			corpusDirectory: "/runs/baseline-corpora/arm-b",
			reps: 2,
			model: "sonnet",
			effort: "high",
			judgeModel: "opus",
			judgeEffort: "high",
			sessionBudgetUsd: 5,
			role: "candidate",
			withoutStageSkill: false,
		});

		expect(
			configs.map(({ corpus, stageSkill, confirmation }) => ({
				corpus,
				stageSkill,
				confirmation,
			})),
		).toEqual([
			{
				corpus: "/runs/baseline-corpora/arm-b",
				stageSkill: "installed",
				confirmation: { reps: 2, approval: "yes" },
			},
		]);
	});

	it("refuses before running a rep when replay would not run arm A's inputs", async () => {
		manifests.push(await writeReplayableRunManifest(RUN));
		const { output } = recordOutput();
		let executed = false;

		const failure = await failureOf(
			replayArmGroup(
				{ approval: "yes", stdinIsTerminal: false },
				{
					output,
					resolveRunDirectory: () => Promise.resolve(`/runs/${RUN}`),
					requireSpendCeiling: () => Promise.resolve(100),
					probeModel: () => Promise.resolve(),
					execute: () => {
						executed = true;

						return Promise.reject(new Error("replay must not run"));
					},
				},
			)({
				run: RUN,
				stage: "shape",
				corpusDirectory: "/runs/baseline-corpora/digest",
				reps: 3,
				model: "sonnet",
				effort: "high",
				judgeModel: "opus",
				judgeEffort: undefined,
				sessionBudgetUsd: 5,
				role: "control",
				withoutStageSkill: true,
			}),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toBe(
			"the baseline replay would run judgeEffort high where arm A recorded none, so its group could not be compared",
		);
		expect(executed).toBe(false);
	});

	it("refuses before probing the model when the environment would set an effort arm A ran without", async () => {
		manifests.push(await writeReplayableRunManifest(RUN));
		Bun.env["BENCHMARK_EFFORT"] = "low";
		const { output } = recordOutput();
		let probed = false;

		const failure = await failureOf(
			replayArmGroup(
				{ approval: "yes", stdinIsTerminal: false },
				{
					output,
					resolveRunDirectory: () => Promise.resolve(`/runs/${RUN}`),
					requireSpendCeiling: () => Promise.resolve(100),
					probeModel: () => {
						probed = true;

						return Promise.resolve();
					},
					execute: () => Promise.reject(new Error("replay must not run")),
				},
			)({
				run: RUN,
				stage: "shape",
				corpusDirectory: "/runs/baseline-corpora/digest",
				reps: 3,
				model: "sonnet",
				effort: undefined,
				judgeModel: "opus",
				judgeEffort: undefined,
				sessionBudgetUsd: 5,
				role: "control",
				withoutStageSkill: true,
			}),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toBe(
			"the baseline replay would run effort low where arm A recorded none, so its group could not be compared",
		);
		expect(probed).toBe(false);
	});
});

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

async function temporaryDirectory(prefix: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	temporaryDirectories.push(directory);

	return directory;
}

describe(runCompareAttemptsCommand.name, () => {
	const refusingReplay = {
		resolveRunDirectory: () => Promise.reject(new Error("must not resolve")),
		requireSpendCeiling: () => Promise.reject(new Error("must not read")),
		probeModel: () => Promise.reject(new Error("must not probe")),
		execute: () => Promise.reject(new Error("replay must not run")),
	};

	it("replays the baseline group without the stage's own skill and prints the comparison's report", async () => {
		manifests.push(await writeReplayableRunManifest(ARMS_RUN));
		const arms = await RecordedArms.create(
			await temporaryDirectory("rehearse-compare-command-runs-"),
			await temporaryDirectory("rehearse-compare-command-scratch-"),
		);
		const armA = await arms.recordArm("baseline", {
			"CLAUDE.md": "global instructions\n",
			"skills/build/SKILL.md": "build\n",
		});
		const armB = await arms.recordArm("candidate", {
			"CLAUDE.md": "global instructions\n",
			"skills/build/SKILL.md": "revised build\n",
		});
		for (const arm of [armA, armB]) {
			await arms.readInStage(arm, "skills/build/SKILL.md");
		}
		const configs: ReplayCliConfig[] = [];
		const { output, stdout } = recordOutput();

		await runCompareAttemptsCommand(
			{
				runsDirectory: arms.runsDirectory,
				armA,
				armB,
				yes: true,
				approvedInBrowser: false,
				json: false,
				stdinIsTerminal: false,
			},
			{
				output,
				resolveRunDirectory: () => Promise.resolve(`/runs/${ARMS_RUN}`),
				requireSpendCeiling: () => Promise.resolve(100),
				probeModel: () => Promise.resolve(),
				execute: async (config) => {
					configs.push(config);
					const control = await arms.runBaselineGroup({
						run: config.runName,
						stage: config.stage,
						corpusDirectory: config.corpus ?? "",
						reps: config.confirmation?.reps ?? 0,
						model: config.model,
						effort: config.effort,
						judgeModel: config.judgeModel,
						judgeEffort: config.judgeEffort,
						sessionBudgetUsd: config.sessionBudgetUsd,
						role: "control",
						withoutStageSkill: true,
					});

					return {
						kind: "confirmation" as const,
						evidence: {
							groupRecordFile: confirmationGroupPaths(
								arms.runsDirectory,
								control,
							).groupFile,
							reportFile: "/unused/report.json",
							repRecordFiles: [],
						},
					};
				},
			},
		);

		expect(
			configs.map(({ stage, corpus, stageSkill }) => ({
				stage,
				corpus,
				stageSkill,
			})),
		).toEqual([
			{
				stage: STAGE,
				corpus: arms.baselineCorpusDirectory(),
				stageSkill: "absent",
			},
		]);
		expect(stdout.join("")).toStartWith(
			join(arms.runsDirectory, "comparisons"),
		);
	});

	it("asks for both arms by group id", async () => {
		const { output } = recordOutput();

		const failure = await failureOf(
			runCompareAttemptsCommand(
				{
					runsDirectory: "/runs",
					armA: "case-g1",
					armB: undefined,
					yes: true,
					approvedInBrowser: false,
					json: false,
					stdinIsTerminal: false,
				},
				{ ...refusingReplay, output },
			),
		);

		expect(failure).toBeInstanceOf(UsageError);
		expect(failure.message).toBe(
			"Provide both attempts' confirmation groups: rehearse compare attempts --arm-a <group-id> --arm-b <group-id>",
		);
	});

	it("takes a browser approval only with --yes", async () => {
		const { output } = recordOutput();

		const failure = await failureOf(
			runCompareAttemptsCommand(
				{
					runsDirectory: "/runs",
					armA: "case-g1",
					armB: "case-g2",
					yes: false,
					approvedInBrowser: true,
					json: false,
					stdinIsTerminal: false,
				},
				{ ...refusingReplay, output },
			),
		);

		expect(failure).toBeInstanceOf(UsageError);
		expect(failure.message).toBe("Use --approved-in-browser only with --yes");
	});
});

describe(runCompareExtendCommand.name, () => {
	const refusingReplay = {
		resolveRunDirectory: () => Promise.reject(new Error("must not resolve")),
		requireSpendCeiling: () => Promise.reject(new Error("must not read")),
		probeModel: () => Promise.reject(new Error("must not probe")),
		execute: () => Promise.reject(new Error("replay must not run")),
		prompt: () => Promise.reject(new Error("must not ask")),
	};
	const request = {
		runsDirectory: "/runs",
		comparison: "0".repeat(64),
		attempts: "2",
		yes: true,
		approvedInBrowser: false,
		json: false,
		stdinIsTerminal: false,
	};

	/** A comparison `compare attempts` saved, with replays that add a group per arm. */
	async function savedComparison(): Promise<{
		readonly arms: RecordedArms;
		readonly comparison: string;
		readonly configs: ReplayCliConfig[];
		readonly execute: ReplayCommandDependencies["execute"];
	}> {
		manifests.push(await writeReplayableRunManifest(ARMS_RUN));
		const arms = await RecordedArms.create(
			await temporaryDirectory("rehearse-compare-extend-runs-"),
			await temporaryDirectory("rehearse-compare-extend-scratch-"),
		);
		const armA = await arms.recordArm("baseline", {
			"CLAUDE.md": "global instructions\n",
			"skills/build/SKILL.md": "build\n",
		});
		const armB = await arms.recordArm("candidate", {
			"CLAUDE.md": "global instructions\n",
			"skills/build/SKILL.md": "revised build\n",
		});
		for (const arm of [armA, armB]) {
			await arms.readInStage(arm, "skills/build/SKILL.md");
		}
		const { reportFile } = await compareAttempts(
			{ runsDirectory: arms.runsDirectory, armA, armB },
			{ runBaselineGroup: arms.runBaselineGroup },
		);
		const configs: ReplayCliConfig[] = [];
		const roles = [...COMPARISON_ARMS];

		return {
			arms,
			comparison: basename(dirname(reportFile)),
			configs,
			execute: async (config) => {
				configs.push(config);
				const role = roles.shift();
				if (role === undefined) {
					throw new Error("Expected one replay per arm");
				}
				const groupId = await arms.runMoreGroup({
					run: config.runName,
					stage: config.stage,
					corpusDirectory: config.corpus ?? "",
					reps: config.confirmation?.reps ?? 0,
					model: config.model,
					effort: config.effort,
					judgeModel: config.judgeModel,
					judgeEffort: config.judgeEffort,
					sessionBudgetUsd: config.sessionBudgetUsd,
					role,
					withoutStageSkill: config.stageSkill === "absent",
				});

				return {
					kind: "confirmation" as const,
					evidence: {
						groupRecordFile: confirmationGroupPaths(arms.runsDirectory, groupId)
							.groupFile,
						reportFile: "/unused/report.json",
						repRecordFiles: [],
					},
				};
			},
		};
	}

	it("states the added attempts' cost, asks once, replays every arm as approved and prints the new comparison's report", async () => {
		const { arms, comparison, configs, execute } = await savedComparison();
		const { output, stdout, stderr } = recordOutput();
		const prompts: string[] = [];

		await runCompareExtendCommand(
			{
				...request,
				runsDirectory: arms.runsDirectory,
				comparison: `comparison:${comparison}`,
				yes: false,
				stdinIsTerminal: true,
			},
			{
				output,
				resolveRunDirectory: () => Promise.resolve(`/runs/${ARMS_RUN}`),
				requireSpendCeiling: () => Promise.resolve(100),
				probeModel: () => Promise.resolve(),
				execute,
				prompt: (message) => {
					prompts.push(message);

					return Promise.resolve("y");
				},
			},
		);

		expect(stderr.join("")).toStartWith(
			"Adding 2 attempts to each arm costs about $9.00, at each arm's mean recorded cost per attempt.\n",
		);
		expect(prompts).toEqual(["Add the attempts? [y/N] "]);
		expect(
			configs.map(({ stageSkill, confirmation }) => ({
				stageSkill,
				confirmation,
			})),
		).toEqual([
			{ stageSkill: "installed", confirmation: { reps: 2, approval: "yes" } },
			{ stageSkill: "installed", confirmation: { reps: 2, approval: "yes" } },
			{ stageSkill: "absent", confirmation: { reps: 2, approval: "yes" } },
		]);
		const printed = stdout.join("");
		expect(printed).toStartWith(join(arms.runsDirectory, "comparisons"));
		expect(printed).not.toContain(comparison);
	});

	it("runs nothing when the stated cost is declined", async () => {
		const { arms, comparison, configs, execute } = await savedComparison();
		const { output } = recordOutput();

		const failure = await failureOf(
			runCompareExtendCommand(
				{
					...request,
					runsDirectory: arms.runsDirectory,
					comparison,
					yes: false,
					stdinIsTerminal: true,
				},
				{
					...refusingReplay,
					output,
					execute,
					prompt: () => Promise.resolve("n"),
				},
			),
		);

		expect(failure.message).toBe("Extension declined");
		expect(configs).toEqual([]);
	});

	it.each([
		{
			name: "no comparison",
			change: { comparison: undefined },
			message:
				"Provide the comparison to extend by its manifest digest: rehearse compare extend --comparison <comparison:digest> --attempts <n>",
		},
		{
			name: "a comparison that is not a manifest digest",
			change: { comparison: "../elsewhere" },
			message:
				"Provide the comparison to extend by its manifest digest: rehearse compare extend --comparison <comparison:digest> --attempts <n>",
		},
		{
			name: "no attempts",
			change: { attempts: undefined },
			message:
				"Provide how many attempts to add to each arm as a positive whole number: --attempts <n>",
		},
		{
			name: "no positive whole number of attempts",
			change: { attempts: "0" },
			message:
				"Provide how many attempts to add to each arm as a positive whole number: --attempts <n>",
		},
		{
			name: "a browser approval without --yes",
			change: { yes: false, approvedInBrowser: true },
			message: "Use --approved-in-browser only with --yes",
		},
	])("refuses $name as a usage error", async ({ change, message }) => {
		const { output } = recordOutput();

		const failure = await failureOf(
			runCompareExtendCommand(
				{ ...request, ...change },
				{ ...refusingReplay, output },
			),
		);

		expect(failure).toBeInstanceOf(UsageError);
		expect(failure.message).toBe(message);
	});

	it("refuses to ask for approval with no terminal to answer", async () => {
		const { output } = recordOutput();

		const failure = await failureOf(
			runCompareExtendCommand(
				{ ...request, yes: false },
				{ ...refusingReplay, output },
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toBe(
			"stdin is not a terminal: approving the added attempts' cost needs a TTY; pass --yes instead",
		);
	});
});
