import { describe, expect, it } from "bun:test";

import type { CalibrationJudges } from "./calibration-context";
import calibrate from "./calibration-execution";
import { RUBRIC_IDS, completeGrade } from "./calibration-grade-test-fixtures";

const DIGEST_WIDTH = 64;
const CONTRACT = "e".repeat(DIGEST_WIDTH);
const ORDINAL_BASE = 1;

function finalJudge(judgeContractSha256?: string): CalibrationJudges {
	return {
		finalJudge: async () =>
			await Promise.resolve({
				attempts: [],
				costUsd: 0,
				grade: completeGrade("PASS"),
				judgeContractSha256,
				prompt: "revised prompt",
			}),
		stageJudge: async () =>
			await Promise.reject(new Error("No stage rubric changed")),
	};
}

describe("rejudged final instruction identity", () => {
	it.each([CONTRACT, undefined])(
		"retains the revised result's recorded identity %s",
		async (judgeContractSha256) => {
			const result = await calibrate(
				{
					current: {
						finalRubric: RUBRIC_IDS.map(
							(id, index) => `${index + ORDINAL_BASE}. \`${id}\`: requirement`,
						).join("\n"),
						instructions: "instructions",
						stageRubrics: new Map(),
					},
					frozen: {
						finalCandidate: {
							baselineContext: [],
							changedPaths: [],
							checkIntegrity: { evidence: [], status: "PASS" },
							diff: "diff",
							localChecks: { evidence: [], status: "PASS" },
							originalGrade: completeGrade("PASS"),
						},
						finalRubric: "old rubric",
						instructions: "instructions",
						stageScorecards: [],
					},
					review: { findings: [], summary: "agrees", verdict: "ACCEPT" },
				},
				finalJudge(judgeContractSha256),
			);

			expect(result.revisedJudgeContractSha256).toBe(judgeContractSha256);
			expect(result.revisedJudgePrompt).toBe("revised prompt");
		},
	);
});
