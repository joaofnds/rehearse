import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { deriveStageGrade } from "./stage-grade";
import {
	passingStageOutput,
	stageJudgeInput,
} from "./stage-grading-test-fixtures";
import { applyAuthoritativeStageResults } from "./stage-harness-results";
import { parseStageRubric } from "./stage-rubric";
import {
	AUDIT_LOG_RUBRICS_PATH,
	PROJECT_ROOT,
	harnessResult,
} from "./test-support";

async function failsRenamedDeliveryStageWhenLocalChecksFail(): Promise<void> {
	const rubric = parseStageRubric(
		await Bun.file(
			join(PROJECT_ROOT, AUDIT_LOG_RUBRICS_PATH, "build.json"),
		).text(),
		"delivery",
	);
	const input = {
		...stageJudgeInput("build", {
			checkIntegrity: harnessResult("PASS", "check definitions match"),
			localChecks: harnessResult("FAIL", "unit tests exited 1"),
		}),
		kind: "delivery" as const,
		stage: "ship",
	};

	const grade = deriveStageGrade(
		applyAuthoritativeStageResults(passingStageOutput(rubric), input),
		rubric,
	);

	expect(grade.grade).toBe("F");
	expect(
		grade.hardBlockers.find(({ id }) => id === "unfinished-delivery")?.status,
	).toBe("FAIL");
}

async function failsBuildWhenLocalChecksFail(): Promise<void> {
	const rubric = parseStageRubric(
		await Bun.file(
			join(PROJECT_ROOT, AUDIT_LOG_RUBRICS_PATH, "build.json"),
		).text(),
	);
	const output = passingStageOutput(rubric);
	const input = stageJudgeInput("build", {
		checkIntegrity: harnessResult("PASS", "check definitions match"),
		localChecks: harnessResult("FAIL", "unit tests exited 1"),
	});

	const grade = deriveStageGrade(
		applyAuthoritativeStageResults(output, input),
		rubric,
	);

	expect(grade.grade).toBe("F");
	expect(
		grade.hardBlockers.find(({ id }) => id === "unfinished-delivery")?.status,
	).toBe("FAIL");
}

async function failsBuildWhenCheckDefinitionsChange(): Promise<void> {
	const rubric = parseStageRubric(
		await Bun.file(
			join(PROJECT_ROOT, AUDIT_LOG_RUBRICS_PATH, "build.json"),
		).text(),
	);
	const output = passingStageOutput(rubric);
	const input = stageJudgeInput("build", {
		checkIntegrity: harnessResult("FAIL", "package.json changed"),
		localChecks: harnessResult("PASS", "unit tests passed"),
	});

	const grade = deriveStageGrade(
		applyAuthoritativeStageResults(output, input),
		rubric,
	);

	expect(grade.grade).toBe("F");
	expect(
		grade.hardBlockers.find(({ id }) => id === "false-test-safety")?.status,
	).toBe("FAIL");
}

async function failsMalformedStageDelivery(): Promise<void> {
	const rubric = parseStageRubric(
		await Bun.file(
			join(PROJECT_ROOT, AUDIT_LOG_RUBRICS_PATH, "shape.json"),
		).text(),
	);
	const output = passingStageOutput(rubric);
	const input = stageJudgeInput("discuss", {
		harnessFailure: "Discuss completed without its durable spec document",
	});

	const grade = deriveStageGrade(
		applyAuthoritativeStageResults(output, input),
		rubric,
	);

	expect(grade.grade).toBe("F");
	expect(
		grade.hardBlockers.find(({ id }) => id === "invalid-stage-delivery")
			?.status,
	).toBe("FAIL");
}

describe(applyAuthoritativeStageResults.name, () => {
	it(
		"forces a delivery stage under any name to F when local checks fail",
		failsRenamedDeliveryStageWhenLocalChecksFail,
	);

	it("forces Build to F when local checks fail", failsBuildWhenLocalChecksFail);

	it(
		"forces Build to F when check definitions change",
		failsBuildWhenCheckDefinitionsChange,
	);

	it("forces a malformed stage delivery to F", failsMalformedStageDelivery);
});
