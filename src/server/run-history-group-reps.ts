import { parseConfirmationRepRecord } from "#benchmark/confirmation-record";
import type { ParsedConfirmationGroupRecord } from "#benchmark/confirmation-record";
import type { Immutable } from "#benchmark/contracts";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { repAttemptId } from "#server/checkpoint-attempts";
import type { AttemptPosition } from "#server/checkpoint-attempts";
import { UNRECORDED_REP_REASON } from "#server/confirmation-group-summary";
import { redactAbsolutePaths } from "#server/redact-path";
import type {
	GroupRep,
	GroupRepReference,
	RepAttempt,
} from "#server/run-history-contract";
import type { ContextLink } from "#server/run-status";

/**
 * A rep's context opens only for a session group whose rep recorded both its
 * rep record and its attempt, the files the confirmation history reader
 * refuses to open without.
 */
async function repLink(
	runsDirectory: string,
	{ groupId, mode, reference }: GroupRepReference,
): Promise<ContextLink> {
	const label = `rep ${String(reference.ordinal)}`;
	if (mode !== "session") {
		return {
			label,
			reason: `a ${mode} group has no session context`,
			state: "unavailable",
		};
	}

	const rep = confirmationGroupPaths(runsDirectory, groupId).rep(
		reference.repId,
	);
	const recorded =
		(await Bun.file(rep.recordFile).exists()) &&
		(await Bun.file(rep.attemptFile).exists());
	if (!recorded) {
		return {
			label,
			reason: `no attempt recorded for ${reference.repId}`,
			state: "unavailable",
		};
	}

	return {
		href: `/groups/${encodeURIComponent(groupId)}/reps/${encodeURIComponent(reference.repId)}/attempt`,
		label,
		state: "available",
	};
}

/**
 * A session-mode rep has no checkpoint, so its attempt is its position in its
 * group. A stage-mode rep's is its attempt at the checkpoint it ran from, and
 * one that recorded no result, or whose group cannot be placed, has none.
 */
function repAttempts(
	record: Immutable<ParsedConfirmationGroupRecord>,
	attempts: ReadonlyMap<string, AttemptPosition>,
): readonly RepAttempt[] {
	return record.repRecords.flatMap(({ repId, ordinal }) => {
		const attempt =
			record.mode === "session"
				? { count: record.reps, position: ordinal }
				: attempts.get(repAttemptId(record.groupId, repId));

		return attempt === undefined ? [] : [{ attempt, repId }];
	});
}

/**
 * Each rep the group lists, in its order: the record it wrote, or why that
 * record could not be read. One unreadable rep never hides the others.
 */
async function groupReps(
	runsDirectory: string,
	record: Immutable<ParsedConfirmationGroupRecord>,
): Promise<readonly GroupRep[]> {
	const paths = confirmationGroupPaths(runsDirectory, record.groupId);

	return await Promise.all(
		record.repRecords.map(async ({ repId }): Promise<GroupRep> => {
			const file = Bun.file(paths.rep(repId).recordFile);
			if (!(await file.exists())) {
				return { reason: UNRECORDED_REP_REASON, repId };
			}

			try {
				return parseConfirmationRepRecord(await file.text());
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				return { reason: redactAbsolutePaths(message), repId };
			}
		}),
	);
}

export { repLink, repAttempts, groupReps };
