import type { JudgeGrade } from "./contracts";

const EMPTY_COLLECTION_LENGTH = 0;

function assertExactRequirements(
	grade: JudgeGrade,
	expectedIds: readonly string[],
): void {
	const observedIds = new Set(grade.requirements.map(({ id }) => id));
	const expectedIdSet = new Set(expectedIds);
	const missingIds = expectedIds.filter((id) => !observedIds.has(id));
	const unknownIds = grade.requirements.filter(
		({ id }) => !expectedIdSet.has(id),
	);
	const duplicateIds = grade.requirements.filter(
		({ id }, index) =>
			grade.requirements.findIndex((requirement) => requirement.id === id) !==
			index,
	);

	if (
		missingIds.length > EMPTY_COLLECTION_LENGTH ||
		unknownIds.length > EMPTY_COLLECTION_LENGTH ||
		duplicateIds.length > EMPTY_COLLECTION_LENGTH
	) {
		throw new Error("Judge must return every rubric requirement exactly once");
	}
}

function validateJudgeGrade<Grade extends JudgeGrade>(
	grade: Grade,
	expectedIds: readonly string[],
): Grade {
	assertExactRequirements(grade, expectedIds);
	const expectedVerdict = grade.requirements.every(
		({ status }) => status === "PASS",
	)
		? "PASS"
		: "FAIL";

	if (grade.verdict !== expectedVerdict) {
		throw new Error(
			`Judge verdict ${grade.verdict} contradicts requirement results`,
		);
	}

	return grade;
}

export { validateJudgeGrade as default };
