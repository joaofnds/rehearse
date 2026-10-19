import {
	hasConfirmationSummary,
	listConfirmationArchives,
	readConfirmationArchive,
} from "#benchmark/confirmation-archive";
import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import { stoppedBeforeGroupRecord } from "#benchmark/operator-stop";
import {
	confirmationGroupIds,
	confirmationGroupPaths,
} from "#benchmark/run-layout";
import { controlRelative } from "#cli/output";
import { formatRecordId } from "#cli/record-id";

import type { RecordListing } from "./record-listing";
import { collect, numbered } from "./record-listing";

interface GroupLocation {
	readonly runsDirectory: string;
	readonly groupId: string;
}

async function listedGroupFields(
	location: GroupLocation,
): Promise<readonly string[] | undefined> {
	const paths = confirmationGroupPaths(
		location.runsDirectory,
		location.groupId,
	);
	const hasSummary = await hasConfirmationSummary(location);

	if (
		!hasSummary &&
		((await stoppedBeforeGroupRecord(paths)) ||
			(await readConfirmationArchive(location)) !== undefined)
	) {
		return undefined;
	}

	const record = parseConfirmationGroupRecord(
		await Bun.file(paths.groupFile).text(),
	);

	return [record.caseId, record.mode, `${String(record.reps)} reps`];
}

async function listGroups(runsDirectory: string): Promise<RecordListing> {
	return await numbered(
		runsDirectory,
		await collect(
			await confirmationGroupIds(runsDirectory),
			(groupId) => ({ groupId, kind: "group" }),
			async (groupId) => await listedGroupFields({ groupId, runsDirectory }),
		),
	);
}

async function listArchivedGroups(
	runsDirectory: string,
): Promise<RecordListing> {
	const { archived, unreadable } =
		await listConfirmationArchives(runsDirectory);
	return {
		entries: archived.map(({ groupId, archivedAt }) => ({
			fields: [archivedAt, "no saved summary"],
			id: formatRecordId({ groupId, kind: "group" }),
		})),
		unreadable: unreadable.map(({ id, reason }) => ({
			id: formatRecordId({ groupId: id, kind: "group" }),
			reason: controlRelative(reason),
		})),
	};
}

export { listArchivedGroups, listGroups };
