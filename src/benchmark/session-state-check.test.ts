import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	gradeStateEvidence,
	parseStateScorerOutput,
} from "#benchmark/session-state-check";
import { TestResources } from "#benchmark/test-support";

const resources = TestResources.forEachTest();

async function evidenceDirectory(): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), "rehearse-state-grade-"));
	resources.track(path);
	await Bun.write(join(path, "left-behind.txt"), "by the session\n");

	return path;
}

const declared = ["cards-archived", "tree-clean"] as const;

const parseStateScorerOutputReportsAnAbsentResultNameBeforeAnAbsentStatusOrDetail =
	(): void => {
		const parsed = parseStateScorerOutput('{"results":[{}]}', ["expected"]);

		expect(parsed).toEqual({
			detail:
				"scorer stdout does not match the state result schema: results.0.name: Invalid input: expected string, received undefined",
			kind: "error",
		});
	};

const parseStateScorerOutputPairsEachDeclaredOutcomeWithTheResultTheScorerNamed =
	(): void => {
		const parsed = parseStateScorerOutput(
			`{"results":[{"name":"tree-clean","status":"FAIL","detail":"2 untracked"},{"name":"cards-archived","status":"PASS","detail":"3 archived"}]}`,
			declared,
		);

		expect(parsed).toEqual({
			kind: "results",
			results: [
				{ detail: "3 archived", name: "cards-archived", status: "PASS" },
				{ detail: "2 untracked", name: "tree-clean", status: "FAIL" },
			],
		});
	};

const parseStateScorerOutputReadsStdoutThatIsNotJSONAsAGradingError =
	(): void => {
		expect(parseStateScorerOutput("not json", declared)).toMatchObject({
			kind: "error",
		});
	};

const parseStateScorerOutputReadsAResultTheSchemaRejectsAsAGradingError =
	(): void => {
		expect(
			parseStateScorerOutput(
				`{"results":[{"name":"tree-clean","status":"MAYBE","detail":"x"}]}`,
				declared,
			),
		).toMatchObject({ kind: "error" });
	};

const parseStateScorerOutputReadsADeclaredOutcomeTheScorerOmittedAsAGradingError =
	(): void => {
		const parsed = parseStateScorerOutput(
			`{"results":[{"name":"tree-clean","status":"PASS","detail":"clean"}]}`,
			declared,
		);

		expect(parsed).toMatchObject({ kind: "error" });
		expect(parsed.kind === "error" ? parsed.detail : "").toContain(
			"cards-archived",
		);
	};

const outcomes = ["left-behind"] as const;

const gradeStateEvidenceRecordsTheResultsAScorerReportedOverTheEvidence =
	async (): Promise<void> => {
		const evidence = await evidenceDirectory();
		const restoreDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-state-graderoot-"),
		);
		resources.track(restoreDirectory);

		const graded = await gradeStateEvidence({
			command: [
				"sh",
				"-c",
				'printf \'{"results":[{"name":"left-behind","status":"%s","detail":"%s"}]}\' "$(test -f left-behind.txt && echo PASS || echo FAIL)" "read from the restore"',
			],
			evidenceDirectory: evidence,
			outcomes,
			restoreDirectory,
			scorerSource: undefined,
		});

		expect(graded).toEqual({
			kind: "results",
			results: [
				{
					detail: "read from the restore",
					name: "left-behind",
					status: "PASS",
				},
			],
		});
	};

const gradeStateEvidenceReadsAScorerThatCannotBeRunAtAllAsAGradingError =
	async (): Promise<void> => {
		const evidence = await evidenceDirectory();
		const restoreDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-state-graderoot-"),
		);
		resources.track(restoreDirectory);

		const graded = await gradeStateEvidence({
			command: ["/nonexistent/scorer-binary"],
			evidenceDirectory: evidence,
			outcomes,
			restoreDirectory,
			scorerSource: undefined,
		});

		expect(graded).toMatchObject({ kind: "error" });
		expect(graded.kind === "error" ? graded.detail : "").toContain(
			"/nonexistent/scorer-binary",
		);
	};

const gradeStateEvidenceNamesAScorerThatOutlivedItsDeadlineAsTimedOut =
	async (): Promise<void> => {
		const evidence = await evidenceDirectory();
		const restoreDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-state-graderoot-"),
		);
		resources.track(restoreDirectory);

		const graded = await gradeStateEvidence({
			command: ["sh", "-c", "sleep 5"],
			evidenceDirectory: evidence,
			outcomes,
			restoreDirectory,
			scorerSource: undefined,
			timeoutMs: 200,
		});

		expect(graded).toMatchObject({ kind: "error" });
		expect(graded.kind === "error" ? graded.detail : "").toContain(
			"timed out after 200ms",
		);
	};

const gradeStateEvidenceReadsAScorerThatExitsNonzeroAsAGradingError =
	async (): Promise<void> => {
		const evidence = await evidenceDirectory();
		const restoreDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-state-graderoot-"),
		);
		resources.track(restoreDirectory);

		const graded = await gradeStateEvidence({
			command: ["sh", "-c", "echo broken >&2; exit 3"],
			evidenceDirectory: evidence,
			outcomes,
			restoreDirectory,
			scorerSource: undefined,
		});

		expect(graded).toMatchObject({ kind: "error" });
		expect(graded.kind === "error" ? graded.detail : "").toContain("3");
	};

describe(parseStateScorerOutput.name, () => {
	it(
		"reports an absent result name before an absent status or detail",
		parseStateScorerOutputReportsAnAbsentResultNameBeforeAnAbsentStatusOrDetail,
	);

	it(
		"pairs each declared outcome with the result the scorer named",
		parseStateScorerOutputPairsEachDeclaredOutcomeWithTheResultTheScorerNamed,
	);

	it(
		"reads stdout that is not JSON as a grading error",
		parseStateScorerOutputReadsStdoutThatIsNotJSONAsAGradingError,
	);

	it(
		"reads a result the schema rejects as a grading error",
		parseStateScorerOutputReadsAResultTheSchemaRejectsAsAGradingError,
	);

	it(
		"reads a declared outcome the scorer omitted as a grading error",
		parseStateScorerOutputReadsADeclaredOutcomeTheScorerOmittedAsAGradingError,
	);
});

describe(gradeStateEvidence.name, () => {
	it(
		"records the results a scorer reported over the evidence",
		gradeStateEvidenceRecordsTheResultsAScorerReportedOverTheEvidence,
	);

	it(
		"reads a scorer that cannot be run at all as a grading error",
		gradeStateEvidenceReadsAScorerThatCannotBeRunAtAllAsAGradingError,
	);

	it(
		"names a scorer that outlived its deadline as timed out",
		gradeStateEvidenceNamesAScorerThatOutlivedItsDeadlineAsTimedOut,
	);

	it(
		"reads a scorer that exits non-zero as a grading error",
		gradeStateEvidenceReadsAScorerThatExitsNonzeroAsAGradingError,
	);
});
