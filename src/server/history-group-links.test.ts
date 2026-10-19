import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { operatorStopRecord } from "#benchmark/operator-stop";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

const FIRST_AVAILABLE_RECORD_LINK_INDEX = 0;

const MISSING_REP_EVIDENCE = [
	["its rep record", "recordFile"],
	["its attempt", "attemptFile"],
] as const;

describe("history group links", () => {
	it(
		"lists a session group as one row linking each rep that recorded an attempt",
		verifyListsASessionGroupAsOneRowLinkingEach,
	);

	it.each(MISSING_REP_EVIDENCE)(
		"names a session rep unavailable when %s is missing",
		verifyMissingRepEvidence,
	);

	it(
		"names every rep of a stage group unavailable, since only a session rep has a context page",
		verifyNamesEveryRepOfAStageGroupUnavailableSince,
	);

	it(
		"names the mode of a pipeline group whose reps have no session context",
		verifyNamesTheModeOfAPipelineGroupWhoseReps,
	);

	it(
		"names a group directory with no group.json as unreadable by its record id",
		verifyNamesAGroupDirectoryWithNoGroupJsonAs,
	);

	it(
		"lists a group the operator stopped before its group record neither as a row nor as unreadable",
		verifyListsAGroupTheOperatorStoppedBeforeItsGroup,
	);
});

async function verifyListsASessionGroupAsOneRowLinkingEach(): Promise<void> {
	const fixture = await writtenFixture();
	const [recorded, missing] =
		await fixture.confirmations.records.writeSessionGroup("group-s");

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows.find((row) => row.kind === "group" && row.groupId === "group-s"),
	).toMatchObject({
		caseId: fixture.sessionAttempt.caseId,
		groupId: "group-s",
		kind: "group",
		links: [
			{
				href: `/groups/group-s/reps/${recorded}/attempt`,
				label: "rep 1",
				state: "available",
			},
			{
				label: "rep 2",
				reason: `no attempt recorded for ${missing}`,
				state: "unavailable",
			},
		],
		mode: "session",
		repAttempts: [
			{ attempt: { count: 2, position: 1 }, repId: "group-s-rep-1" },
			{ attempt: { count: 2, position: 2 }, repId: "group-s-rep-2" },
		],
		reps: 2,
		shortId: undefined,
	});
}

async function verifyNamesEveryRepOfAStageGroupUnavailableSince(): Promise<void> {
	const fixture = await writtenFixture();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows.find((row) => row.kind === "group" && row.groupId === fixture.groupId),
	).toMatchObject({
		links: [
			{
				label: "rep 1",
				reason: "a stage group has no session context",
				state: "unavailable",
			},
			{
				label: "rep 2",
				reason: "a stage group has no session context",
				state: "unavailable",
			},
		],
		mode: "stage",
	});
}

async function verifyNamesTheModeOfAPipelineGroupWhoseReps(): Promise<void> {
	const fixture = await writtenFixture();
	const { groupFile } = confirmationGroupPaths(
		fixture.runsDirectory,
		fixture.groupId,
	);
	const stageGroup = await Bun.file(groupFile).text();
	await Bun.write(
		groupFile,
		stageGroup.replace(/"mode":\s*"stage"/u, '"mode": "pipeline"'),
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows.find((row) => row.kind === "group" && row.groupId === fixture.groupId),
	).toMatchObject({
		links: [
			{
				label: "rep 1",
				reason: "a pipeline group has no session context",
				state: "unavailable",
			},
			{
				label: "rep 2",
				reason: "a pipeline group has no session context",
				state: "unavailable",
			},
		],
		mode: "pipeline",
	});
}

async function verifyNamesAGroupDirectoryWithNoGroupJsonAs(): Promise<void> {
	const fixture = await writtenFixture();
	await mkdir(join(fixture.runsDirectory, "confirmations", "group-empty"), {
		recursive: true,
	});

	const { unreadable } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(unreadable).toContainEqual({
		id: "group:group-empty",
		incompleteConfirmation: { groupId: "group-empty" },
		kind: "group",
		reason: "incomplete: no group.json recorded",
	});
}

async function verifyListsAGroupTheOperatorStoppedBeforeItsGroup(): Promise<void> {
	const fixture = await writtenFixture();
	const stopped = confirmationGroupPaths(
		fixture.runsDirectory,
		"group-stopped",
	);
	await Bun.write(stopped.operatorStopFile, operatorStopRecord("SIGTERM"));

	const { rows, unreadable } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows.filter(
			(row) => row.kind === "group" && row.groupId === "group-stopped",
		),
	).toEqual([]);
	expect(unreadable.map(({ id }) => id)).not.toContain("group:group-stopped");
}

async function verifyMissingRepEvidence(
	_missing: string,
	file: MissingRepFile,
): Promise<void> {
	const fixture = await writtenFixture();
	const [recorded] =
		await fixture.confirmations.records.writeSessionGroup("group-s");
	await rm(
		confirmationGroupPaths(fixture.runsDirectory, "group-s").rep(recorded)[
			file
		],
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows.find((row) => row.kind === "group" && row.groupId === "group-s")
			?.links[FIRST_AVAILABLE_RECORD_LINK_INDEX],
	).toEqual({
		label: "rep 1",
		reason: `no attempt recorded for ${recorded}`,
		state: "unavailable",
	});
}

type MissingRepFile = "recordFile" | "attemptFile";
