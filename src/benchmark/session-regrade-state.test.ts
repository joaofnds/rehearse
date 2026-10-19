import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { regradeAttempt } from "#benchmark/session-regrade";
import { TestResources } from "#benchmark/test-support";

import RegradeCaseBuilder from "./session-regrade-case-test-builder";
import RegradeEvidenceBuilder, {
	evidenceDigests,
	pathsFor,
} from "./session-regrade-evidence-test-fixture";
import RegradeRecordBuilder from "./session-regrade-record-test-builder";

const resources = TestResources.forEachTest();
const regradeAttemptLeavesTheAttemptsOwnEvidenceByteidenticalAcrossTwoPasses =
	async (): Promise<void> => {
		const directory = await new RegradeEvidenceBuilder({
			stateContents: "left-behind\n",
			tools: ["Bash"],
		}).build(resources);
		await Bun.write(join(directory, "attempt.json"), "{}\n");
		const request = {
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			paths: pathsFor(directory),
			record: new RegradeRecordBuilder({
				transcriptDiagnostics: RegradeRecordBuilder.completeBoundary({
					prefixLinesExcluded: 0,
				}),
			}).build(),
			sessionCase: new RegradeCaseBuilder({ stateScorer: "overwrite" }).build(),
		};
		const before = await evidenceDigests(directory);

		await regradeAttempt(request);
		await regradeAttempt(request);

		expect(await evidenceDigests(directory)).toEqual(before);
	};

const regradeAttemptWhenTheCaseDeclaresAStateScorerGradesTheStateTheAttemptPreserved =
	async (): Promise<void> => {
		const directory = await new RegradeEvidenceBuilder({
			stateContents: "left-behind\n",
			tools: ["Bash"],
		}).build(resources);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			paths: pathsFor(directory),
			record: new RegradeRecordBuilder({
				transcriptDiagnostics: RegradeRecordBuilder.completeBoundary({
					prefixLinesExcluded: 0,
				}),
			}).build(),
			sessionCase: new RegradeCaseBuilder({ stateScorer: "preserve" }).build(),
		});

		expect(assessment.stateResults).toEqual([
			{ detail: "left-behind", name: "left-a-file", status: "PASS" },
		]);
	};

const regradeAttemptWhenTheCaseDeclaresAStateScorerReportsTheStateCheckUnavailableWhenTheAttempt =
	async (): Promise<void> => {
		const directory = await new RegradeEvidenceBuilder({
			tools: ["Bash"],
		}).build(resources);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			paths: pathsFor(directory),
			record: new RegradeRecordBuilder({
				transcriptDiagnostics: RegradeRecordBuilder.completeBoundary({
					prefixLinesExcluded: 0,
				}),
			}).build(),
			sessionCase: new RegradeCaseBuilder({ stateScorer: "preserve" }).build(),
		});

		expect(assessment.stateCheck).toEqual({
			detail:
				"the attempt preserved no files or git state, so its state scorer has nothing to grade",
			status: "UNAVAILABLE",
		});
		expect(assessment.stateResults).toBeUndefined();
		expect(assessment.outcome).toBeUndefined();
	};
describe(regradeAttempt.name, () => {
	it(
		"leaves the attempt's own evidence byte-identical across two passes",
		regradeAttemptLeavesTheAttemptsOwnEvidenceByteidenticalAcrossTwoPasses,
	);
	describe("when the case declares a state scorer", () => {
		it(
			"grades the state the attempt preserved",
			regradeAttemptWhenTheCaseDeclaresAStateScorerGradesTheStateTheAttemptPreserved,
		);
	});
	describe("when the case declares a state scorer", () => {
		it(
			"reports the state check unavailable when the attempt preserved none",
			regradeAttemptWhenTheCaseDeclaresAStateScorerReportsTheStateCheckUnavailableWhenTheAttempt,
		);
	});
});
