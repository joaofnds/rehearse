import { describe, expect, it } from "bun:test";

import { StageValidationError } from "./contracts";
import { captureStageJudgeInput } from "./stage-grading";
import { stageJudgeInput } from "./stage-grading-test-fixtures";

describe(captureStageJudgeInput.name, () => {
	it("turns invalid stage delivery into Judge evidence", async () => {
		const fallback = stageJudgeInput("discuss");

		const input = await captureStageJudgeInput(
			fallback,
			async () =>
				await Promise.reject(
					new StageValidationError(
						"Discuss completed without its durable spec document",
					),
				),
		);

		expect(input.harnessFailure).toBe(
			"Discuss completed without its durable spec document",
		);
		expect(input).toEqual({
			...fallback,
			harnessFailure: "Discuss completed without its durable spec document",
		});
	});

	it("propagates infrastructure failures", () => {
		const result = captureStageJudgeInput(
			stageJudgeInput("discuss"),
			async () => await Promise.reject(new Error("git executable unavailable")),
		);

		expect(result).rejects.toThrow("git executable unavailable");
	});
});
