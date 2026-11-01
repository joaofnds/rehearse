import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import JudgeResponseScript from "./judge-script-test-fixture";
import runSessionJudge from "./session-judge";
import {
	sessionJudgeRequest,
	sessionJudgeResponse,
} from "./session-judge-test-fixtures";

describe("session Judge rubric", () => {
	it.each([
		"No numbered requirements.",
		"1. `same`: First.\n2. `same`: Duplicate.",
	])(
		"refuses an invalid definition without a paid call: %s",
		async (rubric) => {
			const script = new JudgeResponseScript([]);
			const request = sessionJudgeRequest(script.invoke);

			const failure = await failureOf(
				runSessionJudge({
					...request,
					definition: { ...request.definition, rubric },
				}),
			);

			expect(failure).toMatchObject({
				message: "Rubric must contain unique requirement IDs",
			});
			expect(script.prompts).toEqual([]);
		},
	);

	it("rejects a response that substitutes another requirement ID", async () => {
		const wrongId = sessionJudgeResponse({ id: "unrequested" });
		const script = new JudgeResponseScript([wrongId, wrongId]);

		const result = await runSessionJudge(sessionJudgeRequest(script.invoke));

		expect(result).toMatchObject({
			detail: "Judge must return every rubric requirement exactly once",
			status: "ERROR",
		});
		expect(result).not.toHaveProperty("grade");
	});
});

describe("session Judge settings", () => {
	it("records the configured Judge settings instead of worker defaults", async () => {
		const script = new JudgeResponseScript([sessionJudgeResponse()]);
		const request = sessionJudgeRequest(script.invoke);

		const result = await runSessionJudge({
			...request,
			definition: {
				...request.definition,
				effort: "medium",
				model: "haiku",
				sessionBudgetUsd: 0.5,
			},
		});

		expect(result).toMatchObject({
			effort: "medium",
			model: "haiku",
			sessionBudgetUsd: 0.5,
			status: "GRADED",
		});
	});
});
