import type { ParsedConfirmationGroupRecord } from "#benchmark/confirmation-record";
import type { Immutable } from "#benchmark/contracts";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { parseSessionAttemptState } from "#benchmark/session-record";
import { redactAbsolutePaths } from "#server/redact-path";
import type { RepSavedState } from "#server/run-history-contract";
import savedStateAssessment from "#server/saved-state-assessment";

async function readRepSavedState(
	runsDirectory: string,
	group: Immutable<ParsedConfirmationGroupRecord>,
	repId: string,
): Promise<RepSavedState> {
	try {
		const file = Bun.file(
			confirmationGroupPaths(runsDirectory, group.groupId).rep(repId)
				.attemptFile,
		);
		if (!(await file.exists())) {
			return {
				assessment: {
					reason: "No saved session attempt was recorded.",
					state: "unavailable",
				},
				recordedPassed: undefined,
				repId,
			};
		}

		const attempt = parseSessionAttemptState(await file.text());

		return assessedRepState(group, repId, attempt);
	} catch (error) {
		return {
			assessment: {
				reason: `The saved session attempt could not be read: ${redactAbsolutePaths(error instanceof Error ? error.message : String(error))}`,
				state: "unavailable",
			},
			recordedPassed: undefined,
			repId,
		};
	}
}

type SavedSessionAttempt = Immutable<
	ReturnType<typeof parseSessionAttemptState>
>;

function assessedRepState(
	group: Immutable<ParsedConfirmationGroupRecord>,
	repId: string,
	attempt: SavedSessionAttempt,
): RepSavedState {
	if (attempt.caseId !== group.caseId) {
		throw new Error("The saved session attempt names a different case.");
	}

	if (
		group.inputs.lineage.kind === "SESSION" &&
		attempt.lineage !== group.inputs.lineage.lineage
	) {
		throw new Error("The saved session attempt names a different lineage.");
	}

	const checked =
		attempt.outcome === "SUCCESSFUL" || attempt.outcome === "UNSUCCESSFUL";

	return {
		assessment: savedStateAssessment(attempt),
		recordedPassed: checked ? attempt.outcome === "SUCCESSFUL" : undefined,
		repId,
	};
}

export { readRepSavedState as default };
