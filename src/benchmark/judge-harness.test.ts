import { describe, expect, it } from "bun:test";

import type { JudgeGrade } from "./contracts";
import { runJudge } from "./judge";
import { applyHarnessResults } from "./judge-harness";
import {
	completeGrade,
	gradedOnce,
	passingChecks,
	requirement,
} from "./judge-test-fixtures";
import { harnessResult } from "./test-support";

const EXPECTED_HARNESS_REQUIREMENTS = [
	{
		evidence: [
			{
				claim: "passes",
				locator: {
					kind: "harness",
					recorded: true,
					result: "checkIntegrity",
				},
				path: "harness",
				source: "local-checks",
			},
		],
		id: "check-integrity",
	},
	{
		evidence: [
			{
				claim: "passes",
				locator: {
					kind: "harness",
					recorded: true,
					result: "localChecks",
				},
				path: "harness",
				source: "local-checks",
			},
		],
		id: "local-checks",
	},
] satisfies Pick<JudgeGrade["requirements"][number], "id" | "evidence">[];

describe(applyHarnessResults.name, () => {
	it("forces a failed verdict when local checks fail", () => {
		const result = applyHarnessResults(
			completeGrade("PASS"),
			harnessResult("PASS", "check definitions match"),
			harnessResult("FAIL", "unit tests exited 1"),
		);

		expect(result.verdict).toBe("FAIL");
		expect(
			result.requirements.find(({ id }) => id === "local-checks")?.status,
		).toBe("FAIL");
	});
});

describe(runJudge.name, () => {
	describe("quoted spans", () => {
		it("names the harness result on the requirements the harness writes", async () => {
			const result = await gradedOnce(requirement("tests", "PASS"));

			expect(
				result.grade.requirements
					.filter(({ id }) => id === "check-integrity" || id === "local-checks")
					.map(({ id, evidence }) => ({ evidence, id })),
			).toEqual(EXPECTED_HARNESS_REQUIREMENTS);
			expect(passingChecks.evidence).toEqual([
				{ claim: "passes", path: "harness", source: "local-checks" },
			]);
		});
	});
});
