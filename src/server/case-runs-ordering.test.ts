import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { confirmationGroupPaths } from "#benchmark/run-layout";
import { CASE_ID, nothingRunning } from "#benchmark/run-records-test-support";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import {
	mergeJson,
	recordVersionedPipelineGroup,
	recordVersionedPipelineRun,
} from "#server/case-runs-record-test-fixture";
import {
	clearCaseRunRoot,
	fixture,
	prepareCaseRunRoot,
	root,
} from "#server/case-runs-test-fixture";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import readCaseRuns from "./case-runs";

beforeEach(prepareCaseRunRoot);

afterEach(clearCaseRunRoot);

const OLDER_RUN = "2026-09-02T00-00-00.000Z";

const SESSION_CASE = "smoke";

async function verifyReadCaseRunsPlacesAGroupThatRecordedItsStartTimeAmongTheCaseSRunsByIt(): Promise<void> {
	const runDigest = "a".repeat(SHA256_HEX_DIGITS);
	const groupDigest = "b".repeat(SHA256_HEX_DIGITS);
	const laterRunDigest = "c".repeat(SHA256_HEX_DIGITS);
	const laterRun = "2026-09-02T00-45-00.000Z";
	await recordVersionedPipelineRun(OLDER_RUN, runDigest);
	await recordVersionedPipelineRun(laterRun, laterRunDigest);
	await recordVersionedPipelineGroup(
		"group-p",
		groupDigest,
		"2026-09-02T00:30:00.000Z",
	);

	const { cases } = await readCaseRuns(root, nothingRunning);

	expect(
		cases.get(CASE_ID)?.runs.map(({ corpusDigest }) => corpusDigest),
	).toEqual([laterRunDigest, groupDigest, groupDigest, runDigest]);
}

async function verifyReadCaseRunsPlacesASessionAttemptThatRecordedItsStartTimeBeforeAnOlderGroup(): Promise<void> {
	const attemptDigest = "d".repeat(SHA256_HEX_DIGITS);
	const attemptFile = await fixture.sessions.writeAttemptAt(
		"0f6b6f2a-0000-4000-8000-00000000000a",
		{
			caseId: SESSION_CASE,
			corpusRoot: join(import.meta.dir, "..", ".."),
			corpusVersion: { digest: attemptDigest, kind: "version" },
			layoutPaths: [],
		},
	);
	const attempt = parseSessionAttemptRecord(await Bun.file(attemptFile).text());
	await Bun.write(
		attemptFile,
		JSON.stringify({
			...attempt,
			schemaVersion: 3,
			startedAt: "2026-09-02T00:45:00.000Z",
		}),
	);
	await fixture.confirmations.records.writeSessionGroup("group-s");
	await mergeJson(confirmationGroupPaths(root, "group-s").groupFile, {
		startedAt: "2026-09-02T00:30:00.000Z",
	});

	const { cases } = await readCaseRuns(root, nothingRunning);

	// The group recorded no corpus version, so its two reps read undefined.
	expect(
		cases.get(SESSION_CASE)?.runs.map(({ corpusDigest }) => corpusDigest),
	).toStrictEqual([attemptDigest, undefined, undefined]);
}

describe(readCaseRuns.name, () => {
	it(
		"places a group that recorded its start time among the case's runs by it",
		verifyReadCaseRunsPlacesAGroupThatRecordedItsStartTimeAmongTheCaseSRunsByIt,
	);
	it(
		"places a session attempt that recorded its start time before an older group",
		verifyReadCaseRunsPlacesASessionAttemptThatRecordedItsStartTimeBeforeAnOlderGroup,
	);
});
