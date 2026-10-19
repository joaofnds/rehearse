import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import {
	confirmationGroupIds,
	confirmationGroupPaths,
} from "#benchmark/run-layout";
import type {
	CaseRunOf,
	Found,
	UnreadableCaseRecord,
} from "#server/case-runs-contract";
import { digestOf, unreadableRecord } from "#server/case-runs-contract";
import readRep from "#server/confirmation-rep-reading";

interface CaseGroupSource {
	readonly id: string;
	readonly paths: ReturnType<typeof confirmationGroupPaths>;
	readonly record: ReturnType<typeof parseConfirmationGroupRecord>;
}

async function groupRepetitions({
	id: groupId,
	paths,
	record,
}: CaseGroupSource): Promise<Found> {
	const found: CaseRunOf[] = [];
	const unreadable: UnreadableCaseRecord[] = [];
	const corpusDigest = digestOf(record.inputs.corpusVersion);
	try {
		await Array.fromAsync(record.repRecords, async ({ repId }) => {
			const reading = await readRep(paths.rep(repId), corpusDigest);
			if (reading.state === "unreadable") {
				unreadable.push(
					unreadableRecord({
						id: `${groupId}/${repId}`,
						reason: reading.reason,
					}),
				);
			}
			found.push({
				caseId: record.caseId,
				href:
					record.mode === "session"
						? `/groups/${encodeURIComponent(groupId)}/reps/${encodeURIComponent(repId)}/attempt`
						: `/groups/${encodeURIComponent(groupId)}?view=attempts`,
				label: `${groupId} · ${repId}`,
				run:
					reading.state === "read"
						? reading.run
						: { corpusDigest, costUsd: undefined, passed: undefined },
				time: record.startedAt,
			});
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		unreadable.push(unreadableRecord({ id: groupId, reason: message }));
	}

	return { found, unreadable };
}

async function readCaseGroup(
	runsDirectory: string,
	groupId: string,
): Promise<Found> {
	const paths = confirmationGroupPaths(runsDirectory, groupId);
	const file = Bun.file(paths.groupFile);
	if (!(await file.exists())) {
		return { found: [], unreadable: [] };
	}

	try {
		const record = parseConfirmationGroupRecord(await file.text());
		if (record.mode === "stage") {
			return { found: [], unreadable: [] };
		}

		return await groupRepetitions({ id: groupId, paths, record });
	} catch (error) {
		return {
			found: [],
			unreadable: [
				unreadableRecord({
					id: groupId,
					reason: error instanceof Error ? error.message : String(error),
				}),
			],
		};
	}
}

/** Case-mode repetitions in group id order; a later unreadable repetition keeps the earlier rows. */
async function groupReps(runsDirectory: string): Promise<Found> {
	const recorded = await confirmationGroupIds(runsDirectory);
	const readings = await Array.fromAsync(
		recorded.toSorted((left, right) => left.localeCompare(right)),
		async (groupId) => await readCaseGroup(runsDirectory, groupId),
	);

	return {
		found: readings.flatMap(({ found }) => found),
		unreadable: readings.flatMap(({ unreadable }) => unreadable),
	};
}

export { groupReps as default };
