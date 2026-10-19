import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { sessionConfirmationGroupRecordSchema } from "#benchmark/confirmation-record";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	clearHistoryLinkRoots,
	digest,
	recordSessionAttempt,
} from "#server/comparison-history-test-fixture";
import ComparisonHarness from "#server/comparison-test-harness";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import { comparisonAttemptHistoryLink } from "./comparison-history-links";

afterEach(clearHistoryLinkRoots);

const STALE_LINK = {
	ordinal: 1,
	repId: "group-a-rep-1",
	status: "stale",
} as const;

describe(comparisonAttemptHistoryLink.name, () => {
	const harness = Promise.withResolvers<ComparisonHarness>();
	beforeAll(async () => {
		await ComparisonHarness.setup().then(harness.resolve, harness.reject);
	});
	beforeEach(async () => {
		const ready = await harness.promise;
		await ready.reset();
	});
	afterAll(async () => {
		const ready = await harness.promise;
		await ready.teardown();
	});
	async function verifyLinksWhenGroupRepetitionAndAttemptPathsAndDigestsAgree(): Promise<void> {
		const { driver, runsDirectory } = await harness.promise;
		const { request } = await recordSessionAttempt(runsDirectory);

		const link = await comparisonAttemptHistoryLink(request);

		expect(link).toEqual({
			groupId: "group-a",
			href: "/groups/group-a/reps/group-a-rep-1/attempt",
			ordinal: 1,
			repId: "group-a-rep-1",
			status: "available",
		});

		const response = await driver.historyRaw({
			groupId: "group-a",
			repId: "group-a-rep-1",
		});

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	}

	it(
		"links when group, repetition and attempt paths and digests agree",
		verifyLinksWhenGroupRepetitionAndAttemptPathsAndDigestsAgree,
	);
	it(
		"links an attempt numbered within its arm, after an earlier group's attempts",
		verifyArmOrdinal,
	);
});

describe(comparisonAttemptHistoryLink.name, () => {
	describe("when recorded identities disagree", () => {
		it.each(["group", "rep", "attempt"] as const)(
			"marks a mismatched %s digest stale",
			async (field) => {
				const { request } = await recordSessionAttempt();
				const sha256 = "0".repeat(SHA256_HEX_DIGITS);
				const changed = {
					...request,
					group:
						field === "group" ? { ...request.group, sha256 } : request.group,
					rep: {
						...request.rep,
						attempt:
							field === "attempt"
								? { ...request.rep.attempt, sha256 }
								: request.rep.attempt,
						sha256: field === "rep" ? sha256 : request.rep.sha256,
					},
				};

				const staleLink = await comparisonAttemptHistoryLink(changed);

				expect(staleLink).toEqual(STALE_LINK);
			},
		);
		it(
			"marks a group stored under another group's path stale",
			verifyMarksAGroupStoredUnderAnotherGroupSPathStale,
		);
		it(
			"marks a repetition path its group does not own stale",
			verifyMarksARepetitionPathItsGroupDoesNotOwnStale,
		);
	});
});

describe(comparisonAttemptHistoryLink.name, () => {
	describe("after a successful read when saved records change", () => {
		it.each(["group", "rep", "attempt"] as const)(
			"marks changed %s bytes stale",
			async (field) => {
				const saved = await recordSessionAttempt();
				const records = {
					attempt: {
						file: saved.repPaths.attemptFile,
						text: saved.attemptText,
					},
					group: { file: saved.paths.groupFile, text: saved.groupText },
					rep: { file: saved.repPaths.recordFile, text: saved.repText },
				};
				const { file, text } = records[field];

				const availableLink = await comparisonAttemptHistoryLink(saved.request);

				expect(availableLink).toEqual({
					groupId: "group-a",
					href: "/groups/group-a/reps/group-a-rep-1/attempt",
					ordinal: 1,
					repId: "group-a-rep-1",
					status: "available",
				});

				await Bun.write(file, `${text}\n`);

				const staleLink = await comparisonAttemptHistoryLink(saved.request);

				expect(staleLink).toEqual(STALE_LINK);
			},
		);
	});
});

async function verifyArmOrdinal(): Promise<void> {
	const { request } = await recordSessionAttempt();

	const link = await comparisonAttemptHistoryLink({
		...request,
		rep: { ...request.rep, ordinal: 3 },
	});

	expect(link).toEqual({
		groupId: "group-a",
		href: "/groups/group-a/reps/group-a-rep-1/attempt",
		ordinal: 3,
		repId: "group-a-rep-1",
		status: "available",
	});
}

async function verifyMarksAGroupStoredUnderAnotherGroupSPathStale(): Promise<void> {
	const { request, runsDirectory, groupText, recorded } =
		await recordSessionAttempt();
	const wrongGroupFile = confirmationGroupPaths(
		runsDirectory,
		"group-b",
	).groupFile;
	await Bun.write(wrongGroupFile, groupText);

	const staleLink = await comparisonAttemptHistoryLink({
		...request,
		group: { ...request.group, path: recorded(wrongGroupFile) },
	});

	expect(staleLink).toEqual(STALE_LINK);
}

async function verifyMarksARepetitionPathItsGroupDoesNotOwnStale(): Promise<void> {
	const { request, paths, groupText } = await recordSessionAttempt();
	const groupRecord = sessionConfirmationGroupRecordSchema.parse(
		JSON.parse(groupText),
	);
	const unownedGroupText = `${JSON.stringify({ ...groupRecord, repRecords: Array.from(groupRecord.repRecords, (reference) => (reference.repId === "group-a-rep-1" ? { ...reference, path: "reps/other/rep.json" } : reference)) })}\n`;
	await Bun.write(paths.groupFile, unownedGroupText);

	const staleLink = await comparisonAttemptHistoryLink({
		...request,
		group: { ...request.group, sha256: digest(unownedGroupText) },
	});

	expect(staleLink).toEqual(STALE_LINK);
}
