import { describe, expect, it } from "bun:test";

import { runSessionAttempt } from "./session-attempt";
import { request, sessionCase } from "./session-attempt-case-test-fixtures";
import { FakeClaude } from "./session-attempt-provider-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";
import { RUBRIC, sessionJudgeResponse } from "./session-judge-test-fixtures";
import { createSpendCeiling } from "./spend-ceiling";

const TOTAL_COST_USD = 0.1012;
const WORKER_CALL_COUNT = 1;

resources.registerCleanup();

describe(runSessionAttempt.name, () => {
	it(
		"charges reported worker spend before judging even without worker token metrics",
		exhaustedWithoutUsage,
	);
	it("preserves a failing quality grade beside passing reply checks and charges both sessions", async () => {
		const projects = await projectsRoot();
		const worker = new FakeClaude(projects, "OK");
		const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });

		const attempt = await runSessionAttempt(
			request({
				invokeJudge: async () =>
					await Promise.resolve(
						sessionJudgeResponse({ quote: "OK", status: "FAIL" }),
					),
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: worker.run,
				sessionCase: sessionCase({
					judge: { files: [], rubric: RUBRIC, rubricPath: "rubric.md" },
				}),
				spendCeiling,
			}),
		);

		expect(attempt.outcome).toBe("SUCCESSFUL");
		expect(attempt.judge).toMatchObject({
			grade: { verdict: "FAIL" },
			status: "GRADED",
		});
		expect(spendCeiling.spentUsd()).toBeCloseTo(TOTAL_COST_USD);
		expect(worker.runs).toHaveLength(WORKER_CALL_COUNT);
	});
});

async function exhaustedWithoutUsage(): Promise<void> {
	const projects = await projectsRoot();
	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
	const attempt = await runSessionAttempt(
		request({
			invokeJudge: async () =>
				await Promise.resolve(sessionJudgeResponse({ quote: "OK" })),
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: async () =>
				await Promise.resolve(
					JSON.stringify({
						result: "OK",
						session_id: "worker",
						total_cost_usd: 1,
						type: "result",
					}),
				),
			sessionCase: sessionCase({
				judge: { files: [], rubric: RUBRIC, rubricPath: "rubric.md" },
			}),
			spendCeiling,
		}),
	);

	expect(attempt.metrics).toBeUndefined();
	expect(attempt.judge).toMatchObject({
		costUsd: 0,
		providerCalls: [],
		status: "ERROR",
	});
	expect(spendCeiling.spentUsd()).toBe(spendCeiling.ceilingUsd);
}
