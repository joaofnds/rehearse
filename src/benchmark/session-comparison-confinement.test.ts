import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { RefusedPreconditionError } from "./exit-codes";
import { comparisonReportPaths } from "./run-layout";
import { writeManifest } from "./session-comparison-group-test-fixture";
import {
	firstRecordedCorpus,
	firstRecordedSessionRep,
} from "./session-comparison-record-reader-fixture";
import {
	digest,
	sessionGroupFile,
} from "./session-comparison-record-test-fixture";
import { JSON_INDENTATION_SPACES } from "./session-comparison-test-contract";
import {
	comparisonSuiteRoot,
	plantOverlappingReport,
} from "./session-comparison-workspace-fixture";

const root = comparisonSuiteRoot();

async function testRefusesASessionFrozenInputOutsideItsKindDirectory(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });
	const candidateGroupFile = sessionGroupFile({
		caseId: "case-one",
		role: "candidate",
		runsDirectory,
	});
	const { group, corpusFile } = await firstRecordedCorpus(candidateGroupFile);

	await Bun.write(
		candidateGroupFile,
		`${JSON.stringify(
			{
				...group,
				inputs: {
					...group.inputs,
					files: group.inputs.files.map((file) =>
						file === corpusFile
							? {
									kind: "fixture" as const,
									path: "inputs/corpus/missing-fixture.md",
									sha256: file.sha256,
								}
							: file,
					),
				},
			},
			null,
			JSON_INDENTATION_SPACES,
		)}\n`,
	);

	const comparison = writeComparisonReport({ manifestPath, runsDirectory });

	expect(comparison).rejects.toThrow(
		"case case-one arm candidate field inputs.files[fixture:inputs/corpus/missing-fixture.md]: session fixture input must be under inputs/fixture/",
	);
	await Promise.allSettled([comparison]);

	const manifestSha = digest(await Bun.file(manifestPath).text());

	expect(
		await Bun.file(
			comparisonReportPaths(runsDirectory, manifestSha).reportFile,
		).exists(),
	).toBe(false);
}

async function testRefusesMalformedSessionAttemptEvidenceWithoutWritingAReport(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });
	const candidateGroupFile = sessionGroupFile({
		caseId: "case-one",
		role: "candidate",
		runsDirectory,
	});
	const { attemptPath } = await firstRecordedSessionRep(candidateGroupFile);

	await Bun.write(attemptPath, "{\n");

	const comparison = writeComparisonReport({ manifestPath, runsDirectory });

	expect(comparison).rejects.toThrow(
		"case case-one arm candidate field repRecords[0].attempt.record",
	);
	await Promise.allSettled([comparison]);

	const manifestSha = digest(await Bun.file(manifestPath).text());

	expect(
		await Bun.file(
			comparisonReportPaths(runsDirectory, manifestSha).reportFile,
		).exists(),
	).toBe(false);
}

async function testDoesNotReplaceASessionAttemptWhenTheReportDestinationOverlapsIt(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });
	const { attemptPath, attemptText, reportPath } = await plantOverlappingReport(
		{
			groupFile: sessionGroupFile({
				caseId: "case-one",
				role: "candidate",
				runsDirectory,
			}),
			manifestPath,
			runsDirectory,
		},
	);

	expect(
		writeComparisonReport({ manifestPath, runsDirectory }),
	).rejects.toBeInstanceOf(RefusedPreconditionError);
	expect(await Bun.file(attemptPath).text()).toBe(attemptText);
	expect(await Bun.file(reportPath).text()).toBe(attemptText);
}

describe("session comparison confinement", () => {
	it(
		"refuses a session frozen input outside its kind directory",
		testRefusesASessionFrozenInputOutsideItsKindDirectory,
	);

	it(
		"refuses malformed session attempt evidence without writing a report",
		testRefusesMalformedSessionAttemptEvidenceWithoutWritingAReport,
	);

	it(
		"does not replace a session attempt when the report destination overlaps it",
		testDoesNotReplaceASessionAttemptWhenTheReportDestinationOverlapsIt,
	);
});
