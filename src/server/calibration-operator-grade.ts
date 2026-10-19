import { z } from "zod";

import parseJsonDocument from "#benchmark/json-document";
import {
	OperatorGradeExistsError,
	operatorGradeSchema,
	writeOperatorGrade,
} from "#benchmark/operator-grade";
import type { GradedStageRef, OperatorGrade } from "#benchmark/operator-grade";
import orderedValidationIssues from "#benchmark/validation-issue-order";
import type { ValidationFieldOrder } from "#benchmark/validation-issue-order";
import { CalibrationRefusalError } from "#server/calibration-contract";
import type { JudgeGrade } from "#server/calibration-contract";
import { requiredStage } from "#server/calibration-stage-reading";
import { gradedLetter } from "#server/calibration-stage-reference";
import {
	HTTP_STATUS_BAD_REQUEST,
	HTTP_STATUS_CONFLICT,
} from "#server/http-status";

const operatorGradeValidationOrder: ValidationFieldOrder = {
	children: {
		dimensions: { fields: ["id", "grade"] },
		hardBlockers: { fields: ["id", "status"] },
		requirements: { fields: ["id", "status"] },
	},
	fields: ["hardBlockers", "requirements", "dimensions", "note"],
};

function sameIds(
	given: readonly { readonly id: string }[],
	expected: readonly { readonly id: string }[],
): boolean {
	const ids = given.map(({ id }) => id);

	return (
		ids.length === expected.length &&
		new Set(ids).size === ids.length &&
		expected.every(({ id }) => ids.includes(id))
	);
}

/** The request body as sent, parsed here because a grade is the one thing the operator writes. */
function operatorGradeFrom(body: string): OperatorGrade {
	const documentReading = parseJsonDocument(body, operatorGradeSchema);
	if (documentReading.kind === "invalid-json") {
		if (!(documentReading.error instanceof SyntaxError)) {
			throw documentReading.error;
		}

		throw new CalibrationRefusalError(
			HTTP_STATUS_BAD_REQUEST,
			"The grade is not JSON",
		);
	}

	const { parsed } = documentReading;
	if (!parsed.success) {
		const issues = orderedValidationIssues({
			error: parsed.error,
			order: operatorGradeValidationOrder,
		});
		throw new CalibrationRefusalError(
			HTTP_STATUS_BAD_REQUEST,
			z.prettifyError({ issues }),
		);
	}

	return parsed.data;
}

async function recordOperatorGrade(
	runsDirectory: string,
	ref: GradedStageRef,
	grade: OperatorGrade,
): Promise<{
	readonly operatorGrade: ReturnType<typeof gradedLetter>;
	readonly judgeGrade: JudgeGrade;
}> {
	const stage = await requiredStage(runsDirectory, ref);
	const { criteria } = stage;
	if (
		!sameIds(grade.hardBlockers, criteria.hardBlockers) ||
		!sameIds(grade.requirements, criteria.requirements) ||
		!sameIds(grade.dimensions, criteria.dimensions)
	) {
		throw new CalibrationRefusalError(
			HTTP_STATUS_BAD_REQUEST,
			"Grade every rubric criterion of this stage exactly once",
		);
	}

	try {
		await writeOperatorGrade(runsDirectory, ref, grade);
	} catch (error) {
		if (!(error instanceof OperatorGradeExistsError)) {
			throw error;
		}

		throw new CalibrationRefusalError(HTTP_STATUS_CONFLICT, error.message);
	}

	return { judgeGrade: stage.judgeGrade, operatorGrade: gradedLetter(grade) };
}

export { operatorGradeFrom, recordOperatorGrade };
