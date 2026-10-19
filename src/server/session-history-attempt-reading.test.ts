import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";

import { sessionAttemptPaths } from "#benchmark/run-layout";
import { writtenAttempt } from "#server/session-history-attempt-test-fixture";
import {
	SessionHistoryReaderError,
	readSessionAttemptHistory,
} from "#server/session-history-reader";
import { clearSessionHistoryRoots } from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

describe(readSessionAttemptHistory.name, () => {
	describe("when the sibling transcript is saved", () => {
		it(
			"reads the verified sibling transcript",
			verifyReadsTheVerifiedSiblingTranscript,
		);
	});

	describe("when the attempt identity traverses directories", () => {
		it(
			"refuses traversal identities before reading the filesystem",
			verifyRefusesTraversalIdentitiesBeforeReadingTheFilesystem,
		);
	});

	describe("when saved evidence contains a symlink", () => {
		it(
			"refuses a transcript symlink even when its target is a regular file",
			verifyRefusesATranscriptSymlinkEvenWhenItsTargetIs,
		);

		it(
			"refuses a symlink in the saved-attempt directory chain",
			verifyRefusesASymlinkInTheSavedAttemptDirectoryChain,
		);
	});

	describe("when the transcript is missing", () => {
		it(
			"keeps a persisted boundary known when the transcript is missing",
			verifyKeepsAPersistedBoundaryKnownWhenTheTranscriptIs,
		);
	});
});

async function verifyReadsTheVerifiedSiblingTranscript(): Promise<void> {
	const fixture = await writtenAttempt();

	const report = await readSessionAttemptHistory(fixture);

	expect(report.attempt).toMatchObject({
		caseId: fixture.caseId,
		id: fixture.uuid,
		kind: "session",
		model: "sonnet",
		outcome: "SUCCESSFUL",
	});
	expect(report.attemptEvents.map(({ id, state }) => ({ id, state }))).toEqual([
		{ id: "1:1", state: "invoked" },
		{ id: "2:1", state: "delivered" },
	]);
}

async function verifyRefusesTraversalIdentitiesBeforeReadingTheFilesystem(): Promise<void> {
	const fixture = await writtenAttempt();

	expect(
		readSessionAttemptHistory({ ...fixture, uuid: "../attempt-a" }),
	).rejects.toBeInstanceOf(SessionHistoryReaderError);
}

async function verifyRefusesATranscriptSymlinkEvenWhenItsTargetIs(): Promise<void> {
	const fixture = await writtenAttempt();
	const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
	const outside = join(fixture.runsDirectory, "outside.jsonl");
	await Bun.write(outside, "secret");
	await rm(paths.transcriptFile);
	await symlink(outside, paths.transcriptFile);

	expect(readSessionAttemptHistory(fixture)).rejects.toBeInstanceOf(
		SessionHistoryReaderError,
	);
}

async function verifyRefusesASymlinkInTheSavedAttemptDirectoryChain(): Promise<void> {
	const fixture = await writtenAttempt();
	const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
	const outside = join(fixture.runsDirectory, "outside-attempt");
	await mkdir(outside);
	await Bun.write(join(outside, "attempt.json"), "{}");
	await rm(paths.directory, { recursive: true });
	await symlink(outside, paths.directory);

	expect(readSessionAttemptHistory(fixture)).rejects.toBeInstanceOf(
		SessionHistoryReaderError,
	);
}

async function verifyKeepsAPersistedBoundaryKnownWhenTheTranscriptIs(): Promise<void> {
	const fixture = await writtenAttempt();
	const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
	await rm(paths.transcriptFile);

	const report = await readSessionAttemptHistory(fixture);

	expect(report.boundary).toBe("known");
	expect(report.evidence).toEqual({
		reasons: ["transcript unavailable"],
		state: "unavailable",
	});
}
