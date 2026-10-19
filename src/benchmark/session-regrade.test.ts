import { describe, expect, it } from "bun:test";

import {
	gradingDefinitionDigest,
	regradeAttempt,
} from "#benchmark/session-regrade";
import { TestResources } from "#benchmark/test-support";

import RegradeCaseBuilder from "./session-regrade-case-test-builder";
import RegradeEvidenceBuilder, {
	pathsFor,
	sha256Of,
	toolUseLine,
} from "./session-regrade-evidence-test-fixture";
import RegradeRecordBuilder from "./session-regrade-record-test-builder";

const resources = TestResources.forEachTest();
const regradeAttemptNamesTheAttemptItReadAndTheDefinitionThatGradedIt =
	async (): Promise<void> => {
		const directory = await new RegradeEvidenceBuilder({
			tools: ["Bash"],
		}).build(resources);
		const sessionCase = new RegradeCaseBuilder({
			checks: [{ kind: "word-band", max: 2 }],
		}).build();

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			paths: pathsFor(directory),
			record: new RegradeRecordBuilder({
				transcriptDiagnostics: RegradeRecordBuilder.completeBoundary({
					prefixLinesExcluded: 0,
				}),
			}).build(),
			sessionCase,
		});

		expect(assessment.sourceAttempt).toEqual({
			caseId: "smoke",
			uuid: "attempt-uuid",
		});
		expect(assessment.gradingDefinition).toBe(
			gradingDefinitionDigest(sessionCase),
		);
	};

const regradeAttemptDigestsEachEvidenceBodyItRead = async (): Promise<void> => {
	const directory = await new RegradeEvidenceBuilder({ tools: ["Bash"] }).build(
		resources,
	);

	const assessment = await regradeAttempt({
		attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
		paths: pathsFor(directory),
		record: new RegradeRecordBuilder({
			reply: "the reply",
			transcriptDiagnostics: RegradeRecordBuilder.completeBoundary({
				prefixLinesExcluded: 0,
			}),
		}).build(),
		sessionCase: new RegradeCaseBuilder({
			checks: [{ kind: "word-band", max: 2 }],
		}).build(),
	});

	expect(assessment.evidence).toEqual({
		reply: sha256Of("the reply"),
		transcript: sha256Of(`${toolUseLine("Bash")}\n`),
	});
};

const regradeAttemptReportsAVerdictWhenEveryDeclaredCheckWasGraded =
	async (): Promise<void> => {
		const directory = await new RegradeEvidenceBuilder({
			tools: ["Bash"],
		}).build(resources);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			paths: pathsFor(directory),
			record: new RegradeRecordBuilder({
				reply: "one",
				transcriptDiagnostics: RegradeRecordBuilder.completeBoundary({
					prefixLinesExcluded: 0,
				}),
			}).build(),
			sessionCase: new RegradeCaseBuilder({
				checks: [{ kind: "word-band", max: 2 }],
			}).build(),
		});

		expect(assessment.outcome).toBe("SUCCESSFUL");
	};

const regradeAttemptWithholdsAVerdictWhenADeclaredCheckCouldNotBeGraded =
	async (): Promise<void> => {
		const directory = await new RegradeEvidenceBuilder().build(resources);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			paths: pathsFor(directory),
			record: new RegradeRecordBuilder({ reply: "one" }).build(),
			sessionCase: new RegradeCaseBuilder({
				checks: [
					{ kind: "word-band", max: 2 },
					{ kind: "tool-calls", max: 0 },
				],
			}).build(),
		});

		expect(assessment.outcome).toBeUndefined();
	};

const regradeAttemptGradesAReplyCheckAgainstTheSavedReply =
	async (): Promise<void> => {
		const directory = await new RegradeEvidenceBuilder().build(resources);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			paths: pathsFor(directory),
			record: new RegradeRecordBuilder({ reply: "one two three" }).build(),
			sessionCase: new RegradeCaseBuilder({
				checks: [{ kind: "word-band", max: 2 }],
			}).build(),
		});

		expect(assessment.checks).toEqual([
			{
				detail: "3 words outside at most 2",
				kind: "word-band",
				status: "FAIL",
			},
		]);
	};

const regradeAttemptWhenTheRecordSavedNoReplyReportsAReplyCheckUnavailableRatherThanGradingAn =
	async (): Promise<void> => {
		const directory = await new RegradeEvidenceBuilder({
			tools: ["Bash"],
		}).build(resources);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			paths: pathsFor(directory),
			record: new RegradeRecordBuilder({
				checks: [],
				outcome: "NO_REPLY",
				reply: undefined,
				transcriptDiagnostics: RegradeRecordBuilder.completeBoundary({
					prefixLinesExcluded: 0,
				}),
			}).build(),
			sessionCase: new RegradeCaseBuilder({
				checks: [
					{ kind: "word-band", max: 2 },
					{
						kind: "forbidden-pattern",
						patterns: [{ name: "offer", regex: "want me" }],
					},
				],
			}).build(),
		});

		expect(assessment.checks).toEqual([
			{
				detail:
					"the attempt saved no reply, so nothing the session said can be read",
				kind: "word-band",
				status: "UNAVAILABLE",
			},
			{
				detail:
					"the attempt saved no reply, so nothing the session said can be read",
				kind: "forbidden-pattern",
				status: "UNAVAILABLE",
			},
		]);
		expect(assessment.outcome).toBeUndefined();
	};
describe(regradeAttempt.name, () => {
	it(
		"names the attempt it read and the definition that graded it",
		regradeAttemptNamesTheAttemptItReadAndTheDefinitionThatGradedIt,
	);
	it(
		"digests each evidence body it read",
		regradeAttemptDigestsEachEvidenceBodyItRead,
	);
	it(
		"reports a verdict when every declared check was graded",
		regradeAttemptReportsAVerdictWhenEveryDeclaredCheckWasGraded,
	);
	it(
		"withholds a verdict when a declared check could not be graded",
		regradeAttemptWithholdsAVerdictWhenADeclaredCheckCouldNotBeGraded,
	);
	it(
		"grades a reply check against the saved reply",
		regradeAttemptGradesAReplyCheckAgainstTheSavedReply,
	);
	describe("when the record saved no reply", () => {
		it(
			"reports a reply check unavailable rather than grading an empty reply",
			regradeAttemptWhenTheRecordSavedNoReplyReportsAReplyCheckUnavailableRatherThanGradingAn,
		);
	});
});
