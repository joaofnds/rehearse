import { describe, expect, it } from "bun:test";

import { regradeAttempt } from "#benchmark/session-regrade";
import { TestResources } from "#benchmark/test-support";

import RegradeCaseBuilder from "./session-regrade-case-test-builder";
import RegradeEvidenceBuilder, {
	pathsFor,
} from "./session-regrade-evidence-test-fixture";
import RegradeRecordBuilder from "./session-regrade-record-test-builder";

const resources = TestResources.forEachTest();
const regradeAttemptReadsTheTranscriptBesideTheAttemptNotThePathTheRecordRecorded =
	async (): Promise<void> => {
		const directory = await new RegradeEvidenceBuilder({
			tools: ["Read"],
		}).build(resources);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			paths: pathsFor(directory),
			record: new RegradeRecordBuilder({
				transcriptDiagnostics: RegradeRecordBuilder.completeBoundary({
					prefixLinesExcluded: 0,
				}),
				transcriptFile: "/gone/on/another/machine/transcript.jsonl",
			}).build(),
			sessionCase: new RegradeCaseBuilder({
				checks: [{ kind: "tool-calls", names: ["Bash"] }],
			}).build(),
		});

		expect(assessment.checks).toEqual([
			{
				detail: "undeclared tool called: Read",
				kind: "tool-calls",
				status: "FAIL",
			},
		]);
	};

const regradeAttemptIgnoresAForbiddenToolTheAttemptsTranscriptPrefixCarries =
	async (): Promise<void> => {
		const directory = await new RegradeEvidenceBuilder({
			tools: ["Read", "Bash"],
		}).build(resources);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			paths: pathsFor(directory),
			record: new RegradeRecordBuilder({
				transcriptDiagnostics: RegradeRecordBuilder.completeBoundary({
					prefixLinesExcluded: 1,
				}),
			}).build(),
			sessionCase: new RegradeCaseBuilder({
				checks: [{ kind: "tool-calls", names: ["Bash"] }],
			}).build(),
		});

		expect(assessment.checks).toEqual([
			{ detail: "1 tool calls", kind: "tool-calls", status: "PASS" },
		]);
	};

const regradeAttemptCountsAForbiddenToolCalledAfterTheBoundary =
	async (): Promise<void> => {
		const directory = await new RegradeEvidenceBuilder({
			tools: ["Bash", "Read"],
		}).build(resources);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			paths: pathsFor(directory),
			record: new RegradeRecordBuilder({
				transcriptDiagnostics: RegradeRecordBuilder.completeBoundary({
					prefixLinesExcluded: 1,
				}),
			}).build(),
			sessionCase: new RegradeCaseBuilder({
				checks: [{ kind: "tool-calls", names: ["Bash"] }],
			}).build(),
		});

		expect(assessment.checks).toEqual([
			{
				detail: "undeclared tool called: Read",
				kind: "tool-calls",
				status: "FAIL",
			},
		]);
	};

const regradeAttemptWhenTheAttemptHoldsNoTranscriptFileReportsATranscriptCheckUnavailableRatherThanCounting =
	async (): Promise<void> => {
		const directory = await new RegradeEvidenceBuilder().build(resources);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			paths: pathsFor(directory),
			record: new RegradeRecordBuilder({
				transcriptDiagnostics: RegradeRecordBuilder.completeBoundary({
					prefixLinesExcluded: 0,
				}),
			}).build(),
			sessionCase: new RegradeCaseBuilder({
				checks: [{ kind: "tool-calls", max: 0 }],
			}).build(),
		});

		expect(assessment.checks).toEqual([
			{
				detail:
					"the attempt recorded no readable transcript boundary, so its tool uses cannot be counted",
				kind: "tool-calls",
				status: "UNAVAILABLE",
			},
		]);
		expect(assessment.outcome).toBeUndefined();
	};

const regradeAttemptWhenTheRecordCarriesNoTranscriptDiagnosticsReportsATranscriptCheckUnavailableAndStillGrades =
	async (): Promise<void> => {
		const directory = await new RegradeEvidenceBuilder({
			tools: ["Read"],
		}).build(resources);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			paths: pathsFor(directory),
			record: new RegradeRecordBuilder({
				reply: "one two three",
				transcriptDiagnostics: undefined,
			}).build(),
			sessionCase: new RegradeCaseBuilder({
				checks: [
					{ kind: "tool-calls", names: ["Bash"] },
					{ kind: "word-band", max: 2 },
				],
			}).build(),
		});

		expect(assessment.checks).toEqual([
			{
				detail:
					"the attempt recorded no readable transcript boundary, so its tool uses cannot be counted",
				kind: "tool-calls",
				status: "UNAVAILABLE",
			},
			{
				detail: "3 words outside at most 2",
				kind: "word-band",
				status: "FAIL",
			},
		]);
	};

const regradeAttemptWhenTheRecordsTranscriptIsUnavailableReportsATranscriptCheckUnavailableRatherThanGradingAn =
	async (): Promise<void> => {
		const directory = await new RegradeEvidenceBuilder().build(resources);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			paths: pathsFor(directory),
			record: new RegradeRecordBuilder().build(),
			sessionCase: new RegradeCaseBuilder({
				checks: [{ kind: "tool-calls", max: 0 }],
			}).build(),
		});

		expect(assessment.checks).toEqual([
			{
				detail:
					"the attempt recorded no readable transcript boundary, so its tool uses cannot be counted",
				kind: "tool-calls",
				status: "UNAVAILABLE",
			},
		]);
	};
describe(regradeAttempt.name, () => {
	it(
		"reads the transcript beside the attempt, not the path the record recorded",
		regradeAttemptReadsTheTranscriptBesideTheAttemptNotThePathTheRecordRecorded,
	);
	it(
		"ignores a forbidden tool the attempt's transcript prefix carries",
		regradeAttemptIgnoresAForbiddenToolTheAttemptsTranscriptPrefixCarries,
	);
	it(
		"counts a forbidden tool called after the boundary",
		regradeAttemptCountsAForbiddenToolCalledAfterTheBoundary,
	);
	describe("when the attempt holds no transcript file", () => {
		it(
			"reports a transcript check unavailable rather than counting an absent file",
			regradeAttemptWhenTheAttemptHoldsNoTranscriptFileReportsATranscriptCheckUnavailableRatherThanCounting,
		);
	});
	describe("when the record carries no transcript diagnostics", () => {
		it(
			"reports a transcript check unavailable and still grades the reply",
			regradeAttemptWhenTheRecordCarriesNoTranscriptDiagnosticsReportsATranscriptCheckUnavailableAndStillGrades,
		);
	});
	describe("when the record's transcript is unavailable", () => {
		it(
			"reports a transcript check unavailable rather than grading an absent transcript",
			regradeAttemptWhenTheRecordsTranscriptIsUnavailableReportsATranscriptCheckUnavailableRatherThanGradingAn,
		);
	});
});
