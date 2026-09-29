import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import type { ReplayCliConfig } from "#benchmark/config";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { replayBaselineGroup } from "#cli/compare-attempts-command";
import { writeReplayableRunManifest } from "#cli/replay-test-support";

const RUN = "any-name-baseline";

describe(replayBaselineGroup.name, () => {
	const manifests: string[] = [];

	afterEach(async () => {
		await Promise.all(
			manifests.splice(0).map((file) => rm(file, { force: true })),
		);
	});

	it("replays the checkpoint as a confirmation group on the baseline corpus and answers with its group id", async () => {
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
			}),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toBe(
			"the baseline replay would run judgeEffort high where arm A recorded none, so its group could not be compared",
		);
		expect(executed).toBe(false);
	});
});
