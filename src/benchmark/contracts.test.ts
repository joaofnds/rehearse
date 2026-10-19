import { describe, expect, it } from "bun:test";

import type { JudgeGrade } from "./contracts";
import { claudeJsonSchema, stageTurnSchema } from "./contracts";
import validateJudgeGrade from "./judge-grade";

const OMITTED_INITIAL_REQUIREMENT_COUNT = 1;
const OMITTED_FINAL_REQUIREMENT_OFFSET = -1;

const FIRST_RUBRIC_ID_INDEX = 0;

const PREFIX_START_INDEX = 0;

const RUBRIC_IDS = [
	"tests",
	"worker",
	"check-integrity",
	"local-checks",
] as const;

function completeGrade(verdict: "PASS" | "FAIL"): JudgeGrade {
	return {
		requirements: RUBRIC_IDS.map((id) => requirement(id, verdict)),
		summary: "complete",
		verdict,
	};
}

function requirement(
	id: string,
	status: "PASS" | "FAIL",
): JudgeGrade["requirements"][number] {
	return {
		evidence: [
			{
				claim: `${id} evidence`,
				path: "src/audit/example.ts",
				source: "diff",
			},
		],
		id,
		status,
	};
}

function withFirstRequirement(
	grade: JudgeGrade,
	first: JudgeGrade["requirements"][number],
): JudgeGrade {
	return {
		...grade,
		requirements: [
			first,
			...grade.requirements.slice(OMITTED_INITIAL_REQUIREMENT_COUNT),
		],
	};
}

describe(validateJudgeGrade.name, () => {
	it("accepts a complete consistent grade", () => {
		const grade = completeGrade("PASS");

		expect(validateJudgeGrade(grade, RUBRIC_IDS)).toEqual(grade);
	});

	it("rejects a verdict that contradicts requirement results", () => {
		const grade = withFirstRequirement(
			completeGrade("PASS"),
			requirement(RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX], "FAIL"),
		);

		expect(() => validateJudgeGrade(grade, RUBRIC_IDS)).toThrow(
			"contradicts requirement results",
		);
	});

	it("rejects an incomplete grade", () => {
		const base = completeGrade("PASS");
		const grade = {
			...base,
			requirements: base.requirements.slice(
				PREFIX_START_INDEX,
				OMITTED_FINAL_REQUIREMENT_OFFSET,
			),
		};

		expect(() => validateJudgeGrade(grade, RUBRIC_IDS)).toThrow(
			"every rubric requirement exactly once",
		);
	});

	it("accepts requirements added to the rubric without a code change", () => {
		const base = completeGrade("PASS");
		const grade = {
			...base,
			requirements: [...base.requirements, requirement("human-review", "PASS")],
		};

		const validated = validateJudgeGrade(grade, [
			...RUBRIC_IDS,
			"human-review",
		]);

		expect(validated).toEqual(grade);
	});
});

describe(claudeJsonSchema.name, () => {
	it("omits the $schema key Claude rejects", () => {
		expect(claudeJsonSchema(stageTurnSchema)).not.toContain('"$schema"');
	});
});
