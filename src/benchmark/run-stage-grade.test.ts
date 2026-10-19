import { describe, expect, it } from "bun:test";

import { stageScorecard } from "./run-stage-judge-test-fixtures";
import { assertStageGradePassed } from "./stage-grade";

const rejectsFailingGrade = (): void => {
	expect(() => {
		assertStageGradePassed(stageScorecard("FAIL"));
	}).toThrow("minimum grade is B");
};

const acceptsPassingGrade = (): void => {
	expect(() => {
		assertStageGradePassed(stageScorecard("PASS"));
	}).not.toThrow();
};

const acceptsLowerMinimum = (): void => {
	expect(() => {
		assertStageGradePassed(stageScorecard("FAIL"), "C");
	}).not.toThrow();
};

const namesMinimumGrade = (): void => {
	expect(() => {
		assertStageGradePassed(stageScorecard("FAIL"), "C");
	}).not.toThrow();
	expect(() => {
		assertStageGradePassed(stageScorecard("FAIL"), "A");
	}).toThrow("minimum grade is A");
};
describe("assertStageGradePassed", () => {
	it("stops the workflow on a failed stage grade", rejectsFailingGrade);

	it("continues past a passing stage grade", acceptsPassingGrade);

	it(
		"continues past a grade the caller's lowered minimum accepts",
		acceptsLowerMinimum,
	);

	it(
		"names the caller's minimum when the grade falls below it",
		namesMinimumGrade,
	);
});
