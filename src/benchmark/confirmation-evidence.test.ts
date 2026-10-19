import { describe, expect, it } from "bun:test";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

import {
	collectConfirmationMetrics,
	settleCompletedConfirmationRep,
} from "./confirmation-evidence";
import type { ClaudeCallMetrics } from "./contracts";
import { TestResources } from "./test-support";

const GIT_SHA_HEX_CHARACTERS = 40;

const testResources = TestResources.forEachTest();

describe(collectConfirmationMetrics.name, () => {
	it("retains available calls while marking every metric-less required attempt", () => {
		const metric: ClaudeCallMetrics = {
			cacheReadTokens: 30,
			cacheWriteTokens: 40,
			costUsd: 0.25,
			inputTokens: 100,
			outputTokens: 20,
			turns: 2,
		};

		const evidence = collectConfirmationMetrics({
			finalJudge: [{ metrics: metric }, {}],
			productOwner: [{ metrics: metric }, {}],
			stageJudge: [{ metrics: metric }, {}],
			worker: [{ metrics: metric }, {}],
		});

		expect(evidence).toEqual({
			metrics: {
				calls: [
					{ metrics: metric, role: "worker" },
					{ metrics: metric, role: "product-owner" },
					{ metrics: metric, role: "stage-judge" },
					{ metrics: metric, role: "final-judge" },
				],
				missing: [
					"worker call metrics",
					"product-owner call metrics",
					"stage-judge call metrics",
					"final-judge call metrics",
				],
				status: "MISSING",
			},
			workerTrajectorySteps: 2,
		});
	});
});

describe(settleCompletedConfirmationRep.name, () => {
	it("leaves no rep record or cleanup after retention fails", async () => {
		const directory = await testResources.createTemporaryDirectory(
			"rehearse-settlement-",
		);
		const worktreePath = join(directory, "worktree");
		await mkdir(worktreePath);
		const recordFile = join(directory, "rep.json");
		let removed = false;

		const settlement = settleCompletedConfirmationRep({
			recordContent: "{}\n",
			recordFile,
			recordRetentionRef: async () => {
				await Promise.reject(new Error("retention failed"));
			},
			removeWorktree: async () => {
				removed = true;

				await Promise.resolve();
			},
			resultSha: "a".repeat(GIT_SHA_HEX_CHARACTERS),
			retentionName: "group/rep",
			targetRoot: directory,
			worktreePath,
		});

		expect(settlement).rejects.toThrow("retention failed");
		expect(
			await stat(recordFile).then(
				() => true,
				() => false,
			),
		).toBe(false);
		expect(await stat(worktreePath).then((entry) => entry.isDirectory())).toBe(
			true,
		);
		expect(removed).toBe(false);
	});
});
