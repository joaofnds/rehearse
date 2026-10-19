import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";

import writtenConfirmationAttempt from "#server/session-history-confirmation-test-fixture";
import {
	SessionHistoryReaderError,
	readConfirmationAttemptHistory,
} from "#server/session-history-reader";
import { clearSessionHistoryRoots } from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

const SYMLINKED_GROUP_ENTRIES = [
	[
		"group file",
		(fixture: Awaited<ReturnType<typeof writtenConfirmationAttempt>>) =>
			fixture.paths.groupFile,
	],
	[
		"rep file",
		(fixture: Awaited<ReturnType<typeof writtenConfirmationAttempt>>) =>
			fixture.paths.rep(fixture.repId).recordFile,
	],
	[
		"attempt file",
		(fixture: Awaited<ReturnType<typeof writtenConfirmationAttempt>>) =>
			fixture.paths.rep(fixture.repId).attemptFile,
	],
	[
		"transcript file",
		(fixture: Awaited<ReturnType<typeof writtenConfirmationAttempt>>) =>
			fixture.paths.rep(fixture.repId).transcriptFile,
	],
] as const;

const SYMLINKED_REP_ENTRIES = [
	[
		"group directory",
		(fixture: Awaited<ReturnType<typeof writtenConfirmationAttempt>>) =>
			fixture.paths.directory,
	],
	[
		"rep directory",
		(fixture: Awaited<ReturnType<typeof writtenConfirmationAttempt>>) =>
			fixture.paths.rep(fixture.repId).directory,
	],
] as const;

describe(readConfirmationAttemptHistory.name, () => {
	describe("when the group owns the repetition", () => {
		it(
			"reads an owned confirmation rep and leaves its evidence byte-identical",
			verifyReadsAnOwnedConfirmationRepAndLeavesItsEvidence,
		);
	});

	describe("when a repetition identity traverses directories", () => {
		it("refuses traversal identities", verifyRefusesTraversalIdentities);
	});

	describe("when saved evidence contains a symlink", () => {
		it.each(SYMLINKED_GROUP_ENTRIES)(
			"refuses a symlinked %s",
			verifySymlinkedGroupEntries,
		);

		it.each(SYMLINKED_REP_ENTRIES)(
			"refuses a symlinked %s",
			verifySymlinkedRepEntries,
		);
	});

	describe("when the transcript is not a regular file", () => {
		it("refuses a non-regular transcript", verifyRefusesANonRegularTranscript);
	});
});

async function verifyReadsAnOwnedConfirmationRepAndLeavesItsEvidence(): Promise<void> {
	const fixture = await writtenConfirmationAttempt();
	const repPaths = fixture.paths.rep(fixture.repId);
	const before = await Promise.all(
		[
			fixture.paths.groupFile,
			repPaths.recordFile,
			repPaths.attemptFile,
			repPaths.transcriptFile,
		].map(async (path) => await Bun.file(path).text()),
	);

	const report = await readConfirmationAttemptHistory(fixture);

	expect(report.attempt).toMatchObject({
		id: fixture.repId,
		kind: "session",
	});
	expect(
		await Promise.all(
			[
				fixture.paths.groupFile,
				repPaths.recordFile,
				repPaths.attemptFile,
				repPaths.transcriptFile,
			].map(async (path) => await Bun.file(path).text()),
		),
	).toEqual(before);
}

async function verifyRefusesTraversalIdentities(): Promise<void> {
	const fixture = await writtenConfirmationAttempt();

	expect(
		readConfirmationAttemptHistory({ ...fixture, repId: "../rep" }),
	).rejects.toBeInstanceOf(SessionHistoryReaderError);
}

async function verifyRefusesANonRegularTranscript(): Promise<void> {
	const fixture = await writtenConfirmationAttempt();
	const transcript = fixture.paths.rep(fixture.repId).transcriptFile;
	await rm(transcript);
	await mkdir(transcript);

	expect(readConfirmationAttemptHistory(fixture)).rejects.toBeInstanceOf(
		SessionHistoryReaderError,
	);
}

async function verifySymlinkedGroupEntries(
	_name: string,
	selectedPath: ConfirmationPath,
): Promise<void> {
	const fixture = await writtenConfirmationAttempt();
	const path = selectedPath(fixture);
	const outside = join(fixture.runsDirectory, "outside-file");
	await Bun.write(outside, "outside");
	await rm(path);
	await symlink(outside, path);

	expect(readConfirmationAttemptHistory(fixture)).rejects.toBeInstanceOf(
		SessionHistoryReaderError,
	);
}

async function verifySymlinkedRepEntries(
	_name: string,
	selectedPath: ConfirmationPath,
): Promise<void> {
	const fixture = await writtenConfirmationAttempt();
	const path = selectedPath(fixture);
	const outside = join(fixture.runsDirectory, "outside-directory");
	await mkdir(outside);
	await rm(path, { recursive: true });
	await symlink(outside, path);

	expect(readConfirmationAttemptHistory(fixture)).rejects.toBeInstanceOf(
		SessionHistoryReaderError,
	);
}

type ConfirmationPath = (
	fixture: Awaited<ReturnType<typeof writtenConfirmationAttempt>>,
) => string;
