import { afterEach, describe, expect, it } from "bun:test";

import {
	clearAttemptEvidenceRoots,
	fixture,
} from "#server/attempt-evidence-test-fixture";

import { readAttemptEvidence, readGroupAttemptIndex } from "./attempt-evidence";

afterEach(clearAttemptEvidenceRoots);

async function verifyReadsGroupIdentitiesWhenTheRecordsDirectoryIsNamedConfirmations(): Promise<void> {
	const saved = await fixture("confirmations");

	const index = await readGroupAttemptIndex({
		groupId: saved.groupId,
		runsDirectory: saved.runsDirectory,
	});

	expect(index.groupId).toBe(saved.groupId);
}

async function verifyProjectsTheGroupSSavedRepetitionIdentitiesForNavigation(): Promise<void> {
	const saved = await fixture();

	const index = await readGroupAttemptIndex({
		groupId: saved.groupId,
		runsDirectory: saved.runsDirectory,
	});

	expect(index.groupId).toBe(saved.groupId);
	expect(index.caseId).toBe("audit-log");
	expect(index.repRecords).toEqual([
		{ ordinal: 1, repId: "group-1-rep-1" },
		{ ordinal: 2, repId: "group-1-rep-2" },
	]);
}

async function verifyDoesNotStripAGroupIdentityMatchingTheRecordsDirectoryName(): Promise<void> {
	const saved = await fixture("group-1");

	const result = await readGroupAttemptIndex({
		groupId: saved.groupId,
		runsDirectory: saved.runsDirectory,
	});

	expect(result.groupId).toBe("group-1");
}

async function verifyReadsOwnedRepetitionEvidenceWhenTheRecordsDirectoryIsNamedConfirmations(): Promise<void> {
	const saved = await fixture("confirmations");
	const groupId = "named-root-session";
	const [repId] = await saved.confirmations.records.writeSessionGroup(groupId);

	const result = await readAttemptEvidence({
		id: `rep:session:${groupId}/${repId}`,
		runsDirectory: saved.runsDirectory,
	});

	expect(result).toMatchObject({ kind: "session", state: "available" });
}

async function verifyDoesNotStripARepetitionIdentityMatchingTheRecordsDirectoryName(): Promise<void> {
	const saved = await fixture("session-root-rep-1");
	const groupId = "session-root";
	await saved.confirmations.records.writeSessionGroup(groupId);

	const result = await readAttemptEvidence({
		id: `rep:session:${groupId}/session-root-rep-1`,
		runsDirectory: saved.runsDirectory,
	});

	expect(result).toMatchObject({ kind: "session", state: "available" });
}

describe(readGroupAttemptIndex.name, () => {
	describe("when group identities resemble record directory names", () => {
		it(
			"reads group identities when the records directory is named confirmations",
			verifyReadsGroupIdentitiesWhenTheRecordsDirectoryIsNamedConfirmations,
		);

		it(
			"projects the group's saved repetition identities for navigation",
			verifyProjectsTheGroupSSavedRepetitionIdentitiesForNavigation,
		);

		it(
			"does not strip a group identity matching the records directory name",
			verifyDoesNotStripAGroupIdentityMatchingTheRecordsDirectoryName,
		);
	});
});

describe(readAttemptEvidence.name, () => {
	describe("when owned repetition identities resemble record directory names", () => {
		it(
			"reads owned repetition evidence when the records directory is named confirmations",
			verifyReadsOwnedRepetitionEvidenceWhenTheRecordsDirectoryIsNamedConfirmations,
		);

		it(
			"does not strip a repetition identity matching the records directory name",
			verifyDoesNotStripARepetitionIdentityMatchingTheRecordsDirectoryName,
		);
	});
});
