import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import type { InFlightClaim } from "#benchmark/in-flight-claim";
import { writeLaunchRecord } from "#benchmark/launch-record";
import type { LaunchRecord } from "#benchmark/launch-record";
import {
	confirmationGroupPaths,
	sessionAttemptPaths,
} from "#benchmark/run-layout";
import { directorySource } from "#benchmark/run-records-test-support";
import type { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import {
	CLAIMED_AT,
	LAUNCHED_AT,
	LAUNCH_ID,
	LIVE_PID,
	launchLiveness,
} from "#server/history-launch-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

const ATTEMPT = {
	caseId: "smoke",
	uuid: "0f6b6f2a-0000-4000-8000-000000000369",
};

const GROUP_ID = "group-in-flight";

const DEAD_PID = 4343;

const BEFORE_LAUNCH = "2026-09-29T09:59:59.000Z";

const HELD: InFlightClaim = { pid: LIVE_PID, startedAt: CLAIMED_AT };

const CASE_LAUNCH: LaunchRecord = {
	attempts: 3,
	caseId: "smoke",
	id: LAUNCH_ID,
	kind: "case",
	launchedAt: LAUNCHED_AT,
	pid: LIVE_PID,
};

const REPLAYED_RUN = "2026-09-28T10-00-00.000Z";

const LAUNCH_KINDS: { readonly launch: LaunchRecord }[] = [
	{ launch: CASE_LAUNCH },
	{
		launch: {
			attempts: 3,
			id: LAUNCH_ID,
			kind: "replay",
			launchedAt: LAUNCHED_AT,
			pid: LIVE_PID,
			run: REPLAYED_RUN,
			stage: "build",
		},
	},
	{
		launch: {
			armA: "build-checkpoint-baseline",
			armB: "build-checkpoint-candidate",
			attempts: 2,
			id: LAUNCH_ID,
			kind: "comparison",
			launchedAt: LAUNCHED_AT,
			pid: LIVE_PID,
			run: REPLAYED_RUN,
			stage: "build",
		},
	},
	{
		launch: {
			attempts: 1,
			comparison:
				"0f6b6f2a00004000800000000000036900000000000000000000000000000369",
			id: LAUNCH_ID,
			kind: "extension",
			launchedAt: LAUNCHED_AT,
			pid: LIVE_PID,
			run: REPLAYED_RUN,
			stage: "build",
			usd: 1,
		},
	},
];

async function claimed(directory: string, claim: InFlightClaim): Promise<void> {
	await Bun.write(join(directory, "in-flight.json"), JSON.stringify(claim));
}

async function attemptClaimed(
	fixture: RecordedRunsFixture,
	claim: InFlightClaim,
): Promise<void> {
	await fixture.sessions.writeEmptyAttemptDirectory(ATTEMPT);
	await claimed(
		sessionAttemptPaths(fixture.runsDirectory, ATTEMPT).directory,
		claim,
	);
}

async function groupClaimed(
	fixture: RecordedRunsFixture,
	claim: InFlightClaim,
): Promise<void> {
	await claimed(
		confirmationGroupPaths(fixture.runsDirectory, GROUP_ID).directory,
		claim,
	);
}

async function historyOf(
	fixture: RecordedRunsFixture,
): ReturnType<typeof runHistoryReport> {
	return await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(),
	);
}

async function verifyListsAnAttemptInFlightOnlyAsItsLaunch(): Promise<void> {
	const fixture = await writtenFixture();
	await writeLaunchRecord(fixture.runsDirectory, CASE_LAUNCH);
	await attemptClaimed(fixture, HELD);

	const { launches, unreadable } = await historyOf(fixture);

	expect(launches).toMatchObject([{ id: LAUNCH_ID, status: "RUNNING" }]);
	expect(unreadable).toEqual([]);
}

async function verifyListsAGroupInFlightOnlyAsItsLaunch({
	launch,
}: {
	readonly launch: LaunchRecord;
}): Promise<void> {
	const fixture = await writtenFixture();
	await writeLaunchRecord(fixture.runsDirectory, launch);
	await groupClaimed(fixture, HELD);

	const { launches, unreadable } = await historyOf(fixture);

	expect(launches).toMatchObject([{ id: LAUNCH_ID, status: "RUNNING" }]);
	expect(unreadable).toEqual([]);
}

async function verifyListsAnAbandonedAttemptAsUnreadable(): Promise<void> {
	const fixture = await writtenFixture();
	await attemptClaimed(fixture, { pid: DEAD_PID, startedAt: CLAIMED_AT });

	const { unreadable } = await historyOf(fixture);

	expect(unreadable).toEqual([
		{
			id: `attempt:session:${ATTEMPT.caseId}/${ATTEMPT.uuid}`,
			kind: "session-attempt",
			reason: "incomplete: no attempt.json recorded",
		},
	]);
}

async function verifyListsAnAbandonedGroupWithNoSavedSummary(): Promise<void> {
	const fixture = await writtenFixture();
	await groupClaimed(fixture, { pid: DEAD_PID, startedAt: CLAIMED_AT });

	const { unreadable } = await historyOf(fixture);

	expect(unreadable).toEqual([
		{
			id: `group:${GROUP_ID}`,
			incompleteConfirmation: { groupId: GROUP_ID },
			kind: "group",
			reason: "incomplete: no group.json recorded",
		},
	]);
}

async function verifyListsAnAttemptClaimedBeforeTheLaunch(): Promise<void> {
	const fixture = await writtenFixture();
	await writeLaunchRecord(fixture.runsDirectory, CASE_LAUNCH);
	await attemptClaimed(fixture, { pid: LIVE_PID, startedAt: BEFORE_LAUNCH });

	const { unreadable } = await historyOf(fixture);

	expect(unreadable).toMatchObject([{ kind: "session-attempt" }]);
}

async function verifyListsAGroupClaimedBeforeTheLaunch(): Promise<void> {
	const fixture = await writtenFixture();
	await writeLaunchRecord(fixture.runsDirectory, CASE_LAUNCH);
	await groupClaimed(fixture, { pid: LIVE_PID, startedAt: BEFORE_LAUNCH });

	const { unreadable } = await historyOf(fixture);

	expect(unreadable).toMatchObject([{ kind: "group" }]);
}

async function verifyListsAnUnclaimedAttemptBesideALiveLaunch(): Promise<void> {
	const fixture = await writtenFixture();
	await writeLaunchRecord(fixture.runsDirectory, CASE_LAUNCH);
	await fixture.sessions.writeEmptyAttemptDirectory(ATTEMPT);

	const { unreadable } = await historyOf(fixture);

	expect(unreadable).toMatchObject([{ kind: "session-attempt" }]);
}

describe(runHistoryReport.name, () => {
	describe("when a session attempt is in flight", () => {
		it(
			"lists its launch as running and no unreadable record",
			verifyListsAnAttemptInFlightOnlyAsItsLaunch,
		);
	});

	describe("when a confirmation group is in flight", () => {
		it.each(LAUNCH_KINDS)(
			"lists no unreadable record for it under a $launch.kind launch",
			verifyListsAGroupInFlightOnlyAsItsLaunch,
		);
	});

	describe("when the claiming process has ended", () => {
		it(
			"lists the attempt as unreadable with its reason",
			verifyListsAnAbandonedAttemptAsUnreadable,
		);

		it(
			"lists the group as a confirmation run with no saved summary",
			verifyListsAnAbandonedGroupWithNoSavedSummary,
		);
	});

	describe("when the claim predates the live launch with its pid", () => {
		it(
			"lists the attempt as unreadable",
			verifyListsAnAttemptClaimedBeforeTheLaunch,
		);

		it(
			"lists the group as unreadable",
			verifyListsAGroupClaimedBeforeTheLaunch,
		);
	});

	describe("when a record has no claim", () => {
		it(
			"lists the attempt as unreadable beside a live launch",
			verifyListsAnUnclaimedAttemptBesideALiveLaunch,
		);
	});
});
