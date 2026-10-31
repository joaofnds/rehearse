import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { sessionPathsExpected } from "./record-layout-path-fixtures";
import RecordLayoutFixtures from "./record-layout-test-fixtures";
import {
	benchmarkRunsDirectory,
	sessionAttemptIds,
	sessionAttemptPaths,
} from "./run-layout";

const fixtures = RecordLayoutFixtures.forEachTest();

function assignsOneDurablePathToASessionAttemptSRecordAndCorpus(): void {
	const paths = sessionAttemptPaths(benchmarkRunsDirectory("/control"), {
		caseId: "smoke",
		uuid: "uuid-1",
	});

	expect(paths).toEqual({
		...sessionPathsExpected,
		gradeFile: paths.gradeFile,
	});
	expect(Object.keys(paths).toSorted()).toEqual([
		"corpusDirectory",
		"directory",
		"gradeFile",
		"gradesDirectory",
		"operatorStopFile",
		"recordFile",
		"transcriptFile",
	]);
}

function filesEachRegradeUnderATimestampInsideTheAttemptItRead(): void {
	const paths = sessionAttemptPaths(benchmarkRunsDirectory("/control"), {
		caseId: "smoke",
		uuid: "uuid-1",
	});

	expect(paths.gradeFile("2026-09-20T12:00:00.000Z")).toBe(
		join(paths.gradesDirectory, "2026-09-20T12-00-00.000Z.json"),
	);
}

async function namesEverySessionAttemptByItsCaseAndItsUuid(): Promise<void> {
	const root = await fixtures.root();
	await mkdir(join(root, "sessions", "smoke", "uuid-2"), { recursive: true });
	await mkdir(join(root, "sessions", "smoke", "uuid-1"), { recursive: true });
	await mkdir(join(root, "sessions", "audit-log", "uuid-3"), {
		recursive: true,
	});

	expect(await sessionAttemptIds(root)).toEqual([
		{ caseId: "audit-log", uuid: "uuid-3" },
		{ caseId: "smoke", uuid: "uuid-1" },
		{ caseId: "smoke", uuid: "uuid-2" },
	]);
}

describe(sessionAttemptPaths.name, () => {
	it(
		"assigns one durable path to a session attempt's record and corpus",
		assignsOneDurablePathToASessionAttemptSRecordAndCorpus,
	);
	it(
		"files each regrade under a timestamp inside the attempt it read",
		filesEachRegradeUnderATimestampInsideTheAttemptItRead,
	);
});
describe("recorded record enumeration", () => {
	it(
		"names every session attempt by its case and its uuid",
		namesEverySessionAttemptByItsCaseAndItsUuid,
	);
});
