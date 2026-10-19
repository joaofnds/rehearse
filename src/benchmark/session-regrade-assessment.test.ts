import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";

import { sessionAttemptPaths } from "#benchmark/run-layout";
import { checkSchema } from "#benchmark/session-check";
import {
	gradingDefinitionDigest,
	parseAssessment,
	writeAssessment,
} from "#benchmark/session-regrade";
import { TestResources } from "#benchmark/test-support";

import RegradeAssessmentBuilder from "./session-regrade-assessment-test-builder";
import RegradeCaseBuilder from "./session-regrade-case-test-builder";
import RegradeEvidenceBuilder from "./session-regrade-evidence-test-fixture";

const resources = TestResources.forEachTest();
const gradingDefinitionDigestDiffersWhenTheCaseDeclaresADifferentCheck =
	(): void => {
		const one = gradingDefinitionDigest(
			new RegradeCaseBuilder({
				checks: [{ kind: "word-band", max: 2 }],
			}).build(),
		);
		const other = gradingDefinitionDigest(
			new RegradeCaseBuilder({
				checks: [{ kind: "word-band", max: 3 }],
			}).build(),
		);

		expect(one).not.toEqual(other);
	};

const gradingDefinitionDigestDiffersWhenTheCaseDeclaresADifferentStateScorer =
	(): void => {
		const one = gradingDefinitionDigest({
			...new RegradeCaseBuilder({ checks: [] }).build(),
			stateCheck: { command: ["./score"], outcomes: ["clean"] },
		});
		const other = gradingDefinitionDigest({
			...new RegradeCaseBuilder({ checks: [] }).build(),
			stateCheck: { command: ["./score", "--strict"], outcomes: ["clean"] },
		});

		expect(one).not.toEqual(other);
	};

const gradingDefinitionDigestIsUnchangedByTheKeyOrderACheckWasWrittenIn =
	(): void => {
		const one = new RegradeCaseBuilder({
			checks: [{ kind: "word-band", max: 2, min: 1 }],
		}).build();
		const other = new RegradeCaseBuilder({
			checks: [
				checkSchema.parse(JSON.parse('{"min":1,"max":2,"kind":"word-band"}')),
			],
		}).build();

		expect(gradingDefinitionDigest(one)).toEqual(
			gradingDefinitionDigest(other),
		);
	};

const gradingDefinitionDigestIsUnchangedByAPromptTheGradingDefinitionDoesNotCover =
	(): void => {
		const checks = new RegradeCaseBuilder({
			checks: [{ kind: "word-band", max: 2 }],
		}).build();

		expect(gradingDefinitionDigest({ ...checks, prompt: "another" })).toEqual(
			gradingDefinitionDigest(checks),
		);
	};

const writeAssessmentFilesTheAssessmentUnderThePasssTimestampInsideTheAttempt =
	async (): Promise<void> => {
		const runsDirectory = await new RegradeEvidenceBuilder().build(resources);
		const paths = sessionAttemptPaths(runsDirectory, {
			caseId: "smoke",
			uuid: "uuid-1",
		});

		const written = await writeAssessment(
			paths,
			"2026-09-20T12:00:00.000Z",
			new RegradeAssessmentBuilder({
				detail: "3 words",
				status: "PASS",
			}).build(),
		);

		expect(written).toBe(paths.gradeFile("2026-09-20T12:00:00.000Z"));
		expect(parseAssessment(await Bun.file(written).text())).toEqual(
			new RegradeAssessmentBuilder({
				detail: "3 words",
				status: "PASS",
			}).build(),
		);
	};

const writeAssessmentKeepsAnEarlierPasssAssessmentBesideALaterOne =
	async (): Promise<void> => {
		const runsDirectory = await new RegradeEvidenceBuilder().build(resources);
		const paths = sessionAttemptPaths(runsDirectory, {
			caseId: "smoke",
			uuid: "uuid-1",
		});

		await writeAssessment(
			paths,
			"2026-09-20T12:00:00.000Z",
			new RegradeAssessmentBuilder({
				detail: "3 words",
				status: "PASS",
			}).build(),
		);
		await writeAssessment(
			paths,
			"2026-09-20T13:00:00.000Z",
			new RegradeAssessmentBuilder({
				detail: "9 words",
				status: "FAIL",
			}).build(),
		);

		const filed = await readdir(paths.gradesDirectory);

		expect(filed.toSorted((one, other) => one.localeCompare(other))).toEqual([
			"2026-09-20T12-00-00.000Z.json",
			"2026-09-20T13-00-00.000Z.json",
		]);
	};
describe(gradingDefinitionDigest.name, () => {
	it(
		"differs when the case declares a different check",
		gradingDefinitionDigestDiffersWhenTheCaseDeclaresADifferentCheck,
	);
	it(
		"differs when the case declares a different state scorer",
		gradingDefinitionDigestDiffersWhenTheCaseDeclaresADifferentStateScorer,
	);
	it(
		"is unchanged by the key order a check was written in",
		gradingDefinitionDigestIsUnchangedByTheKeyOrderACheckWasWrittenIn,
	);
	it(
		"is unchanged by a prompt the grading definition does not cover",
		gradingDefinitionDigestIsUnchangedByAPromptTheGradingDefinitionDoesNotCover,
	);
});
describe(writeAssessment.name, () => {
	it(
		"files the assessment under the pass's timestamp inside the attempt",
		writeAssessmentFilesTheAssessmentUnderThePasssTimestampInsideTheAttempt,
	);
	it(
		"keeps an earlier pass's assessment beside a later one",
		writeAssessmentKeepsAnEarlierPasssAssessmentBesideALaterOne,
	);
});
