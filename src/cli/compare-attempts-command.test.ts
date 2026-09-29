import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReplayCliConfig } from "#benchmark/config";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { loadRunManifest } from "#benchmark/manifest";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { UsageError } from "#cli/commands";
import {
	replayBaselineGroup,
	runCompareAttemptsCommand,
} from "#cli/compare-attempts-command";
import { writeReplayableRunManifest } from "#cli/replay-test-support";
import {
	RecordedArms,
	RUN as ARMS_RUN,
	STAGE,
} from "#benchmark/compare-attempts-test-support";
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

const REPLAYED_STAGE_RUBRIC_SHA256 = createHash("sha256")
	.update(await Bun.file("cases/audit-log/rubrics/shape.json").text())
	.digest("hex");

const manifests: string[] = [];

afterEach(async () => {
	await Promise.all(
		manifests.splice(0).map((file) => rm(file, { force: true })),
	);
});

describe(replayBaselineGroup.name, () => {
	it("replays the checkpoint as a confirmation group on the baseline corpus without the stage's own skill and answers with its group id", async () => {
		manifests.push(await writeReplayableRunManifest(RUN));
		const configs: ReplayCliConfig[] = [];
		const { output, stdout, stderr } = recordOutput();

		const groupId = await replayBaselineGroup(
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
			rubricSha256: REPLAYED_STAGE_RUBRIC_SHA256,
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

	it("refuses before running a rep when replay would not run arm A's inputs", async () => {
		manifests.push(await writeReplayableRunManifest(RUN));
		const { output } = recordOutput();
		let executed = false;

		const failure = await failureOf(
			replayBaselineGroup(
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
				rubricSha256: REPLAYED_STAGE_RUBRIC_SHA256,
			}),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toBe(
			"the baseline replay would run judgeEffort high where arm A recorded none, so its group could not be compared",
		);
		expect(executed).toBe(false);
	});

	it("refuses before probing the model when the stage's rubric changed since arm A was recorded", async () => {
		manifests.push(await writeReplayableRunManifest(RUN));
		const { output } = recordOutput();
		let probed = false;

		const failure = await failureOf(
			replayBaselineGroup(
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
				effort: "high",
				judgeModel: "opus",
				judgeEffort: "high",
				sessionBudgetUsd: 5,
				rubricSha256: "0".repeat(64),
			}),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toBe(
			"the cases/audit-log/rubrics/shape.json rubric changed since arm A was recorded, so a baseline group run now could not be compared with it",
		);
		expect(probed).toBe(false);
	});

	it.each([
		{
			name: "the run's pipeline no longer has the stage",
			stage: "nowhere",
			rubric: undefined,
			message: `the ${RUN} run's pipeline has no nowhere stage, so no rubric can grade a baseline group against arm A`,
		},
		{
			name: "the stage's rubric can no longer be read",
			stage: "shape",
			rubric: "rubrics/missing.json",
			message:
				"the rubrics/missing.json rubric cannot be read, so a baseline group run now could not be compared with arm A: ",
		},
	])(
		"refuses before probing the model when $name",
		async ({ stage, rubric, message }) => {
			const manifestFile = await writeReplayableRunManifest(RUN);
			manifests.push(manifestFile);
			if (rubric !== undefined) {
				const manifest = await loadRunManifest(manifestFile);
				const replayed = manifest.pipeline.stages.find(
					({ name }) => name === stage,
				);
				if (replayed === undefined) {
					throw new Error(`Expected the manifest to declare ${stage}`);
				}
				const text = await Bun.file(manifestFile).text();
				await Bun.write(
					manifestFile,
					text.replaceAll(`"${replayed.rubric}"`, `"${rubric}"`),
				);
			}
			const { output } = recordOutput();
			let probed = false;

			const failure = await failureOf(
				replayBaselineGroup(
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
					stage,
					corpusDirectory: "/runs/baseline-corpora/digest",
					reps: 3,
					model: "sonnet",
					effort: undefined,
					judgeModel: "opus",
					judgeEffort: undefined,
					sessionBudgetUsd: 5,
					rubricSha256: REPLAYED_STAGE_RUBRIC_SHA256,
				}),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(failure.message).toStartWith(message);
			expect(probed).toBe(false);
		},
	);

	it("refuses before probing the model when the environment would set an effort arm A ran without", async () => {
		manifests.push(await writeReplayableRunManifest(RUN));
		Bun.env["BENCHMARK_EFFORT"] = "low";
		const { output } = recordOutput();
		let probed = false;

		const failure = await failureOf(
			replayBaselineGroup(
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
				rubricSha256: REPLAYED_STAGE_RUBRIC_SHA256,
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
		const rubric = await Bun.file("cases/audit-log/rubrics/build.json").text();
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
			await arms.freezeRubric(arm, rubric);
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
						rubricSha256: "",
					});
					await arms.freezeRubric(control, rubric);

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
