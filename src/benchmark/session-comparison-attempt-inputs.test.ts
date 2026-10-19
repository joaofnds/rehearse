import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { writeManifest } from "./session-comparison-group-test-fixture";
import { firstRecordedSessionRep } from "./session-comparison-record-reader-fixture";
import { sessionGroupFile } from "./session-comparison-record-test-fixture";
import { JSON_INDENTATION_SPACES } from "./session-comparison-test-contract";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";
import { parseSessionAttemptRecord } from "./session-record";

const ELAPSED_TIME_MISMATCH_MS = 1;

const root = comparisonSuiteRoot();

async function testRefusesACheckResultWhoseKindDisagreesWithTheFrozenCase(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });
	const candidateGroupFile = sessionGroupFile({
		caseId: "case-one",
		role: "candidate",
		runsDirectory,
	});
	const { attemptPath } = await firstRecordedSessionRep(candidateGroupFile);
	const attempt = parseSessionAttemptRecord(await Bun.file(attemptPath).text());
	const [check] = attempt.checks;
	if (check === undefined) {
		throw new Error("expected a checked attempt");
	}

	await Bun.write(
		attemptPath,
		`${JSON.stringify(
			{
				...attempt,
				checks: [{ ...check, kind: "forbidden-text" }],
			},
			null,
			JSON_INDENTATION_SPACES,
		)}\n`,
	);

	expect(
		writeComparisonReport({ manifestPath, runsDirectory }),
	).rejects.toThrow(
		"case case-one arm candidate field repRecords[0].checks[0].kind",
	);
}

async function testRefusesAnAttemptWhoseElapsedTimeDisagreesWithItsRep(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });
	const candidateGroupFile = sessionGroupFile({
		caseId: "case-one",
		role: "candidate",
		runsDirectory,
	});
	const { attemptPath } = await firstRecordedSessionRep(candidateGroupFile);
	const attempt = parseSessionAttemptRecord(await Bun.file(attemptPath).text());

	await Bun.write(
		attemptPath,
		`${JSON.stringify({ ...attempt, elapsedMs: attempt.elapsedMs + ELAPSED_TIME_MISMATCH_MS }, null, JSON_INDENTATION_SPACES)}\n`,
	);

	expect(
		writeComparisonReport({ manifestPath, runsDirectory }),
	).rejects.toThrow(
		"case case-one arm candidate field repRecords[0].elapsedMs",
	);
}

async function testRefusesASessionRepThatNamesAnotherAttemptPath(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });
	const candidateGroupFile = sessionGroupFile({
		caseId: "case-one",
		role: "candidate",
		runsDirectory,
	});
	const { repPath, rep, stage } =
		await firstRecordedSessionRep(candidateGroupFile);

	await Bun.write(
		repPath,
		`${JSON.stringify(
			{
				...rep,
				stages: [
					{
						...stage,
						evidence: { recordFile: "/dev/zero" },
					},
				],
			},
			null,
			JSON_INDENTATION_SPACES,
		)}\n`,
	);

	expect(
		writeComparisonReport({ manifestPath, runsDirectory }),
	).rejects.toThrow(
		"case case-one arm candidate field repRecords[0].attempt.path",
	);
}

describe("session comparison attempt inputs", () => {
	it(
		"refuses a check result whose kind disagrees with the frozen case",
		testRefusesACheckResultWhoseKindDisagreesWithTheFrozenCase,
	);

	it(
		"refuses an attempt whose elapsed time disagrees with its rep",
		testRefusesAnAttemptWhoseElapsedTimeDisagreesWithItsRep,
	);

	it(
		"refuses a session rep that names another attempt path",
		testRefusesASessionRepThatNamesAnotherAttemptPath,
	);
});
